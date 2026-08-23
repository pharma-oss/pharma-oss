import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from './official-spec-pdf/route';
import { NextRequest } from 'next/server';

describe('Drug master official spec PDF route contracts', () => {
  it('POST reviews extracted PDF text and returns review object', async () => {
    const validSpecText = `
      医薬品マスター仕様書
      項番 項目名 モード 桁数 バイト数 変更区分 医薬品コード 選定療養区分
      1 変更区分 数字 1 1 必須
      2 マスター種別 英数 2 2 必須
      3 医薬品コード 数字 9 9 必須
      4 漢字名称 漢字 100 200
      5 カナ名称 カナ 100 100
      薬価基準収載医薬品コード規格定義
    `;

    const req = new NextRequest('http://localhost/api/drug-master/official-spec-pdf', {
      method: 'POST',
      body: JSON.stringify({
        extractedText: validSpecText,
        fileName: 'spec.pdf'
      })
    });

    const res = await POST(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(body);
    assert.equal(body.fileName, 'spec.pdf');
    assert.ok(body.review);
  });
});
