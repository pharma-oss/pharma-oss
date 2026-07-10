import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildDrugMedicationHistory,
  listPatientPrescribedDrugs,
  type MedHistoryPrescriptionItem,
  type MedHistorySoapRecord,
  type MedHistoryVisit
} from './drug_medication_history.ts';

const visits: MedHistoryVisit[] = [
  { visitId: 'v3', patientId: 'p1', prescriptionDate: '2026-06-01', doctorName: '田中', institutionName: '田中内科', departmentName: '内科', status: 'completed' },
  { visitId: 'v2', patientId: 'p1', prescriptionDate: '2026-03-10', doctorName: '佐藤', institutionName: '佐藤クリニック', status: 'completed' },
  { visitId: 'v1', patientId: 'p1', prescriptionDate: '2026-01-05', doctorName: '田中', institutionName: '田中内科', status: 'completed' },
  { visitId: 'vc', patientId: 'p1', prescriptionDate: '2026-05-01', doctorName: '誤', status: 'cancelled' }
];

const items: MedHistoryPrescriptionItem[] = [
  { visitId: 'v3', drugId: 'D-AML5', drugName: 'アムロジピン錠5mg', amount: 1, usage: '1日1回 朝食後', days: 30 },
  { visitId: 'v3', drugId: 'D-LOX', drugName: 'ロキソプロフェン錠60mg', amount: 3, usage: '1日3回', days: 5 },
  { visitId: 'v2', drugId: 'D-AML5', drugName: 'アムロジピン錠5mg', amount: 1, usage: '1日1回 朝食後', days: 30, dispensedDrug: 'アムロジピンOD錠5mg「サワイ」', dispensedDrugCode: 'D-AML5-G', changeReason: '一般名処方' },
  { visitId: 'v1', drugId: 'D-AML25', drugName: 'アムロジピン錠2.5mg', amount: 1, usage: '1日1回 朝食後', days: 28 },
  { visitId: 'vc', drugId: 'D-AML5', drugName: 'アムロジピン錠5mg', amount: 1, usage: '誤登録', days: 1 }
];

const soapRecords: MedHistorySoapRecord[] = [
  { visitId: 'v3', problems: [{ title: '#1 高血圧', entries: [{ type: 'S', text: '血圧安定。ふらつきなし。' }, { type: 'P', text: '継続服用を確認。' }] }] },
  { visitId: 'v2', problems: [{ title: '#1 高血圧', entries: [{ type: 'S', text: '' }] }] }
];

test('buildDrugMedicationHistory traces one drug across visits, newest first, with soap and doctor', () => {
  const history = buildDrugMedicationHistory({
    anchorLabel: 'アムロジピン錠5mg',
    matchKeys: ['D-AML5'],
    visits,
    items,
    soapRecords
  });

  assert.strictEqual(history.totalVisits, 2);
  assert.strictEqual(history.lastDispensedDate, '2026-06-01');
  assert.deepStrictEqual(history.entries.map((e) => e.visitId), ['v3', 'v2']);

  const v3 = history.entries[0];
  assert.strictEqual(v3.doctorName, '田中');
  assert.strictEqual(v3.institutionName, '田中内科');
  assert.strictEqual(v3.prescriptions[0].usage, '1日1回 朝食後');
  assert.strictEqual(v3.prescriptions[0].days, 30);
  assert.strictEqual(v3.hasSoap, true);
  assert.ok(v3.soap);

  const v2 = history.entries[1];
  assert.strictEqual(v2.prescriptions[0].substitutedTo, 'アムロジピンOD錠5mg「サワイ」');
  assert.strictEqual(v2.hasSoap, false, 'soap with only empty entries does not count as having content');
  assert.strictEqual(v2.soap, undefined);
});

test('buildDrugMedicationHistory matches by dispensed code and excludes cancelled visits', () => {
  const history = buildDrugMedicationHistory({
    anchorLabel: 'アムロジピンOD錠5mg「サワイ」',
    matchKeys: ['D-AML5-G'],
    visits,
    items,
    soapRecords
  });

  assert.strictEqual(history.totalVisits, 1);
  assert.strictEqual(history.entries[0].visitId, 'v2');
  assert.ok(!history.entries.some((e) => e.visitId === 'vc'), 'cancelled visit is excluded');
});

test('buildDrugMedicationHistory does not bleed into a different strength', () => {
  const history = buildDrugMedicationHistory({
    anchorLabel: 'アムロジピン錠5mg',
    matchKeys: ['D-AML5'],
    visits,
    items
  });
  assert.ok(!history.entries.some((e) => e.visitId === 'v1'), '2.5mg (D-AML25) is not matched by 5mg key');
});

test('listPatientPrescribedDrugs returns unique drugs by last dispensed date with occurrence counts', () => {
  const drugs = listPatientPrescribedDrugs(items, visits);
  const aml5 = drugs.find((d) => d.drugId === 'D-AML5');

  assert.ok(aml5);
  assert.strictEqual(aml5.label, 'アムロジピン錠5mg');
  assert.strictEqual(aml5.occurrences, 3);
  assert.strictEqual(aml5.lastDate, '2026-06-01');
  assert.ok(aml5.matchKeys.includes('D-AML5'));
  assert.ok(aml5.matchKeys.includes('D-AML5-G'), 'dispensed code is collected as a match key');
  // newest lastDate first
  assert.strictEqual(drugs[0].drugId, 'D-AML5');
});
