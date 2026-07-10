import { Buffer } from 'node:buffer';
import { inflateSync } from 'node:zlib';
import {
  DRUG_MASTER_SPECIFICATION_SOURCE,
  type DrugMasterSpecificationSource
} from './drug_master_csv.ts';
import {
  buildDrugMasterSpecificationPdfDiffReview,
  formatDrugMasterSpecificationPdfDiffReview,
  type DrugMasterSpecificationPdfDiffReview
} from './drug_master_spec_pdf.ts';
import { normalizeDrugMasterSourceUrl } from './drug_master_provenance.ts';

export type DrugMasterOfficialSpecPdfFetchErrorCode =
  | 'official_drug_master_spec_pdf_url_required'
  | 'official_drug_master_spec_pdf_url_not_allowed'
  | 'official_drug_master_spec_pdf_fetch_unavailable'
  | 'official_drug_master_spec_pdf_timeout'
  | 'official_drug_master_spec_pdf_http_error'
  | 'official_drug_master_spec_pdf_too_large'
  | 'official_drug_master_spec_pdf_text_required'
  | 'official_drug_master_spec_pdf_text_unreadable'
  | 'official_drug_master_spec_pdf_fetch_failed';

export interface DrugMasterOfficialSpecPdfFetchResult {
  sourceUrl: string;
  fileName: string;
  fetchedAt: string;
  contentType?: string;
  contentLength?: number;
  text: string;
  extractionMethod: 'searchable-pdf';
  review: DrugMasterSpecificationPdfDiffReview;
  reviewLabel: string;
}

export interface DrugMasterOfficialSpecPdfExternalTextReviewInput {
  text?: string;
  sourceUrl?: string;
  fileName?: string;
  extractorName?: string;
  extractedAt?: Date | string;
  source?: DrugMasterSpecificationSource;
}

export interface DrugMasterOfficialSpecPdfExternalTextReviewResult {
  sourceUrl: string;
  fileName: string;
  extractedAt: string;
  extractorName: string;
  text: string;
  textLength: number;
  extractionMethod: 'external-ocr-or-text';
  review: DrugMasterSpecificationPdfDiffReview;
  reviewLabel: string;
  requiredActions: string[];
}

export interface FetchDrugMasterOfficialSpecPdfInput {
  fileUrl?: string;
  timeoutMs?: number;
  maxBytes?: number;
  fetchedAt?: Date;
  fetchImpl?: typeof fetch;
  source?: DrugMasterSpecificationSource;
}

export class DrugMasterOfficialSpecPdfFetchError extends Error {
  constructor(
    public readonly code: DrugMasterOfficialSpecPdfFetchErrorCode,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'DrugMasterOfficialSpecPdfFetchError';
  }
}

export const DEFAULT_DRUG_MASTER_OFFICIAL_SPEC_PDF_MAX_BYTES = 16 * 1024 * 1024;

interface PositionedPdfText {
  x: number;
  y: number;
  text: string;
}

function throwNotAllowed(): never {
  throw new DrugMasterOfficialSpecPdfFetchError(
    'official_drug_master_spec_pdf_url_not_allowed',
    400,
    '公式仕様PDF取得は支払基金の基本マスターファイルレイアウトPDFのみ対応しています。'
  );
}

export function normalizeOfficialDrugMasterSpecPdfFetchUrl(
  fileUrl?: string,
  source: DrugMasterSpecificationSource = DRUG_MASTER_SPECIFICATION_SOURCE
): string {
  const requestedUrl = (fileUrl || source.url).trim();
  if (!requestedUrl) {
    throw new DrugMasterOfficialSpecPdfFetchError(
      'official_drug_master_spec_pdf_url_required',
      400,
      '取得する仕様PDF URLを指定してください。'
    );
  }

  let normalizedUrl: string | undefined;
  try {
    normalizedUrl = normalizeDrugMasterSourceUrl(requestedUrl);
  } catch {
    throwNotAllowed();
  }
  if (!normalizedUrl) throwNotAllowed();

  const parsed = new URL(normalizedUrl);
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname;
  const isSskHost = host === 'www.ssk.or.jp' || host.endsWith('.ssk.or.jp');
  const isBasicMasterPdf = path.startsWith('/seikyushiharai/tensuhyo/kihonmasta/index.files/')
    && /\.pdf$/i.test(path);

  if (!isSskHost || !isBasicMasterPdf) throwNotAllowed();
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
  const fileName = value.split(/[\\/]/).pop()?.trim() || DRUG_MASTER_SPECIFICATION_SOURCE.fileName;
  return fileName.replace(/[^\w.\-()+\u3040-\u30ff\u3400-\u9fff]/g, '_');
}

