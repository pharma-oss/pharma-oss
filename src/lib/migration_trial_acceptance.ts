import type {
  MigrationPackageReadinessReview,
  MigrationPackageReadinessStatus,
  MigrationPackageReferenceReview,
  MigrationPackageSourceKind,
  MigrationPackageSourceReview
} from './migration_csv.ts';
import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';

export type MigrationTrialAcceptanceStatus = MigrationPackageReadinessStatus;

export interface MigrationTrialAcceptanceTargets {
  minPatientRows: number;
  minVisitRows: number;
  minDrugStockRows: number;
  minSoapRows: number;
}

export interface MigrationTrialAcceptanceEvidenceInput {
  acceptanceId?: string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataInArtifactsConfirmed?: boolean;
  realDataEquivalentConfirmed?: boolean;
  sourceSystemExportedByCustomerConfirmed?: boolean;
  fieldMappingReviewed?: boolean;
  restorePreviewCompleted?: boolean;
  firstDayTrialPlanReady?: boolean;
  ownerReviewCompleted?: boolean;
  packageReview?: MigrationPackageReadinessReview;
  targets?: Partial<MigrationTrialAcceptanceTargets>;
}

export interface MigrationTrialAcceptanceGate {
  id: string;
  title: string;
  status: MigrationTrialAcceptanceStatus;
  statusLabel: string;
  target: string;
  actual: string;
  nextAction: string;
}

export interface MigrationTrialOperationalWorkflow {
  id: 'patient_reception' | 'inventory_check' | 'medication_history';
  title: string;
  status: MigrationTrialAcceptanceStatus;
  statusLabel: string;
  actual: string;
  nextAction: string;
}

export interface MigrationTrialOperationalCoverage {
  status: MigrationTrialAcceptanceStatus;
  statusLabel: string;
  patientReceptionReady: boolean;
  inventoryReady: boolean;
  medicationHistoryReady: boolean;
  readyWorkflowCount: number;
  totalWorkflowCount: number;
  checkedReferenceCount: number;
  referenceIssueCount: number;
  workflows: MigrationTrialOperationalWorkflow[];
  requiredActions: string[];
}

