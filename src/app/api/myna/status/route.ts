import { stat } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { resolveMynaReaderAvailability, type MynaReaderAvailability } from '@/lib/myna_card_reader';
import { getAppEnv } from '@/lib/env';

// 画面のマイナ読取ボタンを押せるかどうか。患者情報は読まず、設定と連携フォルダの有無だけを見る。
export async function GET() {
  const env = getAppEnv();
  let availability: MynaReaderAvailability = resolveMynaReaderAvailability({
    mode: env.mynaCardReaderMode,
    endpoint: env.mynaCardReaderEndpoint,
    folderPath: env.mynaCardReaderFolder
  });

  if (availability.available && availability.source === 'folder') {
    try {
      const folderStat = await stat(env.mynaCardReaderFolder.trim());
      if (!folderStat.isDirectory()) throw new Error('not a directory');
    } catch {
      availability = {
        available: false,
        source: null,
        reason: '資格確認端末の連携フォルダを開けません。フォルダの場所とアクセス権を確認してください。'
      };
    }
  }

  return NextResponse.json(availability, { headers: { 'Cache-Control': 'no-store' } });
}
