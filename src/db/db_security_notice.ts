export interface DbSecurityNoticeFlags {
  storagePersistenceDenied: boolean;
  legacyKeyInUse: boolean;
}

export interface DbSecurityBannerItem {
  id: 'legacy_key' | 'missing_env_password' | 'storage_persistence_denied';
  prefix: string;
  headline: string;
  detail: string;
  includesEnvCode?: boolean;
}

export interface DbSecurityBannerState {
  showBanner: boolean;
  isCritical: boolean;
  items: DbSecurityBannerItem[];
}

export type DbSecurityNoticeListener = (flags: DbSecurityNoticeFlags) => void;

const state: DbSecurityNoticeFlags = {
  storagePersistenceDenied: false,
  legacyKeyInUse: false
};

const listeners = new Set<DbSecurityNoticeListener>();

function emit(): void {
  const snapshot: DbSecurityNoticeFlags = { ...state };
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[DbSecurityNotice] Listener invocation failed:', error);
    }
  }
}

export function recordStoragePersistenceDenied(): void {
  if (state.storagePersistenceDenied) return;
  state.storagePersistenceDenied = true;
  emit();
}

export function recordLegacyDbKeyInUse(): void {
  if (state.legacyKeyInUse) return;
  state.legacyKeyInUse = true;
  emit();
}

export function getDbSecurityNoticeFlags(): DbSecurityNoticeFlags {
  return { ...state };
}

export function subscribeDbSecurityNotice(
  listener: DbSecurityNoticeListener
): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => {
    listeners.delete(listener);
  };
}

export function _resetDbSecurityNoticeForTesting(): void {
  state.storagePersistenceDenied = false;
  state.legacyKeyInUse = false;
  listeners.clear();
}

export interface StoragePersistLike {
  persist?: () => Promise<boolean>;
}

/**
 * ブラウザに IndexedDB の永続化を要求し、拒否された場合・失敗した場合は通知フラグを立てる（P5-2）。
 */
export async function requestAndTrackStoragePersistence(
  storage: StoragePersistLike | undefined | null,
  onDenied: () => void = recordStoragePersistenceDenied
): Promise<boolean | null> {
  if (!storage || typeof storage.persist !== 'function') {
    return null;
  }
  try {
    const isPersisted = await storage.persist();
    if (isPersisted) {
      console.log('Storage successfully persisted.');
      return true;
    }
    console.warn('Storage persistence not granted.');
    onDenied();
    return false;
  } catch (error) {
    console.error('Error requesting storage persistence:', error);
    onDenied();
    return false;
  }
}

export function resolveDbSecurityBannerState(params: {
  missingEnvPassword: boolean;
  storagePersistenceDenied: boolean;
  legacyKeyInUse: boolean;
}): DbSecurityBannerState {
  const items: DbSecurityBannerItem[] = [];

  if (params.legacyKeyInUse) {
    items.push({
      id: 'legacy_key',
      prefix: '【緊急】',
      headline: '旧固定暗号鍵でデータベースを開いています。',
      detail: '公開されている既知の鍵のため、暗号化バックアップを書き出し、NEXT_PUBLIC_DB_PASSWORD を設定した環境で復旧して新しい鍵へ移行してください。'
    });
  }

  if (params.missingEnvPassword) {
    items.push({
      id: 'missing_env_password',
      prefix: '【本番運用上の注意】',
      headline: 'DB暗号鍵（NEXT_PUBLIC_DB_PASSWORD）が未設定です。',
      detail: 'ブラウザプロファイル喪失時に復号不能となるリスクがあります。本番運用前に設定してください。',
      includesEnvCode: true
    });
  }

  if (params.storagePersistenceDenied) {
    items.push({
      id: 'storage_persistence_denied',
      prefix: '【データ保全の注意】',
      headline: 'ブラウザによる保存領域の永続化が許可されませんでした。',
      detail: 'ディスク容量不足時にブラウザがデータを自動削除するおそれがあります。空き容量を確保し、定期的なバックアップを取得してください。'
    });
  }

  return {
    showBanner: items.length > 0,
    isCritical: params.legacyKeyInUse,
    items
  };
}
