import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('database migration helper fills every RxDB migration step', () => {
  assert.match(source, /for \(let nextVersion = 1; nextVersion <= schema\.version; nextVersion\+\+\)/);
  assert.match(source, /strategies\[nextVersion\] = zeroBasedStrategies\[nextVersion - 1\] \|\| keepDocument/);
});

test('satellite role uses memory storage and skips local-password/reference-data seeding', () => {
  assert.match(source, /import \{ resolveClientSyncRole \} from '@\/lib\/sync\/client_role'/);
  assert.match(source, /const syncRole = await resolveClientSyncRole\(\)/);
  assert.match(source, /if \(syncRole === 'satellite'\) \{\s*\n\s*return createSatelliteDatabase\(collectionDefinitions\);/);
  assert.match(source, /async function createSatelliteDatabase[\s\S]*?getRxStorageMemory\(\)/);
  // patients等のスキーマがRxDBのフィールド暗号化を宣言しているため、メモリストレージにも
  // 暗号化ラッパー(使い捨てのランダム鍵)が必要 — localStorageの永続鍵は使わない。
  assert.match(source, /async function createSatelliteDatabase[\s\S]*?wrappedKeyEncryptionCryptoJsStorage/);
  assert.match(source, /async function createSatelliteDatabase[\s\S]*?password: generateRandomPassword\(\)/);

  // satellite分岐は collectionDefinitions と activeCollectionCount のチェックより後、
  // resolveDbPassword()(localStorage永続鍵)より前になければならない
  // (患者データをディスクへ書く永続鍵の解決より前に早期returnする必要があるため)。
  const satelliteBranchIndex = source.indexOf("if (syncRole === 'satellite')");
  const passwordIndex = source.indexOf('const password = resolveDbPassword();');
  assert.ok(satelliteBranchIndex > 0 && passwordIndex > satelliteBranchIndex);
});
