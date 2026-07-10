import type { SupportCaseFocusArea, SupportCaseTriage } from './support_case_triage.ts';
import { buildEvidenceIntegrityReview, type EvidenceIntegrityReview } from './evidence_integrity.ts';

export type SupportCaseDrillStatus = 'pass' | 'attention' | 'blocked';

export interface SupportCaseDrillEvidenceInput {
  scenarioId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  runAt?: string;
  memoShared?: boolean;
  diagnosticAttached?: boolean;
  noPatientDataConfirmed?: boolean;
  responseStartedAt?: string;
  responseClosedAt?: string;
  responseTargetMinutes?: number;
  participantsRecordedOutsideJson?: boolean;
  escalationRecorded?: boolean;
  pharmacyConfirmedFocusAreaIds?: string[];
  supportConfirmedFocusAreaIds?: string[];
  reproducedFocusAreaIds?: string[];
}

export interface SupportCaseDrillFocusAreaReview {
  id: string;
  title: string;
  priority: SupportCaseFocusArea['priority'];
  status: SupportCaseDrillStatus;
  statusLabel: string;
  supportOwner: SupportCaseFocusArea['supportOwner'];
  pharmacyConfirmed: boolean;
  supportConfirmed: boolean;
  reproduced: boolean;
  reproduceStepCount: number;
  nextAction: string;
}

export interface SupportCaseDrillReview {
  type: 'yakureki-support-case-drill-review';
  schemaVersion: 2;
  generatedAt: string;
  scenarioId: string;
  triageGeneratedAt: string;
  status: SupportCaseDrillStatus;
  statusLabel: string;
  priority: SupportCaseTriage['priority'];
  priorityLabel: string;
  focusAreaCount: number;
  passedFocusAreaCount: number;
  attentionFocusAreaCount: number;
  blockedFocusAreaCount: number;
  memoShared: boolean;
  diagnosticAttached: boolean;
  noPatientDataConfirmed: boolean;
  participantsRecordedOutsideJson: boolean;
  escalationRecorded: boolean;
  responseTargetMinutes: number;
  responseMinutes?: number;
  responseStartedWithinTarget?: boolean;
  evidence: {
    capturedAt: string;
    operatorReviewId: string;
    sourceArtifactSha256: string;
    noPatientDataConfirmed: boolean;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
    containsRawNotes: false;
  };
  focusAreas: SupportCaseDrillFocusAreaReview[];
}

export interface SupportCaseDrillEvidenceTemplate {
  type: 'yakureki-support-case-drill-evidence-template';
  schemaVersion: 2;
  generatedAt: string;
  scenarioId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  memoShared: false;
  diagnosticAttached: false;
  noPatientDataConfirmed: false;
  participantsRecordedOutsideJson: false;
  escalationRecorded: false;
  responseTargetMinutes: number;
  pharmacyConfirmedFocusAreaIds: string[];
  supportConfirmedFocusAreaIds: string[];
  reproducedFocusAreaIds: string[];
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
    containsRawNotes: false;
  };
  focusAreas: {
    id: string;
    title: string;
    supportOwner: SupportCaseFocusArea['supportOwner'];
    reproduceStepCount: number;
  }[];
}

function statusLabel(status: SupportCaseDrillStatus): string {
  if (status === 'pass') return '訓練OK';
  if (status === 'attention') return '訓練を確認';
  return '訓練未完了';
}

function normalizeIdSet(ids: string[] | undefined): Set<string> {
  return new Set((ids ?? []).map((id) => String(id).trim()).filter(Boolean));
}

function finitePositive(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function elapsedMinutes(start: string | undefined, end: string | undefined): number | undefined {
  const startTime = Date.parse(start || '');
  const endTime = Date.parse(end || '');
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return undefined;
  }
  return Math.round(((endTime - startTime) / 60_000) * 10) / 10;
}

function focusAreaStatus(options: {
  area: SupportCaseFocusArea;
  pharmacyConfirmed: boolean;
  supportConfirmed: boolean;
  reproduced: boolean;
}): SupportCaseDrillStatus {
  const requiresPharmacy = options.area.supportOwner === 'pharmacy' || options.area.supportOwner === 'joint';
  const requiresSupport = options.area.supportOwner === 'support' || options.area.supportOwner === 'joint';
  if (requiresPharmacy && !options.pharmacyConfirmed) return 'blocked';
  if (requiresSupport && !options.supportConfirmed) return 'blocked';
  if (!options.reproduced) return 'blocked';
  return 'pass';
}

function focusAreaNextAction(area: SupportCaseFocusArea, status: SupportCaseDrillStatus, options: {
  pharmacyConfirmed: boolean;
  supportConfirmed: boolean;
  reproduced: boolean;
}): string {
  if (status === 'pass') return '対応不要';
  const actions: string[] = [];
  if ((area.supportOwner === 'pharmacy' || area.supportOwner === 'joint') && !options.pharmacyConfirmed) {
    actions.push('薬局側で再現メモの確認を記録する');
  }
  if ((area.supportOwner === 'support' || area.supportOwner === 'joint') && !options.supportConfirmed) {
    actions.push('サポート側で再現メモの確認を記録する');
  }
  if (!options.reproduced) {
    actions.push('再現手順を実行し、同じ画面または判定へ到達するか確認する');
  }
  return actions.join(' / ');
}

