import { decryptAesGcm, encryptAesGcm } from './sync_crypto.ts';
import type { PharmacySyncTransportEncryption } from './sync_config.ts';

export const TERMINAL_ID_HEADER = 'x-yakureki-terminal-id';

export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

interface TransportEncodedPayload {
  encrypted: string;
}

function isTransportEncodedPayload(value: unknown): value is TransportEncodedPayload {
  return !!value && typeof value === 'object' && typeof (value as TransportEncodedPayload).encrypted === 'string';
}

// 施設内LANがHTTPの場合の代替保護として、共有施設鍵でJSON本文をAES-GCM暗号化する。
// hub・satellite双方が同じ PHARMACY_SYNC_TRANSPORT_ENCRYPTION/KEY を設定する運用が前提。
// JSON.parse/stringify前の「値」として扱うため、NextResponse.json()にもfetchのbodyにも
// (JSON.stringifyを挟むだけで)そのまま使える。
export function encodeTransportPayload(
  json: unknown,
  transportEncryption: PharmacySyncTransportEncryption,
  transportKey?: Buffer
): unknown {
  if (transportEncryption === 'aes-gcm' && transportKey) {
    const encrypted = encryptAesGcm(JSON.stringify(json), transportKey);
    const payload: TransportEncodedPayload = { encrypted: encrypted.toString('base64') };
    return payload;
  }
  return json;
}

export function decodeTransportPayload<T>(
  raw: unknown,
  transportEncryption: PharmacySyncTransportEncryption,
  transportKey?: Buffer
): T {
  if (transportEncryption === 'aes-gcm' && transportKey) {
    if (!isTransportEncodedPayload(raw)) {
      throw new Error('暗号化された同期本文の形式が不正です。');
    }
    const plaintext = decryptAesGcm(Buffer.from(raw.encrypted, 'base64'), transportKey);
    return JSON.parse(plaintext) as T;
  }
  if (isTransportEncodedPayload(raw)) {
    throw new Error('平文モードで暗号化済み本文を受信しました。PHARMACY_SYNC_TRANSPORT_ENCRYPTION設定を確認してください。');
  }
  return raw as T;
}
