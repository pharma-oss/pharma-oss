import type { HubStore } from './hub_store.ts';
import type { SyncOperationResult } from './sync_client.ts';

// メイン端末の設定画面(Phase 3で実装)が使う、サテライト端末の登録・トークン再発行・
// 失効ロジック。トークンは発行/再発行のレスポンスに一度だけ含まれ、ハブ側にはハッシュしか
// 残らない。運用者がこのレスポンスをサテライト端末の .env へ手動で転記する。
// 参照: docs/satellite_terminal_sync_plan.md

const TERMINAL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/;

export function isValidTerminalId(terminalId: string): boolean {
  return TERMINAL_ID_PATTERN.test(terminalId);
}

export interface RegisterTerminalResult {
  terminalId: string;
  label: string;
  token: string;
}

export function registerTerminal(store: HubStore, terminalId: string, label: string): SyncOperationResult<RegisterTerminalResult> {
  const trimmedId = terminalId.trim();
  const trimmedLabel = label.trim();
  if (!isValidTerminalId(trimmedId)) {
    return {
      ok: false,
      status: 400,
      body: { message: '端末IDは英数字・ハイフン・アンダースコアで2〜64文字にしてください。' }
    };
  }
  if (!trimmedLabel) {
    return { ok: false, status: 400, body: { message: '端末のラベル(設置場所など)を入力してください。' } };
  }
  try {
    const { token } = store.registerTerminal(trimmedId, trimmedLabel);
    return { ok: true, status: 201, body: { terminalId: trimmedId, label: trimmedLabel, token } };
  } catch {
    return { ok: false, status: 409, body: { message: `端末ID ${trimmedId} は既に登録されています。` } };
  }
}

export function rotateTerminalToken(store: HubStore, terminalId: string): SyncOperationResult<{ terminalId: string; token: string }> {
  const trimmedId = terminalId.trim();
  if (!isValidTerminalId(trimmedId)) {
    return { ok: false, status: 400, body: { message: '端末IDの形式が不正です。' } };
  }
  const { token } = store.rotateTerminalToken(trimmedId);
  return { ok: true, status: 200, body: { terminalId: trimmedId, token } };
}

export function revokeTerminal(store: HubStore, terminalId: string): SyncOperationResult<{ terminalId: string; revoked: true }> {
  const trimmedId = terminalId.trim();
  if (!isValidTerminalId(trimmedId)) {
    return { ok: false, status: 400, body: { message: '端末IDの形式が不正です。' } };
  }
  store.revokeTerminal(trimmedId);
  return { ok: true, status: 200, body: { terminalId: trimmedId, revoked: true } };
}

export function listTerminals(store: HubStore): SyncOperationResult<{ terminals: ReturnType<HubStore['listTerminals']> }> {
  return { ok: true, status: 200, body: { terminals: store.listTerminals() } };
}