export interface MigrationTrialAcceptanceReview {
  type: 'yakureki-migration-trial-acceptance';
  schemaVersion: 3;
  generatedAt: string;
  acceptanceId: string;
  status: MigrationTrialAcceptanceStatus;
  statusLabel: string;
  actionLabel: string;
  readyForOneDayTrial: boolean;
  targets: MigrationTrialAcceptanceTargets;
  metrics: {
    patientRows: number;
    visitRows: number;
    drugStockRows: number;
    soapRows: number;
    totalRowCount: number;
    totalIssueCount: number;
    referenceIssueCount: number;
    blockedSourceCount: number;
    attentionSourceCount: number;
  };
  evidence: {
    capturedAt: string;
    operatorReviewId: string;
    sourceArtifactSha256: string;
    noPatientDataInArtifactsConfirmed: boolean;
    realDataEquivalentConfirmed: boolean;
    sourceSystemExportedByCustomerConfirmed: boolean;
    fieldMappingReviewed: boolean;
    restorePreviewCompleted: boolean;
    firstDayTrialPlanReady: boolean;
    ownerReviewCompleted: boolean;
  };
  privacy: {
    containsPatientData: false;
    containsRawRows: false;
    containsLocalPath: false;
    containsFileName: false;
    containsSourcePrimaryKeys: false;
    containsFreeTextNotes: false;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  operationalCoverage: MigrationTrialOperationalCoverage;
  sources: MigrationPackageSourceReview[];
  references: MigrationPackageReferenceReview[];
  gates: MigrationTrialAcceptanceGate[];
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  nextActions: string[];
}

export interface MigrationTrialAcceptanceEvidenceTemplate {
  type: 'yakureki-migration-trial-acceptance-evidence-template';
  schemaVersion: 3;
  generatedAt: string;
  acceptanceId: string;
  guidance: string;
  capturedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataInArtifactsConfirmed: false;
  realDataEquivalentConfirmed: false;
  sourceSystemExportedByCustomerConfirmed: false;
  fieldMappingReviewed: false;
  restorePreviewCompleted: false;
  firstDayTrialPlanReady: false;
  ownerReviewCompleted: false;
  targets: MigrationTrialAcceptanceTargets;
  privacy: MigrationTrialAcceptanceReview['privacy'];
}

export interface MigrationTrialAcceptanceSampleRequestItem {
  id: 'patients_csv' | 'visits_csv' | 'drug_stocks_csv' | 'soap_records_csv' | 'evidence_json';
  title: string;
  required: boolean;
  acceptedFormats: string[];
  minimumRows?: number;
  neededColumns: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface MigrationTrialAcceptanceSampleRequest {
  type: 'yakureki-migration-trial-acceptance-sample-request';
  schemaVersion: 1;
  generatedAt: string;
  acceptanceId: string;
  guidance: string;
  targets: MigrationTrialAcceptanceTargets;
  items: MigrationTrialAcceptanceSampleRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    patientCsv: 'YAKUREKI_MIGRATION_PATIENT_CSV';
    visitCsv: 'YAKUREKI_MIGRATION_VISIT_CSV';
    drugStockCsv: 'YAKUREKI_MIGRATION_DRUG_STOCK_CSV';
    soapCsv: 'YAKUREKI_MIGRATION_SOAP_CSV';
    evidenceJson: 'YAKUREKI_MIGRATION_ACCEPTANCE_EVIDENCE';
    outputDir: 'YAKUREKI_MIGRATION_ACCEPTANCE_OUTPUT_DIR';
  };
}

const DEFAULT_TARGETS: MigrationTrialAcceptanceTargets = {
  minPatientRows: 10,
  minVisitRows: 10,
  minDrugStockRows: 1,
  minSoapRows: 1
};

const PRIVACY_FLAGS = {
  containsPatientData: false,
  containsRawRows: false,
  containsLocalPath: false,
  containsFileName: false,
  containsSourcePrimaryKeys: false,
  containsFreeTextNotes: false
} as const;

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function finiteNonNegative(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function mergeTargets(input: Partial<MigrationTrialAcceptanceTargets> | undefined): MigrationTrialAcceptanceTargets {
  return {
    minPatientRows: finiteNonNegative(input?.minPatientRows) ?? DEFAULT_TARGETS.minPatientRows,
    minVisitRows: finiteNonNegative(input?.minVisitRows) ?? DEFAULT_TARGETS.minVisitRows,
    minDrugStockRows: finiteNonNegative(input?.minDrugStockRows) ?? DEFAULT_TARGETS.minDrugStockRows,
    minSoapRows: finiteNonNegative(input?.minSoapRows) ?? DEFAULT_TARGETS.minSoapRows
  };
}

function statusLabel(status: MigrationTrialAcceptanceStatus): string {
  if (status === 'pass') return '移行受入OK';
  if (status === 'attention') return '移行受入を確認';
  return '移行受入を保留';
}

function operationalStatusLabel(status: MigrationTrialAcceptanceStatus): string {
  if (status === 'pass') return '初日業務OK';
  if (status === 'attention') return '初日業務を確認';
  return '初日業務を保留';
}

function actionLabel(status: MigrationTrialAcceptanceStatus, readyForOneDayTrial: boolean): string {
  if (readyForOneDayTrial && status === 'pass') return '1日テスト開始OK';
  if (status === 'attention') return '確認後に1日テスト判断';
  return '移行データ修正または証跡待ち';
}

function summarizeStatus(gates: MigrationTrialAcceptanceGate[]): MigrationTrialAcceptanceStatus {
  if (gates.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (gates.some((gate) => gate.status === 'attention')) return 'attention';
  return 'pass';
}

function gate(options: {
  id: string;
  title: string;
  status: MigrationTrialAcceptanceStatus;
  target: string;
  actual: string;
  nextAction: string;
}): MigrationTrialAcceptanceGate {
  return {
    ...options,
    statusLabel: statusLabel(options.status)
  };
}

function passGate(id: string, title: string, target: string, actual: string): MigrationTrialAcceptanceGate {
  return gate({ id, title, status: 'pass', target, actual, nextAction: '対応不要' });
}

function packageStatus(review: MigrationPackageReadinessReview | undefined): MigrationTrialAcceptanceStatus {
  if (!review) return 'blocked';
  return review.status;
}

function packagePrivacySafe(review: MigrationPackageReadinessReview | undefined): boolean {
  if (!review) return false;
  return Object.values(review.privacy).every((value) => value === false);
}

function rowCount(review: MigrationPackageReadinessReview | undefined, kind: MigrationPackageSourceKind): number {
  return review?.sources.find((source) => source.kind === kind)?.rowCount ?? 0;
}

function sourceReview(
  review: MigrationPackageReadinessReview | undefined,
  kind: MigrationPackageSourceKind
): MigrationPackageSourceReview | undefined {
  return review?.sources.find((source) => source.kind === kind);
}

function referenceReview(
  review: MigrationPackageReadinessReview | undefined,
  id: MigrationPackageReferenceReview['id']
): MigrationPackageReferenceReview | undefined {
  return review?.references.find((reference) => reference.id === id);
}

function summarizeWorkflowStatus(workflows: MigrationTrialOperationalWorkflow[]): MigrationTrialAcceptanceStatus {
  if (workflows.some((workflow) => workflow.status === 'blocked')) return 'blocked';
  if (workflows.some((workflow) => workflow.status === 'attention')) return 'attention';
  return 'pass';
}

function workflow(options: {
  id: MigrationTrialOperationalWorkflow['id'];
  title: string;
  status: MigrationTrialAcceptanceStatus;
  actual: string;
  nextAction: string;
}): MigrationTrialOperationalWorkflow {
  return {
    ...options,
    statusLabel: operationalStatusLabel(options.status)
  };
}

function buildOperationalCoverage(
  packageReview: MigrationPackageReadinessReview | undefined,
  targets: MigrationTrialAcceptanceTargets,
  counts: {
    patientRows: number;
    visitRows: number;
    drugStockRows: number;
    soapRows: number;
  }
): MigrationTrialOperationalCoverage {
  const patients = sourceReview(packageReview, 'patients');
  const visits = sourceReview(packageReview, 'visits');
  const drugStocks = sourceReview(packageReview, 'drug_stocks');
  const soapRecords = sourceReview(packageReview, 'soap_records');
  const visitPatient = referenceReview(packageReview, 'visit_patient_reference');
  const soapVisit = referenceReview(packageReview, 'soap_visit_reference');
  const patientReceptionReady = Boolean(
    patients?.status === 'pass'
      && visits?.status === 'pass'
      && visitPatient?.status === 'pass'
      && counts.patientRows >= targets.minPatientRows
      && counts.visitRows >= targets.minVisitRows
  );
  const inventoryReady = Boolean(
    drugStocks?.status === 'pass'
      && counts.drugStockRows >= targets.minDrugStockRows
  );
  const medicationHistoryReady = Boolean(
    soapRecords?.status === 'pass'
      && soapVisit?.status === 'pass'
      && counts.soapRows >= targets.minSoapRows
  );

  const patientReceptionStatus: MigrationTrialAcceptanceStatus = patientReceptionReady
    ? 'pass'
    : !packageReview || patients?.status === 'blocked' || visits?.status === 'blocked' || visitPatient?.status === 'blocked'
      ? 'blocked'
      : 'attention';
  const inventoryStatus: MigrationTrialAcceptanceStatus = inventoryReady
    ? 'pass'
    : !packageReview || drugStocks?.status === 'blocked'
      ? 'blocked'
      : 'attention';
  const medicationHistoryStatus: MigrationTrialAcceptanceStatus = medicationHistoryReady
    ? 'pass'
    : !packageReview || soapRecords?.status === 'blocked' || soapVisit?.status === 'blocked'
      ? 'blocked'
      : 'attention';

  const workflows: MigrationTrialOperationalWorkflow[] = [
    workflow({
      id: 'patient_reception',
      title: '患者と受付',
      status: patientReceptionStatus,
      actual: [
        `患者${counts.patientRows}/${targets.minPatientRows}件`,
        `受付${counts.visitRows}/${targets.minVisitRows}件`,
        `対応 ${visitPatient?.statusLabel || '未確認'}`
      ].join(' / '),
      nextAction: patientReceptionStatus === 'pass'
        ? '対応不要'
        : patientReceptionStatus === 'blocked'
          ? '患者CSVと受付CSVをそろえ、受付が患者に結び付く状態へ修正する'
          : '患者と受付の件数、列対応、対応関係を責任者が確認する'
    }),
    workflow({
      id: 'inventory_check',
      title: '在庫確認',
      status: inventoryStatus,
      actual: `在庫${counts.drugStockRows}/${targets.minDrugStockRows}件 / ${drugStocks?.statusLabel || '未確認'}`,
      nextAction: inventoryStatus === 'pass'
        ? '対応不要'
        : inventoryStatus === 'blocked'
          ? '在庫CSVを出力し、必須列と在庫数を移行プレビューで通す'
          : '導入初日に確認する在庫CSVを追加し、文字化けや列対応を確認する'
    }),
    workflow({
      id: 'medication_history',
      title: '薬歴参照',
      status: medicationHistoryStatus,
      actual: [
        `薬歴${counts.soapRows}/${targets.minSoapRows}件`,
        `対応 ${soapVisit?.statusLabel || '未確認'}`
      ].join(' / '),
      nextAction: medicationHistoryStatus === 'pass'
        ? '対応不要'
        : medicationHistoryStatus === 'blocked'
          ? '薬歴CSVと受付CSVをそろえ、薬歴が受付に結び付く状態へ修正する'
          : '導入初日に見る薬歴CSVを追加し、受付との対応関係を確認する'
    })
  ];
  const status = summarizeWorkflowStatus(workflows);
  const requiredActions = Array.from(new Set(
    workflows
      .filter((item) => item.status !== 'pass')
      .map((item) => item.nextAction)
  ));

  return {
    status,
    statusLabel: operationalStatusLabel(status),
    patientReceptionReady,
    inventoryReady,
    medicationHistoryReady,
    readyWorkflowCount: workflows.filter((item) => item.status === 'pass').length,
    totalWorkflowCount: workflows.length,
    checkedReferenceCount: [visitPatient, soapVisit].filter((reference) => (reference?.checkedRowCount ?? 0) > 0).length,
    referenceIssueCount: (visitPatient?.issueCount ?? 0) + (soapVisit?.issueCount ?? 0),
    workflows,
    requiredActions: requiredActions.length > 0 ? requiredActions : ['対応不要']
  };
}

function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function uniqueActions(gates: MigrationTrialAcceptanceGate[]): string[] {
  return Array.from(new Set(
    gates
      .filter((gateItem) => gateItem.status !== 'pass')
      .map((gateItem) => gateItem.nextAction)
      .filter(Boolean)
  ));
}

export function buildMigrationTrialAcceptanceReview(input: {
  generatedAt?: Date;
  evidence?: MigrationTrialAcceptanceEvidenceInput;
} = {}): MigrationTrialAcceptanceReview {
  const generatedAt = input.generatedAt ?? new Date();
  const evidence = input.evidence ?? {};
  const packageReview = evidence.packageReview;
  const targets = mergeTargets(evidence.targets);
  const patientRows = rowCount(packageReview, 'patients');
  const visitRows = rowCount(packageReview, 'visits');
  const drugStockRows = rowCount(packageReview, 'drug_stocks');
  const soapRows = rowCount(packageReview, 'soap_records');
  const sampleRowsOk = patientRows >= targets.minPatientRows
    && visitRows >= targets.minVisitRows
    && drugStockRows >= targets.minDrugStockRows
    && soapRows >= targets.minSoapRows;
  const packageReadyStatus = packageStatus(packageReview);
  const operationalCoverage = buildOperationalCoverage(packageReview, targets, {
    patientRows,
    visitRows,
    drugStockRows,
    soapRows
  });
  const oneDayReady = packageReview?.readyForOneDayTrial === true
    && bool(evidence.restorePreviewCompleted)
    && bool(evidence.firstDayTrialPlanReady);
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: String(evidence.acceptanceId || evidence.operatorReviewId || 'migration-trial-acceptance').trim(),
    claimKind: 'migration_trial_acceptance',
    evidence: {
      acceptanceId: evidence.acceptanceId,
      capturedAt: evidence.capturedAt,
      operatorReviewId: evidence.operatorReviewId,
      sourceArtifactSha256: evidence.sourceArtifactSha256,
      noPatientDataConfirmed: bool(evidence.noPatientDataInArtifactsConfirmed),
      realDataEquivalentConfirmed: bool(evidence.realDataEquivalentConfirmed),
      sourceSystemExportedByCustomerConfirmed: bool(evidence.sourceSystemExportedByCustomerConfirmed),
      fieldMappingReviewed: bool(evidence.fieldMappingReviewed),
      restorePreviewCompleted: bool(evidence.restorePreviewCompleted),
      firstDayTrialPlanReady: bool(evidence.firstDayTrialPlanReady),
      ownerReviewCompleted: bool(evidence.ownerReviewCompleted),
      packageStatus: packageReview?.status,
      readyForOneDayTrial: packageReview?.readyForOneDayTrial,
      patientRows,
      visitRows,
      drugStockRows,
      soapRows,
      totalIssueCount: packageReview?.totalIssueCount ?? 0,
      referenceIssueCount: packageReview?.referenceIssueCount ?? 0
    },
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });

  const gates: MigrationTrialAcceptanceGate[] = [
    packageReview
      ? passGate('package_review_attached', '移行パックレビュー添付', '移行パックレビューJSONを添付', '添付済み')
      : gate({
        id: 'package_review_attached',
        title: '移行パックレビュー添付',
        status: 'blocked',
        target: '移行パックレビューJSONを添付',
        actual: '未添付',
        nextAction: '患者、受付、在庫、薬歴CSVをプレビューし、移行パックレビューを作成する'
      }),
    bool(evidence.noPatientDataInArtifactsConfirmed) && packagePrivacySafe(packageReview)
      ? passGate('privacy', '患者情報なし成果物', '成果物に患者名、原文行、ローカルパス、ファイル名、元IDを残さない', '確認済み')
      : gate({
        id: 'privacy',
        title: '患者情報なし成果物',
        status: 'blocked',
        target: '成果物に患者名、原文行、ローカルパス、ファイル名、元IDを残さない',
        actual: bool(evidence.noPatientDataInArtifactsConfirmed) ? '親レビュー確認済み / 移行パック未確認' : '未確認',
        nextAction: '患者情報なしの集計結果だけを成果物に残し、CSV原文とファイル名は別管理にする'
      }),
    gate({
      id: 'evidence_integrity',
      title: '証跡の出所と安全性',
      status: evidenceIntegrity.status,
      target: '取得日時、匿名確認ID、元資料SHA-256、患者情報なし確認を揃え、ダミー値を使わない',
      actual: `${evidenceIntegrity.statusLabel} / 指摘${evidenceIntegrity.issues.length}件`,
      nextAction: evidenceIntegrity.requiredActions.join(' / ') || '対応不要'
    }),
    bool(evidence.realDataEquivalentConfirmed) && bool(evidence.sourceSystemExportedByCustomerConfirmed)
      ? passGate('real_data_equivalent', '実データ相当サンプル', '本番移行に近い他社出力または顧客提供相当のCSV/TSVを使う', '確認済み')
      : gate({
        id: 'real_data_equivalent',
        title: '実データ相当サンプル',
        status: 'attention',
        target: '本番移行に近い他社出力または顧客提供相当のCSV/TSVを使う',
        actual: [
          bool(evidence.realDataEquivalentConfirmed) ? '実データ相当' : 'テスト値または未確認',
          bool(evidence.sourceSystemExportedByCustomerConfirmed) ? '他社出力確認済み' : '他社出力未確認'
        ].join(' / '),
        nextAction: '他社ソフトからの実データ相当CSV/TSVで再レビューする'
      }),
    gate({
      id: 'package_readiness',
      title: '移行パック判定',
      status: packageReadyStatus,
      target: '患者、受付、在庫、薬歴、参照整合性が導入移行OK',
      actual: packageReview
        ? `${packageReview.statusLabel} / CSV指摘${packageReview.totalIssueCount}件 / 参照不整合${packageReview.referenceIssueCount}件`
        : '未記録',
      nextAction: packageReadyStatus === 'pass'
        ? '対応不要'
        : '移行パックレビューの未完了、CSV指摘、参照不整合を修正する'
    }),
    gate({
      id: 'first_day_operational_flow',
      title: '初日業務のつながり',
      status: operationalCoverage.status,
      target: '患者と受付、在庫確認、薬歴参照が1日テストで追える',
      actual: operationalCoverage.workflows
        .map((item) => `${item.title} ${item.statusLabel} (${item.actual})`)
        .join(' / '),
      nextAction: operationalCoverage.requiredActions.join(' / ')
    }),
    sampleRowsOk
      ? passGate(
        'sample_coverage',
        'サンプル件数',
        `患者${targets.minPatientRows}件以上、受付${targets.minVisitRows}件以上、在庫${targets.minDrugStockRows}件以上、薬歴${targets.minSoapRows}件以上`,
        `患者${patientRows}件 / 受付${visitRows}件 / 在庫${drugStockRows}件 / 薬歴${soapRows}件`
      )
      : gate({
        id: 'sample_coverage',
        title: 'サンプル件数',
        status: 'attention',
        target: `患者${targets.minPatientRows}件以上、受付${targets.minVisitRows}件以上、在庫${targets.minDrugStockRows}件以上、薬歴${targets.minSoapRows}件以上`,
        actual: `患者${patientRows}件 / 受付${visitRows}件 / 在庫${drugStockRows}件 / 薬歴${soapRows}件`,
        nextAction: '本番移行に近い件数のサンプルを追加し、境界ケースを含める'
      }),
    bool(evidence.fieldMappingReviewed)
      ? passGate('field_mapping_review', '列対応レビュー', '列名ゆれ、自動採番、必須列、文字化け疑いを責任者が確認', '確認済み')
      : gate({
        id: 'field_mapping_review',
        title: '列対応レビュー',
        status: 'attention',
        target: '列名ゆれ、自動採番、必須列、文字化け疑いを責任者が確認',
        actual: '未確認',
        nextAction: '列対応、自動採番、文字化け疑いを移行責任者が確認する'
      }),
    oneDayReady
      ? passGate('one_day_trial', '導入1日テスト', '復旧前プレビューと1日テスト計画が揃い、開始OK', '開始OK')
      : gate({
        id: 'one_day_trial',
        title: '導入1日テスト',
        status: packageReview?.readyForOneDayTrial ? 'attention' : 'blocked',
        target: '復旧前プレビューと1日テスト計画が揃い、開始OK',
        actual: [
          packageReview?.readyForOneDayTrial ? '移行レビュー開始OK' : '移行レビュー要確認',
          bool(evidence.restorePreviewCompleted) ? '復旧前プレビュー済み' : '復旧前プレビュー未確認',
          bool(evidence.firstDayTrialPlanReady) ? '1日計画あり' : '1日計画なし'
        ].join(' / '),
        nextAction: '復旧前プレビュー、初回セットアップ、請求テスト、帳票印刷テストの1日導入計画をそろえる'
      }),
    bool(evidence.ownerReviewCompleted)
      ? passGate('owner_review', '責任者レビュー', '移行責任者が開始可否と残対応を確認', '確認済み')
      : gate({
        id: 'owner_review',
        title: '責任者レビュー',
        status: 'attention',
        target: '移行責任者が開始可否と残対応を確認',
        actual: '未確認',
        nextAction: '移行責任者が開始可否、残対応、再プレビュー要否を確認する'
      })
  ];
  const status = summarizeStatus(gates);
  const readyForOneDayTrial = status === 'pass' && oneDayReady;

  return {
    type: 'yakureki-migration-trial-acceptance',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    acceptanceId: String(evidence.acceptanceId || 'migration-trial-acceptance').trim(),
    status,
    statusLabel: statusLabel(status),
    actionLabel: actionLabel(status, readyForOneDayTrial),
    readyForOneDayTrial,
    targets,
    metrics: {
      patientRows,
      visitRows,
      drugStockRows,
      soapRows,
      totalRowCount: packageReview?.totalRowCount ?? 0,
      totalIssueCount: packageReview?.totalIssueCount ?? 0,
      referenceIssueCount: packageReview?.referenceIssueCount ?? 0,
      blockedSourceCount: packageReview?.blockedSourceCount ?? 0,
      attentionSourceCount: packageReview?.attentionSourceCount ?? 0
    },
    evidence: {
      capturedAt: String(evidence.capturedAt || '').trim(),
      operatorReviewId: String(evidence.operatorReviewId || '').trim(),
      sourceArtifactSha256: String(evidence.sourceArtifactSha256 || '').trim(),
      noPatientDataInArtifactsConfirmed: bool(evidence.noPatientDataInArtifactsConfirmed),
      realDataEquivalentConfirmed: bool(evidence.realDataEquivalentConfirmed),
      sourceSystemExportedByCustomerConfirmed: bool(evidence.sourceSystemExportedByCustomerConfirmed),
      fieldMappingReviewed: bool(evidence.fieldMappingReviewed),
      restorePreviewCompleted: bool(evidence.restorePreviewCompleted),
      firstDayTrialPlanReady: bool(evidence.firstDayTrialPlanReady),
      ownerReviewCompleted: bool(evidence.ownerReviewCompleted)
    },
    privacy: PRIVACY_FLAGS,
    evidenceIntegrity,
    operationalCoverage,
    sources: packageReview?.sources ?? [],
    references: packageReview?.references ?? [],
    gates,
    passedGateCount: gates.filter((gateItem) => gateItem.status === 'pass').length,
    attentionGateCount: gates.filter((gateItem) => gateItem.status === 'attention').length,
    blockedGateCount: gates.filter((gateItem) => gateItem.status === 'blocked').length,
    nextActions: uniqueActions(gates)
  };
}

export function buildMigrationTrialAcceptanceEvidenceTemplate(input: {
  generatedAt?: Date;
  acceptanceId?: string;
  targets?: Partial<MigrationTrialAcceptanceTargets>;
} = {}): MigrationTrialAcceptanceEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-migration-trial-acceptance-evidence-template',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    acceptanceId: input.acceptanceId || 'migration-trial-acceptance',
    guidance: '患者名、患者ID、受付ID、薬歴本文、ファイル名、ローカルパス、自由記述メモはこのJSONや成果物に書かず、CSV原本は店舗内の別管理にしてください。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataInArtifactsConfirmed: false,
    realDataEquivalentConfirmed: false,
    sourceSystemExportedByCustomerConfirmed: false,
    fieldMappingReviewed: false,
    restorePreviewCompleted: false,
    firstDayTrialPlanReady: false,
    ownerReviewCompleted: false,
    targets: mergeTargets(input.targets),
    privacy: PRIVACY_FLAGS
  };
}

