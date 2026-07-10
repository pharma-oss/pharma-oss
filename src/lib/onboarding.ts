import type { AuditLog, FacilitySettings, User } from '../db/types.ts';
import { hasLoginCredential, isRemovedDemoStaffUserId } from './initial_staff.ts';
import { buildOnboardingE2EReport } from './onboarding_e2e.ts';

export type InitialSetupStatus = 'complete' | 'attention' | 'blocked';
export type InitialSetupTab = 'facility' | 'master' | 'backup' | 'audit' | 'staff';
export type InitialSetupStepId =
  | 'facility'
  | 'staff'
  | 'drug_master'
  | 'migration'
  | 'claim_test'
  | 'print_test'
  | 'backup';

export interface InitialSetupStep {
  id: InitialSetupStepId;
  title: string;
  category: string;
  status: InitialSetupStatus;
  statusLabel: string;
  actionLabel: string;
  tab: InitialSetupTab;
  evidence: string;
  requiredActions: string[];
}

export interface InitialSetupChecklist {
  generatedAt: string;
  status: InitialSetupStatus;
  statusLabel: string;
  completionRate: number;
  completedCount: number;
  attentionCount: number;
  blockedCount: number;
  nextStep?: InitialSetupStep;
  steps: InitialSetupStep[];
}

export interface InitialSetupChecklistInput {
  settings: FacilitySettings;
  staff: User[];
  auditLogs: AuditLog[];
  generatedAt?: Date;
}

const FACILITY_PLACEHOLDER_VALUES = new Set([
  'Next-Gen 薬局',
  '123-4567',
  '東京都渋谷区桜丘町26-1',
  '03-1234-5678',
  'T1234567890123',
  '山田'
]);

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function isConfigured(value: unknown): boolean {
  const text = clean(value);
  return text.length > 0 && !FACILITY_PLACEHOLDER_VALUES.has(text);
}

function isConfiguredPhone(value: unknown): boolean {
  const text = clean(value);
  return text.length > 0 && text !== '03-1234-5678';
}

function statusLabel(status: InitialSetupStatus): string {
  if (status === 'complete') return '完了';
  if (status === 'attention') return '要確認';
  return '未完了';
}

function makeStep(input: Omit<InitialSetupStep, 'statusLabel'>): InitialSetupStep {
  return {
    ...input,
    statusLabel: statusLabel(input.status)
  };
}

function hasAudit(
  auditLogs: AuditLog[],
  actionType: AuditLog['actionType'],
  predicate: (log: AuditLog) => boolean = () => true
): boolean {
  return auditLogs.some((log) => log.actionType === actionType && predicate(log));
}

function activeStaff(staff: User[]): User[] {
  return staff.filter((user) => !isRemovedDemoStaffUserId(user.userId));
}

function buildFacilityStep(settings: FacilitySettings): InitialSetupStep {
  const missing: string[] = [];
  if (!isConfigured(settings.pharmacyName)) missing.push('正式な薬局名');
  if (!isConfigured(settings.pharmacyCode)) missing.push('保険薬局コード');
  if (!isConfigured(settings.pharmacyAddress)) missing.push('所在地');
  if (!isConfiguredPhone(settings.pharmacyPhone)) missing.push('電話番号');
  if (!isConfigured(settings.defaultPharmacistName)) missing.push('既定の担当薬剤師');

  return makeStep({
    id: 'facility',
    title: '薬局基本情報',
    category: '設定',
    status: missing.length === 0 ? 'complete' : 'blocked',
    actionLabel: missing.length === 0 ? '施設基準設定' : '薬局情報を保存',
    tab: 'facility',
    evidence: missing.length === 0
      ? `${clean(settings.pharmacyName)} / 保険薬局コード ${clean(settings.pharmacyCode)}`
      : `未設定: ${missing.join('、')}`,
    requiredActions: missing.length === 0
      ? ['薬局情報は設定済みです']
      : missing.map((item) => `${item}を設定する`)
  });
}

