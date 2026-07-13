import { NextRequest, NextResponse } from 'next/server';
import { revokeTerminal, rotateTerminalToken } from '@/lib/sync/terminal_admin';
import { getHubStoreSingleton, HubRoleUnavailableError } from '@/lib/sync/hub_store_singleton';

type RouteContext = { params: Promise<{ terminalId: string }> };

// POST { action: 'rotate' } でトークン再発行、DELETE で失効する。
export async function POST(request: NextRequest, context: RouteContext) {
  const { terminalId } = await context.params;
  const body = await request.json().catch(() => null) as { action?: string } | null;
  if (body?.action !== 'rotate') {
    return NextResponse.json({ message: 'action は rotate を指定してください。' }, { status: 400 });
  }

  try {
    const result = rotateTerminalToken(getHubStoreSingleton(), terminalId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: 'トークン再発行で予期しないエラーが発生しました。' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { terminalId } = await context.params;
  try {
    const result = revokeTerminal(getHubStoreSingleton(), terminalId);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HubRoleUnavailableError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }
    return NextResponse.json({ message: '端末失効で予期しないエラーが発生しました。' }, { status: 500 });
  }
}
