import { test } from 'node:test';
import assert from 'node:assert';
import { parseEnvConfig, isMockFallbackAllowed } from './env.ts';

test('parseEnvConfig accurately extracts environment variables and default fallbacks', () => {
  const config = parseEnvConfig({
    NODE_ENV: 'test',
    ELECTRONIC_PRESCRIPTION_MODE: 'live',
    PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED: 'true',
    ONLINE_ELIGIBILITY_ALLOW_MOCK: 'false',
  });

  assert.strictEqual(config.nodeEnv, 'test');
  assert.strictEqual(config.electronicPrescriptionMode, 'live');
  assert.strictEqual(config.pharmacyDeviceConnectorSimulatorEnabled, true);
  assert.strictEqual(config.onlineEligibilityAllowMock, false);
  assert.strictEqual(config.syncRole, 'standalone');
});

test('isMockFallbackAllowed strictly disallows mocks in production environment', () => {
  const prodConfig = parseEnvConfig({
    NODE_ENV: 'production',
    ONLINE_ELIGIBILITY_ALLOW_MOCK: 'true',
    MYNA_CARD_READER_ALLOW_MOCK: 'true',
  });

  assert.strictEqual(isMockFallbackAllowed(prodConfig), false);

  const devConfig = parseEnvConfig({
    NODE_ENV: 'development',
    ONLINE_ELIGIBILITY_ALLOW_MOCK: 'true',
  });

  assert.strictEqual(isMockFallbackAllowed(devConfig), true);
});