function sampleRequestItem(options: MigrationTrialAcceptanceSampleRequestItem): MigrationTrialAcceptanceSampleRequestItem {
  return options;
}

export function buildMigrationTrialAcceptanceSampleRequest(input: {
  generatedAt?: Date;
  acceptanceId?: string;
  targets?: Partial<MigrationTrialAcceptanceTargets>;
} = {}): MigrationTrialAcceptanceSampleRequest {
  const generatedAt = input.generatedAt ?? new Date();
  const targets = mergeTargets(input.targets);
  return {
    type: 'yakureki-migration-trial-acceptance-sample-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    acceptanceId: input.acceptanceId || 'migration-trial-acceptance',
    guidance: '他社ソフトから出した実データ相当CSV/TSVを店舗内で管理し、pharma-ossには件数、列対応、指摘件数、参照不整合だけを成果物として残します。',
    targets,
    items: [
      sampleRequestItem({
        id: 'patients_csv',
        title: '患者CSV/TSV',
        required: true,
        acceptedFormats: ['CSV', 'TSV'],
        minimumRows: targets.minPatientRows,
        neededColumns: ['患者番号またはカルテ番号', '氏名', '生年月日'],
        purpose: '受付CSVとの対応関係と導入初日の患者検索を確認する',
        storeOnly: '患者名、患者番号、保険証番号などの原本は店舗内だけで扱う',
        supportShare: '成果物では件数、列認識数、ID欠落数、重複数だけを共有する'
      }),
      sampleRequestItem({
        id: 'visits_csv',
        title: '受付CSV/TSV',
        required: true,
        acceptedFormats: ['CSV', 'TSV'],
        minimumRows: targets.minVisitRows,
        neededColumns: ['受付番号または来局番号', '患者番号またはカルテ番号', '来局日または調剤日'],
        purpose: '導入初日の受付一覧から患者情報へたどれるか確認する',
        storeOnly: '受付番号、患者番号、医療機関名などの原本は店舗内だけで扱う',
        supportShare: '成果物では受付件数、患者との対応確認件数、参照不整合数だけを共有する'
      }),
      sampleRequestItem({
        id: 'drug_stocks_csv',
        title: '在庫CSV/TSV',
        required: true,
        acceptedFormats: ['CSV', 'TSV'],
        minimumRows: targets.minDrugStockRows,
        neededColumns: ['薬品コード', '在庫数'],
        purpose: '導入初日に在庫確認と発注判断へ進めるか確認する',
        storeOnly: 'ロット番号や仕入先などの原本は店舗内だけで扱う',
        supportShare: '成果物では在庫件数、列認識数、数量不備件数だけを共有する'
      }),
      sampleRequestItem({
        id: 'soap_records_csv',
        title: '薬歴CSV/TSV',
        required: true,
        acceptedFormats: ['CSV', 'TSV'],
        minimumRows: targets.minSoapRows,
        neededColumns: ['薬歴番号または記録番号', '受付番号または来局番号', '記録日', '薬歴本文またはSOAP各欄'],
        purpose: '導入初日に過去薬歴を受付から参照できるか確認する',
        storeOnly: '薬歴本文、指導内容、記録者IDなどの原本は店舗内だけで扱う',
        supportShare: '成果物では薬歴件数、受付との対応確認件数、参照不整合数だけを共有する'
      }),
      sampleRequestItem({
        id: 'evidence_json',
        title: '移行受入証跡JSON',
        required: true,
        acceptedFormats: ['JSON'],
        neededColumns: [
          '取得日時',
          '匿名確認ID',
          '元資料SHA-256',
          '患者情報なし確認',
          '実データ相当確認',
          '復旧前プレビュー確認',
          '1日テスト計画確認',
          '責任者レビュー'
        ],
        purpose: 'ダミーではなく、本番移行に近いサンプルとして扱ってよいか確認する',
        storeOnly: '元資料そのもの、ファイル名、ローカルパス、自由記述メモは店舗内だけで扱う',
        supportShare: '成果物では確認済みフラグ、証跡品質、ゲート不足だけを共有する'
      })
    ],
    operatorChecks: [
      '他社ソフトから出した実データ相当サンプルである',
      '患者CSVと受付CSVの対応関係を確認できる',
      '薬歴CSVと受付CSVの対応関係を確認できる',
      '在庫CSVで導入初日の在庫確認ができる',
      '復旧前プレビュー、1日テスト計画、責任者レビューが同じ証跡束に入っている'
    ],
    privacyRules: [
      '患者名、患者ID、受付ID、薬歴本文をサポート共有成果物へ入れない',
      'CSV原文、ファイル名、ローカルパスをサポート共有成果物へ入れない',
      '自由記述メモではなく、確認済みフラグと集計値で共有する',
      'ダミー、モック、練習データを実データ相当サンプルとして扱わない'
    ],
    commandEnvironment: {
      patientCsv: 'YAKUREKI_MIGRATION_PATIENT_CSV',
      visitCsv: 'YAKUREKI_MIGRATION_VISIT_CSV',
      drugStockCsv: 'YAKUREKI_MIGRATION_DRUG_STOCK_CSV',
      soapCsv: 'YAKUREKI_MIGRATION_SOAP_CSV',
      evidenceJson: 'YAKUREKI_MIGRATION_ACCEPTANCE_EVIDENCE',
      outputDir: 'YAKUREKI_MIGRATION_ACCEPTANCE_OUTPUT_DIR'
    }
  };
}

