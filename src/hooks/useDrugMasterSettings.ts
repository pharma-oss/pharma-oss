'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import encoding from 'encoding-japanese';
import type { PharmacyDatabase, User, Drug } from '@/db/types';
import { logAuditAction, type PermissionAction } from '@/lib/audit';
import { appendDrugPriceRevision, isDrugPriceRevisionNeeded } from '@/lib/drug_price_history';
import {
  buildDrugMasterDiffCsv,
  buildDrugMasterUpdateArtifacts,
  makeDrugMasterDiffCsvFileName,
  makeDrugMasterRollbackFileName,
  validateDrugMasterRollbackPayload
} from '@/lib/drug_master_version';
import {
  DRUG_MASTER_SPECIFICATION_SOURCE,
  buildDrugMasterColumnDefinitionReview,
  buildDrugMasterSpecificationRevisionReview,
  formatDrugMasterColumnDefinitionReview,
  formatDrugMasterCsvLayoutLabel,
  formatDrugMasterSpecificationRevisionReview,
  parseDrugMasterUpdateCsv
} from '@/lib/drug_master_csv';
import {
  buildDrugMasterSpecificationPdfDiffReview,
  formatDrugMasterSpecificationPdfDiffReview,
  type DrugMasterSpecificationPdfDiffReview
} from '@/lib/drug_master_spec_pdf';
import type { DrugMasterOfficialSpecPdfFetchResult } from '@/lib/drug_master_official_spec_pdf';
import {
  extractDrugMasterCsvFromZip,
  isDrugMasterZipUpload
} from '@/lib/drug_master_zip';
import {
  buildDrugMasterSourceEvidence,
  extractSskDrugMasterDownloadCandidates,
  formatDrugMasterSourceUrlReview,
  normalizeDrugMasterSourceUrl,
  reviewDrugMasterSourceUrl,
  type DrugMasterOfficialDownloadCandidate
} from '@/lib/drug_master_provenance';
import type { DrugMasterOfficialPageFetchResult } from '@/lib/drug_master_official_page';
import {
  findDuplicateDrugGroups,
  buildDrugUsageStats,
  buildDrugDuplicateScanAuditDetail,
  type DrugDuplicateGroup,
  type DrugDuplicateScanReport
} from '@/lib/drug_duplicate_review';
import {
  buildDrugMergePlan,
  buildDrugMergeExecutionPlan,
  type DrugMergeExecutionPlan,
  type DrugMergePlan,
  type DrugMergeItemRef
} from '@/lib/drug_merge';
import {
  createRxdbDrugMergeExecutionStore,
  applyDrugMergeExecutionPlan,
  applyDrugMergeOperation,
  DrugMergeExecutionError
} from '@/lib/drug_merge_execution';
import { downloadTextFile } from '@/lib/blob_download';
import { drugMasterCandidateKindLabel } from '@/lib/drug_master_update_ui';

interface DrugMasterImportSource {
  sourceFileName: string;
  sourceBuffer: ArrayBuffer;
  sourceSizeBytes: number;
  sourceUrl?: string;
}

interface UseDrugMasterSettingsProps {
  db: PharmacyDatabase | null;
  currentUser: User;
  canUpdateDrugMaster: boolean;
  ensurePermission: (permission: PermissionAction) => boolean;
  refreshAuditEvidence?: () => Promise<void>;
}

