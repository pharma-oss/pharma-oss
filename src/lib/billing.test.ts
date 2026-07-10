import { test } from 'node:test';
import assert from 'node:assert';
import { calculateInsuranceAmounts } from './billing.ts';

test('calculateInsuranceAmounts rounds patient copay to nearest 10 yen', () => {
  const result = calculateInsuranceAmounts(123, 30);

  assert.strictEqual(result.totalCostYen, 1230);
  assert.strictEqual(result.rawPatientCopayYen, 369);
  assert.strictEqual(result.patientCopayYen, 370);
  assert.strictEqual(result.insurerBurdenYen, 860);
});

test('calculateInsuranceAmounts rounds 10 yen fractions down or up correctly', () => {
  assert.strictEqual(calculateInsuranceAmounts(121, 10).patientCopayYen, 120);
  assert.strictEqual(calculateInsuranceAmounts(125, 10).patientCopayYen, 130);
});

test('calculateInsuranceAmounts clamps invalid inputs safely', () => {
  assert.strictEqual(calculateInsuranceAmounts(-5, 30).patientCopayYen, 0);
  assert.strictEqual(calculateInsuranceAmounts(100, -20).patientCopayYen, 0);
  assert.strictEqual(calculateInsuranceAmounts(100, 120).patientCopayYen, 1000);
  assert.strictEqual(calculateInsuranceAmounts(Number.NaN, Number.NaN).patientCopayYen, 0);
});
