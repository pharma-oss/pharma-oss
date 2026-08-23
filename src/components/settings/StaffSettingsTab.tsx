import React from 'react';
import { Plus, Fingerprint, Loader2, Save, Download, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { User } from '@/db/types';
import {
  ALL_PERMISSION_ACTIONS,
  canUserPerform,
  getPermissionDeniedMessage,
  getPermissionLabel,
  getRoleLabel,
  type PermissionAction,
  type RolePermissionPolicy
} from '@/lib/audit';
import { hasLoginCredential, isInitialAdminUser } from '@/lib/initial_staff';
import {
  STAFF_RECOVERY_REASON_LABELS,
  type StaffRecoveryChecklist,
  type StaffRecoveryReason,
  type StaffRecoveryStepStatus
} from '@/lib/staff_recovery';

const ROLE_PERMISSION_SETTING_ROLES: User['role'][] = ['admin', 'pharmacist', 'clerk'];

  const staffRecoveryStatusStyle = (status: StaffRecoveryStepStatus) => {
    const styles = {
      complete: { color: '#15803d', background: '#f0fdf4', border: '#86efac' },
      attention: { color: '#b45309', background: '#fffbeb', border: '#fcd34d' },
      blocked: { color: '#b91c1c', background: '#fef2f2', border: '#fca5a5' }
    }[status];

    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      border: `1px solid ${styles.border}`,
      padding: '0.14rem 0.55rem',
      fontSize: 'var(--fs-xs)',
      fontWeight: 800,
      color: styles.color,
      background: styles.background,
      whiteSpace: 'nowrap' as const
    };
  };

interface StaffSettingsTabProps {
  currentUser: User;
  canManageStaff: boolean;
  canViewAuditLogs: boolean;
  setIsAddStaffOpen: (open: boolean) => void;
  isOnboardingStaffSetup: boolean;
  currentStaffRecord: User | undefined;
  shouldPromptCurrentStaffPasskey: boolean;
  handleRegisterPasskey: (staff: User) => Promise<void>;
  isAddStaffOpen: boolean;
  handleAddStaff: (e: React.FormEvent) => Promise<void>;
  newStaffName: string;
  setNewStaffName: (value: string) => void;
  newStaffRole: 'pharmacist' | 'clerk' | 'admin';
  setNewStaffRole: (value: 'pharmacist' | 'clerk' | 'admin') => void;
  newStaffPassword: string;
  setNewStaffPassword: (value: string) => void;
  isSubmittingStaff: boolean;
  handleResetRolePermissionPolicy: () => Promise<void>;
  isSavingRolePermissionPolicy: boolean;
  handleSaveRolePermissionPolicy: () => Promise<void>;
  rolePermissionPolicy: RolePermissionPolicy;
  handleRolePermissionToggle: (role: User['role'], action: PermissionAction) => void;
  handleExportStaffAccessRecoveryMonthlyReviewCsv: () => Promise<void>;
  isExportingStaffAccessRecoveryMonthlyReview: boolean;
  staffRecoveryChecklist: StaffRecoveryChecklist;
  staffRecoveryTargetUserId: string;
  setStaffRecoveryTargetUserId: (value: string) => void;
  isHandlingStaffRecovery: boolean;
  staffList: User[];
  staffRecoveryReason: StaffRecoveryReason;
  setStaffRecoveryReason: (value: StaffRecoveryReason) => void;
  staffRecoveryPassword: string;
  setStaffRecoveryPassword: (value: string) => void;
  staffRecoveryNote: string;
  setStaffRecoveryNote: (value: string) => void;
  handleResetStaffRecoveryPassword: () => Promise<void>;
  staffRecoveryTarget: User | null;
  handleClearStaffRecoveryPasskey: () => Promise<void>;
  handleRecordStaffRetirementCheck: () => Promise<void>;
  credentialedAdminCount: number;
  handleDeleteStaff: (staff: User) => Promise<void>;
}

