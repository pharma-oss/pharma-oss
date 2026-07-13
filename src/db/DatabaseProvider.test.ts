import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./DatabaseProvider.tsx', import.meta.url), 'utf8');

test('DatabaseProvider export exists', () => {
  assert.match(source, /export function DatabaseProvider/);
});

test('DatabaseProvider surfaces database initialization failures', () => {
  assert.match(source, /setDbError/);
  assert.match(source, /自動削除や自動初期化を実行していません/);
});

test('DatabaseProvider starts replication for hub/satellite and gates satellite login on initial sync', () => {
  assert.match(source, /resolveClientSyncRole/);
  assert.match(source, /startAppReplication/);
  assert.match(source, /awaitSatelliteLoginGate/);
  assert.match(source, /setSatelliteSyncing\(true\)/);
  assert.match(source, /メイン端末からデータを取得しています/);

  // サテライトの初回同期ゲートは setDb より前に await されなければならない
  // (usersが空のままログイン画面を出さないため)。
  const gateIndex = source.indexOf('await awaitSatelliteLoginGate(handle)');
  const setDbIndex = source.indexOf('setDb(_db)');
  assert.ok(gateIndex > 0 && setDbIndex > gateIndex);
});

test('DatabaseProvider exposes onboarding E2E seed bridge only outside production', () => {
  assert.match(source, /__yakurekiSeedOnboardingE2E/);
  assert.match(source, /__yakurekiSeedReturnCorrectionE2E/);
  assert.match(source, /process\.env\.NODE_ENV === 'production'/);
  assert.match(source, /seedOnboardingE2EData/);
  assert.match(source, /seedReturnCorrectionE2EData/);
});
