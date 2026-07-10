import { NextResponse } from 'next/server';
import { MynaCardReaderError, readMynaCard, type MynaCardReaderMode } from '@/lib/myna_card_reader';

function allowsMockFallback(value?: string) {
  return process.env.NODE_ENV !== 'production' || ['1', 'true', 'yes'].includes((value || '').toLowerCase());
}

export async function GET() {
  try {
    const mode = (process.env.MYNA_CARD_READER_MODE || 'auto') as MynaCardReaderMode;
    const timeoutMs = Number(process.env.MYNA_CARD_READER_TIMEOUT_MS || 8000);
    const result = await readMynaCard({
      endpoint: process.env.MYNA_CARD_READER_ENDPOINT,
      mode,
      allowMockFallback: allowsMockFallback(process.env.MYNA_CARD_READER_ALLOW_MOCK),
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 8000
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MynaCardReaderError) {
      return NextResponse.json(
        {
          status: 'unavailable',
          code: error.code,
          message: error.message
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        status: 'unavailable',
        code: 'myna_reader_unexpected_error',
        message: 'マイナ読取で予期しないエラーが発生しました。'
      },
      { status: 500 }
    );
  }
}