export function getOfficialDrugMasterSpecPdfFileName(url: string, contentDisposition?: string | null): string {
  const fromDisposition = parseFileNameFromContentDisposition(contentDisposition || null);
  if (fromDisposition) return makeSafeFileName(fromDisposition);
  return makeSafeFileName(decodeURIComponent(new URL(url).pathname));
}

function binaryStringFromBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

function bytesFromBinaryString(value: string): Buffer {
  return Buffer.from(value, 'latin1');
}

function isWhiteSpaceByte(value: number): boolean {
  return value === 0x0a || value === 0x0d || value === 0x20 || value === 0x09;
}

function extractPdfStreams(pdfBytes: Uint8Array): Array<{ dictionary: string; bytes: Buffer }> {
  const pdfText = binaryStringFromBytes(pdfBytes);
  const streams: Array<{ dictionary: string; bytes: Buffer }> = [];
  let searchIndex = 0;

  while (true) {
    const streamIndex = pdfText.indexOf('stream', searchIndex);
    if (streamIndex < 0) break;
    const endStreamIndex = pdfText.indexOf('endstream', streamIndex);
    if (endStreamIndex < 0) break;

    const dictionaryEnd = pdfText.lastIndexOf('>>', streamIndex);
    const dictionaryStart = dictionaryEnd >= 0 ? pdfText.lastIndexOf('<<', dictionaryEnd) : -1;
    const dictionary = dictionaryStart >= 0 && dictionaryEnd >= dictionaryStart
      ? pdfText.slice(dictionaryStart, dictionaryEnd + 2)
      : '';

    let dataStart = streamIndex + 'stream'.length;
    const raw = Buffer.from(pdfBytes);
    if (raw[dataStart] === 0x0d && raw[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (raw[dataStart] === 0x0a || raw[dataStart] === 0x0d) {
      dataStart += 1;
    }
    let dataEnd = endStreamIndex;
    while (dataEnd > dataStart && isWhiteSpaceByte(raw[dataEnd - 1])) {
      dataEnd--;
    }

    streams.push({
      dictionary,
      bytes: raw.subarray(dataStart, dataEnd)
    });
    searchIndex = endStreamIndex + 'endstream'.length;
  }

  return streams;
}

function decodePdfStream(stream: { dictionary: string; bytes: Buffer }): Buffer | null {
  if (/\/Filter\s*(?:\[)?\s*\/FlateDecode\b/.test(stream.dictionary)) {
    try {
      return inflateSync(stream.bytes);
    } catch {
      return null;
    }
  }
  if (/\/Filter\b/.test(stream.dictionary)) return null;
  return stream.bytes;
}

function decodePdfLiteralString(value: string): string {
  let output = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char !== '\\') {
      output += char;
      continue;
    }

    const next = value[++i];
    if (next === undefined) break;
    if (next === 'n') output += '\n';
    else if (next === 'r') output += '\r';
    else if (next === 't') output += '\t';
    else if (next === 'b') output += '\b';
    else if (next === 'f') output += '\f';
    else if (next === '(' || next === ')' || next === '\\') output += next;
    else if (next === '\r' || next === '\n') {
      if (next === '\r' && value[i + 1] === '\n') i++;
    } else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let count = 0; count < 2 && /[0-7]/.test(value[i + 1] || ''); count++) {
        octal += value[++i];
      }
      output += String.fromCharCode(Number.parseInt(octal, 8));
    } else {
      output += next;
    }
  }
  return output;
}

function decodePdfHexString(value: string): string {
  const normalized = value.replace(/\s+/g, '');
  if (!normalized) return '';
  const padded = normalized.length % 2 === 0 ? normalized : `${normalized}0`;
  const bytes = Buffer.from(padded, 'hex');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let output = '';
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      output += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return output;
  }
  return bytes.toString('utf8');
}

function decodeUtf16BeHex(value: string): string {
  const normalized = value.replace(/\s+/g, '');
  const padded = normalized.length % 2 === 0 ? normalized : `${normalized}0`;
  const bytes = Buffer.from(padded, 'hex');
  const start = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff ? 2 : 0;
  let output = '';
  for (let i = start; i + 1 < bytes.length; i += 2) {
    output += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  }
  return output;
}

function normalizeHex(value: string): string {
  const normalized = value.replace(/[<>\s]/g, '').toUpperCase();
  return normalized.length % 2 === 0 ? normalized : `${normalized}0`;
}

