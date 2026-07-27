/**
 * 地方厚生局が毎月公開する「コード内容別医療機関一覧表」(Excel)を、
 * このアプリの MedicalInstitutionRecord 形式へ変換する。
 *
 * 実データで確認済みの前提(近畿厚生局・九州厚生局の令和8年7月版で検証):
 * - 1施設あたり2〜6行程度の「ブロック」で構成され、A列に連番が入る行がブロックの先頭。
 * - ブロック先頭行: A=連番, B=届出番号(区切り文字はハイフンまたはカンマで局により異なる),
 *   C=施設名, D=住所, E=電話番号, F=開設者, G=管理者/管理薬剤師, H=指定年月日, I=診療科・病床等, J=種別(病院/診療所/薬局等)
 * - ブロック内の後続行: E列に常勤/非常勤人数、H列に最新変更種別とその年月日、J列に現存/休止ステータスが入る。
 * - 局によって届出番号の区切り(ハイフン/カンマ)は異なるが、区切りを除くと全国共通で7桁の数字になる。
 *
 * 注意(重要): 医療機関コードの公式仕様は「都道府県番号(2桁)+点数表番号(1桁)+検索番号(7桁)」の10桁だが、
 * この一覧表からは都道府県(2桁, ファイル自体のスコープから判明)と検索番号(7桁, 届出番号)は確実に取れる一方、
 * 点数表番号(1桁)は一覧表だけからは確定できない。誤った桁を機械的に補って「10桁の正式コード」と
 * 偽装することは行わず、常に9桁(都道府県2桁+検索番号7桁)として保存し、コード表示・利用箇所では
 * その旨を明示する。正確な10桁コードが必要な場合は、レセプトソフト側の点数表番号の慣例と突き合わせて
 * 運用者自身が確認すること。
 */
import { PREFECTURE_CODES } from '../monthly_claim_uke';
import type { MedicalInstitutionRecord } from './medical_institution_master';
import {
  listXlsxEntriesInZip,
  parseXlsxSheetGrid,
  readXlsxSheetGridFromXlsxBytes,
  extractZipEntryBytes,
  listZipEntries,
  type XlsxCellGrid
} from './xlsx_zip_reader';

export type BureauInstitutionCategoryLabel = '病院' | '診療所' | '歯科診療所' | '歯科病院' | '薬局' | '不明';

export interface BureauInstitutionRawBlock {
  serialNumber: string;
  rawCode: string;
  name: string;
  address?: string;
  phone?: string;
  establisher?: string;
  administrator?: string;
  designatedAtRaw?: string;
  categoryLabel: BureauInstitutionCategoryLabel;
  status: '現存' | '休止' | '不明';
}

export interface BureauInstitutionParseIssue {
  serialNumber: string;
  reason: string;
}

export interface BureauInstitutionListParseResult {
  prefectureName: string;
  prefectureCode?: string;
  sourceFileName?: string;
  records: MedicalInstitutionRecord[];
  skippedInactiveCount: number;
  /** 薬局(トレーシングレポート等の宛先には使わないため対象外)としてスキップした件数 */
  skippedPharmacyCount: number;
  issues: BureauInstitutionParseIssue[];
}

const REVERSE_PREFECTURE_NAMES = new Set(PREFECTURE_CODES.keys());

function extractPrefectureName(grid: XlsxCellGrid): string | undefined {
  for (const [, cells] of grid) {
    for (const value of cells.values()) {
      const m = value.match(/^\[(.+?)\]$/);
      if (m && REVERSE_PREFECTURE_NAMES.has(m[1])) {
        return m[1];
      }
    }
  }
  return undefined;
}

/** 届出番号の区切り文字(ハイフン/カンマ/全角スペース等)を除去し、数字のみの文字列にする */
export function normalizeBureauInstitutionCode(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length !== 7) return null;
  return digits;
}

