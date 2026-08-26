import { NextRequest, NextResponse } from 'next/server';
import { resolvePharmacySyncConfig } from '@/lib/sync/sync_config';
import { verifyStandbyHubHmac } from '@/lib/sync/satellite_offline_auth';

export async function POST(request: NextRequest) {
  const syncConfigResult = resolvePharmacySyncConfig();
  if (!syncConfigResult.ok) {
    return NextResponse.json({ ok: false, message: syncConfigResult.message }, { status: 500 });
  }

  const config = syncConfigResult.config;
  if (config.role !== 'satellite') {
    return NextResponse.json({ ok: false, message: 'この操作はサテライト端末でのみ実行可能です。' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'リクエスト形式が不正です。' }, { status: 400 });
  }

  const { endpoint, issuedAt, signature } = body || {};
  if (!endpoint || !issuedAt || !signature) {
    return NextResponse.json({ ok: false, message: '必須項目 (endpoint, issuedAt, signature) が不足しています。' }, { status: 400 });
  }

  const terminalToken = config.terminalToken;
  if (!terminalToken) {
    return NextResponse.json({ ok: false, message: '端末トークンが設定されていません。' }, { status: 500 });
  }

  const isValid = verifyStandbyHubHmac({ endpoint, issuedAt, signature }, terminalToken);
  if (!isValid) {
    return NextResponse.json({ ok: false, message: '予備機候補の HMAC 署名検証に失敗しました。不正または改ざんされたエントリです。' }, { status: 403 });
  }

  return NextResponse.json({ ok: true, message: 'HMAC 署名検証に成功しました。' });
}