function hexNumber(value: string): number {
  return Number.parseInt(normalizeHex(value), 16);
}

function paddedHex(value: number, length: number): string {
  return value.toString(16).toUpperCase().padStart(length, '0');
}

function parsePdfToUnicodeCMap(streamText: string): Map<string, string> {
  const map = new Map<string, string>();
  const bfCharBlocks = streamText.matchAll(/beginbfchar([\s\S]*?)endbfchar/g);
  for (const block of bfCharBlocks) {
    const pairs = block[1].matchAll(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g);
    for (const pair of pairs) {
      map.set(normalizeHex(pair[1]), decodeUtf16BeHex(pair[2]));
    }
  }

  const bfRangeBlocks = streamText.matchAll(/beginbfrange([\s\S]*?)endbfrange/g);
  for (const block of bfRangeBlocks) {
    const rangeLines = block[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of rangeLines) {
      const arrayMatch = line.match(/^<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*\[([\s\S]+)\]$/);
      if (arrayMatch) {
        const startHex = normalizeHex(arrayMatch[1]);
        const endHex = normalizeHex(arrayMatch[2]);
        const start = hexNumber(startHex);
        const end = hexNumber(endHex);
        const values = Array.from(arrayMatch[3].matchAll(/<([0-9A-Fa-f\s]+)>/g)).map((match) => decodeUtf16BeHex(match[1]));
        for (let code = start; code <= end && code - start < values.length; code++) {
          map.set(paddedHex(code, startHex.length), values[code - start]);
        }
        continue;
      }

      const sequentialMatch = line.match(/^<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>$/);
      if (!sequentialMatch) continue;
      const startHex = normalizeHex(sequentialMatch[1]);
      const endHex = normalizeHex(sequentialMatch[2]);
      const start = hexNumber(startHex);
      const end = hexNumber(endHex);
      const destinationStart = hexNumber(sequentialMatch[3]);
      for (let code = start; code <= end; code++) {
        map.set(paddedHex(code, startHex.length), decodeUtf16BeHex(paddedHex(destinationStart + code - start, normalizeHex(sequentialMatch[3]).length)));
      }
    }
  }

  return map;
}

function mergeCMaps(target: Map<string, string>, source: Map<string, string>): void {
  for (const [key, value] of source.entries()) {
    target.set(key, value);
  }
}

function decodeMappedPdfHexString(value: string, cmap: Map<string, string>): string {
  const normalized = normalizeHex(value);
  if (cmap.size === 0) return decodePdfHexString(normalized);
  const sourceLengths = Array.from(new Set(Array.from(cmap.keys()).map((key) => key.length))).sort((a, b) => b - a);
  let output = '';
  let index = 0;

  while (index < normalized.length) {
    let matched = false;
    for (const length of sourceLengths) {
      const chunk = normalized.slice(index, index + length);
      const mapped = cmap.get(chunk);
      if (mapped !== undefined) {
        output += mapped;
        index += length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      output += decodePdfHexString(normalized.slice(index, index + 2));
      index += 2;
    }
  }

  return output;
}

function extractPdfTextFragments(streamText: string, cmap: Map<string, string>): string[] {
  const fragments: string[] = [];
  let inLiteral = false;
  let literalDepth = 0;
  let literal = '';
  let inHex = false;
  let hex = '';

  for (let i = 0; i < streamText.length; i++) {
    const char = streamText[i];
    const prev = streamText[i - 1];

    if (inLiteral) {
      if (char === '\\') {
        literal += char;
        if (i + 1 < streamText.length) literal += streamText[++i];
        continue;
      }
      if (char === '(') literalDepth++;
      if (char === ')') {
        literalDepth--;
        if (literalDepth <= 0) {
          fragments.push(decodePdfLiteralString(literal));
          inLiteral = false;
          literal = '';
          continue;
        }
      }
      literal += char;
      continue;
    }

    if (inHex) {
      if (char === '>') {
        fragments.push(decodeMappedPdfHexString(hex, cmap));
        inHex = false;
        hex = '';
      } else {
        hex += char;
      }
      continue;
    }

    if (char === '(') {
      inLiteral = true;
      literalDepth = 1;
      literal = '';
      continue;
    }
    if (char === '<' && streamText[i + 1] !== '<' && prev !== '<') {
      inHex = true;
      hex = '';
    }
  }

  return fragments;
}

function extractPositionedPdfText(streamText: string, cmap: Map<string, string>): PositionedPdfText[] {
  const positioned: PositionedPdfText[] = [];
  const textBlocks = streamText.matchAll(/BT([\s\S]*?)ET/g);

  for (const block of textBlocks) {
    const body = block[1];
    const tmMatches = Array.from(body.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm/g));
    const matrix = tmMatches.at(-1);
    if (!matrix) continue;
    const text = extractPdfTextFragments(body, cmap).join('');
    if (!text.trim()) continue;

    positioned.push({
      x: Number.parseFloat(matrix[5]),
      y: Number.parseFloat(matrix[6]),
      text
    });
  }

  return positioned;
}

