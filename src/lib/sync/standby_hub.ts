import { computeStandbyHubHmac, verifyStandbyHubHmac, type StandbyHubEntry } from './satellite_offline_auth.ts';
import {
  applySatelliteHubState,
  generateHubEpoch,
  type SatelliteHubState
} from './satellite_hub_state.ts';
import { fetchWithTimeout, type SyncClientOptions, type SyncOperationResult } from './sync_client.ts';
import { isAllowedHubEndpoint, resolvePharmacySyncConfig, type PharmacySyncTransportEncryption, type SatelliteSyncConfig } from './sync_config.ts';
import { decodeTransportPayload, TERMINAL_ID_HEADER } from './sync_http.ts';
import type { HubPullResult } from './hub_store.ts';

// サテライト端末が、メイン端末(ハブ)の故障時に予備機へ接続先を切り替えるための自機サーバー側の処理。
// 予備機の候補は端末トークンで署名して(register)ブラウザに保存させ、切替の要求(switch)で署名を
// 検証し直す。ハブは端末トークンの「ハッシュ」しか持たないため、署名はこの端末のサーバーが行う。
// 切替の前に、予備機がこの端末を受け付けることを実際に確かめる(受け付けないハブへ切り替えると、
// 同期が 401 になり、端末が失効したものとしてキャッシュを消去してしまうため)。

export interface StandbyHubStateView {
  activeEndpoint: string;
  defaultEndpoint: string;
  overridden: boolean;
  /** 一度も切り替えていなければ空文字。レプリケーション識別子に入る。 */
  epoch: string;
  switchedAt?: string;
}

export type SwitchHubRequest = { target: 'default' } | { entry: StandbyHubEntry };

type HubFailure = { ok: false; status: number; body: { message: string } };

function fail(status: number, message: string): HubFailure {
  return { ok: false, status, body: { message } };
}

export const STANDBY_ENDPOINT_NOT_ALLOWED_MESSAGE =
  '接続先 URL が許可されていません（LAN 経由の接続には HTTPS または転送暗号化 (aes-gcm) が必要です）。';

/**
 * 接続先を「スキーム + ホスト + ポート」に正規化する。認証情報つきの URL や、許可されない接続先は null。
 * 同期の呼び出しは接続先のパスを使わない(常に /api/sync/remote/* を付ける)ので、パスは捨てる。
 */
