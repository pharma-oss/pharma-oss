import { NextRequest, NextResponse } from 'next/server';
import {
  DispensingUkeOfficialSpecPdfFetchError,
  fetchDispensingUkeOfficialSpecPdf
} from '@/lib/receipt/dispensing_uke_official_spec_pdf';
import { getAppEnv } from '@/lib/env';

export async function GET(request: NextRequest) {
  const fileUrl = request.nextUrl.searchParams.get('url') || undefined;
  const env = getAppEnv();

  try {
    const result = await fetchDispensingUkeOfficialSpecPdf({
      fileUrl,
      timeoutMs: env.dispensingUkeOfficialSpecPdfTimeoutMs,
      maxBytes: env.dispensingUkeOfficialSpecPdfMaxBytes
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DispensingUkeOfficialSpecPdfFetchError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        code: 'dispensing_uke_official_spec_pdf_unexpected_error',
        message: '調剤UKE仕様PDF取得で予期しないエラーが発生しました。'
      },
      { status: 500 }
    );
  }
}
