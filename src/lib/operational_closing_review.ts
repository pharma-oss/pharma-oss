import type { AuditLog } from '../db/types.ts';

export interface OperationalClosingApprovalRecord {
  logId: string;
  timestamp: string;
  dateKey: string;
  dateLabel: string;
  reviewerName: string;
  storeName: string;
  storeCode?: string;
  completionRate?: number;
  closingBlockerCount?: number;
  inventoryShortageCount?: number;
  inventoryReceivingCount?: number;
  followUpDueCount?: number;
  supportCaseCount?: number;
  monthlyClaimRate?: number;
  integrityHash?: string;
  details: string;
}

export interface OperationalClosingMonthlyReview {
  monthKey: string;
  monthLabel: string;
  approvalCount: number;
  approvedDayCount: number;
  reviewerCount: number;
  averageCompletionRate?: number;
  averageCompletionRateLabel: string;
  daysWithBlockers: number;
  totalClosingBlockers: number;
  totalInventoryShortages: number;
  totalInventoryReceivings: number;
  totalFollowUpDueCount: number;
  totalSupportCaseCount: number;
  latestApproval?: OperationalClosingApprovalRecord;
  allApprovals: OperationalClosingApprovalRecord[];
  recentApprovals: OperationalClosingApprovalRecord[];
  completionTrendLabel: string;
  blockerTrendLabel: string;
  previousMonthComparison: OperationalClosingPreviousMonthComparison;
  monthlyKpiHistory: OperationalClosingMonthSnapshot[];
  storeBenchmark: OperationalClosingStoreBenchmark;
}

export interface OperationalClosingMonthSnapshot {
  monthKey: string;
  monthLabel: string;
  approvalCount: number;
  approvedDayCount: number;
  averageCompletionRate?: number;
  averageCompletionRateLabel: string;
  daysWithBlockers: number;
  totalClosingBlockers: number;
  totalInventoryShortages: number;
  totalInventoryReceivings: number;
  totalFollowUpDueCount: number;
  totalSupportCaseCount: number;
}

export interface OperationalClosingPreviousMonthComparison {
  previousMonth: OperationalClosingMonthSnapshot;
  approvedDayDelta: number;
  approvedDayDeltaLabel: string;
  averageCompletionRateDelta?: number;
  averageCompletionRateDeltaLabel: string;
  daysWithBlockersDelta: number;
  daysWithBlockersDeltaLabel: string;
  totalClosingBlockersDelta: number;
  totalClosingBlockersDeltaLabel: string;
  inventoryShortageDelta: number;
  inventoryShortageDeltaLabel: string;
  inventoryReceivingDelta: number;
  inventoryReceivingDeltaLabel: string;
  followUpDueDelta: number;
  followUpDueDeltaLabel: string;
  supportCaseDelta: number;
  supportCaseDeltaLabel: string;
  status: 'improved' | 'attention' | 'flat' | 'no_data';
  statusLabel: string;
}

export interface OperationalClosingStoreSummary {
  storeKey: string;
  storeName: string;
  storeCode?: string;
  approvalCount: number;
  approvedDayCount: number;
  averageCompletionRate?: number;
  averageCompletionRateLabel: string;
  averageMonthlyClaimRate?: number;
  averageMonthlyClaimRateLabel: string;
  daysWithBlockers: number;
  totalClosingBlockers: number;
  totalInventoryShortages: number;
  averageInventoryShortageCount: number;
  averageInventoryShortageLabel: string;
  totalInventoryReceivings: number;
  averageInventoryReceivingCount: number;
  averageInventoryReceivingLabel: string;
  totalFollowUpDueCount: number;
  averageFollowUpDueCount: number;
  averageFollowUpDueLabel: string;
  totalSupportCaseCount: number;
  averageSupportCaseCount: number;
  averageSupportCaseLabel: string;
  completionRateDifferenceFromAverage?: number;
  blockerDifferenceFromAverage: number;
  inventoryShortageDifferenceFromAverage: number;
  inventoryReceivingDifferenceFromAverage: number;
  followUpDueDifferenceFromAverage: number;
  supportCaseDifferenceFromAverage: number;
}

export interface OperationalClosingStoreBenchmarkActionTemplate {
  id: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  targetStoreName: string;
  dueInDays: number;
  assigneeLabel: string;
  crossStoreFollowUpLabel: string;
  crossStoreTargetStoreNames: string[];
  steps: string[];
  expectedOutcome: string;
}

export interface OperationalClosingStoreBenchmarkActionExecution {
  logId: string;
  timestamp: string;
  dateLabel: string;
  recordedBy: string;
  templateId: string;
  title: string;
  targetStoreName: string;
  priority: OperationalClosingStoreBenchmarkActionTemplate['priority'];
  assigneeLabel: string;
  crossStoreFollowUpLabel: string;
  baselineAverageCompletionRate?: number;
  baselineAverageCompletionRateLabel: string;
  currentAverageCompletionRate?: number;
  currentAverageCompletionRateLabel: string;
  completionRateDelta?: number;
  completionRateDeltaLabel: string;
  baselineTotalClosingBlockers?: number;
  baselineBlockerDifferenceFromAverage?: number;
  baselineBlockerDifferenceFromAverageLabel: string;
  currentTotalClosingBlockers?: number;
  blockerDelta?: number;
  blockerDeltaLabel: string;
  baselineAverageClosingBlockers?: number;
  baselineAverageClosingBlockersLabel: string;
  currentAverageClosingBlockers?: number;
  currentAverageClosingBlockersLabel: string;
  closingBlockerAverageDelta?: number;
  closingBlockerAverageDeltaLabel: string;
  baselineAverageInventoryShortages?: number;
  baselineAverageInventoryShortagesLabel: string;
  currentAverageInventoryShortages?: number;
  currentAverageInventoryShortagesLabel: string;
  inventoryShortageDelta?: number;
  inventoryShortageDeltaLabel: string;
  baselineAverageInventoryReceivings?: number;
  baselineAverageInventoryReceivingsLabel: string;
  currentAverageInventoryReceivings?: number;
  currentAverageInventoryReceivingsLabel: string;
  inventoryReceivingDelta?: number;
  inventoryReceivingDeltaLabel: string;
  baselineAverageFollowUpDue?: number;
  baselineAverageFollowUpDueLabel: string;
  currentAverageFollowUpDue?: number;
  currentAverageFollowUpDueLabel: string;
  followUpDueDelta?: number;
  followUpDueDeltaLabel: string;
  baselineAverageSupportCases?: number;
  baselineAverageSupportCasesLabel: string;
  currentAverageSupportCases?: number;
  currentAverageSupportCasesLabel: string;
  supportCaseDelta?: number;
  supportCaseDeltaLabel: string;
  measurementApprovalCount: number;
  measurementApprovedDayCount: number;
  measurementRequiredDayCount: number;
  measurementRemainingDayCount: number;
  measurementStatusLabel: string;
  expectedOutcome: string;
  effectStatus: 'improved' | 'needs_follow_up' | 'pending' | 'no_baseline';
  effectStatusLabel: string;
}

const ACTION_EFFECT_MIN_APPROVED_DAYS = 3;
const ACTION_EFFECT_LOOKBACK_DAYS = 90;

export interface OperationalClosingStoreBenchmarkActionEffectSummary {
  executionCount: number;
  latestExecution?: OperationalClosingStoreBenchmarkActionExecution;
  status: 'not_recorded' | OperationalClosingStoreBenchmarkActionExecution['effectStatus'];
  statusLabel: string;
  requiredActions: string[];
}

export interface OperationalClosingStoreBenchmarkActionPostponement {
  logId: string;
  timestamp: string;
  dateLabel: string;
  recordedBy: string;
  templateId: string;
  title: string;
  targetStoreName: string;
  assigneeLabel: string;
  reason: string;
  previousDueDateKey?: string;
  previousDueDateLabel?: string;
  newDueDateKey: string;
  newDueDateLabel: string;
  daysUntilNewDue: number;
  crossStoreFollowUpLabel: string;
}

export interface OperationalClosingStoreBenchmarkActionFollowUp {
  templateId: string;
  title: string;
  targetStoreName: string;
  priority: OperationalClosingStoreBenchmarkActionTemplate['priority'];
  assigneeLabel: string;
  crossStoreFollowUpLabel: string;
  crossStoreTargetStoreNames: string[];
  dueDateKey: string;
  dueDateLabel: string;
  daysUntilDue: number;
  originalDueDateKey?: string;
  originalDueDateLabel?: string;
  postponed: boolean;
  postponementReason?: string;
  postponedAt?: string;
  postponedBy?: string;
  status: 'completed' | 'overdue' | 'due_soon' | 'pending';
  statusLabel: string;
  requiredAction: string;
  completedAt?: string;
  completedBy?: string;
}

export interface OperationalClosingStoreBenchmarkActionFollowUpSummary {
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  dueSoonCount: number;
  overdueCount: number;
  status: 'complete' | 'overdue' | 'due_soon' | 'pending' | 'not_applicable';
  statusLabel: string;
  nextDue?: OperationalClosingStoreBenchmarkActionFollowUp;
  requiredActions: string[];
}

export interface OperationalClosingStoreBenchmarkActionAssignmentSummary {
  totalCount: number;
  openAssignmentCount: number;
  crossStoreFollowUpCount: number;
  openCrossStoreFollowUpCount: number;
  postponedCount: number;
  activePostponementCount: number;
  assigneeLabels: string[];
  crossStoreTargetStoreNames: string[];
  status: 'complete' | 'cross_store_required' | 'assigned' | 'not_applicable';
  statusLabel: string;
  escalationStatus: 'required' | 'watch' | 'none';
  escalationLabel: string;
  escalationActions: string[];
  requiredActions: string[];
}

export interface OperationalClosingStoreBenchmark {
  status: 'single_store' | 'leading' | 'balanced' | 'needs_attention';
  statusLabel: string;
  actionLabel: string;
  currentStoreName: string;
  currentStore?: OperationalClosingStoreSummary;
  storeCount: number;
  allStoreAverageCompletionRate?: number;
  allStoreAverageCompletionRateLabel: string;
  peerAverageCompletionRate?: number;
  peerAverageCompletionRateLabel: string;
  allStoreAverageInventoryShortages: number;
  allStoreAverageInventoryShortagesLabel: string;
  peerAverageInventoryShortages?: number;
  peerAverageInventoryShortagesLabel: string;
  allStoreAverageInventoryReceivings: number;
  allStoreAverageInventoryReceivingsLabel: string;
  peerAverageInventoryReceivings?: number;
  peerAverageInventoryReceivingsLabel: string;
  allStoreAverageFollowUpDue: number;
  allStoreAverageFollowUpDueLabel: string;
  peerAverageFollowUpDue?: number;
  peerAverageFollowUpDueLabel: string;
  allStoreAverageSupportCases: number;
  allStoreAverageSupportCasesLabel: string;
  peerAverageSupportCases?: number;
  peerAverageSupportCasesLabel: string;
  requiredActions: string[];
  actionTemplates: OperationalClosingStoreBenchmarkActionTemplate[];
  actionExecutions: OperationalClosingStoreBenchmarkActionExecution[];
  actionEffectSummary: OperationalClosingStoreBenchmarkActionEffectSummary;
  actionPostponements: OperationalClosingStoreBenchmarkActionPostponement[];
  actionFollowUps: OperationalClosingStoreBenchmarkActionFollowUp[];
  actionFollowUpSummary: OperationalClosingStoreBenchmarkActionFollowUpSummary;
  actionAssignmentSummary: OperationalClosingStoreBenchmarkActionAssignmentSummary;
  storeSummaries: OperationalClosingStoreSummary[];
}

export interface OperationalClosingReviewOptions {
  currentStoreName?: string;
  currentStoreCode?: string;
}

