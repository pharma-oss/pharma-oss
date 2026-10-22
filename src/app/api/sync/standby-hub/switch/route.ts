import { NextRequest, NextResponse } from 'next/server';
import { switchSatelliteHub } from '@/lib/sync/standby_hub';
import { getDefaultSatelliteHubStateStore } from '@/lib/sync/satellite_hub_state';
import { isSameOriginJsonRequest } from '@/lib/sync/sync_http';

// サテライト端末の接続先を、署名済みの予備機(または既定のメイン端末 `{ "target": "default" }`)へ切り替える。
// 署名の検証と切替先への疎通確認がすべて通ったときだけ、接続先を保存する。
export async function POST(request: NextRequest) {
  if (!isSameOriginJsonRequest(request.headers)) {
    return NextResponse.json({ message: '許可されないリクエストです。' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const result = await switchSatelliteHub(body, { satelliteHubStateStore: getDefaultSatelliteHubStateStore() });
  return NextResponse.json(result.body, { status: result.status });
}
