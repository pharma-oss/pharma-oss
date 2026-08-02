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
  // 調剤機器コネクタ
  pharmacyDeviceConnectorMode: 'mock' | 'live' | 'disabled';
  pharmacyDeviceConnectorEndpoint: string;
  pharmacyDeviceConnectorBearerToken: string;
  pharmacyDeviceConnectorSimulatorEnabled: boolean;
  pharmacyDeviceConnectorCapabilities: string;
  pharmacyDeviceConnectorTimeoutMs: number;
  // オンライン資格確認
  onlineEligibilityMode: 'mock' | 'live' | 'disabled';
  onlineEligibilityEndpoint: string;
  onlineEligibilityBearerToken: string;
  onlineEligibilityAllowMock: boolean;
  onlineEligibilityTimeoutMs: number;
  // マイナカードリーダー
  mynaCardReaderMode: 'mock' | 'live' | 'disabled';
  mynaCardReaderEndpoint: string;
  mynaCardReaderAllowMock: boolean;
  mynaCardReaderTimeoutMs: number;
  // 端末間同期
  syncRole: 'standalone' | 'hub' | 'satellite';
  syncHubEndpoint: string;
  syncHubToken: string;
  syncTerminalId: string;
  syncTransportEncryption: 'none' | 'aes-gcm';
  syncTransportKey: string;
  syncHubDbPath: string;
  syncHubEncryptionKey: string;
}

export function parseEnvConfig(env: Record<string, string | undefined> = process.env): AppEnvConfig {
  const nodeEnv = (env.NODE_ENV as AppEnvConfig['nodeEnv']) || 'development';

  return {
    dbPassword: env.NEXT_PUBLIC_DB_PASSWORD || undefined,
    nodeEnv,
    electronicPrescriptionMode: (env.ELECTRONIC_PRESCRIPTION_MODE as AppEnvConfig['electronicPrescriptionMode']) || 'mock',
    electronicPrescriptionEndpoint: env.ELECTRONIC_PRESCRIPTION_ENDPOINT || '',
    electronicPrescriptionBearerToken: env.ELECTRONIC_PRESCRIPTION_BEARER_TOKEN || '',
    electronicPrescriptionCapabilities: env.ELECTRONIC_PRESCRIPTION_CAPABILITIES || '',
    electronicPrescriptionTimeoutMs: Number(env.ELECTRONIC_PRESCRIPTION_TIMEOUT_MS) || 10000,

    pharmacyDeviceConnectorMode: (env.PHARMACY_DEVICE_CONNECTOR_MODE as AppEnvConfig['pharmacyDeviceConnectorMode']) || 'mock',
    pharmacyDeviceConnectorEndpoint: env.PHARMACY_DEVICE_CONNECTOR_ENDPOINT || '',
    pharmacyDeviceConnectorBearerToken: env.PHARMACY_DEVICE_CONNECTOR_BEARER_TOKEN || '',
    // 定義名を PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED に完全統合
    pharmacyDeviceConnectorSimulatorEnabled: env.PHARMACY_DEVICE_CONNECTOR_SIMULATOR_ENABLED === 'true' || env.PHARMACY_DEVICE_SIMULATOR_ENABLED === 'true',
    pharmacyDeviceConnectorCapabilities: env.PHARMACY_DEVICE_CONNECTOR_CAPABILITIES || '',
    pharmacyDeviceConnectorTimeoutMs: Number(env.PHARMACY_DEVICE_CONNECTOR_TIMEOUT_MS) || 10000,

    onlineEligibilityMode: (env.ONLINE_ELIGIBILITY_MODE as AppEnvConfig['onlineEligibilityMode']) || 'mock',
    onlineEligibilityEndpoint: env.ONLINE_ELIGIBILITY_ENDPOINT || '',
    onlineEligibilityBearerToken: env.ONLINE_ELIGIBILITY_BEARER_TOKEN || '',
    onlineEligibilityAllowMock: env.ONLINE_ELIGIBILITY_ALLOW_MOCK !== 'false',
    onlineEligibilityTimeoutMs: Number(env.ONLINE_ELIGIBILITY_TIMEOUT_MS) || 10000,

    mynaCardReaderMode: (env.MYNA_CARD_READER_MODE as AppEnvConfig['mynaCardReaderMode']) || 'mock',
    mynaCardReaderEndpoint: env.MYNA_CARD_READER_ENDPOINT || '',
    mynaCardReaderAllowMock: env.MYNA_CARD_READER_ALLOW_MOCK !== 'false',
    mynaCardReaderTimeoutMs: Number(env.MYNA_CARD_READER_TIMEOUT_MS) || 10000,

    syncRole: (env.PHARMACY_SYNC_ROLE as AppEnvConfig['syncRole']) || 'standalone',
    syncHubEndpoint: env.PHARMACY_SYNC_HUB_ENDPOINT || '',
    syncHubToken: env.PHARMACY_SYNC_TERMINAL_TOKEN || '',
    syncTerminalId: env.PHARMACY_SYNC_TERMINAL_ID || '',
    syncTransportEncryption: (env.PHARMACY_SYNC_TRANSPORT_ENCRYPTION as AppEnvConfig['syncTransportEncryption']) || 'none',
    syncTransportKey: env.PHARMACY_SYNC_TRANSPORT_KEY || '',
    syncHubDbPath: env.PHARMACY_SYNC_HUB_DB_PATH || './data/sync_hub.sqlite',
    syncHubEncryptionKey: env.PHARMACY_SYNC_HUB_ENCRYPTION_KEY || '',
  };
}

export function getAppEnv(): AppEnvConfig {
  return parseEnvConfig(process.env);
}

export function isMockFallbackAllowed(env: AppEnvConfig = getAppEnv()): boolean {
  // 本番環境 (production) ではモック・シミュレータを完全無効化
  if (env.nodeEnv === 'production') {
    return false;
  }
  return env.onlineEligibilityAllowMock || env.mynaCardReaderAllowMock;
}
