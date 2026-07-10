import { NextRequest, NextResponse } from 'next/server';
import {
  DrugMasterOfficialFileFetchError,
  fetchDrugMasterOfficialFile
} from '@/lib/drug_master_official_file';

export async function GET(request: NextRequest) {
  const fileUrl = request.nextUrl.searchParams.get('url') || '';
  const timeoutMs = Number(process.env.DRUG_MASTER_OFFICIAL_FILE_TIMEOUT_MS || 20000);
  const maxBytes = Number(process.env.DRUG_MASTER_OFFICIAL_FILE_MAX_BYTES || 64 * 1024 * 1024);

  try {
    const result = await fetchDrugMasterOfficialFile({
      fileUrl,
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 20000,
      maxBytes: Number.isFinite(maxBytes) ? maxBytes : undefined
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
