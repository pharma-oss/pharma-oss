import { csvCell, formatInventoryAmount } from './inventory_order.ts';

export type DailyControlledDrugKind = 'narcotic' | 'psychotropic';

export const DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS = [
  { value: 'counting_error', label: '計数誤り' },
  { value: 'damage_disposal', label: '破損・廃棄' },
  { value: 'return_transfer', label: '返品・移動' },
  { value: 'unreflected_transaction', label: '入出庫未反映' },
  { value: 'investigating', label: 'その他・調査中' }
] as const;

export type DailyControlledDrugDifferenceReason =
  typeof DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS[number]['value'];

export const DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY =
  'yakureki_controlled_drug_daily_check_latest_v1';

export interface DailyControlledDrugSnapshotEntry {
  actualCount: number;
  diff: number;
  differenceReason?: DailyControlledDrugDifferenceReason;
  checkedAt: string;
  checkedBy: string;
}

export interface DailyControlledDrugCheckSnapshot {
  version: 1;
  updatedAt: string;
  entries: Record<string, DailyControlledDrugSnapshotEntry>;
}

export interface DailyControlledDrugCheckRow {
  drugCode: string;
  yjCode?: string;
  drugName: string;
  kind: DailyControlledDrugKind;
  systemStock: number;
  pendingStock: number;
  shelfStockSystem: number;
  actualCount?: number;
  differenceReason?: DailyControlledDrugDifferenceReason;
  previousActualCount?: number;
  previousDiff?: number;
  previousDifferenceReason?: DailyControlledDrugDifferenceReason;
  previousCheckedAt?: string;
  previousCheckedBy?: string;
}

export interface DailyControlledDrugCheckSummary {
  totalCount: number;
  enteredCount: number;
  unenteredCount: number;
  mismatchCount: number;
}

export function hasDailyControlledDrugActualCount(row: DailyControlledDrugCheckRow): boolean {
  return typeof row.actualCount === 'number' && Number.isFinite(row.actualCount);
}

export function getDailyControlledDrugDiff(row: DailyControlledDrugCheckRow): number | null {
  if (!hasDailyControlledDrugActualCount(row)) return null;
  return (row.actualCount as number) - row.shelfStockSystem;
}

export function getDailyControlledDrugCheckStatusLabel(row: DailyControlledDrugCheckRow): string {
  const diff = getDailyControlledDrugDiff(row);
  if (diff === null) return '未入力';
  return diff === 0 ? '一致' : '差異あり';
}

export function getDailyControlledDrugCheckSummary(
  rows: DailyControlledDrugCheckRow[]
): DailyControlledDrugCheckSummary {
  let enteredCount = 0;
  let mismatchCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const diff = getDailyControlledDrugDiff(rows[i]);
    if (diff === null) continue;
    enteredCount++;
    if (diff !== 0) mismatchCount++;
  }

  return {
    totalCount: rows.length,
    enteredCount,
    unenteredCount: rows.length - enteredCount,
    mismatchCount
  };
}

export function formatDailyControlledDrugDiff(diff: number | null): string {
  if (diff === null) return '';
  if (diff === 0) return '0';
  return diff > 0 ? `+${formatInventoryAmount(diff)}` : formatInventoryAmount(diff);
}

export function getDailyControlledDrugDifferenceReasonLabel(
  reason: DailyControlledDrugDifferenceReason | undefined
): string {
  if (!reason) return '';
  return DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS.find((option) => option.value === reason)?.label || '';
}

export function getDailyControlledDrugMissingReasonRows(
  rows: DailyControlledDrugCheckRow[]
): DailyControlledDrugCheckRow[] {
  return rows.filter((row) => {
    const diff = getDailyControlledDrugDiff(row);
    return diff !== null && diff !== 0 && !getDailyControlledDrugDifferenceReasonLabel(row.differenceReason);
  });
}

export function mergeDailyControlledDrugCheckSnapshot(
  previous: DailyControlledDrugCheckSnapshot | null,
  rows: DailyControlledDrugCheckRow[],
  checkedAt: string,
  checkedBy: string
): DailyControlledDrugCheckSnapshot {
  const entries = { ...(previous?.entries || {}) };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const diff = getDailyControlledDrugDiff(row);
    if (diff === null) continue;
    entries[row.drugCode] = {
      actualCount: row.actualCount as number,
      diff,
      differenceReason: diff === 0 ? undefined : row.differenceReason,
      checkedAt,
      checkedBy
    };
  }

  return { version: 1, updatedAt: checkedAt, entries };
}

export function parseDailyControlledDrugCheckSnapshot(
  raw: string | null | undefined
): DailyControlledDrugCheckSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DailyControlledDrugCheckSnapshot>;
    if (parsed.version !== 1 || typeof parsed.updatedAt !== 'string' || !parsed.entries || typeof parsed.entries !== 'object') {
      return null;
    }

    const entries: Record<string, DailyControlledDrugSnapshotEntry> = {};
    for (const [drugCode, value] of Object.entries(parsed.entries)) {
      if (!value || typeof value !== 'object') continue;
      const entry = value as Partial<DailyControlledDrugSnapshotEntry>;
      if (
        !Number.isFinite(entry.actualCount) ||
        !Number.isFinite(entry.diff) ||
        typeof entry.checkedAt !== 'string' ||
        typeof entry.checkedBy !== 'string'
      ) {
        continue;
      }
      const reasonLabel = getDailyControlledDrugDifferenceReasonLabel(entry.differenceReason);
      entries[drugCode] = {
        actualCount: entry.actualCount as number,
        diff: entry.diff as number,
        differenceReason: reasonLabel ? entry.differenceReason : undefined,
        checkedAt: entry.checkedAt,
        checkedBy: entry.checkedBy
      };
    }

    return { version: 1, updatedAt: parsed.updatedAt, entries };
  } catch {
    return null;
  }
}

