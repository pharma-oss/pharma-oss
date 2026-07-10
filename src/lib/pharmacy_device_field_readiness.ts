import type { ExternalConnectorReadinessReport } from './external_connector_readiness.ts';
import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';

export type PharmacyDeviceFieldStatus = 'pass' | 'attention' | 'blocked';

export interface PharmacyDeviceFieldEvidenceInput {
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  officialSpecificationAndLicenseConfirmed?: boolean;
  operationalOwnerAssigned?: boolean;
  outageProcedureConfirmed?: boolean;
  productionDeviceConnected?: boolean;
  successfulSubmissionConfirmed?: boolean;
  prescriptionContentMatched?: boolean;
  duplicatePreventionConfirmed?: boolean;
  replacementConfirmed?: boolean;
  cancellationConfirmed?: boolean;
  restartRecoveryConfirmed?: boolean;
  auditTrailConfirmed?: boolean;
  noFacilityExternalTransmissionConfirmed?: boolean;
  operatingBusinessDays?: number;
  successfulTransferCount?: number;
  failedTransferCount?: number;
  unresolvedIncidentCount?: number;
}

export interface PharmacyDeviceFieldEvidenceTemplate extends Required<PharmacyDeviceFieldEvidenceInput> {
  type: 'yakureki-pharmacy-device-field-evidence-template';
  schemaVersion: 1;
  guidance: string;
}

export interface PharmacyDeviceFieldGate {
  id:
    | 'governance'
    | 'production_connector'
    | 'content_match'
    | 'lifecycle'
    | 'continuity'
    | 'stable_operation'
    | 'privacy_safety'
    | 'evidence_integrity';
  title: string;
  status: PharmacyDeviceFieldStatus;
  statusLabel: string;
  evidence: string[];
  nextAction: string;
}

