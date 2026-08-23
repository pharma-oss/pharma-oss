'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import type { PatientMedicationInfoTemplate, PatientMedicationInfoTemplateStatus, PharmacyDatabase, User } from '@/db/types';
import { logAuditAction, type PermissionAction } from '@/lib/audit';
import {
  getPatientMedicationInfoApprovalIssues,
  getPatientMedicationInfoApprovalReadinessIssues,
  isApprovedPatientMedicationInfoTemplate,
  buildPatientMedicationInfoApprovalWriteSet,
  shouldForkPatientMedicationInfoTemplate,
  hasPatientMedicationInfoTemplateContentChanges,
  buildPmdaMedicationSearchUrl
} from '@/lib/patient_medication_info';
import {
  buildPatientMedicationInfoTemplateCsv,
  makePatientMedicationInfoCsvFileName,
  parsePatientMedicationInfoTemplateCsv
} from '@/lib/patient_medication_info_csv';
import {
  buildPatientMedicationInfoSafetyDraft,
  buildPatientMedicationInfoSafetyDraftTemplate,
  extractDrugCodeFromDrugInfoId,
  makePatientMedicationInfoSafetyDraftCsvFileName
} from '@/lib/patient_medication_info_safety_draft';
import {
  createEmptyMedicationInfoTemplateForm,
  medicationInfoTemplateToForm,
  makeMedicationInfoTemplateId,
  trimOrUndefined,
  sortMedicationInfoTemplates,
  MEDICATION_INFO_SOURCE_TYPE_LABELS,
  MEDICATION_INFO_TEMPLATE_STATUS_LABELS,
  type MedicationInfoCsvImportSummary,
  type MedicationInfoTemplateForm,
  type MedicationInfoTemplateReadinessFilter,
  type MedicationInfoTemplateStatusFilter
} from '@/lib/medication_info_template_ui';
import {
  loadDrugInfoReferenceData,
  findDrugInfosByDrugNames
} from '@/lib/drug_info_reference';
import { downloadTextFile } from '@/lib/blob_download';

export interface UseMedicationInfoTemplateSettingsOptions {
  db: PharmacyDatabase | null;
  currentUser: User;
  canManageFacility: boolean;
  ensurePermission: (action: PermissionAction) => boolean;
  refreshAuditEvidence: () => Promise<void>;
}

