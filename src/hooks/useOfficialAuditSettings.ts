'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { PharmacyDatabase } from '@/db/types';
import { logAuditAction, type PermissionAction } from '@/lib/audit';
import {
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  buildDispensingUkeOfficialAllFieldDefinitionGate,
  buildDispensingUkeOfficialAllFieldDefinitionGateCsv,
  formatDispensingUkeOfficialAllFieldDefinitionGate
} from '@/lib/receipt/dispensing_uke_validation';
import {
  buildDispensingUkeSpecificationPdfAllFieldCompletionGate,
  buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv,
  buildDispensingUkeSpecificationPdfAllFieldImplementationPack,
  buildDispensingUkeSpecificationPdfAllFieldImplementationPackText,
  buildDispensingUkeSpecificationPdfFieldDefinitionReview,
  formatDispensingUkeSpecificationPdfAllFieldCompletionGate,
  parseDispensingUkeSpecificationPdfText,
  type DispensingUkeSpecificationPdfAllFieldCompletionGate
} from '@/lib/receipt/dispensing_uke_spec_pdf';
import type { DispensingUkeOfficialSpecPdfFetchResult } from '@/lib/receipt/dispensing_uke_official_spec_pdf';
import { downloadTextFile } from '@/lib/blob_download';

export function makeDispensingUkeSpecReviewCsvFileName(): string {
  return `dispensing_uke_spec_review_${new Date().toISOString().slice(0, 10)}.csv`;
}

export function makeDispensingUkeOfficialAllFieldsGateCsvFileName(): string {
  return `dispensing_uke_official_all_fields_gate_${new Date().toISOString().slice(0, 10)}.csv`;
}

export function makeDispensingUkeSpecImplementationPackFileName(): string {
  return `dispensing_uke_spec_implementation_pack_${new Date().toISOString().slice(0, 10)}.txt`;
}

interface UseOfficialAuditSettingsProps {
  db: PharmacyDatabase | null;
  canViewOfficialAudit: boolean;
  ensurePermission: (permission: PermissionAction) => boolean;
  refreshAuditEvidence?: () => Promise<void>;
}

