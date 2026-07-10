import {
  SSK_DRUG_MASTER_PAGE_URL,
  extractSskDrugMasterDownloadCandidates,
  normalizeDrugMasterSourceUrl,
  type DrugMasterOfficialDownloadCandidate
} from './drug_master_provenance.ts';

export type DrugMasterOfficialPageFetchErrorCode =
  | 'official_drug_master_page_url_not_allowed'
  | 'official_drug_master_page_fetch_unavailable'
  | 'official_drug_master_page_timeout'
  | 'official_drug_master_page_http_error'
  | 'official_drug_master_page_fetch_failed';

export interface DrugMasterOfficialPageFetchResult {
  sourcePageUrl: string;
  fetchedAt: string;
  html: string;
  contentType?: string;
  contentLength?: number;
  candidates: DrugMasterOfficialDownloadCandidate[];
}

export interface FetchDrugMasterOfficialPageInput {
  pageUrl?: string;
  timeoutMs?: number;
  fetchedAt?: Date;
  fetchImpl?: typeof fetch;
}

export class DrugMasterOfficialPageFetchError extends Error {
  constructor(
    public readonly code: DrugMasterOfficialPageFetchErrorCode,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'DrugMasterOfficialPageFetchError';
  }
}

export function normalizeOfficialDrugMasterPageFetchUrl(pageUrl?: string): string {
  let normalizedUrl: string | undefined;
  try {
    normalizedUrl = normalizeDrugMasterSourceUrl(pageUrl || SSK_DRUG_MASTER_PAGE_URL);
  } catch {
    throw new DrugMasterOfficialPageFetchError(
      'official_drug_master_page_url_not_allowed',
      400,
      '公式ページ取得は支払基金の医薬品マスターページのみ対応しています。'
    );
  }
  if (normalizedUrl !== SSK_DRUG_MASTER_PAGE_URL) {
    throw new DrugMasterOfficialPageFetchError(
      'official_drug_master_page_url_not_allowed',
      400,
      '公式ページ取得は支払基金の医薬品マスターページのみ対応しています。'
    );
  }
  return normalizedUrl;
}

function parseCharset(contentType?: string | null): string {
  const charset = contentType?.match(/charset=["']?([^;"'\s]+)/i)?.[1]?.trim();
  if (!charset) return 'utf-8';
  const normalized = charset.toLowerCase().replace(/_/g, '-');
  if (normalized === 'shift-jis' || normalized === 'sjis' || normalized === 'windows-31j') {
    return 'shift_jis';
  }
  return normalized;
}

export function decodeDrugMasterOfficialPageHtml(arrayBuffer: ArrayBuffer, contentType?: string | null): string {
  const charset = parseCharset(contentType);
  try {
    return new TextDecoder(charset).decode(arrayBuffer);
  } catch {
    return new TextDecoder('utf-8').decode(arrayBuffer);
  }
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

export async function fetchDrugMasterOfficialPage(
  input: FetchDrugMasterOfficialPageInput = {}
): Promise<DrugMasterOfficialPageFetchResult> {
  const sourcePageUrl = normalizeOfficialDrugMasterPageFetchUrl(input.pageUrl);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new DrugMasterOfficialPageFetchError(
      'official_drug_master_page_fetch_unavailable',
      503,
      'この実行環境では公式ページを取得できません。'
    );
  }

  const requestedTimeoutMs = input.timeoutMs ?? 10000;
  const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
    ? requestedTimeoutMs
    : 10000;
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(sourcePageUrl, {
      method: 'GET',
      headers: {
        accept: 'text/html,application/xhtml+xml'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new DrugMasterOfficialPageFetchError(
        'official_drug_master_page_http_error',
        response.status || 502,
        `支払基金ページの取得に失敗しました（HTTP ${response.status}）。`
      );
    }

    const contentType = response.headers.get('content-type') || undefined;
    const contentLength = parseContentLength(response.headers.get('content-length'));
    const html = decodeDrugMasterOfficialPageHtml(await response.arrayBuffer(), contentType);
    const candidates = extractSskDrugMasterDownloadCandidates(html, sourcePageUrl);

    return {
      sourcePageUrl,
      fetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
      html,
      contentType,
      contentLength,
      candidates
    };
  } catch (error) {
    if (error instanceof DrugMasterOfficialPageFetchError) throw error;
    throw new DrugMasterOfficialPageFetchError(
      didTimeout ? 'official_drug_master_page_timeout' : 'official_drug_master_page_fetch_failed',
      didTimeout ? 504 : 502,
      didTimeout
        ? '支払基金ページの取得が時間内に完了しませんでした。'
        : '支払基金ページの取得でエラーが発生しました。'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