export function inferCategoryFromListingLabel(label: string): BureauInstitutionCategoryLabel {
  if (label.includes('歯科病院')) return '歯科病院';
  if (label.includes('歯科')) return '歯科診療所';
  if (label.includes('病院')) return '病院';
  if (label.includes('診療所')) return '診療所';
  if (label.includes('薬局')) return '薬局';
  return '不明';
}

function categoryLabelToRecordCategory(label: BureauInstitutionCategoryLabel): MedicalInstitutionRecord['category'] {
  switch (label) {
    case '病院':
    case '歯科病院':
      return label === '歯科病院' ? 'dental' : 'hospital';
    case '診療所':
      return 'clinic';
    case '歯科診療所':
      return 'dental';
    case '薬局':
      return 'pharmacy';
    default:
      return undefined;
  }
}

function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/**
 * グリッドをブロック(A列に連番が入る行から次の連番行の手前まで)へ分割し、
 * 各施設の生データを組み立てる。ZIP解凍やXLSX解析には依存しない純粋なロジック。
 */
export function groupBureauInstitutionBlocks(grid: XlsxCellGrid): BureauInstitutionRawBlock[] {
  const rowNumbers = [...grid.keys()].sort((a, b) => a - b);
  const blocks: BureauInstitutionRawBlock[] = [];

  let currentRows: number[] = [];
  const flushBlock = () => {
    if (currentRows.length === 0) return;
    const headerRow = grid.get(currentRows[0])!;
    const serialNumber = headerRow.get('A') || '';
    if (!/^\d+$/.test(serialNumber)) {
      currentRows = [];
      return;
    }

    const rawCode = (headerRow.get('B') || '').trim();
    const name = (headerRow.get('C') || '').trim();
    const address = headerRow.get('D')?.trim();
    const phone = headerRow.get('E')?.trim();
    const establisher = headerRow.get('F')?.trim();
    const administrator = headerRow.get('G')?.trim();
    const designatedAtRaw = headerRow.get('H')?.trim();

    // J列は通常ヘッダー行に種別(病院/診療所/薬局等)が入るが、「特定機能薬局」等の
    // 追加区分がヘッダー行に入り、種別自体は次行にずれる実例が確認されているため、
    // ブロック内の全行から種別に一致する値を探す(現存/休止ステータスとは別に判定)。
    let categoryLabel: BureauInstitutionCategoryLabel = '不明';
    let status: BureauInstitutionRawBlock['status'] = '不明';
    for (const rowNum of currentRows) {
      const cells = grid.get(rowNum)!;
      const jValue = cells.get('J');
      if (!jValue) continue;
      if (jValue === '現存' || jValue === '休止') {
        status = jValue;
        continue;
      }
      if (categoryLabel === '不明') {
        const inferred = inferCategoryFromListingLabel(jValue);
        if (inferred !== '不明') categoryLabel = inferred;
      }
    }

    blocks.push({ serialNumber, rawCode, name, address, phone, establisher, administrator, designatedAtRaw, categoryLabel, status });
    currentRows = [];
  };

  for (const rowNum of rowNumbers) {
    const cells = grid.get(rowNum)!;
    const aValue = cells.get('A');
    if (aValue !== undefined && /^\d+$/.test(aValue)) {
      flushBlock();
    }
    currentRows.push(rowNum);
  }
  flushBlock();

  return blocks;
}

