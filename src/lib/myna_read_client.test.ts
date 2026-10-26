import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchMynaCardRead, MYNA_READ_FAILED_MESSAGE } from '@/lib/myna_read_client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('fetchMynaCardRead', () => {
  it('読取結果をそのまま返し、/api/myna/read を呼ぶ', async () => {
    const calls: string[] = [];
    const result = await fetchMynaCardRead((async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return jsonResponse({ name: '山田 太郎', birthDate: '1985-03-15', readerSource: 'folder' });
    }) as typeof fetch);
    assert.deepEqual(calls, ['/api/myna/read']);
    assert.equal(result.name, '山田 太郎');
    assert.equal(result.readerSource, 'folder');
  });

  it('失敗したときは、サーバーの説明をそのままメッセージにして投げる', async () => {
    await assert.rejects(
      fetchMynaCardRead((async () => jsonResponse({ status: 'unavailable', message: '連携フォルダに資格確認結果がありません。' }, 502)) as typeof fetch),
      { message: '連携フォルダに資格確認結果がありません。' }
    );
  });

  it('説明が無い・JSONでない失敗は、既定の文言にする', async () => {
    await assert.rejects(
      fetchMynaCardRead((async () => new Response('Internal Server Error', { status: 500 })) as typeof fetch),
      { message: MYNA_READ_FAILED_MESSAGE }
    );
    await assert.rejects(
      fetchMynaCardRead((async () => jsonResponse({ status: 'unavailable' }, 500)) as typeof fetch),
      { message: MYNA_READ_FAILED_MESSAGE }
    );
  });

  it('通信自体が失敗したときは、その例外を投げる', async () => {
    await assert.rejects(
      fetchMynaCardRead((async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch),
      { message: 'Failed to fetch' }
    );
  });
});
