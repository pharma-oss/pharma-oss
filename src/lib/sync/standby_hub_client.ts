import type { StandbyHubEntry } from './satellite_offline_auth';

// ブラウザ側から、自機サーバーの /api/sync/standby-hub/* を呼ぶ薄い層。
// 署名・署名の検証・切替先への疎通確認・接続先の保存はすべてサーバーが行う(standby_hub.ts)。

export interface StandbyHubStateInfo {
  activeEndpoint: string;
  defaultEndpoint: string;
  overridden: boolean;
  /** 一度も切り替えていなければ空文字 */
  epoch: string;
}

export type StandbyHubCallResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** スキーム・ホスト・ポートが同じなら同じ接続先とみなす(末尾のスラッシュなどの表記ゆれを無視)。 */
export function isSameStandbyEndpoint(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return a === b;
  }
}

const UNREACHABLE_MESSAGE = '自機の同期サーバーへ接続できませんでした。';

function isStateInfo(value: unknown): value is StandbyHubStateInfo {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.activeEndpoint === 'string'
    && typeof v.defaultEndpoint === 'string'
    && typeof v.overridden === 'boolean'
    && typeof v.epoch === 'string';
}

function isEntry(value: unknown): value is StandbyHubEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.endpoint === 'string' && typeof v.issuedAt === 'string' && typeof v.signature === 'string';
}

function messageOf(body: unknown, fallback: string): string {
  const message = body && typeof body === 'object' ? (body as Record<string, unknown>).message : undefined;
  return typeof message === 'string' && message ? message : fallback;
}

async function postJson(url: string, payload: unknown, fetchImpl: typeof fetch): Promise<{ response: Response; body: unknown } | null> {
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { response, body: await response.json().catch(() => null) };
  } catch {
    return null;
  }
}

export async function fetchStandbyHubState(fetchImpl: typeof fetch = fetch): Promise<StandbyHubCallResult<StandbyHubStateInfo>> {
  try {
    const response = await fetchImpl('/api/sync/standby-hub');
    const body = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, message: messageOf(body, '接続先の状態を取得できませんでした。') };
    if (!isStateInfo(body)) return { ok: false, message: '接続先の状態の形式が不正です。' };
    return { ok: true, value: body };
  } catch {
    return { ok: false, message: UNREACHABLE_MESSAGE };
  }
}

/** 予備機の候補をこの端末のトークンで署名してもらう。返ってきたエントリを承認済みリストへ保存する。 */
export async function requestStandbyHubRegistration(
  endpoint: string,
  fetchImpl: typeof fetch = fetch
): Promise<StandbyHubCallResult<StandbyHubEntry>> {
  const result = await postJson('/api/sync/standby-hub/register', { endpoint }, fetchImpl);
  if (!result) return { ok: false, message: UNREACHABLE_MESSAGE };
  if (!result.response.ok) return { ok: false, message: messageOf(result.body, '署名の発行に失敗しました。') };
  if (!isEntry(result.body)) return { ok: false, message: '署名済みエントリの形式が不正です。' };
  return { ok: true, value: result.body };
}

export type HubSwitchTarget = { entry: StandbyHubEntry } | { target: 'default' };

/** サーバーに接続先を切り替えさせる。署名の検証と切替先への疎通確認が通ったときだけ成功する。 */
export async function requestHubSwitch(
  target: HubSwitchTarget,
  fetchImpl: typeof fetch = fetch
): Promise<StandbyHubCallResult<StandbyHubStateInfo>> {
  const result = await postJson('/api/sync/standby-hub/switch', target, fetchImpl);
  if (!result) return { ok: false, message: UNREACHABLE_MESSAGE };
  if (!result.response.ok) return { ok: false, message: messageOf(result.body, '接続先を切り替えられませんでした。') };
  if (!isStateInfo(result.body)) return { ok: false, message: '切替結果の形式が不正です。' };
  return { ok: true, value: result.body };
}
