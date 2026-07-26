import { test } from 'node:test';
import assert from 'node:assert';
import {
  OFFICIAL_CLAIM_RETURN_REASONS,
  buildReturnCorrectionSummary,
  getClaimReturnReasonByCode
} from './claim_return_manager.ts';

test('OFFICIAL_CLAIM_RETURN_REASONS contains standard return codes', () => {
  assert.ok(OFFICIAL_CLAIM_RETURN_REASONS.length >= 5);
  const r01 = getClaimReturnReasonByCode('R01');
  assert.ok(r01);
  assert.strictEqual(r01.title, '保険資格失効・変更');
  assert.strictEqual(r01.category, 'insurance');
});

test('buildReturnCorrectionSummary formats correction memo and audit log correctly', () => {
  const summary = buildReturnCorrectionSummary({
    reasonCode: 'R02',
    customNote: '枝番01を追記',
    operatorName: '薬剤師A'
  });

  assert.strictEqual(summary.reason.code, 'R02');
  assert.ok(summary.formattedMemo.includes('【返戻修正 [R02: 被保険者記号・番号誤り]】'));
  assert.ok(summary.formattedMemo.includes('枝番01を追記'));
  assert.ok(summary.auditDetails.includes('対応者: 薬剤師A'));
});