export function normalizeHubEndpoint(raw: string, transportEncryption: PharmacySyncTransportEncryption): string | null {
  try {
    const url = new URL(String(raw).trim());
    if (url.username || url.password) return null;
    if (!isAllowedHubEndpoint(url.origin, transportEncryption)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isSameEndpoint(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return a === b;
  }
}

function isStandbyEntry(value: unknown): value is StandbyHubEntry {
  if (!value || typeof value !== 'object') return false;
  const { endpoint, issuedAt, signature } = value as Record<string, unknown>;
  return typeof endpoint === 'string' && typeof issuedAt === 'string' && typeof signature === 'string'
    && Boolean(endpoint) && Boolean(issuedAt) && Boolean(signature);
}

function resolveSatelliteBaseConfig(options: SyncClientOptions): { ok: true; config: SatelliteSyncConfig } | HubFailure {
  const configResult = resolvePharmacySyncConfig(options.env);
  if (!configResult.ok) return fail(500, configResult.message);
  if (configResult.config.role !== 'satellite') {
    return fail(400, 'この操作はサテライト端末でのみ実行可能です。');
  }
  return { ok: true, config: configResult.config };
}

export function getStandbyHubState(options: SyncClientOptions = {}): SyncOperationResult<StandbyHubStateView> {
  const base = resolveSatelliteBaseConfig(options);
  if (!base.ok) return base;
  if (!options.satelliteHubStateStore) {
    return { ok: true, status: 200, body: viewOf(base.config, base.config, null) };
  }
  const effective = applySatelliteHubState(base.config, options.satelliteHubStateStore);
  if (!effective.ok) return fail(500, effective.message);
  return { ok: true, status: 200, body: viewOf(base.config, effective.config, effective.state) };
}

function viewOf(base: SatelliteSyncConfig, effective: SatelliteSyncConfig, state: SatelliteHubState | null): StandbyHubStateView {
  return {
    activeEndpoint: effective.hubEndpoint,
    defaultEndpoint: base.hubEndpoint,
    overridden: Boolean(state && state.endpoint !== null),
    epoch: state?.epoch ?? '',
    ...(state ? { switchedAt: state.switchedAt } : {})
  };
}

/** 予備機の候補を、この端末のトークンで署名した承認済みエントリにして返す。 */
export function signStandbyHubEntry(
  rawEndpoint: unknown,
  options: SyncClientOptions = {},
  now: Date = new Date()
): SyncOperationResult<StandbyHubEntry> {
  const base = resolveSatelliteBaseConfig(options);
  if (!base.ok) return base;
  if (typeof rawEndpoint !== 'string' || !rawEndpoint.trim()) {
    return fail(400, '予備機エンドポイントを入力してください。');
  }
  const endpoint = normalizeHubEndpoint(rawEndpoint, base.config.transportEncryption);
  if (!endpoint) return fail(400, STANDBY_ENDPOINT_NOT_ALLOWED_MESSAGE);
  const issuedAt = now.toISOString();
  const signature = computeStandbyHubHmac(endpoint, issuedAt, base.config.terminalToken);
  return { ok: true, status: 200, body: { endpoint, issuedAt, signature } };
}

type ProbeResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * 切替先が、この端末を受け付けるハブで、スタッフ情報(users)が復旧済みであることを確かめる。
 * 読むのは users の先頭1件だけで、何も書かない。
 */
export async function probeHubForSwitch(
  endpoint: string,
  config: SatelliteSyncConfig,
  label: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProbeResult> {
  const url = new URL('/api/sync/remote/pull', endpoint);
  url.searchParams.set('collection', 'users');
  url.searchParams.set('checkpoint', '0');
  url.searchParams.set('batchSize', '1');
  let response: Response;
  try {
    response = await fetchWithTimeout(fetchImpl, url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.terminalToken}`,
        [TERMINAL_ID_HEADER]: config.terminalId
      }
    }, 6_000);
  } catch {
    return {
      ok: false,
      status: 503,
      message: `${label}（${endpoint}）へ接続できませんでした。${label}が起動していること、同期ゲートウェイが動いていること、LAN の接続を確認してください。`
    };
  }
  if (response.status === 401) {
    return {
      ok: false,
      status: 422,
      message: `${label}がこの端末（${config.terminalId}）を認証しませんでした。`
        + `${label}にこの端末とトークンが復旧されているか確認してください（メイン端末のハブストア（SQLite）ファイルをバックアップから復旧すると、端末の登録も戻ります）。`
    };
  }
  if (response.status === 404) {
    return { ok: false, status: 422, message: `${label}（${endpoint}）はメイン端末（hub）として動いていません。` };
  }
  if (!response.ok) {
    return { ok: false, status: 422, message: `${label}が同期の確認を受け付けませんでした（HTTP ${response.status}）。` };
  }
  try {
    const body = decodeTransportPayload<HubPullResult>(await response.json(), config.transportEncryption, config.transportKey);
    if (!Array.isArray(body.documents) || body.documents.length === 0) {
      return {
        ok: false,
        status: 422,
        message: `${label}にスタッフ情報が復旧されていません。バックアップの復旧が済んでいるか確認してください。`
      };
    }
  } catch {
    return {
      ok: false,
      status: 422,
      message: `${label}の応答を読み取れませんでした。転送暗号化の設定（PHARMACY_SYNC_TRANSPORT_*）が${label}と同じか確認してください。`
    };
  }
  return { ok: true };
}

/** 予備機(または既定のメイン端末)へ接続先を切り替え、結果を保存する。 */
export async function switchSatelliteHub(
  request: unknown,
  options: SyncClientOptions = {},
  now: Date = new Date()
): Promise<SyncOperationResult<StandbyHubStateView>> {
  const base = resolveSatelliteBaseConfig(options);
  if (!base.ok) return base;
  const config = base.config;
  const store = options.satelliteHubStateStore;
  if (!store) return fail(500, '接続先の保存先が設定されていません。');

  let targetEndpoint: string;
  let storedEndpoint: string | null;
  let label: string;
  const body = (request && typeof request === 'object' ? request : {}) as Record<string, unknown>;
  if (body.target === 'default') {
    targetEndpoint = config.hubEndpoint;
    storedEndpoint = null;
    label = 'メイン端末';
  } else {
    if (!isStandbyEntry(body.entry)) return fail(400, '切替先の予備機が指定されていません。');
    if (!verifyStandbyHubHmac(body.entry, config.terminalToken)) {
      return fail(403, '予備機候補の HMAC 署名検証に失敗しました。不正または改ざんされたエントリです。登録し直してください。');
    }
    const normalized = normalizeHubEndpoint(body.entry.endpoint, config.transportEncryption);
    if (!normalized) return fail(400, STANDBY_ENDPOINT_NOT_ALLOWED_MESSAGE);
    targetEndpoint = normalized;
    storedEndpoint = isSameEndpoint(normalized, config.hubEndpoint) ? null : normalized;
    label = '予備機';
  }

  // 保存ファイルが壊れていても、切り替え(戻す操作を含む)で直せるようにする
  let currentEndpoint: string | null = config.hubEndpoint;
  try {
    const current = store.read();
    if (current && current.endpoint !== null) currentEndpoint = current.endpoint;
  } catch {
    currentEndpoint = null;
  }
  if (currentEndpoint !== null && isSameEndpoint(currentEndpoint, targetEndpoint)) {
    return fail(409, `すでに${label}（${targetEndpoint}）につながっています。`);
  }

  const probe = await probeHubForSwitch(targetEndpoint, config, label, options.fetchImpl || fetch);
  if (!probe.ok) return fail(probe.status, probe.message);

  const nextState: SatelliteHubState = { endpoint: storedEndpoint, epoch: generateHubEpoch(now), switchedAt: now.toISOString() };
  try {
    store.write(nextState);
  } catch {
    return fail(500, '接続先を保存できませんでした。保存先フォルダの書き込み権限と空き容量を確認してください。接続先は変わっていません。');
  }
  return {
    ok: true,
    status: 200,
    body: viewOf(config, { ...config, hubEndpoint: targetEndpoint }, nextState)
  };
}
