import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEndpointHost,
  isLoopbackHost,
  isPrivateLanHost,
  parseIPv4
} from './network_host_policy';
import { isAllowedFacilityEndpoint } from './pharmacy_device_connector_client';
import { buildExternalConnectorReadinessReport } from './external_connector_readiness';
import { fetchElectronicPrescription } from './electronic_prescription_client';

describe('network_host_policy (Q-4 strict host validation)', () => {
  it('parses only valid 4-octet decimal IPv4 addresses', () => {
    assert.deepStrictEqual(parseIPv4('127.0.0.1'), [127, 0, 0, 1]);
    assert.deepStrictEqual(parseIPv4('192.168.1.10'), [192, 168, 1, 10]);
    assert.strictEqual(parseIPv4('127.0.0.1.example.com'), null);
    assert.strictEqual(parseIPv4('10.example.com'), null);
    assert.strictEqual(parseIPv4('192.168.example.com'), null);
    assert.strictEqual(parseIPv4('127.0.0.256'), null);
    assert.strictEqual(parseIPv4('10.0.1'), null);
  });

  it('distinguishes loopback, private LAN, and look-alike external hostnames', () => {
    assert.strictEqual(isLoopbackHost('localhost'), true);
    assert.strictEqual(isLoopbackHost('LOCALHOST'), true);
    assert.strictEqual(isLoopbackHost('::1'), true);
    assert.strictEqual(isLoopbackHost('[::1]'), true);
    assert.strictEqual(isLoopbackHost('127.0.0.1'), true);
    assert.strictEqual(isLoopbackHost('127.255.255.254'), true);
    assert.strictEqual(isLoopbackHost('127.0.0.1.example.com'), false);
    assert.strictEqual(isLoopbackHost('127.attacker.jp'), false);

    assert.strictEqual(isPrivateLanHost('printer.local'), true);
    assert.strictEqual(isPrivateLanHost('.local'), false);
    assert.strictEqual(isPrivateLanHost('10.0.0.5'), true);
    assert.strictEqual(isPrivateLanHost('192.168.10.20'), true);
    assert.strictEqual(isPrivateLanHost('172.16.0.1'), true);
    assert.strictEqual(isPrivateLanHost('172.31.255.254'), true);
    assert.strictEqual(isPrivateLanHost('172.15.255.255'), false);
    assert.strictEqual(isPrivateLanHost('172.32.0.1'), false);
    assert.strictEqual(isPrivateLanHost('10.example.com'), false);
    assert.strictEqual(isPrivateLanHost('192.168.example.com'), false);
    assert.strictEqual(isPrivateLanHost('172.16.example.com'), false);

    assert.strictEqual(classifyEndpointHost('[::1]'), 'localhost');
    assert.strictEqual(classifyEndpointHost('127.0.0.1.example.com'), 'external');
    assert.strictEqual(classifyEndpointHost('10.example.com'), 'external');
    assert.strictEqual(classifyEndpointHost('192.168.example.com'), 'external');
    assert.strictEqual(classifyEndpointHost('192.168.1.50'), 'private_network');
  });

  it('rejects look-alike domains in pharmacy_device_connector_client while accepting valid loopback and HTTPS private LAN', () => {
    assert.strictEqual(isAllowedFacilityEndpoint('http://127.0.0.1:39300/handoff'), true);
    assert.strictEqual(isAllowedFacilityEndpoint('http://[::1]:39300/handoff'), true);
    assert.strictEqual(isAllowedFacilityEndpoint('https://10.0.0.15:8443/handoff'), true);
    assert.strictEqual(isAllowedFacilityEndpoint('https://192.168.1.20/handoff'), true);
    assert.strictEqual(isAllowedFacilityEndpoint('https://172.16.5.10/handoff'), true);
    assert.strictEqual(isAllowedFacilityEndpoint('https://nsips.local/handoff'), true);

    assert.strictEqual(isAllowedFacilityEndpoint('http://127.0.0.1.example.com/handoff'), false);
    assert.strictEqual(isAllowedFacilityEndpoint('https://10.example.com/handoff'), false);
    assert.strictEqual(isAllowedFacilityEndpoint('https://192.168.example.com/handoff'), false);
    assert.strictEqual(isAllowedFacilityEndpoint('https://172.16.example.com/handoff'), false);
    assert.strictEqual(isAllowedFacilityEndpoint('http://192.168.1.20/handoff'), false);
    assert.strictEqual(isAllowedFacilityEndpoint('https://.local/handoff'), false);
  });

  it('classifies look-alike domains as external and [::1] as localhost in external_connector_readiness', () => {
    const report = buildExternalConnectorReadinessReport({
      pharmacyDevice: {
        mode: 'connector',
        endpoint: 'https://10.example.com/handoff',
        bearerToken: 'tok'
      },
      electronicPrescription: {
        mode: 'connector',
        endpoint: 'http://127.0.0.1.example.com/ep',
        bearerToken: 'tok'
      },
      mynaCardReader: {
        mode: 'bridge',
        endpoint: 'http://[::1]:39100/myna/read'
      }
    });

    const deviceCheck = report.checks.find((c) => c.id === 'pharmacy_device');
    const epCheck = report.checks.find((c) => c.id === 'electronic_prescription');
    const mynaCheck = report.checks.find((c) => c.id === 'myna_card_reader');

    assert.strictEqual(deviceCheck?.config.endpointHostKind, 'external');
    assert.strictEqual(epCheck?.config.endpointHostKind, 'external');
    assert.strictEqual(mynaCheck?.config.endpointHostKind, 'localhost');
  });

  it('rejects plain HTTP to look-alike 127.* domain in electronic_prescription_client', async () => {
    let called = false;
    const res = await fetchElectronicPrescription(
      { fetchKey: 'EP-2026-001' },
      {
        env: {
          ELECTRONIC_PRESCRIPTION_MODE: 'connector',
          ELECTRONIC_PRESCRIPTION_ENDPOINT: 'http://127.0.0.1.example.com/api',
          ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token'
        },
        fetchImpl: (async () => {
          called = true;
          return new Response('{}', { status: 200 });
        }) as typeof fetch
      }
    );
    assert.strictEqual(res.status, 'unconfigured');
    assert.match(res.message, /HTTPSが必要/);
    assert.strictEqual(called, false);
  });
});
