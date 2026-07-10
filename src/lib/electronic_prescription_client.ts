import { createHash } from 'node:crypto';

import {
  buildElectronicPrescriptionIntegrityHash,
  buildElectronicPrescriptionOperationIdempotencyKey,
  createDemoElectronicPrescription,
  findMissingElectronicPrescriptionConnectorCapabilities,
  getElectronicPrescriptionOperationLabel,
  getRequiredElectronicPrescriptionCapabilitiesForOperation,
  normalizeElectronicPrescriptionConnectorCapabilities,
  normalizeElectronicPrescriptionConnectorKind,
  normalizeElectronicPrescriptionFetchKey,
  normalizeElectronicPrescriptionSupplementaryInformation,
  normalizeElectronicPrescriptionUnitConversion,
  REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES,
  type ElectronicPrescriptionFetchInput,
  type ElectronicPrescriptionFetchMode,
  type ElectronicPrescriptionFetchResult,
  type ElectronicPrescriptionDispensingInformationSignatureStatus,
  type ElectronicPrescriptionDrugCodeStatus,
  type ElectronicPrescriptionDrugNameVerificationStatus,
  type ElectronicPrescriptionHpkiSignerRole,
  type ElectronicPrescriptionHpkiVerification,
  type ElectronicPrescriptionHpkiVerificationStatus,
  type ElectronicPrescriptionConnectorCapability,
  type ElectronicPrescriptionOperationInput,
  type ElectronicPrescriptionOperationKind,
  type ElectronicPrescriptionOperationResult,
  type ElectronicPrescriptionPayload,
  type ValidElectronicPrescriptionOperationInput,
  validateElectronicPrescriptionOperationInput,
  validateElectronicPrescriptionFetchMatch,
  validateElectronicPrescriptionFetchInput
} from './electronic_prescription';
import type {
  ExternalConnectorAttemptOutcome,
  ExternalConnectorLastAttemptInput,
  ExternalConnectorResponseShape
} from './external_connector_readiness';

export interface ElectronicPrescriptionClientEnv {
  ELECTRONIC_PRESCRIPTION_MODE?: string;
  ELECTRONIC_PRESCRIPTION_ENDPOINT?: string;
  ELECTRONIC_PRESCRIPTION_BEARER_TOKEN?: string;
  ELECTRONIC_PRESCRIPTION_TIMEOUT_MS?: string;
  ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND?: string;
  ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256?: string;
  ELECTRONIC_PRESCRIPTION_CAPABILITIES?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256?: string;
  ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256?: string;
}

export interface ElectronicPrescriptionClientOptions {
  env?: ElectronicPrescriptionClientEnv;
  fetchImpl?: typeof fetch;
}

