import type { ClaimLifecycleEvent, ClaimLifecycleState, ClaimLifecycleStatus } from './claim_lifecycle.ts';
import { getClaimLifecycleStatus } from './claim_lifecycle.ts';

export type ClaimWorkbenchStatus = Exclude<ClaimLifecycleStatus, 'draft' | 'closed'>;
export type ClaimWorkbenchPriority = 'high' | 'medium' | 'normal';

export interface ClaimWorkbenchExportItem {
  visitId: string;
  patientId: string;
  patientName: string;
  issueDateLabel: string;
  monthLabel: string;
  statusLabel: string;
  priorityLabel: string;
  totalPoints: number;
  prescriptionCount: number;
  exportedFileName?: string;
  latestEventLabel: string;
  reason?: string;
  actionLabel: string;
}

function isClaimWorkbenchStatus(status: ClaimLifecycleStatus): status is ClaimWorkbenchStatus {
  return status === 'exported' || status === 'accepted' || status === 'returned' || status === 'rebilling';
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getLocalMonthKey(value?: string): string {
  const date = parseDate(value);
  if (!date) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export function formatClaimWorkbenchDate(value?: string): string {
  const date = parseDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export function formatClaimWorkbenchMonth(value?: string): string {
  const date = parseDate(value);
  if (!date) return '請求月不明';
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function getClaimLifecycleLatestEvent(state?: ClaimLifecycleState | null): ClaimLifecycleEvent | undefined {
  const history = state?.history || [];
  return history.length > 0 ? history[history.length - 1] : undefined;
}

export function shouldIncludeInMonthlyClaimWorkbench(input: {
  lifecycle?: ClaimLifecycleState | null;
  issueDate?: string;
  basisDate?: Date;
}): boolean {
  const status = getClaimLifecycleStatus(input.lifecycle);
  if (!isClaimWorkbenchStatus(status)) return false;
  if (status === 'returned' || status === 'rebilling' || status === 'exported' || status === 'accepted') return true;
  return false;
}

export function getClaimWorkbenchPriority({
  status,
  latestEventAt,
  basisDate = new Date()
}: {
  status: ClaimWorkbenchStatus;
  latestEventAt?: string;
  basisDate?: Date;
}): ClaimWorkbenchPriority {
  if (status === 'returned') return 'high';
  if (status === 'rebilling') return 'medium';
  if (status === 'accepted') return 'normal';

  const latestEventDate = parseDate(latestEventAt);
  if (!latestEventDate) return 'normal';
  const daysOpen = Math.floor((basisDate.getTime() - latestEventDate.getTime()) / 86400000);
  return daysOpen >= 7 ? 'medium' : 'normal';
}

export function getClaimWorkbenchActionLabel(status: ClaimWorkbenchStatus): string {
  switch (status) {
    case 'returned':
      return '修正して再請求へ';
    case 'rebilling':
      return '月遅れ/UKE再出力';
    case 'accepted':
      return '入金確認後に締め';
    case 'exported':
      return '入金確認後に締め';
    default:
      return '請求状態を確認';
  }
}

export function isClaimWorkbenchUkeExportable(status: ClaimWorkbenchStatus): boolean {
  return status === 'rebilling';
}

export function isClaimWorkbenchClosable(status: ClaimWorkbenchStatus): boolean {
  return status === 'accepted';
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildClaimWorkbenchCsv(items: ClaimWorkbenchExportItem[]): string {
  const headers = [
    '優先度',
    '請求状態',
    '患者ID',
    '患者名',
    '調剤日',
    '請求月',
    '点数',
    '薬剤数',
    'UKEファイル',
    '最新イベント',
    '理由',
    '対応'
  ];

  const rows = items.map((item) => [
    item.priorityLabel,
    item.statusLabel,
    item.patientId,
    item.patientName,
    item.issueDateLabel,
    item.monthLabel,
    item.totalPoints,
    item.prescriptionCount,
    item.exportedFileName || '',
    item.latestEventLabel,
    item.reason || '',
    item.actionLabel
  ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildClaimWorkbenchMemo(items: ClaimWorkbenchExportItem[]): string {
  if (items.length === 0) return '月次請求ワークベンチ 対象なし';

  const lines = [`月次請求ワークベンチ ${items.length}件`];
  for (const item of items.slice(0, 12)) {
    lines.push(
      `${item.priorityLabel}: ${item.patientName} / ${item.statusLabel} / ${item.issueDateLabel} / ${item.totalPoints}点 / ${item.actionLabel}`
    );
  }
  if (items.length > 12) {
    lines.push(`ほか${items.length - 12}件`);
  }
  return lines.join('\n');
}