function buildRecordsFromBlocks(
  blocks: BureauInstitutionRawBlock[],
  prefectureName: string | undefined
): { records: MedicalInstitutionRecord[]; skippedInactiveCount: number; skippedPharmacyCount: number; issues: BureauInstitutionParseIssue[] } {
  const prefectureCode = prefectureName ? PREFECTURE_CODES.get(prefectureName) : undefined;
  const records: MedicalInstitutionRecord[] = [];
  const issues: BureauInstitutionParseIssue[] = [];
  let skippedInactiveCount = 0;
  let skippedPharmacyCount = 0;

  for (const block of blocks) {
    if (block.status === '休止') {
      skippedInactiveCount++;
      continue;
    }

    const category = categoryLabelToRecordCategory(block.categoryLabel);
    if (category === 'pharmacy') {
      // 病院・診療所・歯科の宛先検索用マスタのため、薬局は取り込み対象外
      skippedPharmacyCount++;
      continue;
    }

    const scoreCode = normalizeBureauInstitutionCode(block.rawCode);
    if (!scoreCode) {
      issues.push({ serialNumber: block.serialNumber, reason: `届出番号「${block.rawCode}」を7桁の数字として解釈できません。` });
      continue;
    }
    if (!block.name) {
      issues.push({ serialNumber: block.serialNumber, reason: '施設名が空です。' });
      continue;
    }

    const code = prefectureCode ? `${prefectureCode}${scoreCode}` : scoreCode;

    records.push({
      code,
      scoreCode,
      prefectureCode: prefectureCode || '',
      name: block.name,
      address: block.address,
      phone: block.phone,
      category
    });
  }

  if (!prefectureCode && prefectureName) {
    issues.push({ serialNumber: '-', reason: `都道府県名「${prefectureName}」から都道府県コードを特定できませんでした。` });
  }

  return { records, skippedInactiveCount, skippedPharmacyCount, issues };
}

export function parseBureauInstitutionListGrid(
  grid: XlsxCellGrid,
  options?: { sourceFileName?: string }
): BureauInstitutionListParseResult {
  const prefectureName = extractPrefectureName(grid) || '不明';
  const prefectureCode = PREFECTURE_CODES.get(prefectureName);
  const blocks = groupBureauInstitutionBlocks(grid);
  const { records, skippedInactiveCount, skippedPharmacyCount, issues } = buildRecordsFromBlocks(blocks, prefectureName);

  return {
    prefectureName,
    prefectureCode,
    sourceFileName: options?.sourceFileName,
    records,
    skippedInactiveCount,
    skippedPharmacyCount,
    issues
  };
}

/** 単一の.xlsxファイル(都道府県1件分)を解析する */
export async function parseBureauInstitutionListXlsx(
  xlsxBytes: ArrayBuffer | Uint8Array,
  options?: { sourceFileName?: string }
): Promise<BureauInstitutionListParseResult> {
  const grid = await readXlsxSheetGridFromXlsxBytes(xlsxBytes);
  return parseBureauInstitutionListGrid(grid, options);
}

/**
 * 厚生局が配布する、都道府県別.xlsxを束ねた外側の.zipを解析する。
 * (例: 近畿厚生局の "2026.7_kikanzentai_yakkyoku.zip" のように、
 *  複数の都道府県分の.xlsxをまとめて1つのZIPで配布している場合)
 */
export async function parseBureauInstitutionListBundleZip(
  zipBytes: ArrayBuffer | Uint8Array
): Promise<BureauInstitutionListParseResult[]> {
  const xlsxEntries = listXlsxEntriesInZip(zipBytes);
  const results: BureauInstitutionListParseResult[] = [];

  for (const entry of xlsxEntries) {
    const xlsxBytes = await extractZipEntryBytes(zipBytes, entry);
    const result = await parseBureauInstitutionListXlsx(xlsxBytes, { sourceFileName: entry.fileName });
    results.push(result);
  }

  return results;
}

/** 入力バイト列が「外側zip(複数xlsxを束ねたもの)」か「単一xlsx」かを判定して適切に解析する */
export async function parseBureauInstitutionListUpload(
  bytes: ArrayBuffer | Uint8Array,
  fileName: string
): Promise<BureauInstitutionListParseResult[]> {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith('.xlsx')) {
    return [await parseBureauInstitutionListXlsx(bytes, { sourceFileName: fileName })];
  }

  // .zip: 中に.xlsxが1件でも複数件でも対応
  const entries = listZipEntries(bytes);
  const hasXlsx = entries.some((e) => /\.xlsx$/i.test(e.fileName));
  if (!hasXlsx) {
    throw new Error('ZIP内に医療機関一覧表の.xlsxファイルが見つかりません。');
  }
  return parseBureauInstitutionListBundleZip(bytes);
}

export { parseXlsxSheetGrid };
