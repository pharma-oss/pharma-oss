import type { AuditLog, User } from '../db/types.ts';
import { hasLoginCredential, isRemovedDemoStaffUserId } from './initial_staff.ts';

export type StaffRecoveryReason = 'device_migration' | 'staff_retirement' | 'passkey_lost';
export type StaffRecoveryAction = 'password_reset' | 'passkey_clear' | 'retirement_check_record';
export type StaffRecoveryStepStatus = 'complete' | 'attention' | 'blocked';

export interface StaffRecoveryStep {
  id: string;
  label: string;
  status: StaffRecoveryStepStatus;
  detail: string;
}

export interface StaffRecoveryChecklist {
  reason: StaffRecoveryReason;
  title: string;
  status: StaffRecoveryStepStatus;
  statusLabel: string;
  targetLabel: string;
  steps: StaffRecoveryStep[];
  requiredActions: string[];
}

export interface StaffRecoveryChecklistInput {
  reason: StaffRecoveryReason;
  targetStaff?: User | null;
  staff: User[];
  auditLogs: AuditLog[];
}

export interface StaffCredentialRecoveryAuditDetailInput {
  reason: StaffRecoveryReason;
  action: StaffRecoveryAction;
  targetStaff: User;
  operatorName: string;
  checklist: StaffRecoveryChecklist;
  note?: string;
}

export const STAFF_RECOVERY_REASON_LABELS: Record<StaffRecoveryReason, string> = {
  device_migration: '端末移行',
  staff_retirement: 'スタッフ退職',
  passkey_lost: 'パスキー紛失'
};

const STAFF_RECOVERY_ACTION_LABELS: Record<StaffRecoveryAction, string> = {
  password_reset: 'パスワード再設定',
  passkey_clear: 'パスキー解除',
  retirement_check_record: '退職前チェック記録'
};

function activeStaff(staff: User[]): User[] {
  return staff.filter((user) => !isRemovedDemoStaffUserId(user.userId));
}

function activeCredentialedAdminCount(staff: User[]): number {
  return activeStaff(staff).filter((user) => user.role === 'admin' && hasLoginCredential(user)).length;
}

function hasAuditAction(auditLogs: AuditLog[], actionType: AuditLog['actionType']): boolean {
  return auditLogs.some((log) => log.actionType === actionType);
}

function overallStatus(steps: StaffRecoveryStep[]): StaffRecoveryStepStatus {
  if (steps.some((step) => step.status === 'blocked')) return 'blocked';
  if (steps.some((step) => step.status === 'attention')) return 'attention';
  return 'complete';
}

function statusLabel(status: StaffRecoveryStepStatus): string {
  if (status === 'complete') return '対応準備OK';
  if (status === 'attention') return '要確認';
  return '実行前に対応が必要';
}

