import type { AnonymousDiagnosticExport } from './anonymous_diagnostic_export.ts';

export type SupportCasePriority = 'urgent' | 'high' | 'normal' | 'watch';
export type SupportCaseStatus = 'needs_support' | 'ready_to_close';

export interface SupportCaseFocusArea {
  id: string;
  title: string;
  priority: SupportCasePriority;
  priorityLabel: string;
  statusLabel: string;
  signalCount: number;
  nextAction: string;
  supportOwner: 'pharmacy' | 'support' | 'joint';
  reproduceSteps: string[];
}

export interface SupportCaseTriage {
  type: 'yakureki-support-case-triage';
  schemaVersion: 1;
  generatedAt: string;
  diagnosticGeneratedAt: string;
  status: SupportCaseStatus;
  statusLabel: string;
  priority: SupportCasePriority;
  priorityLabel: string;
  summary: string;
  privacy: {
    containsPatientData: false;
    containsStaffNames: false;
    containsFacilityName: false;
    containsRawAuditDetails: false;
    containsLocalPath: false;
    containsExternalSecrets: false;
  };
  snapshot: {
    auditLogCount: number;
    latestAuditLogRecorded: boolean;
    collectionCount: number;
    totalCollectionRows: number;
    officialAuditBlockerCount: number;
    externalConnectorCount: number;
    unresolvedInitialSetupSteps: number;
  };
  focusAreas: SupportCaseFocusArea[];
}

const PRIORITY_ORDER: Record<SupportCasePriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  watch: 1
};

const PRIORITY_LABELS: Record<SupportCasePriority, string> = {
  urgent: '最優先',
  high: '高',
  normal: '通常',
  watch: '経過観察'
};

function priorityLabel(priority: SupportCasePriority): string {
  return PRIORITY_LABELS[priority];
}

function comparePriority(left: SupportCasePriority, right: SupportCasePriority): number {
  return PRIORITY_ORDER[right] - PRIORITY_ORDER[left];
}

function highestPriority(items: SupportCaseFocusArea[]): SupportCasePriority {
  return items
    .map((item) => item.priority)
    .sort((left, right) => comparePriority(left, right))[0] ?? 'watch';
}

function statusToPriority(status: string | undefined, blockedPriority: SupportCasePriority, attentionPriority: SupportCasePriority): SupportCasePriority {
  if (status === 'blocked' || status === 'open') return blockedPriority;
  if (status === 'attention' || status === 'partial') return attentionPriority;
  return 'watch';
}

function addFocusArea(items: SupportCaseFocusArea[], item: Omit<SupportCaseFocusArea, 'priorityLabel'>) {
  items.push({
    ...item,
    priorityLabel: priorityLabel(item.priority)
  });
}

function summarizeStatusLabel(status: string | undefined, fallback: string): string {
  return status || fallback;
}

function totalCollectionRows(diagnostic: AnonymousDiagnosticExport): number {
  return Object.values(diagnostic.collections).reduce((sum, collection) => sum + collection.rowCount, 0);
}

function initialSetupFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const setup = diagnostic.workflows.initialSetup;
  if (setup.status === 'complete') return;
  addFocusArea(items, {
    id: 'initial_setup',
    title: '初回セットアップ',
    priority: setup.status === 'blocked' ? 'high' : 'normal',
    statusLabel: setup.statusLabel,
    signalCount: setup.unresolvedStepCount,
    nextAction: setup.nextStepId
      ? `初回セットアップの ${setup.nextStepId} ステップから確認する`
      : '未完了ステップを上から確認する',
    supportOwner: 'joint',
    reproduceSteps: [
      '設定画面の初回セットアップを開く',
      '診断JSONの initialSetup.nextStepId と画面上の次作業が一致するか確認する',
      '未完了ステップの件数だけをサポート記録へ転記する'
    ]
  });
}

function migrationFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const migration = diagnostic.workflows.migrationPackageReadiness;
  if (!migration || migration.status === 'pass') return;
  addFocusArea(items, {
    id: 'migration_package',
    title: '導入移行データ',
    priority: migration.status === 'blocked' ? 'high' : 'normal',
    statusLabel: migration.statusLabel,
    signalCount: migration.totalIssueCount + migration.referenceIssueCount,
    nextAction: migration.status === 'blocked'
      ? '必須CSV、ID欠落、同一ID重複、患者と受付、受付と薬歴の対応を確認する'
      : '文字化け疑い、自動採番、任意CSVの不足を責任者確認に回す',
    supportOwner: 'joint',
    reproduceSteps: [
      '設定画面の移行CSVプレビューを開く',
      '患者、受付、在庫、薬歴の提供有無と件数を診断JSONと照合する',
      '参照不整合件数が0になるまで移行元CSVを再出力または補正する'
    ]
  });
}

function migrationTrialAcceptanceFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const migration = diagnostic.workflows.migrationTrialAcceptance;
  if (!migration || migration.readyForOneDayTrial) return;
  const hasActiveSignal = migration.status !== 'pass'
    || migration.operationalCoverageStatus !== 'pass'
    || migration.totalIssueCount > 0
    || migration.referenceIssueCount > 0
    || migration.blockedSourceCount > 0
    || migration.attentionSourceCount > 0
    || migration.evidenceIntegrityIssueCount > 0
    || migration.blockedGateCount > 0
    || migration.attentionGateCount > 0
    || !migration.realDataEquivalentConfirmed
    || !migration.sourceSystemExportedByCustomerConfirmed
    || !migration.fieldMappingReviewed
    || !migration.restorePreviewCompleted
    || !migration.firstDayTrialPlanReady
    || !migration.ownerReviewCompleted;
  if (!hasActiveSignal) return;

  const signalCount = Math.max(1,
    migration.totalIssueCount
    + migration.referenceIssueCount
    + migration.blockedSourceCount
    + migration.attentionSourceCount
    + migration.evidenceIntegrityIssueCount
    + migration.blockedGateCount
    + migration.attentionGateCount
    + (migration.realDataEquivalentConfirmed ? 0 : 1)
    + (migration.sourceSystemExportedByCustomerConfirmed ? 0 : 1)
    + (migration.fieldMappingReviewed ? 0 : 1)
    + (migration.restorePreviewCompleted ? 0 : 1)
    + (migration.firstDayTrialPlanReady ? 0 : 1)
    + (migration.ownerReviewCompleted ? 0 : 1)
  );
  const hasBlockedSignal = migration.status === 'blocked'
    || migration.operationalCoverageStatus === 'blocked'
    || migration.referenceIssueCount > 0
    || migration.blockedSourceCount > 0
    || migration.blockedGateCount > 0;
  const statusLabel = migration.operationalCoverageStatus === 'pass'
    ? migration.statusLabel
    : `${migration.statusLabel} / ${migration.operationalCoverageStatusLabel}`;

  addFocusArea(items, {
    id: 'migration_trial_acceptance',
    title: '移行受入・1日テスト',
    priority: hasBlockedSignal ? 'high' : 'normal',
    statusLabel,
    signalCount,
    nextAction: hasBlockedSignal
      ? '患者と受付、在庫、薬歴の参照整合と復旧前プレビューを確認する'
      : '実データ相当、列対応、1日テスト計画、責任者レビューを確認する',
    supportOwner: 'joint',
    reproduceSteps: [
      'migration:trial-acceptance のJSONを確認する',
      '診断JSONの migrationTrialAcceptance で患者、受付、在庫、薬歴の件数、初日業務、証跡品質を確認する',
      'CSV原文や移行元IDではなく、件数、参照不整合、確認済みフラグだけで不足ゲートを記録する'
    ]
  });
}

function printFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const print = diagnostic.workflows.printMediaFieldVerification;
  if (!print || print.status === 'pass') return;
  const missingScreenshots = Math.max(0, print.requiredDocumentCount - print.screenshotDocumentCount);
  const missingFieldEvidence = Math.max(0, print.requiredDocumentCount - print.fieldEvidenceDocumentCount);
  const missingPrinterChecks = Math.max(0, print.requiredDocumentCount - (print.printerCheckedCount ?? 0));
  const missingPaperChecks = Math.max(0, print.requiredDocumentCount - (print.paperMatchedCount ?? 0));
  const clippingIssues = Math.max(0, print.requiredDocumentCount - (print.noClippingCount ?? 0));
  const readabilityIssues = Math.max(0, print.requiredDocumentCount - (print.textReadableCount ?? 0));
  const marginIssues = Math.max(0, print.requiredDocumentCount - (print.marginWithinToleranceCount ?? 0));
  const sizeIssues = Math.max(0, print.requiredDocumentCount - (print.sizeWithinToleranceCount ?? 0));
  const evidenceIntegrityIssues = print.evidenceIntegrityIssueCount ?? 0;
  const hasBlockedSignal = print.status === 'blocked'
    || missingScreenshots > 0
    || evidenceIntegrityIssues > 0;
  const nextAction = missingScreenshots > 0
    ? 'スクリーンショット回帰で捕捉できていない帳票を先に復旧する'
    : evidenceIntegrityIssues > 0
      ? '実紙確認JSONの証跡品質と患者情報なし確認を見直す'
      : missingFieldEvidence > 0
        ? '実プリンタ、実紙、PDF、ラベル紙の確認結果を実紙確認JSONへ記録する'
        : '切れ、読みやすさ、余白、寸法の未確認帳票を実紙で確認する';
  addFocusArea(items, {
    id: 'print_media',
    title: '帳票・実紙検証',
    priority: hasBlockedSignal ? 'high' : 'normal',
    statusLabel: print.statusLabel,
    signalCount: print.attentionDocumentCount
      + print.blockedDocumentCount
      + missingFieldEvidence
      + missingPrinterChecks
      + missingPaperChecks
      + clippingIssues
      + readabilityIssues
      + marginIssues
      + sizeIssues
      + evidenceIntegrityIssues,
    nextAction,
    supportOwner: 'pharmacy',
    reproduceSteps: [
      '印刷ページで主要帳票を表示する',
      '診断JSONの printMediaFieldVerification でスクリーンショット件数、実紙確認件数、証跡品質を確認する',
      '実紙確認JSONには患者名、スクリーンショットファイル名、プリンタ名、確認者名を入れず、確認済みフラグと寸法差だけを記録する',
      '切れ、読みやすさ、余白、寸法の現物確認結果を帳票・実紙検証依頼書に沿って記録する'
    ]
  });
}

function externalConnectorFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const external = diagnostic.externalConnectors;
  if (!external || external.overallStatus === 'ready') return;
  const fieldReadiness = external.fieldReadiness;
  addFocusArea(items, {
    id: 'external_connector',
    title: '外部接続・オンライン資格確認',
    priority: fieldReadiness?.status === 'blocked' ? 'high' : 'normal',
    statusLabel: fieldReadiness?.statusLabel ?? external.overallStatus,
    signalCount: (fieldReadiness?.attentionGateCount ?? 0) + (fieldReadiness?.blockedGateCount ?? 0),
    nextAction: fieldReadiness?.canRunFieldSuccessTrial
      ? '現地機器で成功試行と公式実レスポンス差分を記録する'
      : '公式認証方式、現地機器、資格確認成功、実レスポンス差分の不足ゲートを確認する',
    supportOwner: 'support',
    reproduceSteps: [
      '設定画面の外部連携設定を開く',
      'URLやトークンは共有せず、診断JSONの接続モード、直近結果、ゲート判定だけを確認する',
      '現地機器で再試行し、成功または失敗の種類を診断JSONに反映する'
    ]
  });
}

function continuityFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const backup = diagnostic.workflows.backupGeneration;
  const schedule = diagnostic.workflows.backupSchedule;
  const scheduledOps = diagnostic.workflows.scheduledOpsContinuity;
  const blockedSignals = [
    backup.status === 'blocked',
    schedule.status === 'blocked',
    scheduledOps?.status === 'blocked'
  ].filter(Boolean).length;
  const attentionSignals = [
    backup.status === 'attention',
    schedule.status === 'attention',
    scheduledOps?.status === 'attention'
  ].filter(Boolean).length;
  if (blockedSignals + attentionSignals === 0) return;
  addFocusArea(items, {
    id: 'backup_continuity',
    title: 'バックアップ・定期運用',
    priority: blockedSignals > 0 ? 'high' : 'normal',
    statusLabel: blockedSignals > 0 ? 'バックアップ運用に未完了あり' : 'バックアップ運用を確認',
    signalCount: blockedSignals + attentionSignals,
    nextAction: blockedSignals > 0
      ? '暗号化バックアップ、外部保存、復旧テスト、定期ジョブの不足を先に解消する'
      : '直近バックアップ、外部保存、復旧テスト、定期ジョブ証跡の鮮度を確認する',
    supportOwner: 'joint',
    reproduceSteps: [
      '設定画面のバックアップと監査ログ保全を開く',
      '診断JSONのバックアップ世代数、外部保存、復旧テスト、定期運用レビュー件数を確認する',
      '不足している点検受領書または失敗後の復旧点検を記録する'
    ]
  });
}

function staffAccessRecoveryFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const staffAccess = diagnostic.workflows.staffAccessRecovery;
  const monthly = diagnostic.workflows.staffAccessRecoveryMonthly;
  const staffAccessActive = Boolean(staffAccess && staffAccess.status !== 'pass');
  const monthlyActive = Boolean(monthly && monthly.status !== 'pass');
  if (!staffAccessActive && !monthlyActive) return;

  const staffAccessSignalCount = staffAccessActive && staffAccess
    ? staffAccess.blockedCaseCount
      + staffAccess.attentionCaseCount
      + staffAccess.missingReasonCount
      + staffAccess.evidenceIntegrityIssueCount
    : 0;
  const monthlySignalCount = monthlyActive && monthly
    ? monthly.blockedCaseCount
      + monthly.attentionCaseCount
      + monthly.missingReasonCount
      + monthly.evidenceIntegrityIssueCount
      + monthly.requiredActionCount
    : 0;
  const hasBlockedSignal = staffAccess?.status === 'blocked' || monthly?.status === 'blocked' || monthly?.readyForMonthlyClose === false;
  const signalCount = Math.max(1, staffAccessSignalCount + monthlySignalCount);
  const statusLabel = [
    staffAccessActive && staffAccess ? staffAccess.statusLabel : '',
    monthlyActive && monthly ? `月次棚卸: ${monthly.statusLabel}` : ''
  ].filter(Boolean).join(' / ');
  addFocusArea(items, {
    id: 'staff_access_recovery',
    title: '認証復旧・退職対応',
    priority: hasBlockedSignal ? 'high' : 'normal',
    statusLabel,
    signalCount,
    nextAction: hasBlockedSignal
      ? '管理者残存、変更前バックアップ、操作ログ、責任者確認の不足を先に確認する'
      : monthlyActive
        ? '当月の認証復旧・退職対応を月次棚卸し、未確認場面を匿名証跡へ追加する'
        : '端末移行、スタッフ退職、パスキー紛失の未確認ケースを匿名証跡へ追加する',
    supportOwner: 'joint',
    reproduceSteps: [
      '設定画面の復旧・退職対応を開く',
      '診断JSONの staffAccessRecovery と staffAccessRecoveryMonthly でケース件数、当月対象操作、保留件数、未確認場面を確認する',
      '氏名や監査ログ本文は受け取らず、匿名ケースIDと対象ロールだけで不足ゲートを記録する'
    ]
  });
}

function pilotKpiFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const pilot = diagnostic.workflows.pilotKpi;
  if (!pilot) return;
  const hasActiveSignal = pilot.status !== 'pass'
    || pilot.trendStatus !== 'pass'
    || pilot.missingMetricCount > 0
    || pilot.criticalIncidentCount > 0
    || pilot.unrecoveredIncidentCount > 0
    || pilot.evidenceIntegrityIssueCount > 0
    || pilot.blockedGateCount > 0
    || pilot.attentionGateCount > 0;
  if (!hasActiveSignal) return;

  const signalCount = Math.max(1,
    pilot.missingMetricCount
    + pilot.criticalIncidentCount
    + pilot.unrecoveredIncidentCount
    + pilot.worseningStoreCount
    + pilot.insufficientTrendStoreCount
    + pilot.evidenceIntegrityIssueCount
    + pilot.blockedGateCount
    + pilot.attentionGateCount
  );
  const hasBlockedSignal = pilot.status === 'blocked'
    || pilot.criticalIncidentCount > 0
    || pilot.unrecoveredIncidentCount > 0
    || pilot.blockedGateCount > 0;
  const statusLabel = pilot.trendStatus === 'pass'
    ? pilot.statusLabel
    : `${pilot.statusLabel} / ${pilot.trendStatusLabel}`;

  addFocusArea(items, {
    id: 'pilot_kpi',
    title: 'パイロットKPI',
    priority: hasBlockedSignal ? 'high' : 'normal',
    statusLabel,
    signalCount,
    nextAction: hasBlockedSignal
      ? '重大障害、未復旧、証跡品質、4週間KPIの不足を確認する'
      : '後半悪化、未入力指標、改善アクションを匿名KPI証跡で確認する',
    supportOwner: 'joint',
    reproduceSteps: [
      'pilot:kpi-review のJSONを確認する',
      '診断JSONの pilotKpi で店舗数、週数、後半悪化、重大障害、証跡品質を確認する',
      '店舗名や患者情報ではなく匿名店舗IDと集計値だけで不足ゲートを記録する'
    ]
  });
}

function releaseOpsAcceptanceFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const releaseOps = diagnostic.workflows.releaseOpsAcceptance;
  if (!releaseOps || releaseOps.readyForReleaseExpansion) return;
  const hasActiveSignal = releaseOps.status !== 'pass'
    || releaseOps.linkageStatus !== 'pass'
    || releaseOps.evidenceIntegrityIssueCount > 0
    || releaseOps.totalBlockedCount > 0
    || releaseOps.totalAttentionCount > 0
    || releaseOps.blockedGateCount > 0
    || releaseOps.attentionGateCount > 0
    || !releaseOps.realInquiryOrUpdateFailureDrillConfirmed
    || !releaseOps.ownerApproved
    || !releaseOps.handoffChecklistStored
    || !releaseOps.nextBusinessDayReviewScheduled;
  if (!hasActiveSignal) return;

  const signalCount = Math.max(1,
    releaseOps.totalBlockedCount
    + releaseOps.totalAttentionCount
    + releaseOps.blockedGateCount
    + releaseOps.attentionGateCount
    + releaseOps.evidenceIntegrityIssueCount
    + releaseOps.missingLinkageActionCount
    + (releaseOps.realInquiryOrUpdateFailureDrillConfirmed ? 0 : 1)
    + (releaseOps.ownerApproved ? 0 : 1)
    + (releaseOps.handoffChecklistStored ? 0 : 1)
    + (releaseOps.nextBusinessDayReviewScheduled ? 0 : 1)
  );
  const hasBlockedSignal = releaseOps.status === 'blocked'
    || releaseOps.linkageStatus === 'blocked'
    || releaseOps.blockedGateCount > 0
    || releaseOps.totalBlockedCount > 0
    || !releaseOps.realInquiryOrUpdateFailureDrillConfirmed;
  const statusLabel = releaseOps.linkageStatus === 'pass'
    ? releaseOps.statusLabel
    : `${releaseOps.statusLabel} / ${releaseOps.linkageStatusLabel}`;

  addFocusArea(items, {
    id: 'release_ops_acceptance',
    title: 'リリース運用受入',
    priority: hasBlockedSignal ? 'high' : 'normal',
    statusLabel,
    signalCount,
    nextAction: hasBlockedSignal
      ? '更新準備、更新後、SLA、問い合わせ訓練の添付とひも付けを確認する'
      : '責任者引き継ぎ、翌営業日レビュー、監視と問い合わせ増加を確認する',
    supportOwner: 'joint',
    reproduceSteps: [
      'release:ops-acceptance のJSONを確認する',
      '診断JSONの releaseOpsAcceptance で添付レビュー数、同一更新のひも付け、実問い合わせまたは更新失敗訓練、停止ゲートを確認する',
      '問い合わせ本文や告知本文ではなく、集計値と確認済みフラグだけで不足ゲートを記録する'
    ]
  });
}

function officialAuditFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const officialAudit = diagnostic.workflows.officialAudit;
  if (officialAudit.blockerItemCount <= 0) return;
  addFocusArea(items, {
    id: 'official_audit',
    title: '公式仕様・請求前点検',
    priority: 'high',
    statusLabel: `重大残課題 ${officialAudit.blockerItemCount}件`,
    signalCount: officialAudit.blockerItemCount,
    nextAction: '重大残課題の領域を確認し、現物受付・公式仕様差分・返戻事例の証跡を追加する',
    supportOwner: 'support',
    reproduceSteps: [
      '設定画面の公式監査台帳またはロードマップを開く',
      '診断JSONの officialAudit.blockerItemCount と台帳上の重大項目数を照合する',
      '公式資料や現物受付結果が必要な項目を未解決として管理する'
    ]
  });
}

function auditIntegrityFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const integrity = diagnostic.audit.integrity;
  if (integrity.isValid && integrity.invalid === 0) return;
  addFocusArea(items, {
    id: 'audit_integrity',
    title: '監査ログ整合性',
    priority: 'urgent',
    statusLabel: '監査ログ整合性を確認',
    signalCount: integrity.invalid,
    nextAction: '監査ログのハッシュチェーン不整合を先に確認し、該当端末の運用を止めて保全する',
    supportOwner: 'support',
    reproduceSteps: [
      '設定画面の監査ログ整合性を開く',
      '診断JSONの invalid 件数と署名済み/未署名件数を確認する',
      '責任者保全JSONを出力し、原因確認が終わるまで上書き操作を避ける'
    ]
  });
}

function dailyClosingFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  const closing = diagnostic.workflows.dailyClosing;
  if (closing.totalClosingBlockers <= 0 && closing.daysWithBlockers <= 0) return;
  addFocusArea(items, {
    id: 'daily_closing',
    title: '日次締め・残タスク',
    priority: 'normal',
    statusLabel: '日次締めに残タスクあり',
    signalCount: closing.totalClosingBlockers,
    nextAction: '日次締めレビューで残タスク日と未完了理由を確認する',
    supportOwner: 'pharmacy',
    reproduceSteps: [
      'ダッシュボードの日次締めを開く',
      '診断JSONの daysWithBlockers と画面の残タスク日数を照合する',
      '残タスクの種類だけをサポート記録へ残す'
    ]
  });
}

function defaultFocus(diagnostic: AnonymousDiagnosticExport, items: SupportCaseFocusArea[]) {
  if (items.length > 0) return;
  addFocusArea(items, {
    id: 'general_health',
    title: '全体状態',
    priority: 'watch',
    statusLabel: '大きな未完了は見つかりません',
    signalCount: 0,
    nextAction: '問い合わせ内容に合わせて画面名、操作時刻、期待結果、実際の結果を聞く',
    supportOwner: 'support',
    reproduceSteps: [
      '問い合わせの画面名と操作時刻を確認する',
      '診断JSONの件数、監査ログ最新時刻、初回セットアップ判定を確認する',
      '患者名や保険番号は受け取らず、再現操作だけを記録する'
    ]
  });
}

