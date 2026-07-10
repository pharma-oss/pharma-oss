import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildClaimRiskSummary,
  getClaimRiskActionLabel,
  getClaimRiskPriority,
  summarizeClaimIssueTitles
} from './claim_risk.ts';
import type { ClaimValidationIssue } from './claim_validation.ts';

const issues: ClaimValidationIssue[] = [
  {
    severity: 'error',
    code: 'insurance_missing',
    title: '保険情報が未設定です',
    message: '保険者、記号番号、負担割合を登録してから請求データを作成してください。'
  },
  {
    severity: 'warning',
    code: 'pharmacy_code_missing',
    title: '保険薬局コードが未設定です',
    message: '提出前に設定画面で登録してください。'
  },
  {
    severity: 'info',
    code: 'same_ingredient_form_grouped',
    title: '同一成分・同一剤型の薬があります',
    message: 'まとめて計算されます。'
  }
];

test('buildClaimRiskSummary promotes blocking claim errors into urgent work', () => {
  const summary = buildClaimRiskSummary({ issues, totalPoints: 120 });

  assert.ok(summary);
  assert.strictEqual(summary.priority, 'high');
  assert.strictEqual(summary.actionLabel, '保険・公費情報を確認');
  assert.deepStrictEqual(summary.topIssueTitles, ['保険情報が未設定です', '保険薬局コードが未設定です']);
  assert.ok(summary.riskScore >= 68);
});

test('claim risk summary ignores informational issues only', () => {
  const summary = buildClaimRiskSummary({
    issues: [issues[2]],
    totalPoints: 120
  });

  assert.strictEqual(summary, null);
});

test('patient safety and diagnostic issues choose precise operational actions', () => {
  assert.strictEqual(getClaimRiskActionLabel([
    { severity: 'warning', code: 'patient_side_effect_match', title: '副作用歴に該当', message: '確認してください。' }
  ], 88), '患者アラートを薬剤師確認');

  assert.strictEqual(getClaimRiskActionLabel([
    { severity: 'error', code: 'diagnostic_management_enabled', title: '検査薬ですが薬学管理がONです', message: '確認してください。' }
  ], 88), '検査薬の算定ON/OFFを確認');
});

test('insurance identifier issues route operators to insurance and public expense confirmation', () => {
  assert.strictEqual(getClaimRiskActionLabel([
    { severity: 'error', code: 'public_insurance_recipient_format_invalid', title: '公費受給者番号の形式が不正です', message: '確認してください。' }
  ], 88), '保険・公費情報を確認');
});

test('claim risk priority treats warning-only claims as medium unless points are zero', () => {
  const warningOnly: ClaimValidationIssue[] = [
    { severity: 'warning', code: 'high_risk_tokkan_missing', title: '特薬管が未選択です', message: '確認してください。' }
  ];

  assert.strictEqual(getClaimRiskPriority(warningOnly, 88), 'medium');
  assert.strictEqual(getClaimRiskPriority(warningOnly, 0), 'high');
});

test('summarizeClaimIssueTitles keeps unique blocking titles compact', () => {
  assert.deepStrictEqual(
    summarizeClaimIssueTitles([...issues, issues[0]], 2),
    ['保険情報が未設定です', '保険薬局コードが未設定です']
  );
});
