import { NextResponse } from 'next/server';
import { resolvePharmacySyncConfig } from '@/lib/sync/sync_config';
import { HUB_LOCAL_TERMINAL_ID } from '@/lib/sync/hub_store';
import { getDefaultSatelliteHubStateStore } from '@/lib/sync/satellite_hub_state';
import { getStandbyHubState } from '@/lib/sync/standby_hub';

// ブラウザが起動時に呼ぶ。役割(hub/satellite/standalone)と、監査ログの端末別チェーンに
// 使う端末ID、サテライトが接続先を切り替えた世代(hubEpoch)だけを返す。トークンや接続先URLなどの
// 秘匿情報は一切含めない。
export async function GET() {
  const result = resolvePharmacySyncConfig();
  if (!result.ok) {
    return NextResponse.json({ role: result.role, configured: false, message: result.message });
  }
  const terminalId = result.config.role === 'hub'
    ? HUB_LOCAL_TERMINAL_ID
    : result.config.role === 'satellite'
      ? result.config.terminalId
      : undefined;
  let hubEpoch = '';
  if (result.config.role === 'satellite') {
    const state = getStandbyHubState({ satelliteHubStateStore: getDefaultSatelliteHubStateStore() });
    if (!state.ok) return NextResponse.json({ role: 'satellite', configured: false, message: state.body.message });
    hubEpoch = state.body.epoch;
  }
  return NextResponse.json({
    role: result.config.role,
    configured: true,
    ...(terminalId ? { terminalId } : {}),
    ...(hubEpoch ? { hubEpoch } : {})
  });
}