export function useOfficialAuditSettings({
  db,
  canViewOfficialAudit,
  ensurePermission,
  refreshAuditEvidence
}: UseOfficialAuditSettingsProps) {
  const [dispensingUkeSpecPdfText, setDispensingUkeSpecPdfText] = useState('');
  const [dispensingUkeSpecConfirmationText, setDispensingUkeSpecConfirmationText] = useState('');
  const [dispensingUkeSpecCompletionGate, setDispensingUkeSpecCompletionGate] = useState<DispensingUkeSpecificationPdfAllFieldCompletionGate | null>(null);
  const [dispensingUkeSpecCompletionLabel, setDispensingUkeSpecCompletionLabel] = useState('');
  const [isFetchingDispensingUkeSpecPdf, setIsFetchingDispensingUkeSpecPdf] = useState(false);
  const [isExportingDispensingUkeSpecReview, setIsExportingDispensingUkeSpecReview] = useState(false);
  const [isExportingDispensingUkeOfficialAllFieldsGate, setIsExportingDispensingUkeOfficialAllFieldsGate] = useState(false);
  const [isExportingDispensingUkeSpecImplementationPack, setIsExportingDispensingUkeSpecImplementationPack] = useState(false);

  const applyDispensingUkeSpecPdfReview = (text: string) => {
    const parseResult = parseDispensingUkeSpecificationPdfText(text);
    const definitionReview = buildDispensingUkeSpecificationPdfFieldDefinitionReview(parseResult);
    const gate = buildDispensingUkeSpecificationPdfAllFieldCompletionGate(parseResult, definitionReview);
    setDispensingUkeSpecCompletionGate(gate);
    setDispensingUkeSpecCompletionLabel(formatDispensingUkeSpecificationPdfAllFieldCompletionGate(gate));
    return gate;
  };

  const recordDispensingUkeSpecReview = async (
    gate: DispensingUkeSpecificationPdfAllFieldCompletionGate,
    sourceLabel: string
  ) => {
    if (!db) return;
    await logAuditAction(
      db,
      'official_spec_review',
      `UKE仕様PDF全項目突合: ${sourceLabel} / 判定 ${gate.statusLabel} / レコード ${gate.parsedRecordTypeCount}/${gate.expectedRecordTypeCount} / 抽出 ${gate.parsedFieldCount}項目 / 定義済み ${gate.definedFieldCount}項目 / 残 ${gate.remainingFieldCount}項目 / 停止理由 ${gate.blockerCount}件`
    );
    if (refreshAuditEvidence) {
      await refreshAuditEvidence();
    }
  };

  const handleReviewDispensingUkeSpecPdfText = async () => {
    if (!ensurePermission('view_official_audit')) return;
    const trimmedText = dispensingUkeSpecPdfText.trim();
    if (!trimmedText) {
      setDispensingUkeSpecCompletionGate(null);
      setDispensingUkeSpecCompletionLabel('仕様PDF本文を貼り付けてください。');
      toast.error('仕様PDF本文を貼り付けてください。');
      return;
    }

    const gate = applyDispensingUkeSpecPdfReview(trimmedText);
    await recordDispensingUkeSpecReview(gate, '貼り付け本文');
    if (gate.ok) {
      toast.success('UKE仕様PDFの全項目確認が完了しました。');
    } else {
      toast.warning(`UKE仕様PDFに残作業が${gate.blockerCount}件あります。`);
    }
  };

  const handleFetchDispensingUkeSpecPdf = async () => {
    if (!ensurePermission('view_official_audit')) return;
    setIsFetchingDispensingUkeSpecPdf(true);
    setDispensingUkeSpecCompletionLabel('厚労省の調剤UKE仕様PDFを取得しています。');
    try {
      const response = await fetch(
        `/api/receipt/official-spec-pdf?url=${encodeURIComponent(DISPENSING_UKE_RECORD_SPEC_SOURCE.url)}`,
        { method: 'GET' }
      );
      const payload = await response.json().catch(() => ({})) as Partial<DispensingUkeOfficialSpecPdfFetchResult> & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '調剤UKE仕様PDFを取得できませんでした。');
      }

      const text = String(payload.text || '');
      setDispensingUkeSpecPdfText(text);
      const gate = payload.completionGate ?? applyDispensingUkeSpecPdfReview(text);
      setDispensingUkeSpecCompletionGate(gate);
      setDispensingUkeSpecCompletionLabel(
        payload.completionGateLabel || formatDispensingUkeSpecificationPdfAllFieldCompletionGate(gate)
      );
      await recordDispensingUkeSpecReview(gate, `公式PDF ${payload.fileName || DISPENSING_UKE_RECORD_SPEC_SOURCE.fileName || 'iryokikan_in_07.pdf'}`);
      if (gate.ok) {
        toast.success('公式PDFを取得し、UKE全項目の一致を確認しました。');
      } else {
        toast.warning('公式PDFを取得しました。残作業を確認してください。');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '調剤UKE仕様PDFを取得できませんでした。';
      setDispensingUkeSpecCompletionLabel(message);
      toast.error(message);
    } finally {
      setIsFetchingDispensingUkeSpecPdf(false);
    }
  };

  const handleExportDispensingUkeSpecReviewCsv = async () => {
    if (!ensurePermission('view_official_audit')) return;
    if (!dispensingUkeSpecCompletionGate) {
      toast.info('先にUKE仕様PDFの全項目確認を実行してください。');
      return;
    }

    setIsExportingDispensingUkeSpecReview(true);
    try {
      const fileName = makeDispensingUkeSpecReviewCsvFileName();
      const csv = buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv(dispensingUkeSpecCompletionGate);
      downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        await logAuditAction(
          db,
          'official_spec_review',
          `UKE仕様PDF全項目突合CSV書出: ${fileName} / 判定 ${dispensingUkeSpecCompletionGate.statusLabel} / 残 ${dispensingUkeSpecCompletionGate.remainingFieldCount}項目 / 停止理由 ${dispensingUkeSpecCompletionGate.blockerCount}件`
        );
        if (refreshAuditEvidence) {
          await refreshAuditEvidence();
        }
      }
      toast.success('UKE仕様PDFの確認結果CSVを書き出しました。');
    } finally {
      setIsExportingDispensingUkeSpecReview(false);
    }
  };

  const handleExportDispensingUkeOfficialAllFieldsGateCsv = async () => {
    if (!ensurePermission('view_official_audit')) return;

    const dispensingUkeOfficialAllFieldsGate = buildDispensingUkeOfficialAllFieldDefinitionGate();
    setIsExportingDispensingUkeOfficialAllFieldsGate(true);
    try {
      const fileName = makeDispensingUkeOfficialAllFieldsGateCsvFileName();
      const csv = buildDispensingUkeOfficialAllFieldDefinitionGateCsv(dispensingUkeOfficialAllFieldsGate);
      downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        await logAuditAction(
          db,
          'official_spec_review',
          `公式提出UKE allFields完了ゲートCSV書出: ${fileName} / 判定 ${dispensingUkeOfficialAllFieldsGate.statusLabel} / レコード ${dispensingUkeOfficialAllFieldsGate.completedRecordTypeCount}/${dispensingUkeOfficialAllFieldsGate.expectedRecordTypes.length} / 定義 ${dispensingUkeOfficialAllFieldsGate.definedFieldCount}/${dispensingUkeOfficialAllFieldsGate.expectedFieldCount} / 指摘 ${dispensingUkeOfficialAllFieldsGate.issueCount}件`
        );
        if (refreshAuditEvidence) {
          await refreshAuditEvidence();
        }
      }
      toast.success('公式提出UKE allFields完了ゲートCSVを書き出しました。');
    } finally {
      setIsExportingDispensingUkeOfficialAllFieldsGate(false);
    }
  };

  const handleExportDispensingUkeSpecImplementationPack = async () => {
    if (!ensurePermission('view_official_audit')) return;
    const trimmedText = dispensingUkeSpecPdfText.trim();
    if (!trimmedText) {
      toast.info('先にPDFから取り出した文字を貼り付けて確認してください。');
      return;
    }

    setIsExportingDispensingUkeSpecImplementationPack(true);
    try {
      const pack = buildDispensingUkeSpecificationPdfAllFieldImplementationPack(trimmedText);
      const fileName = makeDispensingUkeSpecImplementationPackFileName();
      downloadTextFile(
        fileName,
        buildDispensingUkeSpecificationPdfAllFieldImplementationPackText(pack),
        'text/plain;charset=utf-8'
      );
      if (db) {
        await logAuditAction(
          db,
          'official_spec_review',
          `UKE仕様PDF実装パック書出: ${fileName} / 判定 ${pack.completionGate.statusLabel} / 実装タスク ${pack.implementationPlan.taskCount}件 / 定義追加準備 ${pack.progressReview.readyToDefineCount}件 / 追加候補 ${pack.candidateReport.candidateCount}件 / 残 ${pack.remainingActionReport.remainingFieldCount}項目`
        );
        if (refreshAuditEvidence) {
          await refreshAuditEvidence();
        }
      }
      toast.success('UKE仕様PDFの実装パックを書き出しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UKE仕様PDFの実装パックを書き出せませんでした。';
      toast.error(message);
    } finally {
      setIsExportingDispensingUkeSpecImplementationPack(false);
    }
  };

  return {
    canViewOfficialAudit,
    dispensingUkeSpecPdfText,
    setDispensingUkeSpecPdfText,
    setDispensingUkeSpecCompletionGate,
    setDispensingUkeSpecCompletionLabel,
    dispensingUkeSpecConfirmationText,
    setDispensingUkeSpecConfirmationText,
    isFetchingDispensingUkeSpecPdf,
    handleFetchDispensingUkeSpecPdf,
    handleReviewDispensingUkeSpecPdfText,
    dispensingUkeSpecCompletionGate,
    isExportingDispensingUkeSpecReview,
    handleExportDispensingUkeSpecReviewCsv,
    isExportingDispensingUkeSpecImplementationPack,
    handleExportDispensingUkeSpecImplementationPack,
    dispensingUkeSpecCompletionLabel,
    isExportingDispensingUkeOfficialAllFieldsGate,
    handleExportDispensingUkeOfficialAllFieldsGateCsv
  };
}
