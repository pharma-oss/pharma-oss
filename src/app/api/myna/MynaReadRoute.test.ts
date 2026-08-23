import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from './read/route';

describe('Myna card reader route contracts', () => {
  it('GET returns a response object with patient or error data', async () => {
    const res = await GET();
    assert.ok(res.status >= 200 && res.status <= 503);

    const body = await res.json();
    assert.ok(body);
    assert.ok(body.readerSource || body.status || body.code);
  });
});
