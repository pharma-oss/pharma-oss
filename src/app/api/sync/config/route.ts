import { NextResponse } from 'next/server';
import { resolvePharmacySyncConfig } from '@/lib/sync/sync_config';
import { HUB_LOCAL_TERMINAL_ID } from '@/lib/sync/hub_store';

// ブラウザが起動時に呼ぶ。役割(hub/satellite/standalone)と、監査ログの端末別チェーンに
// 使う端末IDだけを返す。トークンや接続先URLなどの秘匿情報は一切含めない。
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
  return NextResponse.json({ role: result.config.role, configured: true, ...(terminalId ? { terminalId } : {}) });
}
