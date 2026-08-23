import { NextResponse } from 'next/server';
import { MynaCardReaderError, readMynaCard, type MynaCardReaderMode } from '@/lib/myna_card_reader';
import { getAppEnv } from '@/lib/env';

export async function GET() {
  const env = getAppEnv();
  try {
    const result = await readMynaCard({
      endpoint: env.mynaCardReaderEndpoint || undefined,
      mode: env.mynaCardReaderMode as MynaCardReaderMode,
      allowMockFallback: env.nodeEnv !== 'production' && env.mynaCardReaderAllowMock,
      timeoutMs: env.mynaCardReaderTimeoutMs
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
