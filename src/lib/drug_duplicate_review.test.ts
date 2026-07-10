import { test } from 'node:test';
import assert from 'node:assert';
import { DEMO_DRUG_CODE_PREFIX } from './demo_data.ts';
import {
  buildDrugDuplicateScanAuditDetail,
  buildDrugUsageStats,
  findDuplicateDrugGroups
} from './drug_duplicate_review.ts';

const drug = (overrides: any) => ({
  code: overrides.code,
  name: overrides.name ?? 'アムロジピンOD錠5mg「テスト」',
  yjCode: overrides.yjCode,
  isGeneric: true,
  isAbolished: overrides.isAbolished,
  price: overrides.price,
  stockQuantity: overrides.stockQuantity,
  location: overrides.location
});

test('店舗で使用中の薬品が絡むYJコード一致グループだけを統合候補にする', () => {
  const usage = buildDrugUsageStats({
    stocks: [{ drugCode: 'drug_a' }, { drugCode: 'drug_a' }],
    prescriptionItems: [{ drugId: 'drug_b' }]
  });
  const report = findDuplicateDrugGroups([
    // 使用中の重複(在庫あり/処方参照あり)
    drug({ code: 'drug_a', yjCode: '2171022G1023' }),
    drug({ code: 'drug_b', yjCode: '2171022G1023' }),
    // マスタ由来の未使用重複(一般名収載行と銘柄行の同居など)は表示しない
    drug({ code: 'drug_c', name: 'リン酸水素カルシウム', yjCode: '9999999X9999' }),
    drug({ code: 'drug_d', name: '「山善」第二リン灰', yjCode: '9999999X9999' })
  ], usage);

  assert.strictEqual(report.groups.length, 1);
  assert.strictEqual(report.groups[0].matchType, 'yj_code');
  assert.strictEqual(report.inactiveGroupCount, 1);
  // 処方参照より在庫ロットより処方参照が多い方…ではなく、処方参照ありのdrug_bが先頭
  assert.strictEqual(report.groups[0].suggestedTargetCode, 'drug_b');
  assert.strictEqual(report.duplicateDrugCount, 2);
});

test('薬品名一致でYJコードが混在するグループは統合不可フラグを立てる', () => {
  const usage = buildDrugUsageStats({ stocks: [{ drugCode: 'drug_a' }], prescriptionItems: [] });
  const report = findDuplicateDrugGroups([
    drug({ code: 'drug_a', name: '同名散', yjCode: '1111111A1111' }),
    drug({ code: 'drug_b', name: '同名散', yjCode: '2222222B2222' })
  ], usage);

  assert.strictEqual(report.groups.length, 1);
  assert.strictEqual(report.groups[0].matchType, 'name');
  assert.strictEqual(report.groups[0].hasYjConflict, true);
});

test('YJ一致グループに含まれる名称一致グループは重複表示しない', () => {
  const usage = buildDrugUsageStats({ stocks: [{ drugCode: 'drug_a' }], prescriptionItems: [] });
  const report = findDuplicateDrugGroups([
    drug({ code: 'drug_a', name: '同名錠', yjCode: '1111111A1111' }),
    drug({ code: 'drug_b', name: '同名錠', yjCode: '1111111A1111' })
  ], usage);

  assert.strictEqual(report.groups.length, 1);
  assert.strictEqual(report.groups[0].matchType, 'yj_code');
});

test('一般名処方マスタ【般】行とデモ薬品は点検対象外', () => {
  const usage = buildDrugUsageStats({
    stocks: [{ drugCode: '1234567ZZZ' }, { drugCode: `${DEMO_DRUG_CODE_PREFIX}0001` }],
    prescriptionItems: []
  });
  const report = findDuplicateDrugGroups([
    drug({ code: '1234567ZZZ', name: '【般】アムロジピン錠5mg', yjCode: '3333333C3333' }),
    drug({ code: 'drug_real', name: '【般】アムロジピン錠5mg', yjCode: '3333333C3333' }),
    drug({ code: `${DEMO_DRUG_CODE_PREFIX}0001`, name: '「デモ」薬品', yjCode: '4444444D4444' }),
    drug({ code: `${DEMO_DRUG_CODE_PREFIX}0002`, name: '「デモ」薬品', yjCode: '4444444D4444' })
  ], usage);

  assert.strictEqual(report.groups.length, 0);
  assert.strictEqual(report.scannedDrugCount, 0);
});

test('残す薬品の推奨は廃止でない→処方参照→在庫の順で決まる', () => {
  const usage = buildDrugUsageStats({
    stocks: [{ drugCode: 'drug_abolished' }, { drugCode: 'drug_abolished' }],
    prescriptionItems: [{ drugId: 'drug_active' }]
  });
  const report = findDuplicateDrugGroups([
    drug({ code: 'drug_abolished', yjCode: '5555555E5555', isAbolished: true, stockQuantity: 100 }),
    drug({ code: 'drug_active', yjCode: '5555555E5555', stockQuantity: 0 })
  ], usage);

  assert.strictEqual(report.groups[0].suggestedTargetCode, 'drug_active');
});

test('dispensedDrugCodeも処方参照として数え、drugIdと同じ場合は二重に数えない', () => {
  const usage = buildDrugUsageStats({
    stocks: [],
    prescriptionItems: [
      { drugId: 'drug_a', dispensedDrugCode: 'drug_b' },
      { drugId: 'drug_b', dispensedDrugCode: 'drug_b' }
    ]
  });
  assert.strictEqual(usage.get('drug_a')?.prescriptionItemCount, 1);
  assert.strictEqual(usage.get('drug_b')?.prescriptionItemCount, 2);
});

test('監査ログ要約は件数のみで薬品名を含めない', () => {
  const usage = buildDrugUsageStats({ stocks: [{ drugCode: 'drug_a' }], prescriptionItems: [] });
  const report = findDuplicateDrugGroups([
    drug({ code: 'drug_a', yjCode: '6666666F6666' }),
    drug({ code: 'drug_b', yjCode: '6666666F6666' })
  ], usage);
  const detail = buildDrugDuplicateScanAuditDetail(report);
  assert.match(detail, /薬品重複点検: 対象2件 \/ 統合候補1グループ・2件/);
  assert.doesNotMatch(detail, /アムロジピン/);
});
