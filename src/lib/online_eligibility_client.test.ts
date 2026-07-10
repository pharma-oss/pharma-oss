import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildMockOnlineEligibilityConnectorResponse,
  OnlineEligibilityConnectorError,
  requestOnlineEligibility,
  requestOnlineEligibilityFromEndpoint
} from './online_eligibility_client.ts';
import { normalizeOnlineEligibilityResponse } from './online_eligibility.ts';

const fixedNow = () => new Date('2026-06-18T09:00:00.000Z');

test('buildMockOnlineEligibilityConnectorResponse stays compatible with the normalizer', () => {
  const response = buildMockOnlineEligibilityConnectorResponse({
    insuranceNumber: '06123456',
    insuredNumber: '記号123',
    burdenRatio: 30
  }, fixedNow);
  const normalized = normalizeOnlineEligibilityResponse(response);

  assert.strictEqual(response.eligibilitySource, 'mock');
  assert.strictEqual(response.eligibilityMessage, 'デモ用の資格確認結果です。');
  assert.strictEqual(normalized.patientStatus, 'valid');
  assert.strictEqual(normalized.insuranceInfoPatch.provider, '06123456');
  assert.strictEqual(normalized.insuranceInfoPatch.number, '記号123');
  assert.strictEqual(normalized.insuranceInfoPatch.eligibilityCheckedAt, '2026-06-18T09:00:00.000Z');
});

test('requestOnlineEligibility falls back to mock when no external endpoint is configured', async () => {
  const response = await requestOnlineEligibility({
    insuranceNumber: '06123456',
    insuredNumber: 'A123'
  }, {
    now: fixedNow
  });

  assert.strictEqual(response.eligibilitySource, 'mock');
  assert.strictEqual(response.checkedAt, '2026-06-18T09:00:00.000Z');
});

test('requestOnlineEligibility blocks implicit mock fallback when disabled', async () => {
  await assert.rejects(
    () => requestOnlineEligibility({
      insuranceNumber: '06123456',
      insuredNumber: 'A123'
    }, {
      allowMockFallback: false,
      now: fixedNow
    }),
    (error) => {
      assert.ok(error instanceof OnlineEligibilityConnectorError);
      assert.strictEqual(error.code, 'online_eligibility_endpoint_unconfigured');
      assert.strictEqual(error.status, 503);
      return true;
    }
  );
});

test('requestOnlineEligibility blocks explicit mock mode when disabled', async () => {
  await assert.rejects(
    () => requestOnlineEligibility({
      insuranceNumber: '06123456',
      insuredNumber: 'A123'
    }, {
      mode: 'mock',
      allowMockFallback: false,
      now: fixedNow
    }),
    (error) => {
      assert.ok(error instanceof OnlineEligibilityConnectorError);
      assert.strictEqual(error.code, 'online_eligibility_mock_disabled');
      assert.strictEqual(error.status, 503);
      return true;
    }
  );
});

test('requestOnlineEligibility external mode requires a configured endpoint', async () => {
  await assert.rejects(
    () => requestOnlineEligibility({
      insuranceNumber: '06123456'
    }, {
      mode: 'external'
    }),
    (error) => {
      assert.ok(error instanceof OnlineEligibilityConnectorError);
      assert.strictEqual(error.code, 'online_eligibility_endpoint_unconfigured');
      assert.strictEqual(error.status, 503);
      return true;
    }
  );
});

test('requestOnlineEligibilityFromEndpoint posts qualification payload with bearer token', async () => {
  const calls: { input: RequestInfo | URL; init?: RequestInit }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: {
            qualificationStatus: 'valid',
            resultDateTime: '2026-06-18T09:30:00.000Z',
            insurerNumber: '06123456',
            insuredNumber: 'A123',
            burdenRatio: 20
          }
        };
      }
    } as Response;
  };

  const response = await requestOnlineEligibilityFromEndpoint({
    patientName: '資格 太郎',
    birthDate: '1980-01-01',
    insuranceNumber: '06123456',
    insuredNumber: 'A123',
    burdenRatio: 20
  }, {
    endpoint: 'https://example.test/eligibility',
    bearerToken: 'secret-token',
    fetchImpl,
    now: fixedNow
  });

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(String(calls[0].input), 'https://example.test/eligibility');
  assert.strictEqual(calls[0].init?.method, 'POST');
  assert.strictEqual((calls[0].init?.headers as Record<string, string>).Authorization, 'Bearer secret-token');
  assert.match(String(calls[0].init?.body), /資格 太郎/);
  assert.strictEqual(response.eligibilitySource, 'external');
  assert.strictEqual(response.eligibilityReceivedAt, '2026-06-18T09:00:00.000Z');
  assert.strictEqual(normalizeOnlineEligibilityResponse(response).insuranceInfoPatch.burdenRatio, 20);
});

test('requestOnlineEligibilityFromEndpoint rejects invalid response shapes', async () => {
  const fetchImpl: typeof fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return 'not-json-object';
    }
  } as Response);

  await assert.rejects(
    () => requestOnlineEligibilityFromEndpoint({
      insuranceNumber: '06123456'
    }, {
      endpoint: 'https://example.test/eligibility',
      fetchImpl
    }),
    (error) => {
      assert.ok(error instanceof OnlineEligibilityConnectorError);
      assert.strictEqual(error.code, 'online_eligibility_payload_invalid');
      return true;
    }
  );
});
