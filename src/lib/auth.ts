import { User } from '@/db/types';

const ALLOW_DEV_FALLBACK_AUTH = process.env.NODE_ENV === 'development';
const PASSWORD_DERIVE_ITERATIONS = 120000;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a cryptographically secure random salt.
 */
export function generateSalt(): string {
  const array = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    if (!ALLOW_DEV_FALLBACK_AUTH) {
      throw new Error('安全な乱数生成APIを利用できません。');
    }
    // Development-only fallback for non-secure local contexts.
    for (let i = 0; i < 16; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToHex(array);
}

/**
 * Hashes a password with a salt using PBKDF2-SHA-256.
 * The password is NEVER saved in plain text.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    if (!ALLOW_DEV_FALLBACK_AUTH) {
      throw new Error('安全なパスワードハッシュAPIを利用できません。');
    }
    return legacySha256PasswordHash(password, salt);
  }

  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: PASSWORD_DERIVE_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

async function legacySha256PasswordHash(password: string, salt: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    if (!ALLOW_DEV_FALLBACK_AUTH) {
      throw new Error('安全なパスワードハッシュAPIを利用できません。');
    }
    return fallbackSimpleHash(password + salt);
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

export async function verifyPassword(password: string, user: User): Promise<boolean> {
  if (!user.passwordHash || !user.salt) {
    return false;
  }

  const derivedHash = await hashPassword(password, user.salt);
  if (derivedHash === user.passwordHash) {
    return true;
  }

  // Existing installations may contain the older single SHA-256 hash.
  const legacyHash = await legacySha256PasswordHash(password, user.salt);
  return legacyHash === user.passwordHash;
}

function fallbackSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * ArrayBuffer helper utilities for WebAuthn.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Registers a new Passkey (WebAuthn) for a staff member.
 */
export async function registerPasskey(user: User): Promise<{ credentialId: string; publicKey: string }> {
  if (typeof window === 'undefined' || !window.navigator.credentials) {
    throw new Error('お使いのブラウザはパスキー（WebAuthn）に対応していません。');
  }

  // Check if WebAuthn is supported and user is in a secure context
  const isWebAuthnSupported = await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.();
  if (!isWebAuthnSupported) {
    if (ALLOW_DEV_FALLBACK_AUTH) {
      console.warn('Platform authenticator not available. Creating development mock passkey instead.');
      return createMockPasskey();
    }
    throw new Error('パスキーに対応したデバイス認証を利用できません。');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const userIdBuffer = new TextEncoder().encode(user.userId);

  const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: 'pharma-oss Pharmacy OS',
      id: window.location.hostname
    },
    user: {
      id: userIdBuffer,
      name: user.name,
      displayName: `${user.name} (${user.role})`
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' }, // ES256
      { alg: -257, type: 'public-key' } // RS256
    ],
    timeout: 60000,
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Touch ID / Face ID / Windows Hello
      userVerification: 'required',
      residentKey: 'required'
    }
  };

  try {
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    }) as PublicKeyCredential;

    if (!credential) {
      throw new Error('パスキーの作成に失敗しました。');
    }

    const credentialId = bufferToBase64(credential.rawId);
    
    // Extract public key if available. In production, avoid storing a simulated key
    // for a real credential because it makes credential diagnostics misleading.
    let publicKey: string | undefined;
    const response = credential.response as AuthenticatorAttestationResponse;
    if (response.getPublicKey) {
      try {
        const pkBuffer = response.getPublicKey();
        if (pkBuffer) {
          publicKey = bufferToBase64(pkBuffer);
        }
      } catch (e) {
        console.error('Failed to get public key from WebAuthn credential:', e);
      }
    }

    if (!publicKey) {
      if (!ALLOW_DEV_FALLBACK_AUTH) {
        throw new Error('パスキー登録結果から公開鍵を取得できませんでした。ブラウザまたはOSの対応状況を確認してください。');
      }
      console.warn('Public key unavailable. Saving development-only simulated public key.');
      publicKey = 'dev-mock-pubkey-' + generateSalt();
    }

    return { credentialId, publicKey };
  } catch (err: any) {
    console.error('WebAuthn Registration Error:', err);
    if (err.name === 'NotAllowedError') {
      throw new Error('パスキーの登録がキャンセルされました。');
    }
    if (err.name === 'SecurityError') {
      if (ALLOW_DEV_FALLBACK_AUTH) {
        console.warn('SecurityError. Falling back to local simulated Passkey in development.');
        return createMockPasskey();
      }
      throw new Error('パスキー登録にはHTTPSまたは安全な実行環境が必要です。');
    }
    throw new Error(`パスキーの登録に失敗しました: ${err.message || err}`);
  }
}

/**
 * Authenticates a staff member using a registered Passkey.
 */
export async function authenticatePasskey(user: User): Promise<boolean> {
  if (!user.passkeyCredentialId) {
    throw new Error('このスタッフにはパスキーが登録されていません。');
  }

  if (user.passkeyCredentialId.startsWith('mock-')) {
    if (!ALLOW_DEV_FALLBACK_AUTH) {
      throw new Error('本番環境ではシミュレーション用パスキーを利用できません。');
    }
    // Development-only simulated credential.
    return await simulateMockPasskeyVerification(user);
  }

  if (typeof window === 'undefined' || !window.navigator.credentials) {
    throw new Error('お使いのブラウザはパスキー（WebAuthn）に対応していません。');
  }

  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const credentialIdBuffer = base64ToBuffer(user.passkeyCredentialId);

  const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    allowCredentials: [
      {
        id: credentialIdBuffer,
        type: 'public-key'
      }
    ],
    timeout: 60000,
    userVerification: 'required'
  };

  try {
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions
    }) as PublicKeyCredential;

    return !!assertion;
  } catch (err: any) {
    console.error('WebAuthn Authentication Error:', err);
    if (err.name === 'NotAllowedError') {
      throw new Error('パスキーによる認証がキャンセルされました。');
    }
    if (err.name === 'SecurityError') {
      if (ALLOW_DEV_FALLBACK_AUTH) {
        return simulateMockPasskeyVerification(user);
      }
      throw new Error('パスキー認証にはHTTPSまたは安全な実行環境が必要です。');
    }
    throw new Error(`パスキー認証に失敗しました: ${err.message || err}`);
  }
}

/**
 * Secure mock passkey generator & verifier for local testing/sandboxes (graceful fallback).
 */
function createMockPasskey(): { credentialId: string; publicKey: string } {
  const credentialId = 'mock-cred-' + generateSalt();
  const publicKey = 'mock-pubkey-' + generateSalt();
  return { credentialId, publicKey };
}

async function simulateMockPasskeyVerification(user: User): Promise<boolean> {
  return new Promise((resolve) => {
    // Beautiful dynamic overlay notification simulation if standard WebAuthn is unavailable
    const confirmSwitch = window.confirm(
      `🔑 パスキーの検証（シミュレーション）\n\nデバイス認証（Touch ID / Face ID など）を模擬します。\nユーザー「${user.name}」としてログインしますか？`
    );
    resolve(confirmSwitch);
  });
}
