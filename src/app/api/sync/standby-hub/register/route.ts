import { NextRequest, NextResponse } from 'next/server';
import { signStandbyHubEntry } from '@/lib/sync/standby_hub';
import { isSameOriginJsonRequest } from '@/lib/sync/sync_http';

// 予備機の候補(エンドポイント)に、この端末のトークンで署名して返す。署名はこの端末のサーバーだけが
// 行える(ブラウザにトークンは渡らない)。ブラウザは返ってきたエントリを承認済みリストに保存し、
// 切替のときにサーバーが署名を検証し直す。
export async function POST(request: NextRequest) {
  if (!isSameOriginJsonRequest(request.headers)) {
    return NextResponse.json({ message: '許可されないリクエストです。' }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  const result = signStandbyHubEntry(body?.endpoint);
  return NextResponse.json(result.body, { status: result.status });
}
