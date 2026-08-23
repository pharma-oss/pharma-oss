import { NextRequest, NextResponse } from 'next/server';
import {
  DrugMasterOfficialPageFetchError,
  fetchDrugMasterOfficialPage
} from '@/lib/drug_master_official_page';
import { getAppEnv } from '@/lib/env';

export async function GET(request: NextRequest) {
  const pageUrl = request.nextUrl.searchParams.get('pageUrl') || undefined;
  const env = getAppEnv();

  try {
    const result = await fetchDrugMasterOfficialPage({
      pageUrl,
      timeoutMs: env.drugMasterOfficialPageTimeoutMs
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DrugMasterOfficialPageFetchError) {
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
        code: 'official_drug_master_page_unexpected_error',
        message: '公式ページ取得で予期しないエラーが発生しました。'
      },
      { status: 500 }
    );
  }
}
