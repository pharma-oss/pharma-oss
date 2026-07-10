import type { ExternalConnectorReadinessReport } from './external_connector_readiness.ts';
import type { OnlineEligibilityResponseDiffReport } from './online_eligibility_response_diff.ts';
import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';

export type OnlineEligibilityFieldGateStatus = 'pass' | 'attention' | 'blocked';

export interface OnlineEligibilityAuthEvidenceInput {
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  officialProcedureConfirmed?: boolean;
  authenticationMethodRecorded?: boolean;
  credentialStorageConfirmed?: boolean;
  operationalOwnerAssigned?: boolean;
}

export interface OnlineEligibilityAuthEvidenceTemplate {
  type: 'yakureki-online-eligibility-field-evidence-template';
  schemaVersion: 1;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataConfirmed: false;
  officialProcedureConfirmed: false;
  authenticationMethodRecorded: false;
  credentialStorageConfirmed: false;
  operationalOwnerAssigned: false;
}

export interface BuildOnlineEligibilityFieldReadinessInput {
  generatedAt?: Date;
  connectorReadiness: ExternalConnectorReadinessReport;
  responseDiff: OnlineEligibilityResponseDiffReport;
  authEvidence?: OnlineEligibilityAuthEvidenceInput;
}

export interface OnlineEligibilityFieldReadinessGate {
  id:
    | 'official_auth_procedure'
    | 'myna_device_success'
    | 'online_eligibility_success'
    | 'official_response_sample'
    | 'privacy_safety'
    | 'evidence_integrity';
  status: OnlineEligibilityFieldGateStatus;
  statusLabel: string;
  title: string;
  evidence: string[];
  nextAction: string;
}

