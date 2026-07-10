import { extractSearchableTextFromPdfBytes } from '../drug_master_official_spec_pdf.ts';
import {
  buildDispensingUkeSpecificationPdfAllFieldCompletionGate,
  buildDispensingUkeSpecificationPdfFieldDefinitionReview,
  formatDispensingUkeSpecificationPdfAllFieldCompletionGate,
  parseDispensingUkeSpecificationPdfText,
  type DispensingUkeSpecificationPdfAllFieldCompletionGate
} from './dispensing_uke_spec_pdf.ts';
import {
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  type DispensingUkeRecordSpecSource
} from './dispensing_uke_validation.ts';

export type DispensingUkeOfficialSpecPdfFetchErrorCode =
  | 'dispensing_uke_official_spec_pdf_url_not_allowed'
  | 'dispensing_uke_official_spec_pdf_fetch_unavailable'
  | 'dispensing_uke_official_spec_pdf_timeout'
  | 'dispensing_uke_official_spec_pdf_http_error'
  | 'dispensing_uke_official_spec_pdf_too_large'
  | 'dispensing_uke_official_spec_pdf_text_unreadable'
  | 'dispensing_uke_official_spec_pdf_fetch_failed';

export interface DispensingUkeOfficialSpecPdfFetchResult {
  sourceUrl: string;
  fileName: string;
  fetchedAt: string;
  contentType?: string;
  contentLength?: number;
  text: string;
  completionGate: DispensingUkeSpecificationPdfAllFieldCompletionGate;
  completionGateLabel: string;
}

export interface FetchDispensingUkeOfficialSpecPdfInput {
  fileUrl?: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetchedAt?: Date;
  fetchImpl?: typeof fetch;
  source?: DispensingUkeRecordSpecSource;
}

export class DispensingUkeOfficialSpecPdfFetchError extends Error {
  constructor(
    public readonly code: DispensingUkeOfficialSpecPdfFetchErrorCode,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'DispensingUkeOfficialSpecPdfFetchError';
  }
}

export const DEFAULT_DISPENSING_UKE_OFFICIAL_SPEC_PDF_MAX_BYTES = 24 * 1024 * 1024;

export function normalizeDispensingUkeOfficialSpecPdfFetchUrl(
  fileUrl?: string,
  source: DispensingUkeRecordSpecSource = DISPENSING_UKE_RECORD_SPEC_SOURCE
): string {
  let requested: URL;
  let allowed: URL;
  try {
    requested = new URL((fileUrl || source.url).trim());
    allowed = new URL(source.url);
  } catch {
    throw new DispensingUkeOfficialSpecPdfFetchError(
      'dispensing_uke_official_spec_pdf_url_not_allowed',
      400,
      '支払基金の調剤UKE記録条件仕様PDFのみ取得できます。'
    );
  }

  const isAllowed = requested.protocol === 'https:'
    && !requested.username
    && !requested.password
    && requested.hostname.toLowerCase() === allowed.hostname.toLowerCase()
    && requested.pathname === allowed.pathname;
  if (!isAllowed) {
    throw new DispensingUkeOfficialSpecPdfFetchError(
      'dispensing_uke_official_spec_pdf_url_not_allowed',
      400,
      '支払基金の調剤UKE記録条件仕様PDFのみ取得できます。'
    );
  }

  return requested.toString();
}

