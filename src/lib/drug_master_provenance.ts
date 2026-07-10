import type { DrugMasterSourceEvidence } from './drug_master_version.ts';

export const SSK_BASIC_MASTER_PAGE_URL = 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.html';
export const SSK_DRUG_MASTER_PAGE_URL = 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/kihonmasta_04.html';

export type DrugMasterOfficialLinkKind =
  | 'full_master'
  | 'revision_master'
  | 'revision_notice'
  | 'long_listed_drug'
  | 'abolition_period'
  | 'other';

export interface DrugMasterOfficialDownloadCandidate {
  kind: DrugMasterOfficialLinkKind;
  title: string;
  url: string;
  updateDate?: string;
  fileType?: string;
  sizeLabel?: string;
  sourcePageUrl: string;
}

export interface DrugMasterSourceUrlReview {
  normalizedUrl?: string;
  isOfficialSskUrl: boolean;
  sourceKind: 'ssk-drug-master-page' | 'ssk-basic-master-page' | 'ssk-drug-master-file' | 'other';
  canonicalPageUrl: string;
  message: string;
}

export interface BuildDrugMasterSourceEvidenceInput {
  sourceFileName: string;
  sourceFileType?: 'csv' | 'zip';
  extractedCsvFileName?: string;
  archiveEntryCount?: number;
  csvEntryCount?: number;
  sourceUrl?: string;
  fileSizeBytes: number;
  arrayBuffer: ArrayBuffer;
  capturedAt?: Date;
  layoutLabel?: string;
  rowCount?: number;
  skippedRowCount?: number;
  sourceUrlReviewLabel?: string;
  specificationRevisionLabel?: string;
  specificationSourceUrl?: string;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeDrugMasterSourceUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new Error('更新元URLは http:// または https:// で始まるURLを入力してください。');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('更新元URLは http:// または https:// で始まるURLを入力してください。');
  }

  return parsed.href;
}

function stripTags(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeText(value: string): string {
  return decodeHtmlEntities(stripTags(value))
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferCandidateKind(title: string): DrugMasterOfficialLinkKind {
  if (/全件ファイル/.test(title)) return 'full_master';
  if (/改定分ファイル/.test(title)) return 'revision_master';
  if (/改定分内容/.test(title)) return 'revision_notice';
  if (/長期収載品/.test(title)) return 'long_listed_drug';
  if (/経過措置|使用期間/.test(title)) return 'abolition_period';
  return 'other';
}

function findLastUpdateDate(text: string): string | undefined {
  const matches = Array.from(text.matchAll(/\d{4}年\d{1,2}月\d{1,2}日/g));
  return matches.at(-1)?.[0];
}

function extractFileMeta(title: string): { fileType?: string; sizeLabel?: string } {
  const match = title.match(/\((ZIP|CSV|PDF|Excel|XLSX?|xlsx?|zip|csv|pdf):\s*([^)]+)\)/i);
  if (!match) return {};
  return {
    fileType: match[1].toUpperCase(),
    sizeLabel: match[2].trim()
  };
}

export function extractSskDrugMasterDownloadCandidates(
  html: string,
  sourcePageUrl = SSK_DRUG_MASTER_PAGE_URL
): DrugMasterOfficialDownloadCandidate[] {
  const candidates: DrugMasterOfficialDownloadCandidate[] = [];
  const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html)) !== null) {
    const href = decodeHtmlEntities(match[1]);
    const title = normalizeText(match[2]);
    const kind = inferCandidateKind(title);
    if (kind === 'other') continue;

    let url: string;
    try {
      url = new URL(href, sourcePageUrl).href;
    } catch {
      continue;
    }

    const contextStart = Math.max(0, match.index - 320);
    const beforeText = normalizeText(html.slice(contextStart, match.index));
    const fileMeta = extractFileMeta(title);
    candidates.push({
      kind,
      title,
      url,
      updateDate: findLastUpdateDate(beforeText),
      fileType: fileMeta.fileType,
      sizeLabel: fileMeta.sizeLabel,
      sourcePageUrl
    });
  }

  return candidates;
}

export function reviewDrugMasterSourceUrl(sourceUrl?: string): DrugMasterSourceUrlReview {
  const normalizedUrl = sourceUrl ? normalizeDrugMasterSourceUrl(sourceUrl) : undefined;
  if (!normalizedUrl) {
    return {
      isOfficialSskUrl: false,
      sourceKind: 'other',
      canonicalPageUrl: SSK_DRUG_MASTER_PAGE_URL,
      message: '更新元URL未入力'
    };
  }

  const parsed = new URL(normalizedUrl);
  const isOfficialSskUrl = parsed.hostname === 'www.ssk.or.jp' || parsed.hostname.endsWith('.ssk.or.jp');
  const normalizedPath = parsed.pathname;
  let sourceKind: DrugMasterSourceUrlReview['sourceKind'] = 'other';
  if (normalizedUrl === SSK_DRUG_MASTER_PAGE_URL) {
    sourceKind = 'ssk-drug-master-page';
  } else if (normalizedUrl === SSK_BASIC_MASTER_PAGE_URL) {
    sourceKind = 'ssk-basic-master-page';
  } else if (isOfficialSskUrl && /kihonmasta|master/i.test(normalizedPath)) {
    sourceKind = 'ssk-drug-master-file';
  }

  const message = sourceKind === 'ssk-drug-master-page'
    ? '支払基金 医薬品マスター掲載ページ'
    : sourceKind === 'ssk-basic-master-page'
      ? '支払基金 基本マスター掲載ページ'
      : sourceKind === 'ssk-drug-master-file'
        ? '支払基金 医薬品マスター候補ファイル'
        : isOfficialSskUrl
          ? '支払基金サイト内URL（医薬品マスター種別は要確認）'
          : '支払基金公式URLとしては未確認';

  return {
    normalizedUrl,
    isOfficialSskUrl,
    sourceKind,
    canonicalPageUrl: SSK_DRUG_MASTER_PAGE_URL,
    message
  };
}

export function formatDrugMasterSourceUrlReview(review: DrugMasterSourceUrlReview): string {
  return `${review.message}${review.normalizedUrl ? ` / ${review.normalizedUrl}` : ''}`;
}

export async function sha256Hex(arrayBuffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('このブラウザではファイルハッシュを計算できません。');
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', arrayBuffer);
  return bytesToHex(digest);
}

export async function buildDrugMasterSourceEvidence(
  input: BuildDrugMasterSourceEvidenceInput
): Promise<DrugMasterSourceEvidence> {
  const capturedAt = input.capturedAt || new Date();
  return {
    sourceFileName: input.sourceFileName,
    sourceFileType: input.sourceFileType,
    extractedCsvFileName: input.extractedCsvFileName,
    archiveEntryCount: input.archiveEntryCount,
    csvEntryCount: input.csvEntryCount,
    sourceUrl: input.sourceUrl,
    fileSizeBytes: input.fileSizeBytes,
    sha256: await sha256Hex(input.arrayBuffer),
    capturedAt: capturedAt.toISOString(),
    layoutLabel: input.layoutLabel,
    rowCount: input.rowCount,
    skippedRowCount: input.skippedRowCount,
    sourceUrlReviewLabel: input.sourceUrlReviewLabel,
    specificationRevisionLabel: input.specificationRevisionLabel,
    specificationSourceUrl: input.specificationSourceUrl
  };
}