export interface OnlineEligibilityFieldReadinessReport {
  type: 'yakureki-online-eligibility-field-readiness';
  schemaVersion: 2;
  generatedAt: string;
  status: OnlineEligibilityFieldGateStatus;
  statusLabel: string;
  gateCount: number;
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  canRunFieldSuccessTrial: boolean;
  canAcceptOfficialResponseSample: boolean;
  privacy: {
    containsPatientData: false;
    containsEndpointUrl: false;
    containsBearerToken: false;
    containsRequestBody: false;
    containsResponseBody: false;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  gates: OnlineEligibilityFieldReadinessGate[];
}

const STATUS_LABELS: Record<OnlineEligibilityFieldGateStatus, string> = {
  pass: 'OK',
  attention: '要確認',
  blocked: '未完了'
};

function gateStatusLabel(status: OnlineEligibilityFieldGateStatus): string {
  return STATUS_LABELS[status];
}

function findConnector(
  report: ExternalConnectorReadinessReport,
  id: ExternalConnectorReadinessReport['checks'][number]['id']
) {
  return report.checks.find((check) => check.id === id);
}

function buildAuthGate(auth: OnlineEligibilityAuthEvidenceInput = {}): OnlineEligibilityFieldReadinessGate {
  const missingActions: string[] = [];
  const evidence: string[] = [];
  if (auth.officialProcedureConfirmed) {
    evidence.push('公式手順の確認済みフラグあり');
  } else {
    missingActions.push('公式手順の確認結果を記録する');
  }
  if (auth.authenticationMethodRecorded) {
    evidence.push('認証方式の記録済みフラグあり');
  } else {
    missingActions.push('認証方式を秘密情報なしで記録する');
  }
  if (auth.credentialStorageConfirmed) {
    evidence.push('認証情報の保管方式確認済みフラグあり');
  } else {
    missingActions.push('認証情報の保管場所と更新担当を確認する');
  }
  if (auth.operationalOwnerAssigned) {
    evidence.push('運用担当の割当済みフラグあり');
  } else {
    missingActions.push('現地試験の責任者を割り当てる');
  }

  const status = missingActions.length === 0 ? 'pass' : auth.officialProcedureConfirmed ? 'attention' : 'blocked';
  return {
    id: 'official_auth_procedure',
    status,
    statusLabel: gateStatusLabel(status),
    title: '公式認証方式を秘密情報なしで確認する',
    evidence,
    nextAction: missingActions.length > 0 ? missingActions.join(' / ') : '対応不要'
  };
}

function buildConnectorGate(
  report: ExternalConnectorReadinessReport,
  id: 'myna_card_reader' | 'online_eligibility',
  title: string
): OnlineEligibilityFieldReadinessGate {
  const check = findConnector(report, id);
  if (!check) {
    return {
      id: id === 'myna_card_reader' ? 'myna_device_success' : 'online_eligibility_success',
      status: 'blocked',
      statusLabel: gateStatusLabel('blocked'),
      title,
      evidence: [],
      nextAction: '接続診断に対象コネクタを含める'
    };
  }

  const attempt = check.lastAttempt;
  const hasSuccessfulJsonAttempt = check.status === 'ready'
    && attempt.outcome === 'success'
    && attempt.responseShape === 'json_object';
  const status: OnlineEligibilityFieldGateStatus = hasSuccessfulJsonAttempt
    ? 'pass'
    : check.status === 'blocked'
      ? 'blocked'
      : 'attention';
  const nextAction = hasSuccessfulJsonAttempt
    ? '対応不要'
    : check.requiredActions.length > 0
      ? check.requiredActions.join(' / ')
      : '現地機器で接続試行を成功させる';

  return {
    id: id === 'myna_card_reader' ? 'myna_device_success' : 'online_eligibility_success',
    status,
    statusLabel: gateStatusLabel(status),
    title,
    evidence: [
      `接続状態: ${check.statusLabel}`,
      `直近試行: ${attempt.outcomeLabel}`,
      `応答形状: ${attempt.responseShape}`
    ],
    nextAction
  };
}

function buildResponseSampleGate(diff: OnlineEligibilityResponseDiffReport): OnlineEligibilityFieldReadinessGate {
  let status: OnlineEligibilityFieldGateStatus = 'pass';
  let nextAction = '対応不要';
  if (diff.privacyIssueCount > 0 || diff.status === 'fail') {
    status = 'blocked';
    nextAction = '個人情報なしサンプルの差分と登録ルールを直す';
  } else if (diff.status === 'empty') {
    status = 'attention';
    nextAction = '公式実レスポンスの個人情報なしサンプルを1件以上投入する';
  }

  return {
    id: 'official_response_sample',
    status,
    statusLabel: gateStatusLabel(status),
    title: '公式実レスポンスの差分テストを通す',
    evidence: [
      `サンプル: ${diff.sampleCount}件`,
      `不一致: ${diff.failedSampleCount}件`,
      `個人情報チェック: ${diff.privacyIssueCount}件`
    ],
    nextAction
  };
}

function buildPrivacyGate(
  connectorReadiness: ExternalConnectorReadinessReport,
  responseDiff: OnlineEligibilityResponseDiffReport
): OnlineEligibilityFieldReadinessGate {
  const status = responseDiff.privacyIssueCount > 0 ? 'blocked' : 'pass';
  return {
    id: 'privacy_safety',
    status,
    statusLabel: gateStatusLabel(status),
    title: '患者情報・URL・認証情報を診断に出さない',
    evidence: [
      `URL含有: ${connectorReadiness.privacy.containsEndpointUrl ? 'あり' : 'なし'}`,
      `Bearerトークン含有: ${connectorReadiness.privacy.containsBearerToken ? 'あり' : 'なし'}`,
      `サンプル個人情報チェック: ${responseDiff.privacyIssueCount}件`
    ],
    nextAction: status === 'pass' ? '対応不要' : '個人情報を含むサンプルを登録対象から外す'
  };
}

function buildEvidenceIntegrityGate(
  review: EvidenceIntegrityReview
): OnlineEligibilityFieldReadinessGate {
  return {
    id: 'evidence_integrity',
    status: review.status,
    statusLabel: gateStatusLabel(review.status),
    title: '現地試験証跡の出所と安全性を確認する',
    evidence: [
      `証跡品質: ${review.statusLabel}`,
      `指摘: ${review.issues.length}件`
    ],
    nextAction: review.requiredActions.join(' / ') || '対応不要'
  };
}

function summarizeStatus(gates: OnlineEligibilityFieldReadinessGate[]): OnlineEligibilityFieldGateStatus {
  if (gates.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (gates.some((gate) => gate.status === 'attention')) return 'attention';
  return 'pass';
}

export function buildOnlineEligibilityFieldReadinessReport(
  input: BuildOnlineEligibilityFieldReadinessInput
): OnlineEligibilityFieldReadinessReport {
  const generatedAt = input.generatedAt ?? new Date();
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: input.authEvidence?.operatorReviewId || 'online-eligibility-field-readiness',
    claimKind: 'online_eligibility_field',
    evidence: input.authEvidence ?? {},
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });
  const gates = [
    buildAuthGate(input.authEvidence),
    buildConnectorGate(input.connectorReadiness, 'myna_card_reader', 'マイナ読取を現地機器で成功させる'),
    buildConnectorGate(input.connectorReadiness, 'online_eligibility', 'オンライン資格確認を現地接続で成功させる'),
    buildResponseSampleGate(input.responseDiff),
    buildPrivacyGate(input.connectorReadiness, input.responseDiff),
    buildEvidenceIntegrityGate(evidenceIntegrity)
  ];
  const status = summarizeStatus(gates);
  const passedGateCount = gates.filter((gate) => gate.status === 'pass').length;
  const attentionGateCount = gates.filter((gate) => gate.status === 'attention').length;
  const blockedGateCount = gates.filter((gate) => gate.status === 'blocked').length;

