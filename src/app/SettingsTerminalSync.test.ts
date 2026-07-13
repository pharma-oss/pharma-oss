import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsSource = readFileSync(new URL('./settings/page.tsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('../components/TerminalSyncPanel.tsx', import.meta.url), 'utf8');
const indicatorSource = readFileSync(new URL('../components/SyncStatusIndicator.tsx', import.meta.url), 'utf8');
const layoutSource = readFileSync(new URL('./ClientLayout.tsx', import.meta.url), 'utf8');

test('settings exposes a terminal sync tab gated by facility management permission', () => {
  assert.match(settingsSource, /'terminalSync'/);
  assert.match(settingsSource, /openTab\('terminalSync', 'manage_facility_settings'\)/);
  assert.match(settingsSource, /端末同期（メイン端末集約）/);
  assert.match(settingsSource, /<TerminalSyncPanel \/>/);
});

test('terminal sync panel registers/rotates/revokes terminals and reviews conflicts on the hub', () => {
  assert.match(panelSource, /\/api\/sync\/terminals/);
  assert.match(panelSource, /action: 'rotate'/);
  assert.match(panelSource, /method: 'DELETE'/);
  assert.match(panelSource, /\/api\/sync\/conflicts\?resolved=false/);
  assert.match(panelSource, /確認済みにする/);
  // 端末登録系の操作は監査ログに残す
  assert.match(panelSource, /logAuditAction/);
  assert.match(panelSource, /サテライト端末登録/);
  assert.match(panelSource, /サテライト端末トークン再発行/);
  assert.match(panelSource, /サテライト端末失効/);
  // トークンは一度だけ表示し、サテライトの .env へ転記する運用
  assert.match(panelSource, /この画面にしか表示されません/);
  assert.match(panelSource, /PHARMACY_SYNC_TERMINAL_TOKEN/);
});

test('terminal sync panel explains satellite/standalone roles without exposing admin operations', () => {
  assert.match(panelSource, /この端末はサテライト端末です/);
  assert.match(panelSource, /端末同期は無効です/);
});

test('sync status indicator renders per-role states and warns before closing an unsynced satellite tab', () => {
  assert.match(indicatorSource, /beforeunload/);
  assert.match(indicatorSource, /role !== 'satellite'/);
  assert.match(indicatorSource, /同期済み/);
  assert.match(indicatorSource, /同期中…/);
  assert.match(indicatorSource, /メイン端末未接続/);
  // standaloneでは何も描画しない(既存インストールのUIを変えない)
  assert.match(indicatorSource, /if \(role === 'standalone'\) return null;/);
  // 同期済みのときは警告なしで閉じられる
  assert.match(indicatorSource, /if \(indicatorRef\.current === 'synced'\) return;/);
});

test('client layout mounts the sync status indicator in the top bar', () => {
  assert.match(layoutSource, /import \{ SyncStatusIndicator \} from '@\/components\/SyncStatusIndicator'/);
  assert.match(layoutSource, /<SyncStatusIndicator \/>/);
});