export interface ElectronicPrescriptionConnectorPreflightResult {
  type: 'yakureki-electronic-prescription-connector-preflight';
  schemaVersion: 1;
  checkedAt: string;
  mode: ElectronicPrescriptionFetchMode;
  status: 'success' | 'unconfigured' | 'invalid_response' | 'http_error' | 'auth_error' | 'timeout' | 'network_error' | 'config_error';
  message: string;
  warnings: string[];
  durationMs?: number;
  statusCode?: number;
  responseShape: ExternalConnectorResponseShape;
  connectorKind?: string;
  connectorEndpointSha256?: string;
  connectorArtifactSha256?: string;
  configuredCapabilities: ElectronicPrescriptionConnectorCapability[];
  missingCapabilities: ElectronicPrescriptionConnectorCapability[];
  privacy: {
    containsPatientData: false;
    containsEndpointUrl: false;
    containsBearerToken: false;
    containsRequestBody: false;
    containsResponseBody: false;
  };
  lastAttempt: ExternalConnectorLastAttemptInput;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const CONNECTOR_TEXT_MAX_LENGTH = 500;
const PATIENT_DATA_PREFLIGHT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PATIENT_DATA_PREFLIGHT_FUTURE_SKEW_MS = 5 * 60 * 1000;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function getClientEnv(env: ElectronicPrescriptionClientEnv | undefined): ElectronicPrescriptionClientEnv {
  if (env) return env;
  return {
    ELECTRONIC_PRESCRIPTION_MODE: process.env.ELECTRONIC_PRESCRIPTION_MODE,
    ELECTRONIC_PRESCRIPTION_ENDPOINT: process.env.ELECTRONIC_PRESCRIPTION_ENDPOINT,
    ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: process.env.ELECTRONIC_PRESCRIPTION_BEARER_TOKEN,
    ELECTRONIC_PRESCRIPTION_TIMEOUT_MS: process.env.ELECTRONIC_PRESCRIPTION_TIMEOUT_MS,
    ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: process.env.ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND,
    ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: process.env.ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256,
    ELECTRONIC_PRESCRIPTION_CAPABILITIES: process.env.ELECTRONIC_PRESCRIPTION_CAPABILITIES,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256: process.env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256
  };
}

function getMode(env: ElectronicPrescriptionClientEnv): ElectronicPrescriptionFetchMode {
  const mode = (env.ELECTRONIC_PRESCRIPTION_MODE || 'off').trim().toLowerCase();
  if (mode === 'connector' || mode === 'bridge') return 'connector';
  if (mode === 'demo') return mode;
  return 'off';
}

function getTimeoutMs(env: ElectronicPrescriptionClientEnv): number {
  const parsed = Number(env.ELECTRONIC_PRESCRIPTION_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(parsed, 30_000);
}

function validateConnectorEndpoint(endpoint: string):
  | { ok: true; url: URL }
  | { ok: false; message: string; warnings: string[] } {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return {
      ok: false,
      message: '電子処方箋接続モジュールのURL形式が不正です。',
      warnings: ['ELECTRONIC_PRESCRIPTION_ENDPOINT を http または https のURLに直してください。']
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      message: '電子処方箋接続モジュールのURL形式が不正です。',
      warnings: ['ELECTRONIC_PRESCRIPTION_ENDPOINT を http または https のURLに直してください。']
    };
  }
  if (url.username || url.password) {
    return {
      ok: false,
      message: '電子処方箋接続モジュールのURLに認証情報を埋め込めません。',
      warnings: ['認証情報はURLではなく ELECTRONIC_PRESCRIPTION_BEARER_TOKEN に設定してください。']
    };
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1');
  const loopback = hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
  if (url.protocol === 'http:' && !loopback) {
    return {
      ok: false,
      message: '電子処方箋接続モジュールへの患者情報送信にはHTTPSが必要です。',
      warnings: ['平文HTTPは同一端末のlocalhost/loopback接続だけに限定してください。']
    };
  }
  return { ok: true, url };
}

function hashConnectorEndpoint(endpoint: unknown): string | undefined {
  if (typeof endpoint !== 'string' || !endpoint.trim()) return undefined;
  try {
    const url = new URL(endpoint.trim());
    return createHash('sha256').update(url.href).digest('hex');
  } catch {
    return undefined;
  }
}

function getBearerToken(env: ElectronicPrescriptionClientEnv): string {
  return env.ELECTRONIC_PRESCRIPTION_BEARER_TOKEN?.trim() || '';
}

function normalizeSha256(value: unknown): string | undefined {
  const text = String(value ?? '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : undefined;
}

export function buildElectronicPrescriptionConnectorAuthSha256(token: unknown): string | undefined {
  if (typeof token !== 'string' || !token.trim()) return undefined;
  return createHash('sha256')
    .update(`yakureki-electronic-prescription-auth\0${token.trim()}`)
    .digest('hex');
}

function validateConnectorRuntimeConfig(
  env: ElectronicPrescriptionClientEnv,
  requiredCapabilities: ElectronicPrescriptionConnectorCapability[],
  options: { requireSuccessfulPreflight?: boolean } = {}
): { ok: true } | { ok: false; message: string; warnings: string[] } {
  const connectorKind = normalizeElectronicPrescriptionConnectorKind(env.ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND);
  const missingCapabilities = findMissingElectronicPrescriptionConnectorCapabilities(
    env.ELECTRONIC_PRESCRIPTION_CAPABILITIES,
    requiredCapabilities
  );
  if (!connectorKind) {
    return {
      ok: false,
      message: '電子処方箋接続モジュールの接続方式が未確認です。',
      warnings: ['ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND に qualification_terminal または web_api を設定してください。']
    };
  }
  if (missingCapabilities.length > 0) {
    return {
      ok: false,
      message: '電子処方箋接続モジュールの必須機能が未確認です。',
      warnings: [`ELECTRONIC_PRESCRIPTION_CAPABILITIES に不足があります: ${missingCapabilities.join(', ')}`]
    };
  }
  if (!getBearerToken(env)) {
    return {
      ok: false,
      message: '電子処方箋接続モジュールの認証トークンが未設定です。',
      warnings: ['ELECTRONIC_PRESCRIPTION_BEARER_TOKEN を設定してください。']
    };
  }
  const connectorArtifactSha256 = normalizeSha256(env.ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256);
  if (!connectorArtifactSha256) {
    return {
      ok: false,
      message: '電子処方箋接続モジュールの成果物SHA-256が未設定または不正です。',
      warnings: ['ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256 に接続モジュール配布物のSHA-256を設定してください。']
    };
  }
  if (options.requireSuccessfulPreflight) {
    const outcome = String(env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME || '').trim().toLowerCase();
    const responseShape = String(env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE || '').trim().toLowerCase();
    const statusCodeText = String(env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE || '').trim();
    const statusCode = Number(statusCodeText);
    const attemptedAtText = String(env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT || '').trim();
    const attemptedAt = attemptedAtText
      ? new Date(attemptedAtText)
      : undefined;
    if (outcome !== 'success' || responseShape !== 'json_object') {
      return {
        ok: false,
        message: '電子処方箋接続モジュールの患者情報なしpreflight成功記録がありません。',
        warnings: ['npm run electronic-prescription:connector-preflight を実行し、ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_* を反映してください。']
      };
    }
    if (!statusCodeText || !Number.isInteger(statusCode) || statusCode < 200 || statusCode >= 300) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight HTTPステータスが成功ではありません。',
        warnings: ['preflight のHTTPステータスが2xxになるよう接続先を確認してください。']
      };
    }
    if (!attemptedAtText) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight実行日時がありません。',
        warnings: ['ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT をISO日時で記録してください。']
      };
    }
    if (!ISO_TIMESTAMP_PATTERN.test(attemptedAtText) || !attemptedAt || Number.isNaN(attemptedAt.getTime())) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight実行日時が不正です。',
        warnings: ['ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT をISO日時で記録してください。']
      };
    }
    const preflightAgeMs = Date.now() - attemptedAt.getTime();
    if (preflightAgeMs > PATIENT_DATA_PREFLIGHT_MAX_AGE_MS) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールの患者情報なしpreflight成功記録が古くなっています。',
        warnings: ['npm run electronic-prescription:connector-preflight を再実行し、ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_* を更新してください。']
      };
    }
    if (preflightAgeMs < -PATIENT_DATA_PREFLIGHT_FUTURE_SKEW_MS) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight実行日時が未来になっています。',
        warnings: ['ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT と端末時刻を確認してください。']
      };
    }
    const endpointHash = hashConnectorEndpoint(env.ELECTRONIC_PRESCRIPTION_ENDPOINT);
    const lastEndpointHash = String(env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256 || '').trim().toLowerCase();
    if (!lastEndpointHash) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight接続先照合値が記録されていません。',
        warnings: ['ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256 をpreflight結果から反映してください。']
      };
    }
    if (!endpointHash || lastEndpointHash !== endpointHash) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight接続先が現在設定と一致しません。',
        warnings: ['npm run electronic-prescription:connector-preflight を現在の接続先で再実行してください。']
      };
    }
    const authHash = buildElectronicPrescriptionConnectorAuthSha256(getBearerToken(env));
    const lastAuthHash = String(env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256 || '').trim().toLowerCase();
    if (!lastAuthHash) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight認証照合値が記録されていません。',
        warnings: ['ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256 をpreflight結果から反映してください。']
      };
    }
    if (!authHash || lastAuthHash !== authHash) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight認証情報が現在設定と一致しません。',
        warnings: ['npm run electronic-prescription:connector-preflight を現在の認証情報で再実行してください。']
      };
    }
    const lastConnectorArtifactSha256 = normalizeSha256(
      env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256
    );
    if (!lastConnectorArtifactSha256) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight成果物SHA-256が記録されていません。',
        warnings: ['ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256 をpreflight結果から反映してください。']
      };
    }
    if (lastConnectorArtifactSha256 !== connectorArtifactSha256) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight成果物が現在設定と一致しません。',
        warnings: ['npm run electronic-prescription:connector-preflight を現在の接続モジュール成果物で再実行してください。']
      };
    }
    const lastConnectorKind = normalizeElectronicPrescriptionConnectorKind(
      env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND
    );
    if (!lastConnectorKind) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight接続方式が記録されていません。',
        warnings: ['ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND をpreflight結果から反映してください。']
      };
    }
    if (lastConnectorKind !== connectorKind) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight接続方式が現在設定と一致しません。',
        warnings: ['npm run electronic-prescription:connector-preflight を現在の接続方式で再実行してください。']
      };
    }
    const lastCapabilities = normalizeElectronicPrescriptionConnectorCapabilities(
      env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES
    );
    const missingPreflightCapabilities = requiredCapabilities.filter(
      (capability) => !lastCapabilities.includes(capability)
    );
    if (missingPreflightCapabilities.length > 0) {
      return {
        ok: false,
        message: '電子処方箋接続モジュールのpreflight必須機能が現在設定と一致しません。',
        warnings: [`preflight成功記録に不足があります: ${missingPreflightCapabilities.join(', ')}`]
      };
    }
  }
  return { ok: true };
}

function toPreflightStatus(outcome: ExternalConnectorAttemptOutcome): ElectronicPrescriptionConnectorPreflightResult['status'] {
  if (outcome === 'success') return 'success';
  if (outcome === 'not_run') return 'unconfigured';
  return outcome;
}

function buildPreflightResult(input: {
  checkedAt: string;
  mode: ElectronicPrescriptionFetchMode;
  outcome: ExternalConnectorAttemptOutcome;
  message: string;
  warnings?: string[];
  durationMs?: number;
  statusCode?: number;
  responseShape?: ExternalConnectorResponseShape;
  connectorKind?: string;
  connectorEndpointSha256?: string;
  connectorArtifactSha256?: string;
  configuredCapabilities?: ElectronicPrescriptionConnectorCapability[];
  missingCapabilities?: ElectronicPrescriptionConnectorCapability[];
  errorCode?: string;
}): ElectronicPrescriptionConnectorPreflightResult {
  const responseShape = input.responseShape || 'unknown';
  return {
    type: 'yakureki-electronic-prescription-connector-preflight',
    schemaVersion: 1,
    checkedAt: input.checkedAt,
    mode: input.mode,
    status: toPreflightStatus(input.outcome),
    message: input.message,
    warnings: input.warnings || [],
    durationMs: input.durationMs,
    statusCode: input.statusCode,
    responseShape,
    connectorKind: input.connectorKind,
    connectorEndpointSha256: input.connectorEndpointSha256,
    connectorArtifactSha256: input.connectorArtifactSha256,
    configuredCapabilities: input.configuredCapabilities || [],
    missingCapabilities: input.missingCapabilities || [],
    privacy: {
      containsPatientData: false,
      containsEndpointUrl: false,
      containsBearerToken: false,
      containsRequestBody: false,
      containsResponseBody: false
    },
    lastAttempt: {
      outcome: input.outcome,
      attemptedAt: input.checkedAt,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      responseShape,
      errorCode: input.errorCode
    }
  };
}

