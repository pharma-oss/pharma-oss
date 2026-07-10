import { createHash } from 'node:crypto';

import {
  CURRENT_NSIPS_INTERFACE_VERSION,
  REQUIRED_PHARMACY_DEVICE_CAPABILITIES,
  normalizePharmacyDeviceConnectorCapabilities,
  type PharmacyDeviceConnectorCapability,
  type PharmacyDeviceConnectorKind
} from './pharmacy_device_connector';
import {
  REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES,
  normalizeElectronicPrescriptionConnectorCapabilities,
  normalizeElectronicPrescriptionConnectorKind as normalizeOfficialElectronicPrescriptionConnectorKind,
  type ElectronicPrescriptionConnectorCapability
} from './electronic_prescription';

export type ExternalConnectorStatus = 'ready' | 'demo' | 'attention' | 'blocked';
export type ExternalEndpointHostKind = 'localhost' | 'private_network' | 'external' | 'invalid' | 'none';
export type ExternalConnectorAttemptOutcome =
  | 'not_run'
  | 'success'
  | 'http_error'
  | 'auth_error'
  | 'timeout'
  | 'network_error'
  | 'invalid_response'
  | 'config_error';
export type ExternalConnectorResponseShape = 'json_object' | 'invalid_json' | 'empty' | 'unknown';
export type ElectronicPrescriptionConnectorKind = 'qualification_terminal' | 'web_api' | 'unspecified' | 'invalid';
export type ElectronicPrescriptionSharedFolderMode =
  | 'unspecified'
  | 'not_applicable'
  | 'polling'
  | 'watcher'
  | 'invalid';

export interface ExternalConnectorSanitizedConfig {
  mode: string;
  mockFallbackAllowed: boolean;
  endpointConfigured: boolean;
  endpointProtocol?: 'http' | 'https';
  endpointHostKind: ExternalEndpointHostKind;
  bearerTokenConfigured?: boolean;
  timeoutMs: number;
  timeoutValid: boolean;
}

export interface ExternalConnectorReadinessCheck {
  id: 'myna_card_reader' | 'online_eligibility' | 'electronic_prescription' | 'pharmacy_device';
  label: string;
  status: ExternalConnectorStatus;
  statusLabel: string;
  config: ExternalConnectorSanitizedConfig;
  lastAttempt: ExternalConnectorLastAttemptReport;
  electronicPrescription?: {
    connectorKind: ElectronicPrescriptionConnectorKind;
    connectorArtifactVerificationId?: string;
    configuredCapabilities: ElectronicPrescriptionConnectorCapability[];
    missingCapabilities: ElectronicPrescriptionConnectorCapability[];
    csvMaxBytes?: number;
    requiredDisplayItems: {
      configured: string[];
      missing: string[];
    };
    sharedFolder: {
      mode: ElectronicPrescriptionSharedFolderMode;
      pollIntervalMs?: number;
      staleAfterMs?: number;
      maxPendingFiles?: number;
      performanceP95Ms?: number;
      retryPolicyConfirmed: boolean;
    };
  };
  pharmacyDevice?: {
    connectorKind: PharmacyDeviceConnectorKind | 'unspecified' | 'invalid';
    interfaceVersion?: string;
    facilityLocalOnlyConfirmed: boolean;
    nsipsLicenseConfirmed: boolean;
    configuredCapabilities: PharmacyDeviceConnectorCapability[];
    missingCapabilities: PharmacyDeviceConnectorCapability[];
  };
  evidence: string[];
  requiredActions: string[];
}

export interface ExternalConnectorReadinessReport {
  type: 'yakureki-external-connector-readiness';
  schemaVersion: 9;
  generatedAt: string;
  overallStatus: ExternalConnectorStatus;
  privacy: {
    containsEndpointUrl: false;
    containsBearerToken: false;
    omittedData: string[];
  };
  checks: ExternalConnectorReadinessCheck[];
}

export interface ExternalConnectorLastAttemptInput {
  outcome?: ExternalConnectorAttemptOutcome;
  attemptedAt?: Date | string;
  statusCode?: number;
  durationMs?: number;
  responseShape?: ExternalConnectorResponseShape;
  errorCode?: string;
}

export interface ExternalConnectorLastAttemptReport {
  attemptRecorded: boolean;
  outcome: ExternalConnectorAttemptOutcome;
  outcomeLabel: string;
  attemptedAt?: string;
  statusCodeClass?: '2xx' | '3xx' | '4xx' | '5xx' | 'other';
  durationMs?: number;
  durationStatus: 'ok' | 'slow' | 'unknown';
  responseShape: ExternalConnectorResponseShape;
  errorCode?: string;
  privacy: {
    containsRequestBody: false;
    containsResponseBody: false;
    containsEndpointUrl: false;
    containsBearerToken: false;
  };
}

export interface MynaCardReaderReadinessInput {
  mode?: string;
  endpoint?: string;
  allowMockFallback?: boolean;
  timeoutMs?: number;
  lastAttempt?: ExternalConnectorLastAttemptInput;
}

export interface OnlineEligibilityReadinessInput {
  mode?: string;
  endpoint?: string;
  allowMockFallback?: boolean;
  bearerToken?: string;
  timeoutMs?: number;
  lastAttempt?: ExternalConnectorLastAttemptInput;
}

export interface ElectronicPrescriptionReadinessInput {
  mode?: string;
  endpoint?: string;
  bearerToken?: string;
  timeoutMs?: number;
  connectorKind?: string;
  connectorArtifactSha256?: string;
  capabilities?: string | string[];
  csvMaxBytes?: number;
  requiredDisplayItems?: string | string[];
  sharedFolderMode?: string;
  sharedFolderPollIntervalMs?: number;
  sharedFolderStaleAfterMs?: number;
  sharedFolderMaxPendingFiles?: number;
  sharedFolderPerformanceP95Ms?: number;
  sharedFolderRetryPolicyConfirmed?: boolean;
  lastAttemptEndpointSha256?: string;
  lastAttemptAuthSha256?: string;
  lastAttemptConnectorKind?: string;
  lastAttemptConnectorArtifactSha256?: string;
  lastAttemptCapabilities?: string | string[];
  lastAttempt?: ExternalConnectorLastAttemptInput;
}