function buildPositionedLines(items: PositionedPdfText[]): string[] {
  const sorted = [...items].sort((a, b) => {
    const pageTolerance = 0.8;
    if (Math.abs(a.y - b.y) > pageTolerance) return b.y - a.y;
    return a.x - b.x;
  });
  const lines: PositionedPdfText[][] = [];

  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= 0.8);
    if (line) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }

  return lines.map((line) => line.sort((a, b) => a.x - b.x).map((item) => item.text).join(''));
}

function normalizeExtractedPdfText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeExternalDrugMasterSpecPdfText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function isReadableDrugMasterSpecificationPdfText(text: string): boolean {
  const normalized = normalizeExternalDrugMasterSpecPdfText(text);
  if (normalized.length < 80) return false;

  const japaneseCharacters = normalized.match(/[ぁ-んァ-ン一-龯]/g)?.length ?? 0;
  const replacementCharacters = normalized.match(/�/g)?.length ?? 0;
  const hasMasterHeading = /医薬品マスター/.test(normalized);
  const hasSpecificationVocabulary = /項番|項目|モード|桁数|バイト|変更区分|医薬品コード|選定療養区分/.test(normalized);
  const hasItemLikeRow = /\d+\s*(?:変更区分|マスター種別|医薬品コード|選定療養区分)\s*(?:数字|英数カナ|英数|漢字)\s*\d/.test(normalized);
  const replacementLimit = Math.max(10, Math.floor(normalized.length * 0.02));

  if (hasMasterHeading && hasItemLikeRow) return true;
  return hasMasterHeading
    && hasSpecificationVocabulary
    && japaneseCharacters >= 40
    && replacementCharacters <= replacementLimit;
}

function requireReadableDrugMasterSpecText(
  text: string,
  emptyCode: 'required' | 'unreadable' = 'required'
): string {
  const normalized = normalizeExternalDrugMasterSpecPdfText(text);
  if (!normalized) {
    if (emptyCode === 'unreadable') {
      throw new DrugMasterOfficialSpecPdfFetchError(
        'official_drug_master_spec_pdf_text_unreadable',
        422,
        '医薬品マスター仕様PDFの本文を正しく読めませんでした。OCRまたはPDF変換ツールで「医薬品マスター」の項番、項目名、モード、桁数、バイト数が読める本文にして再実行してください。'
      );
    }
    throw new DrugMasterOfficialSpecPdfFetchError(
      'official_drug_master_spec_pdf_text_required',
      400,
      '医薬品マスター仕様PDFのOCR本文または抽出本文を指定してください。'
    );
  }
  if (!isReadableDrugMasterSpecificationPdfText(normalized)) {
    throw new DrugMasterOfficialSpecPdfFetchError(
      'official_drug_master_spec_pdf_text_unreadable',
      422,
      '医薬品マスター仕様PDFの本文を正しく読めませんでした。OCRまたはPDF変換ツールで「医薬品マスター」の項番、項目名、モード、桁数、バイト数が読める本文にして再実行してください。'
    );
  }
  return normalized;
}

export function extractSearchableTextFromPdfBytes(arrayBuffer: ArrayBuffer): string {
  const bytes = new Uint8Array(arrayBuffer);
  const streams = extractPdfStreams(bytes);
  const decodedStreams: string[] = [];
  const cmap = new Map<string, string>();
  const fragments: string[] = [];

  for (const stream of streams) {
    const decoded = decodePdfStream(stream);
    if (!decoded) continue;
    const streamText = bytesFromBinaryString(binaryStringFromBytes(decoded)).toString('latin1');
    decodedStreams.push(streamText);
    if (/begincmap/.test(streamText)) {
      mergeCMaps(cmap, parsePdfToUnicodeCMap(streamText));
    }
  }

  for (const streamText of decodedStreams) {
    if (/begincmap/.test(streamText)) continue;
    const positionedLines = buildPositionedLines(extractPositionedPdfText(streamText, cmap));
    if (positionedLines.length > 0) {
      fragments.push(...positionedLines);
    } else {
      fragments.push(...extractPdfTextFragments(streamText, cmap));
    }
  }

  return normalizeExtractedPdfText(fragments.join('\n'));
}

