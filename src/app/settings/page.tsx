'use client';

import React, { useState, useEffect } from 'react';
import { useDatabase } from '@/db/DatabaseProvider';
import {
  Building2,
  CheckCircle,
  FileText,
  Fingerprint,
  History,
  ShieldCheck,
  Database,
  Download,
  Network,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import type { User } from '@/db/types';
import {
  canUserPerform,
  getCurrentUser,
  getPermissionDeniedMessage,
  logAuditAction,
  UNAUTHENTICATED_USER,
  type PermissionAction
} from '@/lib/audit';
import TerminalSyncPanel from '@/components/TerminalSyncPanel';
import FacilitySettingsTab from '@/components/settings/FacilitySettingsTab';
import ExternalConnectorSettingsTab from '@/components/settings/ExternalConnectorSettingsTab';
import MedicationInfoTemplateSettingsTab from '@/components/settings/MedicationInfoTemplateSettingsTab';
import DrugMasterSettingsTab from '@/components/settings/DrugMasterSettingsTab';
import BackupSettingsTab from '@/components/settings/BackupSettingsTab';
import OfficialAuditSettingsTab from '@/components/settings/OfficialAuditSettingsTab';
import AuditSettingsTab from '@/components/settings/AuditSettingsTab';
import StaffSettingsTab from '@/components/settings/StaffSettingsTab';

import { useAuditSettings } from '@/hooks/useAuditSettings';
import { useMedicationInfoTemplateSettings } from '@/hooks/useMedicationInfoTemplateSettings';
import { useBackupSettings } from '@/hooks/useBackupSettings';
import { useDrugMasterSettings } from '@/hooks/useDrugMasterSettings';
import { useStaffSettings } from '@/hooks/useStaffSettings';
import { useOfficialAuditSettings } from '@/hooks/useOfficialAuditSettings';
import { useFacilitySettings } from '@/hooks/useFacilitySettings';
import { useExternalConnectorSettings } from '@/hooks/useExternalConnectorSettings';

import { readBackupSchedulePolicy } from '@/lib/backup_schedule_storage';
import { getDrugInfoReferenceCount } from '@/lib/drug_info_reference';
import {
  buildInitialSetupChecklist,
  buildInitialSetupChecklistCsv,
  buildInitialSetupHandoffMemo,
  type InitialSetupStep,
  type InitialSetupTab
} from '@/lib/onboarding';
import { getOfficialAuditBlockers, getOfficialAuditSummary } from '@/lib/official_audit';
import { downloadTextFile } from '@/lib/blob_download';

type SettingsTab = 'facility' | 'external' | 'master' | 'medicationInfo' | 'backup' | 'officialAudit' | 'audit' | 'staff' | 'terminalSync';

const INITIAL_SETUP_TAB_PERMISSIONS: Record<InitialSetupTab, PermissionAction> = {
  facility: 'manage_facility_settings',
  master: 'update_drug_master',
  backup: 'manage_backups',
  audit: 'view_audit_logs',
  staff: 'manage_staff'
};

function formatDateTimeStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function makeInitialSetupChecklistCsvFileName(date = new Date()): string {
  return `yakureki_initial_setup_checklist_${formatDateTimeStamp(date)}.csv`;
}



export default function SettingsPage() {
  const db = useDatabase();
  const [activeTab, setActiveTab] = useState<SettingsTab>('facility');
  const [currentUser, setCurrentUser] = useState<User>(UNAUTHENTICATED_USER);
  const canManageFacility = canUserPerform(currentUser, 'manage_facility_settings');
  const canUpdateDrugMaster = canUserPerform(currentUser, 'update_drug_master');
  const canViewOfficialAudit = canUserPerform(currentUser, 'view_official_audit');
  const canViewAuditLogs = canUserPerform(currentUser, 'view_audit_logs');
  const canApproveDailyClosing = canUserPerform(currentUser, 'approve_daily_closing');
  const canManageBackups = canUserPerform(currentUser, 'manage_backups');
  const canManageStaff = canUserPerform(currentUser, 'manage_staff');
  const officialAuditSummary = getOfficialAuditSummary();
  const officialAuditBlockers = getOfficialAuditBlockers();
  const [isOnboardingStaffSetup, setIsOnboardingStaffSetup] = useState(false);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'facility' || tab === 'external' || tab === 'master' || tab === 'medicationInfo' || tab === 'backup' || tab === 'officialAudit' || tab === 'audit' || tab === 'staff' || tab === 'terminalSync') {
      setActiveTab(tab);
    }
    if (params.get('onboarding') === '1') {
      setActiveTab('staff');
      setIsOnboardingStaffSetup(true);
    }
  }, []);

  const ensurePermission = (action: PermissionAction) => {
    if (canUserPerform(getCurrentUser(), action)) return true;
    toast.error(getPermissionDeniedMessage(getCurrentUser(), action));
    return false;
  };

  const openTab = (tab: SettingsTab, action: PermissionAction) => {
    if (ensurePermission(action)) {
      setActiveTab(tab);
    }
  };

  const handleOpenInitialSetupStep = (step: InitialSetupStep) => {
    openTab(step.tab, INITIAL_SETUP_TAB_PERMISSIONS[step.tab]);
  };

  const downloadTextFile = (fileName: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };









  const facilitySettings = useFacilitySettings({
    db: db ?? null,
    currentUser,
    canManageFacility,
    auditLogs: [],
    ensurePermission
  });

  const auditSettings = useAuditSettings({
    db: db ?? null,
    currentUser,
    canViewAuditLogs,
    canManageFacility,
    canApproveDailyClosing,
    settings: facilitySettings.settings,
    officialAuditSummary,
    officialAuditBlockers,
    backupSchedulePolicy: readBackupSchedulePolicy(),
    getDrugInfoReferenceCount,
    ensurePermission
  });
  const { auditLogs, auditIntegrity, isCheckingAuditIntegrity, fetchAuditLogs } = auditSettings;

  const backupSettings = useBackupSettings({
    db: db ?? null,
    currentUser,
    canManageBackups,
    auditLogs,
    fetchAuditLogs,
    formatDateTimeStamp,
    ensurePermission,
    aiSuggestionFeedbackReview: auditSettings.aiSuggestionFeedbackReview,
    soapDraftFeedbackBackground: auditSettings.soapDraftFeedbackBackground,
    soapDraftFeedbackColor: auditSettings.soapDraftFeedbackColor,
    storeFeedbackBackground: auditSettings.storeFeedbackBackground,
    storeFeedbackColor: auditSettings.storeFeedbackColor
  });

  const medicationInfoTemplateSettings = useMedicationInfoTemplateSettings({
    db: db ?? null,
    currentUser,
    canManageFacility,
    ensurePermission,
    refreshAuditEvidence: auditSettings.fetchAuditLogs
  });

  const drugMasterSettings = useDrugMasterSettings({
    db: db ?? null,
    currentUser,
    canUpdateDrugMaster,
    ensurePermission,
    refreshAuditEvidence: auditSettings.fetchAuditLogs
  });

  const staffSettings = useStaffSettings({
    db: db ?? null,
    currentUser,
    canManageStaff,
    canViewAuditLogs,
    auditLogs,
    auditIntegrity,
    fetchAuditLogs,
    ensurePermission,
    isOnboardingStaffSetup,
    setIsOnboardingStaffSetup
  });

  const officialAuditSettings = useOfficialAuditSettings({
    db: db ?? null,
    canViewOfficialAudit,
    ensurePermission,
    refreshAuditEvidence: auditSettings.fetchAuditLogs
  });

  const externalConnectorSettings = useExternalConnectorSettings({
    canManageFacility,
    activeTab
  });

  const handleExportInitialSetupChecklistCsv = async () => {
    const generatedAt = new Date();
    const checklist = buildInitialSetupChecklist({
      settings: facilitySettings.settings,
      staff: staffSettings.staffList,
      auditLogs,
      generatedAt
    });
    const fileName = makeInitialSetupChecklistCsvFileName(generatedAt);
    downloadTextFile(fileName, `\ufeff${buildInitialSetupChecklistCsv(checklist)}`, 'text/csv;charset=utf-8');

    if (db && canUserPerform(getCurrentUser(), 'view_audit_logs')) {
      try {
        await logAuditAction(
          db,
          'audit_export',
          `初回セットアップチェックリストCSVエクスポート: ${fileName} を書き出しました（判定: ${checklist.statusLabel}, 完了: ${checklist.completedCount}/${checklist.steps.length}）。`
        );
        await fetchAuditLogs();
      } catch (error) {
        console.error('Failed to log initial setup checklist export:', error);
      }
    }

    toast.success(`初回セットアップチェックリストCSVを書き出しました（${checklist.statusLabel}）。`);
  };

  const handleCopyInitialSetupHandoffMemo = async () => {
    if (!navigator.clipboard?.writeText) {
      toast.error('このブラウザではクリップボードへコピーできません。チェックリストCSVを出力してください。');
      return;
    }

    const generatedAt = new Date();
    const checklist = buildInitialSetupChecklist({
      settings: facilitySettings.settings,
      staff: staffSettings.staffList,
      auditLogs,
      generatedAt
    });
    const memo = buildInitialSetupHandoffMemo(checklist);

    try {
      await navigator.clipboard.writeText(memo);
    } catch (error) {
      console.error('Failed to copy initial setup handoff memo:', error);
      toast.error('初回セットアップ引き継ぎメモのコピーに失敗しました。チェックリストCSVを出力してください。');
      return;
    }

    if (db && canUserPerform(getCurrentUser(), 'view_audit_logs')) {
      try {
        await logAuditAction(
          db,
          'audit_export',
          `初回セットアップ引き継ぎメモコピー: 判定 ${checklist.statusLabel}, 次作業 ${checklist.nextStep?.title || 'なし'}, 完了 ${checklist.completedCount}/${checklist.steps.length}。`
        );
        await fetchAuditLogs();
      } catch (error) {
        console.error('Failed to log initial setup handoff memo copy:', error);
      }
    }

    toast.success(`初回セットアップ引き継ぎメモをコピーしました（${checklist.statusLabel}）。`);
  };

  const initialSetupChecklist = buildInitialSetupChecklist({
    settings: facilitySettings.settings,
    staff: staffSettings.staffList,
    auditLogs
  });
  const initialSetupStatusColor = initialSetupChecklist.status === 'complete'
    ? '#15803d'
    : initialSetupChecklist.status === 'attention'
      ? '#b45309'
      : '#b91c1c';
  const initialSetupStatusBackground = initialSetupChecklist.status === 'complete'
    ? '#f0fdf4'
    : initialSetupChecklist.status === 'attention'
      ? '#fffbeb'
      : '#fef2f2';

  return (
    <div className="settings-container">
      <div className="page-header">
        <h1>Settings / 設定</h1>
        <p className="text-muted">システムの設定とマスタ管理</p>
      </div>

      <section className="initial-setup-panel" aria-label="初回セットアップウィザード" data-testid="initial-setup-panel">
        <div className="initial-setup-head">
          <div>
            <h2>初回セットアップ</h2>
            <p className="section-desc">新規店舗のテスト運用開始に必要な設定、移行、請求、印刷、バックアップ訓練を確認します。</p>
          </div>
          <div className="initial-setup-actions">
            <span
              className={`initial-setup-status status-${initialSetupChecklist.status}`}
            >
              {initialSetupChecklist.statusLabel}
            </span>
            {initialSetupChecklist.nextStep && (
              <button
                type="button"
                className="btn-primary flex-center gap-2"
                data-testid="initial-setup-next-step-button"
                onClick={() => handleOpenInitialSetupStep(initialSetupChecklist.nextStep!)}
                disabled={!canUserPerform(currentUser, INITIAL_SETUP_TAB_PERMISSIONS[initialSetupChecklist.nextStep.tab])}
                title={!canUserPerform(currentUser, INITIAL_SETUP_TAB_PERMISSIONS[initialSetupChecklist.nextStep.tab])
                  ? getPermissionDeniedMessage(currentUser, INITIAL_SETUP_TAB_PERMISSIONS[initialSetupChecklist.nextStep.tab])
                  : undefined}
              >
                <CheckCircle size={16} aria-hidden="true" />
                <span>{initialSetupChecklist.nextStep.actionLabel}</span>
              </button>
            )}
            <button
              type="button"
              className="btn-secondary flex-center gap-2"
              data-testid="initial-setup-checklist-csv-button"
              onClick={handleExportInitialSetupChecklistCsv}
            >
              <Download size={16} aria-hidden="true" />
              <span>チェックリストCSV</span>
            </button>
            <button
              type="button"
              className="btn-secondary flex-center gap-2"
              data-testid="initial-setup-handoff-memo-button"
              onClick={handleCopyInitialSetupHandoffMemo}
            >
              <FileText size={16} aria-hidden="true" />
              <span>引き継ぎメモ</span>
            </button>
          </div>
        </div>

        <div className="initial-setup-metrics">
          {[
            ['完了率', `${initialSetupChecklist.completionRate}%`],
            ['完了', `${initialSetupChecklist.completedCount}/${initialSetupChecklist.steps.length}`],
            ['要確認', `${initialSetupChecklist.attentionCount}件`],
            ['未完了', `${initialSetupChecklist.blockedCount}件`]
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <div className="initial-setup-steps">
          {initialSetupChecklist.steps.map((step) => {
            const permission = INITIAL_SETUP_TAB_PERMISSIONS[step.tab];
            const canOpenStep = canUserPerform(currentUser, permission);
            return (
              <div key={step.id} className="initial-setup-step" data-testid={`initial-setup-step-${step.id}`}>
                <div className="initial-setup-step-main">
                  <span className={`initial-setup-step-status status-${step.status}`}>{step.statusLabel}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <span>{step.evidence}</span>
                    <div className="initial-setup-required-actions">
                      {step.requiredActions.slice(0, 2).map((action) => (
                        <span key={action}>{action}</span>
                      ))}
                      {step.requiredActions.length > 2 && (
                        <span>ほか{step.requiredActions.length - 2}件</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleOpenInitialSetupStep(step)}
                  disabled={!canOpenStep}
                  title={!canOpenStep ? getPermissionDeniedMessage(currentUser, permission) : undefined}
                >
                  {step.actionLabel}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* タブ選択ナビゲーション */}
      <div className="section-tabs" role="tablist">
        <button
          className={`tab-pill ${activeTab === 'facility' ? 'active' : ''}`}
          onClick={() => openTab('facility', 'manage_facility_settings')}
          disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : undefined}
        >
          <Building2 size={15} aria-hidden="true" />
          施設基準設定
        </button>
        <button
          className={`tab-pill ${activeTab === 'external' ? 'active' : ''}`}
          onClick={() => openTab('external', 'manage_facility_settings')}
          disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : undefined}
          data-testid="settings-tab-external-connectors"
        >
          <Network size={15} aria-hidden="true" />
          外部連携
        </button>
        <button
          className={`tab-pill ${activeTab === 'master' ? 'active' : ''}`}
          onClick={() => openTab('master', 'update_drug_master')}
          disabled={!canUpdateDrugMaster}
          title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : undefined}
        >
          <RefreshCw size={15} aria-hidden="true" />
          マスタ更新
        </button>
        <button
          className={`tab-pill ${activeTab === 'medicationInfo' ? 'active' : ''}`}
          onClick={() => openTab('medicationInfo', 'manage_facility_settings')}
          disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : undefined}
          data-testid="settings-tab-medication-info"
        >
          <FileText size={15} aria-hidden="true" />
          薬情テンプレ
        </button>
        <button
          className={`tab-pill ${activeTab === 'backup' ? 'active' : ''}`}
          onClick={() => openTab('backup', 'manage_backups')}
          disabled={!canManageBackups}
          title={!canManageBackups ? getPermissionDeniedMessage(currentUser, 'manage_backups') : undefined}
          data-testid="settings-tab-backup"
        >
          <Database size={15} aria-hidden="true" />
          バックアップ
        </button>
        <button
          className={`tab-pill ${activeTab === 'officialAudit' ? 'active' : ''}`}
          onClick={() => openTab('officialAudit', 'view_official_audit')}
          disabled={!canViewOfficialAudit}
          title={!canViewOfficialAudit ? getPermissionDeniedMessage(currentUser, 'view_official_audit') : undefined}
        >
          <ShieldCheck size={15} aria-hidden="true" />
          公式仕様点検
        </button>
        <button
          className={`tab-pill ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => openTab('audit', 'view_audit_logs')}
          disabled={!canViewAuditLogs}
          title={!canViewAuditLogs ? getPermissionDeniedMessage(currentUser, 'view_audit_logs') : undefined}
        >
          <History size={15} aria-hidden="true" />
          操作ログ（監査証跡）
        </button>
        <button
          className={`tab-pill ${activeTab === 'staff' ? 'active' : ''}`}
          onClick={() => openTab('staff', 'manage_staff')}
          disabled={!canManageStaff}
          title={!canManageStaff ? getPermissionDeniedMessage(currentUser, 'manage_staff') : undefined}
        >
          <Fingerprint size={15} aria-hidden="true" />
          スタッフ管理（パスキー）
        </button>
        <button
          className={`tab-pill ${activeTab === 'terminalSync' ? 'active' : ''}`}
          onClick={() => openTab('terminalSync', 'manage_facility_settings')}
          disabled={!canManageFacility}
          title={!canManageFacility ? getPermissionDeniedMessage(currentUser, 'manage_facility_settings') : undefined}
        >
          <Network size={15} aria-hidden="true" />
          端末同期
        </button>
      </div>

      {activeTab === 'facility' && (
        <FacilitySettingsTab {...facilitySettings} />
      )}

      {activeTab === 'external' && (
        <ExternalConnectorSettingsTab {...externalConnectorSettings} />
      )}

      {activeTab === 'medicationInfo' && (
        <MedicationInfoTemplateSettingsTab
          canManageFacility={canManageFacility}
          {...medicationInfoTemplateSettings}
        />
      )}

      {activeTab === 'master' && (
        <DrugMasterSettingsTab {...drugMasterSettings} />
      )}

      {activeTab === 'backup' && (
        <BackupSettingsTab {...backupSettings} />
      )}

      {activeTab === 'officialAudit' && (
        <OfficialAuditSettingsTab {...officialAuditSettings} />
      )}

      {activeTab === 'audit' && (
        <AuditSettingsTab
          currentUser={currentUser}
          canViewAuditLogs={canViewAuditLogs}
          canManageFacility={canManageFacility}
          canApproveDailyClosing={canApproveDailyClosing}
          {...auditSettings}
        />
      )}

      {activeTab === 'staff' && (
        <StaffSettingsTab {...staffSettings} />
      )}

      {activeTab === 'terminalSync' && (
        <div className="settings-section glass">
          <h2>端末同期（メイン端末集約）</h2>
          <p className="section-desc">
            メイン端末(hub)に患者データを集約し、サテライト端末は患者データを保存しません。<br />
            サテライト端末の登録・失効と、同期競合のレビューを行います。
          </p>
          <TerminalSyncPanel />
        </div>
      )}

      <style jsx>{`
        .settings-container {
          max-width: 800px;
          margin: 0 auto;
        }
        .page-header {
          margin-bottom: 2rem;
        }
        .page-header h1 {
          font-size: 1.75rem;
          margin-bottom: 0.5rem;
        }
        .initial-setup-panel {
          border: 1px solid rgba(148, 163, 184, 0.45);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.86);
          padding: 1rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
        }
        .initial-setup-head {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 0.9rem;
        }
        .initial-setup-head > div:first-child {
          flex: 1 1 240px;
          min-width: min(240px, 100%);
        }
        .initial-setup-head h2 {
          margin: 0 0 0.25rem;
        }
        .initial-setup-head .section-desc {
          margin: 0;
        }
        .initial-setup-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 0.55rem;
          min-width: 220px;
        }
        .initial-setup-actions button,
        .initial-setup-step button {
          min-height: auto;
          padding: 0.45rem 0.7rem;
          font-size: var(--fs-sm);
          white-space: nowrap;
        }
        .initial-setup-status {
          display: inline-flex;
          align-items: center;
          border: 1px solid rgba(148, 163, 184, 0.35);
          border-radius: 999px;
          padding: 0.18rem 0.7rem;
          font-size: var(--fs-sm);
          font-weight: 850;
          white-space: nowrap;
        }
        .initial-setup-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 0.8rem;
        }
        .initial-setup-metrics div {
          padding: 0.7rem 0.8rem;
          border-right: 1px solid var(--border);
          background: rgba(248, 250, 252, 0.78);
        }
        .initial-setup-metrics div:last-child {
          border-right: none;
        }
        .initial-setup-metrics span,
        .initial-setup-step-main span {
          display: block;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 750;
        }
        .initial-setup-metrics strong {
          display: block;
          color: var(--text-main);
          font-size: 1.06rem;
          font-weight: 850;
          margin-top: 0.12rem;
        }
        .initial-setup-steps {
          display: grid;
          gap: 0.45rem;
        }
        .initial-setup-step {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.7rem;
          padding: 0.55rem 0;
          border-top: 1px solid rgba(148, 163, 184, 0.22);
        }
        .initial-setup-step-main {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 0.65rem;
          min-width: 0;
        }
        .initial-setup-step-main strong {
          display: block;
          color: var(--text-main);
          font-size: var(--fs-md);
          font-weight: 850;
          line-height: 1.35;
        }
        .initial-setup-step-main span {
          overflow-wrap: anywhere;
          line-height: 1.45;
        }
        .initial-setup-required-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          margin-top: 0.38rem;
        }
        .initial-setup-required-actions span {
          display: inline-flex;
          align-items: center;
          max-width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          padding: 0.12rem 0.5rem;
          background: rgba(248, 250, 252, 0.84);
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 750;
        }
        .initial-setup-status.status-complete,
        .initial-setup-step-status.status-complete {
          color: #15803d;
          background: #f0fdf4;
          border-color: #86efac;
        }
        .initial-setup-status.status-attention,
        .initial-setup-step-status.status-attention {
          color: #b45309;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .initial-setup-status.status-blocked,
        .initial-setup-step-status.status-blocked {
          color: #b91c1c;
          background: #fef2f2;
          border-color: #fca5a5;
        }
        .initial-setup-step-status {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          border: 1px solid transparent;
          padding: 0.16rem 0.6rem;
          font-size: var(--fs-xs);
          font-weight: 800;
          white-space: nowrap;
        }
        .section-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border);
          padding-bottom: 0.65rem;
        }
        .tab-pill {
          flex: 0 0 auto;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.55rem 0.9rem;
          background: white;
          color: var(--text-main);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-weight: 600;
          font-size: var(--fs-md);
          white-space: nowrap;
          cursor: pointer;
          transition: all var(--transition-fast);
          outline: none;
        }
        .tab-pill.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        .tab-pill:disabled {
          opacity: 0.55;
          cursor: not-allowed !important;
        }
        @media (max-width: 700px) {
          .initial-setup-head,
          .initial-setup-step {
            grid-template-columns: 1fr;
            flex-direction: column;
            align-items: stretch;
          }
          .initial-setup-actions {
            justify-content: flex-start;
            min-width: 0;
          }
          .initial-setup-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .initial-setup-metrics div:nth-child(2n) {
            border-right: none;
          }
          .initial-setup-metrics div:nth-child(-n + 2) {
            border-bottom: 1px solid var(--border);
          }
          .initial-setup-step button {
            justify-self: flex-start;
          }
        }
      `}</style>
    </div>
  );
}