export interface OperationalClosingStoreBenchmarkBiExport {
  type: 'operational-closing-store-benchmark';
  schemaVersion: 5;
  generatedAt: string;
  monthKey: string;
  monthLabel: string;
  currentStoreName: string;
  summary: {
    approvalCount: number;
    approvedDayCount: number;
    reviewerCount: number;
    averageCompletionRate?: number;
    averageCompletionRateLabel: string;
    daysWithBlockers: number;
    totalClosingBlockers: number;
    totalInventoryShortages: number;
    totalInventoryReceivings: number;
    totalFollowUpDueCount: number;
    totalSupportCaseCount: number;
    storeCount: number;
    allStoreAverageCompletionRate?: number;
    allStoreAverageCompletionRateLabel: string;
    peerAverageCompletionRate?: number;
    peerAverageCompletionRateLabel: string;
    allStoreAverageInventoryShortages: number;
    allStoreAverageInventoryShortagesLabel: string;
    peerAverageInventoryShortages?: number;
    peerAverageInventoryShortagesLabel: string;
    allStoreAverageInventoryReceivings: number;
    allStoreAverageInventoryReceivingsLabel: string;
    peerAverageInventoryReceivings?: number;
    peerAverageInventoryReceivingsLabel: string;
    allStoreAverageFollowUpDue: number;
    allStoreAverageFollowUpDueLabel: string;
    peerAverageFollowUpDue?: number;
    peerAverageFollowUpDueLabel: string;
    allStoreAverageSupportCases: number;
    allStoreAverageSupportCasesLabel: string;
    peerAverageSupportCases?: number;
    peerAverageSupportCasesLabel: string;
    status: OperationalClosingStoreBenchmark['status'];
    statusLabel: string;
    actionLabel: string;
  };
  stores: OperationalClosingStoreSummary[];
  months: OperationalClosingMonthSnapshot[];
  requiredActions: string[];
  actionTemplates: OperationalClosingStoreBenchmarkActionTemplate[];
  actionExecutions: OperationalClosingStoreBenchmarkActionExecution[];
  actionEffectSummary: OperationalClosingStoreBenchmarkActionEffectSummary;
  actionPostponements: OperationalClosingStoreBenchmarkActionPostponement[];
  actionFollowUps: OperationalClosingStoreBenchmarkActionFollowUp[];
  actionFollowUpSummary: OperationalClosingStoreBenchmarkActionFollowUpSummary;
  actionAssignmentSummary: OperationalClosingStoreBenchmarkActionAssignmentSummary;
  privacy: {
    patientFieldsIncluded: false;
    containsPatientIdentifiers: false;
    sourceLogDetailsIncluded: false;
  };
}

const DEFAULT_STORE_NAME = '自店';

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function toMonthLabel(date: Date): string {
  return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月`;
}

function toPreviousMonthDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function addMonths(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function addDays(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(from: Date, to: Date): number {
  const oneDayMs = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / oneDayMs);
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function toShortDateLabel(date: Date): string {
  return `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

function dateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateLabel(date: Date): string {
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parsePercent(details: string, label: string): number | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = details.match(new RegExp(`${escapedLabel}\\s+(\\d+(?:\\.\\d+)?)%`));
  return match ? Number(match[1]) : undefined;
}

function parseCount(details: string, label: string): number | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = details.match(new RegExp(`${escapedLabel}\\s+(\\d+)`));
  return match ? Number(match[1]) : undefined;
}

function parseNumber(details: string, label: string): number | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = details.match(new RegExp(`${escapedLabel}\\s+(\\d+(?:\\.\\d+)?)`));
  return match ? Number(match[1]) : undefined;
}

function parseSignedNumber(details: string, label: string): number | undefined {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = details.match(new RegExp(`${escapedLabel}\\s+([+\\-−±]?\\d+)`));
  if (!match) return undefined;
  return Number(match[1].replace('−', '-').replace('±', ''));
}

