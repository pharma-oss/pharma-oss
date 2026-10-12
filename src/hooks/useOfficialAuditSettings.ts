'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { PharmacyDatabase, Visit, Patient, PrescriptionItem, Drug } from '@/db/types';
import { logAuditAction, type PermissionAction } from '@/lib/audit';
import {
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  buildDispensingUkeOfficialAllFieldDefinitionGate,
  buildDispensingUkeOfficialAllFieldDefinitionGateCsv,
  formatDispensingUkeOfficialAllFieldDefinitionGate
} from '@/lib/receipt/dispensing_uke_validation';
import {
  makeDispensingUkeOfficialAllFieldsGateCsvFileName,
  makeDispensingUkeSpecImplementationPackFileName,
  makeDispensingUkeSpecReviewCsvFileName
} from '@/lib/audit_settings_helpers';
import {
  buildDispensingUkeSpecificationPdfAllFieldCompletionGate,
  buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv,
  buildDispensingUkeSpecificationPdfAllFieldImplementationPack,
  buildDispensingUkeSpecificationPdfAllFieldImplementationPackText,
  buildDispensingUkeSpecificationPdfFieldDefinitionReview,
  formatDispensingUkeSpecificationPdfAllFieldCompletionGate,
  parseDispensingUkeSpecConfirmationText,
  parseDispensingUkeSpecificationPdfText,
  type DispensingUkeSpecificationPdfAllFieldCompletionGate
} from '@/lib/receipt/dispensing_uke_spec_pdf';
import type { DispensingUkeOfficialSpecPdfFetchResult } from '@/lib/receipt/dispensing_uke_official_spec_pdf';
import { downloadTextFile } from '@/lib/blob_download';
import { exportWithAuditFirst, recordAuditOrNotify } from '@/lib/audit_guard';
import {
  buildClaimPointsDriftCsv,
  buildClaimPointsDriftReview,
  formatClaimPointsDriftSummary,
  makeClaimPointsDriftCsvFileName,
  type ClaimPointsDriftInput,
  type ClaimPointsDriftReview
} from '@/lib/claim_points_drift';
import {
  buildDosageCategoryConflictReview,
  buildDosageCategoryConflictCsv,
  makeDosageCategoryConflictCsvFileName,
  formatDosageCategoryConflictSummary,
  type DosageCategoryConflictInput,
  type DosageCategoryConflictPoints,
  type DosageCategoryConflictReview
} from '@/lib/dosage_category_conflict';
import { calculateDispensingFees, getTotalPoints } from '@/lib/calculator';
import { resolveClaimItemPricing, type ClaimItemPricingDrug, type ClaimItemPricingItem } from '@/lib/claim_item_pricing';
import { readClaimOptionsState } from '@/app/print/claim_actions';

export function toClaimItemPricingDrug(drugDoc?: { toJSON: () => Partial<Drug> } | Partial<Drug> | null): ClaimItemPricingDrug | undefined {
  if (!drugDoc) return undefined;
  const d: Partial<Drug> = 'toJSON' in drugDoc && typeof drugDoc.toJSON === 'function'
    ? drugDoc.toJSON()
    : (drugDoc as Partial<Drug>);
  return {
    price: d.price,
    priceHistory: d.priceHistory ? Array.from(d.priceHistory) : undefined,
    yjCode: d.yjCode,
    isGeneric: d.isGeneric,
    isHighRisk: d.isHighRisk
  };
}

// 剤形判定の食い違い点検に渡す入力。処方明細の主キーは itemId（id ではない）。
// 薬品名は処方明細に項目が無いので、調剤した薬品名、無ければ薬品コードを渡す。
export function toDosageCategoryConflictInput(
  item: Pick<PrescriptionItem, 'visitId' | 'rpNumber' | 'itemId' | 'drugId' | 'dispensedDrug' | 'usage' | 'dosageCategory' | 'dosageCategorySource'>
): DosageCategoryConflictInput {
  return {
    visitId: item.visitId,
    rpNumber: item.rpNumber,
    itemId: item.itemId,
    drugName: item.dispensedDrug || item.drugId,
    dispensedDrug: item.dispensedDrug,
    usage: item.usage,
    dosageCategory: item.dosageCategory,
    dosageCategorySource: item.dosageCategorySource
  };
}

