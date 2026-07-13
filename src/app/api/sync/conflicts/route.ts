import { NextRequest, NextResponse } from 'next/server';
import { getHubStoreSingleton, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';

// メイン端末の設定画面が競合(ハブ優先で負けた書き込み)をレビューするための一覧。
// 患者データを含むため、メイン端末自身のブラウザ(同一オリジン)からのみ使う想定。
// サテライト・standaloneでは404。
export async function GET(request: NextRequest) {
  try {
    const store = getHubStoreSingleton();
    const resolvedParam = request.nextUrl.searchParams.get('resolved');
    const resolved = resolvedParam === null ? undefined : resolvedParam === 'true';
    const conflicts = store.listConflicts(resolved === undefined ? undefined : { resolved });
    return NextResponse.json({ conflicts });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '競合一覧の取得で予期しないエラーが発生しました。' }, { status: 500 });
  }
}
