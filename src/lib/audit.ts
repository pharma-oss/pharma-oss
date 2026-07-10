import type { AuditActionType, AuditLog, PharmacyDatabase, User } from '../db/types.ts';
import { buildAuditLogSignature } from './audit_integrity.ts';
import { generateUUID } from './crypto.ts';
import { isRemovedDemoStaffUserId } from './initial_staff.ts';

const USER_STORAGE_KEY = 'pharmacy_os_current_user';
export const ROLE_PERMISSION_POLICY_STORAGE_KEY = 'pharmacy_os_role_permission_policy_v1';
export const FIRST_RUN_BYPASS_KEY = 'pharmacy_os_first_run_bypass';

export const UNAUTHENTICATED_USER: User = {
  userId: 'unauthenticated',
  name: '未ログイン',
  role: 'clerk'
};

export const FIRST_RUN_USER: User = {
  userId: 'first_run_setup',
  name: '初回セットアップ',
  role: 'admin'
};

export const ALL_PERMISSION_ACTIONS = [
  'receive_prescription',
  'change_billing',
  'print_documents',
  'export_uke',
  'manage_facility_settings',
  'update_drug_master',
  'view_official_audit',
  'view_audit_logs',
  'approve_daily_closing',
  'review_ai_suggestions',
  'manage_backups',
  'manage_staff'
] as const;

export type PermissionAction = typeof ALL_PERMISSION_ACTIONS[number];
export type RolePermissionPolicy = Record<User['role'], PermissionAction[]>;

export const ROLE_LABELS: Record<User['role'], string> = {
  admin: '管理者',
  pharmacist: '薬剤師',
  clerk: '事務'
};

export const DEFAULT_ROLE_PERMISSION_POLICY: RolePermissionPolicy = {
  admin: [...ALL_PERMISSION_ACTIONS],
  pharmacist: [
    'receive_prescription',
    'change_billing',
    'print_documents',
    'export_uke',
    'manage_facility_settings',
    'update_drug_master',
    'view_official_audit',
    'view_audit_logs',
    'approve_daily_closing',
    'review_ai_suggestions',
    'manage_backups'
  ],
  clerk: [
    'receive_prescription',
    'print_documents'
  ]
};

export const PERMISSION_LABELS: Record<PermissionAction, string> = {
  receive_prescription: '処方箋受付',
  change_billing: '算定変更',
  print_documents: '帳票印刷',
  export_uke: 'UKE出力',
  manage_facility_settings: '施設基準設定',
  update_drug_master: '医薬品マスタ更新',
  view_official_audit: '公式仕様点検の閲覧',
  view_audit_logs: '監査ログ閲覧',
  approve_daily_closing: '日次締め承認',
  review_ai_suggestions: 'AI補助提案の確認',
  manage_backups: 'バックアップ/復旧',
  manage_staff: 'スタッフ管理'
};

const knownPermissionActions = new Set<PermissionAction>(ALL_PERMISSION_ACTIONS);

function cloneRolePermissionPolicy(policy: RolePermissionPolicy): RolePermissionPolicy {
  return {
    admin: [...policy.admin],
    pharmacist: [...policy.pharmacist],
    clerk: [...policy.clerk]
  };
}

function normalizeRolePermissionActions(
  value: unknown,
  fallback: PermissionAction[]
): PermissionAction[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const seen = new Set<PermissionAction>();
  const normalized: PermissionAction[] = [];
  for (const action of value) {
    if (typeof action !== 'string') continue;
    const permission = action as PermissionAction;
    if (!knownPermissionActions.has(permission) || seen.has(permission)) continue;
    seen.add(permission);
    normalized.push(permission);
  }
  return normalized;
}

export function normalizeRolePermissionPolicy(value: unknown): RolePermissionPolicy {
  const candidate = value && typeof value === 'object'
    ? value as Partial<Record<User['role'], unknown>>
    : {};

  return {
    admin: [...DEFAULT_ROLE_PERMISSION_POLICY.admin],
    pharmacist: normalizeRolePermissionActions(
      candidate.pharmacist,
      DEFAULT_ROLE_PERMISSION_POLICY.pharmacist
    ),
    clerk: normalizeRolePermissionActions(
      candidate.clerk,
      DEFAULT_ROLE_PERMISSION_POLICY.clerk
    )
  };
}

export function readRolePermissionPolicy(): RolePermissionPolicy {
  if (typeof window === 'undefined') {
    return cloneRolePermissionPolicy(DEFAULT_ROLE_PERMISSION_POLICY);
  }
  try {
    const raw = localStorage.getItem(ROLE_PERMISSION_POLICY_STORAGE_KEY);
    if (!raw) {
      return cloneRolePermissionPolicy(DEFAULT_ROLE_PERMISSION_POLICY);
    }
    return normalizeRolePermissionPolicy(JSON.parse(raw));
  } catch (e) {
    console.error('Failed to read role permission policy:', e);
    return cloneRolePermissionPolicy(DEFAULT_ROLE_PERMISSION_POLICY);
  }
}

