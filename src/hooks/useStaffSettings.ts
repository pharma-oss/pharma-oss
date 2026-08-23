'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { PharmacyDatabase, User, AuditLog } from '@/db/types';
import {
  logAuditAction,
  readRolePermissionPolicy,
  writeRolePermissionPolicy,
  resetRolePermissionPolicy,
  normalizeRolePermissionPolicy,
  buildRolePermissionPolicyAuditDetail,
  DEFAULT_ROLE_PERMISSION_POLICY,
  type PermissionAction,
  type RolePermissionPolicy
} from '@/lib/audit';
import { hasLoginCredential } from '@/lib/initial_staff';
import {
  buildStaffRecoveryChecklist,
  buildStaffCredentialRecoveryAuditDetail,
  type StaffRecoveryChecklist,
  type StaffRecoveryReason
} from '@/lib/staff_recovery';
import {
  buildStaffAccessRecoveryMonthlyReview,
  buildStaffAccessRecoveryMonthlyReviewCsv,
  makeStaffAccessRecoveryMonthlyReviewCsvFileName
} from '@/lib/staff_access_recovery_review';
import { verifyAuditLogIntegrity, type AuditIntegrityReport } from '@/lib/audit_integrity';

interface UseStaffSettingsProps {
  db: PharmacyDatabase | null;
  currentUser: User;
  canManageStaff: boolean;
  canViewAuditLogs: boolean;
  auditLogs: AuditLog[];
  auditIntegrity: AuditIntegrityReport | null;
  fetchAuditLogs: () => Promise<void>;
  ensurePermission: (permission: PermissionAction) => boolean;
  isOnboardingStaffSetup?: boolean;
  setIsOnboardingStaffSetup?: (val: boolean) => void;
}

