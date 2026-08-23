import { NextRequest, NextResponse } from 'next/server';
import {
  DrugMasterOfficialSpecPdfFetchError,
  fetchDrugMasterOfficialSpecPdf,
  reviewDrugMasterOfficialSpecPdfExternalText
} from '@/lib/drug_master_official_spec_pdf';
import { getAppEnv } from '@/lib/env';

function jsonError(error: unknown) {
  if (error instanceof DrugMasterOfficialSpecPdfFetchError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message
      },
      { status: error.status }
    );
  }

  return NextResponse.json(
    {
      code: 'official_drug_master_spec_pdf_unexpected_error',
      message: '公式仕様PDF取得で予期しないエラーが発生しました。'
    },
    { status: 500 }
  );
}

export async function GET(request: NextRequest) {
  const fileUrl = request.nextUrl.searchParams.get('url') || undefined;
  const env = getAppEnv();

  try {
    const result = await fetchDrugMasterOfficialSpecPdf({
      fileUrl,
      timeoutMs: env.drugMasterOfficialSpecPdfTimeoutMs,
      maxBytes: env.drugMasterOfficialSpecPdfMaxBytes
    });
    return NextResponse.json({
      sourceUrl: result.sourceUrl,
      fileName: result.fileName,
      fetchedAt: result.fetchedAt,
      contentType: result.contentType,
      contentLength: result.contentLength,
      text: result.text,
      extractionMethod: result.extractionMethod,
      review: result.review,
      reviewLabel: result.reviewLabel
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({})) as {
      text?: string;
      extractedText?: string;
      sourceUrl?: string;
      fileName?: string;
      extractorName?: string;
      extractedAt?: string;
    };
    const result = reviewDrugMasterOfficialSpecPdfExternalText({
      text: payload.extractedText ?? payload.text,
      sourceUrl: payload.sourceUrl,
      fileName: payload.fileName,
      extractorName: payload.extractorName,
      extractedAt: payload.extractedAt
    });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
