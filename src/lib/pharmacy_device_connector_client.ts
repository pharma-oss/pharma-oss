import {
  buildPharmacyDeviceIdempotencyKey,
  CURRENT_NSIPS_INTERFACE_VERSION,
  normalizePharmacyDeviceConnectorCapabilities,
  REQUIRED_PHARMACY_DEVICE_CAPABILITIES,
  type PharmacyDeviceConnectorKind,
  type PharmacyDeviceOperationInput,
  type PharmacyDeviceOperationResult,
  validatePharmacyDeviceOperationInput
} from './pharmacy_device_connector';

export interface PharmacyDeviceConnectorEnv {
  PHARMACY_DEVICE_CONNECTOR_MODE?: string;
  PHARMACY_DEVICE_CONNECTOR_ENDPOINT?: string;
  PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN?: string;
  PHARMACY_DEVICE_CONNECTOR_TIMEOUT_MS?: string;
  PHARMACY_DEVICE_CONNECTOR_KIND?: string;
  PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION?: string;
  PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY?: string;
  PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED?: string;
  PHARMACY_DEVICE_CONNECTOR_CAPABILITIES?: string;
  PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_OUTCOME?: string;
}

export interface PharmacyDeviceConnectorClientOptions {
  env?: PharmacyDeviceConnectorEnv;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 8_000;

function getEnv(env?: PharmacyDeviceConnectorEnv): PharmacyDeviceConnectorEnv {
  if (env) return env;
  return {
    PHARMACY_DEVICE_CONNECTOR_MODE: process.env.PHARMACY_DEVICE_CONNECTOR_MODE,
    PHARMACY_DEVICE_CONNECTOR_ENDPOINT: process.env.PHARMACY_DEVICE_CONNECTOR_ENDPOINT,
    PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN: process.env.PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN,
    PHARMACY_DEVICE_CONNECTOR_TIMEOUT_MS: process.env.PHARMACY_DEVICE_CONNECTOR_TIMEOUT_MS,
    PHARMACY_DEVICE_CONNECTOR_KIND: process.env.PHARMACY_DEVICE_CONNECTOR_KIND,
    PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION: process.env.PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION,
    PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY: process.env.PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY,
    PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED: process.env.PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED,
    PHARMACY_DEVICE_CONNECTOR_CAPABILITIES: process.env.PHARMACY_DEVICE_CONNECTOR_CAPABILITIES,
    PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_OUTCOME: process.env.PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_OUTCOME
  };
}

function isEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes(String(value || '').trim().toLowerCase());
}

function isAllowedFacilityEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host === '::1' || host.startsWith('127.')) return true;
    if (url.protocol !== 'https:') return false;
    if (host.endsWith('.local') || host.startsWith('10.') || host.startsWith('192.168.')) return true;
    const parts = host.split('.').map(Number);
    return parts.length === 4
      && parts.every(Number.isInteger)
      && parts[0] === 172
      && parts[1] >= 16
      && parts[1] <= 31;
  } catch {
    return false;
  }
}

function getTimeoutMs(env: PharmacyDeviceConnectorEnv): number {
  const parsed = Number(env.PHARMACY_DEVICE_CONNECTOR_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 1_000) return DEFAULT_TIMEOUT_MS;
  return Math.min(parsed, 30_000);
}

function getConnectorKind(value: string | undefined): PharmacyDeviceConnectorKind | null {
  const kind = String(value || '').trim().toLowerCase();
  return kind === 'nsips_gateway' || kind === 'vendor_api' ? kind : null;
}

function validateConfiguration(env: PharmacyDeviceConnectorEnv): string | null {
  if (String(env.PHARMACY_DEVICE_CONNECTOR_MODE || 'off').trim().toLowerCase() !== 'connector') {
    return '外部調剤機器コネクタは未設定です。';
  }
  const endpoint = env.PHARMACY_DEVICE_CONNECTOR_ENDPOINT?.trim();
  if (!endpoint || !isAllowedFacilityEndpoint(endpoint)) {
    return '患者情報を扱うため、同一端末またはHTTPSの施設内接続先を設定してください。';
  }
  if (!env.PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN?.trim()) {
    return '外部調剤機器コネクタの認証トークンを設定してください。';
  }
  if (!isEnabled(env.PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY)) {
    return '施設内だけで連携する確認が完了していません。';
  }
  const connectorKind = getConnectorKind(env.PHARMACY_DEVICE_CONNECTOR_KIND);
  if (!connectorKind) return '外部調剤機器コネクタの方式を設定してください。';
  if (!env.PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION?.trim()) {
    return '接続先との連携仕様版を設定してください。';
  }
  if (connectorKind === 'nsips_gateway' && !isEnabled(env.PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED)) {
    return 'NSIPS仕様の利用許諾確認が完了していません。';
  }
  if (
    connectorKind === 'nsips_gateway'
    && env.PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION?.trim() !== CURRENT_NSIPS_INTERFACE_VERSION
  ) {
    return `NSIPS連携仕様版を${CURRENT_NSIPS_INTERFACE_VERSION}へ更新してください。`;
  }
  const configuredCapabilities = normalizePharmacyDeviceConnectorCapabilities(
    env.PHARMACY_DEVICE_CONNECTOR_CAPABILITIES
  );
  if (REQUIRED_PHARMACY_DEVICE_CAPABILITIES.some((capability) => !configuredCapabilities.includes(capability))) {
    return '外部調剤機器コネクタの送信、差替、取消、重複防止、結果応答を確認してください。';
  }
  if (env.PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_OUTCOME?.trim().toLowerCase() !== 'success') {
    return '外部調剤機器コネクタの接続試行が成功していません。';
  }
  return null;
}

