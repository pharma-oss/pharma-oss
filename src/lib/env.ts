/**
 * pharma-oss 環境変数アクセスモジュール
 *
 * アプリケーション実行時およびビルド時の全環境変数(66件のコア実行時設定)を
 * 型安全にアクセサ・管理し、散在する process.env への直接アクセスを集約します。
 */

export interface AppEnvConfig {
  dbPassword?: string;
  nodeEnv: 'development' | 'production' | 'test';

  // 電子処方箋
  electronicPrescriptionMode: 'mock' | 'live' | 'disabled';
  electronicPrescriptionEndpoint: string;
  electronicPrescriptionBearerToken: string;
  electronicPrescriptionCapabilities: string;
  electronicPrescriptionTimeoutMs: number;
  electronicPrescriptionConnectorKind?: string;
  electronicPrescriptionConnectorArtifactSha256?: string;
  electronicPrescriptionCsvMaxBytes?: number;
  electronicPrescriptionRequiredDisplayItems?: string;
  electronicPrescriptionSharedFolderMode?: string;
  electronicPrescriptionSharedFolderPollIntervalMs?: number;
  electronicPrescriptionSharedFolderStaleAfterMs?: number;
  electronicPrescriptionSharedFolderMaxPendingFiles?: number;
  electronicPrescriptionSharedFolderPerformanceP95Ms?: number;
  electronicPrescriptionSharedFolderRetryPolicyConfirmed: boolean;
  electronicPrescriptionLastAttemptOutcome?: string;
  electronicPrescriptionLastAttemptAt?: string;
  electronicPrescriptionLastAttemptStatusCode?: number;
  electronicPrescriptionLastAttemptDurationMs?: number;
  electronicPrescriptionLastAttemptResponseShape?: string;
  electronicPrescriptionLastAttemptConnectorKind?: string;
  electronicPrescriptionLastAttemptConnectorArtifactSha256?: string;
  electronicPrescriptionLastAttemptCapabilities?: string;
  electronicPrescriptionLastAttemptEndpointSha256?: string;
  electronicPrescriptionLastAttemptAuthSha256?: string;
  electronicPrescriptionLastAttemptErrorCode?: string;

  // 調剤機器コネクタ
  pharmacyDeviceConnectorMode: 'mock' | 'live' | 'disabled';
  pharmacyDeviceConnectorEndpoint: string;
  pharmacyDeviceConnectorBearerToken: string;
  pharmacyDeviceConnectorSimulatorEnabled: boolean;
  pharmacyDeviceConnectorCapabilities: string;
  pharmacyDeviceConnectorTimeoutMs: number;
  pharmacyDeviceConnectorKind?: string;
  pharmacyDeviceConnectorInterfaceVersion?: string;
  pharmacyDeviceConnectorFacilityLocalOnly: boolean;
  pharmacyDeviceConnectorNsipsLicenseConfirmed: boolean;
  pharmacyDeviceConnectorLastAttemptOutcome?: string;
  pharmacyDeviceConnectorLastAttemptAt?: string;
  pharmacyDeviceConnectorLastAttemptStatusCode?: number;
  pharmacyDeviceConnectorLastAttemptDurationMs?: number;
  pharmacyDeviceConnectorLastAttemptResponseShape?: string;
  pharmacyDeviceConnectorLastAttemptErrorCode?: string;

  // オンライン資格確認
  onlineEligibilityMode: 'mock' | 'live' | 'disabled';
  onlineEligibilityEndpoint: string;
  onlineEligibilityBearerToken: string;
  onlineEligibilityAllowMock: boolean;
  onlineEligibilityTimeoutMs: number;
  onlineEligibilityLastAttemptOutcome?: string;
  onlineEligibilityLastAttemptAt?: string;
  onlineEligibilityLastAttemptStatusCode?: number;
  onlineEligibilityLastAttemptDurationMs?: number;
  onlineEligibilityLastAttemptResponseShape?: string;
  onlineEligibilityLastAttemptErrorCode?: string;

  // マイナカードリーダー
  mynaCardReaderMode: 'mock' | 'live' | 'disabled';
  mynaCardReaderEndpoint: string;
  mynaCardReaderAllowMock: boolean;
  mynaCardReaderTimeoutMs: number;
  mynaCardReaderLastAttemptOutcome?: string;
  mynaCardReaderLastAttemptAt?: string;
  mynaCardReaderLastAttemptStatusCode?: number;
  mynaCardReaderLastAttemptDurationMs?: number;
  mynaCardReaderLastAttemptResponseShape?: string;
  mynaCardReaderLastAttemptErrorCode?: string;

