import { NextResponse } from 'next/server';
import { getSyncStatus } from '@/lib/sync/sync_client';
import { getHubStoreSingleton, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';

export async function GET() {
  try {
    const result = await getSyncStatus({ getHubStore: getHubStoreSingleton });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '同期状態の取得で予期しないエラーが発生しました。' }, { status: 500 });
  }
}