function getResponseShape(text: string, parsed: unknown): ExternalConnectorResponseShape {
  if (!text.trim()) return 'empty';
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? 'json_object' : 'invalid_json';
}

function readPreflightCapabilities(json: Record<string, unknown>): ElectronicPrescriptionConnectorCapability[] {
  const nested = json.electronicPrescription && typeof json.electronicPrescription === 'object'
    ? json.electronicPrescription as Record<string, unknown>
    : undefined;
  const value = json.capabilities || nested?.capabilities || json.configuredCapabilities || nested?.configuredCapabilities;
  return normalizeElectronicPrescriptionConnectorCapabilities(Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value
      : undefined);
}

function readPreflightConnectorKind(json: Record<string, unknown>): string | undefined {
  const nested = json.electronicPrescription && typeof json.electronicPrescription === 'object'
    ? json.electronicPrescription as Record<string, unknown>
    : undefined;
  const value = json.connectorKind || nested?.connectorKind;
  return typeof value === 'string' ? value : undefined;
}

function normalizeDrugCodeStatus(value: unknown): ElectronicPrescriptionDrugCodeStatus | undefined {
  const status = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (['active', 'valid', 'current', 'available'].includes(status)) return 'active';
  if (['abolished', 'expired', 'deprecated', 'discontinued', 'inactive'].includes(status)) return 'abolished';
  if (['unknown', 'not_checked', 'unchecked'].includes(status)) return 'unknown';
  return undefined;
}

function normalizeDrugNameVerificationStatus(value: unknown): ElectronicPrescriptionDrugNameVerificationStatus | undefined {
  const status = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (['matched', 'match', 'verified', 'verified_match'].includes(status)) return 'matched';
  if (['mismatch', 'different', 'unmatched', 'not_matched'].includes(status)) return 'mismatch';
  if (['not_checked', 'unchecked', 'unknown'].includes(status)) return 'not_checked';
  return undefined;
}

function normalizeBridgePayload(value: unknown): ElectronicPrescriptionPayload | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Partial<ElectronicPrescriptionPayload>;
  const items = Array.isArray(payload.items)
    ? payload.items.filter((item) => item && typeof item === 'object')
    : [];
  if (items.length === 0) return null;
  return {
    prescriptionId: typeof payload.prescriptionId === 'string' ? payload.prescriptionId : undefined,
    exchangeNumber: typeof payload.exchangeNumber === 'string' ? payload.exchangeNumber : undefined,
    issuedAt: typeof payload.issuedAt === 'string' ? payload.issuedAt : undefined,
    prescriptionDate: typeof payload.prescriptionDate === 'string' ? payload.prescriptionDate : undefined,
    validUntil: typeof payload.validUntil === 'string' ? payload.validUntil : undefined,
    documentKind: payload.documentKind === 'electronic_prescription' || payload.documentKind === 'prescription_information'
      ? payload.documentKind
      : undefined,
    signatureVerification: normalizeSignatureVerification(payload.signatureVerification),
    refill: normalizeRefill(payload.refill),
    supplementaryInformation: normalizeElectronicPrescriptionSupplementaryInformation(payload.supplementaryInformation),
    patient: payload.patient && typeof payload.patient === 'object' ? payload.patient : {},
    provider: payload.provider && typeof payload.provider === 'object' ? payload.provider : {},
    items: items.map((item, index) => {
      const normalized = item as unknown as Record<string, unknown>;
      const usageFallbackText = typeof normalized.usageFallbackText === 'string'
        ? normalized.usageFallbackText
        : typeof normalized.usageText === 'string'
          ? normalized.usageText
          : undefined;
      return {
        rpNumber: typeof normalized.rpNumber === 'number' ? normalized.rpNumber : index + 1,
        drugCode: typeof normalized.drugCode === 'string' ? normalized.drugCode : undefined,
        receiptCode: typeof normalized.receiptCode === 'string' ? normalized.receiptCode : undefined,
        yjCode: typeof normalized.yjCode === 'string' ? normalized.yjCode : undefined,
        drugCodeStatus: normalizeDrugCodeStatus(normalized.drugCodeStatus),
        drugCodeAbolishedAt: typeof normalized.drugCodeAbolishedAt === 'string' ? normalized.drugCodeAbolishedAt : undefined,
        drugName: String(normalized.drugName || ''),
        sourceDrugName: typeof normalized.sourceDrugName === 'string' ? normalized.sourceDrugName : undefined,
        masterDrugName: typeof normalized.masterDrugName === 'string' ? normalized.masterDrugName : undefined,
        drugNameVerificationStatus: normalizeDrugNameVerificationStatus(normalized.drugNameVerificationStatus),
        drugNameVerificationCheckedAt: typeof normalized.drugNameVerificationCheckedAt === 'string'
          ? normalized.drugNameVerificationCheckedAt
          : undefined,
        amount: String(normalized.amount || ''),
        unitCode: typeof normalized.unitCode === 'string' ? normalized.unitCode : undefined,
        unitText: typeof normalized.unitText === 'string' ? normalized.unitText : typeof normalized.unit === 'string' ? normalized.unit : undefined,
        unitConversion: normalizeElectronicPrescriptionUnitConversion(normalized.unitConversion),
        usageCode: typeof normalized.usageCode === 'string' ? normalized.usageCode : undefined,
        usage: String(normalized.usage || usageFallbackText || ''),
        usageFallbackText,
        usageSupplementText: typeof normalized.usageSupplementText === 'string' ? normalized.usageSupplementText : undefined,
        days: String(normalized.days || ''),
        rpComment: typeof normalized.rpComment === 'string' ? normalized.rpComment : undefined,
        selectionReason: normalized.selectionReason === 'medical_necessity' || normalized.selectionReason === 'patient_preference'
          ? normalized.selectionReason as 'medical_necessity' | 'patient_preference'
          : undefined
      };
    }).filter((item) => item.drugName.trim())
  };
}

function normalizeSignatureVerification(
  value: unknown
): ElectronicPrescriptionPayload['signatureVerification'] {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const status = String(candidate.status || '');
  if (!['valid', 'invalid', 'not_checked', 'not_applicable'].includes(status)) return undefined;
  const hpkiVerification = normalizeHpkiVerification(candidate.hpkiVerification);
  return {
    status: status as NonNullable<ElectronicPrescriptionPayload['signatureVerification']>['status'],
    verifiedAt: typeof candidate.verifiedAt === 'string' ? candidate.verifiedAt : undefined,
    signerName: typeof candidate.signerName === 'string' ? candidate.signerName : undefined,
    ...(hpkiVerification ? { hpkiVerification } : {})
  };
}

function normalizeRefill(value: unknown): ElectronicPrescriptionPayload['refill'] {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const totalCount = Number(candidate.totalCount);
  const currentCount = Number(candidate.currentCount);
  if (!Number.isInteger(totalCount) || totalCount <= 0 || !Number.isInteger(currentCount) || currentCount <= 0) {
    return undefined;
  }
  return {
    totalCount,
    currentCount,
    previousDispensingDate: typeof candidate.previousDispensingDate === 'string'
      ? candidate.previousDispensingDate
      : undefined,
    nextDispensingDate: typeof candidate.nextDispensingDate === 'string'
      ? candidate.nextDispensingDate
      : undefined
  };
}

function normalizeDuplicateCheck(value: unknown): ElectronicPrescriptionFetchResult['duplicateCheck'] {
  if (!value || typeof value !== 'object') {
    return { status: 'not_checked', messages: [] };
  }
  const candidate = value as Record<string, unknown>;
  const status = ['passed', 'warning', 'blocked'].includes(String(candidate.status))
    ? String(candidate.status) as 'passed' | 'warning' | 'blocked'
    : 'not_checked';
  return {
    status,
    messages: normalizeConnectorWarnings(candidate.messages)
  };
}