  return {
    type: 'yakureki-online-eligibility-field-readiness',
    schemaVersion: 2,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: status === 'pass' ? '現地試験OK' : status === 'attention' ? '現地試験前に確認' : '現地試験前に未完了',
    gateCount: gates.length,
    passedGateCount,
    attentionGateCount,
    blockedGateCount,
    canRunFieldSuccessTrial: gates
      .filter((gate) => !['official_response_sample', 'evidence_integrity'].includes(gate.id))
      .every((gate) => gate.status === 'pass'),
    canAcceptOfficialResponseSample: input.responseDiff.privacyIssueCount === 0
      && input.connectorReadiness.overallStatus !== 'blocked'
      && evidenceIntegrity.status !== 'blocked',
    privacy: {
      containsPatientData: false,
      containsEndpointUrl: false,
      containsBearerToken: false,
      containsRequestBody: false,
      containsResponseBody: false
    },
    evidenceIntegrity,
    gates
  };
}

export function buildOnlineEligibilityAuthEvidenceTemplate(): OnlineEligibilityAuthEvidenceTemplate {
  return {
    type: 'yakureki-online-eligibility-field-evidence-template',
    schemaVersion: 1,
    guidance: '患者情報、接続先URL、認証情報、リクエスト・レスポンス本文は記録しないでください。実作業の確認日時、匿名の確認記録ID、元資料SHA-256、患者情報なし確認が揃わない限り現物証跡として合格しません。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    officialProcedureConfirmed: false,
    authenticationMethodRecorded: false,
    credentialStorageConfirmed: false,
    operationalOwnerAssigned: false
  };
}

export interface OnlineEligibilityFieldCheckRequestItem {
  id: string;
  title: string;
  required: boolean;
  neededFields: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface OnlineEligibilityFieldCheckRequest {
  type: 'yakureki-online-eligibility-field-check-request';
  schemaVersion: 1;
  generatedAt: string;
  guidance: string;
  items: OnlineEligibilityFieldCheckRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    connectorReadinessJson: 'YAKUREKI_ELIGIBILITY_CONNECTOR_READINESS';
    responseDiffJson: 'YAKUREKI_ELIGIBILITY_RESPONSE_DIFF';
    fieldEvidenceJson: 'YAKUREKI_ELIGIBILITY_FIELD_EVIDENCE';
    outputDir: 'YAKUREKI_ELIGIBILITY_FIELD_OUTPUT_DIR';
  };
}

