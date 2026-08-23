import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('./read/route.ts', import.meta.url), 'utf8');

test('myna read route can use a configured card-reader bridge', () => {
  assert.match(routeSource, /readMynaCard/);
  assert.match(routeSource, /MynaCardReaderError/);
  assert.match(routeSource, /getAppEnv/);
  assert.match(routeSource, /mynaCardReaderEndpoint/);
  assert.match(routeSource, /mynaCardReaderMode/);
  assert.match(routeSource, /mynaCardReaderAllowMock/);
  assert.match(routeSource, /mynaCardReaderTimeoutMs/);
  assert.match(routeSource, /myna_reader_unexpected_error/);
});
