export interface DbKeyEscrowPayload {
  version: 1;
  algorithm: 'PBKDF2-AES-GCM-256';
  saltHex: string;
  ivHex: string;
  ciphertextHex: string;
  checksumSha256: string;
  createdAt: string;
  issuerRole: 'admin';
  keyFingerprint: string;
}

export interface RestoreDbKeySuccess {
  ok: true;
  dbPassword: string;
  keyFingerprint: string;
}

export interface RestoreDbKeyFailure {
  ok: false;
  reason: string;
}

export type RestoreDbKeyResult = RestoreDbKeySuccess | RestoreDbKeyFailure;

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH = 'SHA-256';
const AES_KEY_LENGTH = 256;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function getCrypto(): Promise<Crypto> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    return globalThis.crypto;
  }
  const { webcrypto } = await import('node:crypto');
  return webcrypto as unknown as Crypto;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const cryptoInstance = await getCrypto();
  const hashBuffer = await cryptoInstance.subtle.digest('SHA-256', data as unknown as BufferSource);
  return bytesToHex(new Uint8Array(hashBuffer));
}

export async function computeKeyFingerprint(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await sha256Hex(encoder.encode(key));
  return hash.substring(0, 12).toUpperCase();
}

/**
 * 管理者パスワードを用いて DB 暗号鍵を AES-GCM-256 で暗号化しエスクローペイロードを生成する
 */
export async function createDbKeyEscrow(
  dbPassword: string,
  adminPassword: string,
  createdAt: string = new Date().toISOString()
): Promise<DbKeyEscrowPayload> {
  if (!dbPassword || typeof dbPassword !== 'string' || dbPassword.trim().length === 0) {
    throw new Error('有効なDB暗号鍵が指定されていません。');
  }
  if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.length < 8) {
    throw new Error('管理者パスワードは8文字以上である必要があります。');
  }

  const cryptoInstance = await getCrypto();
  const encoder = new TextEncoder();

  // 16バイトのランダムソルトと12バイトのランダムIVを生成
  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  cryptoInstance.getRandomValues(salt);
  cryptoInstance.getRandomValues(iv);

  // パスワードからPBKDF2で暗号鍵を導出
  const passwordKey = await cryptoInstance.subtle.importKey(
    'raw',
    encoder.encode(adminPassword),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await cryptoInstance.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH
    },
    passwordKey,
    { name: 'AES-GCM', length: AES_KEY_LENGTH },
    false,
    ['encrypt']
  );

  // DB 暗号鍵を AES-GCM で暗号化
  const plaintextBytes = encoder.encode(dbPassword);
  const ciphertextBuffer = await cryptoInstance.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    aesKey,
    plaintextBytes as unknown as BufferSource
  );

  const ciphertextBytes = new Uint8Array(ciphertextBuffer);
  const checksum = await sha256Hex(plaintextBytes);
  const keyFingerprint = await computeKeyFingerprint(dbPassword);

  return {
    version: 1,
    algorithm: 'PBKDF2-AES-GCM-256',
    saltHex: bytesToHex(salt),
    ivHex: bytesToHex(iv),
    ciphertextHex: bytesToHex(ciphertextBytes),
    checksumSha256: checksum,
    createdAt,
    issuerRole: 'admin',
    keyFingerprint
  };
}

/**
 * 管理者パスワードを用いてエスクローペイロードから DB 暗号鍵を復元・検証する
 */