function summarizeReviewStatus(options: {
  focusAreas: SupportCaseDrillFocusAreaReview[];
  memoShared: boolean;
  diagnosticAttached: boolean;
  noPatientDataConfirmed: boolean;
  participantsRecordedOutsideJson: boolean;
  escalationRecorded: boolean;
  highPriority: boolean;
  responseStartedWithinTarget?: boolean;
  evidenceIntegrityStatus: SupportCaseDrillStatus;
}): SupportCaseDrillStatus {
  if (options.evidenceIntegrityStatus === 'blocked') return 'blocked';
  if (
    !options.memoShared
    || !options.diagnosticAttached
    || !options.noPatientDataConfirmed
    || options.focusAreas.some((area) => area.status === 'blocked')
  ) {
    return 'blocked';
  }
  if (
    !options.participantsRecordedOutsideJson
    || options.evidenceIntegrityStatus === 'attention'
    || (options.highPriority && !options.escalationRecorded)
    || options.responseStartedWithinTarget === false
  ) {
    return 'attention';
  }
  return 'pass';
}

export function buildSupportCaseDrillReview(input: {
  generatedAt?: Date;
  triage: SupportCaseTriage;
  evidence?: SupportCaseDrillEvidenceInput;
}): SupportCaseDrillReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const scenarioId = String(evidence.scenarioId || 'support-case-drill').trim();
  const pharmacyConfirmed = normalizeIdSet(evidence.pharmacyConfirmedFocusAreaIds);
  const supportConfirmed = normalizeIdSet(evidence.supportConfirmedFocusAreaIds);
  const reproduced = normalizeIdSet(evidence.reproducedFocusAreaIds);
  const responseTargetMinutes = finitePositive(evidence.responseTargetMinutes) ?? 30;
  const responseMinutes = elapsedMinutes(evidence.responseStartedAt, evidence.responseClosedAt);
  const responseStartedWithinTarget = responseMinutes === undefined ? undefined : responseMinutes <= responseTargetMinutes;
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: String(evidence.scenarioId || evidence.operatorReviewId || 'support-case-drill').trim(),
    claimKind: 'support_case_drill',
    evidence: {
      scenarioId,
      capturedAt: evidence.capturedAt,
      operatorReviewId: evidence.operatorReviewId,
      sourceArtifactSha256: evidence.sourceArtifactSha256,
      noPatientDataConfirmed: evidence.noPatientDataConfirmed === true,
      evidenceKind: 'actual support case drill review',
      priority: input.triage.priority,
      runAt: evidence.runAt,
      responseStartedAt: evidence.responseStartedAt,
      responseClosedAt: evidence.responseClosedAt,
      memoShared: evidence.memoShared === true,
      diagnosticAttached: evidence.diagnosticAttached === true,
      participantsRecordedOutsideJson: evidence.participantsRecordedOutsideJson === true,
      escalationRecorded: evidence.escalationRecorded === true,
      pharmacyConfirmedFocusAreaCount: normalizeIdSet(evidence.pharmacyConfirmedFocusAreaIds).size,
      supportConfirmedFocusAreaCount: normalizeIdSet(evidence.supportConfirmedFocusAreaIds).size,
      reproducedFocusAreaCount: normalizeIdSet(evidence.reproducedFocusAreaIds).size
    },
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });

  const focusAreas = input.triage.focusAreas.map((area): SupportCaseDrillFocusAreaReview => {
    const areaReview = {
      pharmacyConfirmed: pharmacyConfirmed.has(area.id),
      supportConfirmed: supportConfirmed.has(area.id),
      reproduced: reproduced.has(area.id)
    };
    const status = focusAreaStatus({ area, ...areaReview });
    return {
      id: area.id,
      title: area.title,
      priority: area.priority,
      status,
      statusLabel: statusLabel(status),
      supportOwner: area.supportOwner,
      ...areaReview,
      reproduceStepCount: area.reproduceSteps.length,
      nextAction: focusAreaNextAction(area, status, areaReview)
    };
  });
  const highPriority = input.triage.priority === 'urgent' || input.triage.priority === 'high';
  const status = summarizeReviewStatus({
    focusAreas,
    memoShared: evidence.memoShared === true,
    diagnosticAttached: evidence.diagnosticAttached === true,
    noPatientDataConfirmed: evidence.noPatientDataConfirmed === true,
    participantsRecordedOutsideJson: evidence.participantsRecordedOutsideJson === true,
    escalationRecorded: evidence.escalationRecorded === true,
    highPriority,
    responseStartedWithinTarget,
    evidenceIntegrityStatus: evidenceIntegrity.status
  });

  return {
    type: 'yakureki-support-case-drill-review',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    scenarioId,
    triageGeneratedAt: input.triage.generatedAt,
    status,
    statusLabel: statusLabel(status),
    priority: input.triage.priority,
    priorityLabel: input.triage.priorityLabel,
    focusAreaCount: focusAreas.length,
    passedFocusAreaCount: focusAreas.filter((area) => area.status === 'pass').length,
    attentionFocusAreaCount: focusAreas.filter((area) => area.status === 'attention').length,
    blockedFocusAreaCount: focusAreas.filter((area) => area.status === 'blocked').length,
    memoShared: evidence.memoShared === true,
    diagnosticAttached: evidence.diagnosticAttached === true,
    noPatientDataConfirmed: evidence.noPatientDataConfirmed === true,
    participantsRecordedOutsideJson: evidence.participantsRecordedOutsideJson === true,
    escalationRecorded: evidence.escalationRecorded === true,
    responseTargetMinutes,
    responseMinutes,
    responseStartedWithinTarget,
    evidence: {
      capturedAt: String(evidence.capturedAt || '').trim(),
      operatorReviewId: String(evidence.operatorReviewId || '').trim(),
      sourceArtifactSha256: String(evidence.sourceArtifactSha256 || '').trim(),
      noPatientDataConfirmed: evidence.noPatientDataConfirmed === true
    },
    evidenceIntegrity,
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false,
      containsRawNotes: false
    },
    focusAreas
  };
}