export interface PharmacyDeviceReadinessInput {
  mode?: string;
  endpoint?: string;
  bearerToken?: string;
  timeoutMs?: number;
  connectorKind?: string;
  interfaceVersion?: string;
  facilityLocalOnlyConfirmed?: boolean;
  nsipsLicenseConfirmed?: boolean;
  capabilities?: string | string[];
  lastAttempt?: ExternalConnectorLastAttemptInput;
}

export interface ExternalConnectorReadinessInput {
  generatedAt?: Date;
  mynaCardReader?: MynaCardReaderReadinessInput;
  onlineEligibility?: OnlineEligibilityReadinessInput;
  electronicPrescription?: ElectronicPrescriptionReadinessInput;
  pharmacyDevice?: PharmacyDeviceReadinessInput;
}

const STATUS_LABELS: Record<ExternalConnectorStatus, string> = {
  ready: '設定OK',
  demo: 'デモ運用',
  attention: '要確認',
  blocked: '未設定'
};
const REQUIRED_ELECTRONIC_PRESCRIPTION_DISPLAY_ITEMS = [
  'prescription_id',
  'exchange_number',
  'patient_birth_date',
  'provider',
  'doctor',
  'issued_at',
  'valid_until',
  'document_kind',
  'signature_status',
  'duplicate_check_status',
  'drug_code',
  'drug_name',
  'amount',
  'unit',
  'usage',
  'days',
  'unit_conversion',
  'usage_supplement',
  'prescription_comment',
  'laboratory_result',
  'narcotic_administration'
];
const MAX_ELECTRONIC_PRESCRIPTION_CSV_BYTES = 10 * 1024 * 1024;
const ELECTRONIC_PRESCRIPTION_PREFLIGHT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const ELECTRONIC_PRESCRIPTION_PREFLIGHT_FUTURE_SKEW_MS = 5 * 60 * 1000;
const ATTEMPT_OUTCOME_LABELS: Record<ExternalConnectorAttemptOutcome, string> = {
  not_run: '未実行',
  success: '成功',
  http_error: 'HTTPエラー',
  auth_error: '認証エラー',
  timeout: 'タイムアウト',
  network_error: '接続エラー',
  invalid_response: '応答形式エラー',
  config_error: '設定エラー'
};
function hasText(value: unknown): boolean {
  return String(value ?? '').trim().length > 0;
}

function normalizeMode(value: unknown, allowed: string[], fallback: string): string {
  const mode = String(value ?? fallback).trim() || fallback;
  return allowed.includes(mode) ? mode : 'invalid';
}

function normalizeTimeout(value: unknown): { timeoutMs: number; timeoutValid: boolean } {
  if (value === undefined || value === null || value === '') {
    return { timeoutMs: 8000, timeoutValid: true };
  }
  const timeoutMs = Number(value);
  return {
    timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 0,
    timeoutValid: Number.isFinite(timeoutMs) && timeoutMs >= 1000 && timeoutMs <= 60000
  };
}

function getPrivateNetworkKind(hostname: string): ExternalEndpointHostKind {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host === '::1' || host.startsWith('127.')) return 'localhost';
  if (host.endsWith('.local')) return 'private_network';
  if (host.startsWith('10.') || host.startsWith('192.168.')) return 'private_network';
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return 'private_network';
  }
  return 'external';
}

function summarizeEndpoint(endpoint?: string): Pick<ExternalConnectorSanitizedConfig, 'endpointConfigured' | 'endpointProtocol' | 'endpointHostKind'> {
  const value = endpoint?.trim();
  if (!value) {
    return {
      endpointConfigured: false,
      endpointHostKind: 'none'
    };
  }

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        endpointConfigured: true,
        endpointHostKind: 'invalid'
      };
    }
    return {
      endpointConfigured: true,
      endpointProtocol: url.protocol === 'https:' ? 'https' : 'http',
      endpointHostKind: getPrivateNetworkKind(url.hostname)
    };
  } catch {
    return {
      endpointConfigured: true,
      endpointHostKind: 'invalid'
    };
  }
}

function hashEndpoint(endpoint: unknown): string | undefined {
  if (typeof endpoint !== 'string' || !endpoint.trim()) return undefined;
  try {
    const url = new URL(endpoint.trim());
    return createHash('sha256').update(url.href).digest('hex');
  } catch {
    return undefined;
  }
}

function hashBearerToken(token: unknown): string | undefined {
  if (typeof token !== 'string' || !token.trim()) return undefined;
  return createHash('sha256')
    .update(`yakureki-electronic-prescription-auth\0${token.trim()}`)
    .digest('hex');
}

