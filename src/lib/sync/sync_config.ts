import { AES_GCM_KEY_BYTES, parseHexKey } from './sync_crypto.ts';

// メイン端末(hub)/サテライト端末(satellite)/従来どおりの単独動作(standalone)を
// 環境変数から解釈する。satellite の endpoint 検証は
// pharmacy_device_connector_client.ts の isAllowedFacilityEndpoint と同じ考え方
// (同一端末のlocalhostはHTTP可、施設内LANはHTTPS必須)を踏襲する。
// 参照: docs/satellite_terminal_sync_plan.md

export type PharmacySyncRole = 'hub' | 'satellite' | 'standalone';
export type PharmacySyncTransportEncryption = 'none' | 'aes-gcm';

export interface PharmacySyncEnv {
  PHARMACY_SYNC_ROLE?: string;
  PHARMACY_SYNC_HUB_ENCRYPTION_KEY?: string;
  PHARMACY_SYNC_HUB_DB_PATH?: string;
  PHARMACY_SYNC_HUB_ENDPOINT?: string;
  PHARMACY_SYNC_TERMINAL_ID?: string;
  PHARMACY_SYNC_TERMINAL_TOKEN?: string;
  PHARMACY_SYNC_TRANSPORT_ENCRYPTION?: string;
  PHARMACY_SYNC_TRANSPORT_KEY?: string;
}

export interface HubSyncConfig {
  role: 'hub';
  dbPath: string;
  encryptionKey: Buffer;
  transportEncryption: PharmacySyncTransportEncryption;
  transportKey?: Buffer;
}

export interface SatelliteSyncConfig {
  role: 'satellite';
  hubEndpoint: string;
  terminalId: string;
  terminalToken: string;
  transportEncryption: PharmacySyncTransportEncryption;
  transportKey?: Buffer;
}

export interface StandaloneSyncConfig {
  role: 'standalone';
}

export type PharmacySyncConfig = HubSyncConfig | SatelliteSyncConfig | StandaloneSyncConfig;

export type PharmacySyncConfigResult =
  | { ok: true; config: PharmacySyncConfig }
  | { ok: false; role: PharmacySyncRole; message: string };

const DEFAULT_HUB_DB_PATH = './data/sync_hub.sqlite';

export function getPharmacySyncEnv(env?: PharmacySyncEnv): PharmacySyncEnv {
  if (env) return env;
  return {
    PHARMACY_SYNC_ROLE: process.env.PHARMACY_SYNC_ROLE,
    PHARMACY_SYNC_HUB_ENCRYPTION_KEY: process.env.PHARMACY_SYNC_HUB_ENCRYPTION_KEY,
    PHARMACY_SYNC_HUB_DB_PATH: process.env.PHARMACY_SYNC_HUB_DB_PATH,
    PHARMACY_SYNC_HUB_ENDPOINT: process.env.PHARMACY_SYNC_HUB_ENDPOINT,
    PHARMACY_SYNC_TERMINAL_ID: process.env.PHARMACY_SYNC_TERMINAL_ID,
    PHARMACY_SYNC_TERMINAL_TOKEN: process.env.PHARMACY_SYNC_TERMINAL_TOKEN,
    PHARMACY_SYNC_TRANSPORT_ENCRYPTION: process.env.PHARMACY_SYNC_TRANSPORT_ENCRYPTION,
    PHARMACY_SYNC_TRANSPORT_KEY: process.env.PHARMACY_SYNC_TRANSPORT_KEY
  };
}

function parseRole(value: string | undefined): PharmacySyncRole | null {
  const role = String(value || 'standalone').trim().toLowerCase();
  return role === 'hub' || role === 'satellite' || role === 'standalone' ? role : null;
}

function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}

function isPrivateLanHost(host: string): boolean {
  if (host.endsWith('.local') || host.startsWith('10.') || host.startsWith('192.168.')) return true;
  const parts = host.split('.').map(Number);
  return parts.length === 4
    && parts.every(Number.isInteger)
    && parts[0] === 172
    && parts[1] >= 16
    && parts[1] <= 31;
}

