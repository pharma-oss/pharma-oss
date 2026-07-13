import { NextRequest, NextResponse } from 'next/server';
import { getHubStoreSingleton, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';

type RouteContext = { params: Promise<{ conflictId: string }> };

// 競合を「確認済み」として記録する。resolvedBy には確認した薬剤師/管理者名を渡す。
export async function POST(request: NextRequest, context: RouteContext) {
  const { conflictId } = await context.params;
  const body = await request.json().catch(() => null) as { resolvedBy?: string } | null;
  const resolvedBy = body?.resolvedBy?.trim();
  if (!resolvedBy) {
    return NextResponse.json({ message: '確認者名(resolvedBy)を指定してください。' }, { status: 400 });
  }

  try {
    const store = getHubStoreSingleton();
    store.resolveConflict(conflictId, resolvedBy);
    return NextResponse.json({ conflictId, resolved: true });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '競合の確認記録で予期しないエラーが発生しました。' }, { status: 500 });
  }
}
