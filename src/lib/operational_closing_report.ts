import type { OperationalKpiCounts, OperationalKpis } from './operational_kpi.ts';
import type { BackupContinuityReport } from './backup.ts';

export interface OperationalClosingClaimRiskSummary {
  priority: 'high' | 'medium';
  riskScore: number;
  topIssueTitles: string[];
  actionLabel: string;
}

export interface OperationalClosingInventorySummary {
  priority: 'high' | 'medium';
  drugName: string;
  shortageAmount: number;
  actionLabel: string;
}

export interface OperationalClosingClaimWorkSummary {
  priorityLabel: string;
  statusLabel: string;
  actionLabel: string;
}

export interface OperationalClosingFollowUpSummary {
  priority: 'high' | 'medium';
  reasonFlags: string[];
  dueLabel: string;
  suggestedAction: string;
}

export interface OperationalClosingReportInput {
  generatedAt: Date;
  reviewerName: string;
  storeName?: string;
  storeCode?: string;
  kpis: OperationalKpis;
  counts: OperationalKpiCounts & {
    claimRiskCount: number;
    claimWorkbenchCount: number;
    followUpDueCount: number;
  };
  urgentInventoryRiskCount: number;
  claimRisks: OperationalClosingClaimRiskSummary[];
  inventoryRisks: OperationalClosingInventorySummary[];
  claimWorkItems: OperationalClosingClaimWorkSummary[];
  followUpCandidates: OperationalClosingFollowUpSummary[];
  backupContinuity?: BackupContinuityReport;
  inventoryReceivingCount?: number;
  supportCaseCount?: number;
}

export interface OperationalClosingReportRow {
  category: string;
  item: string;
  value: string;
  detail: string;
}