export function isAllowedHubEndpoint(endpoint: string, transportEncryption: PharmacySyncTransportEncryption): boolean {
  try {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (isLoopbackHost(host)) return true;
    if (url.protocol === 'https:') return isPrivateLanHost(host);
    // 施設内LANでのHTTPは、ペイロード自体を共有施設鍵で暗号化する場合だけ許可する。
    return transportEncryption === 'aes-gcm' && isPrivateLanHost(host);
  } catch {
    return false;
  }
}

function parseTransportEncryption(value: string | undefined): PharmacySyncTransportEncryption {
  return String(value || 'none').trim().toLowerCase() === 'aes-gcm' ? 'aes-gcm' : 'none';
}

export function resolvePharmacySyncConfig(env?: PharmacySyncEnv): PharmacySyncConfigResult {
  const resolvedEnv = getPharmacySyncEnv(env);
  const role = parseRole(resolvedEnv.PHARMACY_SYNC_ROLE);
  if (!role) {
    return { ok: false, role: 'standalone', message: 'PHARMACY_SYNC_ROLE は hub, satellite, standalone のいずれかを設定してください。' };
  }

  if (role === 'standalone') {
    return { ok: true, config: { role: 'standalone' } };
  }

  const transportEncryption = parseTransportEncryption(resolvedEnv.PHARMACY_SYNC_TRANSPORT_ENCRYPTION);
  let transportKey: Buffer | undefined;
  if (transportEncryption === 'aes-gcm') {
    const parsedKey = parseHexKey(resolvedEnv.PHARMACY_SYNC_TRANSPORT_KEY);
    if (!parsedKey) {
      return {
        ok: false,
        role,
        message: `PHARMACY_SYNC_TRANSPORT_ENCRYPTION=aes-gcmの場合、PHARMACY_SYNC_TRANSPORT_KEY に${AES_GCM_KEY_BYTES}バイト(16進64文字)の鍵を設定してください。`
      };
    }
    transportKey = parsedKey;
  }

  if (role === 'hub') {
    const encryptionKey = parseHexKey(resolvedEnv.PHARMACY_SYNC_HUB_ENCRYPTION_KEY);
    if (!encryptionKey) {
      return {
        ok: false,
        role,
        message: `PHARMACY_SYNC_HUB_ENCRYPTION_KEY に${AES_GCM_KEY_BYTES}バイト(16進64文字)の鍵を設定してください。`
      };
    }
    const dbPath = resolvedEnv.PHARMACY_SYNC_HUB_DB_PATH?.trim() || DEFAULT_HUB_DB_PATH;
    return { ok: true, config: { role: 'hub', dbPath, encryptionKey, transportEncryption, transportKey } };
  }

  // role === 'satellite'
  const hubEndpoint = resolvedEnv.PHARMACY_SYNC_HUB_ENDPOINT?.trim();
  if (!hubEndpoint || !isAllowedHubEndpoint(hubEndpoint, transportEncryption)) {
    return {
      ok: false,
      role,
      message: '患者情報を扱うため、メイン端末の接続先は同一端末のlocalhost、施設内LANのHTTPS、'
        + 'またはPHARMACY_SYNC_TRANSPORT_ENCRYPTION=aes-gcmを設定したHTTPのいずれかにしてください。'
    };
  }
  const terminalId = resolvedEnv.PHARMACY_SYNC_TERMINAL_ID?.trim();
  if (!terminalId) {
    return { ok: false, role, message: 'PHARMACY_SYNC_TERMINAL_ID を設定してください。' };
  }
  const terminalToken = resolvedEnv.PHARMACY_SYNC_TERMINAL_TOKEN?.trim();
  if (!terminalToken) {
    return { ok: false, role, message: 'PHARMACY_SYNC_TERMINAL_TOKEN を設定してください。' };
  }

  return {
    ok: true,
    config: { role, hubEndpoint, terminalId, terminalToken, transportEncryption, transportKey }
  };
}
