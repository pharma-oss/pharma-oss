import { NextRequest, NextResponse } from 'next/server';
import { performSyncPull } from '@/lib/sync/sync_client';
import { getHubStoreSingleton, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';

// ブラウザ(自機)から呼ばれるローカル同期エンドポイント。role=hubならハブストアを
// 直接処理し、role=satelliteならこの関数の中で施設内のハブへ転送する。
export async function GET(request: NextRequest) {
  const collection = request.nextUrl.searchParams.get('collection') || '';
  const checkpoint = Number(request.nextUrl.searchParams.get('checkpoint') || '0');
  const batchSize = Number(request.nextUrl.searchParams.get('batchSize') || '200');

  try {
    const result = await performSyncPull(collection, Number.isFinite(checkpoint) ? checkpoint : 0, batchSize, {
      getHubStore: getHubStoreSingleton
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '同期処理で予期しないエラーが発生しました。' }, { status: 500 });
  }
}
