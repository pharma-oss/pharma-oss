'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import encoding from 'encoding-japanese';
import type { FacilitySettings, PharmacyDatabase, User, AuditLog } from '@/db/types';
import { logAuditAction, type PermissionAction } from '@/lib/audit';
import {
  type OfficialFeeCodeOverrideKey
} from '@/lib/calculator';
import {
  buildOfficialFeeCodeMasterProposalFromCsv,
  buildOfficialFeeCodeMasterProposalReviewCsv,
  buildOfficialFeeCodeOverrideTemplateCsv,
  parseOfficialFeeCodeOverrideCsv,
  type OfficialFeeCodeMasterProposal
} from '@/lib/official_fee_code_overrides';
import {
  AI_ASSIST_MODE_LABELS,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import {
  buildAiSuggestionFeedbackMonthlyReview
} from '@/lib/ai_suggestion_feedback';
import { downloadTextFile } from '@/lib/blob_download';

export function makeOfficialFeeCodeOverrideCsvFileName(): string {
  return `official_fee_code_overrides_${new Date().toISOString().slice(0, 10)}.csv`;
}

export function makeOfficialFeeCodeMasterProposalReviewCsvFileName(): string {
  return `official_fee_code_master_proposal_review_${new Date().toISOString().slice(0, 10)}.csv`;
}

interface UseFacilitySettingsProps {
  db: PharmacyDatabase | null;
  currentUser: User;
  canManageFacility: boolean;
  auditLogs: AuditLog[];
  ensurePermission: (permission: PermissionAction) => boolean;
  refreshAuditEvidence?: () => Promise<void>;
}

export function useFacilitySettings({
  db,
  currentUser,
  canManageFacility,
  auditLogs,
  ensurePermission,
  refreshAuditEvidence
}: UseFacilitySettingsProps) {
  const [settings, setSettings] = useState<FacilitySettings>({
    id: 'default',
    pharmacyName: 'Next-Gen 薬局',
    pharmacyKana: '',
    pharmacyCode: '',
    pharmacyPostalCode: '123-4567',
    pharmacyAddress: '東京都渋谷区桜丘町26-1',
    pharmacyPhone: '03-1234-5678',
    pharmacyFax: '',
    registrationNumber: 'T1234567890123',
    ownerName: '',
    managerName: '',
    defaultPharmacistName: '山田',
    baseFeeCategory: '1',
    regionalSupportAddition: 'none',
    medicalDxAddition: false,
    postGenericAddition: 'none',
    genericDispensingReduction: false,
    aiAssistMode: 'limited',
    officialFeeCodeOverrides: {}
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isApplyingAiQualityMode, setIsApplyingAiQualityMode] = useState(false);
  const [isImportingOfficialFeeCodeCsv, setIsImportingOfficialFeeCodeCsv] = useState(false);
  const [isReviewingOfficialFeeCodeMasterCsv, setIsReviewingOfficialFeeCodeMasterCsv] = useState(false);
  const [officialFeeCodeMasterProposal, setOfficialFeeCodeMasterProposal] = useState<OfficialFeeCodeMasterProposal | null>(null);
  const [officialFeeCodeMasterFileName, setOfficialFeeCodeMasterFileName] = useState('');

  useEffect(() => {
    async function loadSettings() {
      if (!db) return;
      try {
        const doc = await db.facility_settings.findOne('default').exec();
        if (doc) {
          const saved = doc.toJSON();
          setSettings({
            id: 'default',
            pharmacyName: saved.pharmacyName || 'Next-Gen 薬局',
            pharmacyKana: saved.pharmacyKana || '',
            pharmacyCode: saved.pharmacyCode || '',
            pharmacyPostalCode: saved.pharmacyPostalCode || '123-4567',
            pharmacyAddress: saved.pharmacyAddress || '東京都渋谷区桜丘町26-1',
            pharmacyPhone: saved.pharmacyPhone || '03-1234-5678',
            pharmacyFax: saved.pharmacyFax || '',
            registrationNumber: saved.registrationNumber || 'T1234567890123',
            ownerName: saved.ownerName || '',
            managerName: saved.managerName || '',
            defaultPharmacistName: saved.defaultPharmacistName || '山田',
            baseFeeCategory: saved.baseFeeCategory || '1',
            regionalSupportAddition: saved.regionalSupportAddition || 'none',
            medicalDxAddition: !!saved.medicalDxAddition,
            postGenericAddition: saved.postGenericAddition || 'none',
            genericDispensingReduction: !!saved.genericDispensingReduction,
            aiAssistMode: normalizeAiAssistMode(saved.aiAssistMode),
            officialFeeCodeOverrides: saved.officialFeeCodeOverrides || {}
          });
        }
      } catch (error) {
        console.error('Failed to load facility settings securely:', error);
      }
    }
    loadSettings();
  }, [db]);

  const handleSettingsChange = <K extends keyof FacilitySettings>(field: K, value: FacilitySettings[K]) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handleOfficialFeeCodeChange = (key: OfficialFeeCodeOverrideKey, value: string) => {
    const normalized = value.replace(/\D/g, '').slice(0, 9);
    setSettings(prev => ({
      ...prev,
      officialFeeCodeOverrides: {
        ...(prev.officialFeeCodeOverrides || {}),
        [key]: normalized
      }
    }));
  };

  const handleExportOfficialFeeCodeCsv = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    const fileName = makeOfficialFeeCodeOverrideCsvFileName();
    const csv = buildOfficialFeeCodeOverrideTemplateCsv(settings.officialFeeCodeOverrides || {});
    downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
    const configuredCount = Object.values(settings.officialFeeCodeOverrides || {})
      .filter((value) => /^\d{9}$/.test(String(value || '').trim()))
      .length;
    if (db) {
      await logAuditAction(
        db,
        'facility_settings_update',
        `公式算定コードCSVひな形書出: ${fileName} / 設定済み ${configuredCount}件`
      );
      if (refreshAuditEvidence) {
        await refreshAuditEvidence();
      }
    }
    toast.success('公式算定コードCSVを書き出しました。');
  };

  const handleImportOfficialFeeCodeCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    if (!ensurePermission('manage_facility_settings')) return;

    setIsImportingOfficialFeeCodeCsv(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const unicodeArray = encoding.convert(new Uint8Array(buffer), { to: 'UNICODE', from: 'AUTO' });
      const csvText = encoding.codeToString(unicodeArray as number[]);
      const parsed = parseOfficialFeeCodeOverrideCsv(csvText);
      const errors = parsed.issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        toast.error(`公式算定コードCSVを確認してください（エラー${errors.length}件）。${errors[0].message}`);
        return;
      }

      setSettings(prev => ({
        ...prev,
        officialFeeCodeOverrides: {
          ...(prev.officialFeeCodeOverrides || {}),
          ...parsed.overrides
        }
      }));
      const warningSuffix = parsed.skippedCount > 0 ? ` / 読み飛ばし ${parsed.skippedCount}行` : '';
      toast.success(`公式算定コードCSVを反映しました（設定 ${parsed.importedCount}件、空欄 ${parsed.clearedCount}件${warningSuffix}）。`);
    } catch (error: any) {
      console.error('Failed to import official fee code CSV:', error);
      toast.error(`公式算定コードCSVを読み込めませんでした: ${error.message || error}`);
    } finally {
      setIsImportingOfficialFeeCodeCsv(false);
    }
  };

  const handleReviewOfficialFeeCodeMasterCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    if (!ensurePermission('manage_facility_settings')) return;

    setIsReviewingOfficialFeeCodeMasterCsv(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const unicodeArray = encoding.convert(new Uint8Array(buffer), { to: 'UNICODE', from: 'AUTO' });
      const csvText = encoding.codeToString(unicodeArray as number[]);
      const proposal = buildOfficialFeeCodeMasterProposalFromCsv(csvText);
      const errors = proposal.issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        setOfficialFeeCodeMasterProposal(null);
        setOfficialFeeCodeMasterFileName('');
        toast.error(`公式表CSVを確認してください。${errors[0].message}`);
        return;
      }

      setOfficialFeeCodeMasterProposal(proposal);
      setOfficialFeeCodeMasterFileName(selectedFile.name);
      if (proposal.matchedCount > 0) {
        toast.success(`公式表CSVから候補を作成しました（候補 ${proposal.matchedCount}件、未一致 ${proposal.unresolvedCount}件）。`);
      } else {
        toast.warning('公式表CSVから反映できる候補が見つかりませんでした。');
      }
    } catch (error: any) {
      console.error('Failed to review official fee code master CSV:', error);
      toast.error(`公式表CSVを読み込めませんでした: ${error.message || error}`);
    } finally {
      setIsReviewingOfficialFeeCodeMasterCsv(false);
    }
  };

  const handleApplyOfficialFeeCodeMasterProposal = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!officialFeeCodeMasterProposal || officialFeeCodeMasterProposal.matchedCount === 0) {
      toast.info('反映できる公式算定コード候補がありません。');
      return;
    }

    setSettings(prev => ({
      ...prev,
      officialFeeCodeOverrides: {
        ...(prev.officialFeeCodeOverrides || {}),
        ...officialFeeCodeMasterProposal.overrides
      }
    }));
    if (db) {
      await logAuditAction(
        db,
        'facility_settings_update',
        `公式算定コード公式表CSV候補反映: ${officialFeeCodeMasterFileName || 'ファイル名未取得'} / 候補 ${officialFeeCodeMasterProposal.matchedCount}件 / 未一致 ${officialFeeCodeMasterProposal.unresolvedCount}件 / 重複 ${officialFeeCodeMasterProposal.duplicateCount}件`
      );
      if (refreshAuditEvidence) {
        await refreshAuditEvidence();
      }
    }
    toast.success(`公式算定コード候補を${officialFeeCodeMasterProposal.matchedCount}件反映しました。保存すると設定に残ります。`);
  };

  const handleExportOfficialFeeCodeMasterProposalReviewCsv = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!officialFeeCodeMasterProposal) {
      toast.info('先に公式表CSVを照合してください。');
      return;
    }

    const fileName = makeOfficialFeeCodeMasterProposalReviewCsvFileName();
    const csv = buildOfficialFeeCodeMasterProposalReviewCsv(
      officialFeeCodeMasterProposal,
      officialFeeCodeMasterFileName || '公式表CSV'
    );
    downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
    if (db) {
      await logAuditAction(
        db,
        'facility_settings_update',
        `公式算定コード照合結果CSV書出: ${fileName} / 元ファイル ${officialFeeCodeMasterFileName || 'ファイル名未取得'} / 候補 ${officialFeeCodeMasterProposal.matchedCount}件 / 未一致 ${officialFeeCodeMasterProposal.unresolvedCount}件 / 重複 ${officialFeeCodeMasterProposal.duplicateCount}件`
      );
      if (refreshAuditEvidence) {
        await refreshAuditEvidence();
      }
    }
    toast.success('公式算定コードの照合結果CSVを書き出しました。');
  };

  const handleSaveSettings = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) return;
    setIsSavingSettings(true);
    try {
      const doc = await db.facility_settings.findOne('default').exec();
      if (doc) {
        await doc.patch(settings);
      } else {
        await db.facility_settings.insert(settings);
      }
      const officialFeeCodeOverrideCount = Object.values(settings.officialFeeCodeOverrides || {})
        .filter((value) => /^\d{9}$/.test(String(value ?? '').trim()))
        .length;
      
      await logAuditAction(
        db,
        'facility_settings_update',
        `施設基準設定変更: 薬局情報を「調剤基本料${settings.baseFeeCategory} 等、公式算定コード${officialFeeCodeOverrideCount}件、AI補助${AI_ASSIST_MODE_LABELS[normalizeAiAssistMode(settings.aiAssistMode)]}」に更新しました。`
      );

      if (refreshAuditEvidence) {
        await refreshAuditEvidence();
      }

      toast.success('施設基準を保存しました。');
    } catch (error: any) {
      console.error('Failed to save facility settings securely:', error);
      toast.error('保存に失敗しました。');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleApplyAiQualityRecommendation = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const review = buildAiSuggestionFeedbackMonthlyReview(auditLogs, new Date(), {
      currentStoreName: settings.pharmacyName || '自店',
      currentStoreCode: settings.pharmacyCode || undefined,
      currentAiAssistMode: normalizeAiAssistMode(settings.aiAssistMode)
    });
    const previousMode = normalizeAiAssistMode(settings.aiAssistMode);
    const recommendedMode = review.qualityGate.recommendedMode;
    if (review.qualityGate.modeAlignment !== 'change_required') {
      toast.info('現在のAI補助モードは品質ゲートの推奨以上に安全です。');
      return;
    }

    setIsApplyingAiQualityMode(true);
    try {
      const doc = await db.facility_settings.findOne('default').exec();
      if (!doc) {
        throw new Error('施設設定が見つかりません。');
      }
      await doc.patch({ aiAssistMode: recommendedMode });
      const auditOk = await logAuditAction(
        db,
        'facility_settings_update',
        `AI補助品質ゲート反映: 「${AI_ASSIST_MODE_LABELS[previousMode]}」から「${AI_ASSIST_MODE_LABELS[recommendedMode]}」へ変更 / 判定 ${review.qualityGate.statusLabel} / 高信頼度却下 ${review.qualityGate.highConfidenceRejectedCount}件 / 却下率 ${review.qualityGate.rejectionRate}%`
      );
      if (!auditOk) {
        await doc.patch({ aiAssistMode: previousMode });
        throw new Error('監査ログ記録に失敗したため、AI補助モードを元に戻しました。');
      }

      setSettings((previous) => ({ ...previous, aiAssistMode: recommendedMode }));
      if (refreshAuditEvidence) {
        await refreshAuditEvidence();
      }
      toast.success(`AI補助を「${AI_ASSIST_MODE_LABELS[recommendedMode]}」へ変更しました。`);
    } catch (error: any) {
      console.error('Failed to apply AI quality gate recommendation:', error);
      toast.error(`AI補助モードを変更できませんでした: ${error.message || error}`);
    } finally {
      setIsApplyingAiQualityMode(false);
    }
  };

  return {
    settings,
    currentUser,
    canManageFacility,
    isSavingSettings,
    isImportingOfficialFeeCodeCsv,
    isReviewingOfficialFeeCodeMasterCsv,
    officialFeeCodeMasterProposal,
    handleSettingsChange,
    handleExportOfficialFeeCodeCsv,
    handleImportOfficialFeeCodeCsv,
    handleReviewOfficialFeeCodeMasterCsv,
    handleApplyOfficialFeeCodeMasterProposal,
    handleExportOfficialFeeCodeMasterProposalReviewCsv,
    handleOfficialFeeCodeChange,
    handleSaveSettings,
    handleApplyAiQualityRecommendation,
    isApplyingAiQualityMode
  };
}
