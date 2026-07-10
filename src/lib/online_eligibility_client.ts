import { buildMockOnlineEligibilityResponse } from './online_eligibility';

export type OnlineEligibilityConnectorMode = 'auto' | 'external' | 'mock';
export type OnlineEligibilityConnectorSource = 'external' | 'mock';

export interface OnlineEligibilityRequestPayload {
  patientName?: string;
  birthDate?: string;
  insuranceNumber: string;
  insuredNumber?: string;
  burdenRatio?: number;
}

export interface OnlineEligibilityConnectorConfig {
  endpoint?: string;
  mode?: OnlineEligibilityConnectorMode;
  allowMockFallback?: boolean;
  bearerToken?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

type UnknownRecord = Record<string, unknown>;

export class OnlineEligibilityConnectorError extends Error {
  readonly code: string;
  readonly status: number;
  readonly cause?: unknown;

  constructor(code: string, message: string, status = 502, cause?: unknown) {
    super(message);
    this.name = 'OnlineEligibilityConnectorError';
    this.code = code;
    this.status = status;
    this.cause = cause;
    Object.setPrototypeOf(this, OnlineEligibilityConnectorError.prototype);
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function unwrapEligibilityPayload(payload: unknown): UnknownRecord {
  if (!isRecord(payload)) {
    throw new OnlineEligibilityConnectorError(
      'online_eligibility_payload_invalid',
      '資格確認サービスの応答がJSONオブジェクトではありません。'
    );
  }
  const data = payload.data;
  const result = payload.result;
  if (isRecord(data)) return data;
  if (isRecord(result) && !('statusCode' in result || 'status' in result)) return result;
  return payload;
}

export function buildMockOnlineEligibilityConnectorResponse(
  payload: OnlineEligibilityRequestPayload,
  now: () => Date = () => new Date()
): UnknownRecord {
  return {
    ...buildMockOnlineEligibilityResponse({
      insuranceNumber: payload.insuranceNumber,
      insuredNumber: payload.insuredNumber,
      burdenRatio: payload.burdenRatio,
      checkedAt: now().toISOString()
    }),
    eligibilitySource: 'mock' satisfies OnlineEligibilityConnectorSource,
    eligibilityMessage: 'デモ用の資格確認結果です。'
  };
}

export async function requestOnlineEligibilityFromEndpoint(
  payload: OnlineEligibilityRequestPayload,
  config: OnlineEligibilityConnectorConfig
): Promise<UnknownRecord> {
  const endpoint = config.endpoint?.trim();
  if (!endpoint) {
    throw new OnlineEligibilityConnectorError(
      'online_eligibility_endpoint_unconfigured',
      '資格確認サービスの接続先が未設定です。',
      503
    );
  }

  const timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = config.fetchImpl || fetch;

  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
    if (config.bearerToken) {
      headers.Authorization = `Bearer ${config.bearerToken}`;
    }

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new OnlineEligibilityConnectorError(
        'online_eligibility_http_error',
        `資格確認サービスがエラーを返しました（HTTP ${response.status}）。`,
        502
      );
    }

    return {
      ...unwrapEligibilityPayload(await response.json()),
      eligibilitySource: 'external' satisfies OnlineEligibilityConnectorSource,
      eligibilityReceivedAt: (config.now || (() => new Date()))().toISOString()
    };
  } catch (error) {
    if (error instanceof OnlineEligibilityConnectorError) throw error;
    throw new OnlineEligibilityConnectorError(
      'online_eligibility_unavailable',
      '資格確認サービスへ接続できませんでした。',
      502,
      error
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestOnlineEligibility(
  payload: OnlineEligibilityRequestPayload,
  config: OnlineEligibilityConnectorConfig = {}
): Promise<UnknownRecord> {
  const mode = config.mode || 'auto';
  const allowMockFallback = config.allowMockFallback !== false;
  if (mode === 'mock') {
    if (!allowMockFallback) {
      throw new OnlineEligibilityConnectorError(
        'online_eligibility_mock_disabled',
        'デモ用の資格確認は本番モードで無効です。資格確認サービスを設定してください。',
        503
      );
    }
    return buildMockOnlineEligibilityConnectorResponse(payload, config.now);
  }
  if (mode === 'external' || config.endpoint) {
    return requestOnlineEligibilityFromEndpoint(payload, config);
  }
  if (!allowMockFallback) {
    throw new OnlineEligibilityConnectorError(
      'online_eligibility_endpoint_unconfigured',
      '資格確認サービスの接続先が未設定です。デモ用資格確認に切り替える場合は明示的に許可してください。',
      503
    );
  }
  return buildMockOnlineEligibilityConnectorResponse(payload, config.now);
}
