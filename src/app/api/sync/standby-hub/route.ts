import { NextResponse } from 'next/server';
import { getStandbyHubState } from '@/lib/sync/standby_hub';
import { getDefaultSatelliteHubStateStore } from '@/lib/sync/satellite_hub_state';

// サテライト端末の画面が、いまの接続先と、既定(環境変数)の接続先を知るための読み取り専用API。
// 端末トークンは含めない。
export async function GET() {
  const result = getStandbyHubState({ satelliteHubStateStore: getDefaultSatelliteHubStateStore() });
  return NextResponse.json(result.body, { status: result.status });
}
