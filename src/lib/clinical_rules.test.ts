import { test } from 'node:test';
import assert from 'node:assert';
import { evaluateUsageWarning, evaluateUsageWarningCondition } from './clinical_rules.ts';

test('evaluateUsageWarningCondition evaluates numeric amount and age comparisons', () => {
  const context = { amount: 41, age: 14, diseases: [] };

  assert.strictEqual(evaluateUsageWarningCondition('amount > 40', context), true);
  assert.strictEqual(evaluateUsageWarningCondition('amount <= 40', context), false);
  assert.strictEqual(evaluateUsageWarningCondition('age < 15', context), true);
});

test('evaluateUsageWarningCondition treats dose as amount when dose is not provided', () => {
  const context = { amount: 180, age: 40, diseases: [] };

  assert.strictEqual(evaluateUsageWarningCondition('dose >= 180', context), true);
});

test('evaluateUsageWarningCondition evaluates active disease includes checks', () => {
  const context = { amount: 1, age: 40, diseases: ['緑内障', '高血圧'] };

  assert.strictEqual(evaluateUsageWarningCondition("diseases && diseases.includes('緑内障')", context), true);
  assert.strictEqual(evaluateUsageWarningCondition('diseases && diseases.includes("糖尿病")', context), false);
});

test('evaluateUsageWarningCondition rejects unsupported expressions without executing them', () => {
  const context = { amount: 1, age: 40, diseases: [] };

  assert.strictEqual(evaluateUsageWarningCondition('globalThis.alert("x")', context), false);
  assert.strictEqual(evaluateUsageWarningCondition('amount > 0 || age > 0', context), false);
});

test('evaluateUsageWarning returns triggered and unevaluable statuses (PR-E4)', () => {
  // age 未設定/undefined のとき unevaluable: true
  assert.deepStrictEqual(
    evaluateUsageWarning('age < 15', { amount: 1, age: undefined, diseases: [] }),
    { triggered: false, unevaluable: true }
  );

  // age 10 (小児) のとき triggered: true, unevaluable: false
  assert.deepStrictEqual(
    evaluateUsageWarning('age < 15', { amount: 1, age: 10, diseases: [] }),
    { triggered: true, unevaluable: false }
  );

  // age 40 (成人) のとき triggered: false, unevaluable: false
  assert.deepStrictEqual(
    evaluateUsageWarning('age < 15', { amount: 1, age: 40, diseases: [] }),
    { triggered: false, unevaluable: false }
  );

  // 年齢以外の条件 (amount > 40) で age が undefined でも unevaluable に巻き込まれないこと
  assert.deepStrictEqual(
    evaluateUsageWarning('amount > 40', { amount: 50, age: undefined, diseases: [] }),
    { triggered: true, unevaluable: false }
  );

  // 回帰: evaluateUsageWarningCondition の動作が従来通りであること
  assert.strictEqual(evaluateUsageWarningCondition('age < 15', { amount: 1, age: undefined, diseases: [] }), false);
  assert.strictEqual(evaluateUsageWarningCondition('age < 15', { amount: 1, age: 10, diseases: [] }), true);
  assert.strictEqual(evaluateUsageWarningCondition('age < 15', { amount: 1, age: 40, diseases: [] }), false);
  assert.strictEqual(evaluateUsageWarningCondition('amount > 40', { amount: 50, age: undefined, diseases: [] }), true);
});

