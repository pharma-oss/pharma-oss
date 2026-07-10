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

test('DatabaseProvider exposes onboarding E2E seed bridge only outside production', () => {
  assert.match(source, /__yakurekiSeedOnboardingE2E/);
  assert.match(source, /__yakurekiSeedReturnCorrectionE2E/);
  assert.match(source, /process\.env\.NODE_ENV === 'production'/);
  assert.match(source, /seedOnboardingE2EData/);
  assert.match(source, /seedReturnCorrectionE2EData/);
});
