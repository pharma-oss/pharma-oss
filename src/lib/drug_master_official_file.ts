import { normalizeDrugMasterSourceUrl } from './drug_master_provenance.ts';

export type DrugMasterOfficialFileFetchErrorCode =
  | 'official_drug_master_file_url_required'
  | 'official_drug_master_file_url_not_allowed'
  | 'official_drug_master_file_fetch_unavailable'
  | 'official_drug_master_file_timeout'
  | 'official_drug_master_file_http_error'
  | 'official_drug_master_file_too_large'
  | 'official_drug_master_file_fetch_failed';

export type DrugMasterOfficialFileType = 'csv' | 'zip';

export interface DrugMasterOfficialFileFetchResult {
  sourceUrl: string;
  fileName: string;
  fileType: DrugMasterOfficialFileType;
  fetchedAt: string;
  contentType?: string;
  contentLength?: number;
  arrayBuffer: ArrayBuffer;
}

export interface FetchDrugMasterOfficialFileInput {
  fileUrl: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetchedAt?: Date;
  fetchImpl?: typeof fetch;
}

export class DrugMasterOfficialFileFetchError extends Error {
  constructor(
    public readonly code: DrugMasterOfficialFileFetchErrorCode,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'DrugMasterOfficialFileFetchError';
  }
}

export const DEFAULT_DRUG_MASTER_OFFICIAL_FILE_MAX_BYTES = 64 * 1024 * 1024;

function throwNotAllowed(): never {
  throw new DrugMasterOfficialFileFetchError(
    'official_drug_master_file_url_not_allowed',
    400,
    '公式ファイル取得は支払基金の医薬品マスターCSVまたはZIPのみ対応しています。'
  );
}

export function normalizeOfficialDrugMasterFileFetchUrl(fileUrl: string): string {
  if (!fileUrl.trim()) {
    throw new DrugMasterOfficialFileFetchError(
      'official_drug_master_file_url_required',
      400,
      '取得する医薬品マスターURLを指定してください。'
    );
  }

  let normalizedUrl: string | undefined;
  try {
    normalizedUrl = normalizeDrugMasterSourceUrl(fileUrl);
  } catch {
    throwNotAllowed();
  }
  if (!normalizedUrl) throwNotAllowed();

  const parsed = new URL(normalizedUrl);
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  const isSskHost = host === 'www.ssk.or.jp' || host.endsWith('.ssk.or.jp');
  const isDrugMasterPath = path.includes('/seikyushiharai/tensuhyo/kihonmasta/');
  const isSupportedFile = /\.(csv|zip)$/i.test(path);

  if (!isSskHost || !isDrugMasterPath || !isSupportedFile) throwNotAllowed();
  return normalizedUrl;
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseFileNameFromContentDisposition(value: string | null): string | undefined {
  if (!value) return undefined;
  const encoded = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded).trim();
    } catch {
      return encoded.trim();
    }
  }
  return value.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
}

function makeSafeFileName(value: string): string {
  const fileName = value.split(/[\\/]/).pop()?.trim() || 'drug_master.csv';
  return fileName.replace(/[^\w.\-()+\u3040-\u30ff\u3400-\u9fff]/g, '_');
}

export function getOfficialDrugMasterFileType(fileNameOrUrl: string): DrugMasterOfficialFileType {
  return /\.zip(?:$|\?)/i.test(fileNameOrUrl) ? 'zip' : 'csv';
}

export function getOfficialDrugMasterFileName(url: string, contentDisposition?: string | null): string {
  const fromDisposition = parseFileNameFromContentDisposition(contentDisposition || null);
  if (fromDisposition) return makeSafeFileName(fromDisposition);
  return makeSafeFileName(decodeURIComponent(new URL(url).pathname));
}

export async function fetchDrugMasterOfficialFile(
  input: FetchDrugMasterOfficialFileInput
): Promise<DrugMasterOfficialFileFetchResult> {
  const sourceUrl = normalizeOfficialDrugMasterFileFetchUrl(input.fileUrl);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new DrugMasterOfficialFileFetchError(
      'official_drug_master_file_fetch_unavailable',
      503,
      'この実行環境では公式ファイルを取得できません。'
    );
  }

  const requestedTimeoutMs = input.timeoutMs ?? 20000;
  const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
    ? requestedTimeoutMs
    : 20000;
  const maxBytes = Number.isFinite(input.maxBytes) && input.maxBytes && input.maxBytes > 0
    ? input.maxBytes
    : DEFAULT_DRUG_MASTER_OFFICIAL_FILE_MAX_BYTES;
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(sourceUrl, {
      method: 'GET',
      headers: {
        accept: 'text/csv,application/zip,application/octet-stream,*/*'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new DrugMasterOfficialFileFetchError(
        'official_drug_master_file_http_error',
        response.status || 502,
        `支払基金ファイルの取得に失敗しました（HTTP ${response.status}）。`
      );
    }

    const contentLength = parseContentLength(response.headers.get('content-length'));
    if (contentLength !== undefined && contentLength > maxBytes) {
      throw new DrugMasterOfficialFileFetchError(
        'official_drug_master_file_too_large',
        413,
        `公式ファイルが大きすぎます（${contentLength} bytes）。`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new DrugMasterOfficialFileFetchError(
        'official_drug_master_file_too_large',
        413,
        `公式ファイルが大きすぎます（${arrayBuffer.byteLength} bytes）。`
      );
    }

    const fileName = getOfficialDrugMasterFileName(sourceUrl, response.headers.get('content-disposition'));
    const fileTypeFromName = getOfficialDrugMasterFileType(fileName);
    const fileTypeFromUrl = getOfficialDrugMasterFileType(sourceUrl);
    return {
      sourceUrl,
      fileName,
      fileType: fileTypeFromName === 'zip' || fileTypeFromUrl === 'zip' ? 'zip' : 'csv',
      fetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
      contentType: response.headers.get('content-type') || undefined,
      contentLength,
      arrayBuffer
    };
  } catch (error) {
    if (error instanceof DrugMasterOfficialFileFetchError) throw error;
    throw new DrugMasterOfficialFileFetchError(
      didTimeout ? 'official_drug_master_file_timeout' : 'official_drug_master_file_fetch_failed',
      didTimeout ? 504 : 502,
      didTimeout
        ? '支払基金ファイルの取得が時間内に完了しませんでした。'
        : '支払基金ファイルの取得でエラーが発生しました。'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