// 処方明細に調剤日時点の薬価を当てる（点数の変動点検と剤形の食い違い点検で共通）。
export function buildPricedClaimItems<TItem extends ClaimItemPricingItem>(
  itemDocs: Array<{ drugId: string; dispensedDrugCode?: string; toJSON: () => TItem }>,
  drugsMap: { get: (id: string) => Parameters<typeof toClaimItemPricingDrug>[0] },
  dispensingDate: string
) {
  return itemDocs.map((doc) => ({
    ...doc.toJSON(),
    ...resolveClaimItemPricing(
      doc.toJSON(),
      {
        prescribed: toClaimItemPricingDrug(drugsMap.get(doc.drugId)),
        dispensed: toClaimItemPricingDrug(doc.dispensedDrugCode ? drugsMap.get(doc.dispensedDrugCode) : undefined)
      },
      dispensingDate
    )
  }));
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
    await recordAuditOrNotify(
      () => logAuditAction(
        db,
        'official_spec_review',
        `UKE仕様PDF全項目突合: ${sourceLabel} / 判定 ${gate.statusLabel} / レコード ${gate.parsedRecordTypeCount}/${gate.expectedRecordTypeCount} / 抽出 ${gate.parsedFieldCount}項目 / 定義済み ${gate.definedFieldCount}項目 / 残 ${gate.remainingFieldCount}項目 / 停止理由 ${gate.blockerCount}件`
      ),
      (message) => toast.warning(message)
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
      const download = () => downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        // 監査ログを先に残し、残らなければ書き出さない
        await exportWithAuditFirst({
          logAudit: () => logAuditAction(
            db,
            'official_spec_review',
            `UKE仕様PDF全項目突合CSV書出: ${fileName} / 判定 ${dispensingUkeSpecCompletionGate.statusLabel} / 残 ${dispensingUkeSpecCompletionGate.remainingFieldCount}項目 / 停止理由 ${dispensingUkeSpecCompletionGate.blockerCount}件`
          ),
          download
        });
        if (refreshAuditEvidence) {
          await refreshAuditEvidence();
        }
      } else {
        download();
      }
      toast.success('UKE仕様PDFの確認結果CSVを書き出しました。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'UKE仕様PDFの確認結果CSVを書き出せませんでした。');
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
      const download = () => downloadTextFile(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8');
      if (db) {
        // 監査ログを先に残し、残らなければ書き出さない
        await exportWithAuditFirst({
          logAudit: () => logAuditAction(
            db,
            'official_spec_review',
            `公式提出UKE allFields完了ゲートCSV書出: ${fileName} / 判定 ${dispensingUkeOfficialAllFieldsGate.statusLabel} / レコード ${dispensingUkeOfficialAllFieldsGate.completedRecordTypeCount}/${dispensingUkeOfficialAllFieldsGate.expectedRecordTypes.length} / 定義 ${dispensingUkeOfficialAllFieldsGate.definedFieldCount}/${dispensingUkeOfficialAllFieldsGate.expectedFieldCount} / 指摘 ${dispensingUkeOfficialAllFieldsGate.issueCount}件`
          ),
          download
        });
        if (refreshAuditEvidence) {
          await refreshAuditEvidence();
        }
      } else {
        download();
      }
      toast.success('公式提出UKE allFields完了ゲートCSVを書き出しました。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '公式提出UKE allFields完了ゲートCSVを書き出せませんでした。');
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
      const confirmations = parseDispensingUkeSpecConfirmationText(dispensingUkeSpecConfirmationText);
      const pack = buildDispensingUkeSpecificationPdfAllFieldImplementationPack(trimmedText, confirmations);
      setDispensingUkeSpecCompletionGate(pack.completionGate);
      setDispensingUkeSpecCompletionLabel(formatDispensingUkeSpecificationPdfAllFieldCompletionGate(pack.completionGate));

      const fileName = makeDispensingUkeSpecImplementationPackFileName();
      const download = () => downloadTextFile(
        fileName,
        buildDispensingUkeSpecificationPdfAllFieldImplementationPackText(pack),
        'text/plain;charset=utf-8'
      );
      if (db) {
        // 監査ログを先に残し、残らなければ書き出さない
        await exportWithAuditFirst({
          logAudit: () => logAuditAction(
            db,
            'official_spec_review',
            `UKE仕様PDF実装パック書出: ${fileName} / 判定 ${pack.completionGate.statusLabel} / 実装タスク ${pack.implementationPlan.taskCount}件 / 定義追加準備 ${pack.progressReview.readyToDefineCount}件 / 追加候補 ${pack.candidateReport.candidateCount}件 / 残 ${pack.remainingActionReport.remainingFieldCount}項目`
          ),
          download
        });
        if (refreshAuditEvidence) {
          await refreshAuditEvidence();
        }
      } else {
        download();
      }
      toast.success('UKE仕様PDFの実装パックを書き出しました。');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'UKE仕様PDFの実装パックを書き出せませんでした。';
      toast.error(message);
    } finally {
      setIsExportingDispensingUkeSpecImplementationPack(false);
    }
  };

  // 出力済みの請求と、いま計算し直した点数のずれ。
  // 算定を直したあと「どの請求が影響を受けたか」を運用者が把握するための一覧。
  const [claimPointsDrift, setClaimPointsDrift] = useState<ClaimPointsDriftReview | null>(null);
  const [isReviewingClaimPointsDrift, setIsReviewingClaimPointsDrift] = useState(false);

  const handleReviewClaimPointsDrift = async () => {
    if (!ensurePermission('view_official_audit')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    setIsReviewingClaimPointsDrift(true);
    try {
      const [visits, settingsDoc] = await Promise.all([
        db.visits.find().exec(),
        db.facility_settings.findOne('default').exec()
      ]);
      const settings = settingsDoc ? settingsDoc.toJSON() : null;

      const inputs: ClaimPointsDriftInput[] = [];
      for (const visitDoc of visits) {
        const visit = visitDoc.toJSON() as Visit;
        const snapshot = visit.claimLifecycle?.exportSnapshot;
        if (!snapshot || !Number.isFinite(snapshot.totalPoints)) continue;

        const [patientDoc, itemDocs] = await Promise.all([
          db.patients.findOne(visit.patientId).exec(),
          db.prescription_items.find({ selector: { visitId: visit.visitId } }).exec()
        ]);
        const patient = patientDoc ? (patientDoc.toJSON() as Patient) : null;

        // 薬価は調剤日時点で引く。印刷画面と同じ関数を通さないと薬剤料が算定されず、
        // ずれていない請求まで「点数が減った」と出てしまう。
        const dispensingDateForPrice = visit.dispensingDate || visit.issueDate || '';
        const drugCodes = new Set<string>();
        for (const doc of itemDocs) {
          if (doc.drugId) drugCodes.add(String(doc.drugId));
          if (doc.dispensedDrugCode) drugCodes.add(String(doc.dispensedDrugCode));
        }
        const drugsMap = await db.drugs.findByIds(Array.from(drugCodes)).exec();
        const items = buildPricedClaimItems(itemDocs, drugsMap, dispensingDateForPrice);

        // 施設設定か患者が引けない受付は計算し直せない。落とさずに「再計算できず」で出す。
        let currentPoints: number | undefined;
        if (settings && patient) {
          const visitDate = visit.dispensingDate || visit.prescriptionDate || visit.issueDate || '';
          currentPoints = getTotalPoints(
            calculateDispensingFees(settings, items, patient, visitDate, readClaimOptionsState(visit.claimOptions))
          );
        }

        inputs.push({
          visitId: visit.visitId,
          patientName: patient?.name,
          dispensingDate: visit.dispensingDate || visit.issueDate,
          claimStatus: visit.claimLifecycle?.status,
          exportedAt: visit.claimLifecycle?.exportedAt,
          exportedFileName: visit.claimLifecycle?.exportedFileName,
          exportedPoints: snapshot.totalPoints,
          currentPoints
        });
      }

      const review = buildClaimPointsDriftReview(inputs);
      setClaimPointsDrift(review);
      await recordAuditOrNotify(
        () => logAuditAction(db, 'claim_points_review', `請求点数の変動点検: ${formatClaimPointsDriftSummary(review)}`),
        (message) => toast.warning(message)
      );
      if (refreshAuditEvidence) await refreshAuditEvidence();
      toast.success(formatClaimPointsDriftSummary(review));
    } catch (error: unknown) {
      console.error('Failed to review claim points drift:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`請求点数の変動点検に失敗しました: ${message}`);
    } finally {
      setIsReviewingClaimPointsDrift(false);
    }
  };

  const handleExportClaimPointsDriftCsv = () => {
    if (!claimPointsDrift) return;
    downloadTextFile(
      makeClaimPointsDriftCsvFileName(new Date()),
      `\ufeff${buildClaimPointsDriftCsv(claimPointsDrift)}`,
      'text/csv;charset=utf-8'
    );
  };

  // 算定と帳票の剤形判定の食い違い（手動指定 vs 用法正規表現）を運用者が把握するための一覧。
  const [dosageCategoryConflict, setDosageCategoryConflict] = useState<DosageCategoryConflictReview | null>(null);
  const [isReviewingDosageCategoryConflict, setIsReviewingDosageCategoryConflict] = useState(false);

  const handleReviewDosageCategoryConflict = async () => {
    if (!ensurePermission('view_official_audit')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    setIsReviewingDosageCategoryConflict(true);
    try {
      const [visits, settingsDoc, allItemDocs] = await Promise.all([
        db.visits.find().exec(),
        db.facility_settings.findOne('default').exec(),
        db.prescription_items.find().exec()
      ]);
      const settings = settingsDoc ? settingsDoc.toJSON() : null;

      const inputs: DosageCategoryConflictInput[] = allItemDocs.map((doc) => toDosageCategoryConflictInput(doc.toJSON()));

      // 一旦食い違いを特定し、食い違いを含む受付IDのみ点数計算の対象とする
      const provisionalReview = buildDosageCategoryConflictReview(inputs);
      const conflictVisitIds = new Set(provisionalReview.cases.map((c) => c.visitId));

      const pointsList: DosageCategoryConflictPoints[] = [];
      if (settings && conflictVisitIds.size > 0) {
        const targetVisits = visits.filter((v) => conflictVisitIds.has(v.visitId));
        for (const visitDoc of targetVisits) {
          const visit = visitDoc.toJSON() as Visit;
          const [patientDoc, itemDocs] = await Promise.all([
            db.patients.findOne(visit.patientId).exec(),
            db.prescription_items.find({ selector: { visitId: visit.visitId } }).exec()
          ]);
          const patient = patientDoc ? (patientDoc.toJSON() as Patient) : null;
          if (!patient) continue;

          const dispensingDateForPrice = visit.dispensingDate || visit.issueDate || '';
          const drugCodes = new Set<string>();
          for (const doc of itemDocs) {
            if (doc.drugId) drugCodes.add(String(doc.drugId));
            if (doc.dispensedDrugCode) drugCodes.add(String(doc.dispensedDrugCode));
          }
          const drugsMap = await db.drugs.findByIds(Array.from(drugCodes)).exec();
          const items = buildPricedClaimItems(itemDocs, drugsMap, dispensingDateForPrice);

          const visitDate = visit.dispensingDate || visit.prescriptionDate || visit.issueDate || '';
          const claimOptions = readClaimOptionsState(visit.claimOptions);

          const legacyPoints = getTotalPoints(
            calculateDispensingFees(settings, items, patient, visitDate, {
              ...claimOptions,
              dosageCategoryResolution: 'legacy'
            })
          );
          const respectManualPoints = getTotalPoints(
            calculateDispensingFees(settings, items, patient, visitDate, {
              ...claimOptions,
              dosageCategoryResolution: 'respect_manual'
            })
          );

          pointsList.push({
            visitId: visit.visitId,
            legacyPoints,
            respectManualPoints
          });
        }
      }

      const review = buildDosageCategoryConflictReview(inputs, pointsList);
      setDosageCategoryConflict(review);
      await recordAuditOrNotify(
        () => logAuditAction(
          db,
          'claim_points_review',
          `剤形判定の食い違い点検: ${formatDosageCategoryConflictSummary(review)}`
        ),
        (message) => toast.warning(message)
      );
      if (refreshAuditEvidence) await refreshAuditEvidence();
      toast.success(formatDosageCategoryConflictSummary(review));
    } catch (error: unknown) {
      console.error('Failed to review dosage category conflicts:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`剤形判定の食い違い点検に失敗しました: ${message}`);
    } finally {
      setIsReviewingDosageCategoryConflict(false);
    }
  };

  const handleExportDosageCategoryConflictCsv = () => {
    if (!dosageCategoryConflict) return;
    downloadTextFile(
      makeDosageCategoryConflictCsvFileName(new Date()),
      `\ufeff${buildDosageCategoryConflictCsv(dosageCategoryConflict)}`,
      'text/csv;charset=utf-8'
    );
  };

  return {
    canViewOfficialAudit,
    claimPointsDrift,
    isReviewingClaimPointsDrift,
    handleReviewClaimPointsDrift,
    handleExportClaimPointsDriftCsv,
    dosageCategoryConflict,
    isReviewingDosageCategoryConflict,
    handleReviewDosageCategoryConflict,
    handleExportDosageCategoryConflictCsv,
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