function getDuplicateCheckVerificationError(
  operation: ElectronicPrescriptionOperationKind,
  duplicateCheck: ElectronicPrescriptionFetchResult['duplicateCheck'] | undefined
): string | undefined {
  if (operation !== 'duplicate_check') return undefined;
  if (!duplicateCheck || duplicateCheck.status === 'not_checked') {
    return '重複投薬等チェックの成功応答に確認結果がありません。';
  }
  if ((duplicateCheck.status === 'warning' || duplicateCheck.status === 'blocked') && duplicateCheck.messages.length === 0) {
    return '重複投薬等チェックの注意・停止結果に確認メッセージがありません。';
  }
  return undefined;
}

function normalizeHpkiVerificationStatus(value: unknown): ElectronicPrescriptionHpkiVerificationStatus | undefined {
  const status = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (['valid', 'verified', 'verification_success'].includes(status)) return 'valid';
  if (['invalid', 'failed', 'verification_failed'].includes(status)) return 'invalid';
  if (['expired', 'certificate_expired'].includes(status)) return 'expired';
  if (['revoked', 'certificate_revoked'].includes(status)) return 'revoked';
  if (['not_checked', 'unchecked', 'unknown'].includes(status)) return 'not_checked';
  if (['not_applicable', 'n/a', 'none'].includes(status)) return 'not_applicable';
  return undefined;
}

function normalizeHpkiSignerRole(value: unknown): ElectronicPrescriptionHpkiSignerRole | undefined {
  const role = String(value ?? '').normalize('NFKC').trim().toLowerCase();
  if (['doctor', 'physician', '医師'].includes(role)) return 'doctor';
  if (['pharmacist', '薬剤師'].includes(role)) return 'pharmacist';
  if (['unknown', 'not_checked'].includes(role)) return 'unknown';
  return undefined;
}

function normalizeSha256Hash(value: unknown): string | undefined {
  const hash = String(value ?? '').trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(hash) ? hash : undefined;
}

function normalizeHpkiPolicyOid(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.normalize('NFKC').trim().slice(0, 80);
  if (!text) return undefined;
  return /^[0-9.]+$/.test(text) ? text : 'invalid-policy-oid';
}

function isValidObjectIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!/^\d+(?:\.\d+)+$/.test(text)) return false;
  const arcs = text.split('.');
  if (arcs.some((arc) => arc.length > 1 && arc.startsWith('0'))) return false;
  const first = Number(arcs[0]);
  const second = Number(arcs[1]);
  if (!Number.isInteger(first) || first < 0 || first > 2) return false;
  if (!Number.isInteger(second) || second < 0) return false;
  if ((first === 0 || first === 1) && second > 39) return false;
  return true;
}

function normalizeHpkiVerification(value: unknown): ElectronicPrescriptionHpkiVerification | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const status = normalizeHpkiVerificationStatus(candidate.status || candidate.verificationStatus);
  if (!status) return undefined;
  const signerRole = normalizeHpkiSignerRole(candidate.signerRole || candidate.role);
  const certificateSerialHash = normalizeSha256Hash(candidate.certificateSerialHash || candidate.serialHash);
  const certificateIssuerHash = normalizeSha256Hash(candidate.certificateIssuerHash || candidate.issuerHash);
  const certificateNotAfter = typeof candidate.certificateNotAfter === 'string'
    ? candidate.certificateNotAfter.slice(0, 50)
    : undefined;
  const revocationCheckedAt = typeof candidate.revocationCheckedAt === 'string'
    ? candidate.revocationCheckedAt.slice(0, 50)
    : undefined;
  const policyOid = normalizeHpkiPolicyOid(candidate.policyOid);
  return {
    status,
    ...(signerRole ? { signerRole } : {}),
    ...(certificateSerialHash ? { certificateSerialHash } : {}),
    ...(certificateIssuerHash ? { certificateIssuerHash } : {}),
    ...(certificateNotAfter ? { certificateNotAfter } : {}),
    ...(revocationCheckedAt ? { revocationCheckedAt } : {}),
    ...(policyOid ? { policyOid } : {})
  };
}

function normalizeDispensingInformationSignatureStatus(
  value: unknown
): ElectronicPrescriptionDispensingInformationSignatureStatus | undefined {
  const status = String(value ?? '').trim().toLowerCase();
  if (['valid', 'verified', 'verified_valid', 'verification_success', 'signature_valid'].includes(status)) {
    return 'valid';
  }
  if (['invalid', 'verification_failed', 'signature_invalid', 'failed'].includes(status)) {
    return 'invalid';
  }
  if (['present', 'signed', 'signature_present', 'has_signature'].includes(status)) {
    return 'present';
  }
  if (['unsigned', 'absent', 'none', 'no_signature', 'signature_absent'].includes(status)) {
    return 'unsigned';
  }
  if (['not_checked', 'unchecked', 'unknown'].includes(status)) {
    return 'not_checked';
  }
  return undefined;
}

function normalizeDispensingInformationFile(
  json: Record<string, unknown>
): NonNullable<ElectronicPrescriptionOperationResult['dispensingInformationFile']> | undefined {
  const nested = json.dispensingInformationFile && typeof json.dispensingInformationFile === 'object'
    ? json.dispensingInformationFile as Record<string, unknown>
    : {};
  const explicitStatus = normalizeDispensingInformationSignatureStatus(
    nested.signatureStatus
      ?? nested.electronicSignatureStatus
      ?? json.dispensingInformationFileSignatureStatus
      ?? json.dispensingResultSignatureStatus
  );
  const hasElectronicSignature = nested.hasElectronicSignature ?? json.hasDispensingInformationFileSignature;
  const signatureStatus = explicitStatus
    ?? (hasElectronicSignature === true ? 'present' : hasElectronicSignature === false ? 'unsigned' : undefined);
  if (!signatureStatus) return undefined;

  const rawHash = String(nested.fileHash ?? nested.sha256 ?? json.dispensingInformationFileHash ?? '').trim().toLowerCase();
  const fileHash = /^[a-f0-9]{64}$/.test(rawHash) ? rawHash : undefined;
  const signedAt = typeof nested.signedAt === 'string'
    ? nested.signedAt.slice(0, 50)
    : typeof json.dispensingInformationFileSignedAt === 'string'
      ? json.dispensingInformationFileSignedAt.slice(0, 50)
      : undefined;
  const hpkiVerification = normalizeHpkiVerification(
    nested.hpkiVerification || json.dispensingInformationFileHpkiVerification
  );
  return {
    signatureStatus,
    ...(signedAt ? { signedAt } : {}),
    ...(fileHash ? { fileHash } : {}),
    ...(hpkiVerification ? { hpkiVerification } : {})
  };
}

