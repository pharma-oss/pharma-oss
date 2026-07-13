import { NextRequest, NextResponse } from 'next/server';
import { performSyncPush } from '@/lib/sync/sync_client';
import { getHubStoreSingleton, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';
import type { HubPushRow } from '@/lib/sync/hub_store';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { collection?: string; rows?: HubPushRow[] } | null;
  if (!body || typeof body.collection !== 'string' || !Array.isArray(body.rows)) {
    return NextResponse.json({ message: 'push本文の形式が不正です。' }, { status: 400 });
  }

  try {
    const result = await performSyncPush(body.collection, body.rows, { getHubStore: getHubStoreSingleton });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '同期処理で予期しないエラーが発生しました。' }, { status: 500 });
  }
}
