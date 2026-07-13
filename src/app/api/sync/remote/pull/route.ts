import { NextRequest, NextResponse } from 'next/server';
import { handleRemotePull } from '@/lib/sync/sync_remote';
import { TERMINAL_ID_HEADER } from '@/lib/sync/sync_http';
import { getHubStoreSingleton, getHubSyncConfigOrThrow, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';

// サテライト端末の自機サーバーが、施設内LAN越しにこのエンドポイントを叩く。
// Bearerトークン + 端末IDの認証が必須(hub自身のブラウザは /api/sync/pull を使うため
// ここを通らない)。
export async function GET(request: NextRequest) {
  let store;
  let hubConfig;
  try {
    hubConfig = getHubSyncConfigOrThrow();
    store = getHubStoreSingleton();
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '同期処理で予期しないエラーが発生しました。' }, { status: 500 });
  }

  const result = handleRemotePull({
    authorizationHeader: request.headers.get('authorization'),
    terminalId: request.headers.get(TERMINAL_ID_HEADER),
    store,
    collection: request.nextUrl.searchParams.get('collection') || '',
    checkpointSeq: Number(request.nextUrl.searchParams.get('checkpoint') || '0'),
    batchSize: Number(request.nextUrl.searchParams.get('batchSize') || '200'),
    transportEncryption: hubConfig.transportEncryption,
    transportKey: hubConfig.transportKey
  });
  return NextResponse.json(result.body, { status: result.status });
}
