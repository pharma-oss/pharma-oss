import { NextRequest, NextResponse } from 'next/server';
import { handleRemotePush } from '@/lib/sync/sync_remote';
import { TERMINAL_ID_HEADER } from '@/lib/sync/sync_http';
import { getHubStoreSingleton, getHubSyncConfigOrThrow, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';

export async function POST(request: NextRequest) {
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

  const rawBody = await request.json().catch(() => null);
  if (rawBody === null) {
    return NextResponse.json({ message: 'push本文の形式が不正です。' }, { status: 400 });
  }

  const result = handleRemotePush({
    authorizationHeader: request.headers.get('authorization'),
    terminalId: request.headers.get(TERMINAL_ID_HEADER),
    store,
    rawBody,
    transportEncryption: hubConfig.transportEncryption,
    transportKey: hubConfig.transportKey
  });
  return NextResponse.json(result.body, { status: result.status });
}