function parseTextSegment(details: string, labels: string[]): string | undefined {
  const segments = details.split(' / ');
  for (const label of labels) {
    const segment = segments.find((part) => part.startsWith(`${label} `) || part.startsWith(`${label}: `));
    if (!segment) continue;
    return segment
      .replace(new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\s]+`), '')
      .trim() || undefined;
  }
  return undefined;
}

function toApprovalRecord(log: AuditLog): OperationalClosingApprovalRecord | null {
  const timestamp = new Date(log.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;
  const storeName = parseTextSegment(log.details, ['店舗名', '店舗', '薬局名', '薬局']) || DEFAULT_STORE_NAME;
  const storeCode = parseTextSegment(log.details, ['店舗コード', '保険薬局コード']);

  return {
    logId: log.logId,
    timestamp: log.timestamp,
    dateKey: toDateKey(timestamp),
    dateLabel: formatDateLabel(timestamp),
    reviewerName: log.userName,
    storeName,
    storeCode,
    completionRate: parsePercent(log.details, '本日完了率'),
    closingBlockerCount: parseCount(log.details, '閉店前残タスク'),
    inventoryShortageCount: parseCount(log.details, '在庫不足'),
    inventoryReceivingCount: parseCount(log.details, '入庫登録'),
    followUpDueCount: parseCount(log.details, '服薬フォロー'),
    supportCaseCount: parseCount(log.details, '問い合わせ負荷'),
    monthlyClaimRate: parsePercent(log.details, '月次請求締め率'),
    integrityHash: log.integrityHash,
    details: log.details
  };
}

function getApprovalRecords(logs: AuditLog[]): OperationalClosingApprovalRecord[] {
  return logs
    .filter((log) => log.actionType === 'daily_closing_approval')
    .map(toApprovalRecord)
    .filter((record): record is OperationalClosingApprovalRecord => !!record)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.logId.localeCompare(a.logId));
}

function getApprovalRecordsForMonth(
  logs: AuditLog[],
  basisDate: Date
): OperationalClosingApprovalRecord[] {
  const monthKey = toMonthKey(basisDate);
  return getApprovalRecords(logs)
    .filter((record) => toMonthKey(new Date(record.timestamp)) === monthKey);
}

function summarizeMonth(records: OperationalClosingApprovalRecord[], basisDate: Date): OperationalClosingMonthSnapshot {
  const approvedDays = new Set(records.map((record) => toDateKey(new Date(record.timestamp))));
  const completionRates = records
    .map((record) => record.completionRate)
    .filter((value): value is number => Number.isFinite(value));
  const totalCompletionRate = completionRates.reduce((sum, value) => sum + value, 0);
  const averageCompletionRate = completionRates.length > 0
    ? Math.round(totalCompletionRate / completionRates.length)
    : undefined;

  return {
    monthKey: toMonthKey(basisDate),
    monthLabel: toMonthLabel(basisDate),
    approvalCount: records.length,
    approvedDayCount: approvedDays.size,
    averageCompletionRate,
    averageCompletionRateLabel: averageCompletionRate === undefined ? '未集計' : `${averageCompletionRate}%`,
    daysWithBlockers: records.filter((record) => (record.closingBlockerCount ?? 0) > 0).length,
    totalClosingBlockers: records.reduce((sum, record) => sum + (record.closingBlockerCount ?? 0), 0),
    totalInventoryShortages: records.reduce((sum, record) => sum + (record.inventoryShortageCount ?? 0), 0),
    totalInventoryReceivings: records.reduce((sum, record) => sum + (record.inventoryReceivingCount ?? 0), 0),
    totalFollowUpDueCount: records.reduce((sum, record) => sum + (record.followUpDueCount ?? 0), 0),
    totalSupportCaseCount: records.reduce((sum, record) => sum + (record.supportCaseCount ?? 0), 0)
  };
}

function signedDelta(value: number, unit: string): string {
  if (value === 0) return `±0${unit}`;
  return `${value > 0 ? '+' : ''}${value}${unit}`;
}

function buildPreviousMonthComparison(
  current: OperationalClosingMonthSnapshot,
  previous: OperationalClosingMonthSnapshot
): OperationalClosingPreviousMonthComparison {
  const approvedDayDelta = current.approvedDayCount - previous.approvedDayCount;
  const daysWithBlockersDelta = current.daysWithBlockers - previous.daysWithBlockers;
  const totalClosingBlockersDelta = current.totalClosingBlockers - previous.totalClosingBlockers;
  const inventoryShortageDelta = current.totalInventoryShortages - previous.totalInventoryShortages;
  const inventoryReceivingDelta = current.totalInventoryReceivings - previous.totalInventoryReceivings;
  const followUpDueDelta = current.totalFollowUpDueCount - previous.totalFollowUpDueCount;
  const supportCaseDelta = current.totalSupportCaseCount - previous.totalSupportCaseCount;
  const averageCompletionRateDelta = current.averageCompletionRate === undefined || previous.averageCompletionRate === undefined
    ? undefined
    : current.averageCompletionRate - previous.averageCompletionRate;
  const improvementScore = (averageCompletionRateDelta === undefined ? 0 : Math.sign(averageCompletionRateDelta))
    - Math.sign(daysWithBlockersDelta)
    - Math.sign(totalClosingBlockersDelta);
  const status = previous.approvalCount === 0 || current.approvalCount === 0
    ? 'no_data'
    : improvementScore > 0
      ? 'improved'
      : improvementScore < 0
        ? 'attention'
        : 'flat';

  return {
    previousMonth: previous,
    approvedDayDelta,
    approvedDayDeltaLabel: signedDelta(approvedDayDelta, '日'),
    averageCompletionRateDelta,
    averageCompletionRateDeltaLabel: averageCompletionRateDelta === undefined ? '比較不可' : signedDelta(averageCompletionRateDelta, 'pt'),
    daysWithBlockersDelta,
    daysWithBlockersDeltaLabel: signedDelta(daysWithBlockersDelta, '日'),
    totalClosingBlockersDelta,
    totalClosingBlockersDeltaLabel: signedDelta(totalClosingBlockersDelta, '件'),
    inventoryShortageDelta,
    inventoryShortageDeltaLabel: signedDelta(inventoryShortageDelta, '品目'),
    inventoryReceivingDelta,
    inventoryReceivingDeltaLabel: signedDelta(inventoryReceivingDelta, '件'),
    followUpDueDelta,
    followUpDueDeltaLabel: signedDelta(followUpDueDelta, '件'),
    supportCaseDelta,
    supportCaseDeltaLabel: signedDelta(supportCaseDelta, '件'),
    status,
    statusLabel: status === 'improved'
      ? '改善'
      : status === 'attention'
        ? '要フォロー'
        : status === 'flat'
          ? '横ばい'
          : '比較なし'
  };
}

function buildMonthlyKpiHistory(
  logs: AuditLog[],
  basisDate: Date,
  monthCount = 6
): OperationalClosingMonthSnapshot[] {
  return Array.from({ length: monthCount }, (_, index) => {
    const monthDate = addMonths(basisDate, index - monthCount + 1);
    return summarizeMonth(getApprovalRecordsForMonth(logs, monthDate), monthDate);
  });
}

function storeKeyFor(record: Pick<OperationalClosingApprovalRecord, 'storeName' | 'storeCode'>): string {
  return record.storeCode ? `code:${record.storeCode}` : `name:${record.storeName}`;
}

function percentLabel(value: number | undefined): string {
  return value === undefined ? '未集計' : `${value}%`;
}

function actionPriorityLabel(priority: OperationalClosingStoreBenchmarkActionTemplate['priority']): string {
  return priority === 'high'
    ? '高'
    : priority === 'medium'
      ? '中'
      : '低';
}

function actionDueDistanceLabel(daysUntilDue: number): string {
  return daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}日超過` : `残り ${daysUntilDue}日`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function average(values: number[]): number | undefined {
  return values.length > 0
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : undefined;
}

function averageToTenth(values: number[]): number | undefined {
  return values.length > 0
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : undefined;
}

function fieldAverageLabel(value: number | undefined, unit: '品目' | '件'): string {
  return value === undefined ? '未集計' : `${value}${unit}/日`;
}

function fieldDeltaLabel(value: number | undefined, unit: '品目' | '件'): string {
  if (value === undefined) return '比較不可';
  const normalized = Math.round(value * 10) / 10;
  if (normalized === 0) return `±0${unit}/日`;
  return `${normalized > 0 ? '+' : ''}${normalized}${unit}/日`;
}

function summarizeStoreRecords(
  records: OperationalClosingApprovalRecord[],
  storeName: string,
  storeCode: string | undefined,
  allStoreAverages: {
    completionRate?: number;
    blockers: number;
    inventoryShortages: number;
    inventoryReceivings: number;
    followUpDue: number;
    supportCases: number;
  }
): OperationalClosingStoreSummary {
  const approvedDays = new Set(records.map((record) => record.dateKey));
  const averageCompletionRate = average(records
    .map((record) => record.completionRate)
    .filter((value): value is number => Number.isFinite(value)));
  const averageMonthlyClaimRate = average(records
    .map((record) => record.monthlyClaimRate)
    .filter((value): value is number => Number.isFinite(value)));
  const totalClosingBlockers = records.reduce((sum, record) => sum + (record.closingBlockerCount ?? 0), 0);
  const totalInventoryShortages = records.reduce((sum, record) => sum + (record.inventoryShortageCount ?? 0), 0);
  const totalInventoryReceivings = records.reduce((sum, record) => sum + (record.inventoryReceivingCount ?? 0), 0);
  const totalFollowUpDueCount = records.reduce((sum, record) => sum + (record.followUpDueCount ?? 0), 0);
  const totalSupportCaseCount = records.reduce((sum, record) => sum + (record.supportCaseCount ?? 0), 0);
  const averageBlockers = averageToTenth(records.map((record) => record.closingBlockerCount ?? 0)) ?? 0;
  const averageInventoryShortageCount = averageToTenth(records.map((record) => record.inventoryShortageCount ?? 0)) ?? 0;
  const averageInventoryReceivingCount = averageToTenth(records.map((record) => record.inventoryReceivingCount ?? 0)) ?? 0;
  const averageFollowUpDueCount = averageToTenth(records.map((record) => record.followUpDueCount ?? 0)) ?? 0;
  const averageSupportCaseCount = averageToTenth(records.map((record) => record.supportCaseCount ?? 0)) ?? 0;

  return {
    storeKey: storeCode ? `code:${storeCode}` : `name:${storeName}`,
    storeName,
    storeCode,
    approvalCount: records.length,
    approvedDayCount: approvedDays.size,
    averageCompletionRate,
    averageCompletionRateLabel: percentLabel(averageCompletionRate),
    averageMonthlyClaimRate,
    averageMonthlyClaimRateLabel: percentLabel(averageMonthlyClaimRate),
    daysWithBlockers: records.filter((record) => (record.closingBlockerCount ?? 0) > 0).length,
    totalClosingBlockers,
    totalInventoryShortages,
    averageInventoryShortageCount,
    averageInventoryShortageLabel: fieldAverageLabel(averageInventoryShortageCount, '品目'),
    totalInventoryReceivings,
    averageInventoryReceivingCount,
    averageInventoryReceivingLabel: fieldAverageLabel(averageInventoryReceivingCount, '件'),
    totalFollowUpDueCount,
    averageFollowUpDueCount,
    averageFollowUpDueLabel: fieldAverageLabel(averageFollowUpDueCount, '件'),
    totalSupportCaseCount,
    averageSupportCaseCount,
    averageSupportCaseLabel: fieldAverageLabel(averageSupportCaseCount, '件'),
    completionRateDifferenceFromAverage: averageCompletionRate === undefined || allStoreAverages.completionRate === undefined
      ? undefined
      : averageCompletionRate - allStoreAverages.completionRate,
    blockerDifferenceFromAverage: Math.round((averageBlockers - allStoreAverages.blockers) * 10) / 10,
    inventoryShortageDifferenceFromAverage: Math.round((averageInventoryShortageCount - allStoreAverages.inventoryShortages) * 10) / 10,
    inventoryReceivingDifferenceFromAverage: Math.round((averageInventoryReceivingCount - allStoreAverages.inventoryReceivings) * 10) / 10,
    followUpDueDifferenceFromAverage: Math.round((averageFollowUpDueCount - allStoreAverages.followUpDue) * 10) / 10,
    supportCaseDifferenceFromAverage: Math.round((averageSupportCaseCount - allStoreAverages.supportCases) * 10) / 10
  };
}

function buildStoreBenchmark(
  records: OperationalClosingApprovalRecord[],
  options: OperationalClosingReviewOptions,
  logs: AuditLog[],
  basisDate: Date
): OperationalClosingStoreBenchmark {
  const currentStoreName = options.currentStoreName?.trim() || DEFAULT_STORE_NAME;
  const currentStoreCode = options.currentStoreCode?.trim() || undefined;
  const currentStoreKey = currentStoreCode ? `code:${currentStoreCode}` : `name:${currentStoreName}`;
  const normalizedRecords = records.map((record) => {
    if (record.storeName !== DEFAULT_STORE_NAME || !options.currentStoreName) return record;
    return {
      ...record,
      storeName: currentStoreName,
      storeCode: currentStoreCode
    };
  });
  const completionRates = normalizedRecords
    .map((record) => record.completionRate)
    .filter((value): value is number => Number.isFinite(value));
  const allStoreAverageCompletionRate = average(completionRates);
  const allStoreAverageBlockers = averageToTenth(normalizedRecords.map((record) => record.closingBlockerCount ?? 0)) ?? 0;
  const allStoreAverageInventoryShortages = averageToTenth(normalizedRecords.map((record) => record.inventoryShortageCount ?? 0)) ?? 0;
  const allStoreAverageInventoryReceivings = averageToTenth(normalizedRecords.map((record) => record.inventoryReceivingCount ?? 0)) ?? 0;
  const allStoreAverageFollowUpDue = averageToTenth(normalizedRecords.map((record) => record.followUpDueCount ?? 0)) ?? 0;
  const allStoreAverageSupportCases = averageToTenth(normalizedRecords.map((record) => record.supportCaseCount ?? 0)) ?? 0;
  const grouped = new Map<string, OperationalClosingApprovalRecord[]>();
  for (const record of normalizedRecords) {
    const key = storeKeyFor(record);
    grouped.set(key, [...(grouped.get(key) || []), record]);
  }
  const storeSummaries = [...grouped.values()]
    .map((storeRecords) => summarizeStoreRecords(
      storeRecords,
      storeRecords[0]?.storeName || DEFAULT_STORE_NAME,
      storeRecords[0]?.storeCode,
      {
        completionRate: allStoreAverageCompletionRate,
        blockers: allStoreAverageBlockers,
        inventoryShortages: allStoreAverageInventoryShortages,
        inventoryReceivings: allStoreAverageInventoryReceivings,
        followUpDue: allStoreAverageFollowUpDue,
        supportCases: allStoreAverageSupportCases
      }
    ))
    .sort((a, b) => (
      (b.averageCompletionRate ?? -1) - (a.averageCompletionRate ?? -1)
      || a.totalClosingBlockers - b.totalClosingBlockers
      || b.approvedDayCount - a.approvedDayCount
      || a.storeName.localeCompare(b.storeName, 'ja')
    ));
  const currentStore = storeSummaries.find((summary) => summary.storeKey === currentStoreKey) || storeSummaries[0];
  const peerRecords = currentStore
    ? normalizedRecords.filter((record) => storeKeyFor(record) !== currentStore.storeKey)
    : [];
  const peerAverageCompletionRate = average(peerRecords
    .map((record) => record.completionRate)
    .filter((value): value is number => Number.isFinite(value)));
  const peerAverageInventoryShortages = averageToTenth(peerRecords.map((record) => record.inventoryShortageCount ?? 0));
  const peerAverageInventoryReceivings = averageToTenth(peerRecords.map((record) => record.inventoryReceivingCount ?? 0));
  const peerAverageFollowUpDue = averageToTenth(peerRecords.map((record) => record.followUpDueCount ?? 0));
  const peerAverageSupportCases = averageToTenth(peerRecords.map((record) => record.supportCaseCount ?? 0));
  const completionDiff = currentStore?.completionRateDifferenceFromAverage;
  const performanceStatus: OperationalClosingStoreBenchmark['status'] = storeSummaries.length <= 1
    ? 'single_store'
    : completionDiff !== undefined && completionDiff >= 5 && currentStore.blockerDifferenceFromAverage <= 0
      ? 'leading'
      : completionDiff !== undefined && (completionDiff <= -5 || currentStore.blockerDifferenceFromAverage > 0)
        ? 'needs_attention'
        : 'balanced';
  const inventoryNeedsAttention = storeSummaries.length > 1 && !!currentStore && (
    currentStore.inventoryShortageDifferenceFromAverage >= 0.5
    || (currentStore.averageInventoryShortageCount > 0 && currentStore.averageInventoryReceivingCount === 0)
  );
  const followUpNeedsAttention = storeSummaries.length > 1
    && !!currentStore
    && currentStore.followUpDueDifferenceFromAverage >= 0.5;
  const supportNeedsAttention = storeSummaries.length > 1
    && !!currentStore
    && currentStore.supportCaseDifferenceFromAverage >= 0.5;
  const fieldKpiNeedsAttention = inventoryNeedsAttention || followUpNeedsAttention || supportNeedsAttention;
  const status: OperationalClosingStoreBenchmark['status'] = fieldKpiNeedsAttention
    ? 'needs_attention'
    : performanceStatus;
  const statusLabel = status === 'leading'
    ? '自店リード'
    : status === 'needs_attention'
      ? '要改善'
      : status === 'balanced'
        ? '平均との差小'
        : '比較待ち';
  const actionLabel = fieldKpiNeedsAttention
    ? supportNeedsAttention && (inventoryNeedsAttention || followUpNeedsAttention)
      ? '現場KPI改善'
      : supportNeedsAttention
        ? '問い合わせ負荷改善'
        : '在庫・フォロー改善'
    : status === 'leading'
    ? '好事例共有'
    : status === 'needs_attention'
      ? 'KPI見直し'
      : status === 'balanced'
        ? '継続監視'
        : '他店舗ログ取込';
  const peerStoreNames = currentStore
    ? storeSummaries
      .filter((summary) => summary.storeKey !== currentStore.storeKey)
      .slice(0, 2)
      .map((summary) => summary.storeName)
    : storeSummaries.slice(0, 2).map((summary) => summary.storeName);
  const baseRequiredActions = normalizedRecords.length === 0
    ? ['日次締め承認ログを蓄積してください。']
    : storeSummaries.length <= 1
      ? ['店舗別KPIベンチマークのため、他店舗または過去店舗の日次締め承認ログを取り込んでください。']
      : performanceStatus === 'needs_attention'
        ? ['自店KPIが平均を下回るため、残タスク内訳と閉店前確認手順を見直してください。']
        : performanceStatus === 'leading'
          ? ['自店の閉店前運用を他店舗の標準手順として共有できます。']
          : ['店舗間のKPI差は小さいため、残タスクが残る日を継続確認してください。'];
  const fieldRequiredActions = [
    ...(inventoryNeedsAttention ? ['在庫不足が全店平均より多いため、発注済み候補の納品待ちと入庫未登録を確認してください。'] : []),
    ...(followUpNeedsAttention ? ['服薬フォロー候補が全店平均より多いため、期限超過と次回確認日未設定を確認してください。'] : []),
    ...(supportNeedsAttention ? ['問い合わせ負荷が全店平均より多いため、個人情報なし診断の焦点領域と未解決問い合わせの分類を確認してください。'] : [])
  ];
  const requiredActions = [...baseRequiredActions, ...fieldRequiredActions];
  const actionTemplates = [
    ...buildStoreBenchmarkActionTemplates({
      currentStoreName,
      currentStore,
      peerAverageCompletionRate,
      peerStoreNames,
      status: performanceStatus,
      storeCount: storeSummaries.length,
      hasRecords: normalizedRecords.length > 0
    }),
    ...buildFieldKpiActionTemplates({
      currentStore,
      peerStoreNames,
      storeCount: storeSummaries.length,
      inventoryNeedsAttention,
      followUpNeedsAttention,
      supportNeedsAttention
    })
  ];
  const measurementWindowEnd = addDays(startOfDay(basisDate), 1).getTime() - 1;
  const measurementApprovalRecords = getApprovalRecords(logs)
    .filter((record) => new Date(record.timestamp).getTime() <= measurementWindowEnd)
    .map((record) => {
      if (record.storeName !== DEFAULT_STORE_NAME || !options.currentStoreName) return record;
      return {
        ...record,
        storeName: currentStoreName,
        storeCode: currentStoreCode
      };
    });
  const actionExecutions = buildStoreBenchmarkActionExecutions(
    logs,
    basisDate,
    currentStore,
    currentStoreName,
    measurementApprovalRecords
  );
  const actionPostponements = buildStoreBenchmarkActionPostponements(logs, basisDate, currentStoreName);
  const actionEffectSummary = buildStoreBenchmarkActionEffectSummary(actionExecutions);
  const actionFollowUps = buildStoreBenchmarkActionFollowUps(actionTemplates, actionExecutions, actionPostponements, records[0], basisDate);
  const actionFollowUpSummary = buildStoreBenchmarkActionFollowUpSummary(actionFollowUps);
  const actionAssignmentSummary = buildStoreBenchmarkActionAssignmentSummary(actionFollowUps);

  return {
    status,
    statusLabel,
    actionLabel,
    currentStoreName,
    currentStore,
    storeCount: storeSummaries.length,
    allStoreAverageCompletionRate,
    allStoreAverageCompletionRateLabel: percentLabel(allStoreAverageCompletionRate),
    peerAverageCompletionRate,
    peerAverageCompletionRateLabel: percentLabel(peerAverageCompletionRate),
    allStoreAverageInventoryShortages,
    allStoreAverageInventoryShortagesLabel: fieldAverageLabel(allStoreAverageInventoryShortages, '品目'),
    peerAverageInventoryShortages,
    peerAverageInventoryShortagesLabel: fieldAverageLabel(peerAverageInventoryShortages, '品目'),
    allStoreAverageInventoryReceivings,
    allStoreAverageInventoryReceivingsLabel: fieldAverageLabel(allStoreAverageInventoryReceivings, '件'),
    peerAverageInventoryReceivings,
    peerAverageInventoryReceivingsLabel: fieldAverageLabel(peerAverageInventoryReceivings, '件'),
    allStoreAverageFollowUpDue,
    allStoreAverageFollowUpDueLabel: fieldAverageLabel(allStoreAverageFollowUpDue, '件'),
    peerAverageFollowUpDue,
    peerAverageFollowUpDueLabel: fieldAverageLabel(peerAverageFollowUpDue, '件'),
    allStoreAverageSupportCases,
    allStoreAverageSupportCasesLabel: fieldAverageLabel(allStoreAverageSupportCases, '件'),
    peerAverageSupportCases,
    peerAverageSupportCasesLabel: fieldAverageLabel(peerAverageSupportCases, '件'),
    requiredActions,
    actionTemplates,
    actionExecutions,
    actionEffectSummary,
    actionPostponements,
    actionFollowUps,
    actionFollowUpSummary,
    actionAssignmentSummary,
    storeSummaries
  };
}

function buildStoreBenchmarkActionTemplates({
  currentStoreName,
  currentStore,
  hasRecords,
  peerAverageCompletionRate,
  peerStoreNames,
  status,
  storeCount
}: {
  currentStoreName: string;
  currentStore?: OperationalClosingStoreSummary;
  hasRecords: boolean;
  peerAverageCompletionRate?: number;
  peerStoreNames: string[];
  status: OperationalClosingStoreBenchmark['status'];
  storeCount: number;
}): OperationalClosingStoreBenchmarkActionTemplate[] {
  const targetStoreName = currentStore?.storeName || currentStoreName;
  const peerStoreLabel = peerStoreNames.length > 0 ? peerStoreNames.join('、') : '比較対象店舗';

  if (!hasRecords) {
    return [{
      id: 'start-daily-closing-log',
      priority: 'high',
      title: '日次締め承認ログを蓄積',
      targetStoreName,
      dueInDays: 3,
      assigneeLabel: '店舗責任者',
      crossStoreFollowUpLabel: '比較対象店舗を決める前に、自店の日次締め承認ログを3営業日分そろえる',
      crossStoreTargetStoreNames: [],
      steps: [
        '日次締めCSV/メモを出力した日に責任者承認を残す',
        '承認ログに本日完了率と閉店前残タスクを含める',
        '翌月初に承認日数と平均完了率を確認する'
      ],
      expectedOutcome: '月次レビューと店舗比較の母数を確保'
    }];
  }

  if (storeCount <= 1) {
    return [{
      id: 'import-store-comparison-logs',
      priority: 'medium',
      title: '比較店舗ログを取込',
      targetStoreName,
      dueInDays: 7,
      assigneeLabel: 'エリア責任者',
      crossStoreFollowUpLabel: `${peerStoreLabel}の日次締め承認ログの出力方法を共有してもらう`,
      crossStoreTargetStoreNames: peerStoreNames,
      steps: [
        '他店舗の日次締め承認ログを監査ログJSONまたは移行データで取り込む',
        '店舗名と店舗コードを承認ログに含める',
        '比較店舗が2件以上になったら平均との差を確認する'
      ],
      expectedOutcome: '自店KPIを全店平均、他店平均と比較できる状態にする'
    }];
  }

  if (status === 'needs_attention') {
    return [{
      id: 'reduce-closing-blockers',
      priority: 'high',
      title: '閉店前残タスクを削減',
      targetStoreName,
      dueInDays: 3,
      assigneeLabel: '店舗責任者',
      crossStoreFollowUpLabel: `${peerStoreLabel}の閉店前確認手順を1つ取り入れる`,
      crossStoreTargetStoreNames: peerStoreNames,
      steps: [
        '残タスクが残った日の未完了キューを処方・請求・在庫・フォローへ分類する',
        '閉店30分前に担当者別の未完了確認を入れる',
        '翌営業日の朝礼で平均との差と残タスク差を責任者が確認する'
      ],
      expectedOutcome: '平均との差を5pt以内、残タスク差を0件以下へ戻す'
    }, {
      id: 'compare-leading-store-flow',
      priority: 'medium',
      title: '平均との差の要因確認',
      targetStoreName,
      dueInDays: 7,
      assigneeLabel: 'エリア責任者',
      crossStoreFollowUpLabel: `${peerStoreLabel}と15分レビューし、確認タイミングの違いを1つ記録する`,
      crossStoreTargetStoreNames: peerStoreNames,
      steps: [
        `他店平均 ${percentLabel(peerAverageCompletionRate)} と自店の差を日別に確認する`,
        '上位店舗の閉店前チェック手順を1つ取り入れる',
        '1週間後の月次レビューCSVまたはBI JSONで差分を確認する'
      ],
      expectedOutcome: '他店舗との差を運用手順の差として説明できる'
    }];
  }

  if (status === 'leading') {
    return [{
      id: 'share-leading-practice',
      priority: 'low',
      title: '好事例を標準化',
      targetStoreName,
      dueInDays: 14,
      assigneeLabel: '店舗責任者',
      crossStoreFollowUpLabel: `${peerStoreLabel}へ閉店前手順の好事例を共有する`,
      crossStoreTargetStoreNames: peerStoreNames,
      steps: [
        '残タスク0件の日の閉店前手順をメモ化する',
        '他店舗へ共有するチェック項目を3つに絞る',
        '翌月の店舗別KPIで他店平均の変化を見る'
      ],
      expectedOutcome: '自店の良い運用を全店平均の底上げにつなげる'
    }];
  }

  return [{
    id: 'keep-monitoring-store-kpi',
    priority: 'medium',
    title: '残タスク発生日を継続確認',
    targetStoreName,
    dueInDays: 7,
    assigneeLabel: '店舗責任者',
    crossStoreFollowUpLabel: `${peerStoreLabel}と月次KPIの残タスク発生日を比較する`,
    crossStoreTargetStoreNames: peerStoreNames,
    steps: [
      '残タスクが残った日だけ理由を棚卸する',
      '完了率が5pt以上下がった日を週次で確認する',
      '外部BIの月次グラフで横ばい継続を確認する'
    ],
    expectedOutcome: '平均との差が小さい状態を維持する'
  }];
}

function buildFieldKpiActionTemplates({
  currentStore,
  peerStoreNames,
  storeCount,
  inventoryNeedsAttention,
  followUpNeedsAttention,
  supportNeedsAttention
}: {
  currentStore?: OperationalClosingStoreSummary;
  peerStoreNames: string[];
  storeCount: number;
  inventoryNeedsAttention: boolean;
  followUpNeedsAttention: boolean;
  supportNeedsAttention: boolean;
}): OperationalClosingStoreBenchmarkActionTemplate[] {
  if (!currentStore || storeCount <= 1) return [];
  const peerStoreLabel = peerStoreNames.length > 0 ? peerStoreNames.join('、') : '比較対象店舗';
  const templates: OperationalClosingStoreBenchmarkActionTemplate[] = [];

  if (inventoryNeedsAttention) {
    templates.push({
      id: 'reduce-inventory-shortages',
      priority: 'high',
      title: '在庫不足を減らす',
      targetStoreName: currentStore.storeName,
      dueInDays: 5,
      assigneeLabel: '在庫担当薬剤師',
      crossStoreFollowUpLabel: `${peerStoreLabel}の発注締切と入庫確認時刻を確認する`,
      crossStoreTargetStoreNames: peerStoreNames,
      steps: [
        '在庫不足が残った薬品を未発注、発注済み、納品待ちに分ける',
        '発注済み候補は納品時にロット、使用期限、納品数量を登録する',
        '翌週の日次締め月次レビューで在庫不足平均と入庫登録平均を確認する'
      ],
      expectedOutcome: `在庫不足平均を全店平均以下へ下げる（現在 ${currentStore.averageInventoryShortageLabel}）`
    });
  }

  if (followUpNeedsAttention) {
    templates.push({
      id: 'close-follow-up-due',
      priority: 'high',
      title: '服薬フォロー残件を減らす',
      targetStoreName: currentStore.storeName,
      dueInDays: 4,
      assigneeLabel: '担当薬剤師',
      crossStoreFollowUpLabel: `${peerStoreLabel}の期限超過確認と担当割当の手順を確認する`,
      crossStoreTargetStoreNames: peerStoreNames,
      steps: [
        '本日対応と期限超過の服薬フォロー候補を担当者別に分ける',
        '未完了の候補には対応方法、接触結果、次回確認日を記録する',
        '翌週の日次締め月次レビューで服薬フォロー平均を確認する'
      ],
      expectedOutcome: `服薬フォロー候補平均を全店平均以下へ下げる（現在 ${currentStore.averageFollowUpDueLabel}）`
    });
  }

  if (supportNeedsAttention) {
    templates.push({
      id: 'reduce-support-load',
      priority: 'medium',
      title: '問い合わせ負荷を減らす',
      targetStoreName: currentStore.storeName,
      dueInDays: 6,
      assigneeLabel: 'サポート担当',
      crossStoreFollowUpLabel: `${peerStoreLabel}の問い合わせ分類と一次回答の型を確認する`,
      crossStoreTargetStoreNames: peerStoreNames,
      steps: [
        '個人情報なし診断JSONの焦点領域を初回セットアップ、帳票、外部接続、日次締めに分類する',
        '同じ分類の問い合わせは一次回答メモと次に見る画面を1つにそろえる',
        '翌週の日次締め月次レビューで問い合わせ負荷平均を確認する'
      ],
      expectedOutcome: `問い合わせ負荷平均を全店平均以下へ下げる（現在 ${currentStore.averageSupportCaseLabel}）`
    });
  }

  return templates;
}

export function buildOperationalClosingStoreBenchmarkActionAuditDetail(
  template: OperationalClosingStoreBenchmarkActionTemplate,
  review: OperationalClosingMonthlyReview
): string {
  const currentStore = review.storeBenchmark.currentStore;
  const followUp = review.storeBenchmark.actionFollowUps.find((candidate) => candidate.templateId === template.id);
  return [
    `店舗別KPI改善アクション記録: ${template.id}`,
    `タイトル ${template.title}`,
    `店舗 ${template.targetStoreName}`,
    `店舗コード ${currentStore?.storeCode || '-'}`,
    `優先度 ${template.priority}`,
    `担当者 ${template.assigneeLabel}`,
    `期限 ${followUp?.dueDateKey || '未設定'}`,
    `期限判定 ${followUp?.statusLabel || '未判定'}`,
    `店舗横断フォロー ${template.crossStoreFollowUpLabel}`,
    `横断対象 ${template.crossStoreTargetStoreNames.join('、') || 'なし'}`,
    `基準完了率 ${percentLabel(currentStore?.averageCompletionRate)}`,
    `基準残タスク ${currentStore?.totalClosingBlockers ?? 0}`,
    `基準残タスク差 ${currentStore === undefined ? '比較不可' : signedDelta(currentStore.blockerDifferenceFromAverage, '件')}`,
    `基準残タスク平均 ${fieldAverageLabel(
      currentStore && currentStore.approvalCount > 0
        ? Math.round((currentStore.totalClosingBlockers / currentStore.approvalCount) * 10) / 10
        : undefined,
      '件'
    )}`,
    `基準在庫不足 ${fieldAverageLabel(currentStore?.averageInventoryShortageCount, '品目')}`,
    `基準入庫登録 ${fieldAverageLabel(currentStore?.averageInventoryReceivingCount, '件')}`,
    `基準服薬フォロー ${fieldAverageLabel(currentStore?.averageFollowUpDueCount, '件')}`,
    `基準問い合わせ負荷 ${fieldAverageLabel(currentStore?.averageSupportCaseCount, '件')}`,
    `期待 ${template.expectedOutcome}`
  ].join(' / ');
}

export function buildOperationalClosingStoreBenchmarkActionPostponementAuditDetail(
  template: OperationalClosingStoreBenchmarkActionTemplate,
  review: OperationalClosingMonthlyReview,
  reason: string,
  newDueDate: Date
): string {
  const followUp = review.storeBenchmark.actionFollowUps.find((candidate) => candidate.templateId === template.id);
  return [
    `店舗別KPI改善アクション延期: ${template.id}`,
    `タイトル ${template.title}`,
    `店舗 ${template.targetStoreName}`,
    `担当者 ${template.assigneeLabel}`,
    `延期理由 ${reason.trim() || '理由未記入'}`,
    `旧期限 ${followUp?.dueDateKey || '未設定'}`,
    `再期限 ${toDateKey(newDueDate)}`,
    `店舗横断フォロー ${template.crossStoreFollowUpLabel}`,
    `横断対象 ${template.crossStoreTargetStoreNames.join('、') || 'なし'}`
  ].join(' / ');
}

function parseActionTemplateId(details: string): string | undefined {
  const match = details.match(/店舗別KPI改善アクション記録:\s*([^/]+)/);
  return match?.[1]?.trim() || undefined;
}

function parseActionPostponementTemplateId(details: string): string | undefined {
  const match = details.match(/店舗別KPI改善アクション延期:\s*([^/]+)/);
  return match?.[1]?.trim() || undefined;
}

function parseDateKeySegment(details: string, label: string): string | undefined {
  const value = parseTextSegment(details, [label]);
  const match = value?.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function normalizeActionPriority(value: string | undefined): OperationalClosingStoreBenchmarkActionTemplate['priority'] {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium';
}

function buildActionExecutionEffectStatus(input: {
  measurementApprovedDayCount: number;
  templateId: string;
  baselineAverageCompletionRate?: number;
  currentAverageCompletionRate?: number;
  completionRateDelta?: number;
  baselineTotalClosingBlockers?: number;
  currentTotalClosingBlockers?: number;
  blockerDelta?: number;
  baselineAverageClosingBlockers?: number;
  currentAverageClosingBlockers?: number;
  closingBlockerAverageDelta?: number;
  baselineAverageInventoryShortages?: number;
  currentAverageInventoryShortages?: number;
  inventoryShortageDelta?: number;
  baselineAverageInventoryReceivings?: number;
  currentAverageInventoryReceivings?: number;
  inventoryReceivingDelta?: number;
  baselineAverageFollowUpDue?: number;
  currentAverageFollowUpDue?: number;
  followUpDueDelta?: number;
  baselineAverageSupportCases?: number;
  currentAverageSupportCases?: number;
  supportCaseDelta?: number;
}): OperationalClosingStoreBenchmarkActionExecution['effectStatus'] {
  if (input.templateId === 'reduce-inventory-shortages') {
    if (input.baselineAverageInventoryShortages === undefined && input.baselineAverageInventoryReceivings === undefined) {
      return 'no_baseline';
    }
    if (input.currentAverageInventoryShortages === undefined && input.currentAverageInventoryReceivings === undefined) {
      return 'pending';
    }
    if (input.measurementApprovedDayCount < ACTION_EFFECT_MIN_APPROVED_DAYS) return 'pending';
    if ((input.inventoryShortageDelta ?? 0) <= -0.5 || (input.inventoryReceivingDelta ?? 0) >= 0.5) {
      return 'improved';
    }
    if ((input.inventoryShortageDelta ?? 0) >= 0.5 || (input.inventoryReceivingDelta ?? 0) <= -0.5) {
      return 'needs_follow_up';
    }
    return 'pending';
  }

  if (input.templateId === 'close-follow-up-due') {
    if (input.baselineAverageFollowUpDue === undefined) return 'no_baseline';
    if (input.currentAverageFollowUpDue === undefined) return 'pending';
    if (input.measurementApprovedDayCount < ACTION_EFFECT_MIN_APPROVED_DAYS) return 'pending';
    if ((input.followUpDueDelta ?? 0) <= -0.5) return 'improved';
    if ((input.followUpDueDelta ?? 0) >= 0.5) return 'needs_follow_up';
    return 'pending';
  }

  if (input.templateId === 'reduce-support-load') {
    if (input.baselineAverageSupportCases === undefined) return 'no_baseline';
    if (input.currentAverageSupportCases === undefined) return 'pending';
    if (input.measurementApprovedDayCount < ACTION_EFFECT_MIN_APPROVED_DAYS) return 'pending';
    if ((input.supportCaseDelta ?? 0) <= -0.5) return 'improved';
    if ((input.supportCaseDelta ?? 0) >= 0.5) return 'needs_follow_up';
    return 'pending';
  }

  if (input.baselineAverageCompletionRate === undefined && input.baselineTotalClosingBlockers === undefined) {
    return 'no_baseline';
  }
  if (input.currentAverageCompletionRate === undefined && input.currentTotalClosingBlockers === undefined) {
    return 'pending';
  }
  if (input.measurementApprovedDayCount < ACTION_EFFECT_MIN_APPROVED_DAYS) return 'pending';
  const { completionRateDelta, blockerDelta, closingBlockerAverageDelta } = input;
  const effectiveBlockerDelta = closingBlockerAverageDelta ?? blockerDelta;
  if ((completionRateDelta !== undefined && completionRateDelta >= 5) || (effectiveBlockerDelta !== undefined && effectiveBlockerDelta <= -0.5)) {
    return 'improved';
  }
  if ((completionRateDelta !== undefined && completionRateDelta < 0) || (effectiveBlockerDelta !== undefined && effectiveBlockerDelta >= 0.5)) {
    return 'needs_follow_up';
  }
  return 'pending';
}

function actionEffectStatusLabel(
  status: OperationalClosingStoreBenchmarkActionExecution['effectStatus'],
  measurementApprovedDayCount: number
): string {
  return status === 'improved'
    ? '改善'
    : status === 'needs_follow_up'
      ? '要フォロー'
      : status === 'no_baseline'
        ? '基準なし'
        : `効果測定中（${Math.min(measurementApprovedDayCount, ACTION_EFFECT_MIN_APPROVED_DAYS)}/${ACTION_EFFECT_MIN_APPROVED_DAYS}日）`;
}

function toActionExecution(
  log: AuditLog,
  currentStore: OperationalClosingStoreSummary | undefined,
  fallbackStoreName: string,
  approvalRecords: OperationalClosingApprovalRecord[]
): OperationalClosingStoreBenchmarkActionExecution | null {
  if (log.actionType !== 'daily_closing_kpi_action') return null;
  const timestamp = new Date(log.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;
  const templateId = parseActionTemplateId(log.details);
  if (!templateId) return null;
  const targetStoreName = parseTextSegment(log.details, ['店舗']) || fallbackStoreName;
  const targetStoreCode = parseTextSegment(log.details, ['店舗コード']);
  const title = parseTextSegment(log.details, ['タイトル']) || templateId;
  const priority = normalizeActionPriority(parseTextSegment(log.details, ['優先度']));
  const assigneeLabel = parseTextSegment(log.details, ['担当者']) || '未設定';
  const crossStoreFollowUpLabel = parseTextSegment(log.details, ['店舗横断フォロー']) || '';
  const baselineAverageCompletionRate = parsePercent(log.details, '基準完了率');
  const baselineTotalClosingBlockers = parseCount(log.details, '基準残タスク');
  const baselineBlockerDifferenceFromAverage = parseSignedNumber(log.details, '基準残タスク差');
  const baselineAverageClosingBlockers = parseNumber(log.details, '基準残タスク平均');
  const baselineAverageInventoryShortages = parseNumber(log.details, '基準在庫不足');
  const baselineAverageInventoryReceivings = parseNumber(log.details, '基準入庫登録');
  const baselineAverageFollowUpDue = parseNumber(log.details, '基準服薬フォロー');
  const baselineAverageSupportCases = parseNumber(log.details, '基準問い合わせ負荷');
  const expectedOutcome = parseTextSegment(log.details, ['期待']) || '';
  const actionTimestamp = timestamp.getTime();
  const currentStoreMatches = currentStore && (
    (targetStoreCode && targetStoreCode !== '-' && currentStore.storeCode === targetStoreCode)
    || currentStore.storeName === targetStoreName
  );
  const measurementRecords = approvalRecords.filter((record) => {
    if (new Date(record.timestamp).getTime() <= actionTimestamp) return false;
    if (targetStoreCode && targetStoreCode !== '-') return record.storeCode === targetStoreCode;
    if (currentStoreMatches) return storeKeyFor(record) === currentStore.storeKey;
    return record.storeName === targetStoreName;
  });
  const measurementApprovedDayCount = new Set(measurementRecords.map((record) => record.dateKey)).size;
  const measurementRemainingDayCount = Math.max(0, ACTION_EFFECT_MIN_APPROVED_DAYS - measurementApprovedDayCount);
  const currentAverageCompletionRate = average(measurementRecords
    .map((record) => record.completionRate)
    .filter((value): value is number => Number.isFinite(value)));
  const currentTotalClosingBlockers = measurementRecords.length > 0
    ? measurementRecords.reduce((sum, record) => sum + (record.closingBlockerCount ?? 0), 0)
    : undefined;
  const currentAverageClosingBlockers = averageToTenth(measurementRecords.map((record) => record.closingBlockerCount ?? 0));
  const currentAverageInventoryShortages = averageToTenth(measurementRecords.map((record) => record.inventoryShortageCount ?? 0));
  const currentAverageInventoryReceivings = averageToTenth(measurementRecords.map((record) => record.inventoryReceivingCount ?? 0));
  const currentAverageFollowUpDue = averageToTenth(measurementRecords.map((record) => record.followUpDueCount ?? 0));
  const currentAverageSupportCases = averageToTenth(measurementRecords.map((record) => record.supportCaseCount ?? 0));
  const completionRateDelta = baselineAverageCompletionRate === undefined || currentAverageCompletionRate === undefined
    ? undefined
    : currentAverageCompletionRate - baselineAverageCompletionRate;
  const blockerDelta = baselineTotalClosingBlockers === undefined || currentTotalClosingBlockers === undefined
    ? undefined
    : currentTotalClosingBlockers - baselineTotalClosingBlockers;
  const closingBlockerAverageDelta = baselineAverageClosingBlockers === undefined || currentAverageClosingBlockers === undefined
    ? undefined
    : Math.round((currentAverageClosingBlockers - baselineAverageClosingBlockers) * 10) / 10;
  const inventoryShortageDelta = baselineAverageInventoryShortages === undefined || currentAverageInventoryShortages === undefined
    ? undefined
    : Math.round((currentAverageInventoryShortages - baselineAverageInventoryShortages) * 10) / 10;
  const inventoryReceivingDelta = baselineAverageInventoryReceivings === undefined || currentAverageInventoryReceivings === undefined
    ? undefined
    : Math.round((currentAverageInventoryReceivings - baselineAverageInventoryReceivings) * 10) / 10;
  const followUpDueDelta = baselineAverageFollowUpDue === undefined || currentAverageFollowUpDue === undefined
    ? undefined
    : Math.round((currentAverageFollowUpDue - baselineAverageFollowUpDue) * 10) / 10;
  const supportCaseDelta = baselineAverageSupportCases === undefined || currentAverageSupportCases === undefined
    ? undefined
    : Math.round((currentAverageSupportCases - baselineAverageSupportCases) * 10) / 10;
  const effectStatus = buildActionExecutionEffectStatus({
    measurementApprovedDayCount,
    templateId,
    baselineAverageCompletionRate,
    currentAverageCompletionRate,
    completionRateDelta,
    baselineTotalClosingBlockers,
    currentTotalClosingBlockers,
    blockerDelta,
    baselineAverageClosingBlockers,
    currentAverageClosingBlockers,
    closingBlockerAverageDelta,
    baselineAverageInventoryShortages,
    currentAverageInventoryShortages,
    inventoryShortageDelta,
    baselineAverageInventoryReceivings,
    currentAverageInventoryReceivings,
    inventoryReceivingDelta,
    baselineAverageFollowUpDue,
    currentAverageFollowUpDue,
    followUpDueDelta,
    baselineAverageSupportCases,
    currentAverageSupportCases,
    supportCaseDelta
  });

  return {
    logId: log.logId,
    timestamp: log.timestamp,
    dateLabel: formatDateLabel(timestamp),
    recordedBy: log.userName,
    templateId,
    title,
    targetStoreName,
    priority,
    assigneeLabel,
    crossStoreFollowUpLabel,
    baselineAverageCompletionRate,
    baselineAverageCompletionRateLabel: percentLabel(baselineAverageCompletionRate),
    currentAverageCompletionRate,
    currentAverageCompletionRateLabel: percentLabel(currentAverageCompletionRate),
    completionRateDelta,
    completionRateDeltaLabel: completionRateDelta === undefined ? '比較不可' : signedDelta(completionRateDelta, 'pt'),
    baselineTotalClosingBlockers,
    baselineBlockerDifferenceFromAverage,
    baselineBlockerDifferenceFromAverageLabel: baselineBlockerDifferenceFromAverage === undefined ? '比較不可' : signedDelta(baselineBlockerDifferenceFromAverage, '件'),
    currentTotalClosingBlockers,
    blockerDelta,
    blockerDeltaLabel: blockerDelta === undefined ? '比較不可' : signedDelta(blockerDelta, '件'),
    baselineAverageClosingBlockers,
    baselineAverageClosingBlockersLabel: fieldAverageLabel(baselineAverageClosingBlockers, '件'),
    currentAverageClosingBlockers,
    currentAverageClosingBlockersLabel: fieldAverageLabel(currentAverageClosingBlockers, '件'),
    closingBlockerAverageDelta,
    closingBlockerAverageDeltaLabel: fieldDeltaLabel(closingBlockerAverageDelta, '件'),
    baselineAverageInventoryShortages,
    baselineAverageInventoryShortagesLabel: fieldAverageLabel(baselineAverageInventoryShortages, '品目'),
    currentAverageInventoryShortages,
    currentAverageInventoryShortagesLabel: fieldAverageLabel(currentAverageInventoryShortages, '品目'),
    inventoryShortageDelta,
    inventoryShortageDeltaLabel: fieldDeltaLabel(inventoryShortageDelta, '品目'),
    baselineAverageInventoryReceivings,
    baselineAverageInventoryReceivingsLabel: fieldAverageLabel(baselineAverageInventoryReceivings, '件'),
    currentAverageInventoryReceivings,
    currentAverageInventoryReceivingsLabel: fieldAverageLabel(currentAverageInventoryReceivings, '件'),
    inventoryReceivingDelta,
    inventoryReceivingDeltaLabel: fieldDeltaLabel(inventoryReceivingDelta, '件'),
    baselineAverageFollowUpDue,
    baselineAverageFollowUpDueLabel: fieldAverageLabel(baselineAverageFollowUpDue, '件'),
    currentAverageFollowUpDue,
    currentAverageFollowUpDueLabel: fieldAverageLabel(currentAverageFollowUpDue, '件'),
    followUpDueDelta,
    followUpDueDeltaLabel: fieldDeltaLabel(followUpDueDelta, '件'),
    baselineAverageSupportCases,
    baselineAverageSupportCasesLabel: fieldAverageLabel(baselineAverageSupportCases, '件'),
    currentAverageSupportCases,
    currentAverageSupportCasesLabel: fieldAverageLabel(currentAverageSupportCases, '件'),
    supportCaseDelta,
    supportCaseDeltaLabel: fieldDeltaLabel(supportCaseDelta, '件'),
    measurementApprovalCount: measurementRecords.length,
    measurementApprovedDayCount,
    measurementRequiredDayCount: ACTION_EFFECT_MIN_APPROVED_DAYS,
    measurementRemainingDayCount,
    measurementStatusLabel: measurementRemainingDayCount === 0
      ? `${ACTION_EFFECT_MIN_APPROVED_DAYS}営業日以上を測定`
      : `あと${measurementRemainingDayCount}営業日分必要`,
    expectedOutcome,
    effectStatus,
    effectStatusLabel: actionEffectStatusLabel(effectStatus, measurementApprovedDayCount)
  };
}

function buildStoreBenchmarkActionExecutions(
  logs: AuditLog[],
  basisDate: Date,
  currentStore: OperationalClosingStoreSummary | undefined,
  currentStoreName: string,
  approvalRecords: OperationalClosingApprovalRecord[]
): OperationalClosingStoreBenchmarkActionExecution[] {
  const windowStart = startOfDay(addDays(basisDate, -ACTION_EFFECT_LOOKBACK_DAYS)).getTime();
  const windowEnd = addDays(startOfDay(basisDate), 1).getTime() - 1;
  return logs
    .map((log) => toActionExecution(log, currentStore, currentStoreName, approvalRecords))
    .filter((record): record is OperationalClosingStoreBenchmarkActionExecution => !!record)
    .filter((record) => {
      const timestamp = new Date(record.timestamp).getTime();
      return timestamp >= windowStart && timestamp <= windowEnd;
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.logId.localeCompare(a.logId));
}

function toActionPostponement(
  log: AuditLog,
  basisDate: Date,
  fallbackStoreName: string
): OperationalClosingStoreBenchmarkActionPostponement | null {
  if (log.actionType !== 'daily_closing_kpi_action') return null;
  const timestamp = new Date(log.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;
  const templateId = parseActionPostponementTemplateId(log.details);
  if (!templateId) return null;
  const newDueDateKey = parseDateKeySegment(log.details, '再期限');
  if (!newDueDateKey) return null;
  const previousDueDateKey = parseDateKeySegment(log.details, '旧期限');
  const newDueDate = dateFromDateKey(newDueDateKey);

  return {
    logId: log.logId,
    timestamp: log.timestamp,
    dateLabel: formatDateLabel(timestamp),
    recordedBy: log.userName,
    templateId,
    title: parseTextSegment(log.details, ['タイトル']) || templateId,
    targetStoreName: parseTextSegment(log.details, ['店舗']) || fallbackStoreName,
    assigneeLabel: parseTextSegment(log.details, ['担当者']) || '未設定',
    reason: parseTextSegment(log.details, ['延期理由']) || '理由未記入',
    previousDueDateKey,
    previousDueDateLabel: previousDueDateKey ? toShortDateLabel(dateFromDateKey(previousDueDateKey)) : undefined,
    newDueDateKey,
    newDueDateLabel: toShortDateLabel(newDueDate),
    daysUntilNewDue: daysBetween(basisDate, newDueDate),
    crossStoreFollowUpLabel: parseTextSegment(log.details, ['店舗横断フォロー']) || ''
  };
}

function buildStoreBenchmarkActionPostponements(
  logs: AuditLog[],
  basisDate: Date,
  currentStoreName: string
): OperationalClosingStoreBenchmarkActionPostponement[] {
  const monthKey = toMonthKey(basisDate);
  return logs
    .map((log) => toActionPostponement(log, basisDate, currentStoreName))
    .filter((record): record is OperationalClosingStoreBenchmarkActionPostponement => !!record)
    .filter((record) => toMonthKey(new Date(record.timestamp)) === monthKey)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.logId.localeCompare(a.logId));
}

function buildStoreBenchmarkActionEffectSummary(
  executions: OperationalClosingStoreBenchmarkActionExecution[]
): OperationalClosingStoreBenchmarkActionEffectSummary {
  const latestExecution = executions[0];
  if (!latestExecution) {
    return {
      executionCount: 0,
      status: 'not_recorded',
      statusLabel: '未記録',
      requiredActions: ['改善アクションを実施したら、店舗別KPIカードから実行記録を残してください。']
    };
  }

  const targetMetricLabel = latestExecution.templateId === 'reduce-inventory-shortages'
    ? '在庫不足と入庫登録'
    : latestExecution.templateId === 'close-follow-up-due'
      ? '服薬フォロー候補'
      : latestExecution.templateId === 'reduce-support-load'
        ? '問い合わせ負荷'
        : '完了率と残タスク';
  const requiredActions = latestExecution.effectStatus === 'improved'
    ? [`${targetMetricLabel}が改善しています。実施した手順を店舗標準へ反映し、翌月も維持できるか確認してください。`]
    : latestExecution.effectStatus === 'needs_follow_up'
      ? [`${targetMetricLabel}が悪化しています。対象一覧、担当者、確認時刻を見直して再実施してください。`]
      : latestExecution.effectStatus === 'no_baseline'
        ? [`${targetMetricLabel}の基準KPIが不足しています。日次締め承認ログを蓄積してから効果測定してください。`]
        : latestExecution.measurementRemainingDayCount > 0
          ? [`実行後の日次締めをあと${latestExecution.measurementRemainingDayCount}営業日分記録すると、${targetMetricLabel}の効果を判定できます。`]
          : [`実行後3営業日分の${targetMetricLabel}を測定しました。差が小さいため、もう1週間継続して確認してください。`];

  return {
    executionCount: executions.length,
    latestExecution,
    status: latestExecution.effectStatus,
    statusLabel: latestExecution.effectStatusLabel,
    requiredActions
  };
}

function actionFollowUpStatusLabel(status: OperationalClosingStoreBenchmarkActionFollowUp['status']): string {
  return status === 'completed'
    ? '実施済み'
    : status === 'overdue'
      ? '期限超過'
      : status === 'due_soon'
        ? '期限間近'
        : '未実施';
}

function buildStoreBenchmarkActionFollowUps(
  templates: OperationalClosingStoreBenchmarkActionTemplate[],
  executions: OperationalClosingStoreBenchmarkActionExecution[],
  postponements: OperationalClosingStoreBenchmarkActionPostponement[],
  latestApproval: OperationalClosingApprovalRecord | undefined,
  basisDate: Date
): OperationalClosingStoreBenchmarkActionFollowUp[] {
  const dueBaseDate = latestApproval ? new Date(latestApproval.timestamp) : basisDate;
  return templates.map((template) => {
    const completedExecution = executions.find((execution) => execution.templateId === template.id);
    const activePostponement = postponements.find((postponement) => postponement.templateId === template.id);
    const originalDueDate = addDays(dueBaseDate, template.dueInDays);
    const dueDate = activePostponement ? dateFromDateKey(activePostponement.newDueDateKey) : originalDueDate;
    const daysUntilDue = daysBetween(basisDate, dueDate);
    const status: OperationalClosingStoreBenchmarkActionFollowUp['status'] = completedExecution
      ? 'completed'
      : daysUntilDue < 0
        ? 'overdue'
        : daysUntilDue <= 3
          ? 'due_soon'
          : 'pending';
    const requiredAction = status === 'completed'
      ? `${completedExecution?.effectStatusLabel || '効果測定中'}として記録済みです。`
      : activePostponement
        ? `${template.title}は「${activePostponement.reason}」で再期限を${activePostponement.newDueDateLabel}に設定済みです。期限日までに実行記録または再延期理由を残してください。`
      : status === 'overdue'
        ? `${template.title}の期限を過ぎています。次回の日次締め前に実行記録を残してください。`
        : status === 'due_soon'
          ? `${template.title}の期限が近づいています。期限日までに実行可否を確認してください。`
          : `${template.title}を期限日までに実施し、店舗別KPIカードから実行記録を残してください。`;

    return {
      templateId: template.id,
      title: template.title,
      targetStoreName: template.targetStoreName,
      priority: template.priority,
      assigneeLabel: template.assigneeLabel,
      crossStoreFollowUpLabel: template.crossStoreFollowUpLabel,
      crossStoreTargetStoreNames: template.crossStoreTargetStoreNames,
      dueDateKey: toDateKey(dueDate),
      dueDateLabel: toShortDateLabel(dueDate),
      daysUntilDue,
      originalDueDateKey: activePostponement ? toDateKey(originalDueDate) : undefined,
      originalDueDateLabel: activePostponement ? toShortDateLabel(originalDueDate) : undefined,
      postponed: !!activePostponement,
      postponementReason: activePostponement?.reason,
      postponedAt: activePostponement?.timestamp,
      postponedBy: activePostponement?.recordedBy,
      status,
      statusLabel: actionFollowUpStatusLabel(status),
      requiredAction,
      completedAt: completedExecution?.timestamp,
      completedBy: completedExecution?.recordedBy
    };
  }).sort((a, b) => {
    const statusRank = { overdue: 0, due_soon: 1, pending: 2, completed: 3 };
    return statusRank[a.status] - statusRank[b.status]
      || a.dueDateKey.localeCompare(b.dueDateKey)
      || a.title.localeCompare(b.title, 'ja');
  });
}

function buildStoreBenchmarkActionFollowUpSummary(
  followUps: OperationalClosingStoreBenchmarkActionFollowUp[]
): OperationalClosingStoreBenchmarkActionFollowUpSummary {
  const completedCount = followUps.filter((followUp) => followUp.status === 'completed').length;
  const overdueCount = followUps.filter((followUp) => followUp.status === 'overdue').length;
  const dueSoonCount = followUps.filter((followUp) => followUp.status === 'due_soon').length;
  const pendingCount = followUps.filter((followUp) => followUp.status === 'pending' || followUp.status === 'due_soon' || followUp.status === 'overdue').length;
  const nextDue = followUps.find((followUp) => followUp.status !== 'completed');
  const status = followUps.length === 0
    ? 'not_applicable'
    : overdueCount > 0
      ? 'overdue'
      : dueSoonCount > 0
        ? 'due_soon'
        : pendingCount > 0
          ? 'pending'
          : 'complete';
  const statusLabel = status === 'complete'
    ? '全件実施済み'
    : status === 'overdue'
      ? '期限超過あり'
      : status === 'due_soon'
        ? '期限間近あり'
        : status === 'pending'
          ? '未実施あり'
          : '対象なし';
  const requiredActions = status === 'complete'
    ? ['改善アクションはすべて実行記録済みです。効果測定を翌月も確認してください。']
    : status === 'overdue'
      ? [`期限超過の改善アクションが${overdueCount}件あります。責任者が実施可否を確認してください。`]
      : status === 'due_soon'
        ? [`期限間近の改善アクションが${dueSoonCount}件あります。期限日までに実行記録を残してください。`]
        : status === 'pending'
          ? [`未実施の改善アクションが${pendingCount}件あります。次の期限は${nextDue?.dueDateLabel || '未設定'}です。`]
          : ['改善アクションの対象はありません。'];

  return {
    totalCount: followUps.length,
    completedCount,
    pendingCount,
    dueSoonCount,
    overdueCount,
    status,
    statusLabel,
    nextDue,
    requiredActions
  };
}

function buildStoreBenchmarkActionAssignmentSummary(
  followUps: OperationalClosingStoreBenchmarkActionFollowUp[]
): OperationalClosingStoreBenchmarkActionAssignmentSummary {
  const openFollowUps = followUps.filter((followUp) => followUp.status !== 'completed');
  const crossStoreFollowUps = followUps.filter((followUp) => followUp.crossStoreFollowUpLabel || followUp.crossStoreTargetStoreNames.length > 0);
  const openCrossStoreFollowUps = crossStoreFollowUps.filter((followUp) => followUp.status !== 'completed');
  const overdueAssignments = followUps.filter((followUp) => followUp.status === 'overdue');
  const dueSoonAssignments = followUps.filter((followUp) => followUp.status === 'due_soon');
  const postponedFollowUps = followUps.filter((followUp) => followUp.postponed);
  const activePostponements = postponedFollowUps.filter((followUp) => followUp.status !== 'completed');
  const assigneeLabels = uniqueStrings(followUps.map((followUp) => followUp.assigneeLabel));
  const crossStoreTargetStoreNames = uniqueStrings(crossStoreFollowUps.flatMap((followUp) => followUp.crossStoreTargetStoreNames));
  const status = followUps.length === 0
    ? 'not_applicable'
    : openFollowUps.length === 0
      ? 'complete'
      : openCrossStoreFollowUps.length > 0
        ? 'cross_store_required'
        : 'assigned';
  const statusLabel = status === 'complete'
    ? '割当対応済み'
    : status === 'cross_store_required'
      ? '店舗横断フォローあり'
      : status === 'assigned'
        ? '担当者設定済み'
        : '対象なし';
  const requiredActions = status === 'complete'
    ? ['担当者付きの改善アクションはすべて実行記録済みです。横断共有の効果を翌月も確認してください。']
    : status === 'cross_store_required'
      ? [`店舗横断フォローが未完了の改善アクションが${openCrossStoreFollowUps.length}件あります。担当者が対象店舗との確認結果を実行記録へ残してください。`]
      : status === 'assigned'
        ? [`未完了の改善アクションが${openFollowUps.length}件あります。担当者が期限日までに実施可否を確認してください。`]
        : ['改善アクションの担当者割当対象はありません。'];
  const escalationStatus = overdueAssignments.length > 0
    ? 'required'
    : dueSoonAssignments.length > 0
      ? 'watch'
      : 'none';
  const escalationLabel = escalationStatus === 'required'
    ? '責任者エスカレーション'
    : escalationStatus === 'watch'
      ? '期限前確認'
      : 'エスカレーション不要';
  const escalationActions = escalationStatus === 'required'
    ? [`期限超過の担当者フォローが${overdueAssignments.length}件あります。管理者が担当者と実施日を確定してください。`]
    : escalationStatus === 'watch'
      ? [`期限間近の担当者フォローが${dueSoonAssignments.length}件あります。期限前に実行記録または延期理由を残してください。`]
      : ['担当者フォローの期限超過はありません。'];

  return {
    totalCount: followUps.length,
    openAssignmentCount: openFollowUps.length,
    crossStoreFollowUpCount: crossStoreFollowUps.length,
    openCrossStoreFollowUpCount: openCrossStoreFollowUps.length,
    postponedCount: postponedFollowUps.length,
    activePostponementCount: activePostponements.length,
    assigneeLabels,
    crossStoreTargetStoreNames,
    status,
    statusLabel,
    escalationStatus,
    escalationLabel,
    escalationActions,
    requiredActions
  };
}

export function buildOperationalClosingMonthlyReview(
  logs: AuditLog[],
  basisDate = new Date(),
  options: OperationalClosingReviewOptions = {}
): OperationalClosingMonthlyReview {
  const records = getApprovalRecordsForMonth(logs, basisDate);
  const monthlyKpiHistory = buildMonthlyKpiHistory(logs, basisDate);
  const monthSummary = monthlyKpiHistory[monthlyKpiHistory.length - 1] ?? summarizeMonth(records, basisDate);
  const previousMonthDate = toPreviousMonthDate(basisDate);
  const previousMonth = monthlyKpiHistory[monthlyKpiHistory.length - 2]
    ?? summarizeMonth(getApprovalRecordsForMonth(logs, previousMonthDate), previousMonthDate);
  const reviewers = new Set(records.map((record) => record.reviewerName).filter(Boolean));
  const chronologicalRecords = [...records].reverse();
  const completionTrend = chronologicalRecords
    .map((record) => record.completionRate === undefined ? '-' : `${record.completionRate}%`)
    .join(' -> ');
  const blockerTrend = chronologicalRecords
    .map((record) => record.closingBlockerCount === undefined ? '-' : `${record.closingBlockerCount}`)
    .join(' -> ');

  return {
    monthKey: monthSummary.monthKey,
    monthLabel: monthSummary.monthLabel,
    approvalCount: monthSummary.approvalCount,
    approvedDayCount: monthSummary.approvedDayCount,
    reviewerCount: reviewers.size,
    averageCompletionRate: monthSummary.averageCompletionRate,
    averageCompletionRateLabel: monthSummary.averageCompletionRateLabel,
    daysWithBlockers: monthSummary.daysWithBlockers,
    totalClosingBlockers: monthSummary.totalClosingBlockers,
    totalInventoryShortages: monthSummary.totalInventoryShortages,
    totalInventoryReceivings: monthSummary.totalInventoryReceivings,
    totalFollowUpDueCount: monthSummary.totalFollowUpDueCount,
    totalSupportCaseCount: monthSummary.totalSupportCaseCount,
    latestApproval: records[0],
    allApprovals: records,
    recentApprovals: records.slice(0, 5),
    completionTrendLabel: completionTrend || '未集計',
    blockerTrendLabel: blockerTrend || '未集計',
    previousMonthComparison: buildPreviousMonthComparison(monthSummary, previousMonth),
    monthlyKpiHistory,
    storeBenchmark: buildStoreBenchmark(records, options, logs, basisDate)
  };
}

export function buildOperationalClosingMonthlyReviewCsv(review: OperationalClosingMonthlyReview): string {
  const summaryRows = [
    ['区分', '項目', '値', '補足'],
    ['月次サマリ', '対象月', review.monthLabel, review.monthKey],
    ['月次サマリ', '承認回数', review.approvalCount, '日次締め承認ログ数'],
    ['月次サマリ', '承認日数', review.approvedDayCount, '重複承認日は1日として集計'],
    ['月次サマリ', '確認者数', review.reviewerCount, '承認ログの操作者数'],
    ['月次サマリ', '平均完了率', review.averageCompletionRateLabel, '本日完了率の月内平均'],
    ['月次サマリ', '残タスク日', review.daysWithBlockers, '閉店前残タスクが1件以上の日'],
    ['月次サマリ', '残タスク合計', review.totalClosingBlockers, '月内承認ログの残タスク合計'],
    ['月次サマリ', '在庫不足合計', review.totalInventoryShortages, '日次締め承認ログの在庫不足品目合計'],
    ['月次サマリ', '入庫登録合計', review.totalInventoryReceivings, '発注ワークベンチからロット在庫へ登録した件数'],
    ['月次サマリ', '服薬フォロー合計', review.totalFollowUpDueCount, '日次締め時点の服薬フォロー候補合計'],
    ['月次サマリ', '問い合わせ負荷合計', review.totalSupportCaseCount, '個人情報なし診断やサポート対応の記録件数'],
    ['前月比較', '比較月', review.previousMonthComparison.previousMonth.monthLabel, review.previousMonthComparison.previousMonth.monthKey],
    ['前月比較', '承認日数差', review.previousMonthComparison.approvedDayDeltaLabel, `${review.previousMonthComparison.previousMonth.approvedDayCount}日 -> ${review.approvedDayCount}日`],
    ['前月比較', '平均完了率差', review.previousMonthComparison.averageCompletionRateDeltaLabel, `${review.previousMonthComparison.previousMonth.averageCompletionRateLabel} -> ${review.averageCompletionRateLabel}`],
    ['前月比較', '残タスク日差', review.previousMonthComparison.daysWithBlockersDeltaLabel, `${review.previousMonthComparison.previousMonth.daysWithBlockers}日 -> ${review.daysWithBlockers}日`],
    ['前月比較', '残タスク合計差', review.previousMonthComparison.totalClosingBlockersDeltaLabel, `${review.previousMonthComparison.previousMonth.totalClosingBlockers}件 -> ${review.totalClosingBlockers}件`],
    ['前月比較', '在庫不足合計差', review.previousMonthComparison.inventoryShortageDeltaLabel, `${review.previousMonthComparison.previousMonth.totalInventoryShortages}品目 -> ${review.totalInventoryShortages}品目`],
    ['前月比較', '入庫登録合計差', review.previousMonthComparison.inventoryReceivingDeltaLabel, `${review.previousMonthComparison.previousMonth.totalInventoryReceivings}件 -> ${review.totalInventoryReceivings}件`],
    ['前月比較', '服薬フォロー合計差', review.previousMonthComparison.followUpDueDeltaLabel, `${review.previousMonthComparison.previousMonth.totalFollowUpDueCount}件 -> ${review.totalFollowUpDueCount}件`],
    ['前月比較', '問い合わせ負荷合計差', review.previousMonthComparison.supportCaseDeltaLabel, `${review.previousMonthComparison.previousMonth.totalSupportCaseCount}件 -> ${review.totalSupportCaseCount}件`],
    ['前月比較', '判定', review.previousMonthComparison.statusLabel, '完了率上昇と残タスク減少を改善として評価'],
    ['店舗別KPI', '比較店舗数', `${review.storeBenchmark.storeCount}件`, review.storeBenchmark.statusLabel],
    ['店舗別KPI', '自店完了率', review.storeBenchmark.currentStore?.averageCompletionRateLabel || '未集計', review.storeBenchmark.currentStoreName],
    ['店舗別KPI', '全店平均', review.storeBenchmark.allStoreAverageCompletionRateLabel, '日次締め承認ログ平均'],
    ['店舗別KPI', '他店平均', review.storeBenchmark.peerAverageCompletionRateLabel, review.storeBenchmark.actionLabel],
    ['店舗別KPI', '次の対応', review.storeBenchmark.requiredActions.join(' / '), '店舗別ベンチマーク'],
    ['効果測定', '改善アクション実行記録', `${review.storeBenchmark.actionEffectSummary.executionCount}件`, review.storeBenchmark.actionEffectSummary.statusLabel],
    ['効果測定', '次の対応', review.storeBenchmark.actionEffectSummary.requiredActions.join(' / '), '改善アクション'],
    ['未実施フォロー', '期限管理', review.storeBenchmark.actionFollowUpSummary.statusLabel, `未実施 ${review.storeBenchmark.actionFollowUpSummary.pendingCount}件 / 期限超過 ${review.storeBenchmark.actionFollowUpSummary.overdueCount}件 / 期限間近 ${review.storeBenchmark.actionFollowUpSummary.dueSoonCount}件`],
    ['未実施フォロー', '次の対応', review.storeBenchmark.actionFollowUpSummary.requiredActions.join(' / '), review.storeBenchmark.actionFollowUpSummary.nextDue?.dueDateKey || '期限なし'],
    ['担当者割当', '割当状況', review.storeBenchmark.actionAssignmentSummary.statusLabel, `未完了 ${review.storeBenchmark.actionAssignmentSummary.openAssignmentCount}件 / 店舗横断 ${review.storeBenchmark.actionAssignmentSummary.openCrossStoreFollowUpCount}件 / 担当 ${review.storeBenchmark.actionAssignmentSummary.assigneeLabels.join(' / ') || '未設定'}`],
    ['担当者割当', 'エスカレーション', review.storeBenchmark.actionAssignmentSummary.escalationLabel, review.storeBenchmark.actionAssignmentSummary.escalationActions.join(' / ')],
    ['担当者割当', '延期管理', `延期中 ${review.storeBenchmark.actionAssignmentSummary.activePostponementCount}件`, `延期記録 ${review.storeBenchmark.actionAssignmentSummary.postponedCount}件 / 未完了 ${review.storeBenchmark.actionAssignmentSummary.openAssignmentCount}件`],
    ['担当者割当', '店舗横断フォロー', review.storeBenchmark.actionAssignmentSummary.requiredActions.join(' / '), review.storeBenchmark.actionAssignmentSummary.crossStoreTargetStoreNames.join(' / ') || '対象店舗なし']
  ];
  const storeRows = review.storeBenchmark.storeSummaries.map((summary) => [
    '店舗別',
    summary.storeName,
    summary.averageCompletionRateLabel,
    `店舗コード ${summary.storeCode || '-'} / 承認 ${summary.approvedDayCount}日 / 残タスク ${summary.totalClosingBlockers}件 / 在庫不足 ${summary.averageInventoryShortageLabel} / 入庫 ${summary.averageInventoryReceivingLabel} / フォロー ${summary.averageFollowUpDueLabel} / 問い合わせ ${summary.averageSupportCaseLabel} / 平均差 ${summary.completionRateDifferenceFromAverage === undefined ? '比較不可' : signedDelta(summary.completionRateDifferenceFromAverage, 'pt')}`
  ]);
  const actionTemplateRows = review.storeBenchmark.actionTemplates.flatMap((template) => [
    [
      '改善アクション',
      template.title,
      template.priority,
      `対象 ${template.targetStoreName} / 担当 ${template.assigneeLabel} / 横断 ${template.crossStoreFollowUpLabel} / 期待 ${template.expectedOutcome}`
    ],
    ...template.steps.map((step, index) => [
      '改善手順',
      `${template.title} ${index + 1}`,
      step,
      template.targetStoreName
    ])
  ]);
  const actionExecutionRows = review.storeBenchmark.actionExecutions.map((execution) => [
    '実行記録',
    execution.dateLabel,
    execution.title,
    [
      `記録者 ${execution.recordedBy}`,
      `店舗 ${execution.targetStoreName}`,
      `優先度 ${actionPriorityLabel(execution.priority)}`,
      `担当 ${execution.assigneeLabel}`,
      execution.crossStoreFollowUpLabel ? `横断 ${execution.crossStoreFollowUpLabel}` : '横断 なし',
      `実行後測定 ${execution.measurementApprovedDayCount}/${execution.measurementRequiredDayCount}日`,
      execution.measurementStatusLabel,
      `完了率差 ${execution.completionRateDeltaLabel}`,
      `残タスク平均差 ${execution.closingBlockerAverageDeltaLabel}`,
      `在庫不足差 ${execution.inventoryShortageDeltaLabel}`,
      `入庫差 ${execution.inventoryReceivingDeltaLabel}`,
      `フォロー差 ${execution.followUpDueDeltaLabel}`,
      `問い合わせ差 ${execution.supportCaseDeltaLabel}`,
      `判定 ${execution.effectStatusLabel}`
    ].join(' / ')
  ]);
  const actionFollowUpRows = review.storeBenchmark.actionFollowUps.map((followUp) => [
    '未実施フォロー',
    followUp.title,
    followUp.statusLabel,
    [
      `期限 ${followUp.dueDateKey}`,
      actionDueDistanceLabel(followUp.daysUntilDue),
      `店舗 ${followUp.targetStoreName}`,
      `優先度 ${actionPriorityLabel(followUp.priority)}`,
      `担当 ${followUp.assigneeLabel}`,
      `横断 ${followUp.crossStoreFollowUpLabel || 'なし'}`,
      `横断対象 ${followUp.crossStoreTargetStoreNames.join(' / ') || 'なし'}`,
      followUp.postponed ? `延期理由 ${followUp.postponementReason || '理由未記入'} / 旧期限 ${followUp.originalDueDateKey || '未設定'} / 再期限 ${followUp.dueDateKey}` : '延期なし',
      followUp.completedBy ? `記録者 ${followUp.completedBy}` : followUp.requiredAction
    ].join(' / ')
  ]);
  const actionPostponementRows = review.storeBenchmark.actionPostponements.map((postponement) => [
    '延期記録',
    postponement.dateLabel,
    postponement.title,
    [
      `記録者 ${postponement.recordedBy}`,
      `店舗 ${postponement.targetStoreName}`,
      `担当 ${postponement.assigneeLabel}`,
      `理由 ${postponement.reason}`,
      `旧期限 ${postponement.previousDueDateKey || '未設定'}`,
      `再期限 ${postponement.newDueDateKey}`,
      actionDueDistanceLabel(postponement.daysUntilNewDue)
    ].join(' / ')
  ]);
  const monthlyKpiRows = review.monthlyKpiHistory.map((month) => [
    '複数月KPI',
    month.monthLabel,
    month.averageCompletionRateLabel,
    `承認 ${month.approvedDayCount}日 / 残タスク日 ${month.daysWithBlockers}日 / 残タスク合計 ${month.totalClosingBlockers}件 / 在庫不足 ${month.totalInventoryShortages}品目 / 入庫 ${month.totalInventoryReceivings}件 / フォロー ${month.totalFollowUpDueCount}件 / 問い合わせ ${month.totalSupportCaseCount}件`
  ]);
  const latestRows = [
    ['KPI推移', '本日完了率', review.completionTrendLabel, '古い承認から新しい承認の順'],
    ['KPI推移', '閉店前残タスク', review.blockerTrendLabel, '古い承認から新しい承認の順'],
    ['最新承認', '日時', review.latestApproval?.dateLabel || '未記録', review.latestApproval?.timestamp || ''],
    ['最新承認', '確認者', review.latestApproval?.reviewerName || '未記録', ''],
    ['最新承認', '整合性ハッシュ', review.latestApproval?.integrityHash || '未署名', '監査ログの署名値']
  ];

  const approvalRows = review.allApprovals.map((approval) => [
    '月内承認',
    approval.dateLabel,
    approval.reviewerName,
    [
      `完了率 ${approval.completionRate === undefined ? '-' : `${approval.completionRate}%`}`,
      `残タスク ${approval.closingBlockerCount ?? '-'}件`,
      `在庫不足 ${approval.inventoryShortageCount ?? '-'}品目`,
      `入庫 ${approval.inventoryReceivingCount ?? '-'}件`,
      `フォロー ${approval.followUpDueCount ?? '-'}件`,
      `問い合わせ ${approval.supportCaseCount ?? '-'}件`,
      `月次請求 ${approval.monthlyClaimRate === undefined ? '-' : `${approval.monthlyClaimRate}%`}`,
      `hash ${approval.integrityHash || '未署名'}`
    ].join(' / ')
  ]);

  return [...summaryRows, ...storeRows, ...actionTemplateRows, ...actionExecutionRows, ...actionFollowUpRows, ...actionPostponementRows, ...monthlyKpiRows, ...latestRows, ...approvalRows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
}

export function buildOperationalClosingStoreBenchmarkBiExport(
  review: OperationalClosingMonthlyReview,
  generatedAt = new Date()
): string {
  const payload: OperationalClosingStoreBenchmarkBiExport = {
    type: 'operational-closing-store-benchmark',
    schemaVersion: 5,
    generatedAt: generatedAt.toISOString(),
    monthKey: review.monthKey,
    monthLabel: review.monthLabel,
    currentStoreName: review.storeBenchmark.currentStoreName,
    summary: {
      approvalCount: review.approvalCount,
      approvedDayCount: review.approvedDayCount,
      reviewerCount: review.reviewerCount,
      averageCompletionRate: review.averageCompletionRate,
      averageCompletionRateLabel: review.averageCompletionRateLabel,
      daysWithBlockers: review.daysWithBlockers,
      totalClosingBlockers: review.totalClosingBlockers,
      totalInventoryShortages: review.totalInventoryShortages,
      totalInventoryReceivings: review.totalInventoryReceivings,
      totalFollowUpDueCount: review.totalFollowUpDueCount,
      totalSupportCaseCount: review.totalSupportCaseCount,
      storeCount: review.storeBenchmark.storeCount,
      allStoreAverageCompletionRate: review.storeBenchmark.allStoreAverageCompletionRate,
      allStoreAverageCompletionRateLabel: review.storeBenchmark.allStoreAverageCompletionRateLabel,
      peerAverageCompletionRate: review.storeBenchmark.peerAverageCompletionRate,
      peerAverageCompletionRateLabel: review.storeBenchmark.peerAverageCompletionRateLabel,
      allStoreAverageInventoryShortages: review.storeBenchmark.allStoreAverageInventoryShortages,
      allStoreAverageInventoryShortagesLabel: review.storeBenchmark.allStoreAverageInventoryShortagesLabel,
      peerAverageInventoryShortages: review.storeBenchmark.peerAverageInventoryShortages,
      peerAverageInventoryShortagesLabel: review.storeBenchmark.peerAverageInventoryShortagesLabel,
      allStoreAverageInventoryReceivings: review.storeBenchmark.allStoreAverageInventoryReceivings,
      allStoreAverageInventoryReceivingsLabel: review.storeBenchmark.allStoreAverageInventoryReceivingsLabel,
      peerAverageInventoryReceivings: review.storeBenchmark.peerAverageInventoryReceivings,
      peerAverageInventoryReceivingsLabel: review.storeBenchmark.peerAverageInventoryReceivingsLabel,
      allStoreAverageFollowUpDue: review.storeBenchmark.allStoreAverageFollowUpDue,
      allStoreAverageFollowUpDueLabel: review.storeBenchmark.allStoreAverageFollowUpDueLabel,
      peerAverageFollowUpDue: review.storeBenchmark.peerAverageFollowUpDue,
      peerAverageFollowUpDueLabel: review.storeBenchmark.peerAverageFollowUpDueLabel,
      allStoreAverageSupportCases: review.storeBenchmark.allStoreAverageSupportCases,
      allStoreAverageSupportCasesLabel: review.storeBenchmark.allStoreAverageSupportCasesLabel,
      peerAverageSupportCases: review.storeBenchmark.peerAverageSupportCases,
      peerAverageSupportCasesLabel: review.storeBenchmark.peerAverageSupportCasesLabel,
      status: review.storeBenchmark.status,
      statusLabel: review.storeBenchmark.statusLabel,
      actionLabel: review.storeBenchmark.actionLabel
    },
    stores: review.storeBenchmark.storeSummaries,
    months: review.monthlyKpiHistory,
    requiredActions: review.storeBenchmark.requiredActions,
    actionTemplates: review.storeBenchmark.actionTemplates,
    actionExecutions: review.storeBenchmark.actionExecutions,
    actionEffectSummary: review.storeBenchmark.actionEffectSummary,
    actionPostponements: review.storeBenchmark.actionPostponements,
    actionFollowUps: review.storeBenchmark.actionFollowUps,
    actionFollowUpSummary: review.storeBenchmark.actionFollowUpSummary,
    actionAssignmentSummary: review.storeBenchmark.actionAssignmentSummary,
    privacy: {
      patientFieldsIncluded: false,
      containsPatientIdentifiers: false,
      sourceLogDetailsIncluded: false
    }
  };

  return JSON.stringify(payload, null, 2);
}