export function buildSupportCaseDrillEvidenceTemplate(input: {
  generatedAt?: Date;
  triage: SupportCaseTriage;
  scenarioId?: string;
  responseTargetMinutes?: number;
}): SupportCaseDrillEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-support-case-drill-evidence-template',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    scenarioId: input.scenarioId || 'support-case-drill',
    guidance: '確認者名、患者名、薬局名、URL、トークン、ローカルパス、自由記述メモはこのJSONに書かず、院内または社内の別記録へ残す',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    memoShared: false,
    diagnosticAttached: false,
    noPatientDataConfirmed: false,
    participantsRecordedOutsideJson: false,
    escalationRecorded: false,
    responseTargetMinutes: finitePositive(input.responseTargetMinutes) ?? 30,
    pharmacyConfirmedFocusAreaIds: [],
    supportConfirmedFocusAreaIds: [],
    reproducedFocusAreaIds: [],
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false,
      containsRawNotes: false
    },
    focusAreas: input.triage.focusAreas.map((area) => ({
      id: area.id,
      title: area.title,
      supportOwner: area.supportOwner,
      reproduceStepCount: area.reproduceSteps.length
    }))
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function yesNo(value: boolean | undefined): string {
  if (value === undefined) return '未記録';
  return value ? 'OK' : '要確認';
}

export function buildSupportCaseDrillCsv(review: SupportCaseDrillReview): string {
  const rows = [
    ['区分', '判定', '対象', '薬局確認', 'サポート確認', '再現', '信号', '次の対応'],
    [
      '総括',
      review.statusLabel,
      `${review.focusAreaCount}領域中OK ${review.passedFocusAreaCount}領域`,
      yesNo(review.memoShared),
      yesNo(review.diagnosticAttached),
      yesNo(review.noPatientDataConfirmed),
      `応答 ${review.responseMinutes ?? '未記録'}分 / 目標 ${review.responseTargetMinutes}分`,
      review.status === 'pass' ? '対応不要' : '未完了または要確認の再現手順を確認する'
    ],
    [
      '証跡品質',
      review.evidenceIntegrity.statusLabel,
      '出所・患者情報なし・ダミー混入',
      yesNo(review.evidence.noPatientDataConfirmed),
      '',
      '',
      `指摘 ${review.evidenceIntegrity.issues.length}件`,
      review.evidenceIntegrity.requiredActions.join(' / ') || '対応不要'
    ],
    ...review.focusAreas.map((area) => [
      '確認領域',
      area.statusLabel,
      area.title,
      yesNo(area.pharmacyConfirmed),
      yesNo(area.supportConfirmed),
      yesNo(area.reproduced),
      `${area.reproduceStepCount}手順`,
      area.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildSupportCaseDrillAuditDetail(review: SupportCaseDrillReview): string {
  return [
    `問い合わせ訓練 ${review.statusLabel}`,
    `優先度 ${review.priorityLabel}`,
    `確認領域 ${review.passedFocusAreaCount}/${review.focusAreaCount}`,
    `再現未完了 ${review.blockedFocusAreaCount}件`,
    `個人情報なし ${review.noPatientDataConfirmed ? '確認済み' : '未確認'}`,
    `証跡品質 ${review.evidenceIntegrity.statusLabel}`,
    `応答 ${review.responseMinutes ?? '未記録'}分`
  ].join(' / ');
}
