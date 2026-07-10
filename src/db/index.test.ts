import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('database migration helper fills every RxDB migration step', () => {
  assert.match(source, /for \(let nextVersion = 1; nextVersion <= schema\.version; nextVersion\+\+\)/);
  assert.match(source, /strategies\[nextVersion\] = zeroBasedStrategies\[nextVersion - 1\] \|\| keepDocument/);
});