export function buildOnlineEligibilityFieldCheckRequest(
  input: { generatedAt?: Date } = {}
): OnlineEligibilityFieldCheckRequest {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-online-eligibility-field-check-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    guidance: 'オンライン資格確認・マイナ連携の現地試験を提出する前に、以下を院内で準備してください。患者氏名、患者番号、生年月日、接続URL、認証情報、通信本文は含めないでください。',
    items: [
      {
        id: 'official_auth_procedure',
        title: '公式認証方式・担当・認証情報保管の確認',
        required: true,
        neededFields: ['officialProcedureConfirmed', 'authenticationMethodRecorded', 'credentialStorageConfirmed', 'operationalOwnerAssigned'],
        purpose: '公式手順、認証方式の記録、認証情報の保管方式、現地試験の責任者が揃っているかを確認する',
        storeOnly: '接続URL、認証情報、トークンの実値',
        supportShare: '各項目の確認済み/未確認のみ'
      },
      {
        id: 'device_connection_success',
        title: 'マイナ読取・オンライン資格確認の現地接続成功',
        required: true,
        neededFields: ['マイナ読取の現地機器接続診断（成功/失敗）', 'オンライン資格確認の現地接続診断（成功/失敗）'],
        purpose: '現地のカードリーダー、オンライン資格確認サービスへの接続が実機で成功しているかを確認する',
        storeOnly: '接続診断の実URL・認証情報・通信本文',
        supportShare: '接続状態、直近試行結果、応答形状のみ'
      },
      {
        id: 'official_response_sample',
        title: '公式実レスポンスの個人情報なしサンプル投入',
        required: true,
        neededFields: ['公式実レスポンス差分サンプル（個人情報なし・表記ゆれ含む）'],
        purpose: '公式レスポンス形状の差分テストに、個人情報を含まないサンプルが1件以上投入され、不一致がないかを確認する',
        storeOnly: '実際のレスポンス本文、患者情報を含む生データ',
        supportShare: 'サンプル件数、不一致件数、個人情報チェック件数のみ'
      }
    ],
    operatorChecks: [
      '接続URL、認証トークン、通信本文をそのまま貼り付けない',
      '患者名、患者番号、生年月日を記録に残さない',
      '確認記録には取得日時、匿名の確認記録ID、元資料SHA-256を残す'
    ],
    privacyRules: [
      '店舗内だけで扱う: 接続設定、認証情報、実際のレスポンス本文',
      'サポートへ共有してよい: 各ゲートの合否、サンプル件数・不一致件数などの集計値'
    ],
    commandEnvironment: {
      connectorReadinessJson: 'YAKUREKI_ELIGIBILITY_CONNECTOR_READINESS',
      responseDiffJson: 'YAKUREKI_ELIGIBILITY_RESPONSE_DIFF',
      fieldEvidenceJson: 'YAKUREKI_ELIGIBILITY_FIELD_EVIDENCE',
      outputDir: 'YAKUREKI_ELIGIBILITY_FIELD_OUTPUT_DIR'
    }
  };
}

export function buildOnlineEligibilityFieldCheckRequestChecklist(
  request: OnlineEligibilityFieldCheckRequest
): string {
  const lines = [
    'オンライン資格確認・マイナ連携 現地試験 証跡提出依頼',
    `作成日時: ${request.generatedAt}`,
    '',
    request.guidance,
    ''
  ];
  for (const item of request.items) {
    lines.push(`[${item.required ? '必須' : '任意'}] ${item.title}`);
    lines.push(`  目的: ${item.purpose}`);
    lines.push(`  必要項目: ${item.neededFields.join(', ')}`);
    lines.push(`  院内だけで扱う: ${item.storeOnly}`);
    lines.push(`  サポートへ共有してよい: ${item.supportShare}`);
    lines.push('');
  }
  lines.push('確認事項:');
  for (const check of request.operatorChecks) lines.push(`  - ${check}`);
  lines.push('');
  lines.push('取扱いルール:');
  for (const rule of request.privacyRules) lines.push(`  - ${rule}`);
  return lines.join('\n');
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildOnlineEligibilityFieldReadinessCsv(
  report: OnlineEligibilityFieldReadinessReport
): string {
  const rows = [
    ['区分', '判定', '確認項目', '証跡', '次の対応'],
    [
      '総括',
      report.statusLabel,
      `${report.gateCount}項目中OK ${report.passedGateCount}項目`,
      `患者情報なし / URLなし / トークンなし / リクエスト本文なし / レスポンス本文なし`,
      report.status === 'pass' ? '対応不要' : '未完了または要確認の項目を埋める'
    ],
    ...report.gates.map((gate) => [
      '確認項目',
      gate.statusLabel,
      gate.title,
      gate.evidence.join(' / '),
      gate.nextAction
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
