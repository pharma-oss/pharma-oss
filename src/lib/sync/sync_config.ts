import { AES_GCM_KEY_BYTES, parseHexKey } from './sync_crypto.ts';
import { getAppEnv } from '../env.ts';

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
  PHARMACY_SYNC_SATELLITE_STATE_PATH?: string;
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
  const appEnv = getAppEnv();
  return {
    PHARMACY_SYNC_ROLE: appEnv.syncRole,
    PHARMACY_SYNC_HUB_ENCRYPTION_KEY: appEnv.syncHubEncryptionKey,
    PHARMACY_SYNC_HUB_DB_PATH: appEnv.syncHubDbPath,
    PHARMACY_SYNC_SATELLITE_STATE_PATH: appEnv.syncSatelliteStatePath,
    PHARMACY_SYNC_HUB_ENDPOINT: appEnv.syncHubEndpoint,
    PHARMACY_SYNC_TERMINAL_ID: appEnv.syncTerminalId,
    PHARMACY_SYNC_TERMINAL_TOKEN: appEnv.syncHubToken,
    PHARMACY_SYNC_TRANSPORT_ENCRYPTION: appEnv.syncTransportEncryption,
    PHARMACY_SYNC_TRANSPORT_KEY: appEnv.syncTransportKey
  };
}

export function parseRole(value: string | undefined): PharmacySyncRole | null {
  const role = String(value || 'standalone').trim().toLowerCase();
  return role === 'hub' || role === 'satellite' || role === 'standalone' ? role : null;
}

// `new URL()` は IPv4 を 10進ドット表記へ正規化して返す(例: http://0x7f.1 → 127.0.0.1)。
// 前方一致で判定すると `127.0.0.1.example.com` や `10.example.com` のような「名前」を
// ループバック/LANと取り違え、患者データを平文HTTPのまま外部へ送れてしまう。必ず4つの数値として読む。
function parseIPv4(host: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return null;
  return octets as [number, number, number, number];
}

function isLoopbackHost(host: string): boolean {
  // URL.hostname の IPv6 は角括弧つきで返る
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  return parseIPv4(host)?.[0] === 127;
}

function isPrivateLanHost(host: string): boolean {
  // mDNS 名(例: main-hub.local)は同一リンク内でしか解決されない
  if (host.endsWith('.local')) return true;
  const octets = parseIPv4(host);
  if (!octets) return false;
  const [first, second] = octets;
  return first === 10
    || (first === 192 && second === 168)
    || (first === 172 && second >= 16 && second <= 31);
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

export function parseTransportEncryption(value: string | undefined): PharmacySyncTransportEncryption {
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
