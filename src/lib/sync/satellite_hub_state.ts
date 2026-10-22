import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  getPharmacySyncEnv,
  isAllowedHubEndpoint,
  type PharmacySyncEnv,
  type SatelliteSyncConfig
} from './sync_config.ts';

// サテライト端末が「いま」どのメイン端末(ハブ)につながっているか、を保持する。
// 環境変数 PHARMACY_SYNC_HUB_ENDPOINT は起動時の既定値で、サーバーは書き換えられない。
// 「設定 > 端末同期」で予備機へ切り替えた結果は、このファイルに保存して再起動後も引き継ぐ。
// ファイルが無ければ環境変数の既定の接続先を使う(従来の動作)。
// 端末トークンは環境変数のまま変わらない(予備機にも同じ端末が登録されている前提)。

export const DEFAULT_SATELLITE_STATE_PATH = './data/satellite_hub_state.json';

export interface SatelliteHubState {
  /** 既定の接続先の代わりに使うハブ。null は「既定(環境変数)へ戻した」状態。 */
  endpoint: string | null;
  /**
   * 接続先を切り替えるたびに作り直す世代。ブラウザ側のレプリケーション識別子に入り、
   * 切替後は pull を最初からやり直す(replication_client.ts の replicationEpoch)。
   */
  epoch: string;
  switchedAt: string;
}

export interface SatelliteHubStateStore {
  /** 保存が無ければ null。壊れていれば SatelliteHubStateCorruptError を投げる。 */
  read(): SatelliteHubState | null;
  /** 保存に失敗したら例外を投げる(切替が効いたように見せないため)。 */
  write(state: SatelliteHubState): void;
}

export class SatelliteHubStateCorruptError extends Error {
  constructor(public readonly filePath: string) {
    super(`接続先の保存ファイル(${filePath})を読み取れません。ファイルを削除すると既定の接続先(PHARMACY_SYNC_HUB_ENDPOINT)に戻ります。`);
    this.name = 'SatelliteHubStateCorruptError';
  }
}

const EPOCH_PATTERN = /^[a-z0-9]{4,40}$/;

export function isValidHubEpoch(value: unknown): value is string {
  return typeof value === 'string' && EPOCH_PATTERN.test(value);
}

export function generateHubEpoch(now: Date = new Date()): string {
  return `${now.getTime().toString(36)}${randomBytes(3).toString('hex')}`;
}

function parseState(raw: string): SatelliteHubState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { endpoint, epoch, switchedAt } = parsed as Record<string, unknown>;
  if (endpoint !== null && typeof endpoint !== 'string') return null;
  if (!isValidHubEpoch(epoch)) return null;
  if (typeof switchedAt !== 'string') return null;
  return { endpoint: endpoint as string | null, epoch, switchedAt };
}

export function createFileSatelliteHubStateStore(filePath: string): SatelliteHubStateStore {
  return {
    read() {
      let raw: string;
      try {
        raw = readFileSync(filePath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new SatelliteHubStateCorruptError(filePath);
      }
      const state = parseState(raw);
      if (!state) throw new SatelliteHubStateCorruptError(filePath);
      return state;
    },
    write(state) {
      mkdirSync(dirname(filePath), { recursive: true });
      // 書きかけのファイルを残さないよう、同じ場所へ書いてから置き換える
      const tempPath = `${filePath}.tmp`;
      writeFileSync(tempPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
      renameSync(tempPath, filePath);
    }
  };
}

export function getDefaultSatelliteHubStateStore(env?: PharmacySyncEnv): SatelliteHubStateStore {
  const path = getPharmacySyncEnv(env).PHARMACY_SYNC_SATELLITE_STATE_PATH?.trim() || DEFAULT_SATELLITE_STATE_PATH;
  return createFileSatelliteHubStateStore(path);
}

export type EffectiveSatelliteConfigResult =
  | { ok: true; config: SatelliteSyncConfig; state: SatelliteHubState | null }
  | { ok: false; message: string };

/**
 * 環境変数から作った既定の設定に、保存済みの接続先(切替結果)を重ねる。
 * 保存された接続先が今の許可規則に合わなくなっていたら、黙って既定へ戻さず設定エラーにする
 * (気づかないまま別のハブへつながり続けるより、止まって知らせるほうが安全)。
 */
export function applySatelliteHubState(
  config: SatelliteSyncConfig,
  store: SatelliteHubStateStore
): EffectiveSatelliteConfigResult {
  let state: SatelliteHubState | null;
  try {
    state = store.read();
  } catch (error) {
    if (error instanceof SatelliteHubStateCorruptError) return { ok: false, message: error.message };
    throw error;
  }
  if (!state || state.endpoint === null) return { ok: true, config, state };
  if (!isAllowedHubEndpoint(state.endpoint, config.transportEncryption)) {
    return {
      ok: false,
      message: `保存されている接続先(${state.endpoint})は、現在の設定では許可されません。`
        + '「設定 > 端末同期」でメイン端末へ戻すか、保存ファイルを削除してください。'
    };
  }
  return { ok: true, config: { ...config, hubEndpoint: state.endpoint }, state };
}
