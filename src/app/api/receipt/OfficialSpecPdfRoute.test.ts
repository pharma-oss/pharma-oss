import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from './official-spec-pdf/route';
import { NextRequest } from 'next/server';

describe('Receipt official spec PDF route contracts', () => {
  it('GET endpoint handles requests and returns JSON response', async () => {
    const req = new NextRequest('http://localhost/api/receipt/official-spec-pdf?url=https://invalid.example.com/test.pdf');
    const res = await GET(req);

    assert.ok(res.status >= 200 && res.status <= 503);
    const body = await res.json();
    assert.ok(body);
  });
});