export async function submitPharmacyDeviceOperation(
  input: PharmacyDeviceOperationInput,
  options: PharmacyDeviceConnectorClientOptions = {}
): Promise<PharmacyDeviceOperationResult> {
  const validated = validatePharmacyDeviceOperationInput(input);
  if (!validated.ok) {
    return { status: 'invalid_request', message: validated.message };
  }

  const env = getEnv(options.env);
  const configurationError = validateConfiguration(env);
  if (configurationError) {
    return {
      status: 'unconfigured',
      operation: validated.input.operation,
      message: configurationError
    };
  }

  const connectorKind = getConnectorKind(env.PHARMACY_DEVICE_CONNECTOR_KIND) as PharmacyDeviceConnectorKind;
  const interfaceVersion = env.PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION!.trim();
  const idempotencyKey = await buildPharmacyDeviceIdempotencyKey(validated.input);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), getTimeoutMs(env));

  try {
    const response = await (options.fetchImpl || fetch)(env.PHARMACY_DEVICE_CONNECTOR_ENDPOINT!.trim(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Yakureki-Idempotency-Key': idempotencyKey,
        ...(env.PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN?.trim()
          ? { Authorization: `Bearer ${env.PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN.trim()}` }
          : {})
      },
      body: JSON.stringify({
        type: 'yakureki-pharmacy-device-handoff',
        schemaVersion: 1,
        connectorKind,
        interfaceVersion,
        idempotencyKey,
        ...validated.input
      }),
      signal: abortController.signal
    });
    if (!response.ok) {
      return {
        status: 'error',
        operation: validated.input.operation,
        message: `外部調剤機器コネクタがエラーを返しました（HTTP ${response.status}）。`
      };
    }

    const json = await response.json() as Record<string, unknown>;
    const outcome = String(json.outcome || json.status || '');
    if (outcome === 'rejected') {
      return {
        status: 'rejected',
        operation: validated.input.operation,
        message: typeof json.message === 'string' && json.message.trim()
          ? json.message.slice(0, 300)
          : '外部調剤機器コネクタが処方データを受け付けませんでした。'
      };
    }
    if (!['accepted', 'duplicate', 'cancelled'].includes(outcome)) {
      return {
        status: 'error',
        operation: validated.input.operation,
        message: '外部調剤機器コネクタの応答形式を確認してください。'
      };
    }
    const transferId = String(json.transferId || '').trim();
    if (!transferId || transferId.length > 100) {
      return {
        status: 'error',
        operation: validated.input.operation,
        message: '外部調剤機器コネクタの連携IDを確認してください。'
      };
    }

    return {
      status: 'success',
      operation: validated.input.operation,
      message: outcome === 'duplicate'
        ? '同じ処方データは送信済みです。重複送信は行いませんでした。'
        : outcome === 'cancelled'
          ? '外部調剤機器への連携を取り消しました。'
          : '外部調剤機器が処方データを受け付けました。',
      outcome: outcome as 'accepted' | 'duplicate' | 'cancelled',
      transferId,
      payloadHash: idempotencyKey,
      connectorKind,
      interfaceVersion,
      receivedAt: typeof json.receivedAt === 'string' && !Number.isNaN(new Date(json.receivedAt).getTime())
        ? new Date(json.receivedAt).toISOString()
        : new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      operation: validated.input.operation,
      message: error instanceof Error && error.name === 'AbortError'
        ? '外部調剤機器コネクタがタイムアウトしました。'
        : '外部調剤機器コネクタへ接続できませんでした。'
    };
  } finally {
    clearTimeout(timeout);
  }
}
