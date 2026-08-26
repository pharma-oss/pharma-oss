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
          <div className="staff-header">
            <div>
              <h2>スタッフアカウント・パスキー管理</h2>
              <p className="section-desc staff-header-desc">
                薬局の操作スタッフを管理し、パスワードとデバイス認証（パスキー）の登録・設定を行います。<br />
                <strong className="staff-primary-note">
                  🔑 パスワードはソルト付きPBKDF2-SHA-256でハッシュ化され、平文で保存されることはありません。
                </strong>
              </p>
            </div>
            <button
              className="btn-primary flex-center gap-2 btn-add-staff"
              onClick={() => setIsAddStaffOpen(true)}
              disabled={!canManageStaff}
              title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
            >
              <Plus size={16} />
              <span>スタッフを追加</span>
            </button>
          </div>

          {isOnboardingStaffSetup && currentStaffRecord && (
            <div className="onboarding-banner">
              <div>
                <strong className="onboarding-title">
                  {shouldPromptCurrentStaffPasskey ? 'パスキーを登録しましょう' : '次にスタッフを追加しましょう'}
                </strong>
                <span className="onboarding-text">
                  {shouldPromptCurrentStaffPasskey
                    ? 'パスワードでも使えますが、日々のログインはパスキーにすると速く安全です。'
                    : '管理者の認証設定は完了しています。受付や調剤で使うスタッフを追加できます。'}
                </span>
              </div>
              {shouldPromptCurrentStaffPasskey ? (
                <button
                  className="btn-primary flex-center gap-2 btn-onboarding-action"
                  onClick={() => handleRegisterPasskey(currentStaffRecord)}
                  disabled={!canManageStaff}
                >
                  <Fingerprint size={16} />
                  <span>パスキーを登録</span>
                </button>
              ) : (
                <button
                  className="btn-primary flex-center gap-2 btn-onboarding-action"
                  onClick={() => setIsAddStaffOpen(true)}
                  disabled={!canManageStaff}
                >
                  <Plus size={16} />
                  <span>スタッフを追加</span>
                </button>
              )}
            </div>
          )}

          {/* Add Staff Modal/Form */}
          {isAddStaffOpen && (
            <div className="add-staff-card">
              <h3 className="add-staff-title">スタッフの新規追加</h3>
              <form onSubmit={handleAddStaff} className="add-staff-form">
                <div className="form-grid add-staff-grid">
                  <div className="form-group">
                    <label htmlFor="new-staff-name" className="add-staff-label">スタッフ氏名</label>
                    <input
                      id="new-staff-name"
                      type="text"
                      className="form-control input-full-width"
                      placeholder="例: 佐藤 花子"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="new-staff-role" className="add-staff-label">職種・権限</label>
                    <select
                      id="new-staff-role"
                      className="form-control select-full-white"
                      value={newStaffRole}
                      onChange={(e) => setNewStaffRole(e.target.value as any)}
                    >
                      <option value="pharmacist">薬剤師</option>
                      <option value="clerk">事務</option>
                      <option value="admin">管理者</option>
                    </select>
                  </div>

                  <div className="form-group add-staff-full-group">
                    <label htmlFor="new-staff-password" className="add-staff-label">
                      ログインパスワード（任意）
                    </label>
                    <input
                      id="new-staff-password"
                      type="password"
                      className="form-control input-full-width"
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

                <div className="add-staff-actions">
                  <button
                    type="button"
                    className="btn-secondary btn-staff-cancel"
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
                    className="btn-primary flex-center gap-2 btn-staff-save"
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
            className="role-policy-panel"
          >
            <div className="role-policy-head">
              <div>
                <h3 className="role-policy-title">権限ロール設定</h3>
                <p className="role-policy-desc">
                  管理者は全権限固定。薬剤師・事務は店舗の運用に合わせて保存されます。
                </p>
              </div>
              <div className="role-policy-actions">
                <button
                  type="button"
                  className="btn-secondary btn-role-reset"
                  onClick={handleResetRolePermissionPolicy}
                  disabled={!canManageStaff || isSavingRolePermissionPolicy}
                  title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
                >
                  標準に戻す
                </button>
                <button
                  type="button"
                  className="btn-primary flex-center gap-2 btn-role-save"
                  onClick={handleSaveRolePermissionPolicy}
                  disabled={!canManageStaff || isSavingRolePermissionPolicy}
                  title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
                >
                  {isSavingRolePermissionPolicy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  <span>保存</span>
                </button>
              </div>
            </div>

            <div className="role-policy-grid">
              {ROLE_PERMISSION_SETTING_ROLES.map((role) => {
                const isAdminRole = role === 'admin';
                return (
                  <div
                    key={role}
                    className="role-card"
                  >
                    <div
                      className={`role-card-header ${role}`}
                    >
                      <span>{getRoleLabel(role)}</span>
                      {isAdminRole && (
                        <span className="role-fixed-badge">
                          固定
                        </span>
                      )}
                    </div>
                    <div className="role-permissions-list">
                      {ALL_PERMISSION_ACTIONS.map((action) => {
                        const checked = !!rolePermissionPolicy[role]?.includes(action);
                        const disabled = isAdminRole || !canManageStaff || isSavingRolePermissionPolicy;
                        return (
                          <label
                            key={`${role}-${action}`}
                            className={`role-permission-item ${disabled ? 'disabled' : ''} ${checked ? 'checked' : ''}`}
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
            className="recovery-panel"
          >
            <div className="recovery-head">
              <div>
                <h3 className="recovery-title">復旧・退職対応</h3>
                <p className="recovery-desc">
                  端末移行、退職、パスキー紛失時に、対象スタッフと確認事項をそろえてから認証情報を復旧します。
                </p>
              </div>
              <div className="recovery-head-actions">
                <button
                  type="button"
                  className="btn-secondary flex-center gap-2 btn-recovery-csv"
                  onClick={handleExportStaffAccessRecoveryMonthlyReviewCsv}
                  disabled={!canViewAuditLogs || isExportingStaffAccessRecoveryMonthlyReview}
                  title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
                  data-testid="staff-access-recovery-monthly-review-csv"
                >
                  {isExportingStaffAccessRecoveryMonthlyReview ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                  <span>月次棚卸CSV</span>
                </button>
                <span className={`recovery-status-badge ${staffRecoveryChecklist.status}`}>
                  {staffRecoveryChecklist.statusLabel}
                </span>
              </div>
            </div>

            <div className="recovery-inputs-grid">
              <label className="recovery-input-label">
                対象スタッフ
                <select
                  className="form-control select-full-white"
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

              <label className="recovery-input-label">
                理由
                <select
                  className="form-control select-full-white"
                  value={staffRecoveryReason}
                  onChange={(e) => setStaffRecoveryReason(e.target.value as StaffRecoveryReason)}
                  disabled={!canManageStaff || isHandlingStaffRecovery}
                >
                  {(Object.keys(STAFF_RECOVERY_REASON_LABELS) as StaffRecoveryReason[]).map((reason) => (
                    <option key={reason} value={reason}>{STAFF_RECOVERY_REASON_LABELS[reason]}</option>
                  ))}
                </select>
              </label>

              <label className="recovery-input-label">
                再設定パスワード
                <input
                  type="password"
                  className="form-control input-full-width"
                  value={staffRecoveryPassword}
                  onChange={(e) => setStaffRecoveryPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="8文字以上"
                  disabled={!canManageStaff || isHandlingStaffRecovery}
                />
              </label>
            </div>

            <label className="recovery-note-label">
              対応メモ
              <textarea
                className="form-control recovery-textarea"
                value={staffRecoveryNote}
                onChange={(e) => setStaffRecoveryNote(e.target.value)}
                placeholder="例: 本人確認済み、旧端末は回収済み"
                disabled={!canManageStaff || isHandlingStaffRecovery}
              />
            </label>

            <div className="recovery-steps-list">
              {staffRecoveryChecklist.steps.map((step) => (
                <div
                  key={step.id}
                  className="recovery-step-row"
                >
                  <strong className="recovery-step-label">{step.label}</strong>
                  <span className={`recovery-status-badge ${step.status}`}>
                    {step.status === 'complete' ? 'OK' : step.status === 'attention' ? '要確認' : '要対応'}
                  </span>
                  <span className="recovery-step-detail">{step.detail}</span>
                </div>
              ))}
            </div>

            <div className="recovery-actions-bar">
              <button
                type="button"
                className="btn-secondary flex-center gap-2 btn-recovery-action"
                onClick={handleResetStaffRecoveryPassword}
                disabled={!canManageStaff || isHandlingStaffRecovery || !staffRecoveryTarget || staffRecoveryPassword.trim().length < 8}
                title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : staffRecoveryPassword.trim().length < 8 ? '8文字以上の新しいパスワードを入力してください' : undefined}
              >
                <KeyRound size={15} />
                <span>パスワード再設定</span>
              </button>
              <button
                type="button"
                className="btn-secondary flex-center gap-2 btn-recovery-action"
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
                  className="btn-primary flex-center gap-2 btn-recovery-primary"
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
          <div className="table-responsive staff-table-wrapper">
            <table className="audit-table staff-table">
              <thead>
                <tr className="staff-thead-tr">
                  <th className="staff-th">氏名</th>
                  <th className="staff-th">職種・権限</th>
                  <th className="staff-th">パスワード</th>
                  <th className="staff-th">パスキーデバイス</th>
                  <th className="staff-th-action">操作</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((staff) => {
                  const isLastCredentialedAdmin = staff.role === 'admin' && hasLoginCredential(staff) && credentialedAdminCount <= 1;
                  return (
                  <tr key={staff.userId} className="staff-tr">
                    <td className="staff-td-name">
                      {staff.name}
                      {isInitialAdminUser(staff) && (
                        <span className="badge-initial-admin">
                          初期管理者
                        </span>
                      )}
                    </td>
                    <td className="staff-td-role">
                      <span className={`badge-role ${staff.role}`}>
                        {staff.role === 'pharmacist' ? '薬剤師' : staff.role === 'clerk' ? '事務' : '管理者'}
                      </span>
                    </td>
                    <td className={`staff-td-password ${staff.passwordHash && staff.salt ? 'set' : 'unset'}`}>
                      {staff.passwordHash && staff.salt ? '● 設定済み (PBKDF2-SHA-256)' : '未設定'}
                    </td>
                    <td className="staff-td-passkey">
                      {staff.passkeyCredentialId ? (
                        <span className="passkey-registered">
                          <Fingerprint size={14} />
                          <span>登録済み (WebAuthn)</span>
                        </span>
                      ) : (
                        <span className="passkey-unregistered">未登録</span>
                      )}
                    </td>
                    <td className="staff-td-action">
                      <div className="staff-actions-cell">
                        <button
                          className={`btn-secondary flex-center gap-1 btn-passkey-register ${staff.passkeyCredentialId ? 'registered' : 'unregistered'}`}
                          onClick={() => handleRegisterPasskey(staff)}
                          title="生体認証（指紋・顔認証）デバイスをログインキーとして登録します"
                          disabled={!canManageStaff}
                        >
                          <Fingerprint size={13} />
                          <span>{staff.passkeyCredentialId ? '再登録' : 'パスキーを登録'}</span>
                        </button>
                        {!hasLoginCredential(staff) && (
                          <span className="badge-unregistered">
                            要登録
                          </span>
                        )}
                        <button
                          className="btn-trash flex-center btn-trash-staff"
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

          <style jsx>{`
            .staff-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1.5rem;
            }
            .staff-header-desc {
              margin-bottom: 0;
            }
            .staff-primary-note {
              color: var(--primary);
            }
            .btn-add-staff {
              padding: 0.6rem 1.2rem;
              font-size: var(--fs-md);
            }
            .onboarding-banner {
              border: 1px solid #bfdbfe;
              background: #eff6ff;
              color: #1e3a8a;
              border-radius: 8px;
              padding: 1rem;
              margin-bottom: 1.25rem;
              display: flex;
              flex-wrap: wrap;
              align-items: center;
              justify-content: space-between;
              gap: 0.75rem;
            }
            .onboarding-title {
              display: block;
              margin-bottom: 0.25rem;
            }
            .onboarding-text {
              font-size: var(--fs-base);
              line-height: 1.6;
            }
            .btn-onboarding-action {
              padding: 0.55rem 1rem;
            }
            .add-staff-card {
              background: rgba(255, 255, 255, 0.9);
              border: 1px solid var(--border);
              border-radius: var(--radius-lg);
              padding: 1.5rem;
              margin-bottom: 2rem;
              box-shadow: var(--shadow-md);
            }
            .add-staff-title {
              margin: 0 0 1rem 0;
              font-size: 1.1rem;
              font-weight: 600;
            }
            .add-staff-form {
              display: flex;
              flex-direction: column;
              gap: 1.25rem;
            }
            .add-staff-grid {
              gap: 1rem;
            }
            .add-staff-label {
              font-weight: 600;
              font-size: var(--fs-md);
            }
            .input-full-width {
              width: 100%;
              max-width: none;
            }
            .select-full-white {
              width: 100%;
              max-width: none;
              background: white;
            }
            .add-staff-full-group {
              grid-column: 1 / -1;
            }
            .add-staff-actions {
              display: flex;
              gap: 0.75rem;
              justify-content: flex-end;
              margin-top: 0.5rem;
            }
            .btn-staff-cancel {
              padding: 0.5rem 1.25rem;
            }
            .btn-staff-save {
              padding: 0.5rem 1.5rem;
            }
            .role-policy-panel {
              border: 1px solid var(--border);
              border-radius: 8px;
              padding: 1rem;
              margin-bottom: 1.5rem;
              background: #f8fafc;
            }
            .role-policy-head {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 1rem;
              flex-wrap: wrap;
              margin-bottom: 1rem;
            }
            .role-policy-title {
              margin: 0 0 0.35rem;
              font-size: 1rem;
              font-weight: 700;
            }
            .role-policy-desc {
              margin: 0;
              color: var(--text-muted);
              font-size: var(--fs-md);
              line-height: 1.55;
            }
            .role-policy-actions {
              display: flex;
              gap: 0.5rem;
              flex-wrap: wrap;
              justify-content: flex-end;
            }
            .btn-role-reset {
              padding: 0.45rem 0.85rem;
              font-size: var(--fs-md);
            }
            .btn-role-save {
              padding: 0.45rem 0.95rem;
              font-size: var(--fs-md);
            }
            .role-policy-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              gap: 0.75rem;
            }
            .role-card {
              border: 1px solid #e2e8f0;
              border-radius: 8px;
              background: white;
              overflow: hidden;
            }
            .role-card-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 0.5rem;
              padding: 0.65rem 0.75rem;
              border-bottom: 1px solid #e2e8f0;
              font-weight: 800;
              font-size: var(--fs-md);
            }
            .role-card-header.admin {
              background: #faf5ff;
              color: #6b21a8;
            }
            .role-card-header.pharmacist {
              background: #eff6ff;
              color: #1d4ed8;
            }
            .role-card-header.clerk {
              background: #f0fdf4;
              color: #15803d;
            }
            .role-fixed-badge {
              font-size: var(--fs-xs);
              font-weight: 800;
              color: #6b21a8;
            }
            .role-permissions-list {
              display: grid;
              gap: 0.4rem;
              padding: 0.75rem;
            }
            .role-permission-item {
              display: grid;
              grid-template-columns: 18px 1fr;
              align-items: center;
              gap: 0.45rem;
              min-height: 28px;
              color: var(--text-main);
              font-size: var(--fs-md);
              font-weight: 500;
              cursor: pointer;
            }
            .role-permission-item.disabled {
              color: var(--text-ghost);
              cursor: not-allowed;
            }
            .role-permission-item.checked {
              font-weight: 700;
              color: var(--text-main);
            }
            .recovery-panel {
              border: 1px solid var(--border);
              border-radius: 8px;
              padding: 1rem;
              margin-bottom: 1.5rem;
              background: #fff7ed;
            }
            .recovery-head {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 1rem;
              flex-wrap: wrap;
              margin-bottom: 1rem;
            }
            .recovery-title {
              margin: 0 0 0.35rem;
              font-size: 1rem;
              font-weight: 700;
            }
            .recovery-desc {
              margin: 0;
              color: var(--text-muted);
              font-size: var(--fs-md);
              line-height: 1.55;
            }
            .recovery-head-actions {
              display: flex;
              align-items: center;
              gap: 0.55rem;
              flex-wrap: wrap;
              justify-content: flex-end;
            }
            .btn-recovery-csv {
              padding: 0.45rem 0.8rem;
            }
            .recovery-status-badge {
              display: inline-flex;
              align-items: center;
              border-radius: 999px;
              padding: 0.14rem 0.55rem;
              font-size: var(--fs-xs);
              font-weight: 800;
              white-space: nowrap;
            }
            .recovery-status-badge.complete {
              color: #15803d;
              background: #f0fdf4;
              border: 1px solid #86efac;
            }
            .recovery-status-badge.attention {
              color: #b45309;
              background: #fffbeb;
              border: 1px solid #fcd34d;
            }
            .recovery-status-badge.blocked {
              color: #b91c1c;
              background: #fef2f2;
              border: 1px solid #fca5a5;
            }
            .recovery-inputs-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              gap: 0.75rem;
              margin-bottom: 0.9rem;
            }
            .recovery-input-label {
              display: flex;
              flex-direction: column;
              gap: 0.35rem;
              fontWeight: 700;
              font-size: var(--fs-md);
            }
            .recovery-note-label {
              display: flex;
              flex-direction: column;
              gap: 0.35rem;
              font-weight: 700;
              font-size: var(--fs-md);
              margin-bottom: 0.9rem;
            }
            .recovery-textarea {
              width: 100%;
              max-width: none;
              min-height: 72px;
              resize: vertical;
            }
            .recovery-steps-list {
              display: grid;
              gap: 0.45rem;
              margin-bottom: 1rem;
            }
            .recovery-step-row {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
              gap: 0.65rem;
              align-items: center;
              padding: 0.55rem 0.65rem;
              border: 1px solid #fed7aa;
              border-radius: 8px;
              background: rgba(255, 255, 255, 0.82);
              font-size: var(--fs-md);
            }
            .recovery-step-label {
              color: var(--text-main);
            }
            .recovery-step-detail {
              color: var(--text-muted);
              line-height: 1.5;
            }
            .recovery-actions-bar {
              display: flex;
              gap: 0.65rem;
              flex-wrap: wrap;
              justify-content: flex-end;
            }
            .btn-recovery-action {
              padding: 0.5rem 0.9rem;
            }
            .btn-recovery-primary {
              padding: 0.5rem 0.95rem;
            }
            .staff-table-wrapper {
              background: white;
              border-radius: var(--radius-md);
              border: 1px solid var(--border);
              overflow: hidden;
            }
            .staff-table {
              width: 100%;
              border-collapse: collapse;
              text-align: left;
            }
            .staff-thead-tr {
              background: #f8fafc;
              border-bottom: 1px solid var(--border);
            }
            .staff-th {
              padding: 0.75rem 1rem;
              font-size: var(--fs-md);
              font-weight: 600;
              color: var(--text-muted);
            }
            .staff-th-action {
              padding: 0.75rem 1rem;
              font-size: var(--fs-md);
              font-weight: 600;
              color: var(--text-muted);
              text-align: right;
            }
            .staff-tr {
              border-bottom: 1px solid #f1f5f9;
            }
            .staff-td-name {
              padding: 1rem;
              font-size: var(--fs-base);
              font-weight: 600;
              color: var(--text-main);
            }
            .badge-initial-admin {
              margin-left: 0.5rem;
              padding: 0.12rem 0.4rem;
              border-radius: 4px;
              background: #fef3c7;
              color: #92400e;
              font-size: var(--fs-xs);
              font-weight: 700;
            }
            .staff-td-role {
              padding: 1rem;
              font-size: var(--fs-md);
            }
            .badge-role {
              padding: 0.2rem 0.5rem;
              border-radius: 4px;
              font-size: var(--fs-sm);
              font-weight: 600;
            }
            .badge-role.pharmacist {
              background: #eff6ff;
              color: #1d4ed8;
            }
            .badge-role.clerk {
              background: #f0fdf4;
              color: #15803d;
            }
            .badge-role.admin {
              background: #faf5ff;
              color: #6b21a8;
            }
            .staff-td-password {
              padding: 1rem;
              font-size: var(--fs-md);
              font-weight: 500;
            }
            .staff-td-password.set {
              color: #16a34a;
            }
            .staff-td-password.unset {
              color: var(--text-ghost);
            }
            .staff-td-passkey {
              padding: 1rem;
              font-size: var(--fs-md);
            }
            .passkey-registered {
              display: inline-flex;
              align-items: center;
              gap: 0.25rem;
              color: #2563eb;
              font-weight: 500;
            }
            .passkey-unregistered {
              color: var(--text-ghost);
              font-size: var(--fs-md);
            }
            .staff-td-action {
              padding: 1rem;
              text-align: right;
            }
            .staff-actions-cell {
              display: inline-flex;
              gap: 0.5rem;
              align-items: center;
            }
            .btn-passkey-register {
              padding: 0.35rem 0.75rem;
              font-size: var(--fs-sm);
            }
            .btn-passkey-register.registered {
              border-color: #d1d5db;
              color: var(--text-main);
              background: transparent;
            }
            .btn-passkey-register.unregistered {
              border-color: #3b82f6;
              color: #2563eb;
              background: rgba(37, 99, 235, 0.03);
            }
            .badge-unregistered {
              color: #b45309;
              font-size: var(--fs-sm);
              font-weight: 700;
            }
            .btn-trash-staff {
              padding: 0.4rem;
              color: #ef4444;
            }
          `}</style>
        </div>
  );
}
