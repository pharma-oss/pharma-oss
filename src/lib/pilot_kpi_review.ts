import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';

export type PilotKpiReviewStatus = 'pass' | 'attention' | 'blocked';

export interface PilotKpiSnapshotInput {
  storeId?: string;
  weekStart?: string;
  weekEnd?: string;
  operatingDays?: number;
  prescriptionCount?: number;
  claimReturnCount?: number;
  averageHandlingMinutes?: number;
  closingRemainingTaskCount?: number;
  stockoutCount?: number;
  followUpDueCount?: number;
  followUpOnTimeCount?: number;
  criticalIncidentCount?: number;
  unrecoveredIncidentCount?: number;
  supportCaseCount?: number;
}

export interface PilotKpiReviewTargets {
  minStoreCount: number;
  minWeekCount: number;
  maxClaimReturnRatePercent: number;
  maxAverageHandlingMinutes: number;
  maxClosingRemainingTasksPerDay: number;
  maxStockoutsPer100Prescriptions: number;
  minFollowUpOnTimeRatePercent: number;
  maxSupportCasesPer100Prescriptions: number;
}

export interface PilotKpiReviewEvidenceInput {
  pilotId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  anonymizedStoreIdsConfirmed?: boolean;
  realPilotEvidenceConfirmed?: boolean;
  releasePostReviewAttached?: boolean;
  slaReviewAttached?: boolean;
  supportTriageAttached?: boolean;
  improvementActionsRegistered?: boolean;
  ownerReviewCompleted?: boolean;
  targets?: Partial<PilotKpiReviewTargets>;
  snapshots?: PilotKpiSnapshotInput[];
}