function buildStaffStep(staff: User[]): InitialSetupStep {
  const rows = activeStaff(staff);
  const credentialedRows = rows.filter(hasLoginCredential);
  const credentialedAdminCount = credentialedRows.filter((user) => user.role === 'admin').length;
  const credentialedPharmacistCount = credentialedRows.filter((user) => user.role === 'pharmacist').length;
  const missingCredentialCount = rows.filter((user) => !hasLoginCredential(user)).length;
  const requiredActions: string[] = [];

  if (credentialedAdminCount === 0) {
    requiredActions.push('管理者のパスワードまたはパスキーを登録する');
  }
  if (credentialedPharmacistCount === 0) {
    requiredActions.push('薬剤師スタッフを追加し認証情報を登録する');
  }
  if (missingCredentialCount > 0) {
    requiredActions.push('認証情報がないスタッフをなくす');
  }

  const status: InitialSetupStatus = credentialedAdminCount === 0
    ? 'blocked'
    : requiredActions.length > 0
      ? 'attention'
      : 'complete';

  return makeStep({
    id: 'staff',
    title: 'スタッフ認証',
    category: '権限',
    status,
    actionLabel: status === 'complete' ? 'スタッフ管理' : '認証を整える',
    tab: 'staff',
    evidence: `スタッフ ${rows.length}名 / 認証済み ${credentialedRows.length}名 / 管理者 ${credentialedAdminCount}名 / 薬剤師 ${credentialedPharmacistCount}名`,
    requiredActions: requiredActions.length > 0 ? requiredActions : ['スタッフ認証は設定済みです']
  });
}

function buildDrugMasterStep(auditLogs: AuditLog[]): InitialSetupStep {
  const hasMasterUpdate = hasAudit(
    auditLogs,
    'drug_master_update',
    (log) => !log.details.includes('ロールバック')
  );

  return makeStep({
    id: 'drug_master',
    title: '医薬品マスター',
    category: 'マスター',
    status: hasMasterUpdate ? 'complete' : 'attention',
    actionLabel: hasMasterUpdate ? 'マスタ更新' : 'マスターを更新',
    tab: 'master',
    evidence: hasMasterUpdate ? '医薬品マスター更新ログあり' : '医薬品マスター更新ログなし',
    requiredActions: hasMasterUpdate
      ? ['医薬品マスター更新の証跡があります']
      : ['支払基金マスターCSVを取り込み、差分CSVとロールバックJSONを保管する']
  });
}

function buildMigrationStep(auditLogs: AuditLog[]): InitialSetupStep {
  const hasMigrationOk = hasAudit(
    auditLogs,
    'backup_drill',
    (log) => log.details.includes('移行診断 移行OK') || log.details.includes('導入移行レビュー 導入移行OK')
  );
  const hasMigrationDrill = hasAudit(
    auditLogs,
    'backup_drill',
    (log) => log.details.includes('移行診断') || log.details.includes('導入移行レビュー')
  );

  const status: InitialSetupStatus = hasMigrationOk
    ? 'complete'
    : hasMigrationDrill
      ? 'attention'
      : 'attention';

  return makeStep({
    id: 'migration',
    title: '移行データ診断',
    category: '移行',
    status,
    actionLabel: hasMigrationOk ? 'バックアップ' : '移行プレビュー',
    tab: 'backup',
    evidence: hasMigrationOk ? '導入移行OKの診断ログあり' : hasMigrationDrill ? '移行診断ログあり' : '移行診断ログなし',
    requiredActions: hasMigrationOk
      ? ['移行データ診断は完了しています']
      : ['患者・受付・在庫・薬歴CSVをプレビューし、導入移行レビューまたは復旧テストを記録する']
  });
}

function buildClaimTestStep(auditLogs: AuditLog[]): InitialSetupStep {
  const e2eScenario = buildOnboardingE2EReport(auditLogs).scenarios.find((scenario) => scenario.id === 'claim_uke_export');
  const isComplete = e2eScenario?.status === 'complete';

  return makeStep({
    id: 'claim_test',
    title: '請求テスト',
    category: '請求',
    status: isComplete ? 'complete' : 'attention',
    actionLabel: isComplete ? '操作ログ' : '施設基準を確認',
    tab: isComplete ? 'audit' : 'facility',
    evidence: e2eScenario?.evidence || '請求E2E定義なし',
    requiredActions: isComplete
      ? ['請求テストのE2E証跡があります']
      : [
          // 先頭に置き、一覧の「ほか◯件」に折りたたまれず必ず表示されるようにする
          'チュートリアルのデモ患者はUKE出力できないため、導入確認用テストデータで実施する',
          ...(e2eScenario?.missingEvidence || ['テスト患者でUKE出力前チェックとUKE出力を実施する'])
        ]
  });
}

function buildPrintTestStep(auditLogs: AuditLog[]): InitialSetupStep {
  const e2eScenario = buildOnboardingE2EReport(auditLogs).scenarios.find((scenario) => scenario.id === 'print_documents');
  const isComplete = e2eScenario?.status === 'complete';

  return makeStep({
    id: 'print_test',
    title: '帳票印刷テスト',
    category: '帳票',
    status: isComplete ? 'complete' : 'attention',
    actionLabel: isComplete ? '操作ログ' : '施設情報を確認',
    tab: isComplete ? 'audit' : 'facility',
    evidence: e2eScenario?.evidence || '印刷E2E定義なし',
    requiredActions: isComplete
      ? ['帳票印刷テストのE2E証跡があります']
      : e2eScenario?.missingEvidence || ['テスト受付で調剤録や薬袋などの印刷を確認する']
  });
}