  // 端末間同期
  syncRole: 'standalone' | 'hub' | 'satellite';
  syncHubEndpoint: string;
  syncHubToken: string;
  syncTerminalId: string;
  syncTransportEncryption: 'none' | 'aes-gcm';
  syncTransportKey: string;
  syncHubDbPath: string;
  syncHubEncryptionKey: string;

  // SQLite WASM / Master Data
  sqliteWasmModuleUrl?: string;
  sqliteWasmScriptUrl?: string;
  sqliteWasmBinaryUrl?: string;
  sqliteMasterWorkerUrl?: string;

  // レセプト・マスタ公式 PDF 照合 API
  dispensingUkeOfficialSpecPdfTimeoutMs: number;
  dispensingUkeOfficialSpecPdfMaxBytes: number;
  drugMasterOfficialSpecPdfTimeoutMs: number;
  drugMasterOfficialSpecPdfMaxBytes: number;
  drugMasterOfficialPageTimeoutMs: number;
  drugMasterOfficialPageMaxBytes: number;
  drugMasterOfficialFileTimeoutMs: number;
  drugMasterOfficialFileMaxBytes: number;
}

function parseBoolean(value?: string, defaultValue = false): boolean {
  if (value === undefined || value === '') return defaultValue;
  return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
}

function parseNumber(value?: string, defaultValue?: number): number | undefined {
  if (value === undefined || value === '') return defaultValue;
  const n = Number(value);
  return Number.isFinite(n) ? n : defaultValue;
}

