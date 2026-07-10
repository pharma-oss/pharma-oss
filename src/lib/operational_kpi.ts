import type { Visit } from '@/db/types';
import { getClaimLifecycleStatus } from './claim_lifecycle.ts';

export interface OperationalKpiCounts {
  todayReceptionCount: number;
  waitingCount: number;
  processingCount: number;
  reviewCount: number;
  pickingPendingCount: number;
  inventoryShortageCount: number;
  urgentClaimRiskCount: number;
  returnedClaimCount: number;
  rebillingClaimCount: number;
  urgentFollowUpCount: number;
}

export interface OperationalKpiSoapRecord {
  visitId: string;
  updatedAt?: string;
}

export interface DailyOperationalKpi {
  receptionCount: number;
  completedCount: number;
  completionRate: number;
  completionRateLabel: string;
  activeQueueCount: number;
  averageCompletionMinutes: number | null;
  averageCompletionLabel: string;
  closingBlockerCount: number;
  closingStatus: 'clear' | 'attention' | 'blocked';
  closingStatusLabel: string;
}

export interface MonthlyOperationalKpi {
  claimTargetCount: number;
  closedClaimCount: number;
  closedClaimRate: number;
  closedClaimRateLabel: string;
  openClaimCount: number;
  returnedClaimCount: number;
  rebillingClaimCount: number;
}

export interface OperationalKpis {
  daily: DailyOperationalKpi;
  monthly: MonthlyOperationalKpi;
}

function isSameLocalDate(value: string | undefined, date: Date): boolean {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  return (
    target.getFullYear() === date.getFullYear() &&
    target.getMonth() === date.getMonth() &&
    target.getDate() === date.getDate()
  );
}

function isSameLocalMonth(value: string | undefined, date: Date): boolean {
  if (!value) return false;
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return false;
  return target.getFullYear() === date.getFullYear() && target.getMonth() === date.getMonth();
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '算出待ち';
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}時間${rest}分` : `${hours}時間`;
}

function getLatestSoapUpdatedAtByVisit(soapRecords: OperationalKpiSoapRecord[]): Map<string, string> {
  const latestByVisit = new Map<string, string>();
  for (const record of soapRecords) {
    if (!record.updatedAt) continue;
    const current = latestByVisit.get(record.visitId);
    if (!current || new Date(record.updatedAt).getTime() > new Date(current).getTime()) {
      latestByVisit.set(record.visitId, record.updatedAt);
    }
  }
  return latestByVisit;
}

function averageCompletionMinutes(visits: Visit[], soapRecords: OperationalKpiSoapRecord[], basisDate: Date): number | null {
  const latestSoapUpdatedAtByVisit = getLatestSoapUpdatedAtByVisit(soapRecords);
  let totalMinutes = 0;
  let counted = 0;

  for (const visit of visits) {
    if (visit.status !== 'completed' || !isSameLocalDate(visit.issueDate, basisDate)) continue;
    const soapUpdatedAt = latestSoapUpdatedAtByVisit.get(visit.visitId);
    if (!soapUpdatedAt) continue;
    const issuedAt = new Date(visit.issueDate).getTime();
    const completedAt = new Date(soapUpdatedAt).getTime();
    if (!Number.isFinite(issuedAt) || !Number.isFinite(completedAt) || completedAt < issuedAt) continue;
    totalMinutes += Math.round((completedAt - issuedAt) / 60000);
    counted++;
  }

  return counted > 0 ? Math.round(totalMinutes / counted) : null;
}

function getClaimMonthBasis(visit: Visit): string | undefined {
  return visit.claimLifecycle?.closedAt
    || visit.claimLifecycle?.acceptedAt
    || visit.claimLifecycle?.exportedAt
    || visit.issueDate;
}

export function buildOperationalKpis({
  visits,
  soapRecords,
  counts,
  basisDate = new Date()
}: {
  visits: Visit[];
  soapRecords: OperationalKpiSoapRecord[];
  counts: OperationalKpiCounts;
  basisDate?: Date;
}): OperationalKpis {
  const completedCount = visits.filter((visit) => (
    visit.status === 'completed' && isSameLocalDate(visit.issueDate, basisDate)
  )).length;
  const completionRate = toPercent(completedCount, counts.todayReceptionCount);
  const activeQueueCount = counts.waitingCount + counts.processingCount;
  const averageMinutes = averageCompletionMinutes(visits, soapRecords, basisDate);
  const closingBlockerCount =
    activeQueueCount +
    counts.reviewCount +
    counts.pickingPendingCount +
    counts.urgentClaimRiskCount +
    counts.inventoryShortageCount +
    counts.returnedClaimCount +
    counts.rebillingClaimCount +
    counts.urgentFollowUpCount;
  const closingStatus = closingBlockerCount === 0
    ? 'clear'
    : counts.urgentClaimRiskCount > 0 || counts.returnedClaimCount > 0 || counts.inventoryShortageCount > 0
      ? 'blocked'
      : 'attention';

  let claimTargetCount = 0;
  let closedClaimCount = 0;
  for (const visit of visits) {
    const status = getClaimLifecycleStatus(visit.claimLifecycle);
    if (status === 'draft') continue;
    if (!isSameLocalMonth(getClaimMonthBasis(visit), basisDate)) continue;
    claimTargetCount++;
    if (status === 'closed') closedClaimCount++;
  }

  const closedClaimRate = toPercent(closedClaimCount, claimTargetCount);
  const openClaimCount = Math.max(0, claimTargetCount - closedClaimCount);

  return {
    daily: {
      receptionCount: counts.todayReceptionCount,
      completedCount,
      completionRate,
      completionRateLabel: `${completionRate}%`,
      activeQueueCount,
      averageCompletionMinutes: averageMinutes,
      averageCompletionLabel: formatMinutes(averageMinutes),
      closingBlockerCount,
      closingStatus,
      closingStatusLabel: closingBlockerCount === 0 ? '主要キュー0件' : `残タスク ${closingBlockerCount}件`
    },
    monthly: {
      claimTargetCount,
      closedClaimCount,
      closedClaimRate,
      closedClaimRateLabel: `${closedClaimRate}%`,
      openClaimCount,
      returnedClaimCount: counts.returnedClaimCount,
      rebillingClaimCount: counts.rebillingClaimCount
    }
  };
}