function getDispensingInformationFileVerificationError(
  operation: ElectronicPrescriptionOperationKind,
  file: ElectronicPrescriptionOperationResult['dispensingInformationFile'],
  requireFile: boolean,
  requireHpkiSignature: boolean
): string | undefined {
  if (!['dispensing_result_register', 'dispensing_result_change', 'dispensing_result_search'].includes(operation)) {
    return undefined;
  }
  if (!file) {
    return requireFile ? '調剤情報提供ファイルの署名検証結果がありません。' : undefined;
  }
  if (file.signatureStatus === 'invalid') {
    return '調剤情報提供ファイルの電子署名検証に失敗しました。';
  }
  if (file.signatureStatus === 'unsigned') {
    return requireHpkiSignature
      ? '電子処方箋を基にした調剤情報提供ファイルに薬剤師の電子署名がありません。'
      : undefined;
  }
  if (file.signatureStatus === 'not_checked') {
    return '調剤情報提供ファイルの電子署名が未確認です。';
  }
  const hpki = file.hpkiVerification;
  if (!hpki) {
    return '調剤情報提供ファイルのHPKI証明書検証結果がありません。';
  }
  if (hpki.status !== 'valid') {
    return '調剤情報提供ファイルのHPKI証明書が有効ではありません。';
  }
  if (hpki.signerRole !== 'pharmacist') {
    return '調剤情報提供ファイルのHPKI資格種別が薬剤師ではありません。';
  }
  if (
    !hpki.certificateSerialHash
    || !hpki.certificateIssuerHash
    || !hpki.certificateNotAfter
    || !hpki.revocationCheckedAt
  ) {
    return '調剤情報提供ファイルのHPKI詳細検証結果が不足しています。';
  }
  if (hpki.policyOid && !isValidObjectIdentifier(hpki.policyOid)) {
    return '調剤情報提供ファイルのHPKIポリシーOID形式が不正です。';
  }
  const certificateNotAfterText = hpki.certificateNotAfter.slice(0, 10);
  const certificateNotAfter = new Date(`${certificateNotAfterText}T23:59:59.999Z`);
  const revocationCheckedAt = new Date(hpki.revocationCheckedAt);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(certificateNotAfterText)
    || Number.isNaN(certificateNotAfter.getTime())
    || certificateNotAfter.toISOString().slice(0, 10) !== certificateNotAfterText
    || !/^\d{4}-\d{2}-\d{2}T/.test(hpki.revocationCheckedAt)
    || Number.isNaN(revocationCheckedAt.getTime())
  ) {
    return '調剤情報提供ファイルのHPKI詳細検証日時が不正です。';
  }
  if (file.signedAt) {
    const signedAt = new Date(file.signedAt);
    if (Number.isNaN(signedAt.getTime())) {
      return '調剤情報提供ファイルの署名日時が不正です。';
    }
    if (revocationCheckedAt.getTime() < signedAt.getTime()) {
      return '調剤情報提供ファイルのHPKI失効確認日時が署名日時より前です。';
    }
    if (certificateNotAfter.getTime() < signedAt.getTime()) {
      return '調剤情報提供ファイルのHPKI証明書は署名日時点で有効期限切れです。';
    }
  }
  return undefined;
}

function redactConnectorText(value: string): string {
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, '$1 [redacted]')
    .replace(/\b(?:X-API-Key|Api-Key|api_key|apiKey)\s*[:=]\s*[A-Za-z0-9._~+/-]+=*/gi, '[redacted-api-key]')
    .replace(/\b(?:client_secret|clientSecret|secret|password)\s*[:=]\s*[^\s,、。;；]+/gi, '[redacted-secret]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .replace(/\b[a-f0-9]{64}\b/gi, '[redacted-hash]')
    .replace(/\b(?:EP|EPRX|E-RX|RX)[-_A-Z0-9]*\d[A-Z0-9-]*\b/gi, '[redacted-prescription-id]')
    .replace(/((?:電子処方箋ID|処方箋ID|prescription\s*id|prescriptionId|electronicPrescriptionId)\s*[:：=]?\s*)[A-Za-z0-9][A-Za-z0-9_-]{3,}/gi, '$1[redacted-prescription-id]')
    .replace(/((?:引換番号|引換No|引換NO|取得キー|exchange\s*number|exchangeNumber|fetchKey)\s*[:：=]?\s*)[A-Za-z0-9][A-Za-z0-9_-]{3,}/gi, '$1[redacted-fetch-key]')
    .replace(/((?:調剤結果ID|dispensingResultId|dispensing\s*result\s*id)\s*[:：=]?\s*)[A-Za-z0-9][A-Za-z0-9_-]{3,}/gi, '$1[redacted-dispensing-result-id]')
    .replace(/((?:患者名|patientName|patient\s*name)\s*[:：=]?\s*)[^\s,、。;；]+(?:[\s　]+[^\s,、。;；]+)?/gi, '$1[redacted-patient-name]')
    .replace(/((?:患者ID|患者番号|patientId|patient\s*id)\s*[:：=]?\s*)[A-Za-z0-9][A-Za-z0-9_-]{2,}/gi, '$1[redacted-patient-id]')
    .slice(0, CONNECTOR_TEXT_MAX_LENGTH);
}

function normalizeConnectorText(value: unknown, fallback: string): string {
  const text = typeof value === 'string' && value.trim() ? value : fallback;
  return redactConnectorText(text);
}

function normalizeConnectorWarnings(value: unknown, extraWarnings: string[] = []): string[] {
  const warnings = Array.isArray(value)
    ? value.flatMap((warning) => {
      const text = typeof warning === 'string' ? warning : String(warning ?? '');
      const normalized = redactConnectorText(text.trim());
      return normalized ? [normalized] : [];
    })
    : [];
  return Array.from(new Set([...warnings, ...extraWarnings.map(redactConnectorText)])).slice(0, 10);
}

function normalizeConnectorStructuredId(value: unknown, maxLength = 100): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.normalize('NFKC').trim().slice(0, maxLength);
  if (!text) return undefined;
  if (redactConnectorText(text) !== text) return undefined;
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{1,99}$/.test(text) ? text : undefined;
}

function normalizeConnectorDispensingResultId(json: Record<string, unknown>): string | undefined {
  return normalizeConnectorStructuredId(json.dispensingResultId)
    || normalizeConnectorStructuredId(json.dispensingId)
    || normalizeConnectorStructuredId(json.resultId);
}

function normalizeConnectorPrescriptionId(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = normalizeElectronicPrescriptionFetchKey(String(value));
  if (!text || text.length < 4 || !/^[A-Z0-9-]+$/.test(text)) return undefined;
  return text;
}

function readConnectorPrescriptionIds(json: Record<string, unknown>): string[] {
  const values: unknown[] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          const record = item as Record<string, unknown>;
          values.push(record.prescriptionId, record.electronicPrescriptionId, record.id);
        } else {
          values.push(item);
        }
      }
    } else if (typeof value === 'string') {
      values.push(...value.split(/[,\s、]+/).filter(Boolean));
    } else {
      values.push(value);
    }
  };

  collect(json.prescriptionIds);
  collect(json.linkedPrescriptionIds);
  collect(json.electronicPrescriptionIds);
  collect(json.prescriptions);
  collect(json.prescriptionId);
  collect(json.electronicPrescriptionId);

  return Array.from(new Set(values.flatMap((value) => {
    const normalized = normalizeConnectorPrescriptionId(value);
    return normalized ? [normalized] : [];
  })));
}

function getExpectedOperationPrescriptionIds(input: ValidElectronicPrescriptionOperationInput): string[] {
  return input.prescriptionIds && input.prescriptionIds.length > 0
    ? input.prescriptionIds
    : [input.prescriptionId];
}

function getConnectorPrescriptionIdVerificationError(
  input: ValidElectronicPrescriptionOperationInput,
  json: Record<string, unknown>
): string | undefined {
  const expected = getExpectedOperationPrescriptionIds(input);
  const returned = readConnectorPrescriptionIds(json);
  const requiresReturnedIds = [
    'duplicate_check',
    'reception_cancel',
    'dispensing_result_register',
    'dispensing_result_search',
    'dispensing_result_cancel',
    'dispensing_result_change'
  ].includes(input.operation);
  if (returned.length === 0) {
    if (requiresReturnedIds) {
      if (input.operation === 'duplicate_check') {
        return '重複投薬等チェックの成功応答に対象処方箋IDの照合結果がありません。';
      }
      return input.operation === 'reception_cancel'
        ? '受付取消の成功応答に対象処方箋IDの照合結果がありません。'
        : '調剤結果操作の成功応答に対象処方箋IDの照合結果がありません。';
    }
    return expected.length > 1
      ? '複数電子処方箋の成功応答に対象処方箋IDの照合結果がありません。'
      : undefined;
  }

  const missing = expected.filter((prescriptionId) => !returned.includes(prescriptionId));
  const unexpected = returned.filter((prescriptionId) => !expected.includes(prescriptionId));
  if (missing.length > 0 || unexpected.length > 0) {
    return '電子処方箋管理サービスの応答対象が送信した処方箋IDと一致しません。';
  }
  return undefined;
}