export function parseEnvConfig(env: Record<string, string | undefined> = process.env): AppEnvConfig {
  const nodeEnv = (env.NODE_ENV as AppEnvConfig['nodeEnv']) || 'development';

  return {
    dbPassword: env.NEXT_PUBLIC_DB_PASSWORD || undefined,
    nodeEnv,

    // 電子処方箋
    electronicPrescriptionMode: (env.ELECTRONIC_PRESCRIPTION_MODE as AppEnvConfig['electronicPrescriptionMode']) || 'mock',
    electronicPrescriptionEndpoint: env.ELECTRONIC_PRESCRIPTION_ENDPOINT || '',
    electronicPrescriptionBearerToken: env.ELECTRONIC_PRESCRIPTION_BEARER_TOKEN || '',
    electronicPrescriptionCapabilities: env.ELECTRONIC_PRESCRIPTION_CAPABILITIES || '',
    electronicPrescriptionTimeoutMs: parseNumber(env.ELECTRONIC_PRESCRIPTION_TIMEOUT_MS, 10000)!,
    electronicPrescriptionConnectorKind: env.ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND,
    electronicPrescriptionConnectorArtifactSha256: env.ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256,
    electronicPrescriptionCsvMaxBytes: parseNumber(env.ELECTRONIC_PRESCRIPTION_CSV_MAX_BYTES),
    electronicPrescriptionRequiredDisplayItems: env.ELECTRONIC_PRESCRIPTION_REQUIRED_DISPLAY_ITEMS,
    electronicPrescriptionSharedFolderMode: env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MODE,
    electronicPrescriptionSharedFolderPollIntervalMs: parseNumber(env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_POLL_INTERVAL_MS),
    electronicPrescriptionSharedFolderStaleAfterMs: parseNumber(env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_STALE_AFTER_MS),
    electronicPrescriptionSharedFolderMaxPendingFiles: parseNumber(env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_MAX_PENDING_FILES),
    electronicPrescriptionSharedFolderPerformanceP95Ms: parseNumber(env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_PERFORMANCE_P95_MS),
    electronicPrescriptionSharedFolderRetryPolicyConfirmed: parseBoolean(env.ELECTRONIC_PRESCRIPTION_SHARED_FOLDER_RETRY_POLICY_CONFIRMED),
    electronicPrescriptionLastAttemptOutcome: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME,
    electronicPrescriptionLastAttemptAt: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT,
    electronicPrescriptionLastAttemptStatusCode: parseNumber(env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE),
    electronicPrescriptionLastAttemptDurationMs: parseNumber(env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_DURATION_MS),
    electronicPrescriptionLastAttemptResponseShape: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE,
    electronicPrescriptionLastAttemptConnectorKind: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND,
    electronicPrescriptionLastAttemptConnectorArtifactSha256: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256,
    electronicPrescriptionLastAttemptCapabilities: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES,
    electronicPrescriptionLastAttemptEndpointSha256: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256,
    electronicPrescriptionLastAttemptAuthSha256: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256,
    electronicPrescriptionLastAttemptErrorCode: env.ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ERROR_CODE,

    // 調剤機器コネクタ
    pharmacyDeviceConnectorMode: (env.PHARMACY_DEVICE_CONNECTOR_MODE as AppEnvConfig['pharmacyDeviceConnectorMode']) || 'mock',
    pharmacyDeviceConnectorEndpoint: env.PHARMACY_DEVICE_CONNECTOR_ENDPOINT || '',
    pharmacyDeviceConnectorBearerToken: env.PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN || '',
    pharmacyDeviceConnectorSimulatorEnabled: parseBoolean(env.PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED) || parseBoolean(env.PHARMACY_DEVICE_SIMULATOR_ENABLED),
    pharmacyDeviceConnectorCapabilities: env.PHARMACY_DEVICE_CONNECTOR_CAPABILITIES || '',
    pharmacyDeviceConnectorTimeoutMs: parseNumber(env.PHARMACY_DEVICE_CONNECTOR_TIMEOUT_MS, 10000)!,
    pharmacyDeviceConnectorKind: env.PHARMACY_DEVICE_CONNECTOR_KIND,
    pharmacyDeviceConnectorInterfaceVersion: env.PHARMACY_DEVICE_CONNECTOR_INTERFACE_VERSION,
    pharmacyDeviceConnectorFacilityLocalOnly: parseBoolean(env.PHARMACY_DEVICE_CONNECTOR_FACILITY_LOCAL_ONLY),
    pharmacyDeviceConnectorNsipsLicenseConfirmed: parseBoolean(env.PHARMACY_DEVICE_CONNECTOR_NSIPS_LICENSE_CONFIRMED),
    pharmacyDeviceConnectorLastAttemptOutcome: env.PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_OUTCOME,
    pharmacyDeviceConnectorLastAttemptAt: env.PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_AT,
    pharmacyDeviceConnectorLastAttemptStatusCode: parseNumber(env.PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_STATUS_CODE),
    pharmacyDeviceConnectorLastAttemptDurationMs: parseNumber(env.PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_DURATION_MS),
    pharmacyDeviceConnectorLastAttemptResponseShape: env.PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_RESPONSE_SHAPE,
    pharmacyDeviceConnectorLastAttemptErrorCode: env.PHARMACY_DEVICE_CONNECTOR_LAST_ATTEMPT_ERROR_CODE,

    // オンライン資格確認
    onlineEligibilityMode: (env.ONLINE_ELIGIBILITY_MODE as AppEnvConfig['onlineEligibilityMode']) || 'mock',
    onlineEligibilityEndpoint: env.ONLINE_ELIGIBILITY_ENDPOINT || '',
    onlineEligibilityBearerToken: env.ONLINE_ELIGIBILITY_BEARER_TOKEN || '',
    onlineEligibilityAllowMock: env.ONLINE_ELIGIBILITY_ALLOW_MOCK !== 'false',
    onlineEligibilityTimeoutMs: parseNumber(env.ONLINE_ELIGIBILITY_TIMEOUT_MS, 10000)!,
    onlineEligibilityLastAttemptOutcome: env.ONLINE_ELIGIBILITY_LAST_ATTEMPT_OUTCOME,
    onlineEligibilityLastAttemptAt: env.ONLINE_ELIGIBILITY_LAST_ATTEMPT_AT,
    onlineEligibilityLastAttemptStatusCode: parseNumber(env.ONLINE_ELIGIBILITY_LAST_ATTEMPT_STATUS_CODE),
    onlineEligibilityLastAttemptDurationMs: parseNumber(env.ONLINE_ELIGIBILITY_LAST_ATTEMPT_DURATION_MS),
    onlineEligibilityLastAttemptResponseShape: env.ONLINE_ELIGIBILITY_LAST_ATTEMPT_RESPONSE_SHAPE,
    onlineEligibilityLastAttemptErrorCode: env.ONLINE_ELIGIBILITY_LAST_ATTEMPT_ERROR_CODE,

    // マイナカードリーダー
    mynaCardReaderMode: (env.MYNA_CARD_READER_MODE as AppEnvConfig['mynaCardReaderMode']) || 'mock',
    mynaCardReaderEndpoint: env.MYNA_CARD_READER_ENDPOINT || '',
    mynaCardReaderAllowMock: env.MYNA_CARD_READER_ALLOW_MOCK !== 'false',
    mynaCardReaderTimeoutMs: parseNumber(env.MYNA_CARD_READER_TIMEOUT_MS, 10000)!,
    mynaCardReaderLastAttemptOutcome: env.MYNA_CARD_READER_LAST_ATTEMPT_OUTCOME,
    mynaCardReaderLastAttemptAt: env.MYNA_CARD_READER_LAST_ATTEMPT_AT,
    mynaCardReaderLastAttemptStatusCode: parseNumber(env.MYNA_CARD_READER_LAST_ATTEMPT_STATUS_CODE),
    mynaCardReaderLastAttemptDurationMs: parseNumber(env.MYNA_CARD_READER_LAST_ATTEMPT_DURATION_MS),
    mynaCardReaderLastAttemptResponseShape: env.MYNA_CARD_READER_LAST_ATTEMPT_RESPONSE_SHAPE,
    mynaCardReaderLastAttemptErrorCode: env.MYNA_CARD_READER_LAST_ATTEMPT_ERROR_CODE,

    // 端末間同期
    syncRole: (env.PHARMACY_SYNC_ROLE as AppEnvConfig['syncRole']) || 'standalone',
    syncHubEndpoint: env.PHARMACY_SYNC_HUB_ENDPOINT || '',
    syncHubToken: env.PHARMACY_SYNC_TERMINAL_TOKEN || '',
    syncTerminalId: env.PHARMACY_SYNC_TERMINAL_ID || '',
    syncTransportEncryption: (env.PHARMACY_SYNC_TRANSPORT_ENCRYPTION as AppEnvConfig['syncTransportEncryption']) || 'none',
    syncTransportKey: env.PHARMACY_SYNC_TRANSPORT_KEY || '',
    syncHubDbPath: env.PHARMACY_SYNC_HUB_DB_PATH || './data/sync_hub.sqlite',
    syncHubEncryptionKey: env.PHARMACY_SYNC_HUB_ENCRYPTION_KEY || '',

    // SQLite WASM / Master Data
    sqliteWasmModuleUrl: env.NEXT_PUBLIC_SQLITE_WASM_MODULE_URL,
    sqliteWasmScriptUrl: env.NEXT_PUBLIC_SQLITE_WASM_SCRIPT_URL,
    sqliteWasmBinaryUrl: env.NEXT_PUBLIC_SQLITE_WASM_BINARY_URL,
    sqliteMasterWorkerUrl: env.NEXT_PUBLIC_SQLITE_MASTER_WORKER_URL,

    // レセプト・マスタ公式 PDF 照合 API
    dispensingUkeOfficialSpecPdfTimeoutMs: parseNumber(env.DISPENSING_UKE_OFFICIAL_SPEC_PDF_TIMEOUT_MS, 20000)!,
    dispensingUkeOfficialSpecPdfMaxBytes: parseNumber(env.DISPENSING_UKE_OFFICIAL_SPEC_PDF_MAX_BYTES, 24 * 1024 * 1024)!,
    drugMasterOfficialSpecPdfTimeoutMs: parseNumber(env.DRUG_MASTER_OFFICIAL_SPEC_PDF_TIMEOUT_MS, 20000)!,
    drugMasterOfficialSpecPdfMaxBytes: parseNumber(env.DRUG_MASTER_OFFICIAL_SPEC_PDF_MAX_BYTES, 24 * 1024 * 1024)!,
    drugMasterOfficialPageTimeoutMs: parseNumber(env.DRUG_MASTER_OFFICIAL_PAGE_TIMEOUT_MS, 20000)!,
    drugMasterOfficialPageMaxBytes: parseNumber(env.DRUG_MASTER_OFFICIAL_PAGE_MAX_BYTES, 10 * 1024 * 1024)!,
    drugMasterOfficialFileTimeoutMs: parseNumber(env.DRUG_MASTER_OFFICIAL_FILE_TIMEOUT_MS, 30000)!,
    drugMasterOfficialFileMaxBytes: parseNumber(env.DRUG_MASTER_OFFICIAL_FILE_MAX_BYTES, 50 * 1024 * 1024)!,
  };
}

export function getAppEnv(): AppEnvConfig {
  return parseEnvConfig(process.env);
}

export function isMockFallbackAllowed(env: AppEnvConfig = getAppEnv()): boolean {
  if (env.nodeEnv === 'production') {
    return false;
  }
  return env.onlineEligibilityAllowMock || env.mynaCardReaderAllowMock;
}

export function isDevelopment(): boolean {
  return (process.env.NODE_ENV || 'development') === 'development';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

export function getDbPassword(): string | undefined {
  return process.env.NEXT_PUBLIC_DB_PASSWORD || undefined;
}