export interface PilotKpiReviewGate {
  id: string;
  title: string;
  status: PilotKpiReviewStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface PilotKpiStoreSummary {
  storeId: string;
  weekCount: number;
  operatingDays: number;
  prescriptionCount: number;
  claimReturnCount: number;
  claimReturnRatePercent: number;
  averageHandlingMinutes: number;
  closingRemainingTasksPerDay: number;
  stockoutsPer100Prescriptions: number;
  followUpOnTimeRatePercent: number;
  criticalIncidentCount: number;
  unrecoveredIncidentCount: number;
  supportCasesPer100Prescriptions: number;
}

export type PilotKpiTrendDirection = 'improving' | 'stable' | 'worsening';

export interface PilotKpiTrendMetricComparison {
  id: string;
  label: string;
  firstHalfValue: number;
  latestHalfValue: number;
  delta: number;
  deltaLabel: string;
  direction: PilotKpiTrendDirection;
}

export interface PilotKpiStoreTrend {
  storeId: string;
  weekCount: number;
  status: PilotKpiReviewStatus;
  statusLabel: string;
  firstWeekLabel: string;
  latestWeekLabel: string;
  comparisons: PilotKpiTrendMetricComparison[];
  worseningMetricLabels: string[];
  improvingMetricLabels: string[];
  nextAction: string;
}

export interface PilotKpiTrendSummary {
  status: PilotKpiReviewStatus;
  statusLabel: string;
  storeCount: number;
  worseningStoreCount: number;
  improvingStoreCount: number;
  insufficientStoreCount: number;
  stores: PilotKpiStoreTrend[];
  requiredActions: string[];
}

export interface PilotKpiReview {
  type: 'yakureki-pilot-kpi-review';
  schemaVersion: 3;
  generatedAt: string;
  pilotId: string;
  status: PilotKpiReviewStatus;
  statusLabel: string;
  targets: PilotKpiReviewTargets;
  coverage: {
    storeCount: number;
    weekCount: number;
    snapshotCount: number;
    missingMetricCount: number;
    missingMetricSamples: string[];
  };
  summary: PilotKpiStoreSummary;
  stores: PilotKpiStoreSummary[];
  evidence: {
    noPatientDataConfirmed: boolean;
    anonymizedStoreIdsConfirmed: boolean;
    realPilotEvidenceConfirmed: boolean;
    releasePostReviewAttached: boolean;
    slaReviewAttached: boolean;
    supportTriageAttached: boolean;
    improvementActionsRegistered: boolean;
    ownerReviewCompleted: boolean;
  };
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsRawSupportText: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  trend: PilotKpiTrendSummary;
  gates: PilotKpiReviewGate[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface PilotKpiReviewEvidenceTemplate {
  type: 'yakureki-pilot-kpi-review-evidence-template';
  schemaVersion: 3;
  generatedAt: string;
  pilotId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataConfirmed: false;
  anonymizedStoreIdsConfirmed: false;
  realPilotEvidenceConfirmed: false;
  releasePostReviewAttached: false;
  slaReviewAttached: false;
  supportTriageAttached: false;
  improvementActionsRegistered: false;
  ownerReviewCompleted: false;
  targets: PilotKpiReviewTargets;
  snapshots: Required<PilotKpiSnapshotInput>[];
  privacy: PilotKpiReview['privacy'];
}

export interface PilotKpiEvidenceRequestItem {
  id:
    | 'weekly_kpi_snapshots'
    | 'release_post_review'
    | 'sla_review'
    | 'support_triage'
    | 'improvement_actions'
    | 'owner_review';
  title: string;
  required: boolean;
  cadence: string;
  neededFields: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface PilotKpiEvidenceRequest {
  type: 'yakureki-pilot-kpi-evidence-request';
  schemaVersion: 1;
  generatedAt: string;
  pilotId: string;
  guidance: string;
  targets: PilotKpiReviewTargets;
  items: PilotKpiEvidenceRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    evidenceJson: 'YAKUREKI_PILOT_KPI_EVIDENCE';
    outputDir: 'YAKUREKI_PILOT_KPI_OUTPUT_DIR';
    pilotId: 'YAKUREKI_PILOT_ID';
  };
}

const DEFAULT_TARGETS: PilotKpiReviewTargets = {
  minStoreCount: 2,
  minWeekCount: 4,
  maxClaimReturnRatePercent: 1,
  maxAverageHandlingMinutes: 18,
  maxClosingRemainingTasksPerDay: 3,
  maxStockoutsPer100Prescriptions: 1,
  minFollowUpOnTimeRatePercent: 95,
  maxSupportCasesPer100Prescriptions: 2
};

const PRIVACY_FLAGS = {
  containsPatientData: false,
  containsStaffNames: false,
  containsFacilityName: false,
  containsRawAuditDetails: false,
  containsRawSupportText: false,
  containsLocalPath: false,
  containsExternalSecrets: false
} as const;

function statusLabel(status: PilotKpiReviewStatus): string {
  if (status === 'pass') return 'パイロットKPI OK';
  if (status === 'attention') return 'パイロットKPIを確認';
  return 'パイロット継続判断を保留';
}

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function finiteNonNegative(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function rate(numerator: number, denominator: number, emptyValue = 0): number {
  if (denominator <= 0) return emptyValue;
  return round1((numerator / denominator) * 100);
}

function per100(count: number, denominator: number): number {
  return rate(count, denominator, 0);
}

function signedDelta(value: number, unit: string): string {
  if (value === 0) return `±0${unit}`;
  return `${value > 0 ? '+' : ''}${value}${unit}`;
}

function mergeTargets(input: Partial<PilotKpiReviewTargets> | undefined): PilotKpiReviewTargets {
  return {
    minStoreCount: finiteNonNegative(input?.minStoreCount) ?? DEFAULT_TARGETS.minStoreCount,
    minWeekCount: finiteNonNegative(input?.minWeekCount) ?? DEFAULT_TARGETS.minWeekCount,
    maxClaimReturnRatePercent: finiteNonNegative(input?.maxClaimReturnRatePercent) ?? DEFAULT_TARGETS.maxClaimReturnRatePercent,
    maxAverageHandlingMinutes: finiteNonNegative(input?.maxAverageHandlingMinutes) ?? DEFAULT_TARGETS.maxAverageHandlingMinutes,
    maxClosingRemainingTasksPerDay: finiteNonNegative(input?.maxClosingRemainingTasksPerDay) ?? DEFAULT_TARGETS.maxClosingRemainingTasksPerDay,
    maxStockoutsPer100Prescriptions: finiteNonNegative(input?.maxStockoutsPer100Prescriptions) ?? DEFAULT_TARGETS.maxStockoutsPer100Prescriptions,
    minFollowUpOnTimeRatePercent: finiteNonNegative(input?.minFollowUpOnTimeRatePercent) ?? DEFAULT_TARGETS.minFollowUpOnTimeRatePercent,
    maxSupportCasesPer100Prescriptions: finiteNonNegative(input?.maxSupportCasesPer100Prescriptions) ?? DEFAULT_TARGETS.maxSupportCasesPer100Prescriptions
  };
}

function normalizeStoreId(value: string | undefined, index: number): string {
  const storeId = String(value || '').trim();
  return storeId || `store_${String(index + 1).padStart(3, '0')}`;
}

function weekKey(snapshot: PilotKpiSnapshotInput): string {
  return `${snapshot.weekStart || 'week_start_missing'}_${snapshot.weekEnd || 'week_end_missing'}`;
}

function missingMetricNames(snapshot: PilotKpiSnapshotInput): string[] {
  const checks: [keyof PilotKpiSnapshotInput, string][] = [
    ['weekStart', '週開始日'],
    ['weekEnd', '週終了日'],
    ['operatingDays', '営業日数'],
    ['prescriptionCount', '受付件数'],
    ['claimReturnCount', '返戻件数'],
    ['averageHandlingMinutes', '平均処理時間'],
    ['closingRemainingTaskCount', '閉店前残タスク'],
    ['stockoutCount', '欠品件数'],
    ['followUpDueCount', 'フォロー対象件数'],
    ['followUpOnTimeCount', '期限内フォロー件数'],
    ['criticalIncidentCount', '重大障害件数'],
    ['unrecoveredIncidentCount', '未復旧障害件数'],
    ['supportCaseCount', '問い合わせ件数']
  ];
  const missing: string[] = [];
  for (const [key, label] of checks) {
    const value = snapshot[key];
    if (typeof value === 'string') {
      if (!value.trim()) missing.push(label);
    } else if (finiteNonNegative(value) === undefined) {
      missing.push(label);
    }
  }
  return missing;
}

function summarizeStore(storeId: string, snapshots: PilotKpiSnapshotInput[]): PilotKpiStoreSummary {
  let operatingDays = 0;
  let prescriptionCount = 0;
  let claimReturnCount = 0;
  let handlingWeightedSum = 0;
  let handlingWeight = 0;
  let closingRemainingTaskCount = 0;
  let stockoutCount = 0;
  let followUpDueCount = 0;
  let followUpOnTimeCount = 0;
  let criticalIncidentCount = 0;
  let unrecoveredIncidentCount = 0;
  let supportCaseCount = 0;
  const weeks = new Set<string>();

  for (const snapshot of snapshots) {
    weeks.add(weekKey(snapshot));
    const operating = finiteNonNegative(snapshot.operatingDays) ?? 0;
    const prescriptions = finiteNonNegative(snapshot.prescriptionCount) ?? 0;
    const handling = finiteNonNegative(snapshot.averageHandlingMinutes) ?? 0;
    operatingDays += operating;
    prescriptionCount += prescriptions;
    claimReturnCount += finiteNonNegative(snapshot.claimReturnCount) ?? 0;
    handlingWeightedSum += handling * Math.max(prescriptions, 1);
    handlingWeight += Math.max(prescriptions, 1);
    closingRemainingTaskCount += finiteNonNegative(snapshot.closingRemainingTaskCount) ?? 0;
    stockoutCount += finiteNonNegative(snapshot.stockoutCount) ?? 0;
    followUpDueCount += finiteNonNegative(snapshot.followUpDueCount) ?? 0;
    followUpOnTimeCount += finiteNonNegative(snapshot.followUpOnTimeCount) ?? 0;
    criticalIncidentCount += finiteNonNegative(snapshot.criticalIncidentCount) ?? 0;
    unrecoveredIncidentCount += finiteNonNegative(snapshot.unrecoveredIncidentCount) ?? 0;
    supportCaseCount += finiteNonNegative(snapshot.supportCaseCount) ?? 0;
  }

  return {
    storeId,
    weekCount: weeks.size,
    operatingDays,
    prescriptionCount,
    claimReturnCount,
    claimReturnRatePercent: rate(claimReturnCount, prescriptionCount),
    averageHandlingMinutes: handlingWeight > 0 ? round1(handlingWeightedSum / handlingWeight) : 0,
    closingRemainingTasksPerDay: operatingDays > 0 ? round1(closingRemainingTaskCount / operatingDays) : closingRemainingTaskCount,
    stockoutsPer100Prescriptions: per100(stockoutCount, prescriptionCount),
    followUpOnTimeRatePercent: followUpDueCount > 0 ? rate(followUpOnTimeCount, followUpDueCount, 100) : 100,
    criticalIncidentCount,
    unrecoveredIncidentCount,
    supportCasesPer100Prescriptions: per100(supportCaseCount, prescriptionCount)
  };
}

function snapshotSortKey(snapshot: PilotKpiSnapshotInput): string {
  return `${snapshot.weekStart || ''}_${snapshot.weekEnd || ''}`;
}

function sortedSnapshots(snapshots: PilotKpiSnapshotInput[]): PilotKpiSnapshotInput[] {
  return [...snapshots].sort((a, b) => snapshotSortKey(a).localeCompare(snapshotSortKey(b)));
}

function weekRangeLabel(snapshots: PilotKpiSnapshotInput[]): string {
  if (snapshots.length === 0) return '未記録';
  const sorted = sortedSnapshots(snapshots);
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  return `${first.weekStart || '-'} - ${latest.weekEnd || '-'}`;
}

function compareTrendMetric(input: {
  id: string;
  label: string;
  firstHalfValue: number;
  latestHalfValue: number;
  threshold: number;
  unit: string;
  higherIsBetter?: boolean;
}): PilotKpiTrendMetricComparison {
  const delta = round1(input.latestHalfValue - input.firstHalfValue);
  const direction: PilotKpiTrendDirection = input.higherIsBetter
    ? delta >= input.threshold
      ? 'improving'
      : delta <= -input.threshold
        ? 'worsening'
        : 'stable'
    : delta <= -input.threshold
      ? 'improving'
      : delta >= input.threshold
        ? 'worsening'
        : 'stable';

  return {
    id: input.id,
    label: input.label,
    firstHalfValue: input.firstHalfValue,
    latestHalfValue: input.latestHalfValue,
    delta,
    deltaLabel: signedDelta(delta, input.unit),
    direction
  };
}

function buildStoreTrend(
  storeId: string,
  snapshots: PilotKpiSnapshotInput[],
  minWeekCount: number
): PilotKpiStoreTrend {
  const ordered = sortedSnapshots(snapshots);
  const weekCount = new Set(ordered.map(weekKey)).size;
  if (weekCount < minWeekCount) {
    return {
      storeId,
      weekCount,
      status: 'blocked',
      statusLabel: '4週未満',
      firstWeekLabel: weekRangeLabel(ordered.slice(0, Math.max(1, Math.floor(ordered.length / 2)))),
      latestWeekLabel: weekRangeLabel(ordered.slice(Math.max(0, Math.floor(ordered.length / 2)))),
      comparisons: [],
      worseningMetricLabels: [],
      improvingMetricLabels: [],
      nextAction: `${storeId}の匿名週次KPIをあと${Math.max(0, minWeekCount - weekCount)}週分そろえる`
    };
  }

  const splitIndex = Math.max(1, Math.floor(ordered.length / 2));
  const firstHalfRows = ordered.slice(0, splitIndex);
  const latestHalfRows = ordered.slice(splitIndex);
  const firstHalf = summarizeStore(storeId, firstHalfRows);
  const latestHalf = summarizeStore(storeId, latestHalfRows);
  const comparisons = [
    compareTrendMetric({
      id: 'claim_return_rate',
      label: '返戻率',
      firstHalfValue: firstHalf.claimReturnRatePercent,
      latestHalfValue: latestHalf.claimReturnRatePercent,
      threshold: 0.3,
      unit: 'pt'
    }),
    compareTrendMetric({
      id: 'handling_time',
      label: '平均処理時間',
      firstHalfValue: firstHalf.averageHandlingMinutes,
      latestHalfValue: latestHalf.averageHandlingMinutes,
      threshold: 2,
      unit: '分'
    }),
    compareTrendMetric({
      id: 'remaining_tasks',
      label: '閉店前残タスク',
      firstHalfValue: firstHalf.closingRemainingTasksPerDay,
      latestHalfValue: latestHalf.closingRemainingTasksPerDay,
      threshold: 1,
      unit: '件/日'
    }),
    compareTrendMetric({
      id: 'stockouts',
      label: '欠品',
      firstHalfValue: firstHalf.stockoutsPer100Prescriptions,
      latestHalfValue: latestHalf.stockoutsPer100Prescriptions,
      threshold: 0.5,
      unit: '件/100受付'
    }),
    compareTrendMetric({
      id: 'follow_up',
      label: 'フォロー期限内率',
      firstHalfValue: firstHalf.followUpOnTimeRatePercent,
      latestHalfValue: latestHalf.followUpOnTimeRatePercent,
      threshold: 3,
      unit: 'pt',
      higherIsBetter: true
    }),
    compareTrendMetric({
      id: 'support_cases',
      label: '問い合わせ負荷',
      firstHalfValue: firstHalf.supportCasesPer100Prescriptions,
      latestHalfValue: latestHalf.supportCasesPer100Prescriptions,
      threshold: 1,
      unit: '件/100受付'
    })
  ];
  const worseningMetricLabels = comparisons
    .filter((comparison) => comparison.direction === 'worsening')
    .map((comparison) => comparison.label);
  const improvingMetricLabels = comparisons
    .filter((comparison) => comparison.direction === 'improving')
    .map((comparison) => comparison.label);
  const status: PilotKpiReviewStatus = worseningMetricLabels.length > 0 ? 'attention' : 'pass';
  const statusLabel = status === 'pass'
    ? improvingMetricLabels.length > 0 ? '改善傾向' : '横ばい維持'
    : '後半悪化';
  const nextAction = status === 'pass'
    ? '同じ匿名KPIで次週も継続確認する'
    : `${worseningMetricLabels.join('、')}が後半週で悪化しています。改善アクションの担当、期限、再レビュー日を登録してください。`;

  return {
    storeId,
    weekCount,
    status,
    statusLabel,
    firstWeekLabel: weekRangeLabel(firstHalfRows),
    latestWeekLabel: weekRangeLabel(latestHalfRows),
    comparisons,
    worseningMetricLabels,
    improvingMetricLabels,
    nextAction
  };
}

function buildPilotKpiTrendSummary(
  byStore: Map<string, PilotKpiSnapshotInput[]>,
  minWeekCount: number
): PilotKpiTrendSummary {
  const stores = Array.from(byStore.entries())
    .map(([storeId, rows]) => buildStoreTrend(storeId, rows, minWeekCount))
    .sort((a, b) => a.storeId.localeCompare(b.storeId));
  const insufficientStoreCount = stores.filter((store) => store.status === 'blocked').length;
  const worseningStoreCount = stores.filter((store) => store.status === 'attention').length;
  const improvingStoreCount = stores.filter((store) => store.improvingMetricLabels.length > 0 && store.status === 'pass').length;
  const status: PilotKpiReviewStatus = stores.length === 0 || insufficientStoreCount > 0
    ? 'blocked'
    : worseningStoreCount > 0
      ? 'attention'
      : 'pass';
  const statusLabel = status === 'pass'
    ? improvingStoreCount > 0 ? '4週トレンド改善' : '4週トレンド維持'
    : status === 'attention'
      ? '後半悪化あり'
      : '4週トレンド不足';
  const requiredActions = status === 'pass'
    ? ['後半週で大きな悪化はありません。同じ匿名KPIを正式運用前も継続してください。']
    : stores
      .filter((store) => store.status !== 'pass')
      .map((store) => store.nextAction);

  return {
    status,
    statusLabel,
    storeCount: stores.length,
    worseningStoreCount,
    improvingStoreCount,
    insufficientStoreCount,
    stores,
    requiredActions
  };
}

function makeGate(options: {
  id: string;
  title: string;
  ok: boolean;
  target: string;
  actual: string;
  blocked?: boolean;
  nextAction: string;
}): PilotKpiReviewGate {
  if (options.ok) {
    return {
      id: options.id,
      title: options.title,
      status: 'pass',
      statusLabel: statusLabel('pass'),
      target: options.target,
      actual: options.actual,
      nextAction: '対応不要'
    };
  }
  const status: PilotKpiReviewStatus = options.blocked ? 'blocked' : 'attention';
  return {
    id: options.id,
    title: options.title,
    status,
    statusLabel: statusLabel(status),
    target: options.target,
    actual: options.actual,
    nextAction: options.nextAction
  };
}

function summarizeStatus(gates: PilotKpiReviewGate[]): PilotKpiReviewStatus {
  if (gates.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (gates.some((gate) => gate.status === 'attention')) return 'attention';
  return 'pass';
}

function uniqueActions(gates: PilotKpiReviewGate[]): string[] {
  return Array.from(new Set(
    gates
      .filter((gate) => gate.status !== 'pass')
      .map((gate) => gate.nextAction)
      .filter(Boolean)
  ));
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvLine(values: unknown[]): string {
  return values.map(csvCell).join(',');
}

export function buildPilotKpiReview(input: {
  generatedAt?: Date;
  evidence?: PilotKpiReviewEvidenceInput;
} = {}): PilotKpiReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const targets = mergeTargets(evidence.targets);
  const snapshots = evidence.snapshots ?? [];
  const byStore = new Map<string, PilotKpiSnapshotInput[]>();
  let missingMetricCount = 0;
  const missingMetricSamples: string[] = [];

  snapshots.forEach((snapshot, index) => {
    const storeId = normalizeStoreId(snapshot.storeId, index);
    const missing = missingMetricNames(snapshot);
    if (missing.length > 0) {
      missingMetricCount += missing.length;
      if (missingMetricSamples.length < 8) {
        missingMetricSamples.push(`${storeId}:${missing.join('・')}`);
      }
    }
    const rows = byStore.get(storeId) ?? [];
    rows.push(snapshot);
    byStore.set(storeId, rows);
  });

  const stores = Array.from(byStore.entries())
    .map(([storeId, rows]) => summarizeStore(storeId, rows))
    .sort((a, b) => a.storeId.localeCompare(b.storeId));
  const summary = summarizeStore('all_stores', snapshots);
  const weekCount = new Set(snapshots.map(weekKey)).size;
  const coverage = {
    storeCount: stores.length,
    weekCount,
    snapshotCount: snapshots.length,
    missingMetricCount,
    missingMetricSamples
  };
  const trend = buildPilotKpiTrendSummary(byStore, targets.minWeekCount);
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: String(evidence.pilotId || 'pilot-kpi-review').trim(),
    claimKind: 'pilot_kpi',
    evidence,
    noPatientDataExpected: true,
    realWorldEvidenceRequired: bool(evidence.realPilotEvidenceConfirmed)
  });

  const gates: PilotKpiReviewGate[] = [
    makeGate({
      id: 'privacy',
      title: '患者情報なし・匿名店舗ID',
      ok: bool(evidence.noPatientDataConfirmed) && bool(evidence.anonymizedStoreIdsConfirmed),
      target: '患者名、スタッフ名、薬局名、問い合わせ本文、ローカルパス、URL、トークンを含めない',
      actual: bool(evidence.noPatientDataConfirmed) && bool(evidence.anonymizedStoreIdsConfirmed) ? '確認済み' : '未確認',
      blocked: true,
      nextAction: '患者情報なし、店舗は匿名IDだけのKPI証跡へ作り直す'
    }),
    makeGate({
      id: 'real_pilot_evidence',
      title: '実パイロット証跡',
      ok: bool(evidence.realPilotEvidenceConfirmed),
      target: 'テスト値ではなく、実店舗または実データ相当の匿名週次KPIを使う',
      actual: bool(evidence.realPilotEvidenceConfirmed) ? '実証跡' : '未確認またはテスト値',
      nextAction: '実店舗または実データ相当サンプルの匿名KPIで再レビューする'
    }),
    makeGate({
      id: 'evidence_integrity',
      title: '実証跡の出所と安全性',
      ok: evidenceIntegrity.status === 'pass',
      target: '取得日時、匿名の確認記録ID、元資料SHA-256、患者情報なし確認を揃え、ダミー値を使わない',
      actual: `${evidenceIntegrity.statusLabel} / 指摘${evidenceIntegrity.issues.length}件`,
      blocked: evidenceIntegrity.status === 'blocked',
      nextAction: evidenceIntegrity.requiredActions.join(' / ') || '実証跡の出所情報を確認する'
    }),
    makeGate({
      id: 'coverage',
      title: '店舗数・週数',
      ok: coverage.storeCount >= targets.minStoreCount && coverage.weekCount >= targets.minWeekCount,
      target: `${targets.minStoreCount}店舗以上、${targets.minWeekCount}週以上`,
      actual: `${coverage.storeCount}店舗、${coverage.weekCount}週、${coverage.snapshotCount}件`,
      blocked: true,
      nextAction: '複数店舗で4週間以上の週次KPIを集める'
    }),
    makeGate({
      id: 'four_week_trend',
      title: '4週間の改善傾向',
      ok: trend.status === 'pass',
      target: '各店舗で前半週から後半週に主要KPIが大きく悪化していない',
      actual: `${trend.statusLabel} / 悪化${trend.worseningStoreCount}店舗 / 不足${trend.insufficientStoreCount}店舗`,
      blocked: trend.status === 'blocked',
      nextAction: trend.requiredActions.join(' / ') || '後半週で悪化したKPIを改善アクションへ登録する'
    }),
    makeGate({
      id: 'metric_completeness',
      title: 'KPI項目の欠落',
      ok: missingMetricCount === 0,
      target: '全スナップショットで受付、返戻、時間、残タスク、欠品、フォロー、障害、問い合わせを記録',
      actual: missingMetricCount === 0 ? '欠落なし' : `${missingMetricCount}項目欠落`,
      blocked: true,
      nextAction: '欠落した週次KPIを補記し、患者情報なしで再出力する'
    }),
    makeGate({
      id: 'release_sla_evidence',
      title: '更新・SLA証跡の添付',
      ok: bool(evidence.releasePostReviewAttached) && bool(evidence.slaReviewAttached) && bool(evidence.supportTriageAttached),
      target: 'リリース後レビュー、SLAレビュー、問い合わせトリアージを添付',
      actual: [
        bool(evidence.releasePostReviewAttached) ? 'リリース後あり' : 'リリース後なし',
        bool(evidence.slaReviewAttached) ? 'SLAあり' : 'SLAなし',
        bool(evidence.supportTriageAttached) ? '問い合わせあり' : '問い合わせなし'
      ].join(' / '),
      nextAction: 'P6-05の更新後レビュー、SLAレビュー、問い合わせ診断とひも付ける'
    }),
    makeGate({
      id: 'claim_return_rate',
      title: '返戻率',
      ok: summary.claimReturnRatePercent <= targets.maxClaimReturnRatePercent,
      target: `${targets.maxClaimReturnRatePercent}%以下`,
      actual: `${summary.claimReturnRatePercent}%`,
      nextAction: '返戻原因を分類し、請求前チェックまたは算定ルールへ戻す'
    }),
    makeGate({
      id: 'handling_time',
      title: '平均処理時間',
      ok: summary.averageHandlingMinutes <= targets.maxAverageHandlingMinutes,
      target: `${targets.maxAverageHandlingMinutes}分以下`,
      actual: `${summary.averageHandlingMinutes}分`,
      nextAction: '受付、監査、会計、薬歴の詰まりを店舗別に分けて改善する'
    }),
    makeGate({
      id: 'remaining_tasks',
      title: '閉店前残タスク',
      ok: summary.closingRemainingTasksPerDay <= targets.maxClosingRemainingTasksPerDay,
      target: `1営業日あたり${targets.maxClosingRemainingTasksPerDay}件以下`,
      actual: `${summary.closingRemainingTasksPerDay}件/日`,
      nextAction: '日次締め前の残タスクを担当別に棚卸し、翌日持ち越しを減らす'
    }),
    makeGate({
      id: 'stockouts',
      title: '欠品率',
      ok: summary.stockoutsPer100Prescriptions <= targets.maxStockoutsPer100Prescriptions,
      target: `受付100件あたり${targets.maxStockoutsPer100Prescriptions}件以下`,
      actual: `${summary.stockoutsPer100Prescriptions}件/100受付`,
      nextAction: '欠品の薬品群と発注タイミングを見直す'
    }),
    makeGate({
      id: 'follow_up',
      title: 'フォロー期限内率',
      ok: summary.followUpOnTimeRatePercent >= targets.minFollowUpOnTimeRatePercent,
      target: `${targets.minFollowUpOnTimeRatePercent}%以上`,
      actual: `${summary.followUpOnTimeRatePercent}%`,
      nextAction: '期限超過フォローを翌営業日の優先タスクへ上げる'
    }),
    makeGate({
      id: 'critical_incidents',
      title: '重大障害・未復旧',
      ok: summary.criticalIncidentCount === 0 && summary.unrecoveredIncidentCount === 0,
      target: '重大障害0件、未復旧0件',
      actual: `重大${summary.criticalIncidentCount}件 / 未復旧${summary.unrecoveredIncidentCount}件`,
      blocked: true,
      nextAction: '正式拡大を止め、復旧、原因、再発防止、告知を完了する'
    }),
    makeGate({
      id: 'support_cases',
      title: '問い合わせ負荷',
      ok: summary.supportCasesPer100Prescriptions <= targets.maxSupportCasesPer100Prescriptions,
      target: `受付100件あたり${targets.maxSupportCasesPer100Prescriptions}件以下`,
      actual: `${summary.supportCasesPer100Prescriptions}件/100受付`,
      nextAction: '問い合わせ領域をFAQ、画面文言、導入手順へ戻す'
    }),
    makeGate({
      id: 'improvement_loop',
      title: '改善アクションと責任者レビュー',
      ok: bool(evidence.improvementActionsRegistered) && bool(evidence.ownerReviewCompleted),
      target: '改善アクション登録と責任者レビューを完了',
      actual: [
        bool(evidence.improvementActionsRegistered) ? '改善登録済み' : '改善未登録',
        bool(evidence.ownerReviewCompleted) ? '責任者レビュー済み' : '責任者未確認'
      ].join(' / '),
      nextAction: 'KPI悪化店舗の改善アクション、担当、期限、再レビュー日を登録する'
    })
  ];
  const status = summarizeStatus(gates);

  return {
    type: 'yakureki-pilot-kpi-review',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    pilotId: String(evidence.pilotId || 'pilot-kpi-review').trim(),
    status,
    statusLabel: statusLabel(status),
    targets,
    coverage,
    summary,
    stores,
    evidence: {
      noPatientDataConfirmed: bool(evidence.noPatientDataConfirmed),
      anonymizedStoreIdsConfirmed: bool(evidence.anonymizedStoreIdsConfirmed),
      realPilotEvidenceConfirmed: bool(evidence.realPilotEvidenceConfirmed),
      releasePostReviewAttached: bool(evidence.releasePostReviewAttached),
      slaReviewAttached: bool(evidence.slaReviewAttached),
      supportTriageAttached: bool(evidence.supportTriageAttached),
      improvementActionsRegistered: bool(evidence.improvementActionsRegistered),
      ownerReviewCompleted: bool(evidence.ownerReviewCompleted)
    },
    privacy: PRIVACY_FLAGS,
    evidenceIntegrity,
    trend,
    gates,
    passedGateCount: gates.filter((gate) => gate.status === 'pass').length,
    attentionGateCount: gates.filter((gate) => gate.status === 'attention').length,
    blockedGateCount: gates.filter((gate) => gate.status === 'blocked').length,
    nextActions: uniqueActions(gates)
  };
}

export function buildPilotKpiReviewCsv(review: PilotKpiReview): string {
  const rows = [
    csvLine(['section', 'scope', 'id', 'label', 'status', 'target', 'actual', 'nextAction']),
    csvLine(['summary', 'all', review.pilotId, '判定', review.statusLabel, `${review.targets.minStoreCount}店舗/${review.targets.minWeekCount}週`, `${review.coverage.storeCount}店舗/${review.coverage.weekCount}週`, review.nextActions.join(' / ') || '対応不要']),
    csvLine(['summary', 'all', 'claim_return_rate', '返戻率', review.statusLabel, `${review.targets.maxClaimReturnRatePercent}%以下`, `${review.summary.claimReturnRatePercent}%`, '']),
    csvLine(['summary', 'all', 'handling_time', '平均処理時間', review.statusLabel, `${review.targets.maxAverageHandlingMinutes}分以下`, `${review.summary.averageHandlingMinutes}分`, '']),
    csvLine(['summary', 'all', 'follow_up', 'フォロー期限内率', review.statusLabel, `${review.targets.minFollowUpOnTimeRatePercent}%以上`, `${review.summary.followUpOnTimeRatePercent}%`, '']),
    csvLine(['summary', 'all', 'four_week_trend', '4週間トレンド', review.trend.statusLabel, '後半週で主要KPIが大きく悪化していない', `悪化${review.trend.worseningStoreCount}店舗 / 不足${review.trend.insufficientStoreCount}店舗`, review.trend.requiredActions.join(' / ')])
  ];

  for (const store of review.stores) {
    rows.push(csvLine(['store', store.storeId, 'coverage', '店舗KPI', review.statusLabel, `${review.targets.minWeekCount}週以上`, `${store.weekCount}週/${store.prescriptionCount}受付`, '']));
    rows.push(csvLine(['store', store.storeId, 'return_rate', '返戻率', review.statusLabel, `${review.targets.maxClaimReturnRatePercent}%以下`, `${store.claimReturnRatePercent}%`, '']));
    rows.push(csvLine(['store', store.storeId, 'handling_time', '平均処理時間', review.statusLabel, `${review.targets.maxAverageHandlingMinutes}分以下`, `${store.averageHandlingMinutes}分`, '']));
    rows.push(csvLine(['store', store.storeId, 'follow_up', 'フォロー期限内率', review.statusLabel, `${review.targets.minFollowUpOnTimeRatePercent}%以上`, `${store.followUpOnTimeRatePercent}%`, '']));
  }

  for (const storeTrend of review.trend.stores) {
    rows.push(csvLine([
      'trend',
      storeTrend.storeId,
      'four_week_trend',
      '4週間トレンド',
      storeTrend.statusLabel,
      `前半 ${storeTrend.firstWeekLabel}`,
      `後半 ${storeTrend.latestWeekLabel} / 悪化 ${storeTrend.worseningMetricLabels.join('・') || 'なし'} / 改善 ${storeTrend.improvingMetricLabels.join('・') || 'なし'}`,
      storeTrend.nextAction
    ]));
    for (const comparison of storeTrend.comparisons) {
      rows.push(csvLine([
        'trend_metric',
        storeTrend.storeId,
        comparison.id,
        comparison.label,
        comparison.direction,
        `${comparison.firstHalfValue}`,
        `${comparison.latestHalfValue} / ${comparison.deltaLabel}`,
        storeTrend.status === 'pass' ? '' : storeTrend.nextAction
      ]));
    }
  }

  for (const gate of review.gates) {
    rows.push(csvLine(['gate', 'all', gate.id, gate.title, gate.statusLabel, gate.target, gate.actual, gate.nextAction]));
  }

  return rows.join('\n');
}

export function buildPilotKpiReviewEvidenceTemplate(input: {
  generatedAt?: Date;
  pilotId?: string;
  targets?: Partial<PilotKpiReviewTargets>;
} = {}): PilotKpiReviewEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  const targets = mergeTargets(input.targets);
  return {
    type: 'yakureki-pilot-kpi-review-evidence-template',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    pilotId: input.pilotId || 'pilot-kpi-review',
    guidance: '患者名、スタッフ名、薬局名、問い合わせ本文、告知本文、URL、トークン、ローカルパスは入れず、実運用で取得した匿名店舗IDと週次KPIだけを記録してください。同じ匿名店舗IDで4週間以上そろえると、前半週と後半週のKPI悪化も判定します。取得日時、匿名の確認記録ID、元資料SHA-256が揃わない場合は実証跡として合格しません。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    anonymizedStoreIdsConfirmed: false,
    realPilotEvidenceConfirmed: false,
    releasePostReviewAttached: false,
    slaReviewAttached: false,
    supportTriageAttached: false,
    improvementActionsRegistered: false,
    ownerReviewCompleted: false,
    targets,
    snapshots: [
      {
        storeId: 'store_001',
        weekStart: '2026-06-01',
        weekEnd: '2026-06-07',
        operatingDays: 6,
        prescriptionCount: 600,
        claimReturnCount: 2,
        averageHandlingMinutes: 16,
        closingRemainingTaskCount: 6,
        stockoutCount: 3,
        followUpDueCount: 40,
        followUpOnTimeCount: 39,
        criticalIncidentCount: 0,
        unrecoveredIncidentCount: 0,
        supportCaseCount: 5
      }
    ],
    privacy: PRIVACY_FLAGS
  };
}

function evidenceRequestItem(options: PilotKpiEvidenceRequestItem): PilotKpiEvidenceRequestItem {
  return options;
}

export function buildPilotKpiEvidenceRequest(input: {
  generatedAt?: Date;
  pilotId?: string;
  targets?: Partial<PilotKpiReviewTargets>;
} = {}): PilotKpiEvidenceRequest {
  const generatedAt = input.generatedAt ?? new Date();
  const targets = mergeTargets(input.targets);
  return {
    type: 'yakureki-pilot-kpi-evidence-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    pilotId: input.pilotId || 'pilot-kpi-review',
    guidance: '複数店舗で4週間以上、同じ匿名店舗IDを使って週次KPIを提出してください。患者名、店舗名、スタッフ名、問い合わせ本文、URL、トークン、ローカルパスは共有成果物に入れません。',
    targets,
    items: [
      evidenceRequestItem({
        id: 'weekly_kpi_snapshots',
        title: '匿名週次KPI',
        required: true,
        cadence: `${targets.minStoreCount}店舗以上、${targets.minWeekCount}週以上`,
        neededFields: [
          '匿名店舗ID',
          '週開始日',
          '週終了日',
          '営業日数',
          '受付件数',
          '返戻件数',
          '平均処理時間',
          '閉店前残タスク件数',
          '欠品件数',
          'フォロー期限件数',
          'フォロー期限内件数',
          '重大障害件数',
          '未復旧障害件数',
          '問い合わせ件数'
        ],
        purpose: '返戻率、処理時間、残タスク、欠品、フォロー期限内率、問い合わせ負荷と4週間トレンドを確認する',
        storeOnly: '店舗名、患者名、患者ID、スタッフ名、問い合わせ本文は店舗内だけで扱う',
        supportShare: '匿名店舗ID、週、件数、率、トレンド判定だけを共有する'
      }),
      evidenceRequestItem({
        id: 'release_post_review',
        title: 'リリース後レビュー',
        required: true,
        cadence: '各更新後に1回以上',
        neededFields: ['同じ更新ID', '更新後確認', '問い合わせ件数', 'エラー件数', '停止時間', '残対応'],
        purpose: 'KPI悪化が更新後の問題とつながっていないか確認する',
        storeOnly: '告知本文、問い合わせ本文、個別端末名は店舗内だけで扱う',
        supportShare: '件数、停止時間、同じ更新ID、残対応有無だけを共有する'
      }),
      evidenceRequestItem({
        id: 'sla_review',
        title: 'SLA・障害対応レビュー',
        required: true,
        cadence: '重大障害または更新失敗訓練ごと',
        neededFields: ['受付目標', '初回告知', '続報間隔', '復旧目標', '回避策', '再発防止'],
        purpose: '重大障害が運用拡大の妨げにならない対応速度で扱えているか確認する',
        storeOnly: '問い合わせ本文、告知本文、担当者名は店舗内だけで扱う',
        supportShare: '目標達成有無、停止時間、回避策有無、残対応だけを共有する'
      }),
      evidenceRequestItem({
        id: 'support_triage',
        title: 'サポートトリアージ',
        required: true,
        cadence: '週次または問い合わせ発生時',
        neededFields: ['確認領域', '優先度', '再現手順', '次対応', '個人情報なし確認'],
        purpose: 'KPI悪化時に薬局とサポートが同じ確認領域を見られるか確認する',
        storeOnly: '患者情報、問い合わせ本文、ローカルパスは店舗内だけで扱う',
        supportShare: '確認領域、優先度、再現手順、次対応だけを共有する'
      }),
      evidenceRequestItem({
        id: 'improvement_actions',
        title: '改善アクション',
        required: true,
        cadence: 'KPIが悪化した週ごと',
        neededFields: ['対象KPI', '改善内容', '担当ロール', '期限', '実行後確認'],
        purpose: '悪化を検知するだけでなく、改善と再測定まで運用へ載せる',
        storeOnly: '担当者名や個別患者の詳細は店舗内だけで扱う',
        supportShare: '対象KPI、改善内容、期限、実行後確認有無だけを共有する'
      }),
      evidenceRequestItem({
        id: 'owner_review',
        title: '責任者レビュー',
        required: true,
        cadence: '4週間判定時',
        neededFields: ['匿名確認ID', '取得日時', '元資料SHA-256', '患者情報なし確認', '正式運用候補判断'],
        purpose: '4週間KPIを正式運用候補として扱ってよいか責任者が確認する',
        storeOnly: '責任者名、原本ファイル名、ローカルパスは店舗内だけで扱う',
        supportShare: '匿名確認ID、取得日時、元資料SHA-256、患者情報なし確認、判断結果だけを共有する'
      })
    ],
    operatorChecks: [
      '同じ匿名店舗IDで4週間以上そろっている',
      '匿名店舗IDと実店舗名の対応表は店舗内だけで管理している',
      '患者情報、店舗名、スタッフ名、問い合わせ本文を共有成果物へ入れていない',
      'KPIが悪化した週は改善アクションと実行後確認を残している',
      '取得日時、匿名確認ID、元資料SHA-256、患者情報なし確認が揃っている'
    ],
    privacyRules: [
      '患者名、患者ID、生年月日、問い合わせ本文を入れない',
      '店舗名、スタッフ名、責任者名を入れない',
      'URL、トークン、ローカルパス、原本ファイル名を入れない',
      'ダミー、モック、練習用データを実パイロットKPIとして扱わない'
    ],
    commandEnvironment: {
      evidenceJson: 'YAKUREKI_PILOT_KPI_EVIDENCE',
      outputDir: 'YAKUREKI_PILOT_KPI_OUTPUT_DIR',
      pilotId: 'YAKUREKI_PILOT_ID'
    }
  };
}

export function buildPilotKpiEvidenceRequestChecklist(request: PilotKpiEvidenceRequest): string {
  return [
    `パイロットKPI提出依頼 ${request.pilotId}`,
    '目的: 複数店舗で4週間以上、返戻、処理時間、残タスク、欠品、フォロー、問い合わせ負荷が悪化していないか確認する',
    '',
    '提出してほしいもの:',
    ...request.items.map((item) => [
      `- ${item.title}: ${item.required ? '必須' : '任意'} / ${item.cadence}`,
      `  必要な項目: ${item.neededFields.join('、')}`,
      `  目的: ${item.purpose}`,
      `  店舗内だけで扱うもの: ${item.storeOnly}`,
      `  共有成果物に残すもの: ${item.supportShare}`
    ].join('\n')),
    '',
    '担当者確認:',
    ...request.operatorChecks.map((check) => `- ${check}`),
    '',
    '共有時のルール:',
    ...request.privacyRules.map((rule) => `- ${rule}`),
    '',
    'CLI入力環境変数:',
    `- KPI証跡JSON: ${request.commandEnvironment.evidenceJson}`,
    `- 出力先: ${request.commandEnvironment.outputDir}`,
    `- パイロットID: ${request.commandEnvironment.pilotId}`
  ].join('\n');
}

export function buildPilotKpiReviewChecklist(review: PilotKpiReview): string {
  const lines = [
    `パイロットKPIレビュー: ${review.statusLabel}`,
    `対象: ${review.pilotId}`,
    `範囲: ${review.coverage.storeCount}店舗 / ${review.coverage.weekCount}週 / ${review.coverage.snapshotCount}件`,
    '',
    '見るKPI:',
    `- 返戻率: ${review.summary.claimReturnRatePercent}% (${review.targets.maxClaimReturnRatePercent}%以下)`,
    `- 平均処理時間: ${review.summary.averageHandlingMinutes}分 (${review.targets.maxAverageHandlingMinutes}分以下)`,
    `- 閉店前残タスク: ${review.summary.closingRemainingTasksPerDay}件/日 (${review.targets.maxClosingRemainingTasksPerDay}件/日以下)`,
    `- 欠品: ${review.summary.stockoutsPer100Prescriptions}件/100受付 (${review.targets.maxStockoutsPer100Prescriptions}件以下)`,
    `- フォロー期限内率: ${review.summary.followUpOnTimeRatePercent}% (${review.targets.minFollowUpOnTimeRatePercent}%以上)`,
    `- 重大障害: ${review.summary.criticalIncidentCount}件 / 未復旧: ${review.summary.unrecoveredIncidentCount}件`,
    `- 4週間トレンド: ${review.trend.statusLabel} (悪化 ${review.trend.worseningStoreCount}店舗 / 不足 ${review.trend.insufficientStoreCount}店舗)`,
    '',
    '店舗別トレンド:',
    ...(review.trend.stores.length > 0
      ? review.trend.stores.map((store) => `- ${store.storeId}: ${store.statusLabel} / 悪化 ${store.worseningMetricLabels.join('、') || 'なし'} / 改善 ${store.improvingMetricLabels.join('、') || 'なし'}`)
      : ['- 未記録']),
    '',
    '次の対応:',
    ...(review.nextActions.length > 0 ? review.nextActions.map((action) => `- ${action}`) : ['- 対応不要'])
  ];
  return lines.join('\n');
}

export function buildPilotKpiReviewAuditDetail(review: PilotKpiReview): string {
  const nextActionText = review.nextActions.length > 0 ? ` / 次対応: ${review.nextActions.join('、')}` : '';
  return `パイロットKPIレビュー: ${review.statusLabel} / ${review.coverage.storeCount}店舗 ${review.coverage.weekCount}週 / 返戻率 ${review.summary.claimReturnRatePercent}% / 平均処理 ${review.summary.averageHandlingMinutes}分 / フォロー期限内 ${review.summary.followUpOnTimeRatePercent}% / 4週トレンド ${review.trend.statusLabel}${nextActionText}`;
}
