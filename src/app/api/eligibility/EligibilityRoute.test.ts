import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('./check/route.ts', import.meta.url), 'utf8');

test('eligibility check route emits normalized-compatible qualification fields', () => {
  assert.match(routeSource, /requestOnlineEligibility/);
  assert.match(routeSource, /OnlineEligibilityConnectorError/);
  assert.match(routeSource, /ONLINE_ELIGIBILITY_ENDPOINT/);
  assert.match(routeSource, /ONLINE_ELIGIBILITY_MODE/);
  assert.match(routeSource, /ONLINE_ELIGIBILITY_ALLOW_MOCK/);
  assert.match(routeSource, /allowMockFallback/);
  assert.match(routeSource, /ONLINE_ELIGIBILITY_TIMEOUT_MS/);
  assert.match(routeSource, /ONLINE_ELIGIBILITY_BEARER_TOKEN/);
  assert.match(routeSource, /resultCode/);
  assert.match(routeSource, /qualificationStatus/);
  assert.match(routeSource, /insuredNumber/);
  assert.match(routeSource, /burdenRatio/);
  assert.match(routeSource, /online_eligibility_unexpected_error/);
});