export interface OperationalClosingReport {
  generatedAt: string;
  generatedAtLabel: string;
  reviewerName: string;
  storeName?: string;
  storeCode?: string;
  rows: OperationalClosingReportRow[];
  memoLines: string[];
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function addRow(rows: OperationalClosingReportRow[], category: string, item: string, value: string | number, detail = '') {
  rows.push({
    category,
    item,
    value: String(value),
    detail
  });
}

function summarizeClaimRisks(risks: OperationalClosingClaimRiskSummary[]): string {
  if (risks.length === 0) return '対象なし';
  return risks
    .slice(0, 3)
    .map((risk) => `${risk.priority === 'high' ? '要修正' : '要確認'}:${risk.topIssueTitles.slice(0, 2).join('/') || risk.actionLabel}`)
    .join(' / ');
}

function safeInlineText(value: string): string {
  return /^[=+\-@]/.test(value.trimStart()) ? `'${value}` : value;
}

function summarizeInventoryRisks(risks: OperationalClosingInventorySummary[]): string {
  if (risks.length === 0) return '対象なし';
  return risks
    .slice(0, 3)
    .map((risk) => `${risk.priority === 'high' ? '至急' : '注意'}:${safeInlineText(risk.drugName)} 不足${risk.shortageAmount}`)
    .join(' / ');
}

function summarizeClaimWorks(items: OperationalClosingClaimWorkSummary[]): string {
  if (items.length === 0) return '対象なし';
  return items
    .slice(0, 3)
    .map((item) => `${item.priorityLabel}:${item.statusLabel}/${item.actionLabel}`)
    .join(' / ');
}

function summarizeFollowUps(candidates: OperationalClosingFollowUpSummary[]): string {
  if (candidates.length === 0) return '対象なし';
  return candidates
    .slice(0, 3)
    .map((candidate) => `${candidate.priority === 'high' ? '本日対応' : candidate.dueLabel}:${candidate.reasonFlags.slice(0, 2).join('/') || candidate.suggestedAction}`)
    .join(' / ');
}

export function buildOperationalClosingReport(input: OperationalClosingReportInput): OperationalClosingReport {
  const rows: OperationalClosingReportRow[] = [];
  const { daily, monthly } = input.kpis;
  const generatedAtLabel = formatDateTime(input.generatedAt);

  addRow(rows, '基本', '作成日時', generatedAtLabel, 'ローカル端末時刻');
  addRow(rows, '基本', '確認者', input.reviewerName || '未設定', '店舗責任者または当日確認者');
  if (input.storeName || input.storeCode) {
    addRow(rows, '基本', '店舗', input.storeName || '未設定', input.storeCode ? `店舗コード ${input.storeCode}` : '');
  }

  addRow(rows, 'KPI', '本日完了率', daily.completionRateLabel, `${daily.completedCount}/${daily.receptionCount}件完了`);
  addRow(rows, 'KPI', '平均処理時間', daily.averageCompletionLabel, '受付から薬歴SOAP更新まで');
  addRow(rows, 'KPI', '閉店前残タスク', daily.closingBlockerCount, daily.closingStatusLabel);
  addRow(rows, 'KPI', '月次請求締め率', monthly.closedClaimRateLabel, `${monthly.closedClaimCount}/${monthly.claimTargetCount}件締め`);

  addRow(rows, '残タスク', '稼働中受付', daily.activeQueueCount, `受付待ち${input.counts.waitingCount}件 / 処理中${input.counts.processingCount}件`);
  addRow(rows, '残タスク', '薬剤師確認', input.counts.reviewCount, '監査・入力確認が必要な受付');
  addRow(rows, '残タスク', 'GS1未照合', input.counts.pickingPendingCount, 'ピッキング支援で未照合の薬剤');
  addRow(rows, '残タスク', '請求リスク', input.counts.claimRiskCount, summarizeClaimRisks(input.claimRisks));
  addRow(rows, '残タスク', '返戻・再請求', input.counts.claimWorkbenchCount, summarizeClaimWorks(input.claimWorkItems));
  addRow(
    rows,
    '残タスク',
    '在庫不足',
    input.counts.inventoryShortageCount,
    `至急${input.urgentInventoryRiskCount}品目 / ${summarizeInventoryRisks(input.inventoryRisks)}`
  );
  addRow(
    rows,
    '現場KPI',
    '入庫登録',
    input.inventoryReceivingCount ?? 0,
    '発注ワークベンチからロット在庫へ登録した件数'
  );
  addRow(rows, '残タスク', '服薬フォロー', input.counts.followUpDueCount, summarizeFollowUps(input.followUpCandidates));
  addRow(
    rows,
    '現場KPI',
    '問い合わせ負荷',
    input.supportCaseCount ?? 0,
    '個人情報なし診断やサポート対応の当日記録件数'
  );

  addRow(
    rows,
    '責任者確認',
    'バックアップ確認',
    input.backupContinuity?.statusLabel || '未記録',
    input.backupContinuity
      ? `${input.backupContinuity.detail} / ${input.backupContinuity.recommendation}`
      : '日次締め後に暗号化バックアップの保存場所を確認'
  );
  addRow(rows, '責任者確認', '監査ログ', '要確認', '設定画面の監査ログ整合性で異常がないことを確認');
  addRow(rows, '責任者確認', '請求締め', monthly.openClaimCount === 0 ? '未締めなし' : `未締め${monthly.openClaimCount}件`, '月次請求ワークベンチで状態確認');

  const memoLines = [
    `日次締めレビュー ${generatedAtLabel}`,
    ...(input.storeName || input.storeCode ? [`店舗: ${input.storeName || '未設定'}${input.storeCode ? ` (${input.storeCode})` : ''}`] : []),
    `確認者: ${input.reviewerName || '未設定'}`,
    `本日完了率: ${daily.completionRateLabel} (${daily.completedCount}/${daily.receptionCount}件)`,
    `平均処理時間: ${daily.averageCompletionLabel}`,
    `閉店前残タスク: ${daily.closingBlockerCount}件 (${daily.closingStatusLabel})`,
    `月次請求締め率: ${monthly.closedClaimRateLabel} (${monthly.closedClaimCount}/${monthly.claimTargetCount}件)`,
    `請求リスク: ${input.counts.claimRiskCount}件 / ${summarizeClaimRisks(input.claimRisks)}`,
    `返戻・再請求: ${input.counts.claimWorkbenchCount}件 / ${summarizeClaimWorks(input.claimWorkItems)}`,
    `在庫不足: ${input.counts.inventoryShortageCount}品目 (至急${input.urgentInventoryRiskCount}品目) / ${summarizeInventoryRisks(input.inventoryRisks)}`,
    `入庫登録: ${input.inventoryReceivingCount ?? 0}件`,
    `服薬フォロー: ${input.counts.followUpDueCount}件 / ${summarizeFollowUps(input.followUpCandidates)}`,
    `問い合わせ負荷: ${input.supportCaseCount ?? 0}件`,
    `バックアップ確認: ${input.backupContinuity?.statusLabel || '未記録'} / ${input.backupContinuity?.recommendation || '暗号化バックアップの保存場所を確認'}`,
    '責任者確認: バックアップ保存、監査ログ整合性、月次請求ワークベンチを確認'
  ];

  return {
    generatedAt: input.generatedAt.toISOString(),
    generatedAtLabel,
    reviewerName: input.reviewerName,
    storeName: input.storeName,
    storeCode: input.storeCode,
    rows,
    memoLines
  };
}

export function buildOperationalClosingCsv(report: OperationalClosingReport): string {
  const header = ['区分', '項目', '値', '補足'];
  const rows = report.rows.map((row) => [row.category, row.item, row.value, row.detail]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildOperationalClosingMemo(report: OperationalClosingReport): string {
  return report.memoLines.join('\n');
}

function findReportRow(report: OperationalClosingReport, item: string): OperationalClosingReportRow | undefined {
  return report.rows.find((row) => row.item === item);
}

export function buildOperationalClosingAuditDetails(report: OperationalClosingReport): string {
  const completion = findReportRow(report, '本日完了率');
  const blockers = findReportRow(report, '閉店前残タスク');
  const monthlyClaims = findReportRow(report, '月次請求締め率');
  const backup = findReportRow(report, 'バックアップ確認');
  const auditLog = findReportRow(report, '監査ログ');
  const claimClosing = findReportRow(report, '請求締め');
  const inventoryShortage = findReportRow(report, '在庫不足');
  const inventoryReceiving = findReportRow(report, '入庫登録');
  const followUp = findReportRow(report, '服薬フォロー');
  const supportCases = findReportRow(report, '問い合わせ負荷');

  return [
    `日次締め承認: ${report.generatedAtLabel}`,
    ...(report.storeName ? [`店舗名 ${report.storeName}`] : []),
    ...(report.storeCode ? [`店舗コード ${report.storeCode}`] : []),
    `確認者 ${report.reviewerName || '未設定'}`,
    `本日完了率 ${completion?.value || '未集計'}${completion?.detail ? ` (${completion.detail})` : ''}`,
    `閉店前残タスク ${blockers?.value || '未集計'}${blockers?.detail ? ` (${blockers.detail})` : ''}`,
    `月次請求締め率 ${monthlyClaims?.value || '未集計'}${monthlyClaims?.detail ? ` (${monthlyClaims.detail})` : ''}`,
    `在庫不足 ${inventoryShortage?.value || '0'}品目${inventoryShortage?.detail ? ` (${inventoryShortage.detail})` : ''}`,
    `入庫登録 ${inventoryReceiving?.value || '0'}件`,
    `服薬フォロー ${followUp?.value || '0'}件${followUp?.detail ? ` (${followUp.detail})` : ''}`,
    `問い合わせ負荷 ${supportCases?.value || '0'}件`,
    `バックアップ確認 ${backup?.value || '未確認'}${backup?.detail ? ` (${backup.detail})` : ''}`,
    `監査ログ ${auditLog?.value || '未確認'}`,
    `請求締め ${claimClosing?.value || '未確認'}`
  ].join(' / ');
}