export function useStaffSettings({
  db,
  currentUser,
  canManageStaff,
  canViewAuditLogs,
  auditLogs,
  auditIntegrity,
  fetchAuditLogs,
  ensurePermission,
  isOnboardingStaffSetup: externalIsOnboardingStaffSetup,
  setIsOnboardingStaffSetup: externalSetIsOnboardingStaffSetup
}: UseStaffSettingsProps) {
  const [staffList, setStaffList] = useState<User[]>([]);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'pharmacist' | 'clerk' | 'admin'>('pharmacist');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
  const [localIsOnboardingStaffSetup, setLocalIsOnboardingStaffSetup] = useState(false);
  const isOnboardingStaffSetup = externalIsOnboardingStaffSetup ?? localIsOnboardingStaffSetup;
  const setIsOnboardingStaffSetup = externalSetIsOnboardingStaffSetup ?? setLocalIsOnboardingStaffSetup;
  const [rolePermissionPolicy, setRolePermissionPolicy] = useState<RolePermissionPolicy>(DEFAULT_ROLE_PERMISSION_POLICY);
  const [isSavingRolePermissionPolicy, setIsSavingRolePermissionPolicy] = useState(false);
  const [staffRecoveryReason, setStaffRecoveryReason] = useState<StaffRecoveryReason>('passkey_lost');
  const [staffRecoveryTargetUserId, setStaffRecoveryTargetUserId] = useState('');
  const [staffRecoveryPassword, setStaffRecoveryPassword] = useState('');
  const [staffRecoveryNote, setStaffRecoveryNote] = useState('');
  const [isHandlingStaffRecovery, setIsHandlingStaffRecovery] = useState(false);
  const [isExportingStaffAccessRecoveryMonthlyReview, setIsExportingStaffAccessRecoveryMonthlyReview] = useState(false);

  const currentStaffRecord = staffList.find((staff) => staff.userId === currentUser.userId);
  const staffRecoveryTarget = staffList.find((staff) => staff.userId === staffRecoveryTargetUserId) || null;
  const credentialedAdminCount = staffList.filter((staff) => staff.role === 'admin' && hasLoginCredential(staff)).length;
  const shouldPromptCurrentStaffPasskey = isOnboardingStaffSetup
    && !!currentStaffRecord
    && !currentStaffRecord.passkeyCredentialId;

  const staffRecoveryChecklist = buildStaffRecoveryChecklist({
    reason: staffRecoveryReason,
    targetStaff: staffRecoveryTarget,
    staff: staffList,
    auditLogs
  });

  useEffect(() => {
    setRolePermissionPolicy(readRolePermissionPolicy());
  }, []);

  useEffect(() => {
    if (staffRecoveryTargetUserId || staffList.length === 0) return;
    const currentStaff = staffList.find((staff) => staff.userId === currentUser.userId);
    setStaffRecoveryTargetUserId((currentStaff || staffList[0]).userId);
  }, [currentUser.userId, staffList, staffRecoveryTargetUserId]);

  useEffect(() => {
    if (!db || !canManageStaff) return;
    const sub = db.users.find().$.subscribe((list) => {
      if (list) {
        setStaffList(list.map(d => ({
          userId: d.userId,
          name: d.name,
          role: d.role,
          salt: d.salt,
          passwordHash: d.passwordHash,
          passkeyCredentialId: d.passkeyCredentialId,
          passkeyPublicKey: d.passkeyPublicKey
        })));
      }
    });
    return () => sub.unsubscribe();
  }, [db, canManageStaff]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ensurePermission('manage_staff')) return;
    if (!db || !newStaffName.trim()) {
      toast.error('スタッフ名を入力してください。');
      return;
    }
    if (newStaffPassword.trim() && newStaffPassword.trim().length < 8) {
      toast.error('ログインパスワードは8文字以上にしてください。');
      return;
    }
    setIsSubmittingStaff(true);
    try {
      const { generateSalt, hashPassword } = await import('@/lib/auth');
      const userId = 'staff_' + Date.now();
      const staffName = newStaffName.trim();
      
      let salt = '';
      let passwordHash = '';
      if (newStaffPassword.trim()) {
        salt = generateSalt();
        passwordHash = await hashPassword(newStaffPassword, salt);
      }
      
      await db.users.insert({
        userId,
        name: staffName,
        role: newStaffRole,
        salt,
        passwordHash
      });

      const auditOk = await logAuditAction(
        db,
        'staff_create',
        `スタッフ追加: 新しいスタッフ「${staffName} (${newStaffRole})」を追加しました。`
      );
      if (!auditOk) {
        const insertedDoc = await db.users.findOne(userId).exec();
        if (insertedDoc) {
          await insertedDoc.remove();
        }
        throw new Error('スタッフ追加の監査ログ記録に失敗したため、追加を取り消しました。');
      }

      toast.success(`スタッフ「${staffName}」を追加しました。`);
      setIsAddStaffOpen(false);
      setNewStaffName('');
      setNewStaffPassword('');
    } catch (err: any) {
      console.error('Failed to add staff:', err);
      toast.error(`スタッフの追加に失敗しました: ${err.message || err}`);
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const handleRegisterPasskey = async (staff: User) => {
    if (!ensurePermission('manage_staff')) return;
    if (!db) return;
    try {
      toast.info(`スタッフ「${staff.name}」のデバイス認証登録を開始します。ブラウザの指示に従ってください...`);
      const { registerPasskey } = await import('@/lib/auth');
      const creds = await registerPasskey(staff);
      
      const doc = await db.users.findOne(staff.userId).exec();
      if (doc) {
        const previousCredentialId = staff.passkeyCredentialId || '';
        const previousPublicKey = staff.passkeyPublicKey || '';
        await doc.patch({
          passkeyCredentialId: creds.credentialId,
          passkeyPublicKey: creds.publicKey
        });
        
        const auditOk = await logAuditAction(
          db,
          'passkey_register',
          `パスキー登録: スタッフ「${staff.name}」のパスキー認証デバイスを登録しました。`
        );
        if (!auditOk) {
          await doc.patch({
            passkeyCredentialId: previousCredentialId,
            passkeyPublicKey: previousPublicKey
          });
          throw new Error('パスキー登録の監査ログ記録に失敗したため、登録を取り消しました。');
        }
        
        toast.success(`スタッフ「${staff.name}」のパスキーを登録しました！`);
        if (isOnboardingStaffSetup && staff.userId === currentUser.userId) {
          setIsAddStaffOpen(true);
        }
      }
    } catch (err: any) {
      console.error('Failed to register passkey:', err);
      toast.error(err.message || 'パスキーの登録に失敗しました。');
    }
  };

  const handleDeleteStaff = async (staff: User) => {
    if (!ensurePermission('manage_staff')) return;
    if (!db) return;
    if (staff.role === 'admin' && hasLoginCredential(staff) && credentialedAdminCount <= 1) {
      toast.error('最後の認証済み管理者は削除できません。先に別の管理者を追加し、認証情報を登録してください。');
      return;
    }
    if (!window.confirm(`本当にスタッフ「${staff.name}」を削除しますか？`)) return;
    
    try {
      const doc = await db.users.findOne(staff.userId).exec();
      if (doc) {
        await doc.remove();
        
        const auditOk = await logAuditAction(
          db,
          'staff_delete',
          `スタッフ削除: スタッフ「${staff.name} (${staff.role})」を削除しました。`
        );
        if (!auditOk) {
          await db.users.insert({
            userId: staff.userId,
            name: staff.name,
            role: staff.role,
            salt: staff.salt || '',
            passwordHash: staff.passwordHash || '',
            passkeyCredentialId: staff.passkeyCredentialId || '',
            passkeyPublicKey: staff.passkeyPublicKey || ''
          });
          throw new Error('スタッフ削除の監査ログ記録に失敗したため、削除を取り消しました。');
        }
        
        toast.success(`スタッフ「${staff.name}」を削除しました。`);
      }
    } catch (err: any) {
      console.error('Failed to delete staff:', err);
      toast.error(`スタッフの削除に失敗しました: ${err.message || err}`);
    }
  };

  const handleResetStaffRecoveryPassword = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db || !staffRecoveryTarget) {
      toast.error('復旧対象のスタッフを選択してください。');
      return;
    }
    const password = staffRecoveryPassword.trim();
    if (password.length < 8) {
      toast.error('再設定するパスワードは8文字以上にしてください。');
      return;
    }

    setIsHandlingStaffRecovery(true);
    try {
      const { generateSalt, hashPassword } = await import('@/lib/auth');
      const doc = await db.users.findOne(staffRecoveryTarget.userId).exec();
      if (!doc) {
        throw new Error('対象スタッフが見つかりません。');
      }

      const previousSalt = staffRecoveryTarget.salt || '';
      const previousPasswordHash = staffRecoveryTarget.passwordHash || '';
      const salt = generateSalt();
      const passwordHash = await hashPassword(password, salt);
      await doc.patch({ salt, passwordHash });

      const auditOk = await logAuditAction(
        db,
        'staff_credential_recovery',
        buildStaffCredentialRecoveryAuditDetail({
          reason: staffRecoveryReason,
          action: 'password_reset',
          targetStaff: staffRecoveryTarget,
          operatorName: currentUser.name || '管理者',
          checklist: staffRecoveryChecklist,
          note: staffRecoveryNote
        })
      );
      if (!auditOk) {
        await doc.patch({ salt: previousSalt, passwordHash: previousPasswordHash });
        throw new Error('パスワード再設定の監査ログ記録に失敗したため、変更を取り消しました。');
      }

      setStaffRecoveryPassword('');
      await fetchAuditLogs();
      toast.success(`スタッフ「${staffRecoveryTarget.name}」のパスワードを再設定しました。`);
    } catch (err: any) {
      console.error('Failed to reset staff password:', err);
      toast.error(`パスワード再設定に失敗しました: ${err.message || err}`);
    } finally {
      setIsHandlingStaffRecovery(false);
    }
  };

  const handleClearStaffRecoveryPasskey = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db || !staffRecoveryTarget) {
      toast.error('復旧対象のスタッフを選択してください。');
      return;
    }
    if (!staffRecoveryTarget.passkeyCredentialId) {
      toast.info('このスタッフには解除するパスキーがありません。');
      return;
    }
    if (!window.confirm(`スタッフ「${staffRecoveryTarget.name}」の登録済みパスキーを解除しますか？`)) return;

    setIsHandlingStaffRecovery(true);
    try {
      const doc = await db.users.findOne(staffRecoveryTarget.userId).exec();
      if (!doc) {
        throw new Error('対象スタッフが見つかりません。');
      }

      const previousCredentialId = staffRecoveryTarget.passkeyCredentialId || '';
      const previousPublicKey = staffRecoveryTarget.passkeyPublicKey || '';
      await doc.patch({
        passkeyCredentialId: '',
        passkeyPublicKey: ''
      });

      const auditOk = await logAuditAction(
        db,
        'staff_credential_recovery',
        buildStaffCredentialRecoveryAuditDetail({
          reason: staffRecoveryReason,
          action: 'passkey_clear',
          targetStaff: staffRecoveryTarget,
          operatorName: currentUser.name || '管理者',
          checklist: staffRecoveryChecklist,
          note: staffRecoveryNote
        })
      );
      if (!auditOk) {
        await doc.patch({
          passkeyCredentialId: previousCredentialId,
          passkeyPublicKey: previousPublicKey
        });
        throw new Error('パスキー解除の監査ログ記録に失敗したため、変更を取り消しました。');
      }

      await fetchAuditLogs();
      toast.success(`スタッフ「${staffRecoveryTarget.name}」のパスキーを解除しました。`);
    } catch (err: any) {
      console.error('Failed to clear staff passkey:', err);
      toast.error(`パスキー解除に失敗しました: ${err.message || err}`);
    } finally {
      setIsHandlingStaffRecovery(false);
    }
  };

  const handleRecordStaffRetirementCheck = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db || !staffRecoveryTarget) {
      toast.error('復旧対象のスタッフを選択してください。');
      return;
    }
    if (staffRecoveryTarget.role === 'admin' && hasLoginCredential(staffRecoveryTarget) && credentialedAdminCount <= 1) {
      toast.error('最後の認証済み管理者は退職対応に進めません。先に別の管理者を追加し、認証情報を登録してください。');
      return;
    }

    setIsHandlingStaffRecovery(true);
    try {
      const auditOk = await logAuditAction(
        db,
        'staff_credential_recovery',
        buildStaffCredentialRecoveryAuditDetail({
          reason: staffRecoveryReason,
          action: 'retirement_check_record',
          targetStaff: staffRecoveryTarget,
          operatorName: currentUser.name || '管理者',
          checklist: staffRecoveryChecklist,
          note: staffRecoveryNote
        })
      );
      if (!auditOk) {
        throw new Error('退職前チェックの監査ログ記録に失敗しました。');
      }

      await fetchAuditLogs();
      toast.success(`スタッフ「${staffRecoveryTarget.name}」の退職前チェックを記録しました。`);
    } catch (err: any) {
      console.error('Failed to record staff retirement check:', err);
      toast.error(`退職前チェックの記録に失敗しました: ${err.message || err}`);
    } finally {
      setIsHandlingStaffRecovery(false);
    }
  };

  const handleRolePermissionToggle = (role: User['role'], action: PermissionAction) => {
    if (!canManageStaff || role === 'admin') return;
    setRolePermissionPolicy(prev => {
      const current = prev[role] || [];
      const nextActions = current.includes(action)
        ? current.filter(permission => permission !== action)
        : [...current, action];
      return normalizeRolePermissionPolicy({
        ...prev,
        [role]: nextActions
      });
    });
  };

  const handleExportStaffAccessRecoveryMonthlyReviewCsv = async () => {
    if (!ensurePermission('view_audit_logs')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsExportingStaffAccessRecoveryMonthlyReview(true);
    try {
      const generatedAt = new Date();
      const report = auditIntegrity ?? await verifyAuditLogIntegrity(auditLogs);
      const review = buildStaffAccessRecoveryMonthlyReview(auditLogs, generatedAt, {
        sourceArtifactSha256: report.latestHash
      });
      const fileName = makeStaffAccessRecoveryMonthlyReviewCsvFileName(review.monthKey);
      const blob = new Blob([`\ufeff${buildStaffAccessRecoveryMonthlyReviewCsv(review)}`], {
        type: 'text/csv;charset=utf-8'
      });

      const auditOk = await logAuditAction(
        db,
        'audit_export',
        `スタッフ復旧・退職対応月次棚卸CSVエクスポート: ${fileName} を書き出しました（${review.monthLabel}, 判定: ${review.statusLabel}, 対象操作: ${review.eventCaseCount}件, 保留: ${review.blockedCaseCount}件）。`
      );
      if (!auditOk) {
        throw new Error('スタッフ復旧・退職対応月次棚卸CSVエクスポートの監査ログ記録に失敗したため、書き出しを中止しました。');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      await fetchAuditLogs();
      toast.success(`スタッフ復旧・退職対応月次棚卸CSVを書き出しました（${review.statusLabel}）。`);
    } catch (error: any) {
      console.error('Failed to export staff access recovery monthly review CSV:', error);
      toast.error(`スタッフ復旧・退職対応月次棚卸CSVの書き出しに失敗しました: ${error.message || error}`);
    } finally {
      setIsExportingStaffAccessRecoveryMonthlyReview(false);
    }
  };

  const handleSaveRolePermissionPolicy = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsSavingRolePermissionPolicy(true);
    const previousPolicy = readRolePermissionPolicy();
    try {
      const savedPolicy = writeRolePermissionPolicy(rolePermissionPolicy);
      setRolePermissionPolicy(savedPolicy);

      const auditOk = await logAuditAction(
        db,
        'facility_settings_update',
        buildRolePermissionPolicyAuditDetail(savedPolicy)
      );
      if (!auditOk) {
        writeRolePermissionPolicy(previousPolicy);
        setRolePermissionPolicy(previousPolicy);
        throw new Error('権限ロール設定の監査ログ記録に失敗したため、保存を取り消しました。');
      }

      toast.success('権限ロール設定を保存しました。');
    } catch (err: any) {
      console.error('Failed to save role permission policy:', err);
      toast.error(`権限ロール設定の保存に失敗しました: ${err.message || err}`);
    } finally {
      setIsSavingRolePermissionPolicy(false);
    }
  };

  const handleResetRolePermissionPolicy = async () => {
    if (!ensurePermission('manage_staff')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (!window.confirm('権限ロール設定を標準に戻しますか？')) return;

    setIsSavingRolePermissionPolicy(true);
    const previousPolicy = readRolePermissionPolicy();
    try {
      const resetPolicy = resetRolePermissionPolicy();
      setRolePermissionPolicy(resetPolicy);

      const auditOk = await logAuditAction(
        db,
        'facility_settings_update',
        `${buildRolePermissionPolicyAuditDetail(resetPolicy)} 標準設定へ戻しました。`
      );
      if (!auditOk) {
        writeRolePermissionPolicy(previousPolicy);
        setRolePermissionPolicy(previousPolicy);
        throw new Error('権限ロール設定リセットの監査ログ記録に失敗したため、変更を取り消しました。');
      }

      toast.success('権限ロール設定を標準設定へ戻しました。');
    } catch (err: any) {
      console.error('Failed to reset role permission policy:', err);
      toast.error(`権限ロール設定のリセットに失敗しました: ${err.message || err}`);
    } finally {
      setIsSavingRolePermissionPolicy(false);
    }
  };

  return {
    currentUser,
    canManageStaff,
    canViewAuditLogs,
    setIsAddStaffOpen,
    isOnboardingStaffSetup,
    currentStaffRecord,
    shouldPromptCurrentStaffPasskey,
    handleRegisterPasskey,
    isAddStaffOpen,
    handleAddStaff,
    newStaffName,
    setNewStaffName,
    newStaffRole,
    setNewStaffRole,
    newStaffPassword,
    setNewStaffPassword,
    isSubmittingStaff,
    handleResetRolePermissionPolicy,
    isSavingRolePermissionPolicy,
    handleSaveRolePermissionPolicy,
    rolePermissionPolicy,
    handleRolePermissionToggle,
    handleExportStaffAccessRecoveryMonthlyReviewCsv,
    isExportingStaffAccessRecoveryMonthlyReview,
    staffRecoveryChecklist,
    staffRecoveryTargetUserId,
    setStaffRecoveryTargetUserId,
    isHandlingStaffRecovery,
    staffList,
    staffRecoveryReason,
    setStaffRecoveryReason,
    staffRecoveryPassword,
    setStaffRecoveryPassword,
    staffRecoveryNote,
    setStaffRecoveryNote,
    handleResetStaffRecoveryPassword,
    staffRecoveryTarget,
    handleClearStaffRecoveryPasskey,
    handleRecordStaffRetirementCheck,
    credentialedAdminCount,
    handleDeleteStaff
  };
}