export interface PharmacyDeviceFieldReadinessReport {
  type: 'yakureki-pharmacy-device-field-readiness';
  schemaVersion: 1;
  generatedAt: string;
  status: PharmacyDeviceFieldStatus;
  statusLabel: string;
  gateCount: number;
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  canStartFieldTrial: boolean;
  canDeclareStableOperation: boolean;
  transferMetrics: {
    operatingBusinessDays: number;
    successfulTransferCount: number;
    failedTransferCount: number;
    totalTransferCount: number;
    failureRate: number;
    unresolvedIncidentCount: number;
  };
  privacy: {
    containsPatientData: false;
    containsEndpointUrl: false;
    containsBearerToken: false;
    containsRequestBody: false;
    containsResponseBody: false;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  gates: PharmacyDeviceFieldGate[];
}

const STATUS_LABELS: Record<PharmacyDeviceFieldStatus, string> = {
  pass: 'OK',
  attention: '要確認',
  blocked: '未完了'
};

function statusLabel(status: PharmacyDeviceFieldStatus): string {
  return STATUS_LABELS[status];
}

function buildBooleanGate(input: {
  id: PharmacyDeviceFieldGate['id'];
  title: string;
  checks: Array<{ passed: boolean; evidence: string; action: string }>;
}): PharmacyDeviceFieldGate {
  const missing = input.checks.filter((check) => !check.passed);
  const status: PharmacyDeviceFieldStatus = missing.length === 0 ? 'pass' : 'blocked';
  return {
    id: input.id,
    title: input.title,
    status,
    statusLabel: statusLabel(status),
    evidence: input.checks.filter((check) => check.passed).map((check) => check.evidence),
    nextAction: missing.map((check) => check.action).join(' / ') || '対応不要'
  };
}

function buildConnectorGate(
  readiness: ExternalConnectorReadinessReport,
  evidence: PharmacyDeviceFieldEvidenceInput
): PharmacyDeviceFieldGate {
  const connector = readiness.checks.find((check) => check.id === 'pharmacy_device');
  const passed = connector?.status === 'ready'
    && connector.config.mode === 'connector'
    && connector.lastAttempt.outcome === 'success'
    && connector.lastAttempt.responseShape === 'json_object'
    && evidence.productionDeviceConnected === true;
  return {
    id: 'production_connector',
    title: '本番店舗の調剤機器へ接続する',
    status: passed ? 'pass' : 'blocked',
    statusLabel: statusLabel(passed ? 'pass' : 'blocked'),
    evidence: connector ? [
      `接続設定: ${connector.statusLabel}`,
      `直近試行: ${connector.lastAttempt.outcomeLabel}`,
      `応答形式: ${connector.lastAttempt.responseShape}`,
      `実機確認: ${evidence.productionDeviceConnected ? 'あり' : 'なし'}`
    ] : [],
    nextAction: passed
      ? '対応不要'
      : connector?.requiredActions.join(' / ') || '接続準備診断へ調剤機器コネクタを含め、実機接続を成功させる'
  };
}

function nonNegativeInteger(value: unknown): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function buildStableOperationGate(
  evidence: PharmacyDeviceFieldEvidenceInput,
  metrics: PharmacyDeviceFieldReadinessReport['transferMetrics']
): PharmacyDeviceFieldGate {
  const checks = [
    {
      passed: metrics.operatingBusinessDays >= 20,
      evidence: `継続運用 ${metrics.operatingBusinessDays}営業日`,
      action: '本番店舗で20営業日以上継続運用する'
    },
    {
      passed: metrics.successfulTransferCount >= 20,
      evidence: `成功 ${metrics.successfulTransferCount}件`,
      action: '実処方相当の成功送信を20件以上確認する'
    },
    {
      passed: metrics.totalTransferCount > 0 && metrics.failureRate <= 0.02,
      evidence: `失敗率 ${(metrics.failureRate * 100).toFixed(1)}%`,
      action: '送信失敗率を2%以下にし、失敗分の再送結果を確認する'
    },
    {
      passed: metrics.unresolvedIncidentCount === 0,
      evidence: '未解決事故 0件',
      action: '未解決の重複、誤送信、取消漏れを0件にする'
    }
  ];
  const missing = checks.filter((check) => !check.passed);
  const status: PharmacyDeviceFieldStatus = missing.length === 0 ? 'pass' : 'blocked';
  return {
    id: 'stable_operation',
    title: '20営業日以上、低い失敗率で安定運用する',
    status,
    statusLabel: statusLabel(status),
    evidence: checks.filter((check) => check.passed).map((check) => check.evidence),
    nextAction: missing.map((check) => check.action).join(' / ') || '対応不要'
  };
}

function buildPrivacyGate(review: EvidenceIntegrityReview): PharmacyDeviceFieldGate {
  const status: PharmacyDeviceFieldStatus = review.privacy.containsPatientDataSignals ? 'blocked' : 'pass';
  return {
    id: 'privacy_safety',
    title: '共有証跡に患者情報・接続秘密を含めない',
    status,
    statusLabel: statusLabel(status),
    evidence: [
      `患者情報らしい値: ${review.privacy.containsPatientDataSignals ? '検出' : 'なし'}`,
      '接続URL・認証情報・通信本文は出力対象外'
    ],
    nextAction: status === 'pass' ? '対応不要' : '患者情報を除いた匿名確認記録へ差し替える'
  };
}

function summarizeStatus(gates: PharmacyDeviceFieldGate[]): PharmacyDeviceFieldStatus {
  if (gates.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (gates.some((gate) => gate.status === 'attention')) return 'attention';
  return 'pass';
}

export function buildPharmacyDeviceFieldReadinessReport(input: {
  generatedAt?: Date;
  connectorReadiness: ExternalConnectorReadinessReport;
  fieldEvidence?: PharmacyDeviceFieldEvidenceInput;
}): PharmacyDeviceFieldReadinessReport {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.fieldEvidence ?? {};
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: evidence.operatorReviewId || 'pharmacy-device-field-readiness',
    claimKind: 'pharmacy_device_field',
    evidence,
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });
  const successfulTransferCount = nonNegativeInteger(evidence.successfulTransferCount);
  const failedTransferCount = nonNegativeInteger(evidence.failedTransferCount);
  const totalTransferCount = successfulTransferCount + failedTransferCount;
  const metrics = {
    operatingBusinessDays: nonNegativeInteger(evidence.operatingBusinessDays),
    successfulTransferCount,
    failedTransferCount,
    totalTransferCount,
    failureRate: totalTransferCount > 0 ? failedTransferCount / totalTransferCount : 1,
    unresolvedIncidentCount: nonNegativeInteger(evidence.unresolvedIncidentCount)
  };
  const gates: PharmacyDeviceFieldGate[] = [
    buildBooleanGate({
      id: 'governance',
      title: '利用許諾・責任者・障害時手順を確認する',
      checks: [
        { passed: evidence.officialSpecificationAndLicenseConfirmed === true, evidence: '仕様と利用許諾を確認済み', action: '接続仕様、メーカー契約、NSIPS利用時の利用許諾を確認する' },
        { passed: evidence.operationalOwnerAssigned === true, evidence: '運用責任者を割当済み', action: '現地試験と本番運用の責任者を割り当てる' },
        { passed: evidence.outageProcedureConfirmed === true, evidence: '障害時手順を確認済み', action: '接続停止時の手作業、再送、復旧確認手順を決める' }
      ]
    }),
    buildConnectorGate(input.connectorReadiness, evidence),
    buildBooleanGate({
      id: 'content_match',
      title: '送信した処方と実機表示を照合する',
      checks: [
        { passed: evidence.successfulSubmissionConfirmed === true, evidence: '本番実機への送信成功を確認済み', action: '本番店舗の実機へ処方を送信する' },
        { passed: evidence.prescriptionContentMatched === true, evidence: '患者、薬品、用量、用法、日数の一致を確認済み', action: '送信元と実機表示の患者、薬品、用量、用法、日数を照合する' }
      ]
    }),
    buildBooleanGate({
      id: 'lifecycle',
      title: '二重送信・差替・取消を安全に往復する',
      checks: [
        { passed: evidence.duplicatePreventionConfirmed === true, evidence: '同じ内容の二重送信防止を確認済み', action: '同じ処方を再送し、接続先で重複しないことを確認する' },
        { passed: evidence.replacementConfirmed === true, evidence: '処方差替を確認済み', action: '修正後の処方へ差し替え、旧内容が残らないことを確認する' },
        { passed: evidence.cancellationConfirmed === true, evidence: '連携取消を確認済み', action: '取消を実行し、実機側でも取消済みになることを確認する' }
      ]
    }),
    buildBooleanGate({
      id: 'continuity',
      title: '再起動後の復帰と監査履歴を確認する',
      checks: [
        { passed: evidence.restartRecoveryConfirmed === true, evidence: '再起動後の再接続を確認済み', action: 'yakureki、接続モジュール、実機を再起動して復帰を確認する' },
        { passed: evidence.auditTrailConfirmed === true, evidence: '送信、失敗、差替、取消の履歴を確認済み', action: '送信、失敗、差替、取消が監査ログで追えることを確認する' },
        { passed: evidence.noFacilityExternalTransmissionConfirmed === true, evidence: '処方データを施設外へ送らないことを確認済み', action: 'ネットワーク経路と接続先を確認し、施設外送信がないことを記録する' }
      ]
    }),
    buildStableOperationGate(evidence, metrics),
    buildPrivacyGate(evidenceIntegrity),
    {
      id: 'evidence_integrity',
      title: '現地試験証跡の出所と実在性を確認する',
      status: evidenceIntegrity.status,
      statusLabel: statusLabel(evidenceIntegrity.status),
      evidence: [`証跡品質: ${evidenceIntegrity.statusLabel}`, `指摘: ${evidenceIntegrity.issues.length}件`],
      nextAction: evidenceIntegrity.requiredActions.join(' / ') || '対応不要'
    }
  ];
  const status = summarizeStatus(gates);
  const trialGateIds: PharmacyDeviceFieldGate['id'][] = [
    'governance',
    'production_connector',
    'privacy_safety',
    'evidence_integrity'
  ];

