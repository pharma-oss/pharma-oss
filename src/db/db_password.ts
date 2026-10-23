export class DbKeyStorageUnavailableError extends Error {
  readonly code = 'DB_KEY_STORAGE_UNAVAILABLE';
  readonly causeName: string | null;

  constructor(cause?: unknown) {
    super(
      'このブラウザでは暗号化キーを保存できないため、データベースを開けません。プライベートブラウズを終了するか、ブラウザの保存領域（localStorage）の利用を許可して、再読み込みしてください。'
    );
    this.name = 'DbKeyStorageUnavailableError';
    if (
      cause &&
      typeof cause === 'object' &&
      'name' in cause &&
      typeof (cause as { name?: unknown }).name === 'string' &&
      (cause as { name: string }).name.length > 0
    ) {
      this.causeName = (cause as { name: string }).name;
    } else {
      this.causeName = null;
    }
    if (cause && typeof cause === 'object' && 'stack' in cause) {
      this.stack = `${this.stack}\nCaused by: ${(cause as Error).stack}`;
    }
  }
}

export const LOCAL_DB_PASSWORD_KEY = 'pharmacy_os_local_db_password';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WindowLike {
  localStorage?: StorageLike | null;
}

export function generateRandomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getOrCreateLocalDbPassword(
  storage: StorageLike | null | undefined,
  generateKey: () => string = generateRandomPassword
): string {
  if (!storage) {
    throw new DbKeyStorageUnavailableError(new Error('Storage is unavailable in this environment'));
  }
  try {
    const existing = storage.getItem(LOCAL_DB_PASSWORD_KEY);
    if (existing) return existing;
    const generated = generateKey();
    storage.setItem(LOCAL_DB_PASSWORD_KEY, generated);
    return generated;
  } catch (e) {
    console.error('Failed to persist or access local DB encryption key in browser storage:', e);
    throw new DbKeyStorageUnavailableError(e);
  }
}

export function resolveDbPassword(
  configuredPassword: string | undefined,
  storage: StorageLike | null | undefined,
  generateKey: () => string = generateRandomPassword
): string {
  if (configuredPassword) return configuredPassword;
  console.warn(
    'NEXT_PUBLIC_DB_PASSWORD is not set. Using a randomly generated, ' +
    'per-install encryption key stored in this browser profile. Set ' +
    'NEXT_PUBLIC_DB_PASSWORD explicitly before production use — see README.md.'
  );
  return getOrCreateLocalDbPassword(storage, generateKey);
}

export function resolveDbPasswordWithWindow(
  configuredPassword: string | undefined,
  windowObj: WindowLike | null | undefined,
  generateKey: () => string = generateRandomPassword
): string {
  if (configuredPassword) return configuredPassword;

  let storage: StorageLike | null | undefined;
  if (windowObj) {
    try {
      storage = windowObj.localStorage;
    } catch (e) {
      console.error('Failed to access window.localStorage for DB encryption key:', e);
      throw new DbKeyStorageUnavailableError(e);
    }
  } else {
    storage = null;
  }

  return resolveDbPassword(configuredPassword, storage, generateKey);
}

export interface DatabaseErrorCardViewState {
  title: string;
  description: string;
  errorLabel: '詳細' | 'エラー';
  errorMessage: string | null;
}

export const DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION =
  'このブラウザでは暗号化キーを保存できないため、データベースを開けません。プライベートブラウズを終了するか、ブラウザの保存領域（localStorage）の利用を許可して、再読み込みしてください。';

export const DB_DEFAULT_ERROR_DESCRIPTION =
  '患者データ保護のため、アプリは自動削除や自動初期化を実行していません。バックアップの有無を確認し、管理者の復旧手順に従ってください。';

export function getDatabaseErrorCardViewState(error: unknown): DatabaseErrorCardViewState {
  if (error instanceof DbKeyStorageUnavailableError) {
    return {
      title: 'ローカルデータベースを開けません',
      description: DB_KEY_STORAGE_UNAVAILABLE_DESCRIPTION,
      errorLabel: '詳細',
      errorMessage: error.causeName
    };
  }

  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '不明なエラー';

  return {
    title: 'ローカルデータベースを開けません',
    description: DB_DEFAULT_ERROR_DESCRIPTION,
    errorLabel: 'エラー',
    errorMessage: message
  };
}
