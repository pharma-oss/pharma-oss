import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ExternalConnectorSettingsTab from '@/components/settings/ExternalConnectorSettingsTab';
import { GET } from '@/app/api/system/connector-readiness/route';

describe('SettingsExternalConnector contracts and API readiness', () => {
  it('exports ExternalConnectorSettingsTab as a callable React component function', () => {
    assert.equal(typeof ExternalConnectorSettingsTab, 'function');
  });

  it('connector readiness GET endpoint returns comprehensive connector metadata', async () => {
    const response = await GET();
    assert.equal(response.status, 200);

    const data = await response.json();
    assert.ok(data);
    assert.equal(data.type, 'yakureki-external-connector-readiness');
    assert.ok(data.checks);
    assert.ok(Array.isArray(data.checks));
    assert.ok(data.overallStatus);
    assert.equal(data.privacy.containsBearerToken, false);
  });
});
