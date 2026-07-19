import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPastProblemSuggestions,
  buildPrescriptionTimeline,
  buildSoapHistoryTimeline,
  normalizeSoapProblemTitle
} from './emr_patient_history.ts';
import type { PrescriptionItem, SoapRecord, Visit } from '../db/types.ts';

const visits: Visit[] = [
  { visitId: 'v_current', patientId: 'p1', prescriptionDate: '2026-06-25', issueDate: '2026-06-25T09:00:00.000Z', status: 'processing', institutionName: '田中内科', departmentName: '内科', doctorName: '田中' },
  { visitId: 'v_old_2', patientId: 'p1', prescriptionDate: '2026-05-20', issueDate: '2026-05-20T09:00:00.000Z', status: 'completed', institutionName: '佐藤クリニック', departmentName: '循環器内科', doctorName: '佐藤' },
  { visitId: 'v_old_1', patientId: 'p1', prescriptionDate: '2026-04-10', issueDate: '2026-04-10T09:00:00.000Z', status: 'completed', institutionName: '田中内科', departmentName: '内科', doctorName: '田中' },
  { visitId: 'v_cancelled', patientId: 'p1', prescriptionDate: '2026-06-01', issueDate: '2026-06-01T09:00:00.000Z', status: 'cancelled' }
];

const items: PrescriptionItem[] = [
  { itemId: 'i_current', visitId: 'v_current', rpNumber: 1, drugId: 'D_AML', amount: 1, usage: '1日1回 朝食後', days: 28 },
  { itemId: 'i_changed', visitId: 'v_old_2', rpNumber: 1, drugId: 'D_AML', dispensedDrug: 'アムロジピンOD錠5mg', amount: 1, usage: '1日1回 朝食後', days: 28 },
  { itemId: 'i_old', visitId: 'v_old_1', rpNumber: 1, drugId: 'D_LOX', amount: 3, usage: '疼痛時', days: 5 },
  { itemId: 'i_cancelled', visitId: 'v_cancelled', rpNumber: 1, drugId: 'D_CANCEL', amount: 1, usage: '誤登録', days: 1 }
];

const soapRecords: SoapRecord[] = [
  {
    soapId: 'soap_current',
    visitId: 'v_current',
    authorId: 'u1',
    problems: [{ id: 'p_current', title: '#1 高血圧', entries: [{ type: 'S', text: '本日入力中' }] }]
  },
  {
    soapId: 'soap_old_2',
    visitId: 'v_old_2',
    authorId: 'u1',
    problems: [{ id: 'p_old_2', title: '#1 高血圧', entries: [{ type: 'S', text: '血圧安定。' }, { type: 'P', text: '継続確認。' }] }]
  },
  {
    soapId: 'soap_old_1',
    visitId: 'v_old_1',
    authorId: 'u1',
    problems: [
      { id: 'p_old_1', title: '#2 脂質異常症', entries: [{ type: 'A', text: '副作用訴えなし。' }] },
      { id: 'p_empty', title: '#3 空欄', entries: [{ type: 'S', text: '' }] }
    ]
  }
];

test('normalizeSoapProblemTitle strips problem numbering', () => {
  assert.strictEqual(normalizeSoapProblemTitle('#1 高血圧'), '高血圧');
  assert.strictEqual(normalizeSoapProblemTitle('＃ 2 脂質異常症'), '脂質異常症');
});

test('buildPastProblemSuggestions ranks real SOAP problem titles by frequency', () => {
  const suggestions = buildPastProblemSuggestions(soapRecords, { max: 2 });

  assert.deepStrictEqual(suggestions, ['高血圧', '脂質異常症']);
  assert.ok(!suggestions.includes(''));
});

test('buildPrescriptionTimeline renders real visits and prescription items without cancelled visits', () => {
  const timeline = buildPrescriptionTimeline({
    visits,
    items,
    currentVisitId: 'v_current',
    drugNamesById: {
      D_AML: 'アムロジピン錠5mg',
      D_LOX: 'ロキソプロフェン錠60mg',
      D_CANCEL: '取消薬'
    }
  });

  assert.deepStrictEqual(timeline.map((entry) => entry.visitId), ['v_current', 'v_old_2', 'v_old_1']);
  assert.strictEqual(timeline[0].dateLabel, '2026/6/25');
  assert.strictEqual(timeline[0].drugLabel, 'アムロジピン錠5mg');
  assert.strictEqual(timeline[0].change, '今回');
  assert.strictEqual(timeline[1].drugLabel, 'アムロジピンOD錠5mg');
  assert.strictEqual(timeline[1].change, '変更');
  assert.ok(timeline.every((entry) => entry.drugLabel !== '取消薬'));
});