export async function fetchDrugMasterOfficialSpecPdf(
  input: FetchDrugMasterOfficialSpecPdfInput = {}
): Promise<DrugMasterOfficialSpecPdfFetchResult> {
  const source = input.source ?? DRUG_MASTER_SPECIFICATION_SOURCE;
  const sourceUrl = normalizeOfficialDrugMasterSpecPdfFetchUrl(input.fileUrl, source);
  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new DrugMasterOfficialSpecPdfFetchError(
      'official_drug_master_spec_pdf_fetch_unavailable',
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
    : DEFAULT_DRUG_MASTER_OFFICIAL_SPEC_PDF_MAX_BYTES;
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
        accept: 'application/pdf,application/octet-stream,*/*'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new DrugMasterOfficialSpecPdfFetchError(
        'official_drug_master_spec_pdf_http_error',
        response.status || 502,
        `支払基金仕様PDFの取得に失敗しました（HTTP ${response.status}）。`
      );
    }

    const contentLength = parseContentLength(response.headers.get('content-length'));
    if (contentLength !== undefined && contentLength > maxBytes) {
      throw new DrugMasterOfficialSpecPdfFetchError(
        'official_drug_master_spec_pdf_too_large',
        413,
        `公式仕様PDFが大きすぎます（${contentLength} bytes）。`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new DrugMasterOfficialSpecPdfFetchError(
        'official_drug_master_spec_pdf_too_large',
        413,
        `公式仕様PDFが大きすぎます（${arrayBuffer.byteLength} bytes）。`
      );
    }

    const text = extractSearchableTextFromPdfBytes(arrayBuffer);
    requireReadableDrugMasterSpecText(text, 'unreadable');
    const review = buildDrugMasterSpecificationPdfDiffReview(text);
    return {
      sourceUrl,
      fileName: getOfficialDrugMasterSpecPdfFileName(sourceUrl, response.headers.get('content-disposition')),
      fetchedAt: (input.fetchedAt ?? new Date()).toISOString(),
      contentType: response.headers.get('content-type') || undefined,
      contentLength,
      text,
      extractionMethod: 'searchable-pdf',
      review,
      reviewLabel: formatDrugMasterSpecificationPdfDiffReview(review)
    };
  } catch (error) {
    if (error instanceof DrugMasterOfficialSpecPdfFetchError) throw error;
    throw new DrugMasterOfficialSpecPdfFetchError(
      didTimeout ? 'official_drug_master_spec_pdf_timeout' : 'official_drug_master_spec_pdf_fetch_failed',
      didTimeout ? 504 : 502,
      didTimeout
        ? '支払基金仕様PDFの取得が時間内に完了しませんでした。'
        : '支払基金仕様PDFの取得または本文抽出でエラーが発生しました。'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function reviewDrugMasterOfficialSpecPdfExternalText(
  input: DrugMasterOfficialSpecPdfExternalTextReviewInput
): DrugMasterOfficialSpecPdfExternalTextReviewResult {
  const source = input.source ?? DRUG_MASTER_SPECIFICATION_SOURCE;
  const text = requireReadableDrugMasterSpecText(input.text || '');
  const sourceUrl = input.sourceUrl
    ? normalizeOfficialDrugMasterSpecPdfFetchUrl(input.sourceUrl, source)
    : source.url;
  const fileName = input.fileName?.trim()
    ? makeSafeFileName(input.fileName)
    : getOfficialDrugMasterSpecPdfFileName(sourceUrl);
  const extractedAtValue = input.extractedAt instanceof Date
    ? input.extractedAt.toISOString()
    : input.extractedAt;
  const extractedAt = typeof extractedAtValue === 'string' && Number.isFinite(Date.parse(extractedAtValue))
    ? new Date(extractedAtValue).toISOString()
    : new Date().toISOString();
  const extractorName = input.extractorName?.trim() || 'external-ocr-or-text';
  const review = buildDrugMasterSpecificationPdfDiffReview(text);

  return {
    sourceUrl,
    fileName,
    extractedAt,
    extractorName,
    text,
    textLength: text.length,
    extractionMethod: 'external-ocr-or-text',
    review,
    reviewLabel: formatDrugMasterSpecificationPdfDiffReview(review),
    requiredActions: review.ok
      ? ['OCRまたは外部抽出本文の42項目一致を確認し、更新時の仕様PDF版チェックとして記録する']
      : ['OCRまたは外部抽出本文の読み取り位置を確認し、差分候補または欠落項目を見直す']
  };
}