  return {
    type: 'yakureki-pharmacy-device-field-readiness',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: status === 'pass' ? '安定運用OK' : status === 'attention' ? '現地確認あり' : '現地確認未完了',
    gateCount: gates.length,
    passedGateCount: gates.filter((gate) => gate.status === 'pass').length,
    attentionGateCount: gates.filter((gate) => gate.status === 'attention').length,
    blockedGateCount: gates.filter((gate) => gate.status === 'blocked').length,
    canStartFieldTrial: gates.filter((gate) => trialGateIds.includes(gate.id)).every((gate) => gate.status === 'pass'),
    canDeclareStableOperation: status === 'pass',
    transferMetrics: metrics,
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

export function buildPharmacyDeviceFieldEvidenceTemplate(): PharmacyDeviceFieldEvidenceTemplate {
  return {
    type: 'yakureki-pharmacy-device-field-evidence-template',
    schemaVersion: 1,
    guidance: '患者氏名、患者番号、生年月日、薬品名、医療機関名、接続URL、認証情報、通信本文は入れず、実店舗・実機での確認結果と匿名集計だけを記録してください。デモ、ダミー、サンプルは安定運用の根拠にしません。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    officialSpecificationAndLicenseConfirmed: false,
    operationalOwnerAssigned: false,
    outageProcedureConfirmed: false,
    productionDeviceConnected: false,
    successfulSubmissionConfirmed: false,
    prescriptionContentMatched: false,
    duplicatePreventionConfirmed: false,
    replacementConfirmed: false,
    cancellationConfirmed: false,
    restartRecoveryConfirmed: false,
    auditTrailConfirmed: false,
    noFacilityExternalTransmissionConfirmed: false,
    operatingBusinessDays: 0,
    successfulTransferCount: 0,
    failedTransferCount: 0,
    unresolvedIncidentCount: 0
  };
}

export interface PharmacyDeviceFieldCheckRequestItem {
  id: string;
  title: string;
  required: boolean;
  neededFields: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface PharmacyDeviceFieldCheckRequest {
  type: 'yakureki-pharmacy-device-field-check-request';
  schemaVersion: 1;
  generatedAt: string;
  guidance: string;
  items: PharmacyDeviceFieldCheckRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    connectorReadinessJson: 'YAKUREKI_PHARMACY_DEVICE_CONNECTOR_READINESS';
    fieldEvidenceJson: 'YAKUREKI_PHARMACY_DEVICE_FIELD_EVIDENCE';
    outputDir: 'YAKUREKI_PHARMACY_DEVICE_FIELD_OUTPUT_DIR';
  };
}

export function buildPharmacyDeviceFieldCheckRequest(input: { generatedAt?: Date } = {}): PharmacyDeviceFieldCheckRequest {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-pharmacy-device-field-check-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    guidance: '外部調剤機器（NSIPS等）連携の現地確認を提出する前に、以下を院内で準備してください。患者氏名、患者番号、生年月日、薬品名、医療機関名、接続URL、認証情報、通信本文は含めないでください。',
    items: [
      {
        id: 'governance_and_connector',
        title: '利用許諾・責任者・本番接続の確認',
        required: true,
        neededFields: ['officialSpecificationAndLicenseConfirmed', 'operationalOwnerAssigned', 'outageProcedureConfirmed', 'productionDeviceConnected'],
        purpose: 'メーカー契約・NSIPS利用許諾、運用責任者、障害時手順、本番実機接続が揃っているかを確認する',
        storeOnly: '契約書原本、責任者氏名、実機の設置場所',
        supportShare: '各項目の確認済み/未確認のみ'
      },
      {
        id: 'content_and_lifecycle',
        title: '内容照合・二重送信防止・差替・取消の実機確認',
        required: true,
        neededFields: ['successfulSubmissionConfirmed', 'prescriptionContentMatched', 'duplicatePreventionConfirmed', 'replacementConfirmed', 'cancellationConfirmed', 'restartRecoveryConfirmed', 'auditTrailConfirmed', 'noFacilityExternalTransmissionConfirmed'],
        purpose: '送信内容と実機表示の一致、二重送信防止、差替・取消の往復、再起動復帰、監査履歴、施設外非送信を実機で確認する',
        storeOnly: '実際に送信した処方内容、実機の画面表示',
        supportShare: '各確認項目の合否のみ'
      },
      {
        id: 'stable_operation_metrics',
        title: '20営業日以上の安定運用実績',
        required: true,
        neededFields: ['operatingBusinessDays', 'successfulTransferCount', 'failedTransferCount', 'unresolvedIncidentCount'],
        purpose: '継続運用日数、成功件数、失敗率、未解決事故件数から安定運用を判定する',
        storeOnly: '個別の送信ログ、失敗時の処方内容',
        supportShare: '運用日数、成功件数、失敗件数、未解決事故件数の集計値のみ'
      }
    ],
    operatorChecks: [
      '接続URL、認証トークン、通信本文をそのまま貼り付けない',
      '患者名、患者番号、生年月日、医療機関名を記録に残さない',
      '確認記録には取得日時、匿名の確認記録ID、元資料SHA-256を残す'
    ],
    privacyRules: [
      '店舗内だけで扱う: 契約書原本、実機ログ、個別の送信内容',
      'サポートへ共有してよい: 各ゲートの合否、運用日数・成功件数・失敗率などの集計値'
    ],
    commandEnvironment: {
      connectorReadinessJson: 'YAKUREKI_PHARMACY_DEVICE_CONNECTOR_READINESS',
      fieldEvidenceJson: 'YAKUREKI_PHARMACY_DEVICE_FIELD_EVIDENCE',
      outputDir: 'YAKUREKI_PHARMACY_DEVICE_FIELD_OUTPUT_DIR'
    }
  };
}

export function buildPharmacyDeviceFieldCheckRequestChecklist(request: PharmacyDeviceFieldCheckRequest): string {
  const lines = [
    '外部調剤機器 現地確認 証跡提出依頼',
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
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildPharmacyDeviceFieldReadinessCsv(report: PharmacyDeviceFieldReadinessReport): string {
  const rows = [
    ['区分', '判定', '確認項目', '証跡', '次の対応'],
    ['総括', report.statusLabel, `${report.gateCount}項目中OK ${report.passedGateCount}項目`, `運用${report.transferMetrics.operatingBusinessDays}営業日 / 成功${report.transferMetrics.successfulTransferCount}件 / 失敗率${(report.transferMetrics.failureRate * 100).toFixed(1)}%`, report.status === 'pass' ? '対応不要' : '未完了項目を実機で確認する'],
    ...report.gates.map((gate) => ['確認項目', gate.statusLabel, gate.title, gate.evidence.join(' / '), gate.nextAction])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildPharmacyDeviceFieldChecklist(report: PharmacyDeviceFieldReadinessReport): string {
  return [
    `外部調剤機器 現地確認: ${report.statusLabel}`,
    `確認: ${report.gateCount}項目 / OK ${report.passedGateCount} / 要確認 ${report.attentionGateCount} / 未完了 ${report.blockedGateCount}`,
    `運用: ${report.transferMetrics.operatingBusinessDays}営業日 / 成功 ${report.transferMetrics.successfulTransferCount}件 / 失敗 ${report.transferMetrics.failedTransferCount}件 / 未解決 ${report.transferMetrics.unresolvedIncidentCount}件`,
    '',
    ...report.gates.map((gate) => `[${gate.status === 'pass' ? 'x' : ' '}] ${gate.title}\n    判定: ${gate.statusLabel}\n    次: ${gate.nextAction}`)
  ].join('\n');
}
