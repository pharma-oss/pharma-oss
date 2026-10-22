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

/**
 * 接続先のような端末の設定を変える要求が、自機の画面(同一オリジン)から来たかを確かめる。
 * 他のサイトのページが、ブラウザ経由で 127.0.0.1 の API を叩いて設定を書き換えるのを防ぐ。
 * ブラウザの POST には Origin が付くので、あれば Host と一致することを求める。
 * 本文は JSON に限る(フォーム送信などの「単純リクエスト」を弾く)。
 */
export function isSameOriginJsonRequest(headers: Pick<Headers, 'get'>): boolean {
  const contentType = headers.get('content-type') || '';
  if (!/^application\/json(\s*;|$)/i.test(contentType.trim())) return false;
  const origin = headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === headers.get('host');
  } catch {
    return false;
  }
}