export function buildStaffRecoveryChecklist(input: StaffRecoveryChecklistInput): StaffRecoveryChecklist {
  const target = input.targetStaff || null;
  const credentialedAdminCount = activeCredentialedAdminCount(input.staff);
  const remainingCredentialedAdminCount = credentialedAdminCount - (
    target?.role === 'admin' && hasLoginCredential(target) ? 1 : 0
  );
  const adminSafetyOk = input.reason === 'staff_retirement' && target?.role === 'admin'
    ? remainingCredentialedAdminCount >= 1
    : credentialedAdminCount >= 1;
  const hasBackup = hasAuditAction(input.auditLogs, 'backup_export');
  const hasExternalStorage = hasAuditAction(input.auditLogs, 'backup_external_storage');
  const hasRestoreDrill = hasAuditAction(input.auditLogs, 'backup_drill');
  const steps: StaffRecoveryStep[] = [
    {
      id: 'target_staff',
      label: '対象スタッフ',
      status: target ? 'complete' : 'blocked',
      detail: target
        ? `${target.name}（${target.role === 'admin' ? '管理者' : target.role === 'pharmacist' ? '薬剤師' : '事務'}）を対象にしています。`
        : '復旧または退職対応するスタッフを選んでください。'
    },
    {
      id: 'admin_survives',
      label: input.reason === 'staff_retirement' ? '管理者を残す' : '管理者ログイン',
      status: adminSafetyOk ? 'complete' : 'blocked',
      detail: adminSafetyOk
        ? input.reason === 'staff_retirement'
          ? `認証済み管理者 ${credentialedAdminCount}名。操作後も管理者を残せます。`
          : `認証済み管理者 ${credentialedAdminCount}名。復旧操作を管理者で続けられます。`
        : input.reason === 'staff_retirement' && target?.role === 'admin'
          ? 'このスタッフを止めると管理者が0名になります。先に別の管理者を追加してください。'
          : '認証済み管理者がいません。先に管理者の認証情報を登録してください。'
    },
    {
      id: 'backup_before_change',
      label: '変更前バックアップ',
      status: hasBackup && hasExternalStorage ? 'complete' : hasBackup ? 'attention' : 'blocked',
      detail: hasBackup && hasExternalStorage
        ? '変更前のバックアップと外部保存確認が操作ログにあります。'
        : hasBackup
          ? 'バックアップ記録はあります。外部保存確認も残すと安全です。'
          : 'スタッフ認証を変更する前に、暗号化バックアップを書き出してください。'
    }
  ];

  if (input.reason === 'device_migration') {
    steps.push({
      id: 'restore_drill',
      label: '新端末で復旧確認',
      status: hasRestoreDrill ? 'complete' : 'attention',
      detail: hasRestoreDrill
        ? '復旧テストの記録があります。新端末でも同じ手順で確認できます。'
        : 'バックアップを実データへ反映せず復旧テストとして確認してください。'
    });
  }

  if (input.reason === 'passkey_lost') {
    steps.push({
      id: 'fallback_login',
      label: 'ログイン手段の確保',
      status: target && hasLoginCredential(target) ? 'complete' : 'attention',
      detail: target && hasLoginCredential(target)
        ? '対象スタッフには認証情報があります。必要に応じてパスワード再設定またはパスキー解除を行えます。'
        : '対象スタッフのパスワード再設定または新しいパスキー登録が必要です。'
    });
  }

  if (input.reason === 'staff_retirement') {
    steps.push({
      id: 'retirement_record',
      label: '退職前確認の記録',
      status: target ? 'attention' : 'blocked',
      detail: target
        ? '削除前にこのチェックを操作ログへ残し、必要ならバックアップと監査ログを書き出してください。'
        : '退職対応するスタッフを選んでください。'
    });
  }

  const status = overallStatus(steps);
  return {
    reason: input.reason,
    title: `${STAFF_RECOVERY_REASON_LABELS[input.reason]}の対応確認`,
    status,
    statusLabel: statusLabel(status),
    targetLabel: target ? target.name : '未選択',
    steps,
    requiredActions: steps
      .filter((step) => step.status !== 'complete')
      .map((step) => step.detail)
  };
}

export function buildStaffCredentialRecoveryAuditDetail(input: StaffCredentialRecoveryAuditDetailInput): string {
  const hasNote = !!input.note?.trim();
  const requiredActionCount = input.checklist.requiredActions.length;
  return [
    'スタッフ認証復旧',
    `理由 ${STAFF_RECOVERY_REASON_LABELS[input.reason]}`,
    `操作 ${STAFF_RECOVERY_ACTION_LABELS[input.action]}`,
    `対象 ${input.targetStaff.name} (${input.targetStaff.role})`,
    `確認者 ${input.operatorName}`,
    `判定 ${input.checklist.statusLabel}`,
    `残対応 ${requiredActionCount}件`,
    hasNote ? 'メモあり' : ''
  ].filter(Boolean).join(' / ');
}