export default function StaffSettingsTab({
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
}: StaffSettingsTabProps) {
  return (
        <div className="settings-section glass">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div>
              <h2>スタッフアカウント・パスキー管理</h2>
              <p className="section-desc" style={{ marginBottom: 0 }}>
                薬局の操作スタッフを管理し、パスワードとデバイス認証（パスキー）の登録・設定を行います。<br />
                <strong style={{ color: 'var(--primary)' }}>
                  🔑 パスワードはソルト付きPBKDF2-SHA-256でハッシュ化され、平文で保存されることはありません。
                </strong>
              </p>
            </div>
            <button
              className="btn-primary flex-center gap-2"
              style={{ padding: '0.6rem 1.2rem', fontSize: 'var(--fs-md)' }}
              onClick={() => setIsAddStaffOpen(true)}
              disabled={!canManageStaff}
              title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
            >
              <Plus size={16} />
              <span>スタッフを追加</span>
            </button>
          </div>

          {isOnboardingStaffSetup && currentStaffRecord && (
            <div
              style={{
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#1e3a8a',
                borderRadius: '8px',
                padding: '1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem'
              }}
            >
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem' }}>
                  {shouldPromptCurrentStaffPasskey ? 'パスキーを登録しましょう' : '次にスタッフを追加しましょう'}
                </strong>
                <span style={{ fontSize: 'var(--fs-base)', lineHeight: 1.6 }}>
                  {shouldPromptCurrentStaffPasskey
                    ? 'パスワードでも使えますが、日々のログインはパスキーにすると速く安全です。'
                    : '管理者の認証設定は完了しています。受付や調剤で使うスタッフを追加できます。'}
                </span>
              </div>
              {shouldPromptCurrentStaffPasskey ? (
                <button
                  className="btn-primary flex-center gap-2"
                  onClick={() => handleRegisterPasskey(currentStaffRecord)}
                  disabled={!canManageStaff}
                  style={{ padding: '0.55rem 1rem' }}
                >
                  <Fingerprint size={16} />
                  <span>パスキーを登録</span>
                </button>
              ) : (
                <button
                  className="btn-primary flex-center gap-2"
                  onClick={() => setIsAddStaffOpen(true)}
                  disabled={!canManageStaff}
                  style={{ padding: '0.55rem 1rem' }}
                >
                  <Plus size={16} />
                  <span>スタッフを追加</span>
                </button>
              )}
            </div>
          )}

          {/* Add Staff Modal/Form */}
          {isAddStaffOpen && (
            <div 
              style={{
                background: 'rgba(255, 255, 255, 0.9)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                marginBottom: '2rem',
                boxShadow: 'var(--shadow-md)'
              }}
            >
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 600 }}>スタッフの新規追加</h3>
              <form onSubmit={handleAddStaff} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="form-grid" style={{ gap: '1rem' }}>
                  <div className="form-group">
                    <label htmlFor="new-staff-name" style={{ fontWeight: 600, fontSize: 'var(--fs-md)' }}>スタッフ氏名</label>
                    <input
                      id="new-staff-name"
                      type="text"
                      className="form-control"
                      style={{ width: '100%', maxWidth: 'none' }}
                      placeholder="例: 佐藤 花子"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="new-staff-role" style={{ fontWeight: 600, fontSize: 'var(--fs-md)' }}>職種・権限</label>
                    <select
                      id="new-staff-role"
                      className="form-control"
                      style={{ width: '100%', maxWidth: 'none', background: 'white' }}
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value as any)}
                    >
                      <option value="pharmacist">薬剤師</option>
                      <option value="clerk">事務</option>
                      <option value="admin">管理者</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label htmlFor="new-staff-password" style={{ fontWeight: 600, fontSize: 'var(--fs-md)' }}>
                      ログインパスワード（任意）
                    </label>
                    <input
                      id="new-staff-password"
                      type="password"
                      className="form-control"
                      style={{ width: '100%', maxWidth: 'none' }}
                      placeholder="8文字以上。未入力の場合はパスキー登録が必要です"
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      minLength={8}
                    />
                    <span className="help-text">
                      ※パスワードはソルト付きハッシュで保存されます。未設定のスタッフは、管理者がパスキーを登録するまでログインできません。
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.5rem 1.25rem' }}
                    onClick={() => {
                      setIsAddStaffOpen(false);
                      setNewStaffName('');
                      setNewStaffPassword('');
                    }}
                    disabled={isSubmittingStaff || !canManageStaff}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-center gap-2"
                    style={{ padding: '0.5rem 1.5rem' }}
                    disabled={isSubmittingStaff || !canManageStaff}
                  >
                    {isSubmittingStaff && <Loader2 size={16} className="animate-spin" />}
                    <span>スタッフを保存</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          <section
            data-testid="role-permission-policy-panel"
            aria-label="権限ロール設定"
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: '#f8fafc'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700 }}>権限ロール設定</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-md)', lineHeight: 1.55 }}>
                  管理者は全権限固定。薬剤師・事務は店舗の運用に合わせて保存されます。
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: '0.45rem 0.85rem', fontSize: 'var(--fs-md)' }}
                  onClick={handleResetRolePermissionPolicy}
                  disabled={!canManageStaff || isSavingRolePermissionPolicy}
                  title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
                >
                  標準に戻す
                </button>
                <button
                  type="button"
                  className="btn-primary flex-center gap-2"
                  style={{ padding: '0.45rem 0.95rem', fontSize: 'var(--fs-md)' }}
                  onClick={handleSaveRolePermissionPolicy}
                  disabled={!canManageStaff || isSavingRolePermissionPolicy}
                  title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
                >
                  {isSavingRolePermissionPolicy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  <span>保存</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {ROLE_PERMISSION_SETTING_ROLES.map((role) => {
                const isAdminRole = role === 'admin';
                return (
                  <div
                    key={role}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      background: 'white',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        padding: '0.65rem 0.75rem',
                        borderBottom: '1px solid #e2e8f0',
                        background: isAdminRole ? '#faf5ff' : role === 'pharmacist' ? '#eff6ff' : '#f0fdf4',
                        color: isAdminRole ? '#6b21a8' : role === 'pharmacist' ? '#1d4ed8' : '#15803d',
                        fontWeight: 800,
                        fontSize: 'var(--fs-md)'
                      }}
                    >
                      <span>{getRoleLabel(role)}</span>
                      {isAdminRole && (
                        <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 800, color: '#6b21a8' }}>
                          固定
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: '0.4rem', padding: '0.75rem' }}>
                      {ALL_PERMISSION_ACTIONS.map((action) => {
                        const checked = !!rolePermissionPolicy[role]?.includes(action);
                        const disabled = isAdminRole || !canManageStaff || isSavingRolePermissionPolicy;
                        return (
                          <label
                            key={`${role}-${action}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '18px 1fr',
                              alignItems: 'center',
                              gap: '0.45rem',
                              minHeight: '28px',
                              color: disabled && !checked ? 'var(--text-ghost)' : 'var(--text-main)',
                              fontSize: 'var(--fs-md)',
                              fontWeight: checked ? 700 : 500,
                              cursor: disabled ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled}
                              onChange={() => handleRolePermissionToggle(role, action)}
                              aria-label={`${getRoleLabel(role)}の${getPermissionLabel(action)}`}
                            />
                            <span>{getPermissionLabel(action)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section
            data-testid="staff-recovery-panel"
            aria-label="復旧・退職対応"
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: '#fff7ed'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700 }}>復旧・退職対応</h3>
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 'var(--fs-md)', lineHeight: 1.55 }}>
                  端末移行、退職、パスキー紛失時に、対象スタッフと確認事項をそろえてから認証情報を復旧します。
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2"
                  style={{ padding: '0.45rem 0.8rem' }}
                  onClick={handleExportStaffAccessRecoveryMonthlyReviewCsv}
                  disabled={!canViewAuditLogs || isExportingStaffAccessRecoveryMonthlyReview}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                  data-testid="staff-access-recovery-monthly-review-csv"
                >
                  {isExportingStaffAccessRecoveryMonthlyReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>月次棚卸CSV</span>
                </button>
                <span style={staffRecoveryStatusStyle(staffRecoveryChecklist.status)}>
                  {staffRecoveryChecklist.statusLabel}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '0.9rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: 'var(--fs-md)' }}>
                対象スタッフ
                <select
                  className="form-control"
                  style={{ width: '100%', maxWidth: 'none', background: 'white' }}
                  value={staffRecoveryTargetUserId}
                  onChange={(e) => setStaffRecoveryTargetUserId(e.target.value)}
                  disabled={!canManageStaff || isHandlingStaffRecovery}
                >
                  {staffList.length === 0 && <option value="">スタッフなし</option>}
                  {staffList.map((staff) => (
                    <option key={staff.userId} value={staff.userId}>
                      {staff.name}（{getRoleLabel(staff.role)}）
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: 'var(--fs-md)' }}>
                理由
                <select
                  className="form-control"
                  style={{ width: '100%', maxWidth: 'none', background: 'white' }}
                  value={staffRecoveryReason}
                  onChange={(e) => setStaffRecoveryReason(e.target.value as StaffRecoveryReason)}
                  disabled={!canManageStaff || isHandlingStaffRecovery}
                >
                  {(Object.keys(STAFF_RECOVERY_REASON_LABELS) as StaffRecoveryReason[]).map((reason) => (
                    <option key={reason} value={reason}>{STAFF_RECOVERY_REASON_LABELS[reason]}</option>
                  ))}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: 'var(--fs-md)' }}>
                再設定パスワード
                <input
                  type="password"
                  className="form-control"
                  style={{ width: '100%', maxWidth: 'none' }}
                  value={staffRecoveryPassword}
                  onChange={(e) => setStaffRecoveryPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="8文字以上"
                  disabled={!canManageStaff || isHandlingStaffRecovery}
                />
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontWeight: 700, fontSize: 'var(--fs-md)', marginBottom: '0.9rem' }}>
              対応メモ
              <textarea
                className="form-control"
                style={{ width: '100%', maxWidth: 'none', minHeight: '72px', resize: 'vertical' }}
                value={staffRecoveryNote}
                onChange={(e) => setStaffRecoveryNote(e.target.value)}
                placeholder="例: 本人確認済み、旧端末は回収済み"
                disabled={!canManageStaff || isHandlingStaffRecovery}
              />
            </label>

            <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '1rem' }}>
              {staffRecoveryChecklist.steps.map((step) => (
                <div
                  key={step.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '0.65rem',
                    alignItems: 'center',
                    padding: '0.55rem 0.65rem',
                    border: '1px solid #fed7aa',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.82)',
                    fontSize: 'var(--fs-md)'
                  }}
                >
                  <strong style={{ color: 'var(--text-main)' }}>{step.label}</strong>
                  <span style={staffRecoveryStatusStyle(step.status)}>
                    {step.status === 'complete' ? 'OK' : step.status === 'attention' ? '要確認' : '要対応'}
                  </span>
                  <span style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>{step.detail}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.5rem 0.9rem' }}
                onClick={handleResetStaffRecoveryPassword}
                disabled={!canManageStaff || isHandlingStaffRecovery || !staffRecoveryTarget || staffRecoveryPassword.trim().length < 8}
                title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : staffRecoveryPassword.trim().length < 8 ? '8文字以上の新しいパスワードを入力してください' : undefined}
              >
                <KeyRound size={15} />
                <span>パスワード再設定</span>
              </button>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                style={{ padding: '0.5rem 0.9rem' }}
                onClick={handleClearStaffRecoveryPasskey}
                disabled={!canManageStaff || isHandlingStaffRecovery || !staffRecoveryTarget?.passkeyCredentialId}
                title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : !staffRecoveryTarget?.passkeyCredentialId ? '解除するパスキーがありません' : undefined}
              >
                <Fingerprint size={15} />
                <span>パスキーを解除</span>
              </button>
              {staffRecoveryReason === 'staff_retirement' && (
                <button
                  type="button"
                  className="btn-primary flex-center gap-2"
                  style={{ padding: '0.5rem 0.95rem' }}
                  onClick={handleRecordStaffRetirementCheck}
                  disabled={!canManageStaff || isHandlingStaffRecovery || !staffRecoveryTarget}
                  title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
                >
                  {isHandlingStaffRecovery ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                  <span>退職前チェックを記録</span>
                </button>
              )}
            </div>
          </section>

          {/* Staff List Table */}
          <div className="table-responsive" style={{ background: 'white', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <table className="audit-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-muted)' }}>氏名</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-muted)' }}>職種・権限</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-muted)' }}>パスワード</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-muted)' }}>パスキーデバイス</th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff) => {
                  const isLastCredentialedAdmin = staff.role === 'admin' && hasLoginCredential(staff) && credentialedAdminCount <= 1;
                  return (
                  <tr key={staff.userId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '1rem', fontSize: 'var(--fs-base)', fontWeight: 600, color: 'var(--text-main)' }}>
                      {staff.name}
                      {isInitialAdminUser(staff) && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            padding: '0.12rem 0.4rem',
                            borderRadius: '4px',
                            background: '#fef3c7',
                            color: '#92400e',
                            fontSize: 'var(--fs-xs)',
                            fontWeight: 700
                          }}
                        >
                          初期管理者
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', fontSize: 'var(--fs-md)' }}>
                      <span 
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: 'var(--fs-sm)',
                          fontWeight: 600,
                          background: staff.role === 'pharmacist' ? '#eff6ff' : staff.role === 'clerk' ? '#f0fdf4' : '#faf5ff',
                          color: staff.role === 'pharmacist' ? '#1d4ed8' : staff.role === 'clerk' ? '#15803d' : '#6b21a8'
                        }}
                      >
                        {staff.role === 'pharmacist' ? '薬剤師' : staff.role === 'clerk' ? '事務' : '管理者'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '1rem',
                        fontSize: 'var(--fs-md)',
                        color: staff.passwordHash && staff.salt ? '#16a34a' : 'var(--text-ghost)',
                        fontWeight: 500
                      }}
                    >
                      {staff.passwordHash && staff.salt ? '● 設定済み (PBKDF2-SHA-256)' : '未設定'}
                    </td>
                    <td style={{ padding: '1rem', fontSize: 'var(--fs-md)' }}>
                      {staff.passkeyCredentialId ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#2563eb', fontWeight: 500 }}>
                          <Fingerprint size={14} />
                          <span>登録済み (WebAuthn)</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-ghost)', fontSize: 'var(--fs-md)' }}>未登録</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          className="btn-secondary flex-center gap-1"
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: 'var(--fs-sm)',
                            borderColor: staff.passkeyCredentialId ? '#d1d5db' : '#3b82f6',
                            color: staff.passkeyCredentialId ? 'var(--text-main)' : '#2563eb',
                            background: staff.passkeyCredentialId ? 'transparent' : 'rgba(37, 99, 235, 0.03)'
                          }}
                          onClick={() => handleRegisterPasskey(staff)}
                          title="生体認証（指紋・顔認証）デバイスをログインキーとして登録します"
                          disabled={!canManageStaff}
                        >
                          <Fingerprint size={13} />
                          <span>{staff.passkeyCredentialId ? '再登録' : 'パスキーを登録'}</span>
                        </button>
                        {!hasLoginCredential(staff) && (
                          <span style={{ color: '#b45309', fontSize: 'var(--fs-sm)', fontWeight: 700 }}>
                            要登録
                          </span>
                        )}
                        <button
                          className="btn-trash flex-center"
                          style={{ padding: '0.4rem', color: '#ef4444' }}
                          onClick={() => handleDeleteStaff(staff)}
                          title={isLastCredentialedAdmin ? '最後の認証済み管理者は削除できません' : 'スタッフアカウントを削除'}
                          aria-label={`${staff.name}を削除`}
                          disabled={!canManageStaff || isLastCredentialedAdmin}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
  );
}
