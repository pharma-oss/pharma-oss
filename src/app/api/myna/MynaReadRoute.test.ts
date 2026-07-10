import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('./read/route.ts', import.meta.url), 'utf8');

test('myna read route can use a configured card-reader bridge', () => {
  assert.match(routeSource, /readMynaCard/);
  assert.match(routeSource, /MynaCardReaderError/);
  assert.match(routeSource, /MYNA_CARD_READER_ENDPOINT/);
  assert.match(routeSource, /MYNA_CARD_READER_MODE/);
  assert.match(routeSource, /MYNA_CARD_READER_ALLOW_MOCK/);
  assert.match(routeSource, /allowMockFallback/);
  assert.match(routeSource, /MYNA_CARD_READER_TIMEOUT_MS/);
  assert.match(routeSource, /myna_reader_unexpected_error/);
});