export function useMedicationInfoTemplateSettings({
  db,
  currentUser,
  canManageFacility,
  ensurePermission,
  refreshAuditEvidence
}: UseMedicationInfoTemplateSettingsOptions) {
  const [medicationInfoTemplates, setMedicationInfoTemplates] = useState<PatientMedicationInfoTemplate[]>([]);
  const [medicationInfoTemplateForm, setMedicationInfoTemplateForm] = useState<MedicationInfoTemplateForm>(() => createEmptyMedicationInfoTemplateForm());
  const [medicationInfoTemplateSearch, setMedicationInfoTemplateSearch] = useState('');
  const [medicationInfoTemplateStatusFilter, setMedicationInfoTemplateStatusFilter] = useState<MedicationInfoTemplateStatusFilter>('all');
  const [medicationInfoTemplateReadinessFilter, setMedicationInfoTemplateReadinessFilter] = useState<MedicationInfoTemplateReadinessFilter>('all');
  const [medicationInfoCsvImportSummary, setMedicationInfoCsvImportSummary] = useState<MedicationInfoCsvImportSummary | null>(null);
  const [selectedMedicationInfoTemplateId, setSelectedMedicationInfoTemplateId] = useState('');
  const [isLoadingMedicationInfoTemplates, setIsLoadingMedicationInfoTemplates] = useState(false);
  const [isSavingMedicationInfoTemplate, setIsSavingMedicationInfoTemplate] = useState(false);
  const [isImportingMedicationInfoCsv, setIsImportingMedicationInfoCsv] = useState(false);
  const [isBuildingMedicationInfoSafetyDraft, setIsBuildingMedicationInfoSafetyDraft] = useState(false);
  const [isExportingMedicationInfoSafetyDraftCsv, setIsExportingMedicationInfoSafetyDraftCsv] = useState(false);

  const refreshMedicationInfoTemplates = useCallback(async () => {
    if (!db) return [];
    setIsLoadingMedicationInfoTemplates(true);
    try {
      const docs = await db.patient_medication_info_templates.find().exec();
      const rows = docs.map((doc) => doc.toJSON() as PatientMedicationInfoTemplate);
      setMedicationInfoTemplates(rows);
      return rows;
    } catch (error) {
      console.error('Failed to load patient medication info templates:', error);
      return [];
    } finally {
      setIsLoadingMedicationInfoTemplates(false);
    }
  }, [db]);

  useEffect(() => {
    refreshMedicationInfoTemplates();
  }, [refreshMedicationInfoTemplates]);

  const normalizedMedicationInfoTemplateSearch = medicationInfoTemplateSearch.trim().toLowerCase();
  const medicationInfoTemplateReadinessIssuesById = new Map(
    medicationInfoTemplates.map((template) => [
      template.templateId,
      getPatientMedicationInfoApprovalReadinessIssues(template)
    ] as const)
  );

  const getMedicationInfoTemplateReadinessIssues = (template: PatientMedicationInfoTemplate) => (
    medicationInfoTemplateReadinessIssuesById.get(template.templateId) || []
  );

  const filteredMedicationInfoTemplates = medicationInfoTemplates.filter((template) => {
    if (medicationInfoTemplateStatusFilter !== 'all' && template.status !== medicationInfoTemplateStatusFilter) {
      return false;
    }
    const readinessIssues = getMedicationInfoTemplateReadinessIssues(template);
    if (medicationInfoTemplateReadinessFilter === 'ready' && readinessIssues.length > 0) {
      return false;
    }
    if (medicationInfoTemplateReadinessFilter === 'missing' && readinessIssues.length === 0) {
      return false;
    }
    if (!normalizedMedicationInfoTemplateSearch) return true;
    const haystack = [
      template.drugCode,
      template.drugName,
      template.genericName || '',
      template.status,
      MEDICATION_INFO_TEMPLATE_STATUS_LABELS[template.status],
      readinessIssues.length === 0 ? '承認準備OK' : '不足あり',
      template.sourceUrl || ''
    ].join(' ').toLowerCase();
    return haystack.includes(normalizedMedicationInfoTemplateSearch);
  });

  const medicationInfoTemplateStatusCounts = medicationInfoTemplates.reduce<Record<PatientMedicationInfoTemplateStatus, number>>((counts, template) => {
    counts[template.status] += 1;
    return counts;
  }, {
    draft: 0,
    approved: 0,
    needs_review: 0,
    retired: 0
  });

  const medicationInfoTemplateReadinessCounts = medicationInfoTemplates.reduce<Record<MedicationInfoTemplateReadinessFilter, number>>((counts, template) => {
    counts.all += 1;
    if (getMedicationInfoTemplateReadinessIssues(template).length === 0) {
      counts.ready += 1;
    } else {
      counts.missing += 1;
    }
    return counts;
  }, {
    all: 0,
    ready: 0,
    missing: 0
  });

  const invalidApprovedMedicationInfoTemplates = medicationInfoTemplates.filter((template) => (
    template.status === 'approved' && !isApprovedPatientMedicationInfoTemplate(template)
  ));

  const selectedMedicationInfoTemplate = selectedMedicationInfoTemplateId
    ? medicationInfoTemplates.find((template) => template.templateId === selectedMedicationInfoTemplateId)
    : undefined;

  const handleMedicationInfoTemplateFormChange = <K extends keyof MedicationInfoTemplateForm>(
    field: K,
    value: MedicationInfoTemplateForm[K]
  ) => {
    setMedicationInfoTemplateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleNewMedicationInfoTemplate = () => {
    setSelectedMedicationInfoTemplateId('');
    setMedicationInfoTemplateForm(createEmptyMedicationInfoTemplateForm());
  };

  const handleSelectMedicationInfoTemplate = (template: PatientMedicationInfoTemplate) => {
    setSelectedMedicationInfoTemplateId(template.templateId);
    setMedicationInfoTemplateForm(medicationInfoTemplateToForm(template));
  };

  const buildMedicationInfoTemplatePayload = (
    statusOverride?: PatientMedicationInfoTemplateStatus
  ): PatientMedicationInfoTemplate => {
    const now = new Date().toISOString();
    const existingTemplate = selectedMedicationInfoTemplate;
    const status = statusOverride || medicationInfoTemplateForm.status;
    const drugCode = medicationInfoTemplateForm.drugCode.trim();
    const shouldFork = shouldForkPatientMedicationInfoTemplate(existingTemplate, status);
    const templateId = shouldFork
      ? makeMedicationInfoTemplateId(drugCode)
      : medicationInfoTemplateForm.templateId.trim() || makeMedicationInfoTemplateId(drugCode);
    const payload: PatientMedicationInfoTemplate = {
      templateId,
      drugCode,
      drugName: medicationInfoTemplateForm.drugName.trim(),
      status,
      createdAt: shouldFork ? now : existingTemplate?.createdAt || now,
      updatedAt: now
    };

    const genericName = trimOrUndefined(medicationInfoTemplateForm.genericName);
    const sideEffectText = trimOrUndefined(medicationInfoTemplateForm.sideEffectText);
    const counselingText = trimOrUndefined(medicationInfoTemplateForm.counselingText);
    const sourceUrl = trimOrUndefined(medicationInfoTemplateForm.sourceUrl);
    const sourceRevisionDate = trimOrUndefined(medicationInfoTemplateForm.sourceRevisionDate);
    const sourceHash = trimOrUndefined(medicationInfoTemplateForm.sourceHash);
    const needsReviewReason = trimOrUndefined(medicationInfoTemplateForm.needsReviewReason);

    if (genericName) payload.genericName = genericName;
    if (sideEffectText) payload.sideEffectText = sideEffectText;
    if (counselingText) payload.counselingText = counselingText;
    payload.sourceType = medicationInfoTemplateForm.sourceType;
    if (sourceUrl) payload.sourceUrl = sourceUrl;
    if (sourceRevisionDate) payload.sourceRevisionDate = sourceRevisionDate;
    if (sourceHash) payload.sourceHash = sourceHash;
    if (needsReviewReason) payload.needsReviewReason = needsReviewReason;
    if (status === 'approved') {
      payload.reviewerId = currentUser.userId;
      payload.approvedAt = now;
    }

    return payload;
  };

  const currentMedicationInfoApprovalIssues = getPatientMedicationInfoApprovalIssues(
    buildMedicationInfoTemplatePayload('approved')
  );
  const currentMedicationInfoTemplateHasContentChanges = !!selectedMedicationInfoTemplate
    && hasPatientMedicationInfoTemplateContentChanges(
      selectedMedicationInfoTemplate,
      buildMedicationInfoTemplatePayload()
    );
  const isEditingImmutableMedicationInfoRevision = !!selectedMedicationInfoTemplate
    && selectedMedicationInfoTemplate.status !== 'draft'
    && currentMedicationInfoTemplateHasContentChanges;

  const validateMedicationInfoTemplateForStatus = (status: PatientMedicationInfoTemplateStatus): boolean => {
    if (!medicationInfoTemplateForm.drugCode.trim()) {
      toast.error('薬品コードを入力してください。');
      return false;
    }
    if (!medicationInfoTemplateForm.drugName.trim()) {
      toast.error('薬品名を入力してください。');
      return false;
    }
    if (status === 'needs_review' && !medicationInfoTemplateForm.needsReviewReason.trim()) {
      toast.error('要再確認にする理由を入力してください。');
      return false;
    }
    if ((status === 'needs_review' || status === 'retired') && isEditingImmutableMedicationInfoRevision) {
      toast.error('承認済み・要再確認・廃止版の本文や参照元を変更したまま状態だけを更新できません。新版として下書き保存してください。');
      return false;
    }
    if (status === 'approved') {
      if (currentMedicationInfoApprovalIssues.length > 0) {
        toast.error(`承認できません: ${currentMedicationInfoApprovalIssues.map((issue) => issue.message).join('、')}`);
        return false;
      }
    }
    return true;
  };

  const handleSaveMedicationInfoTemplate = async (statusOverride?: PatientMedicationInfoTemplateStatus) => {
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    const targetStatus = statusOverride || medicationInfoTemplateForm.status;
    if (!validateMedicationInfoTemplateForStatus(targetStatus)) return;

    setIsSavingMedicationInfoTemplate(true);
    let previousTemplatesById: Map<string, PatientMedicationInfoTemplate | undefined> | null = null;
    let attemptedWriteTemplateIds: string[] = [];
    try {
      const payload = buildMedicationInfoTemplatePayload(targetStatus);
      const approvalWriteSet = targetStatus === 'approved'
        ? buildPatientMedicationInfoApprovalWriteSet(payload, medicationInfoTemplates, payload.updatedAt)
        : { writes: [payload], supersededTemplateIds: [] };
      attemptedWriteTemplateIds = approvalWriteSet.writes.map((template) => template.templateId);
      const previousEntries = await Promise.all(approvalWriteSet.writes.map(async (template) => {
        const previousDoc = await db.patient_medication_info_templates.findOne(template.templateId).exec();
        return [
          template.templateId,
          previousDoc?.toJSON() as PatientMedicationInfoTemplate | undefined
        ] as const;
      }));
      previousTemplatesById = new Map(previousEntries);

      const upsertResult = await db.patient_medication_info_templates.bulkUpsert(approvalWriteSet.writes);
      if (upsertResult.error.length > 0) {
        throw new Error(`${upsertResult.error.length}件の薬情テンプレ保存に失敗しました。`);
      }

      const auditOk = await logAuditAction(
        db,
        'patient_medication_info_template',
        `薬情テンプレ${MEDICATION_INFO_TEMPLATE_STATUS_LABELS[targetStatus]}: ${payload.drugName} (${payload.drugCode}) / テンプレ ${payload.templateId} / 状態 ${MEDICATION_INFO_TEMPLATE_STATUS_LABELS[targetStatus]} / 参照元 ${MEDICATION_INFO_SOURCE_TYPE_LABELS[payload.sourceType || 'pharmacy_authored']} / 版日 ${payload.sourceRevisionDate || '未入力'} / 旧承認版廃止 ${approvalWriteSet.supersededTemplateIds.length}件`
      );
      if (!auditOk) {
        throw new Error('薬情テンプレ保存の監査ログ記録に失敗したため、保存を取り消しました。');
      }

      const templates = await refreshMedicationInfoTemplates();
      const savedTemplate = templates.find((template) => template.templateId === payload.templateId) || payload;
      setSelectedMedicationInfoTemplateId(savedTemplate.templateId);
      setMedicationInfoTemplateForm(medicationInfoTemplateToForm(savedTemplate));
      await refreshAuditEvidence();
      toast.success(`薬情テンプレを${MEDICATION_INFO_TEMPLATE_STATUS_LABELS[targetStatus]}で保存しました。`);
    } catch (err: any) {
      if (previousTemplatesById) {
        try {
          const previousTemplates = Array.from(previousTemplatesById.values()).filter(
            (template): template is PatientMedicationInfoTemplate => !!template
          );
          if (previousTemplates.length > 0) {
            await db.patient_medication_info_templates.bulkUpsert(previousTemplates);
          }
          const newTemplateIds = attemptedWriteTemplateIds.filter((templateId) => !previousTemplatesById?.get(templateId));
          for (const templateId of newTemplateIds) {
            const savedDoc = await db.patient_medication_info_templates.findOne(templateId).exec();
            if (savedDoc) await savedDoc.remove();
          }
        } catch (rollbackError) {
          console.error('Failed to roll back patient medication info template writes:', rollbackError);
        }
      }
      console.error('Failed to save patient medication info template:', err);
      toast.error(`薬情テンプレを保存できませんでした: ${err.message || err}`);
    } finally {
      setIsSavingMedicationInfoTemplate(false);
    }
  };

  const handleUsePmdaMedicationInfoSearchUrl = () => {
    const drugName = medicationInfoTemplateForm.drugName.trim() || medicationInfoTemplateForm.genericName.trim();
    if (!drugName) {
      toast.info('先に薬品名を入力してください。');
      return;
    }
    handleMedicationInfoTemplateFormChange('sourceUrl', buildPmdaMedicationSearchUrl(drugName));
    if (medicationInfoTemplateForm.sourceType === 'pharmacy_authored') {
      handleMedicationInfoTemplateFormChange('sourceType', 'pmda_insert');
    }
  };

  const handleApplyMedicationInfoSafetyDraft = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    const drugCode = medicationInfoTemplateForm.drugCode.trim();
    const drugName = medicationInfoTemplateForm.drugName.trim();
    const genericName = medicationInfoTemplateForm.genericName.trim();
    if (!drugCode || !drugName) {
      toast.info('先に薬品コードと薬品名を入力してください。');
      return;
    }

    const hasExistingSafetyText = [
      medicationInfoTemplateForm.sideEffectText,
      medicationInfoTemplateForm.counselingText
    ].some((value) => value.trim());
    if (hasExistingSafetyText && !window.confirm('副作用・使用上の注意の入力済み内容を下書き案で上書きしますか？')) {
      return;
    }

    setIsBuildingMedicationInfoSafetyDraft(true);
    try {
      const searchNames = [drugName, genericName].filter(Boolean);
      const matchesByName = await findDrugInfosByDrugNames(searchNames);
      const matchedDrugInfo = searchNames
        .flatMap((name) => matchesByName.get(name) || [])
        .find((info) => extractDrugCodeFromDrugInfoId(info.id) === drugCode)
        || searchNames.flatMap((name) => matchesByName.get(name) || [])[0]
        || null;
      const draft = buildPatientMedicationInfoSafetyDraft({
        drugCode,
        drugName,
        genericName,
        drugInfo: matchedDrugInfo
      });
      setMedicationInfoTemplateForm((prev) => ({
        ...prev,
        status: prev.status === 'approved' ? 'draft' : prev.status,
        sideEffectText: draft.sideEffectText,
        counselingText: draft.usageCautionText,
        sourceType: draft.sourceType,
        sourceHash: draft.sourceHash,
        needsReviewReason: draft.needsReviewReason
      }));
      toast.success(matchedDrugInfo
        ? '副作用・使用上の注意の下書き案を反映しました。'
        : '一致する参照データがないため、汎用の副作用・使用上の注意案を反映しました。');
    } catch (error) {
      console.error('Failed to build medication info safety draft:', error);
      toast.error('副作用・使用上の注意案を作成できませんでした。');
    } finally {
      setIsBuildingMedicationInfoSafetyDraft(false);
    }
  };

  const handleExportMedicationInfoSafetyDraftCsv = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    setIsExportingMedicationInfoSafetyDraftCsv(true);
    try {
      const generatedAt = new Date();
      const drugInfos = await loadDrugInfoReferenceData();
      const templates = drugInfos.map((drugInfo) => buildPatientMedicationInfoSafetyDraftTemplate({
        drugCode: extractDrugCodeFromDrugInfoId(drugInfo.id),
        drugName: drugInfo.drugName,
        genericName: drugInfo.genericName,
        drugInfo,
        generatedAt
      }));
      const fileName = makePatientMedicationInfoSafetyDraftCsvFileName(generatedAt);
      const csv = buildPatientMedicationInfoTemplateCsv(templates);
      downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        await logAuditAction(
          db,
          'patient_medication_info_template',
          `薬情テンプレ副作用・使用上注意案CSV書出: ${fileName} / ${templates.length}件 / 承認情報なし`
        );
      }
      toast.success(`副作用・使用上の注意案CSVを${templates.length.toLocaleString()}件書き出しました。`);
    } catch (error: any) {
      console.error('Failed to export medication info safety draft CSV:', error);
      toast.error(`副作用・使用上の注意案CSVを書き出せませんでした: ${error.message || error}`);
    } finally {
      setIsExportingMedicationInfoSafetyDraftCsv(false);
    }
  };

  const handleExportMedicationInfoCsv = async () => {
    if (!ensurePermission('manage_facility_settings')) return;
    const latestTemplatesByDrugCode = new Map<string, PatientMedicationInfoTemplate>();
    for (const template of sortMedicationInfoTemplates(medicationInfoTemplates)) {
      if (template.status === 'retired' || latestTemplatesByDrugCode.has(template.drugCode)) continue;
      latestTemplatesByDrugCode.set(template.drugCode, template);
    }
    const templates = Array.from(latestTemplatesByDrugCode.values());
    const fileName = makePatientMedicationInfoCsvFileName();
    const csv = buildPatientMedicationInfoTemplateCsv(templates);
    downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
    if (db) {
      await logAuditAction(
        db,
        'patient_medication_info_template',
        `薬情テンプレCSV書出: ${fileName} / ${templates.length}件 / 承認情報を除外`
      );
    }
    toast.success(`薬情テンプレCSVを${templates.length}件書き出しました。`);
  };

  const handleImportMedicationInfoCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    if (!ensurePermission('manage_facility_settings')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsImportingMedicationInfoCsv(true);
    setMedicationInfoCsvImportSummary(null);
    let previousTemplatesById: Map<string, PatientMedicationInfoTemplate | undefined> | null = null;
    let attemptedTemplateIds: string[] = [];
    try {
      const parsed = parsePatientMedicationInfoTemplateCsv(await selectedFile.text());
      const errors = parsed.issues.filter((issue) => issue.severity === 'error');
      if (errors.length > 0) {
        const summary = errors.slice(0, 3).map((issue) => (
          `${issue.rowNumber ? `${issue.rowNumber}行目: ` : ''}${issue.message}`
        )).join(' / ');
        throw new Error(`${summary}${errors.length > 3 ? ` / ほか${errors.length - 3}件` : ''}`);
      }
      if (parsed.drafts.length === 0) {
        throw new Error('取り込める薬情テンプレがありません。');
      }
      if (!window.confirm(`${parsed.drafts.length}件を下書きとして取り込みます。承認済み版は変更しません。`)) {
        return;
      }

      const currentTemplates = await refreshMedicationInfoTemplates();
      const editableDraftByDrugCode = new Map<string, PatientMedicationInfoTemplate>();
      for (const template of currentTemplates) {
        if (template.status === 'draft' && !editableDraftByDrugCode.has(template.drugCode)) {
          editableDraftByDrugCode.set(template.drugCode, template);
        }
      }
      const existingIds = new Set(currentTemplates.map((template) => template.templateId));
      const importStartedAt = Date.now();
      const now = new Date(importStartedAt).toISOString();
      const writes = parsed.drafts.map((draft, index): PatientMedicationInfoTemplate => {
        const existingDraft = editableDraftByDrugCode.get(draft.drugCode);
        let templateId = existingDraft?.templateId;
        let idOffset = index;
        while (!templateId) {
          const candidate = makeMedicationInfoTemplateId(draft.drugCode, new Date(importStartedAt + idOffset));
          if (!existingIds.has(candidate)) {
            templateId = candidate;
            existingIds.add(candidate);
          }
          idOffset += parsed.drafts.length;
        }
        const template: PatientMedicationInfoTemplate = {
          templateId,
          drugCode: draft.drugCode,
          drugName: draft.drugName,
          status: 'draft',
          sourceType: draft.sourceType,
          createdAt: existingDraft?.createdAt || now,
          updatedAt: now
        };
        if (draft.genericName) template.genericName = draft.genericName;
        if (draft.counselingText) template.counselingText = draft.counselingText;
        if (draft.sideEffectText) template.sideEffectText = draft.sideEffectText;
        if (draft.sourceUrl) template.sourceUrl = draft.sourceUrl;
        if (draft.sourceRevisionDate) template.sourceRevisionDate = draft.sourceRevisionDate;
        if (draft.sourceHash) template.sourceHash = draft.sourceHash;
        return template;
      });

      attemptedTemplateIds = writes.map((template) => template.templateId);
      const currentTemplatesById = new Map(currentTemplates.map((template) => [template.templateId, template]));
      previousTemplatesById = new Map(writes.map((template) => [
        template.templateId,
        currentTemplatesById.get(template.templateId)
      ]));

      for (let start = 0; start < writes.length; start += 500) {
        const result = await db.patient_medication_info_templates.bulkUpsert(writes.slice(start, start + 500));
        if (result.error.length > 0) {
          throw new Error(`${result.error.length}件の書き込みに失敗しました。`);
        }
      }
      const auditOk = await logAuditAction(
        db,
        'patient_medication_info_template',
        `薬情テンプレCSV下書き取込: ${selectedFile.name} / ${writes.length}件 / 承認準備完了 ${parsed.readyForApprovalCount}件 / 警告 ${parsed.issues.filter((issue) => issue.severity === 'warning').length}件 / 承認情報なし`
      );
      if (!auditOk) {
        throw new Error('監査ログ記録に失敗したため、取り込みを取り消しました。');
      }

      const templates = await refreshMedicationInfoTemplates();
      const firstImportedTemplate = templates.find((template) => template.templateId === writes[0]?.templateId);
      if (firstImportedTemplate) handleSelectMedicationInfoTemplate(firstImportedTemplate);
      setMedicationInfoCsvImportSummary({
        fileName: selectedFile.name,
        importedCount: writes.length,
        readyForApprovalCount: parsed.readyForApprovalCount,
        warningCount: parsed.issues.filter((issue) => issue.severity === 'warning').length,
        importedAt: new Date().toISOString()
      });
      await refreshAuditEvidence();
      toast.success(`${writes.length}件を下書きとして取り込みました。承認準備完了は${parsed.readyForApprovalCount}件です。`);
    } catch (error: any) {
      if (previousTemplatesById) {
        try {
          const previousTemplates = Array.from(previousTemplatesById.values()).filter(
            (template): template is PatientMedicationInfoTemplate => !!template
          );
          for (let start = 0; start < previousTemplates.length; start += 500) {
            await db.patient_medication_info_templates.bulkUpsert(previousTemplates.slice(start, start + 500));
          }
          const newTemplateIds = attemptedTemplateIds.filter((templateId) => !previousTemplatesById?.get(templateId));
          for (const templateId of newTemplateIds) {
            const savedDoc = await db.patient_medication_info_templates.findOne(templateId).exec();
            if (savedDoc) await savedDoc.remove();
          }
        } catch (rollbackError) {
          console.error('Failed to roll back medication info CSV import:', rollbackError);
        }
      }
      console.error('Failed to import medication info CSV:', error);
      toast.error(`薬情テンプレCSVを取り込めませんでした: ${error.message || error}`);
    } finally {
      setIsImportingMedicationInfoCsv(false);
    }
  };

  return {
    invalidApprovedMedicationInfoTemplates,
    medicationInfoTemplateStatusFilter,
    setMedicationInfoTemplateStatusFilter,
    medicationInfoTemplates,
    medicationInfoTemplateStatusCounts,
    medicationInfoTemplateReadinessFilter,
    setMedicationInfoTemplateReadinessFilter,
    medicationInfoTemplateReadinessCounts,
    medicationInfoTemplateSearch,
    setMedicationInfoTemplateSearch,
    filteredMedicationInfoTemplates,
    isLoadingMedicationInfoTemplates,
    selectedMedicationInfoTemplateId,
    handleSelectMedicationInfoTemplate,
    getMedicationInfoTemplateReadinessIssues,
    handleNewMedicationInfoTemplate,
    isSavingMedicationInfoTemplate,
    isImportingMedicationInfoCsv,
    handleExportMedicationInfoCsv,
    handleImportMedicationInfoCsv,
    handleUsePmdaMedicationInfoSearchUrl,
    isBuildingMedicationInfoSafetyDraft,
    handleApplyMedicationInfoSafetyDraft,
    handleExportMedicationInfoSafetyDraftCsv,
    isExportingMedicationInfoSafetyDraftCsv,
    medicationInfoCsvImportSummary,
    selectedMedicationInfoTemplate,
    isEditingImmutableMedicationInfoRevision,
    medicationInfoTemplateForm,
    handleMedicationInfoTemplateFormChange,
    currentMedicationInfoApprovalIssues,
    handleSaveMedicationInfoTemplate,
    refreshMedicationInfoTemplates
  };
}