export function writeRolePermissionPolicy(policy: unknown): RolePermissionPolicy {
  const normalized = normalizeRolePermissionPolicy(policy);
  if (typeof window === 'undefined') {
    return normalized;
  }
  try {
    localStorage.setItem(ROLE_PERMISSION_POLICY_STORAGE_KEY, JSON.stringify(normalized));
  } catch (e) {
    console.error('Failed to write role permission policy:', e);
    throw e;
  }
  return normalized;
}

export function resetRolePermissionPolicy(): RolePermissionPolicy {
  const normalized = cloneRolePermissionPolicy(DEFAULT_ROLE_PERMISSION_POLICY);
  if (typeof window === 'undefined') {
    return normalized;
  }
  try {
    localStorage.removeItem(ROLE_PERMISSION_POLICY_STORAGE_KEY);
  } catch (e) {
    console.error('Failed to reset role permission policy:', e);
    throw e;
  }
  return normalized;
}

export function getRoleLabel(role: User['role']): string {
  return ROLE_LABELS[role] || role;
}

export function getPermissionLabel(action: PermissionAction): string {
  return PERMISSION_LABELS[action] || action;
}

export function buildRolePermissionPolicyAuditDetail(policy: unknown): string {
  const normalized = normalizeRolePermissionPolicy(policy);
  const formatRole = (role: User['role']) => {
    const labels = normalized[role].map(getPermissionLabel).join('、') || '権限なし';
    return `${getRoleLabel(role)}=${labels}`;
  };

  return `権限ロール設定変更: ${formatRole('pharmacist')} / ${formatRole('clerk')}。管理者は全権限固定。`;
}

export function canUserPerform(
  user: User,
  action: PermissionAction,
  policy: RolePermissionPolicy = readRolePermissionPolicy()
): boolean {
  if (!isAuthenticatedUser(user)) {
    return false;
  }
  const normalizedPolicy = normalizeRolePermissionPolicy(policy);
  return normalizedPolicy[user.role]?.includes(action) || false;
}

export function isAuthenticatedUser(user: User): boolean {
  return user.userId !== 'unauthenticated'
    && user.userId !== 'system'
    && user.userId !== FIRST_RUN_USER.userId
    && !isRemovedDemoStaffUserId(user.userId);
}

export function getPermissionDeniedMessage(user: User, action: PermissionAction): string {
  const label = getPermissionLabel(action);
  if (!isAuthenticatedUser(user)) {
    return `「${label}」を実行するにはスタッフログインが必要です。`;
  }
  const roleLabel = getRoleLabel(user.role);
  return `${user.name}（${roleLabel}）には「${label}」の権限がありません。必要に応じて薬剤師または管理者に切り替えてください。`;
}

export function getCurrentUser(): User {
  if (typeof window === 'undefined') {
    return UNAUTHENTICATED_USER;
  }
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
    const raw = sessionStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        typeof parsed.userId === 'string' &&
        typeof parsed.name === 'string' &&
        ['admin', 'pharmacist', 'clerk'].includes(parsed.role)
      ) {
        if (isRemovedDemoStaffUserId(parsed.userId)) {
          sessionStorage.removeItem(USER_STORAGE_KEY);
          return UNAUTHENTICATED_USER;
        }
        return parsed;
      }
    }

    sessionStorage.removeItem(FIRST_RUN_BYPASS_KEY);
  } catch (e) {
    console.error('Failed to get current user:', e);
  }
  return UNAUTHENTICATED_USER;
}

export function setFirstRunBypassEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      sessionStorage.setItem(FIRST_RUN_BYPASS_KEY, 'true');
    } else {
      sessionStorage.removeItem(FIRST_RUN_BYPASS_KEY);
    }
  } catch (e) {
    console.error('Failed to update first-run bypass state:', e);
  }
}

export function setCurrentUser(user: User): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Failed to set current user:', e);
  }
}

function toAuditLog(value: AuditLog | { toJSON: () => AuditLog }): AuditLog {
  return typeof (value as { toJSON?: () => AuditLog }).toJSON === 'function'
    ? (value as { toJSON: () => AuditLog }).toJSON()
    : value as AuditLog;
}

export async function logAuditAction(
  db: PharmacyDatabase,
  actionType: AuditActionType,
  details: string,
  patientId?: string,
  patientName?: string
): Promise<boolean> {
  const user = getCurrentUser();
  const logId = `log_${generateUUID()}`;
  const timestamp = new Date().toISOString();

  try {
    const previousLogs = await db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec();
    const previousSignedLog = previousLogs
      .map(toAuditLog)
      .find((log) => !!log.integrityHash);
    const previousHash = previousSignedLog?.integrityHash || '';
    const unsignedLog: AuditLog = {
      logId,
      timestamp,
      userId: user.userId,
      userName: user.name,
      userRole: user.role,
      actionType,
      patientId,
      patientName,
      details
    };
    const signature = await buildAuditLogSignature(unsignedLog, previousHash);

    await db.audit_logs.insert({
      ...unsignedLog,
      ...signature
    });
    console.log(`[Audit Log] ${user.name} (${user.role}): ${details}`);
    return true;
  } catch (e) {
    console.error('Failed to record audit log:', e);
    return false;
  }
}