function buildBackupStep(auditLogs: AuditLog[]): InitialSetupStep {
  const hasBackup = hasAudit(auditLogs, 'backup_export');
  const hasExternalStorageOk = hasAudit(
    auditLogs,
    'backup_external_storage',
    (log) => log.details.includes('外部保存OK')
  );
  const hasDrill = hasAudit(auditLogs, 'backup_drill');
  const requiredActions: string[] = [];

  if (!hasBackup) requiredActions.push('暗号化バックアップを書き出す');
  if (!hasExternalStorageOk) requiredActions.push('外部保存OKを記録する');
  if (!hasDrill) requiredActions.push('復旧テストを記録する');

  const status: InitialSetupStatus = !hasBackup
    ? 'blocked'
    : requiredActions.length > 0
      ? 'attention'
      : 'complete';

  return makeStep({
    id: 'backup',
    title: 'バックアップ訓練',
    category: '事業継続',
    status,
    actionLabel: status === 'complete' ? 'バックアップ' : '訓練を記録',
    tab: 'backup',
    evidence: `バックアップ ${hasBackup ? 'あり' : 'なし'} / 外部保存 ${hasExternalStorageOk ? 'OK' : '未完'} / 復旧テスト ${hasDrill ? 'あり' : '未完'}`,
    requiredActions: requiredActions.length > 0 ? requiredActions : ['バックアップ訓練は完了しています']
  });
}

export function buildInitialSetupChecklist(input: InitialSetupChecklistInput): InitialSetupChecklist {
  const generatedAt = input.generatedAt || new Date();
  const steps = [
    buildFacilityStep(input.settings),
    buildStaffStep(input.staff),
    buildDrugMasterStep(input.auditLogs),
    buildMigrationStep(input.auditLogs),
    buildClaimTestStep(input.auditLogs),
    buildPrintTestStep(input.auditLogs),
    buildBackupStep(input.auditLogs)
  ];
  const completedCount = steps.filter((step) => step.status === 'complete').length;
  const attentionCount = steps.filter((step) => step.status === 'attention').length;
  const blockedCount = steps.filter((step) => step.status === 'blocked').length;
  const status: InitialSetupStatus = blockedCount > 0
    ? 'blocked'
    : attentionCount > 0
      ? 'attention'
      : 'complete';
  const nextStep = steps.find((step) => step.status === 'blocked')
    || steps.find((step) => step.status === 'attention');

  return {
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: status === 'complete' ? '導入準備OK' : status === 'attention' ? '本番前確認あり' : '初期設定未完了',
    completionRate: Math.round((completedCount / steps.length) * 100),
    completedCount,
    attentionCount,
    blockedCount,
    nextStep,
    steps
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildInitialSetupChecklistCsv(checklist: InitialSetupChecklist): string {
  const rows = [
    ['区分', '項目', '判定', '証跡', '必要な対応'],
    ['総括', '導入準備', checklist.statusLabel, `${checklist.completedCount}/${checklist.steps.length}完了`, checklist.nextStep ? `次: ${checklist.nextStep.title}` : '全項目完了'],
    ...checklist.steps.map((step) => [
      step.category,
      step.title,
      step.statusLabel,
      step.evidence,
      step.requiredActions.join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildInitialSetupHandoffMemo(checklist: InitialSetupChecklist): string {
  const lines = [
    `初回セットアップ引き継ぎメモ（${checklist.statusLabel}）`,
    `作成日時: ${checklist.generatedAt}`,
    `進捗: ${checklist.completedCount}/${checklist.steps.length}完了（${checklist.completionRate}%）`,
    `未完了: ${checklist.blockedCount}件 / 要確認: ${checklist.attentionCount}件`
  ];

  if (checklist.nextStep) {
    lines.push(`次の作業: ${checklist.nextStep.title} - ${checklist.nextStep.actionLabel}`);
  } else {
    lines.push('次の作業: 全項目完了');
  }

  const unresolvedSteps = checklist.steps.filter((step) => step.status !== 'complete');
  if (unresolvedSteps.length === 0) {
    lines.push('残対応: なし');
  } else {
    lines.push('残対応:');
    for (const step of unresolvedSteps) {
      lines.push(`- ${step.title}（${step.statusLabel}）: ${step.evidence}`);
      for (const action of step.requiredActions) {
        lines.push(`  - ${action}`);
      }
    }
  }

  return lines.join('\n');
}
