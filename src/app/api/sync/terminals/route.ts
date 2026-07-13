import { NextRequest, NextResponse } from 'next/server';
import { listTerminals, registerTerminal } from '@/lib/sync/terminal_admin';
import { getHubStoreSingleton, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';

// メイン端末の設定画面(Phase 3)からサテライト端末を登録する。
// 発行したトークンはこのレスポンスにだけ含まれ、ハブ側にはハッシュしか残らない。
// 運用者がレスポンスの token をサテライト端末の .env(PHARMACY_SYNC_TERMINAL_TOKEN)へ
// 手動で転記する。

export async function GET() {
  try {
    const result = listTerminals(getHubStoreSingleton());
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '端末一覧の取得で予期しないエラーが発生しました。' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { terminalId?: string; label?: string } | null;
  if (!body || typeof body.terminalId !== 'string' || typeof body.label !== 'string') {
    return NextResponse.json({ message: '端末IDとラベルを指定してください。' }, { status: 400 });
  }

  try {
    const result = registerTerminal(getHubStoreSingleton(), body.terminalId, body.label);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '端末登録で予期しないエラーが発生しました。' }, { status: 500 });
  }
}