function getConnectorDispensingResultIdVerificationError(
  input: ValidElectronicPrescriptionOperationInput,
  dispensingResultId: string | undefined
): string | undefined {
  if (!input.dispensingResultId) return undefined;
  if (!dispensingResultId) {
    return '調剤結果操作の成功応答に有効な調剤結果IDがありません。';
  }
  if (dispensingResultId !== input.dispensingResultId) {
    return '調剤結果操作の応答IDが送信した調剤結果IDと一致しません。';
  }
  return undefined;
}

function normalizeConnectorTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, 50);
  if (!text || !ISO_TIMESTAMP_PATTERN.test(text) || Number.isNaN(new Date(text).getTime())) return undefined;
  return text;
}

function normalizeConnectorRegisteredAt(json: Record<string, unknown>): string | undefined {
  return normalizeConnectorTimestamp(json.registeredAt)
    || normalizeConnectorTimestamp(json.updatedAt)
    || normalizeConnectorTimestamp(json.cancelledAt)
    || normalizeConnectorTimestamp(json.canceledAt);
}

async function readConnectorJsonObject(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function readOperationResponseStatus(json: Record<string, unknown>): string {
  const rawStatus = [json.status, json.outcome, json.result, json.idempotencyStatus]
    .find((value) => typeof value === 'string' && value.trim());
  return typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : 'success';
}

function isIdempotentDuplicateStatus(status: string): boolean {
  return ['duplicate', 'already_processed', 'idempotent_replay', 'replayed'].includes(status);
}

export async function runElectronicPrescriptionConnectorPreflight(
  options: ElectronicPrescriptionClientOptions = {}
): Promise<ElectronicPrescriptionConnectorPreflightResult> {
  const checkedAt = new Date().toISOString();
  const env = getClientEnv(options.env);
  const mode = getMode(env);

  if (mode !== 'connector') {
    return buildPreflightResult({
      checkedAt,
      mode,
      outcome: 'config_error',
      message: '電子処方箋接続モジュールはconnectorモードではありません。',
      warnings: ['ELECTRONIC_PRESCRIPTION_MODE=connector を設定してください。'],
      responseShape: 'unknown',
      errorCode: 'mode_not_connector'
    });
  }

  const endpoint = env.ELECTRONIC_PRESCRIPTION_ENDPOINT?.trim();
  if (!endpoint) {
    return buildPreflightResult({
      checkedAt,
      mode,
      outcome: 'config_error',
      message: '電子処方箋接続モジュールのURLが未設定です。',
      warnings: ['ELECTRONIC_PRESCRIPTION_ENDPOINT を設定してください。'],
      responseShape: 'unknown',
      errorCode: 'endpoint_unconfigured'
    });
  }

  const endpointValidation = validateConnectorEndpoint(endpoint);
  if (!endpointValidation.ok) {
    return buildPreflightResult({
      checkedAt,
      mode,
      outcome: 'config_error',
      message: endpointValidation.message,
      warnings: endpointValidation.warnings,
      responseShape: 'unknown',
      errorCode: 'endpoint_invalid'
    });
  }
  const connectorEndpointSha256 = hashConnectorEndpoint(endpoint);
  const connectorArtifactSha256 = normalizeSha256(env.ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256);

  const runtimeConfig = validateConnectorRuntimeConfig(env, REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES);
  if (!runtimeConfig.ok) {
    return buildPreflightResult({
      checkedAt,
      mode,
      outcome: 'config_error',
      message: runtimeConfig.message,
      warnings: runtimeConfig.warnings,
      responseShape: 'unknown',
      connectorEndpointSha256,
      connectorArtifactSha256,
      errorCode: 'connector_metadata_incomplete'
    });
  }

  const expectedConnectorKind = normalizeElectronicPrescriptionConnectorKind(env.ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND);
  const abortController = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => abortController.abort(), getTimeoutMs(env));

  try {
    const response = await (options.fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getBearerToken(env)}`
      },
      body: JSON.stringify({
        type: 'yakureki-electronic-prescription-preflight',
        schemaVersion: 1,
        connectorKind: expectedConnectorKind,
        requiredCapabilities: REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES
      }),
      signal: abortController.signal
    });
    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.trim() ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    const responseShape = getResponseShape(text, parsed);
    const statusCode = response.status;

    if (!response.ok) {
      return buildPreflightResult({
        checkedAt,
        mode,
        outcome: statusCode === 401 || statusCode === 403 ? 'auth_error' : 'http_error',
        message: statusCode === 401 || statusCode === 403
          ? '電子処方箋接続モジュールの認証に失敗しました。'
          : `電子処方箋接続モジュールがエラーを返しました（HTTP ${statusCode}）。`,
        durationMs,
        statusCode,
        responseShape,
        connectorEndpointSha256,
        connectorArtifactSha256,
        errorCode: statusCode === 401 || statusCode === 403 ? 'auth_error' : 'http_error'
      });
    }

    if (responseShape !== 'json_object') {
      return buildPreflightResult({
        checkedAt,
        mode,
        outcome: 'invalid_response',
        message: '電子処方箋接続モジュールのpreflight応答がJSONオブジェクトではありません。',
        durationMs,
        statusCode,
        responseShape,
        connectorEndpointSha256,
        connectorArtifactSha256,
        errorCode: 'invalid_json'
      });
    }

    const json = parsed as Record<string, unknown>;
    const connectorKind = readPreflightConnectorKind(json);
    const normalizedConnectorKind = normalizeElectronicPrescriptionConnectorKind(connectorKind);
    const configuredCapabilities = readPreflightCapabilities(json);
    const missingCapabilities = findMissingElectronicPrescriptionConnectorCapabilities(
      configuredCapabilities,
      REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES
    );
    const connectorStatus = String(json.status || json.outcome || json.result || '').trim().toLowerCase();
    const statusOk = ['success', 'ok', 'ready', 'pass'].includes(connectorStatus);

    if (!statusOk) {
      return buildPreflightResult({
        checkedAt,
        mode,
        outcome: 'invalid_response',
        message: '電子処方箋接続モジュールのpreflight応答状態を確認できません。',
        warnings: ['status は success / ok / ready / pass のいずれかで返してください。'],
        durationMs,
        statusCode,
        responseShape,
        connectorKind,
        connectorEndpointSha256,
        connectorArtifactSha256,
        configuredCapabilities,
        missingCapabilities,
        errorCode: 'status_not_ready'
      });
    }
    if (!normalizedConnectorKind || normalizedConnectorKind !== expectedConnectorKind) {
      return buildPreflightResult({
        checkedAt,
        mode,
        outcome: 'invalid_response',
        message: '電子処方箋接続モジュールの接続方式が設定と一致しません。',
        warnings: ['connectorKind は ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND と同じ値を返してください。'],
        durationMs,
        statusCode,
        responseShape,
        connectorKind,
        connectorEndpointSha256,
        connectorArtifactSha256,
        configuredCapabilities,
        missingCapabilities,
        errorCode: 'connector_kind_mismatch'
      });
    }
    if (missingCapabilities.length > 0) {
      return buildPreflightResult({
        checkedAt,
        mode,
        outcome: 'invalid_response',
        message: '電子処方箋接続モジュールのpreflight応答で必須機能を確認できません。',
        warnings: [`不足: ${missingCapabilities.join(', ')}`],
        durationMs,
        statusCode,
        responseShape,
        connectorKind,
        connectorEndpointSha256,
        connectorArtifactSha256,
        configuredCapabilities,
        missingCapabilities,
        errorCode: 'capabilities_missing'
      });
    }

    return buildPreflightResult({
      checkedAt,
      mode,
      outcome: 'success',
      message: '電子処方箋接続モジュールの患者情報なしpreflightが成功しました。',
      durationMs,
      statusCode,
      responseShape,
      connectorKind,
      connectorEndpointSha256,
      connectorArtifactSha256,
      configuredCapabilities,
      missingCapabilities
    });
  } catch (error: any) {
    return buildPreflightResult({
      checkedAt,
      mode,
      outcome: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      message: error?.name === 'AbortError'
        ? '電子処方箋接続モジュールのpreflightがタイムアウトしました。'
        : '電子処方箋接続モジュールのpreflightへ接続できませんでした。',
      durationMs: Date.now() - startedAt,
      responseShape: 'unknown',
      connectorEndpointSha256,
      connectorArtifactSha256,
      errorCode: error?.name === 'AbortError' ? 'timeout' : 'network_error'
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchElectronicPrescription(
  input: ElectronicPrescriptionFetchInput,
  options: ElectronicPrescriptionClientOptions = {}
): Promise<ElectronicPrescriptionFetchResult> {
  const validated = validateElectronicPrescriptionFetchInput(input);
  if (!validated.ok) {
    return {
      status: 'error',
      mode: 'off',
      message: validated.message,
      warnings: []
    };
  }

  const env = getClientEnv(options.env);
  const mode = getMode(env);

  if (mode === 'off') {
    return {
      status: 'unconfigured',
      mode,
      message: '電子処方箋管理サービスの接続先が未設定です。',
      warnings: ['本番利用前にpharma-ossの電子処方箋接続モジュールを設定してください。']
    };
  }

  if (mode === 'demo') {
    const prescription = createDemoElectronicPrescription(validated);
    return {
      status: 'success',
      mode,
      message: 'デモ用の電子処方箋データです。本番の管理サービス応答ではありません。',
      prescription,
      duplicateCheck: {
        status: 'not_checked',
        messages: ['デモモードのため、重複投薬等チェックは実施していません。']
      },
      warnings: ['デモ応答です。本番受付として扱わないでください。'],
      integrityHash: await buildElectronicPrescriptionIntegrityHash(prescription)
    };
  }

  const endpoint = env.ELECTRONIC_PRESCRIPTION_ENDPOINT?.trim();
  if (!endpoint) {
    return {
      status: 'unconfigured',
      mode,
      message: '電子処方箋接続モジュールのURLが未設定です。',
      warnings: ['ELECTRONIC_PRESCRIPTION_ENDPOINT を設定してください。']
    };
  }

  const endpointValidation = validateConnectorEndpoint(endpoint);
  if (!endpointValidation.ok) {
    return {
      status: 'unconfigured',
      mode,
      message: endpointValidation.message,
      warnings: endpointValidation.warnings
    };
  }

  const runtimeConfig = validateConnectorRuntimeConfig(
    env,
    REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES,
    { requireSuccessfulPreflight: true }
  );
  if (!runtimeConfig.ok) {
    return {
      status: 'unconfigured',
      mode,
      message: runtimeConfig.message,
      warnings: runtimeConfig.warnings
    };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), getTimeoutMs(env));

  try {
    const response = await (options.fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getBearerToken(env)
          ? { Authorization: `Bearer ${getBearerToken(env)}` }
          : {})
      },
      body: JSON.stringify({
        fetchKey: validated.fetchKey,
        keyKind: validated.keyKind,
        insuredNumber: validated.insuredNumber,
        patientBirthDate: input.patientBirthDate || undefined
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      return {
        status: response.status === 404 ? 'not_found' : 'error',
        mode,
        message: response.status === 404
          ? '該当する電子処方箋が見つかりません。'
          : `電子処方箋接続モジュールがエラーを返しました（HTTP ${response.status}）。`,
        warnings: []
      };
    }

    const json = await readConnectorJsonObject(response);
    if (!json) {
      return {
        status: 'error',
        mode,
        message: '電子処方箋接続モジュールの応答をJSONオブジェクトとして解釈できませんでした。',
        warnings: []
      };
    }
    const status = typeof json.status === 'string' ? json.status : 'success';
    if (status === 'cancelled' || status === 'changed' || status === 'not_found') {
      return {
        status,
        mode,
        message: normalizeConnectorText(json.message, '電子処方箋の状態を確認してください。'),
        warnings: normalizeConnectorWarnings(json.warnings)
      };
    }
    if (status !== 'success') {
      return {
        status: 'invalid_payload',
        mode,
        message: '電子処方箋接続モジュールから未対応の状態が返されました。処方入力には反映していません。',
        warnings: []
      };
    }

    const prescription = normalizeBridgePayload(json.prescription || json);
    if (!prescription || prescription.items.length === 0) {
      return {
        status: 'error',
        mode,
        message: '電子処方箋接続モジュールの応答形式を解釈できません。',
        warnings: ['患者情報、処方元、処方薬配列を含む応答へ変換してください。']
      };
    }

    const match = validateElectronicPrescriptionFetchMatch({
      ...validated,
      insuredNumber: validated.insuredNumber,
      patientBirthDate: input.patientBirthDate
    }, prescription);
    if (!match.ok) {
      return {
        status: match.status,
        mode,
        message: match.message,
        warnings: []
      };
    }

    const duplicateCheck = normalizeDuplicateCheck(json.duplicateCheck);
    const result: ElectronicPrescriptionFetchResult = {
      status: 'success',
      mode,
      message: '電子処方箋管理サービスから接続モジュール経由で処方データを取得しました。',
      prescription,
      duplicateCheck,
      warnings: normalizeConnectorWarnings(json.warnings),
      integrityHash: await buildElectronicPrescriptionIntegrityHash(prescription)
    };
    return result;
  } catch (error: any) {
    return {
      status: 'error',
      mode,
      message: error?.name === 'AbortError'
        ? '電子処方箋接続モジュールがタイムアウトしました。'
        : '電子処方箋接続モジュールへ接続できませんでした。',
      warnings: []
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitElectronicPrescriptionOperation(
  input: ElectronicPrescriptionOperationInput,
  options: ElectronicPrescriptionClientOptions = {}
): Promise<ElectronicPrescriptionOperationResult> {
  const validated = validateElectronicPrescriptionOperationInput(input);
  if (!validated.ok) {
    return {
      status: 'invalid_request',
      mode: 'off',
      message: validated.message,
      warnings: []
    };
  }

  const env = getClientEnv(options.env);
  const mode = getMode(env);
  const operationLabel = getElectronicPrescriptionOperationLabel(validated.input.operation);

  if (mode === 'off') {
    return {
      status: 'unconfigured',
      mode,
      operation: validated.input.operation,
      message: '電子処方箋管理サービスの接続先が未設定です。',
      warnings: ['本番利用前にpharma-ossの電子処方箋接続モジュールを設定してください。']
    };
  }

  if (mode === 'demo') {
    return {
      status: 'rejected',
      mode,
      operation: validated.input.operation,
      message: `デモモードでは${operationLabel}を電子処方箋管理サービスへ送信しません。`,
      warnings: ['デモ応答です。本番の受付・調剤結果として扱わないでください。'],
      ...(validated.input.operation === 'duplicate_check'
        ? { duplicateCheck: { status: 'not_checked' as const, messages: ['デモモードのため、重複投薬等チェックは実施していません。'] } }
        : {})
    };
  }

  const endpoint = env.ELECTRONIC_PRESCRIPTION_ENDPOINT?.trim();
  if (!endpoint) {
    return {
      status: 'unconfigured',
      mode,
      operation: validated.input.operation,
      message: '電子処方箋接続モジュールのURLが未設定です。',
      warnings: ['ELECTRONIC_PRESCRIPTION_ENDPOINT を設定してください。']
    };
  }

  const endpointValidation = validateConnectorEndpoint(endpoint);
  if (!endpointValidation.ok) {
    return {
      status: 'unconfigured',
      mode,
      operation: validated.input.operation,
      message: endpointValidation.message,
      warnings: endpointValidation.warnings
    };
  }

  const runtimeConfig = validateConnectorRuntimeConfig(
    env,
    Array.from(new Set([
      ...REQUIRED_ELECTRONIC_PRESCRIPTION_CAPABILITIES,
      ...getRequiredElectronicPrescriptionCapabilitiesForOperation(validated.input.operation)
    ])),
    { requireSuccessfulPreflight: true }
  );
  if (!runtimeConfig.ok) {
    return {
      status: 'unconfigured',
      mode,
      operation: validated.input.operation,
      message: runtimeConfig.message,
      warnings: runtimeConfig.warnings
    };
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), getTimeoutMs(env));
  const idempotencyKey = await buildElectronicPrescriptionOperationIdempotencyKey(validated.input);

  try {
    const response = await (options.fetchImpl || fetch)(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Yakureki-Idempotency-Key': idempotencyKey,
        ...(getBearerToken(env)
          ? { Authorization: `Bearer ${getBearerToken(env)}` }
          : {})
      },
      body: JSON.stringify({
        ...validated.input,
        idempotencyKey
      }),
      signal: abortController.signal
    });

    const json = await readConnectorJsonObject(response);
    const rawStatus = json ? readOperationResponseStatus(json) : '';
    const duplicateStatus = isIdempotentDuplicateStatus(rawStatus);
    const acceptedIdempotentConflict = response.status === 409 && duplicateStatus;

    if (!response.ok && !acceptedIdempotentConflict) {
      if (response.status === 404 && validated.input.operation === 'dispensing_result_search') {
        return {
          status: 'not_found',
          mode,
          operation: validated.input.operation,
          message: '電子処方箋管理サービスに調剤結果IDが見つかりませんでした。',
          warnings: []
        };
      }
      return {
        status: response.status === 400 ? 'invalid_request' : response.status === 409 ? 'rejected' : 'error',
        mode,
        operation: validated.input.operation,
        message: response.status === 400
          ? `${operationLabel}リクエストが接続モジュールで受理されませんでした。`
          : response.status === 409
            ? `${operationLabel}は電子処方箋管理サービス側で受け付けられませんでした。`
            : `電子処方箋接続モジュールがエラーを返しました（HTTP ${response.status}）。`,
        warnings: []
      };
    }

    if (!json) {
      return {
        status: 'error',
        mode,
        operation: validated.input.operation,
        message: `${operationLabel}の応答をJSONオブジェクトとして解釈できませんでした。`,
        warnings: []
      };
    }

    const status = duplicateStatus ? 'success' : rawStatus;
    if (status !== 'success' && status !== 'not_found' && status !== 'rejected' && status !== 'invalid_request') {
      return {
        status: 'error',
        mode,
        operation: validated.input.operation,
        message: `${operationLabel}の応答状態を解釈できませんでした。`,
        warnings: []
      };
    }
    if (status === 'not_found' && validated.input.operation !== 'dispensing_result_search') {
      return {
        status: 'error',
        mode,
        operation: validated.input.operation,
        message: `${operationLabel}の応答状態を解釈できませんでした。`,
        warnings: []
      };
    }
    const dispensingResultId = normalizeConnectorDispensingResultId(json);
    const dispensingInformationFile = normalizeDispensingInformationFile(json);
    const registeredAt = normalizeConnectorRegisteredAt(json);
    const duplicateCheck = validated.input.operation === 'duplicate_check' || json.duplicateCheck
      ? normalizeDuplicateCheck(json.duplicateCheck)
      : undefined;
    const requireHpkiSignature = validated.input.signatureRequirement?.hpkiSignatureRequired
      ?? true;
    if (
      status === 'success'
      && [
        'dispensing_result_register',
        'dispensing_result_search',
        'dispensing_result_change'
      ].includes(validated.input.operation)
      && !dispensingResultId
    ) {
      return {
        status: 'error',
        mode,
        operation: validated.input.operation,
        message: validated.input.operation === 'dispensing_result_search'
          ? '調剤結果ID検索の成功応答に有効な調剤結果IDがありません。'
          : '調剤結果操作の成功応答に有効な調剤結果IDがありません。',
        warnings: []
      };
    }
    if (status === 'success') {
      const dispensingResultIdVerificationError = getConnectorDispensingResultIdVerificationError(
        validated.input,
        dispensingResultId
      );
      if (dispensingResultIdVerificationError) {
        return {
          status: 'error',
          mode,
          operation: validated.input.operation,
          message: dispensingResultIdVerificationError,
          warnings: ['接続モジュールは成功応答に処理対象の調剤結果IDを返してください。']
        };
      }
    }
    const dispensingInformationFileVerificationError = status === 'success'
      ? getDispensingInformationFileVerificationError(
          validated.input.operation,
          dispensingInformationFile,
          !duplicateStatus,
          requireHpkiSignature
        )
      : undefined;
    if (dispensingInformationFileVerificationError) {
      return {
        status: 'error',
        mode,
        operation: validated.input.operation,
        message: dispensingInformationFileVerificationError,
        warnings: ['接続モジュールで薬剤師HPKI署名、証明書有効期限、失効状態を確認してください。']
      };
    }
    if (
      status === 'success'
      && [
        'reception_cancel',
        'dispensing_result_register',
        'dispensing_result_search',
        'dispensing_result_cancel',
        'dispensing_result_change'
      ].includes(validated.input.operation)
      && !registeredAt
    ) {
      return {
        status: 'error',
        mode,
        operation: validated.input.operation,
        message: validated.input.operation === 'reception_cancel'
          ? '受付取消の成功応答に有効な取消日時がありません。'
          : validated.input.operation === 'dispensing_result_search'
            ? '調剤結果ID検索の成功応答に有効な登録日時がありません。'
            : '調剤結果操作の成功応答に有効な登録日時がありません。',
        warnings: ['接続モジュールは受付取消日時、または調剤結果の登録・更新日時をISO日時で返してください。']
      };
    }
    const prescriptionIdVerificationError = status === 'success'
      ? getConnectorPrescriptionIdVerificationError(validated.input, json)
      : undefined;
    if (prescriptionIdVerificationError) {
      return {
        status: 'error',
        mode,
        operation: validated.input.operation,
        message: prescriptionIdVerificationError,
        warnings: ['接続モジュールは成功応答に処理対象のprescriptionIdsを返してください。']
      };
    }
    const duplicateCheckVerificationError = status === 'success'
      ? getDuplicateCheckVerificationError(validated.input.operation, duplicateCheck)
      : undefined;
    if (duplicateCheckVerificationError) {
      return {
        status: 'error',
        mode,
        operation: validated.input.operation,
        message: duplicateCheckVerificationError,
        warnings: ['接続モジュールは重複投薬等チェックの passed / warning / blocked と確認メッセージを返してください。']
      };
    }

    return {
      status,
      mode,
      operation: validated.input.operation,
      message: normalizeConnectorText(
        json.message,
        duplicateStatus
          ? `${operationLabel}は同じidempotencyKeyで処理済みです。`
          : status === 'not_found'
            ? '電子処方箋管理サービスに調剤結果IDが見つかりませんでした。'
          : `${operationLabel}が完了しました。`
      ),
      warnings: normalizeConnectorWarnings(
        json.warnings,
        duplicateStatus ? ['同じidempotencyKeyの操作は処理済みとして扱いました。'] : []
      ),
      operationId: normalizeConnectorStructuredId(json.operationId),
      dispensingResultId,
      registeredAt,
      dispensingInformationFile,
      duplicateCheck
    };
  } catch (error: any) {
    return {
      status: 'error',
      mode,
      operation: validated.input.operation,
      message: error?.name === 'AbortError'
        ? '電子処方箋接続モジュールがタイムアウトしました。'
        : '電子処方箋接続モジュールへ接続できませんでした。',
      warnings: []
    };
  } finally {
    clearTimeout(timeout);
  }
}