function normalizeSha256(value: unknown): string | undefined {
  const text = String(value ?? '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : undefined;
}

function buildConnectorArtifactVerificationId(sha256: string | undefined): string | undefined {
  if (!sha256) return undefined;
  return createHash('sha256')
    .update(`yakureki-electronic-prescription-connector-artifact\0${sha256}`)
    .digest('hex');
}

function buildConfig(
  mode: string,
  endpoint: string | undefined,
  timeoutMs: number | undefined,
  bearerToken?: string,
  allowMockFallback = true
): ExternalConnectorSanitizedConfig {
  const timeout = normalizeTimeout(timeoutMs);
  return {
    mode,
    mockFallbackAllowed: allowMockFallback,
    ...summarizeEndpoint(endpoint),
    ...(bearerToken !== undefined ? { bearerTokenConfigured: hasText(bearerToken) } : {}),
    timeoutMs: timeout.timeoutMs,
    timeoutValid: timeout.timeoutValid
  };
}

function checkStatusLabel(status: ExternalConnectorStatus): string {
  return STATUS_LABELS[status];
}

function normalizeAttemptOutcome(value: unknown): ExternalConnectorAttemptOutcome {
  const outcome = String(value ?? 'not_run').trim();
  return Object.prototype.hasOwnProperty.call(ATTEMPT_OUTCOME_LABELS, outcome)
    ? outcome as ExternalConnectorAttemptOutcome
    : 'config_error';
}

function normalizeResponseShape(value: unknown): ExternalConnectorResponseShape {
  const shape = String(value ?? 'unknown').trim();
  return ['json_object', 'invalid_json', 'empty', 'unknown'].includes(shape)
    ? shape as ExternalConnectorResponseShape
    : 'unknown';
}

function normalizeAttemptedAt(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeElectronicPrescriptionConnectorKind(value: unknown): ElectronicPrescriptionConnectorKind {
  if (!String(value ?? '').trim()) return 'unspecified';
  return normalizeOfficialElectronicPrescriptionConnectorKind(value) || 'invalid';
}

function normalizeElectronicPrescriptionSharedFolderMode(value: unknown): ElectronicPrescriptionSharedFolderMode {
  const mode = String(value ?? '').trim().toLowerCase();
  if (!mode) return 'unspecified';
  if (mode === 'none' || mode === 'off' || mode === 'not_applicable' || mode === 'n/a') return 'not_applicable';
  if (mode === 'polling' || mode === 'poll') return 'polling';
  if (mode === 'watcher' || mode === 'watch' || mode === 'fs_watch') return 'watcher';
  return 'invalid';
}

function normalizeDelimitedIdentifiers(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(values
    .map((item) => item.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''))
    .filter(Boolean)));
}

function normalizePositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
}

function normalizePharmacyDeviceConnectorKind(
  value: unknown
): PharmacyDeviceConnectorKind | 'unspecified' | 'invalid' {
  const kind = String(value ?? '').trim().toLowerCase();
  if (!kind) return 'unspecified';
  if (kind === 'nsips_gateway' || kind === 'vendor_api') return kind;
  return 'invalid';
}

function getStatusCodeClass(statusCode: number | undefined): ExternalConnectorLastAttemptReport['statusCodeClass'] {
  if (!Number.isInteger(statusCode)) return undefined;
  const code = statusCode as number;
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500 && code < 600) return '5xx';
  return 'other';
}

function buildLastAttemptReport(input: ExternalConnectorLastAttemptInput | undefined): ExternalConnectorLastAttemptReport {
  const outcome = normalizeAttemptOutcome(input?.outcome);
  const durationMs = Number(input?.durationMs);
  const normalizedDurationMs = Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : undefined;
  return {
    attemptRecorded: outcome !== 'not_run',
    outcome,
    outcomeLabel: ATTEMPT_OUTCOME_LABELS[outcome],
    attemptedAt: normalizeAttemptedAt(input?.attemptedAt),
    statusCodeClass: getStatusCodeClass(input?.statusCode),
    durationMs: normalizedDurationMs,
    durationStatus: normalizedDurationMs === undefined ? 'unknown' : normalizedDurationMs > 5000 ? 'slow' : 'ok',
    responseShape: normalizeResponseShape(input?.responseShape),
    errorCode: hasText(input?.errorCode) ? String(input?.errorCode).slice(0, 80) : undefined,
    privacy: {
      containsRequestBody: false,
      containsResponseBody: false,
      containsEndpointUrl: false,
      containsBearerToken: false
    }
  };
}

function applyLastAttemptToStatus(
  status: ExternalConnectorStatus,
  config: ExternalConnectorSanitizedConfig,
  lastAttempt: ExternalConnectorLastAttemptReport,
  evidence: string[],
  requiredActions: string[],
  envPrefix: 'MYNA_CARD_READER' | 'ONLINE_ELIGIBILITY' | 'ELECTRONIC_PRESCRIPTION' | 'PHARMACY_DEVICE_CONNECTOR'
): ExternalConnectorStatus {
  if (!config.endpointConfigured || config.endpointHostKind === 'invalid') return status;
  if (status === 'blocked') return status;

  if (!lastAttempt.attemptRecorded) {
    requiredActions.push(`${envPrefix}_LAST_ATTEMPT_OUTCOME に直近の接続試行結果を記録する`);
    return status === 'ready' ? 'attention' : status;
  }

  if (lastAttempt.outcome === 'success') {
    evidence.push('直近の接続試行は成功として記録されています');
    if (lastAttempt.responseShape === 'invalid_json' || lastAttempt.responseShape === 'empty') {
      requiredActions.push('接続先の応答がJSONオブジェクトとして正規化できるか確認する');
      return 'attention';
    }
    return status;
  }

  if (lastAttempt.outcome === 'auth_error') {
    requiredActions.push(`${envPrefix} の認証方式、認証トークン、証明書設定を確認する`);
    return 'blocked';
  }

  if (lastAttempt.outcome === 'timeout') {
    requiredActions.push(`${envPrefix}_TIMEOUT_MS と接続先サービスの応答時間を確認して再実行する`);
  } else if (lastAttempt.outcome === 'http_error') {
    requiredActions.push('接続先サービスのHTTPステータスとメンテナンス状況を確認して再実行する');
  } else if (lastAttempt.outcome === 'invalid_response') {
    requiredActions.push('接続先の応答JSON形式とpharma-ossの正規化マッピングを確認する');
  } else {
    requiredActions.push('接続先サービス、ネットワーク、端末側ブリッジを確認して再実行する');
  }
  return 'attention';
}