function parseContentLength(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function makeSafeFileName(url: string): string {
  const fileName = decodeURIComponent(new URL(url).pathname).split('/').pop() || 'dispensing_uke_spec.pdf';
  return fileName.replace(/[^\w.\-()+\u3040-\u30ff\u3400-\u9fff]/g, '_');
}

export function isReadableDispensingUkeSpecificationPdfText(text: string): boolean {
  const normalized = text.normalize('NFKC');
  const japaneseCharacters = normalized.match(/[ぁ-んァ-ン一-龯]/g)?.length ?? 0;
  const replacementCharacters = normalized.match(/�/g)?.length ?? 0;
  const hasRecordConditionVocabulary = /薬局情報レコード|レセプト共通レコード|保険者レコード|調剤情報レコード|医薬品レコード/.test(normalized);
  const hasFieldVocabulary = /項目|モード|バイト|形式|記録内容/.test(normalized);
  const hasFieldLikeRow = /\d+\s*[^\n]{1,40}\s*(?:数字|英数|漢字|カナ|日付|年月)\s*\d+/.test(normalized);

  if (hasRecordConditionVocabulary && hasFieldLikeRow) return true;

  return japaneseCharacters >= 80
    && replacementCharacters <= Math.max(10, Math.floor(normalized.length * 0.01))
    && hasRecordConditionVocabulary
    && hasFieldVocabulary;
}

export async function fetchDispensingUkeOfficialSpecPdf(
  input: FetchDispensingUkeOfficialSpecPdfInput = {}
): Promise<DispensingUkeOfficialSpecPdfFetchResult> {
  const source = input.source ?? DISPENSING_UKE_RECORD_SPEC_SOURCE;
  const sourceUrl = normalizeDispensingUkeOfficialSpecPdfFetchUrl(input.fileUrl, source);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new DispensingUkeOfficialSpecPdfFetchError(
      'dispensing_uke_official_spec_pdf_fetch_unavailable',
      503,
      'この実行環境では公式仕様PDFを取得できません。'
    );
  }

  const requestedTimeoutMs = input.timeoutMs ?? 20000;
  const timeoutMs = Number.isFinite(requestedTimeoutMs) && requestedTimeoutMs > 0
    ? requestedTimeoutMs
    : 20000;
  const maxBytes = Number.isFinite(input.maxBytes) && input.maxBytes && input.maxBytes > 0
    ? input.maxBytes
    : DEFAULT_DISPENSING_UKE_OFFICIAL_SPEC_PDF_MAX_BYTES;
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(sourceUrl, {
      method: 'GET',
      headers: { accept: 'application/pdf,application/octet-stream,*/*' },
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      throw new DispensingUkeOfficialSpecPdfFetchError(
        'dispensing_uke_official_spec_pdf_http_error',
        response.status || 502,
        `支払基金の調剤UKE仕様PDFを取得できませんでした（HTTP ${response.status}）。`
      );
    }

    const contentLength = parseContentLength(response.headers.get('content-length'));
    if (contentLength !== undefined && contentLength > maxBytes) {
      throw new DispensingUkeOfficialSpecPdfFetchError(
        'dispensing_uke_official_spec_pdf_too_large',
        413,
        `調剤UKE仕様PDFが大きすぎます（${contentLength} bytes）。`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new DispensingUkeOfficialSpecPdfFetchError(
        'dispensing_uke_official_spec_pdf_too_large',
        413,
        `調剤UKE仕様PDFが大きすぎます（${arrayBuffer.byteLength} bytes）。`
      );
    }

    const text = extractSearchableTextFromPdfBytes(arrayBuffer);
    if (!isReadableDispensingUkeSpecificationPdfText(text)) {
      throw new DispensingUkeOfficialSpecPdfFetchError(
        'dispensing_uke_official_spec_pdf_text_unreadable',
        422,
        '公式PDFの文字をこの環境では正しく取り出せませんでした。OCRやPDF変換ツールで文字にして、その本文を貼り付けてください。'
      );
    }
    const parseResult = parseDispensingUkeSpecificationPdfText(text);
    const definitionReview = buildDispensingUkeSpecificationPdfFieldDefinitionReview(parseResult);
    const completionGate = buildDispensingUkeSpecificationPdfAllFieldCompletionGate(parseResult, definitionReview);

    return {
      sourceUrl,
      fileName: makeSafeFileName(sourceUrl),
      fetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
      contentType: response.headers.get('content-type') || undefined,
      contentLength,
      text,
      completionGate,
      completionGateLabel: formatDispensingUkeSpecificationPdfAllFieldCompletionGate(completionGate)
    };
  } catch (error) {
    if (error instanceof DispensingUkeOfficialSpecPdfFetchError) throw error;
    throw new DispensingUkeOfficialSpecPdfFetchError(
      didTimeout ? 'dispensing_uke_official_spec_pdf_timeout' : 'dispensing_uke_official_spec_pdf_fetch_failed',
      didTimeout ? 504 : 502,
      didTimeout
        ? '調剤UKE仕様PDFの取得が時間内に完了しませんでした。'
        : '調剤UKE仕様PDFの取得または本文抽出でエラーが発生しました。'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
