// ブラウザが自機の /api/sync/config を叩いて役割と端末IDを知るための薄いヘルパー。
// PHARMACY_SYNC_* 環境変数はサーバー側にしかないため(NEXT_PUBLIC_*ではない)、
// クライアントは必ずこの HTTP 経由でしか役割を知り得ない。取得に失敗した場合は
// 既存インストールの動作を壊さないよう standalone にフォールバックする。
// 端末IDは秘密情報ではない(秘密なのはトークン)。監査ログの端末別チェーンに使う。

export type ClientSyncRole = 'hub' | 'satellite' | 'standalone';

export interface ClientSyncIdentity {
  role: ClientSyncRole;
  terminalId?: string;
}

export interface ResolveClientSyncRoleOptions {
  fetchImpl?: typeof fetch;
}

// db/index.ts(DB作成時)・DatabaseProvider(レプリケーション起動時)・audit.ts(ログ署名時)が
// 参照するため、既定パス(fetchImpl未指定)は1回のHTTP取得を共有する。
let cachedIdentityPromise: Promise<ClientSyncIdentity> | null = null;

/** テスト専用: キャッシュ済みの役割・端末IDを破棄して再取得させる。 */
export function resetClientSyncIdentityCacheForTests(): void {
  cachedIdentityPromise = null;
}

export async function resolveClientSyncIdentity(options: ResolveClientSyncRoleOptions = {}): Promise<ClientSyncIdentity> {
  if (typeof window === 'undefined') return { role: 'standalone' };
  if (!options.fetchImpl) {
    if (!cachedIdentityPromise) {
      cachedIdentityPromise = fetchClientSyncIdentity(fetch);
    }
    return cachedIdentityPromise;
  }
  return fetchClientSyncIdentity(options.fetchImpl);
}

export async function resolveClientSyncRole(options: ResolveClientSyncRoleOptions = {}): Promise<ClientSyncRole> {
  return (await resolveClientSyncIdentity(options)).role;
}

async function fetchClientSyncIdentity(fetchImpl: typeof fetch): Promise<ClientSyncIdentity> {
  try {
    const response = await fetchImpl('/api/sync/config');
    if (!response.ok) return { role: 'standalone' };
    const body = await response.json();
    if (body.role !== 'hub' && body.role !== 'satellite') return { role: 'standalone' };
    const terminalId = typeof body.terminalId === 'string' && body.terminalId.trim()
      ? body.terminalId.trim()
      : undefined;
    return { role: body.role, terminalId };
  } catch {
    return { role: 'standalone' };
  }
}
