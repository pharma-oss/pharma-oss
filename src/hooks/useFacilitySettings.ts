'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import encoding from 'encoding-japanese';
import type { FacilitySettings, PharmacyDatabase, User } from '@/db/types';
import { logAuditAction, type PermissionAction } from '@/lib/audit';
import {
  type OfficialFeeCodeOverrideKey
} from '@/lib/calculator';
import {
  buildOfficialFeeCodeMasterProposalFromCsv,
  buildOfficialFeeCodeMasterProposalReviewCsv,
  buildOfficialFeeCodeOverrideTemplateCsv,
  countConfiguredOfficialFeeCodes,
  makeOfficialFeeCodeMasterProposalReviewCsvFileName,
  makeOfficialFeeCodeOverrideCsvFileName,
  normalizeOfficialFeeCodeInput,
  parseOfficialFeeCodeOverrideCsv,
  type OfficialFeeCodeMasterProposal
} from '@/lib/official_fee_code_overrides';
import {
  AI_ASSIST_MODE_LABELS,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import { downloadTextFile } from '@/lib/blob_download';
import { exportWithAuditFirst, recordAuditOrNotify } from '@/lib/audit_guard';
import { saveFacilitySettingsWithAudit } from '@/lib/facility_settings_save';

interface UseFacilitySettingsProps {
  db: PharmacyDatabase | null;
  currentUser: User;
  canManageFacility: boolean;
  ensurePermission: (permission: PermissionAction) => boolean;
  refreshAuditEvidence?: () => Promise<void>;
}

export function useFacilitySettings({
  db,
  currentUser,
  canManageFacility,
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
    registrationNumber: '',
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
            registrationNumber: saved.registrationNumber || '',
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
    const normalized = normalizeOfficialFeeCodeInput(value);
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
    try {
      const fileName = makeOfficialFeeCodeOverrideCsvFileName();
      const csv = buildOfficialFeeCodeOverrideTemplateCsv(settings.officialFeeCodeOverrides || {});
      const download = () => downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      const configuredCount = countConfiguredOfficialFeeCodes(settings.officialFeeCodeOverrides);
      if (db) {
        // 監査ログを先に残し、残らなければ書き出さない
        await exportWithAuditFirst({
          logAudit: () => logAuditAction(
            db,
            'facility_settings_update',
            `公式算定コードCSVひな形書出: ${fileName} / 設定済み ${configuredCount}件`
          ),
          download
        });
        if (refreshAuditEvidence) {
          await refreshAuditEvidence();
        }
      } else {
        download();
      }
      toast.success('公式算定コードCSVを書き出しました。');
    } catch (error: any) {
      console.error('handleExportOfficialFeeCodeCsv failed:', error);
      toast.error(`公式算定コードCSVを書き出せませんでした: ${error.message || error}`);
    }
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
      // 画面の入力へ反映するだけで、保存は別の操作。記録が残らなかったときは知らせる。
      await recordAuditOrNotify(
        () => logAuditAction(
          db,
          'facility_settings_update',
          `公式算定コード公式表CSV候補反映: ${officialFeeCodeMasterFileName || 'ファイル名未取得'} / 候補 ${officialFeeCodeMasterProposal.matchedCount}件 / 未一致 ${officialFeeCodeMasterProposal.unresolvedCount}件 / 重複 ${officialFeeCodeMasterProposal.duplicateCount}件`
        ),
        (message) => toast.warning(message)
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
    try {

      const fileName = makeOfficialFeeCodeMasterProposalReviewCsvFileName();
      const csv = buildOfficialFeeCodeMasterProposalReviewCsv(
        officialFeeCodeMasterProposal,
        officialFeeCodeMasterFileName || '公式表CSV'
      );
      const download = () => downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        // 監査ログを先に残し、残らなければ書き出さない
        await exportWithAuditFirst({
          logAudit: () => logAuditAction(
            db,
            'facility_settings_update',
            `公式算定コード照合結果CSV書出: ${fileName} / 元ファイル ${officialFeeCodeMasterFileName || 'ファイル名未取得'} / 候補 ${officialFeeCodeMasterProposal.matchedCount}件 / 未一致 ${officialFeeCodeMasterProposal.unresolvedCount}件 / 重複 ${officialFeeCodeMasterProposal.duplicateCount}件`
          ),
          download
        });
        if (refreshAuditEvidence) {
          await refreshAuditEvidence();
        }
      } else {
        download();
      }
      toast.success('公式算定コードの照合結果CSVを書き出しました。');
    } catch (error: any) {
      console.error('handleExportOfficialFeeCodeMasterProposalReviewCsv failed:', error);
      toast.error(`公式算定コードの照合結果CSVを書き出せませんでした: ${error.message || error}`);
    }
  };

  const handleSaveSettings = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) return;
    setIsSavingSettings(true);
    try {
      const officialFeeCodeOverrideCount = countConfiguredOfficialFeeCodes(settings.officialFeeCodeOverrides);

      // 書き込み -> 監査ログ。監査ログが残らなければ保存前の値へ戻す。
      await saveFacilitySettingsWithAudit({
        db,
        settings,
        logAudit: () => logAuditAction(
          db,
          'facility_settings_update',
          `施設基準設定変更: 薬局情報を「調剤基本料${settings.baseFeeCategory} 等、公式算定コード${officialFeeCodeOverrideCount}件、AI補助${AI_ASSIST_MODE_LABELS[normalizeAiAssistMode(settings.aiAssistMode)]}」に更新しました。`
        )
      });

      if (refreshAuditEvidence) {
        await refreshAuditEvidence();
      }

      toast.success('施設基準を保存しました。');
    } catch (error: any) {
      console.error('Failed to save facility settings securely:', error);
      toast.error(error?.message ? `保存に失敗しました。${error.message}` : '保存に失敗しました。');
    } finally {
      setIsSavingSettings(false);
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
    handleSaveSettings
  };
}