export function buildMigrationTrialAcceptanceSampleRequestChecklist(
  request: MigrationTrialAcceptanceSampleRequest
): string {
  return [
    `移行サンプル提出依頼 ${request.acceptanceId}`,
    '目的: 導入初日に患者受付、在庫確認、薬歴参照を1日で試せる状態にする',
    '',
    '提出してほしいもの:',
    ...request.items.map((item) => [
      `- ${item.title}: ${item.required ? '必須' : '任意'} / ${item.acceptedFormats.join('または')}`,
      item.minimumRows !== undefined ? `  目安: ${item.minimumRows}件以上` : '',
      `  必要な列: ${item.neededColumns.join('、')}`,
      `  目的: ${item.purpose}`,
      `  店舗内だけで扱うもの: ${item.storeOnly}`,
      `  共有成果物に残すもの: ${item.supportShare}`
    ].filter(Boolean).join('\n')),
    '',
    '担当者確認:',
    ...request.operatorChecks.map((check) => `- ${check}`),
    '',
    '共有時のルール:',
    ...request.privacyRules.map((rule) => `- ${rule}`),
    '',
    'CLI入力環境変数:',
    `- 患者CSV: ${request.commandEnvironment.patientCsv}`,
    `- 受付CSV: ${request.commandEnvironment.visitCsv}`,
    `- 在庫CSV: ${request.commandEnvironment.drugStockCsv}`,
    `- 薬歴CSV: ${request.commandEnvironment.soapCsv}`,
    `- 証跡JSON: ${request.commandEnvironment.evidenceJson}`,
    `- 出力先: ${request.commandEnvironment.outputDir}`
  ].join('\n');
}