export async function restoreDbKeyFromEscrow(
  escrow: unknown,
  adminPassword: string
): Promise<RestoreDbKeyResult> {
  if (!escrow || typeof escrow !== 'object') {
    return { ok: false, reason: 'エスクローデータが不正です。' };
  }

  const payload = escrow as Partial<DbKeyEscrowPayload>;
  if (
    payload.version !== 1 ||
    payload.algorithm !== 'PBKDF2-AES-GCM-256' ||
    !payload.saltHex ||
    !payload.ivHex ||
    !payload.ciphertextHex ||
    !payload.checksumSha256
  ) {
    return { ok: false, reason: 'エスクローデータの形式または必須フィールドが不正です。' };
  }

  if (!adminPassword || typeof adminPassword !== 'string') {
    return { ok: false, reason: '管理者パスワードが入力されていません。' };
  }

  try {
    const cryptoInstance = await getCrypto();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const salt = hexToBytes(payload.saltHex);
    const iv = hexToBytes(payload.ivHex);
    const ciphertext = hexToBytes(payload.ciphertextHex);

    const passwordKey = await cryptoInstance.subtle.importKey(
      'raw',
      encoder.encode(adminPassword),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const aesKey = await cryptoInstance.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations: PBKDF2_ITERATIONS,
        hash: PBKDF2_HASH
      },
      passwordKey,
      { name: 'AES-GCM', length: AES_KEY_LENGTH },
      false,
      ['decrypt']
    );

    const decryptedBuffer = await cryptoInstance.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      aesKey,
      ciphertext as unknown as BufferSource
    );

    const decryptedBytes = new Uint8Array(decryptedBuffer);
    const calculatedChecksum = await sha256Hex(decryptedBytes);

    if (calculatedChecksum !== payload.checksumSha256) {
      return { ok: false, reason: '復号後のチェックサムが一致しません。データが破損または改ざんされています。' };
    }

    const restoredKey = decoder.decode(decryptedBytes);
    const fingerprint = payload.keyFingerprint || await computeKeyFingerprint(restoredKey);

    return {
      ok: true,
      dbPassword: restoredKey,
      keyFingerprint: fingerprint
    };
  } catch (error) {
    return {
      ok: false,
      reason: '管理者パスワードが正しくないか、暗号化データの復号に失敗しました。'
    };
  }
}

/**
 * 紙面印刷・緊急復旧用の整形テキストを出力する
 */
export function formatEscrowKeySheetText(escrow: DbKeyEscrowPayload, pharmacyName = '青空薬局'): string {
  const json = JSON.stringify(escrow);
  const base64 = Buffer.from(json, 'utf8').toString('base64');
  return [
    '=== PHARMA-OSS 緊急復旧用 暗号鍵エスクローシート ===',
    `発行施設: ${pharmacyName}`,
    `発行日時: ${escrow.createdAt}`,
    `鍵識別子 (Fingerprint): ${escrow.keyFingerprint}`,
    `暗号方式: ${escrow.algorithm} (PBKDF2 100,000回 / AES-GCM-256)`,
    '--------------------------------------------------',
    '【保管・セキュリティ上の注意】',
    '・本シートは端末障害・ブラウザプロファイル破損時の緊急復旧用です。',
    '・施錠可能な耐火金庫等の安全な場所に保管してください。無断複製厳禁。',
    '・復号には発行時に設定されていた「管理者パスワード」が必要です。',
    '--------------------------------------------------',
    '【エスクローペイロード (Base64)】',
    base64,
    '=================================================='
  ].join('\n');
}

/**
 * 紙面テキストまたはBase64からエスクローペイロードをパースする
 */
export function parseEscrowKeySheetText(input: string): DbKeyEscrowPayload | null {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();

  // 1. そのまま JSON の場合
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.version === 1 && parsed.ciphertextHex) return parsed;
    } catch {
      // ignore
    }
  }

  // 2. Base64 行を含む場合
  const lines = trimmed.split(/\r?\n/);
  for (const line of lines) {
    const cleanLine = line.trim();
    if (!cleanLine || cleanLine.startsWith('=') || cleanLine.startsWith('-') || cleanLine.startsWith('【') || cleanLine.includes(':')) {
      continue;
    }
    try {
      const decoded = Buffer.from(cleanLine, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (parsed.version === 1 && parsed.ciphertextHex) {
        return parsed;
      }
    } catch {
      // try next line
    }
  }

  // 3. 全体が Base64 の場合
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (parsed.version === 1 && parsed.ciphertextHex) {
      return parsed;
    }
  } catch {
    // ignore
  }

  return null;
}
