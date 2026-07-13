import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// ハブストアの at-rest 暗号化と、LAN が HTTP の場合の transport 暗号化の両方で使う
// 共通の AES-256-GCM ヘルパー。鍵は常に32バイト(hex64文字)。

export const AES_GCM_KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export function isValidAesGcmKey(key: Buffer): boolean {
  return key.length === AES_GCM_KEY_BYTES;
}

export function parseHexKey(hex: string | undefined): Buffer | null {
  const trimmed = (hex || '').trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) return null;
  return Buffer.from(trimmed, 'hex');
}

export function encryptAesGcm(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptAesGcm(buf: Buffer, key: Buffer): string {
  const iv = buf.subarray(0, IV_BYTES);
  const authTag = buf.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + AUTH_TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
