import { test } from 'node:test';
import assert from 'node:assert';
import { GET } from './connector-readiness/route.ts';

test('connector readiness route reports sanitized external integration configuration', async () => {
  const response = await GET();
  assert.strictEqual(response.status, 200);

  const report = await response.json() as Record<string, any>;
  assert.ok(report);
  assert.strictEqual(report.type, 'yakureki-external-connector-readiness');
  assert.ok(Array.isArray(report.checks));
  assert.strictEqual(report.checks.length, 4);

  const checkIds = report.checks.map((c: { id: string }) => c.id);
  assert.ok(checkIds.includes('myna_card_reader'));
  assert.ok(checkIds.includes('online_eligibility'));
  assert.ok(checkIds.includes('electronic_prescription'));
  assert.ok(checkIds.includes('pharmacy_device'));
});
