import type { MynaCardReaderResult } from '@/lib/myna_card_reader';

export const MYNA_READ_FAILED_MESSAGE = 'マイナ読取に失敗しました。';

/**
 * 画面から /api/myna/read を呼んで、読取結果を受け取る。
 * 失敗したときは、サーバーの説明(フォルダが空・古い結果・ファイルが読めない等)をそのままメッセージにして投げる。
 */
export async function fetchMynaCardRead(fetchImpl: typeof fetch = fetch): Promise<MynaCardReaderResult> {
  const response = await fetchImpl('/api/myna/read');
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    throw new Error(typeof payload?.message === 'string' && payload.message ? payload.message : MYNA_READ_FAILED_MESSAGE);
  }
  return payload as MynaCardReaderResult;
}
