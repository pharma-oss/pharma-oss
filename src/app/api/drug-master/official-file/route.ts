import { NextRequest, NextResponse } from 'next/server';
import {
  DrugMasterOfficialFileFetchError,
  fetchDrugMasterOfficialFile
} from '@/lib/drug_master_official_file';
import { getAppEnv } from '@/lib/env';

export async function GET(request: NextRequest) {
  const fileUrl = request.nextUrl.searchParams.get('url') || '';
  const env = getAppEnv();

  try {
    const result = await fetchDrugMasterOfficialFile({
      fileUrl,
      timeoutMs: env.drugMasterOfficialFileTimeoutMs,
      maxBytes: env.drugMasterOfficialFileMaxBytes
    });
    return new NextResponse(result.arrayBuffer, {
      status: 200,
      headers: {
        'content-type': result.contentType || 'application/octet-stream',
        'content-length': String(result.arrayBuffer.byteLength),
        'x-yakureki-file-name': encodeURIComponent(result.fileName),
        'x-yakureki-file-type': result.fileType,
        'x-yakureki-source-url': encodeURIComponent(result.sourceUrl)
      }
    });
  } catch (error) {
    if (error instanceof DrugMasterOfficialFileFetchError) {
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
        code: 'official_drug_master_file_unexpected_error',
        message: '公式ファイル取得で予期しないエラーが発生しました。'
      },
      { status: 500 }
    );
  }
}
