import { NextRequest, NextResponse } from 'next/server';
import {
  DispensingUkeOfficialSpecPdfFetchError,
  fetchDispensingUkeOfficialSpecPdf
} from '@/lib/receipt/dispensing_uke_official_spec_pdf';

export async function GET(request: NextRequest) {
  const fileUrl = request.nextUrl.searchParams.get('url') || undefined;
  const timeoutMs = Number(process.env.DISPENSING_UKE_OFFICIAL_SPEC_PDF_TIMEOUT_MS || 20000);
  const maxBytes = Number(process.env.DISPENSING_UKE_OFFICIAL_SPEC_PDF_MAX_BYTES || 24 * 1024 * 1024);

  try {
    const result = await fetchDispensingUkeOfficialSpecPdf({
      fileUrl,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 20000,
      maxBytes: Number.isFinite(maxBytes) ? maxBytes : undefined
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
