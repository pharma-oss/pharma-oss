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

test('parseEnvConfig parses newly added API timeouts, limits, and SQLite WASM URLs', () => {
  const customConfig = parseEnvConfig({
    DISPENSING_UKE_OFFICIAL_SPEC_PDF_TIMEOUT_MS: '15000',
    DISPENSING_UKE_OFFICIAL_SPEC_PDF_MAX_BYTES: '10485760',
    DRUG_MASTER_OFFICIAL_FILE_TIMEOUT_MS: '45000',
    NEXT_PUBLIC_SQLITE_WASM_MODULE_URL: '/custom-wasm/index.mjs',
    ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_RETRY_POLICY_CONFIRMED: '1'
  });

  assert.strictEqual(customConfig.dispensingUkeOfficialSpecPdfTimeoutMs, 15000);
  assert.strictEqual(customConfig.dispensingUkeOfficialSpecPdfMaxBytes, 10485760);
  assert.strictEqual(customConfig.drugMasterOfficialFileTimeoutMs, 45000);
  assert.strictEqual(customConfig.sqliteWasmModuleUrl, '/custom-wasm/index.mjs');
  assert.strictEqual(customConfig.electronicPrescriptionSharedFolderRetryPolicyConfirmed, true);
});