export function buildMigrationTrialAcceptanceCsv(review: MigrationTrialAcceptanceReview): string {
  const rows = [
    ['区分', '判定', '対象', '目標', '実績', '次の対応'],
    [
      '総括',
      review.statusLabel,
      review.acceptanceId,
      'P6-01 実データ相当移行受入',
      `${review.actionLabel} / ${review.operationalCoverage.statusLabel} / 患者${review.metrics.patientRows}件 / 受付${review.metrics.visitRows}件 / CSV指摘${review.metrics.totalIssueCount}件 / 参照不整合${review.metrics.referenceIssueCount}件`,
      review.nextActions[0] ?? '対応不要'
    ],
    ...review.gates.map((gateItem) => [
      '確認ゲート',
      gateItem.statusLabel,
      gateItem.title,
      gateItem.target,
      gateItem.actual,
      gateItem.nextAction
    ]),
    ...review.operationalCoverage.workflows.map((workflowItem) => [
      '初日業務',
      workflowItem.statusLabel,
      workflowItem.title,
      '1日テストで追える',
      workflowItem.actual,
      workflowItem.nextAction
    ]),
    ...review.sources.map((source) => [
      '移行CSV',
      source.statusLabel,
      source.title,
      source.required ? '必須' : '推奨',
      `${source.rowCount}件 / エラー${source.errorIssueCount}件 / 確認${source.warningIssueCount}件`,
      source.nextAction
    ]),
    ...review.references.map((reference) => [
      '対応関係',
      reference.statusLabel,
      reference.title,
      `${reference.checkedRowCount}件確認`,
      `${reference.issueCount}件`,
      reference.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildMigrationTrialAcceptanceChecklist(review: MigrationTrialAcceptanceReview): string {
  return [
    `実データ相当移行受入 ${review.statusLabel}`,
    `対象: ${review.acceptanceId}`,
    `1日テスト: ${review.readyForOneDayTrial ? '開始OK' : '要確認'}`,
    `初日業務: ${review.operationalCoverage.statusLabel} (${review.operationalCoverage.readyWorkflowCount}/${review.operationalCoverage.totalWorkflowCount})`,
    `件数: 患者${review.metrics.patientRows}件 / 受付${review.metrics.visitRows}件 / 在庫${review.metrics.drugStockRows}件 / 薬歴${review.metrics.soapRows}件`,
    '',
    '受入前に見るもの:',
    '- 患者CSVと受付CSVがそろっているか',
    '- 受付が患者に結び付き、導入初日に受付一覧から患者情報へたどれるか',
    '- 在庫CSVと薬歴CSVも実データ相当として確認できているか',
    '- 薬歴が受付に結び付き、導入初日に過去記録を確認できるか',
    '- ID欠落、同一ID重複、文字化け疑い、参照不整合が残っていないか',
    '- 復旧前プレビューと導入1日テスト計画があるか',
    '- 移行責任者が開始可否を確認したか',
    '',
    'このチェックリストに入れないもの:',
    '- 患者名、患者ID、受付ID、薬歴本文',
    '- CSV原文、ファイル名、ローカルパス、自由記述メモ',
    '',
    '未完了の次対応:',
    ...(review.nextActions.length > 0 ? review.nextActions.map((action) => `- ${action}`) : ['- 対応不要'])
  ].join('\n');
}

export function buildMigrationTrialAcceptanceAuditDetail(review: MigrationTrialAcceptanceReview): string {
  const nextActionText = review.nextActions.length > 0 ? ` / 次対応: ${review.nextActions.join('、')}` : '';
  return `実データ相当移行受入 ${review.statusLabel} / ${review.operationalCoverage.statusLabel} ${review.operationalCoverage.readyWorkflowCount}/${review.operationalCoverage.totalWorkflowCount} / 患者${review.metrics.patientRows}件・受付${review.metrics.visitRows}件・在庫${review.metrics.drugStockRows}件・薬歴${review.metrics.soapRows}件 / CSV指摘${review.metrics.totalIssueCount}件・参照不整合${review.metrics.referenceIssueCount}件 / 1日テスト ${review.readyForOneDayTrial ? '開始OK' : '要確認'}${nextActionText}`;
}
