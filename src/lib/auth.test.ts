import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const authSource = readFileSync(new URL('./auth.ts', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../app/settings/page.tsx', import.meta.url), 'utf8');
const dbTypesSource = readFileSync(new URL('../db/types.ts', import.meta.url), 'utf8');

test('registerPasskey does not save a production mock public key for real credentials', () => {
  assert.doesNotMatch(authSource, /let publicKey = 'mock-pk-'/);
  assert.match(authSource, /Public key unavailable\. Saving development-only simulated public key\./);
  assert.match(authSource, /パスキー登録結果から公開鍵を取得できませんでした/);
  assert.match(authSource, /!ALLOW_DEV_FALLBACK_AUTH/);
});

test('staff credential copy reflects PBKDF2 password hashing', () => {
  assert.match(dbTypesSource, /PBKDF2-SHA-256 hashed password/);
  assert.match(settingsSource, /ソルト付きPBKDF2-SHA-256/);
  assert.match(settingsSource, /設定済み \(PBKDF2-SHA-256\)/);
  assert.doesNotMatch(settingsSource, /ソルト付きSHA-256ハッシュ化/);
  assert.doesNotMatch(settingsSource, /設定済み \(SHA-256ハッシュ\)/);
});
