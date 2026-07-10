import { test } from 'node:test';
import assert from 'node:assert';
import { evaluateUsageWarningCondition } from './clinical_rules.ts';

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
