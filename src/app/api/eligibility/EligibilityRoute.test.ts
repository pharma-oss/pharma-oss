import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('./check/route.ts', import.meta.url), 'utf8');

test('eligibility check route emits normalized-compatible qualification fields', () => {
  assert.match(routeSource, /requestOnlineEligibility/);
  assert.match(routeSource, /OnlineEligibilityConnectorError/);
  assert.match(routeSource, /getAppEnv/);
  assert.match(routeSource, /onlineEligibilityEndpoint/);
  assert.match(routeSource, /onlineEligibilityMode/);
  assert.match(routeSource, /onlineEligibilityAllowMock/);
  assert.match(routeSource, /onlineEligibilityTimeoutMs/);
  assert.match(routeSource, /onlineEligibilityBearerToken/);
  assert.match(routeSource, /resultCode/);
  assert.match(routeSource, /qualificationStatus/);
  assert.match(routeSource, /insuredNumber/);
  assert.match(routeSource, /burdenRatio/);
  assert.match(routeSource, /online_eligibility_unexpected_error/);
});