// 実運用の受付保存では変更なし調剤でも dispensedDrug に処方薬名が入るため、
// 「値がある=変更」と判定すると過去回が全て「変更」になる(回帰バグ)。
test('buildPrescriptionTimeline does not mark unchanged real-flow dispenses as 変更', () => {
  const realVisits: Visit[] = [
    { visitId: 'v_now', patientId: 'p2', prescriptionDate: '2026-07-18', issueDate: '2026-07-18T09:00:00.000Z', status: 'processing' },
    { visitId: 'v_prev', patientId: 'p2', prescriptionDate: '2026-07-01', issueDate: '2026-07-01T09:00:00.000Z', status: 'completed' },
    { visitId: 'v_sub', patientId: 'p2', prescriptionDate: '2026-06-01', issueDate: '2026-06-01T09:00:00.000Z', status: 'completed' }
  ];
  const realItems: PrescriptionItem[] = [
    { itemId: 'i_now', visitId: 'v_now', rpNumber: 1, drugId: '622290901', dispensedDrug: 'アムロジピンＯＤ錠１０ｍｇ「ＣＨ」', dispensedDrugCode: '', amount: 1, usage: '1日1回 朝食後', days: 14 },
    // 変更なし調剤: dispensedDrug=処方薬名そのまま・調剤コード空
    { itemId: 'i_prev', visitId: 'v_prev', rpNumber: 1, drugId: '622290901', dispensedDrug: 'アムロジピンＯＤ錠１０ｍｇ「ＣＨ」', dispensedDrugCode: '', amount: 1, usage: '1日1回 朝食後', days: 14 },
    // 本物の変更調剤: 調剤コードが処方コードと異なる
    { itemId: 'i_sub', visitId: 'v_sub', rpNumber: 1, drugId: '622290901', dispensedDrug: '後発品X錠', dispensedDrugCode: '699999999', amount: 1, usage: '1日1回 朝食後', days: 14 }
  ];

  const timeline = buildPrescriptionTimeline({
    visits: realVisits,
    items: realItems,
    currentVisitId: 'v_now',
    drugNamesById: { '622290901': 'アムロジピンＯＤ錠１０ｍｇ「ＣＨ」' }
  });

  assert.strictEqual(timeline[0].change, '今回');
  assert.strictEqual(timeline[1].change, '処方', 'unchanged dispense with same name is not 変更');
  assert.strictEqual(timeline[1].drugLabel, 'アムロジピンＯＤ錠１０ｍｇ「ＣＨ」');
  assert.strictEqual(timeline[2].change, '変更', 'differing dispensed code is still 変更');
  assert.strictEqual(timeline[2].drugLabel, '後発品X錠');
});

test('buildPrescriptionTimeline treats matching dispensed code as unchanged even if display names differ', () => {
  const codeVisits: Visit[] = [
    { visitId: 'v_a', patientId: 'p3', prescriptionDate: '2026-07-01', issueDate: '2026-07-01T09:00:00.000Z', status: 'completed' }
  ];
  const codeItems: PrescriptionItem[] = [
    { itemId: 'i_a', visitId: 'v_a', rpNumber: 1, drugId: 'D_X', dispensedDrug: '返戻確認薬 10mg', dispensedDrugCode: 'D_X', amount: 1, usage: '1日1回', days: 7 }
  ];

  const timeline = buildPrescriptionTimeline({
    visits: codeVisits,
    items: codeItems,
    drugNamesById: { D_X: '返戻確認薬10mg錠' }
  });
  assert.strictEqual(timeline[0].change, '処方');
});

test('buildSoapHistoryTimeline shows past SOAP content and excludes the current visit', () => {
  const history = buildSoapHistoryTimeline({
    visits,
    soapRecords,
    currentVisitId: 'v_current'
  });

  assert.deepStrictEqual(history.map((entry) => entry.visitId), ['v_old_2', 'v_old_1']);
  assert.strictEqual(history[0].dateLabel, '2026/5/20');
  assert.strictEqual(history[0].visitLabel, '佐藤クリニック / 循環器内科 / 佐藤医師');
  assert.strictEqual(history[0].problems[0].title, '高血圧');
  assert.deepStrictEqual(history[0].problems[0].snippets.map((snippet) => snippet.type), ['S', 'P']);
  assert.strictEqual(history[1].problems.length, 1, 'empty SOAP problems are hidden');
});
