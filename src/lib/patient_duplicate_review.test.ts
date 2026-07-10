import { test } from 'node:test';
import assert from 'node:assert';
import { DEMO_PATIENT_ID } from './demo_data.ts';
import {
  buildPatientDuplicateScanAuditDetail,
  buildPatientVisitStats,
  findDuplicatePatientGroups
} from './patient_duplicate_review.ts';

const patient = (overrides: any) => ({
  patientId: overrides.patientId,
  name: overrides.name ?? '山田 太郎',
  kana: overrides.kana ?? 'ヤマダ タロウ',
  birthDate: overrides.birthDate ?? '1958-05-12',
  ...(overrides.insuranceInfo ? { insuranceInfo: overrides.insuranceInfo } : {})
});

test('同姓同名・同生年月日の患者をグループ化し、受付が多い患者を残す候補にする', () => {
  const report = findDuplicatePatientGroups(
    [
      patient({ patientId: 'pt_a', name: '山田　太郎' }),
      patient({ patientId: 'pt_b', name: '山田 太郎' }),
      patient({ patientId: 'pt_c', name: '佐藤 花子', kana: 'サトウ ハナコ' })
    ],
    [
      { patientId: 'pt_b', issueDate: '2026-07-01T09:00:00.000Z' },
      { patientId: 'pt_b', issueDate: '2026-06-01T09:00:00.000Z' },
      { patientId: 'pt_a', issueDate: '2026-05-01T09:00:00.000Z' }
    ]
  );

  assert.strictEqual(report.scannedPatientCount, 3);
  assert.strictEqual(report.groups.length, 1);
  const group = report.groups[0];
  assert.strictEqual(group.matchType, 'name_birthdate');
  assert.strictEqual(group.members.length, 2);
  // 受付2件のpt_bが残す候補の先頭になる
  assert.strictEqual(group.suggestedTargetPatientId, 'pt_b');
  assert.strictEqual(group.members[0].visitCount, 2);
  assert.strictEqual(report.duplicatePatientCount, 2);
});

test('カナだけ一致する患者もグループ化し、氏名一致グループと重複表示しない', () => {
  const report = findDuplicatePatientGroups([
    // 氏名は違うがカナと生年月日が同じ(旧姓/表記ゆれ想定)
    patient({ patientId: 'pt_a', name: '山田 太郎', kana: 'やまだ たろう' }),
    patient({ patientId: 'pt_b', name: '山田 太朗', kana: 'ヤマダ　タロウ' })
  ]);

  assert.strictEqual(report.groups.length, 1);
  assert.strictEqual(report.groups[0].matchType, 'kana_birthdate');

  // 氏名もカナも一致する場合は氏名一致グループだけを表示する
  const both = findDuplicatePatientGroups([
    patient({ patientId: 'pt_c' }),
    patient({ patientId: 'pt_d' })
  ]);
  assert.strictEqual(both.groups.length, 1);
  assert.strictEqual(both.groups[0].matchType, 'name_birthdate');
});

test('生年月日が違う同姓同名や、デモ患者は重複候補にしない', () => {
  const report = findDuplicatePatientGroups([
    patient({ patientId: 'pt_a', birthDate: '1958-05-12' }),
    patient({ patientId: 'pt_b', birthDate: '1960-01-01' }),
    patient({ patientId: DEMO_PATIENT_ID, name: 'デモ患者 みどり', kana: 'デモカンジャ ミドリ' }),
    patient({ patientId: 'pt_demo_like', name: 'デモ患者 みどり', kana: 'デモカンジャ ミドリ' })
  ]);

  assert.strictEqual(report.groups.length, 0);
  // デモ患者はスキャン対象数にも入れない
  assert.strictEqual(report.scannedPatientCount, 3);
});

test('生年月日未登録の患者は誤統合を避けるため候補にしない', () => {
  const report = findDuplicatePatientGroups([
    patient({ patientId: 'pt_a', birthDate: '' }),
    patient({ patientId: 'pt_b', birthDate: '' })
  ]);
  assert.strictEqual(report.groups.length, 0);
});

test('buildPatientVisitStats counts visits and keeps the latest issue date', () => {
  const stats = buildPatientVisitStats([
    { patientId: 'pt_a', issueDate: '2026-06-01T09:00:00.000Z' },
    { patientId: 'pt_a', issueDate: '2026-07-01T09:00:00.000Z' },
    { patientId: '', issueDate: '2026-07-01T09:00:00.000Z' }
  ]);
  assert.strictEqual(stats.get('pt_a')?.count, 2);
  assert.strictEqual(stats.get('pt_a')?.latestIssueDate, '2026-07-01T09:00:00.000Z');
  assert.strictEqual(stats.size, 1);
});

test('監査ログ要約は件数だけで患者名を含めない', () => {
  const report = findDuplicatePatientGroups([
    patient({ patientId: 'pt_a' }),
    patient({ patientId: 'pt_b' })
  ]);
  const detail = buildPatientDuplicateScanAuditDetail(report);
  assert.match(detail, /患者重複点検: 対象2名 \/ 重複候補1グループ・2名/);
  assert.doesNotMatch(detail, /山田/);
});