export function useDrugMasterSettings({
  db,
  currentUser,
  canUpdateDrugMaster,
  ensurePermission,
  refreshAuditEvidence
}: UseDrugMasterSettingsProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isImportingDrugMasterFromUrl, setIsImportingDrugMasterFromUrl] = useState(false);
  const [drugMasterSourceUrl, setDrugMasterSourceUrl] = useState('');
  const [drugMasterOfficialPageHtml, setDrugMasterOfficialPageHtml] = useState('');
  const [drugMasterCandidates, setDrugMasterCandidates] = useState<DrugMasterOfficialDownloadCandidate[]>([]);
  const [drugMasterCandidateMessage, setDrugMasterCandidateMessage] = useState('');
  const [drugMasterSpecPdfText, setDrugMasterSpecPdfText] = useState('');
  const [drugMasterSpecPdfReview, setDrugMasterSpecPdfReview] = useState<DrugMasterSpecificationPdfDiffReview | null>(null);
  const [drugMasterSpecPdfReviewLabel, setDrugMasterSpecPdfReviewLabel] = useState('');
  const [isFetchingDrugMasterSpecPdf, setIsFetchingDrugMasterSpecPdf] = useState(false);
  const [isFetchingDrugMasterOfficialPage, setIsFetchingDrugMasterOfficialPage] = useState(false);
  const [rollbackFile, setRollbackFile] = useState<File | null>(null);
  const [isRollingBackDrugMaster, setIsRollingBackDrugMaster] = useState(false);
  const [isMedicalInstSyncOpen, setIsMedicalInstSyncOpen] = useState(false);

  // 薬品重複点検
  const [drugDuplicateReport, setDrugDuplicateReport] = useState<DrugDuplicateScanReport | null>(null);
  const [isScanningDrugDuplicates, setIsScanningDrugDuplicates] = useState(false);
  const [drugDuplicateMessage, setDrugDuplicateMessage] = useState('');
  const [drugMergeTargets, setDrugMergeTargets] = useState<Record<string, string>>({});
  const [drugMergeReview, setDrugMergeReview] = useState<{
    groupId: string;
    sourceCode: string;
    plan: DrugMergePlan;
    executionPlan: DrugMergeExecutionPlan;
  } | null>(null);
  const [isApplyingDrugMerge, setIsApplyingDrugMerge] = useState(false);

  const canImportDrugMasterFromSourceUrl = /\.(csv|zip)(?:$|\?)/i.test(drugMasterSourceUrl.trim());

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrugMasterRollbackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setRollbackFile(e.target.files[0]);
    }
  };

  const handleFetchDrugMasterOfficialPage = async () => {
    setIsFetchingDrugMasterOfficialPage(true);
    setDrugMasterCandidateMessage('支払基金の公式ページを取得しています。');
    try {
      const response = await fetch('/api/drug-master/official-page', { method: 'GET' });
      const payload = await response.json().catch(() => ({})) as Partial<DrugMasterOfficialPageFetchResult> & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '公式ページを取得できませんでした。');
      }

      const html = String(payload.html || '');
      const candidates = Array.isArray(payload.candidates)
        ? payload.candidates as DrugMasterOfficialDownloadCandidate[]
        : extractSskDrugMasterDownloadCandidates(html);
      setDrugMasterOfficialPageHtml(html);
      setDrugMasterCandidates(candidates);
      setDrugMasterCandidateMessage(
        candidates.length > 0
          ? `公式ページを取得し、更新候補 ${candidates.length}件を抽出しました。`
          : '公式ページを取得しましたが、更新候補を抽出できませんでした。'
      );
      toast.success('公式ページを取得しました。');
    } catch (error: any) {
      const message = error instanceof Error ? error.message : '公式ページを取得できませんでした。';
      setDrugMasterCandidateMessage(message);
      toast.error(message);
    } finally {
      setIsFetchingDrugMasterOfficialPage(false);
    }
  };

  const handleExtractDrugMasterCandidates = () => {
    const trimmedHtml = drugMasterOfficialPageHtml.trim();
    if (!trimmedHtml) {
      setDrugMasterCandidates([]);
      setDrugMasterCandidateMessage('公式ページのHTMLを貼り付けてください。');
      toast.error('公式ページのHTMLを貼り付けてください。');
      return;
    }

    const candidates = extractSskDrugMasterDownloadCandidates(trimmedHtml);
    setDrugMasterCandidates(candidates);
    setDrugMasterCandidateMessage(
      candidates.length > 0
        ? `更新候補 ${candidates.length}件を抽出しました。`
        : 'HTMLから医薬品マスターのダウンロードリンクを抽出できませんでした。'
    );
    if (candidates.length > 0) {
      toast.success(`更新候補 ${candidates.length}件を抽出しました。`);
    } else {
      toast.warning('ダウンロードリンクを抽出できませんでした。');
    }
  };

  const handleSelectDrugMasterCandidate = (candidate: DrugMasterOfficialDownloadCandidate) => {
    setDrugMasterSourceUrl(candidate.url);
    setDrugMasterCandidateMessage(`${drugMasterCandidateKindLabel[candidate.kind]}候補を更新元URLへ反映しました。`);
    toast.success('更新元URLへ反映しました。');
  };

  const handleReviewDrugMasterSpecPdfText = () => {
    const trimmedText = drugMasterSpecPdfText.trim();
    if (!trimmedText) {
      setDrugMasterSpecPdfReview(null);
      setDrugMasterSpecPdfReviewLabel('仕様PDF本文を貼り付けてください。');
      toast.error('仕様PDF本文を貼り付けてください。');
      return;
    }

    const review = buildDrugMasterSpecificationPdfDiffReview(trimmedText);
    const label = formatDrugMasterSpecificationPdfDiffReview(review);
    setDrugMasterSpecPdfReview(review);
    setDrugMasterSpecPdfReviewLabel(label);
    if (review.ok) {
      toast.success('仕様PDF本文の42項目と現在の列定義が一致しました。');
    } else {
      toast.warning('仕様PDF本文と現在の列定義に確認事項があります。');
    }
  };

  const handleFetchDrugMasterSpecPdf = async () => {
    setIsFetchingDrugMasterSpecPdf(true);
    setDrugMasterSpecPdfReviewLabel('支払基金の仕様PDFを取得しています。');
    try {
      const response = await fetch(`/api/drug-master/official-spec-pdf?url=${encodeURIComponent(DRUG_MASTER_SPECIFICATION_SOURCE.url)}`, { method: 'GET' });
      const payload = await response.json().catch(() => ({})) as Partial<DrugMasterOfficialSpecPdfFetchResult> & { message?: string };
      if (!response.ok) {
        throw new Error(payload.message || '仕様PDFを取得できませんでした。');
      }

      const text = String(payload.text || '');
      setDrugMasterSpecPdfText(text);
      if (payload.review && payload.reviewLabel) {
        setDrugMasterSpecPdfReview(payload.review);
        setDrugMasterSpecPdfReviewLabel(payload.reviewLabel);
        if (payload.review.ok) {
          toast.success('公式仕様PDFを取得し、42項目の一致を確認しました。');
        } else {
          toast.warning('公式仕様PDFを取得しました。差分候補を確認してください。');
        }
      } else {
        const review = buildDrugMasterSpecificationPdfDiffReview(text);
        const label = formatDrugMasterSpecificationPdfDiffReview(review);
        setDrugMasterSpecPdfReview(review);
        setDrugMasterSpecPdfReviewLabel(label);
        toast.success('公式仕様PDFを取得しました。');
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : '仕様PDFを取得できませんでした。';
      setDrugMasterSpecPdfReviewLabel(message);
      toast.error(message);
    } finally {
      setIsFetchingDrugMasterSpecPdf(false);
    }
  };

  const importDrugMasterFromSource = async (source: DrugMasterImportSource): Promise<boolean> => {
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return false;
    }

    try {
      let normalizedSourceUrl: string | undefined;
      try {
        normalizedSourceUrl = normalizeDrugMasterSourceUrl(source.sourceUrl ?? drugMasterSourceUrl);
      } catch (urlError: any) {
        toast.error(urlError.message || '更新元URLを確認してください。');
        return false;
      }
      const sourceUrlReview = reviewDrugMasterSourceUrl(normalizedSourceUrl);
      const sourceUrlReviewLabel = formatDrugMasterSourceUrlReview(sourceUrlReview);

      const sourceBytes = new Uint8Array(source.sourceBuffer);
      const zipExtraction = isDrugMasterZipUpload(source.sourceFileName, sourceBytes)
        ? await extractDrugMasterCsvFromZip(sourceBytes)
        : null;
      const csvBuffer = zipExtraction
        ? zipExtraction.csvBytes.buffer.slice(
          zipExtraction.csvBytes.byteOffset,
          zipExtraction.csvBytes.byteOffset + zipExtraction.csvBytes.byteLength
        ) as ArrayBuffer
        : source.sourceBuffer;
      const sourceFileType = zipExtraction ? 'zip' : 'csv';
      const sourceExtractionLabel = zipExtraction
        ? `ZIP展開 ${zipExtraction.csvFileName}（CSV候補 ${zipExtraction.csvEntryCount}件 / ZIP内 ${zipExtraction.entryCount}ファイル）`
        : 'CSV直接';
      const uint8Array = new Uint8Array(csvBuffer);

      const unicodeArray = encoding.convert(uint8Array, {
        to: 'UNICODE',
        from: 'SJIS'
      });

      const csvText = encoding.codeToString(unicodeArray as number[]);
      const parsedMasterCsv = parseDrugMasterUpdateCsv(csvText, { today: new Date() });
      const parseError = parsedMasterCsv.issues.find((issue: any) => issue.severity === 'error');
      if (parseError) {
        toast.error(parseError.message);
        return false;
      }
      if (parsedMasterCsv.rows.length === 0) {
        toast.error('医薬品マスターCSVに取り込める薬品行がありません。');
        return false;
      }

      // 薬価の版に付ける適用開始日。行の「変更年月日」(項番30) を使う。
      // 列が無い / 空の行は取込日で代用する。
      const importedOn = new Date().toISOString().slice(0, 10);
      let priceRevisionFromChangeDate = 0;
      let priceRevisionFromImportDate = 0;

      let updatedCount = 0;
      let newCount = 0;
      let abolishedCount = 0;

      const layoutLabel = formatDrugMasterCsvLayoutLabel(parsedMasterCsv.layout);
      const columnDefinitionReview = buildDrugMasterColumnDefinitionReview(parsedMasterCsv.layout, parsedMasterCsv.maxColumnCount);
      const columnDefinitionReviewLabel = formatDrugMasterColumnDefinitionReview(columnDefinitionReview);
      if (!columnDefinitionReview.ok) {
        toast.error(`医薬品マスターCSVの列定義を確認できません。${columnDefinitionReviewLabel}`);
        return false;
      }
      const specificationRevisionReview = buildDrugMasterSpecificationRevisionReview();
      const specificationRevisionReviewLabel = formatDrugMasterSpecificationRevisionReview(specificationRevisionReview);
      if (!specificationRevisionReview.ok) {
        toast.error(`医薬品マスターの仕様PDF版チェックを確認できません。${specificationRevisionReviewLabel}`);
        return false;
      }
      const warningIssues = parsedMasterCsv.issues.filter((issue: any) => issue.severity === 'warning');
      if (warningIssues.length > 0) {
        toast.warning(`医薬品マスターCSVの一部行を確認してください（${warningIssues.length}件）。${warningIssues[0].message}`);
      }
      const sourceEvidence = await buildDrugMasterSourceEvidence({
        sourceFileName: source.sourceFileName,
        sourceFileType,
        extractedCsvFileName: zipExtraction?.csvFileName,
        archiveEntryCount: zipExtraction?.entryCount,
        csvEntryCount: zipExtraction?.csvEntryCount,
        sourceUrl: normalizedSourceUrl,
        fileSizeBytes: source.sourceSizeBytes,
        arrayBuffer: source.sourceBuffer,
        capturedAt: new Date(),
        layoutLabel,
        rowCount: parsedMasterCsv.rows.length,
        skippedRowCount: parsedMasterCsv.skippedRowCount,
        sourceUrlReviewLabel,
        specificationRevisionLabel: specificationRevisionReviewLabel,
        specificationSourceUrl: DRUG_MASTER_SPECIFICATION_SOURCE.url
      });
      const codes = new Set(parsedMasterCsv.rows.map((row: any) => String(row.code)));

      const existingDrugsMap = await db.drugs.findByIds(Array.from(codes)).exec();
      const beforeRows: Partial<Drug>[] = Array.from(existingDrugsMap.values()).map((existingDrugDoc) => ({
        code: existingDrugDoc.code,
        name: existingDrugDoc.name,
        yjCode: existingDrugDoc.yjCode,
        isGeneric: existingDrugDoc.isGeneric,
        genericName: existingDrugDoc.genericName,
        isAbolished: existingDrugDoc.isAbolished,
        price: existingDrugDoc.price,
        priceHistory: existingDrugDoc.priceHistory,
        stockQuantity: existingDrugDoc.stockQuantity,
        location: existingDrugDoc.location,
        isNarcotic: existingDrugDoc.isNarcotic,
        isPsychotropic: existingDrugDoc.isPsychotropic,
        isPoisonous: existingDrugDoc.isPoisonous,
        isHighRisk: existingDrugDoc.isHighRisk,
        documentUrl: existingDrugDoc.documentUrl
      }));

      const bulkUpsertMap = new Map<string, Drug>();
      const genericMakers = ['東和', '日医工', '沢井', 'サワイ', 'トーワ', 'タイヨー', '武田テバ', 'サンド', 'マイラン', 'あすか', '杏林', '高田', 'タカタ', 'ファイファイ', '明治', 'アメル', '大興', 'ケミファ', 'JG'];

      for (let i = 0; i < parsedMasterCsv.rows.length; i++) {
        const { code, name, price, yjCode, isAbolished, changeDate } = parsedMasterCsv.rows[i];
        const priceEffectiveFrom = changeDate || importedOn;

        let targetDoc: Drug | null;
        if (bulkUpsertMap.has(code)) {
            targetDoc = bulkUpsertMap.get(code) || null;
        } else {
            const existingDrugDoc = existingDrugsMap.get(code);
            targetDoc = existingDrugDoc ? {
                code: existingDrugDoc.code,
                name: existingDrugDoc.name,
                yjCode: existingDrugDoc.yjCode,
                isGeneric: existingDrugDoc.isGeneric,
                genericName: existingDrugDoc.genericName,
                isAbolished: existingDrugDoc.isAbolished,
                price: existingDrugDoc.price,
                priceHistory: existingDrugDoc.priceHistory,
                stockQuantity: existingDrugDoc.stockQuantity,
                location: existingDrugDoc.location,
                isNarcotic: existingDrugDoc.isNarcotic,
                isPsychotropic: existingDrugDoc.isPsychotropic,
                isPoisonous: existingDrugDoc.isPoisonous,
                isHighRisk: existingDrugDoc.isHighRisk,
                documentUrl: existingDrugDoc.documentUrl
            } : null;
        }

        if (targetDoc) {
          // 薬価が変わったら現在薬価を上書きするだけでなく、適用開始日つきの版を積む。
          // 版が無いと、改定後の取込で過去の調剤分まで新薬価で再計算されてしまう。
          const priceRevisionNeeded = isDrugPriceRevisionNeeded(targetDoc, price, priceEffectiveFrom);
          if (priceRevisionNeeded) {
            if (changeDate) {
              priceRevisionFromChangeDate++;
            } else {
              priceRevisionFromImportDate++;
            }
          }
          const priceHistory = priceRevisionNeeded
            ? appendDrugPriceRevision(targetDoc.priceHistory, {
                price: price as number,
                effectiveFrom: priceEffectiveFrom
              })
            : targetDoc.priceHistory;

          bulkUpsertMap.set(code, {
            ...targetDoc,
            name: name || targetDoc.name,
            yjCode: yjCode || targetDoc.yjCode,
            isAbolished: isAbolished,
            price: price ?? targetDoc.price,
            ...(priceHistory && priceHistory.length > 0 ? { priceHistory } : {})
          });
        } else {
          const isGeneric = name.includes('【般】') || name.startsWith('般）') || name.startsWith('【般】') || Boolean(yjCode && yjCode.length >= 12 && (yjCode.charAt(11) === '2' || yjCode.charAt(11) === '3' || yjCode.charAt(11) === '4')) || genericMakers.some(maker => name.includes(`「${maker}」`) || name.includes(`(${maker})`));
          const genericName = name.replace(/「.*?」|（.*?）/g, '').replace(/【般】/g, '').trim();

          bulkUpsertMap.set(code, {
            code,
            name: name || '不明な薬品',
            yjCode: yjCode || '',
            isGeneric: isGeneric,
            genericName: genericName || name || '',
            isAbolished: isAbolished,
            price: price
          });
        }
      }

      const afterRows = Array.from(bulkUpsertMap.values());
      const artifacts = buildDrugMasterUpdateArtifacts({
        sourceFileName: source.sourceFileName,
        beforeRows,
        afterRows,
        createdAt: new Date(),
        sourceEvidence
      });
      newCount = artifacts.summary.newCount;
      updatedCount = artifacts.summary.updatedCount;
      abolishedCount = artifacts.summary.abolishedCount;

      const upsertResult = await db.drugs.bulkUpsert(afterRows);
      if (upsertResult.error.length > 0) {
        console.error('Failed to upsert some drug master records:', upsertResult.error);
        throw new Error(`${upsertResult.error.length}件の薬品マスタ更新に失敗しました。`);
      }

      const diffCsvFileName = makeDrugMasterDiffCsvFileName(artifacts.versionId);
      const rollbackFileName = makeDrugMasterRollbackFileName(artifacts.versionId);
      downloadTextFile(diffCsvFileName, `\ufeff${buildDrugMasterDiffCsv(artifacts)}`, 'text/csv;charset=utf-8');
      downloadTextFile(rollbackFileName, JSON.stringify(artifacts.rollback, null, 2), 'application/json;charset=utf-8');

      await logAuditAction(
        db,
        'drug_master_update',
        `支払基金マスタ同期: 支払基金の最新医薬品マスターCSVからマスタを更新しました（版: ${artifacts.versionId}, 入力: ${sourceExtractionLabel}, 列定義: ${layoutLabel}, 列定義照合: ${columnDefinitionReviewLabel}, 仕様PDF版: ${specificationRevisionReviewLabel}, 公式URL確認: ${sourceUrlReviewLabel}, 取込行: ${parsedMasterCsv.rows.length}件, スキップ: ${parsedMasterCsv.skippedRowCount}件, 新規: ${newCount}件, 更新: ${updatedCount}件, 廃止: ${abolishedCount}件, 薬価改定: ${priceRevisionFromChangeDate + priceRevisionFromImportDate}件（変更年月日 ${priceRevisionFromChangeDate}件 / 取込日で代用 ${priceRevisionFromImportDate}件）, ファイルサイズ: ${sourceEvidence.fileSizeBytes} bytes, SHA-256: ${sourceEvidence.sha256}, 更新元URL: ${sourceEvidence.sourceUrl || '未入力'}）。差分CSV ${diffCsvFileName} とロールバックJSON ${rollbackFileName} を書き出しました。`
      );

      if (refreshAuditEvidence) {
        await refreshAuditEvidence();
      }

      toast.success(`更新完了（版 ${artifacts.versionId} / ${sourceExtractionLabel} / ${layoutLabel} / 列定義照合OK / 仕様PDF版OK / SHA-256記録済み）: 新規 ${newCount}件, 更新 ${updatedCount}件, 廃止 ${abolishedCount}件`);
      return true;
    } catch (error: any) {
      console.error('Failed to upload drug master securely:', error);
      toast.error(error?.message || 'マスタの更新に失敗しました。');
      return false;
    }
  };

  const handleUpload = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!file) return;

    setIsUploading(true);
    try {
      const sourceBuffer = await file.arrayBuffer();
      const ok = await importDrugMasterFromSource({
        sourceFileName: file.name,
        sourceBuffer,
        sourceSizeBytes: file.size,
        sourceUrl: drugMasterSourceUrl
      });
      if (!ok) return;
      setFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const decodeDrugMasterHeader = (value: string | null): string => {
    if (!value) return '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };

  const handleImportDrugMasterFromSourceUrl = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!drugMasterSourceUrl.trim()) {
      toast.error('更新元URLを入力するか、支払基金マスター更新候補を選択してください。');
      return;
    }
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsImportingDrugMasterFromUrl(true);
    try {
      const response = await fetch(`/api/drug-master/official-file?url=${encodeURIComponent(drugMasterSourceUrl.trim())}`, { method: 'GET' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(payload.message || '公式ファイルを取得できませんでした。');
      }

      const sourceBuffer = await response.arrayBuffer();
      const sourceUrl = decodeDrugMasterHeader(response.headers.get('x-yakureki-source-url')) || drugMasterSourceUrl.trim();
      const sourceFileName = decodeDrugMasterHeader(response.headers.get('x-yakureki-file-name'))
        || sourceUrl.split('/').pop()
        || 'drug_master.csv';
      const ok = await importDrugMasterFromSource({
        sourceFileName,
        sourceBuffer,
        sourceSizeBytes: sourceBuffer.byteLength,
        sourceUrl
      });
      if (ok) {
        setDrugMasterSourceUrl(sourceUrl);
      }
    } catch (error: any) {
      toast.error(error?.message || '公式ファイルを取得して更新できませんでした。');
    } finally {
      setIsImportingDrugMasterFromUrl(false);
    }
  };

  const handleApplyDrugMasterRollback = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }
    if (!rollbackFile) {
      toast.error('ロールバックJSONを選択してください。');
      return;
    }

    setIsRollingBackDrugMaster(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await rollbackFile.text());
      } catch (error) {
        toast.error('ロールバックJSONを読み取れませんでした。');
        return;
      }

      const validation = validateDrugMasterRollbackPayload(parsed);
      if (!validation.ok) {
        toast.error(validation.reason);
        return;
      }

      const payload = validation.payload;
      const confirmed = window.confirm(
        `医薬品マスターを版 ${payload.versionId} の更新前へ戻します。\n復元: ${payload.restoreRows.length}件 / 追加分の削除: ${payload.deleteCodes.length}件\n実行しますか？`
      );
      if (!confirmed) return;

      if (payload.restoreRows.length > 0) {
        const restoreResult = await db.drugs.bulkUpsert(payload.restoreRows);
        if (restoreResult.error.length > 0) {
          console.error('Failed to restore some drug master rollback records:', restoreResult.error);
          throw new Error(`${restoreResult.error.length}件の薬品マスター復元に失敗しました。`);
        }
      }

      let deletedCount = 0;
      for (const code of payload.deleteCodes) {
        const doc = await db.drugs.findOne(code).exec();
        if (doc) {
          await doc.remove();
          deletedCount++;
        }
      }

      await logAuditAction(
        db,
        'drug_master_update',
        `医薬品マスターロールバック: 版 ${payload.versionId}（${payload.sourceFileName}）の更新前へ戻しました（復元: ${payload.restoreRows.length}件, 追加削除: ${deletedCount}件）。`
      );

      if (refreshAuditEvidence) {
        await refreshAuditEvidence();
      }

      toast.success(`医薬品マスターを版 ${payload.versionId} の更新前へ戻しました。`);
      setRollbackFile(null);
    } catch (error: any) {
      console.error('Failed to rollback drug master securely:', error);
      toast.error(`医薬品マスターのロールバックに失敗しました: ${error.message || error}`);
    } finally {
      setIsRollingBackDrugMaster(false);
    }
  };

  const handleScanDrugDuplicates = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!db) {
      toast.error('データベースの初期化が完了していません。');
      return;
    }

    setIsScanningDrugDuplicates(true);
    setDrugDuplicateMessage('');
    setDrugMergeReview(null);
    try {
      const [drugDocs, stockDocs, itemDocs] = await Promise.all([
        db.drugs.find().exec(),
        db.drug_stocks.find().exec(),
        db.prescription_items.find().exec()
      ]);
      const drugs = drugDocs.map((doc) => ({
        code: doc.get('code') as string,
        name: doc.get('name') as string,
        yjCode: doc.get('yjCode') as string | undefined,
        isGeneric: !!doc.get('isGeneric'),
        genericName: doc.get('genericName') as string | undefined,
        isAbolished: doc.get('isAbolished') as boolean | undefined,
        price: doc.get('price') as number | undefined,
        stockQuantity: doc.get('stockQuantity') as number | undefined,
        location: doc.get('location') as string | undefined
      } as Drug));
      const usage = buildDrugUsageStats({
        stocks: stockDocs.map((doc) => ({ drugCode: doc.get('drugCode') as string })),
        prescriptionItems: itemDocs.map((doc) => ({
          drugId: doc.get('drugId') as string,
          dispensedDrugCode: doc.get('dispensedDrugCode') as string | undefined
        }))
      });
      const report = findDuplicateDrugGroups(drugs, usage);
      setDrugDuplicateReport(report);
      setDrugMergeTargets(Object.fromEntries(
        report.groups.map((group) => [group.groupId, group.suggestedTargetCode])
      ));
      setDrugDuplicateMessage(report.groups.length === 0
        ? `統合が必要な重複候補はありません（対象 ${report.scannedDrugCount.toLocaleString('ja-JP')}件。店舗未使用のマスタ由来重複 ${report.inactiveGroupCount}グループは対象外）。`
        : `統合候補 ${report.groups.length}グループ・${report.duplicateDrugCount}件が見つかりました。残す薬品を選び、統合確認へ進んでください。`);
      await logAuditAction(db, 'drug_master_update', buildDrugDuplicateScanAuditDetail(report));
    } catch (error) {
      console.error('Failed to scan duplicate drugs:', error);
      setDrugDuplicateReport(null);
      toast.error('薬品重複点検に失敗しました。');
    } finally {
      setIsScanningDrugDuplicates(false);
    }
  };

  const openDrugMergeReview = async (group: DrugDuplicateGroup, sourceCode: string) => {
    if (!db) return;
    const targetCode = drugMergeTargets[group.groupId] || group.suggestedTargetCode;
    if (targetCode === sourceCode) {
      setDrugDuplicateMessage('残す薬品と統合元が同じです。残す薬品を選び直してください。');
      return;
    }

    try {
      const [targetDoc, sourceDoc, prescribedItemDocs, dispensedItemDocs, sourceStockDocs, templateDocs, guidanceDocs] = await Promise.all([
        db.drugs.findOne(targetCode).exec(),
        db.drugs.findOne(sourceCode).exec(),
        db.prescription_items.find({ selector: { drugId: sourceCode } }).exec(),
        db.prescription_items.find({ selector: { dispensedDrugCode: sourceCode } }).exec(),
        db.drug_stocks.find({ selector: { drugCode: sourceCode } }).exec(),
        db.patient_medication_info_templates.find({ selector: { drugCode: sourceCode } }).exec(),
        db.medication_guidances.find({ selector: { drugCode: sourceCode } }).exec()
      ]);
      if (!targetDoc || !sourceDoc) {
        setDrugDuplicateMessage('対象薬品を読み込めませんでした。もう一度「重複候補を確認」を実行してください。');
        return;
      }
      const sourceItemRefs: DrugMergeItemRef[] = [
        ...prescribedItemDocs.map((doc) => ({ itemId: doc.get('itemId') as string, field: 'drugId' as const })),
        ...dispensedItemDocs.map((doc) => ({ itemId: doc.get('itemId') as string, field: 'dispensedDrugCode' as const }))
      ];
      const plan = buildDrugMergePlan({
        targetDrug: targetDoc.toJSON() as Drug,
        sourceDrug: sourceDoc.toJSON() as Drug,
        sourceItemRefs,
        sourceStockIds: sourceStockDocs.map((doc) => doc.get('id') as string),
        sourceTemplateCount: templateDocs.length,
        sourceGuidanceCount: guidanceDocs.length
      });
      setDrugMergeReview({
        groupId: group.groupId,
        sourceCode,
        plan,
        executionPlan: buildDrugMergeExecutionPlan(plan)
      });
      setDrugDuplicateMessage('');
    } catch (error) {
      console.error('Failed to build drug merge review:', error);
      setDrugMergeReview(null);
      setDrugDuplicateMessage('統合確認を作れませんでした。候補を選び直してください。');
    }
  };

  const handleApplyDrugMerge = async () => {
    if (!ensurePermission('update_drug_master')) return;
    if (!db || !drugMergeReview) return;
    const { plan, executionPlan } = drugMergeReview;
    if (!executionPlan.canApply) {
      setDrugDuplicateMessage('統合前の確認事項を見直してください。');
      return;
    }
    if (!window.confirm('統合元薬品を削除し、在庫ロットと処方参照を残す薬品へ付け替えます。実行しますか？')) {
      return;
    }

    const store = createRxdbDrugMergeExecutionStore(db);
    setIsApplyingDrugMerge(true);
    try {
      const result = await applyDrugMergeExecutionPlan(store, executionPlan);
      await logAuditAction(
        db,
        'drug_master_update',
        `薬品統合実行: ${plan.summary}。${result.auditDetail}`
      );
      setDrugMergeReview(null);
      toast.success('薬品統合を実行しました。');
      await handleScanDrugDuplicates();
    } catch (error: any) {
      console.error('Failed to apply drug merge:', error);
      if (error instanceof DrugMergeExecutionError && error.rollbackOperations.length > 0) {
        try {
          for (const operation of error.rollbackOperations) {
            await applyDrugMergeOperation(store, operation);
          }
          setDrugDuplicateMessage('薬品統合に失敗したため、適用済みの操作を取り消しました。候補を確認し直してください。');
        } catch (rollbackError) {
          console.error('Failed to rollback drug merge:', rollbackError);
          setDrugDuplicateMessage('薬品統合に失敗し、取り消しにも失敗しました。監査ログと薬品マスタを確認してください。');
        }
      } else {
        setDrugDuplicateMessage('薬品統合を実行できませんでした。候補を確認し直してください。');
      }
      toast.error('薬品統合に失敗しました。');
    } finally {
      setIsApplyingDrugMerge(false);
    }
  };

  return {
    currentUser,
    canUpdateDrugMaster,
    isMedicalInstSyncOpen,
    setIsMedicalInstSyncOpen,
    handleFileChange,
    isUploading,
    isImportingDrugMasterFromUrl,
    file,
    drugMasterSourceUrl,
    setDrugMasterSourceUrl,
    handleFetchDrugMasterOfficialPage,
    isFetchingDrugMasterOfficialPage,
    drugMasterOfficialPageHtml,
    setDrugMasterOfficialPageHtml,
    handleExtractDrugMasterCandidates,
    drugMasterCandidateMessage,
    drugMasterCandidates,
    handleSelectDrugMasterCandidate,
    drugMasterSpecPdfText,
    setDrugMasterSpecPdfText,
    setDrugMasterSpecPdfReview,
    setDrugMasterSpecPdfReviewLabel,
    isFetchingDrugMasterSpecPdf,
    handleFetchDrugMasterSpecPdf,
    handleReviewDrugMasterSpecPdfText,
    drugMasterSpecPdfReviewLabel,
    drugMasterSpecPdfReview,
    canImportDrugMasterFromSourceUrl,
    handleImportDrugMasterFromSourceUrl,
    handleUpload,
    rollbackFile,
    handleDrugMasterRollbackFileChange,
    isRollingBackDrugMaster,
    handleApplyDrugMasterRollback,
    handleScanDrugDuplicates,
    isScanningDrugDuplicates,
    drugDuplicateMessage,
    drugDuplicateReport,
    drugMergeTargets,
    setDrugMergeTargets,
    setDrugMergeReview,
    openDrugMergeReview,
    isApplyingDrugMerge,
    drugMergeReview,
    handleApplyDrugMerge
  };
}