export function buildDailyControlledDrugCheckAuditDetail(
  rows: DailyControlledDrugCheckRow[],
  totalTargetCount: number
): string {
  const enteredRows = rows.filter(hasDailyControlledDrugActualCount);
  const mismatchRows = enteredRows.filter((row) => getDailyControlledDrugDiff(row) !== 0);

  if (mismatchRows.length === 0) {
    return `棚卸確認: 麻薬・向精神薬の実地棚卸で ${enteredRows.length}/${totalTargetCount}件を確認し、在庫補正はありませんでした。`;
  }

  const mismatchDetails = mismatchRows.map((row) => {
    const diff = getDailyControlledDrugDiff(row);
    const reason = getDailyControlledDrugDifferenceReasonLabel(row.differenceReason) || '理由未選択';
    return `${row.drugName} ${formatDailyControlledDrugDiff(diff)}（${reason}）`;
  });
  const prefix = `棚卸補正: 麻薬・向精神薬の実地棚卸で ${mismatchRows.length}件の在庫を補正しました。確認 ${enteredRows.length}/${totalTargetCount}件。差異明細: `;
  const maxDetailLength = 1998;
  let detail = prefix;

  for (let i = 0; i < mismatchDetails.length; i++) {
    const separator = i === 0 ? '' : ' / ';
    if ((detail + separator + mismatchDetails[i]).length > maxDetailLength) {
      return `${detail}…`;
    }
    detail += `${separator}${mismatchDetails[i]}`;
  }
  return detail;
}

export function buildDailyControlledDrugCheckCsv(rows: DailyControlledDrugCheckRow[]): string {
  const header = [
    '確認状態',
    '区分',
    '薬品コード',
    'YJコード',
    '医薬品名',
    '現在庫',
    '引き渡し予定',
    '棚在庫システム',
    '実地数',
    '差異',
    '差異理由',
    '前回実地数',
    '前回確認日時',
    '前回確認者'
  ];
  const bodyRows = rows.map((row) => {
    const diff = getDailyControlledDrugDiff(row);
    return [
      getDailyControlledDrugCheckStatusLabel(row),
      row.kind === 'narcotic' ? '麻薬' : '向精神薬',
      row.drugCode,
      row.yjCode || '',
      row.drugName,
      formatInventoryAmount(row.systemStock),
      row.pendingStock > 0 ? formatInventoryAmount(row.pendingStock) : '',
      formatInventoryAmount(row.shelfStockSystem),
      hasDailyControlledDrugActualCount(row) ? formatInventoryAmount(row.actualCount as number) : '',
      formatDailyControlledDrugDiff(diff),
      diff !== null && diff !== 0 ? getDailyControlledDrugDifferenceReasonLabel(row.differenceReason) : '',
      typeof row.previousActualCount === 'number' ? formatInventoryAmount(row.previousActualCount) : '',
      row.previousCheckedAt || '',
      row.previousCheckedBy || ''
    ];
  });

  return [header, ...bodyRows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

export function buildDailyCheckSaveNoticeMessage(snapshotPersisted: boolean): string {
  return snapshotPersisted
    ? '日次棚卸し結果を保存し、監査ログに記録しました。'
    : '日次棚卸し結果を監査ログに記録しましたが、端末スナップショットの保存に失敗しました。';
}

export const DAILY_CHECK_RESTORE_ERROR_TOAST = '前回の点検結果を読み込めませんでした。';
export const DAILY_CHECK_RESTORE_ERROR_BANNER =
  '前回の点検結果を読み込めなかったため、前回との照合ができていません。前回の記録を確認してください。';
export const DAILY_CHECK_PREVIOUS_LOAD_ERROR = '前回の記録を読み込めません';
export const DAILY_CHECK_PREVIOUS_NONE = '前回なし';

export type DailyControlledDrugSnapshotRestoreResult =
  | { status: 'not_found'; snapshot: null }
  | { status: 'restored'; snapshot: DailyControlledDrugCheckSnapshot }
  | { status: 'load_error'; snapshot: null };

export function restoreDailyControlledDrugCheckSnapshot(
  storageKey: string,
  getItem: (key: string) => string | null
): DailyControlledDrugSnapshotRestoreResult {
  try {
    const raw = getItem(storageKey);
    if (!raw) {
      return { status: 'not_found', snapshot: null };
    }
    const snapshot = parseDailyControlledDrugCheckSnapshot(raw);
    if (!snapshot) {
      return { status: 'load_error', snapshot: null };
    }
    return { status: 'restored', snapshot };
  } catch {
    return { status: 'load_error', snapshot: null };
  }
}

export function formatDailyCheckPreviousCheckedAt(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getDailyCheckPreviousSummary(
  row: Pick<DailyControlledDrugCheckRow, 'previousDiff' | 'previousDifferenceReason' | 'previousCheckedAt'>,
  hasRestoreError: boolean
): string {
  if (hasRestoreError) {
    return DAILY_CHECK_PREVIOUS_LOAD_ERROR;
  }
  if (typeof row.previousDiff !== 'number') {
    return DAILY_CHECK_PREVIOUS_NONE;
  }
  const when = formatDailyCheckPreviousCheckedAt(row.previousCheckedAt);
  const statusText =
    row.previousDiff === 0
      ? '前回一致'
      : `前回差異 ${formatDailyControlledDrugDiff(row.previousDiff)}`;
  const reasonText = row.previousDifferenceReason
    ? ` (${getDailyControlledDrugDifferenceReasonLabel(row.previousDifferenceReason)})`
    : '';
  return `${statusText}${reasonText}${when ? ` (${when})` : ''}`;
}