export function buildSupportCaseTriage(
  diagnostic: AnonymousDiagnosticExport,
  options: { generatedAt?: Date } = {}
): SupportCaseTriage {
  const generatedAt = options.generatedAt ?? new Date();
  const focusAreas: SupportCaseFocusArea[] = [];
  auditIntegrityFocus(diagnostic, focusAreas);
  officialAuditFocus(diagnostic, focusAreas);
  initialSetupFocus(diagnostic, focusAreas);
  migrationFocus(diagnostic, focusAreas);
  migrationTrialAcceptanceFocus(diagnostic, focusAreas);
  printFocus(diagnostic, focusAreas);
  externalConnectorFocus(diagnostic, focusAreas);
  continuityFocus(diagnostic, focusAreas);
  staffAccessRecoveryFocus(diagnostic, focusAreas);
  pilotKpiFocus(diagnostic, focusAreas);
  releaseOpsAcceptanceFocus(diagnostic, focusAreas);
  dailyClosingFocus(diagnostic, focusAreas);
  defaultFocus(diagnostic, focusAreas);
  focusAreas.sort((left, right) => comparePriority(left.priority, right.priority));

  const priority = highestPriority(focusAreas);
  const status: SupportCaseStatus = priority === 'watch' ? 'ready_to_close' : 'needs_support';
  const topArea = focusAreas[0];

  return {
    type: 'yakureki-support-case-triage',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    diagnosticGeneratedAt: diagnostic.generatedAt,
    status,
    statusLabel: status === 'ready_to_close' ? '大きな異常なし' : 'サポート確認',
    priority,
    priorityLabel: priorityLabel(priority),
    summary: `${topArea.title}: ${topArea.statusLabel}`,
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false
    },
    snapshot: {
      auditLogCount: diagnostic.audit.total,
      latestAuditLogRecorded: Boolean(diagnostic.audit.latestLogAt),
      collectionCount: Object.keys(diagnostic.collections).length,
      totalCollectionRows: totalCollectionRows(diagnostic),
      officialAuditBlockerCount: diagnostic.workflows.officialAudit.blockerItemCount,
      externalConnectorCount: diagnostic.externalConnectors?.checks.length ?? 0,
      unresolvedInitialSetupSteps: diagnostic.workflows.initialSetup.unresolvedStepCount
    },
    focusAreas
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildSupportCaseTriageCsv(triage: SupportCaseTriage): string {
  const rows = [
    ['区分', '優先度', '対象', '判定', '信号', '担当', '次の対応'],
    [
      '総括',
      triage.priorityLabel,
      triage.statusLabel,
      triage.summary,
      `${triage.focusAreas.length}領域`,
      '患者情報なし / スタッフ名なし / 薬局名なし / 監査ログ詳細なし / URL・トークンなし',
      triage.focusAreas[0]?.nextAction ?? '対応不要'
    ],
    ...triage.focusAreas.map((area) => [
      '確認領域',
      area.priorityLabel,
      area.title,
      area.statusLabel,
      `${area.signalCount}件`,
      area.supportOwner === 'pharmacy' ? '薬局' : area.supportOwner === 'support' ? 'サポート' : '共同',
      area.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildSupportCaseReproductionMemo(triage: SupportCaseTriage): string {
  const lines = [
    `問い合わせトリアージ（${triage.statusLabel} / 優先度 ${triage.priorityLabel}）`,
    `診断日時: ${triage.diagnosticGeneratedAt}`,
    `要約: ${triage.summary}`,
    '個人情報なし: 患者名、保険番号、スタッフ名、薬局名、監査ログ詳細、URL、トークンは扱わない',
    '再現確認:'
  ];
  triage.focusAreas.forEach((area, index) => {
    lines.push(`${index + 1}. ${area.title}（${area.priorityLabel}）`);
    lines.push(`   判定: ${area.statusLabel}`);
    lines.push(`   次の対応: ${area.nextAction}`);
    area.reproduceSteps.forEach((step) => {
      lines.push(`   - ${step}`);
    });
  });
  return lines.join('\n');
}
