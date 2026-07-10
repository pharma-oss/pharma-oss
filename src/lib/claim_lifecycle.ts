export type ClaimLifecycleStatus = 'draft' | 'exported' | 'accepted' | 'returned' | 'rebilling' | 'closed';
export type ClaimSnapshotEligibilityStatus = 'unchecked' | 'valid' | 'warning' | 'invalid' | 'unavailable';

export type ClaimLifecycleEventType =
  | 'exported'
  | 'accepted'
  | 'returned'
  | 'rebilling'
  | 'closed';

export interface ClaimLifecycleEvent {
  type: ClaimLifecycleEventType;
  at: string;
  by?: string;
  note?: string;
  totalPoints?: number;
  fileName?: string;
}

export interface ClaimExportSnapshotItem {
  itemId: string;
  rpNumber?: number;
  drugId: string;
  dispensedDrug?: string;
  dispensedDrugCode?: string;
  amount: number;
  days: number;
  usage?: string;
}

export interface ClaimExportSnapshot {
  createdAt: string;
  visitId: string;
  patientId: string;
  patientName: string;
  patientKana?: string;
  patientBirthDate: string;
  patientGender?: string;
  insuranceInfo?: {
    provider?: string;
    number?: string;
    burdenRatio?: number;
    insuranceType?: string;
    relationship?: string;
    validFrom?: string;
    validTo?: string;
    eligibilityCheckedAt?: string;
    eligibilityStatus?: ClaimSnapshotEligibilityStatus;
  };
  publicInsurances?: Array<{
    provider: string;
    recipient: string;
    burdenRatio?: number;
    startDate?: string;
    endDate?: string;
    monthlyLimitYen?: number;
  }>;
  institutionCode?: string;
  institutionName?: string;
  departmentName?: string;
  doctorName?: string;
  prescriptionDate?: string;
  dispensingDate?: string;
  issueDate: string;
  exportedFileName?: string;
  totalPoints: number;
  prescriptionItems: ClaimExportSnapshotItem[];
}

export interface ClaimLifecycleState {
  status?: ClaimLifecycleStatus;
  exportedAt?: string;
  exportedBy?: string;
  exportedFileName?: string;
  lockedAt?: string;
  totalPoints?: number;
  exportSnapshot?: ClaimExportSnapshot;
  acceptedAt?: string;
  acceptedBy?: string;
  acceptanceReceiptNumber?: string;
  returnedAt?: string;
  returnReason?: string;
  rebillingAt?: string;
  rebillingReason?: string;
  closedAt?: string;
  closedBy?: string;
  history?: ClaimLifecycleEvent[];
}

export const CLAIM_LIFECYCLE_STATUS_LABELS: Record<ClaimLifecycleStatus, string> = {
  draft: '請求前',
  exported: 'UKE出力済',
  accepted: '受付済',
  returned: '返戻対応',
  rebilling: '再請求準備',
  closed: '請求完了'
};

export function getClaimLifecycleStatus(state?: ClaimLifecycleState | null): ClaimLifecycleStatus {
  return state?.status || 'draft';
}

export function isClaimLifecycleLocked(state?: ClaimLifecycleState | null): boolean {
  const status = getClaimLifecycleStatus(state);
  return status === 'exported' || status === 'accepted' || status === 'closed';
}

function appendLifecycleEvent(
  state: ClaimLifecycleState | undefined,
  event: ClaimLifecycleEvent
): ClaimLifecycleEvent[] {
  return [...(state?.history || []), event].slice(-20);
}

export function markClaimExported({
  current,
  at,
  by,
  fileName,
  totalPoints,
  exportSnapshot
}: {
  current?: ClaimLifecycleState | null;
  at: string;
  by?: string;
  fileName: string;
  totalPoints: number;
  exportSnapshot?: ClaimExportSnapshot;
}): ClaimLifecycleState {
  const base = current || {};
  return {
    ...base,
    status: 'exported',
    exportedAt: at,
    exportedBy: by,
    exportedFileName: fileName,
    lockedAt: at,
    totalPoints,
    exportSnapshot,
    history: appendLifecycleEvent(base, {
      type: 'exported',
      at,
      by,
      fileName,
      totalPoints,
      note: 'UKE出力により請求をロック'
    })
  };
}

export function markClaimReturned({
  current,
  at,
  by,
  reason
}: {
  current?: ClaimLifecycleState | null;
  at: string;
  by?: string;
  reason: string;
}): ClaimLifecycleState {
  const base = current || {};
  return {
    ...base,
    status: 'returned',
    returnedAt: at,
    returnReason: reason,
    lockedAt: undefined,
    history: appendLifecycleEvent(base, {
      type: 'returned',
      at,
      by,
      note: reason
    })
  };
}

export function markClaimAccepted({
  current,
  at,
  by,
  receiptNumber,
  note
}: {
  current?: ClaimLifecycleState | null;
  at: string;
  by?: string;
  receiptNumber?: string;
  note?: string;
}): ClaimLifecycleState {
  const base = current || {};
  return {
    ...base,
    status: 'accepted',
    acceptedAt: at,
    acceptedBy: by,
    acceptanceReceiptNumber: receiptNumber,
    lockedAt: base.lockedAt || at,
    history: appendLifecycleEvent(base, {
      type: 'accepted',
      at,
      by,
      note: note || 'オンライン請求の受付結果を取り込みました。'
    })
  };
}

export function markClaimRebilling({
  current,
  at,
  by,
  reason
}: {
  current?: ClaimLifecycleState | null;
  at: string;
  by?: string;
  reason: string;
}): ClaimLifecycleState {
  const base = current || {};
  return {
    ...base,
    status: 'rebilling',
    rebillingAt: at,
    rebillingReason: reason,
    lockedAt: undefined,
    history: appendLifecycleEvent(base, {
      type: 'rebilling',
      at,
      by,
      note: reason
    })
  };
}

export function markClaimClosed({
  current,
  at,
  by,
  note
}: {
  current?: ClaimLifecycleState | null;
  at: string;
  by?: string;
  note?: string;
}): ClaimLifecycleState {
  const base = current || {};
  return {
    ...base,
    status: 'closed',
    closedAt: at,
    closedBy: by,
    lockedAt: base.lockedAt || at,
    history: appendLifecycleEvent(base, {
      type: 'closed',
      at,
      by,
      note: note || '請求完了として締めました。'
    })
  };
}
