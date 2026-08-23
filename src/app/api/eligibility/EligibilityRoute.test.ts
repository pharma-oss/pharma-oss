import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from './check/route';
import { NextRequest } from 'next/server';

describe('Online eligibility check route contracts', () => {
  it('rejects request with missing insuranceNumber with 400 status', async () => {
    const req = new NextRequest('http://localhost/api/eligibility/check', {
      method: 'POST',
      body: JSON.stringify({})
    });

    const res = await POST(req);
    assert.equal(res.status, 400);

    const body = await res.json();
    assert.equal(body.status, 'warning');
    assert.equal(body.resultCode, '02');
    assert.ok(body.message.includes('保険者番号'));
  });

  it('handles invalid insuranceNumber length gracefully', async () => {
    const req = new NextRequest('http://localhost/api/eligibility/check', {
      method: 'POST',
      body: JSON.stringify({ insuranceNumber: '123' })
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'warning');
    assert.equal(body.resultCode, '02');
    assert.ok(body.message.includes('桁数'));
  });
});