function applyElectronicPrescriptionPreflightFreshness(
  status: ExternalConnectorStatus,
  lastAttempt: ExternalConnectorLastAttemptReport,
  evidence: string[],
  requiredActions: string[]
): ExternalConnectorStatus {
  if (lastAttempt.outcome !== 'success') return status;
  if (!lastAttempt.attemptedAt) {
    requiredActions.push('ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT に患者情報なしpreflightのISO実行日時を記録する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  const attemptedAt = new Date(lastAttempt.attemptedAt);
  const ageMs = Date.now() - attemptedAt.getTime();
  if (Number.isNaN(attemptedAt.getTime())) {
    requiredActions.push('ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT をISO日時で記録する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  if (ageMs > ELECTRONIC_PRESCRIPTION_PREFLIGHT_MAX_AGE_MS) {
    requiredActions.push('電子処方箋の患者情報なしpreflightを24時間以内に再実行する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  if (ageMs < -ELECTRONIC_PRESCRIPTION_PREFLIGHT_FUTURE_SKEW_MS) {
    requiredActions.push('ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT と端末時刻のずれを確認する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  evidence.push('患者情報なしpreflightは24時間以内に成功しています');
  return status;
}

function applyElectronicPrescriptionPreflightMetadata(
  status: ExternalConnectorStatus,
  lastAttempt: ExternalConnectorLastAttemptReport,
  endpoint: string | undefined,
  bearerToken: string | undefined,
  connectorKind: ElectronicPrescriptionConnectorKind,
  connectorArtifactSha256: string | undefined,
  lastAttemptEndpointSha256: string | undefined,
  lastAttemptAuthSha256: string | undefined,
  lastAttemptConnectorKind: string | undefined,
  lastAttemptConnectorArtifactSha256: string | undefined,
  lastAttemptCapabilities: string | string[] | undefined,
  evidence: string[],
  requiredActions: string[]
): ExternalConnectorStatus {
  if (lastAttempt.outcome !== 'success') return status;
  if (connectorKind === 'unspecified' || connectorKind === 'invalid') return status;
  const endpointSha256 = hashEndpoint(endpoint);
  const preflightEndpointSha256 = String(lastAttemptEndpointSha256 || '').trim().toLowerCase();
  if (!preflightEndpointSha256) {
    requiredActions.push('ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256 にpreflight時の接続先照合値を記録する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  if (!endpointSha256 || preflightEndpointSha256 !== endpointSha256) {
    requiredActions.push('電子処方箋の患者情報なしpreflightを現在の接続先で再実行する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  const authSha256 = hashBearerToken(bearerToken);
  const preflightAuthSha256 = String(lastAttemptAuthSha256 || '').trim().toLowerCase();
  if (!preflightAuthSha256) {
    requiredActions.push('ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256 にpreflight時の認証照合値を記録する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  if (!authSha256 || preflightAuthSha256 !== authSha256) {
    requiredActions.push('電子処方箋の患者情報なしpreflightを現在の認証情報で再実行する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  if (!connectorArtifactSha256) return status === 'blocked' ? 'blocked' : 'attention';
  const preflightConnectorArtifactSha256 = normalizeSha256(lastAttemptConnectorArtifactSha256);
  if (!preflightConnectorArtifactSha256) {
    requiredActions.push('ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256 にpreflight時の接続モジュール成果物照合値を記録する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  if (preflightConnectorArtifactSha256 !== connectorArtifactSha256) {
    requiredActions.push('電子処方箋の患者情報なしpreflightを現在の接続モジュール成果物で再実行する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  const preflightConnectorKind = normalizeElectronicPrescriptionConnectorKind(lastAttemptConnectorKind);
  if (preflightConnectorKind === 'unspecified') {
    requiredActions.push('ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND にpreflight時の接続方式を記録する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  if (preflightConnectorKind === 'invalid' || preflightConnectorKind !== connectorKind) {
    requiredActions.push('電子処方箋の患者情報なしpreflightを現在の接続方式で再実行する');
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  const preflightCapabilities = normalizeElectronicPrescriptionConnectorCapabilities(lastAttemptCapabilities);
  const missingPreflightCapabilities = REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES.filter(
    (capability) => !preflightCapabilities.includes(capability)
  );
  if (missingPreflightCapabilities.length > 0) {
    requiredActions.push(`ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES に不足があります: ${missingPreflightCapabilities.join(', ')}`);
    return status === 'blocked' ? 'blocked' : 'attention';
  }
  evidence.push('preflight時の接続先・認証・成果物・接続方式と必須機能は現在設定と一致しています');
  return status;
}

export function buildMynaCardReaderReadiness(input: MynaCardReaderReadinessInput = {}): ExternalConnectorReadinessCheck {
  const mode = normalizeMode(input.mode, ['auto', 'bridge', 'mock'], 'auto');
  const config = buildConfig(mode, input.endpoint, input.timeoutMs, undefined, input.allowMockFallback !== false);
  const evidence: string[] = [];
  const requiredActions: string[] = [];
  let status: ExternalConnectorStatus = 'ready';
  const lastAttempt = buildLastAttemptReport(input.lastAttempt);

  if (mode === 'invalid') {
    status = 'blocked';
    requiredActions.push('MYNA_CARD_READER_MODE を auto / bridge / mock のいずれかに直す');
  } else if (mode === 'mock') {
    if (config.mockFallbackAllowed) {
      status = 'demo';
      evidence.push('デモ用のマイナ読取データを返す設定です');
      requiredActions.push('本番前にカードリーダー連携サービスの接続先を設定する');
    } else {
      status = 'blocked';
      evidence.push('デモ用のマイナ読取は明示許可されていません');
      requiredActions.push('MYNA_CARD_READER_ENDPOINT にカードリーダー連携サービスのURLを設定する');
      requiredActions.push('デモ運用として起動する場合は MYNA_CARD_READER_ALLOW_MOCK=true を明示する');
    }
  } else if (!config.endpointConfigured) {
    status = mode === 'bridge' || !config.mockFallbackAllowed ? 'blocked' : 'demo';
    evidence.push('カードリーダー連携サービスの接続先は未設定です');
    requiredActions.push('MYNA_CARD_READER_ENDPOINT にカードリーダー連携サービスのURLを設定する');
    if (mode === 'auto' && !config.mockFallbackAllowed) {
      evidence.push('デモ用のマイナ読取フォールバックは明示許可されていません');
      requiredActions.push('デモ運用として起動する場合は MYNA_CARD_READER_ALLOW_MOCK=true を明示する');
    }
  } else if (config.endpointHostKind === 'invalid') {
    status = 'blocked';
    requiredActions.push('MYNA_CARD_READER_ENDPOINT を http または https のURLに直す');
  } else {
    evidence.push('カードリーダー連携サービスの接続先が設定されています');
  }

  if (!config.timeoutValid) {
    status = status === 'blocked' ? 'blocked' : 'attention';
    requiredActions.push('MYNA_CARD_READER_TIMEOUT_MS を 1000 から 60000 の範囲に直す');
  }
  status = applyLastAttemptToStatus(status, config, lastAttempt, evidence, requiredActions, 'MYNA_CARD_READER');

  return {
    id: 'myna_card_reader',
    label: 'マイナ読取',
    status,
    statusLabel: checkStatusLabel(status),
    config,
    lastAttempt,
    evidence,
    requiredActions
  };
}

export function buildOnlineEligibilityReadiness(input: OnlineEligibilityReadinessInput = {}): ExternalConnectorReadinessCheck {
  const mode = normalizeMode(input.mode, ['auto', 'external', 'mock'], 'auto');
  const config = buildConfig(mode, input.endpoint, input.timeoutMs, input.bearerToken ?? '', input.allowMockFallback !== false);
  const evidence: string[] = [];
  const requiredActions: string[] = [];
  let status: ExternalConnectorStatus = 'ready';
  const lastAttempt = buildLastAttemptReport(input.lastAttempt);

  if (mode === 'invalid') {
    status = 'blocked';
    requiredActions.push('ONLINE_ELIGIBILITY_MODE を auto / external / mock のいずれかに直す');
  } else if (mode === 'mock') {
    if (config.mockFallbackAllowed) {
      status = 'demo';
      evidence.push('デモ用の資格確認結果を返す設定です');
      requiredActions.push('本番前に資格確認サービスの接続先を設定する');
    } else {
      status = 'blocked';
      evidence.push('デモ用の資格確認は明示許可されていません');
      requiredActions.push('ONLINE_ELIGIBILITY_ENDPOINT に資格確認サービスのURLを設定する');
      requiredActions.push('デモ運用として起動する場合は ONLINE_ELIGIBILITY_ALLOW_MOCK=true を明示する');
    }
  } else if (!config.endpointConfigured) {
    status = mode === 'external' || !config.mockFallbackAllowed ? 'blocked' : 'demo';
    evidence.push('資格確認サービスの接続先は未設定です');
    requiredActions.push('ONLINE_ELIGIBILITY_ENDPOINT に資格確認サービスのURLを設定する');
    if (mode === 'auto' && !config.mockFallbackAllowed) {
      evidence.push('デモ用の資格確認フォールバックは明示許可されていません');
      requiredActions.push('デモ運用として起動する場合は ONLINE_ELIGIBILITY_ALLOW_MOCK=true を明示する');
    }
  } else if (config.endpointHostKind === 'invalid') {
    status = 'blocked';
    requiredActions.push('ONLINE_ELIGIBILITY_ENDPOINT を http または https のURLに直す');
  } else {
    evidence.push('資格確認サービスの接続先が設定されています');
  }

  if (config.endpointConfigured && config.endpointHostKind !== 'invalid' && !config.bearerTokenConfigured) {
    status = status === 'blocked' ? 'blocked' : 'attention';
    requiredActions.push('ONLINE_ELIGIBILITY_BEARER_TOKEN に認証トークンを設定する');
  }

  if (!config.timeoutValid) {
    status = status === 'blocked' ? 'blocked' : 'attention';
    requiredActions.push('ONLINE_ELIGIBILITY_TIMEOUT_MS を 1000 から 60000 の範囲に直す');
  }
  status = applyLastAttemptToStatus(status, config, lastAttempt, evidence, requiredActions, 'ONLINE_ELIGIBILITY');

  return {
    id: 'online_eligibility',
    label: 'オンライン資格確認',
    status,
    statusLabel: checkStatusLabel(status),
    config,
    lastAttempt,
    evidence,
    requiredActions
  };
}

export function buildElectronicPrescriptionReadiness(input: ElectronicPrescriptionReadinessInput = {}): ExternalConnectorReadinessCheck {
  const mode = normalizeMode(input.mode, ['off', 'connector', 'bridge', 'demo'], 'off');
  const config = buildConfig(mode, input.endpoint, input.timeoutMs, input.bearerToken ?? '', mode === 'demo');
  const connectorKind = normalizeElectronicPrescriptionConnectorKind(input.connectorKind);
  const connectorArtifactSha256 = normalizeSha256(input.connectorArtifactSha256);
  const configuredCapabilities = normalizeElectronicPrescriptionConnectorCapabilities(input.capabilities);
  const missingCapabilities = REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES.filter(
    (capability) => !configuredCapabilities.includes(capability)
  );
  const csvMaxBytes = normalizePositiveInteger(input.csvMaxBytes);
  const configuredDisplayItems = normalizeDelimitedIdentifiers(input.requiredDisplayItems);
  const missingDisplayItems = REQUIRED_ELECTRONIC_PRESCRIPTION_DISPLAY_ITEMS.filter(
    (item) => !configuredDisplayItems.includes(item)
  );
  const sharedFolderMode = normalizeElectronicPrescriptionSharedFolderMode(input.sharedFolderMode);
  const sharedFolderPollIntervalMs = normalizePositiveInteger(input.sharedFolderPollIntervalMs);
  const sharedFolderStaleAfterMs = normalizePositiveInteger(input.sharedFolderStaleAfterMs);
  const sharedFolderMaxPendingFiles = normalizePositiveInteger(input.sharedFolderMaxPendingFiles);
  const sharedFolderPerformanceP95Ms = normalizePositiveInteger(input.sharedFolderPerformanceP95Ms);
  const sharedFolderRetryPolicyConfirmed = input.sharedFolderRetryPolicyConfirmed === true;
  const evidence: string[] = [];
  const requiredActions: string[] = [];
  let status: ExternalConnectorStatus = 'ready';
  const lastAttempt = buildLastAttemptReport(input.lastAttempt);

  if (mode === 'invalid') {
    status = 'blocked';
    requiredActions.push('ELECTRONIC_PRESCRIPTION_MODE を off / connector / demo のいずれかに直す');
  } else if (mode === 'off') {
    status = 'blocked';
    evidence.push('電子処方箋管理サービス連携は無効です');
    requiredActions.push('本番前に ELECTRONIC_PRESCRIPTION_MODE=connector を設定する');
    requiredActions.push('ELECTRONIC_PRESCRIPTION_ENDPOINT にpharma-oss接続モジュールのURLを設定する');
  } else if (mode === 'demo') {
    status = 'demo';
    evidence.push('デモ用の電子処方箋応答を返す設定です');
    requiredActions.push('本番前にpharma-ossの電子処方箋接続モジュールを設定する');
  } else if (!config.endpointConfigured) {
    status = 'blocked';
    evidence.push('yakureki電子処方箋接続モジュールの接続先は未設定です');
    requiredActions.push('ELECTRONIC_PRESCRIPTION_ENDPOINT に接続モジュールのURLを設定する');
  } else if (config.endpointHostKind === 'invalid') {
    status = 'blocked';
    requiredActions.push('ELECTRONIC_PRESCRIPTION_ENDPOINT を http または https のURLに直す');
  } else if (config.endpointProtocol === 'http' && config.endpointHostKind !== 'localhost') {
    status = 'blocked';
    requiredActions.push('患者情報を送る接続先はhttpsにする。同一端末のlocalhostだけhttpを許可する');
  } else {
    evidence.push('yakureki電子処方箋接続モジュールの接続先が設定されています');
  }

  if (mode === 'bridge') {
    status = status === 'blocked' ? 'blocked' : 'attention';
    evidence.push('旧 bridge モードを互換動作で使用しています');
    requiredActions.push('ELECTRONIC_PRESCRIPTION_MODE=connector へ設定名を移行する');
  }
  if (mode === 'connector' || mode === 'bridge') {
    if (connectorKind === 'unspecified') {
      status = status === 'blocked' ? 'blocked' : 'attention';
      requiredActions.push('ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND に qualification_terminal または web_api を設定する');
    } else if (connectorKind === 'invalid') {
      status = 'blocked';
      requiredActions.push('ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND を qualification_terminal または web_api に直す');
    } else {
      evidence.push(`公式接続方式: ${connectorKind === 'qualification_terminal' ? '資格確認端末経由' : 'Web API'}`);
    }
    if (missingCapabilities.length > 0) {
      status = status === 'blocked' ? 'blocked' : 'attention';
      requiredActions.push(`未確認の必須機能を接続モジュールへ実装する: ${missingCapabilities.join(', ')}`);
    } else {
      evidence.push('薬局レセコン向け必須機能を接続モジュールが申告しています');
    }
    if (!csvMaxBytes) {
      status = status === 'blocked' ? 'blocked' : 'attention';
      requiredActions.push('ELECTRONIC_PRESCRIPTION_CSV_MAX_BYTES に接続モジュールで検証済みのCSV最大バイト数を設定する');
    } else if (csvMaxBytes > MAX_ELECTRONIC_PRESCRIPTION_CSV_BYTES) {
      status = status === 'blocked' ? 'blocked' : 'attention';
      requiredActions.push(`ELECTRONIC_PRESCRIPTION_CSV_MAX_BYTES は ${MAX_ELECTRONIC_PRESCRIPTION_CSV_BYTES} バイト以下で運用上限を確認する`);
    } else {
      evidence.push(`CSV最大バイト数の運用上限: ${csvMaxBytes}`);
    }
    if (missingDisplayItems.length > 0) {
      status = status === 'blocked' ? 'blocked' : 'attention';
      requiredActions.push(`電子処方箋受付の必須表示項目を接続モジュールで申告する: ${missingDisplayItems.join(', ')}`);
    } else {
      evidence.push('電子処方箋受付の必須表示項目を接続モジュールが申告しています');
    }
    if (sharedFolderMode === 'invalid') {
      status = 'blocked';
      requiredActions.push('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MODE を not_applicable / polling / watcher のいずれかに直す');
    } else if (sharedFolderMode === 'unspecified') {
      status = status === 'blocked' ? 'blocked' : 'attention';
      requiredActions.push('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MODE に共有フォルダ連携の有無と方式を設定する');
    } else if (sharedFolderMode === 'not_applicable') {
      evidence.push('共有フォルダ連携は対象外として申告されています');
    } else {
      evidence.push(`共有フォルダ連携方式: ${sharedFolderMode}`);
      if (!sharedFolderPollIntervalMs || sharedFolderPollIntervalMs < 1000 || sharedFolderPollIntervalMs > 60000) {
        status = status === 'blocked' ? 'blocked' : 'attention';
        requiredActions.push('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_POLL_INTERVAL_MS を 1000 から 60000 の範囲で設定する');
      }
      if (!sharedFolderStaleAfterMs || sharedFolderStaleAfterMs < 30000 || sharedFolderStaleAfterMs > 3600000) {
        status = status === 'blocked' ? 'blocked' : 'attention';
        requiredActions.push('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_STALE_AFTER_MS を 30000 から 3600000 の範囲で設定する');
      }
      if (!sharedFolderMaxPendingFiles || sharedFolderMaxPendingFiles < 1 || sharedFolderMaxPendingFiles > 1000) {
        status = status === 'blocked' ? 'blocked' : 'attention';
        requiredActions.push('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MAX_PENDING_FILES を 1 から 1000 の範囲で設定する');
      }
      if (!sharedFolderPerformanceP95Ms || sharedFolderPerformanceP95Ms > 5000) {
        status = status === 'blocked' ? 'blocked' : 'attention';
        requiredActions.push('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_PERFORMANCE_P95_MS を5000ms以下の実測値で設定する');
      }
      if (!sharedFolderRetryPolicyConfirmed) {
        status = status === 'blocked' ? 'blocked' : 'attention';
        requiredActions.push('ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_RETRY_POLICY_CONFIRMED=true で滞留・再送・二重取込防止を確認する');
      }
    }
    if (!config.bearerTokenConfigured) {
      status = status === 'blocked' ? 'blocked' : 'attention';
      requiredActions.push('ELECTRONIC_PRESCRIPTION_BEARER_TOKEN に認証トークンを設定する');
    } else {
      evidence.push('接続モジュールの認証トークンが設定されています');
    }
    if (!connectorArtifactSha256) {
      status = status === 'blocked' ? 'blocked' : 'attention';
      requiredActions.push('ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256 に接続モジュール配布物のSHA-256を設定する');
    } else {
      evidence.push('接続モジュール成果物SHA-256が設定されています');
    }
  }

  if (!config.timeoutValid) {
    status = status === 'blocked' ? 'blocked' : 'attention';
    requiredActions.push('ELECTRONIC_PRESCRIPTION_TIMEOUT_MS を 1000 から 60000 の範囲に直す');
  }
  status = applyLastAttemptToStatus(status, config, lastAttempt, evidence, requiredActions, 'ELECTRONIC_PRESCRIPTION');
  status = applyElectronicPrescriptionPreflightFreshness(status, lastAttempt, evidence, requiredActions);
  status = applyElectronicPrescriptionPreflightMetadata(
    status,
    lastAttempt,
    input.endpoint,
    input.bearerToken,
    connectorKind,
    connectorArtifactSha256,
    input.lastAttemptEndpointSha256,
    input.lastAttemptAuthSha256,
    input.lastAttemptConnectorKind,
    input.lastAttemptConnectorArtifactSha256,
    input.lastAttemptCapabilities,
    evidence,
    requiredActions
  );

  return {
    id: 'electronic_prescription',
    label: '電子処方箋',
    status,
    statusLabel: checkStatusLabel(status),
    config,
    lastAttempt,
    electronicPrescription: {
      connectorKind,
      ...(connectorArtifactSha256 ? {
        connectorArtifactVerificationId: buildConnectorArtifactVerificationId(connectorArtifactSha256)
      } : {}),
      configuredCapabilities,
      missingCapabilities,
      ...(csvMaxBytes ? { csvMaxBytes } : {}),
      requiredDisplayItems: {
        configured: configuredDisplayItems,
        missing: missingDisplayItems
      },
      sharedFolder: {
        mode: sharedFolderMode,
        ...(sharedFolderPollIntervalMs ? { pollIntervalMs: sharedFolderPollIntervalMs } : {}),
        ...(sharedFolderStaleAfterMs ? { staleAfterMs: sharedFolderStaleAfterMs } : {}),
        ...(sharedFolderMaxPendingFiles ? { maxPendingFiles: sharedFolderMaxPendingFiles } : {}),
        ...(sharedFolderPerformanceP95Ms ? { performanceP95Ms: sharedFolderPerformanceP95Ms } : {}),
        retryPolicyConfirmed: sharedFolderRetryPolicyConfirmed
      }
    },
    evidence,
    requiredActions
  };
}

export function buildPharmacyDeviceReadiness(
  input: PharmacyDeviceReadinessInput = {}
): ExternalConnectorReadinessCheck {
  const mode = normalizeMode(input.mode, ['off', 'connector'], 'off');
  const config = buildConfig(mode, input.endpoint, input.timeoutMs, input.bearerToken ?? '', false);
  const connectorKind = normalizePharmacyDeviceConnectorKind(input.connectorKind);
  const interfaceVersion = String(input.interfaceVersion || '').trim().slice(0, 50) || undefined;
  const facilityLocalOnlyConfirmed = input.facilityLocalOnlyConfirmed === true;
  const nsipsLicenseConfirmed = input.nsipsLicenseConfirmed === true;
  const configuredCapabilities = normalizePharmacyDeviceConnectorCapabilities(input.capabilities);
  const missingCapabilities = REQUIRED_PHARMACY_DEVICE_CAPABILITIES.filter(
    (capability) => !configuredCapabilities.includes(capability)
  );
  const evidence: string[] = [];
  const requiredActions: string[] = [];
  const lastAttempt = buildLastAttemptReport(input.lastAttempt);
  let status: ExternalConnectorStatus = 'ready';

  if (mode === 'invalid') {
    status = 'blocked';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_MODE を off または connector に直す');
  } else if (mode === 'off') {
    status = 'blocked';
    evidence.push('外部調剤機器への処方連携は無効です');
    requiredActions.push('本番前に PHARMACY_DEVICE_CONNECTOR_MODE=connector を設定する');
  } else if (!config.endpointConfigured) {
    status = 'blocked';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_ENDPOINT に施設内コネクタのURLを設定する');
  } else if (config.endpointHostKind === 'invalid') {
    status = 'blocked';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_ENDPOINT を http または https のURLに直す');
  } else if (!['localhost', 'private_network'].includes(config.endpointHostKind)) {
    status = 'blocked';
    evidence.push('接続先が施設内ネットワークとして確認できません');
    requiredActions.push('患者情報を施設外へ送らない施設内コネクタURLへ変更する');
  } else {
    evidence.push('接続先は施設内ネットワークです');
  }

  if (
    config.endpointConfigured
    && config.endpointHostKind === 'private_network'
    && config.endpointProtocol !== 'https'
  ) {
    status = 'blocked';
    requiredActions.push('施設内LANの接続先はhttpsにする。同一端末のlocalhostだけhttpを許可する');
  }
  if (!config.bearerTokenConfigured) {
    status = 'blocked';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN に認証トークンを設定する');
  } else {
    evidence.push('接続先の認証トークンが設定されています');
  }

  if (!facilityLocalOnlyConfirmed) {
    status = 'blocked';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY=true で施設内だけの連携を確認する');
  } else {
    evidence.push('施設外へ処方データを送らない運用が確認されています');
  }

  if (connectorKind === 'unspecified') {
    status = 'blocked';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_KIND に nsips_gateway または vendor_api を設定する');
  } else if (connectorKind === 'invalid') {
    status = 'blocked';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_KIND を nsips_gateway または vendor_api に直す');
  } else {
    evidence.push(`接続方式: ${connectorKind === 'nsips_gateway' ? '許諾済みNSIPSゲートウェイ' : 'メーカーAPI'}`);
  }

  if (!interfaceVersion) {
    status = 'blocked';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION に接続先との合意済み仕様版を設定する');
  } else {
    evidence.push(`連携仕様版: ${interfaceVersion}`);
  }

  if (connectorKind === 'nsips_gateway' && !nsipsLicenseConfirmed) {
    status = 'blocked';
    requiredActions.push('日本薬剤師会へのNSIPS利用申込と仕様利用許諾を確認する');
  } else if (connectorKind === 'nsips_gateway') {
    evidence.push('NSIPS仕様の利用許諾確認が記録されています');
  }
  if (connectorKind === 'nsips_gateway' && interfaceVersion && interfaceVersion !== CURRENT_NSIPS_INTERFACE_VERSION) {
    status = 'blocked';
    requiredActions.push(`NSIPS連携仕様版を現行の${CURRENT_NSIPS_INTERFACE_VERSION}へ更新する`);
  }

  if (missingCapabilities.length > 0) {
    status = status === 'blocked' ? 'blocked' : 'attention';
    requiredActions.push(`未確認の必須機能を接続モジュールへ実装する: ${missingCapabilities.join(', ')}`);
  } else {
    evidence.push('送信、差替、取消、重複防止、結果応答の必須機能が申告されています');
  }

  if (!config.timeoutValid) {
    status = status === 'blocked' ? 'blocked' : 'attention';
    requiredActions.push('PHARMACY_DEVICE_CONNECTOR_TIMEOUT_MS を 1000 から 60000 の範囲に直す');
  }
  status = applyLastAttemptToStatus(
    status,
    config,
    lastAttempt,
    evidence,
    requiredActions,
    'PHARMACY_DEVICE_CONNECTOR'
  );

  return {
    id: 'pharmacy_device',
    label: '調剤機器・POS連携',
    status,
    statusLabel: checkStatusLabel(status),
    config,
    lastAttempt,
    pharmacyDevice: {
      connectorKind,
      interfaceVersion,
      facilityLocalOnlyConfirmed,
      nsipsLicenseConfirmed,
      configuredCapabilities,
      missingCapabilities
    },
    evidence,
    requiredActions
  };
}

function summarizeOverallStatus(checks: ExternalConnectorReadinessCheck[]): ExternalConnectorStatus {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'attention')) return 'attention';
  if (checks.some((check) => check.status === 'demo')) return 'demo';
  return 'ready';
}

export function buildExternalConnectorReadinessReport(input: ExternalConnectorReadinessInput = {}): ExternalConnectorReadinessReport {
  const generatedAt = input.generatedAt ?? new Date();
  const checks = [
    buildMynaCardReaderReadiness(input.mynaCardReader),
    buildOnlineEligibilityReadiness(input.onlineEligibility),
    ...(input.electronicPrescription
      ? [buildElectronicPrescriptionReadiness(input.electronicPrescription)]
      : []),
    ...(input.pharmacyDevice
      ? [buildPharmacyDeviceReadiness(input.pharmacyDevice)]
      : [])
  ];
  return {
    type: 'yakureki-external-connector-readiness',
    schemaVersion: 9,
    generatedAt: generatedAt.toISOString(),
    overallStatus: summarizeOverallStatus(checks),
    privacy: {
      containsEndpointUrl: false,
      containsBearerToken: false,
      omittedData: [
        'カードリーダー連携サービスの完全なURL',
        'オンライン資格確認サービスの完全なURL',
        'yakureki電子処方箋接続モジュールの完全なURL',
        'yakureki電子処方箋接続モジュール成果物の生SHA-256',
        '外部調剤機器コネクタの完全なURLと処方データ',
        'Bearerトークン、APIキー、認証ヘッダー'
      ]
    },
    checks
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildExternalConnectorReadinessCsv(report: ExternalConnectorReadinessReport): string {
  const rows = [
    ['connector', 'status', 'mode', 'endpointConfigured', 'endpointHostKind', 'bearerTokenConfigured', 'timeoutMs', 'lastAttemptOutcome', 'statusCodeClass', 'durationMs', 'durationStatus', 'responseShape', 'epCsvMaxBytes', 'epMissingDisplayItems', 'epSharedFolderMode', 'epSharedFolderP95Ms', 'requiredActions', 'evidence'],
    ...report.checks.map((check) => [
      check.label,
      check.statusLabel,
      check.config.mode,
      check.config.endpointConfigured ? 'yes' : 'no',
      check.config.endpointHostKind,
      check.config.bearerTokenConfigured === undefined ? '' : check.config.bearerTokenConfigured ? 'yes' : 'no',
      check.config.timeoutMs,
      check.lastAttempt.outcomeLabel,
      check.lastAttempt.statusCodeClass ?? '',
      check.lastAttempt.durationMs ?? '',
      check.lastAttempt.durationStatus,
      check.lastAttempt.responseShape,
      check.electronicPrescription?.csvMaxBytes ?? '',
      check.electronicPrescription?.requiredDisplayItems.missing.join(' / ') ?? '',
      check.electronicPrescription?.sharedFolder.mode ?? '',
      check.electronicPrescription?.sharedFolder.performanceP95Ms ?? '',
      check.requiredActions.join(' / '),
      check.evidence.join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
