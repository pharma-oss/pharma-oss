import React from 'react';
import { UploadCloud, CheckCircle, Loader2, FileText, Search, Download, RefreshCw } from 'lucide-react';
import { User } from '@/db/types';
import { MedicalInstitutionMasterSyncModal } from '@/components/MedicalInstitutionMasterSyncModal';
import { getPermissionDeniedMessage } from '@/lib/audit';
import type { DrugMasterOfficialDownloadCandidate } from '@/lib/drug_master_provenance';
import type { DrugMasterSpecificationPdfDiffReview } from '@/lib/drug_master_spec_pdf';
import { drugMasterCandidateKindLabel, drugMasterSpecPdfDiffFieldLabel } from '@/lib/drug_master_update_ui';
import type { DrugDuplicateGroup, DrugDuplicateScanReport } from '@/lib/drug_duplicate_review';
import type { DrugMergeExecutionPlan, DrugMergePlan } from '@/lib/drug_merge';
import { formatDrugPriceRevisionLabel } from '@/lib/drug_price_history';
import type {
  DrugPriceHistoryDraftRow,
  DrugPriceHistoryEditPlan
} from '@/lib/drug_price_history_edit';

interface DrugMasterSettingsTabProps {
  currentUser: User;
  canUpdateDrugMaster: boolean;
  isMedicalInstSyncOpen: boolean;
  setIsMedicalInstSyncOpen: (open: boolean) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
  isImportingDrugMasterFromUrl: boolean;
  file: File | null;
  drugMasterSourceUrl: string;
  setDrugMasterSourceUrl: (value: string) => void;
  handleFetchDrugMasterOfficialPage: () => Promise<void>;
  isFetchingDrugMasterOfficialPage: boolean;
  drugMasterOfficialPageHtml: string;
  setDrugMasterOfficialPageHtml: (value: string) => void;
  handleExtractDrugMasterCandidates: () => void;
  drugMasterCandidateMessage: string;
  drugMasterCandidates: DrugMasterOfficialDownloadCandidate[];
  handleSelectDrugMasterCandidate: (candidate: DrugMasterOfficialDownloadCandidate) => void;
  drugMasterSpecPdfText: string;
  setDrugMasterSpecPdfText: (value: string) => void;
  setDrugMasterSpecPdfReview: (value: DrugMasterSpecificationPdfDiffReview | null) => void;
  setDrugMasterSpecPdfReviewLabel: (value: string) => void;
  isFetchingDrugMasterSpecPdf: boolean;
  handleFetchDrugMasterSpecPdf: () => Promise<void>;
  handleReviewDrugMasterSpecPdfText: () => void;
  drugMasterSpecPdfReviewLabel: string;
  drugMasterSpecPdfReview: DrugMasterSpecificationPdfDiffReview | null;
  canImportDrugMasterFromSourceUrl: boolean;
  handleImportDrugMasterFromSourceUrl: () => Promise<void>;
  handleUpload: () => Promise<void>;
  rollbackFile: File | null;
  handleDrugMasterRollbackFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isRollingBackDrugMaster: boolean;
  handleApplyDrugMasterRollback: () => Promise<void>;
  handleScanDrugDuplicates: () => Promise<void>;
  isScanningDrugDuplicates: boolean;
  drugDuplicateMessage: string;
  drugDuplicateReport: DrugDuplicateScanReport | null;
  drugMergeTargets: Record<string, string>;
  setDrugMergeTargets: (updater: (current: Record<string, string>) => Record<string, string>) => void;
  setDrugMergeReview: (value: {
    groupId: string;
    sourceCode: string;
    plan: DrugMergePlan;
    executionPlan: DrugMergeExecutionPlan;
  } | null) => void;
  openDrugMergeReview: (group: DrugDuplicateGroup, sourceCode: string) => Promise<void>;
  isApplyingDrugMerge: boolean;
  priceHistoryQuery: string;
  setPriceHistoryQuery: (value: string) => void;
  handleSearchDrugForPriceHistory: () => Promise<void>;
  priceHistoryCandidates: { code: string; name: string; price?: number; revisionCount: number }[];
  handleSelectDrugForPriceHistory: (drugCode: string) => Promise<void>;
  closeDrugPriceHistoryEditor: () => void;
  priceHistoryDrug: { code: string; name: string; price?: number } | null;
  priceHistoryDraft: DrugPriceHistoryDraftRow[];
  updateDrugPriceHistoryRow: (rowIndex: number, field: keyof DrugPriceHistoryDraftRow, value: string) => void;
  addDrugPriceHistoryRow: () => void;
  removeDrugPriceHistoryRow: (rowIndex: number) => void;
  resetDrugPriceHistoryDraft: () => void;
  drugPriceHistoryPlan: DrugPriceHistoryEditPlan | null;
  priceHistoryMessage: string;
  isLoadingPriceHistory: boolean;
  isApplyingPriceHistory: boolean;
  handleApplyDrugPriceHistoryEdit: () => Promise<void>;
  drugMergeReview: {
    groupId: string;
    sourceCode: string;
    plan: DrugMergePlan;
    executionPlan: DrugMergeExecutionPlan;
  } | null;
  handleApplyDrugMerge: () => Promise<void>;
}

export default function DrugMasterSettingsTab({
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
  handleApplyDrugMerge,
  priceHistoryQuery,
  setPriceHistoryQuery,
  handleSearchDrugForPriceHistory,
  priceHistoryCandidates,
  handleSelectDrugForPriceHistory,
  closeDrugPriceHistoryEditor,
  priceHistoryDrug,
  priceHistoryDraft,
  updateDrugPriceHistoryRow,
  addDrugPriceHistoryRow,
  removeDrugPriceHistoryRow,
  resetDrugPriceHistoryDraft,
  drugPriceHistoryPlan,
  priceHistoryMessage,
  isLoadingPriceHistory,
  isApplyingPriceHistory,
  handleApplyDrugPriceHistoryEdit
}: DrugMasterSettingsTabProps) {
  return (
        <>
          <div className="settings-section glass med-inst-header">
            <div className="med-inst-content">
              <div>
                <h2>公式医療機関マスタ同期</h2>
                <p className="section-desc">厚生労働省・支払基金の公式医療機関コードマスタ（CSV/JSON）をインポートして補完用データベースを更新します。</p>
              </div>
              <button
                type="button"
                className="btn-primary flex-center gap-1"
                onClick={() => setIsMedicalInstSyncOpen(true)}
              >
                <RefreshCw size={16} />
                <span>医療機関マスタ同期モーダルを開く</span>
              </button>
            </div>
          </div>

          <MedicalInstitutionMasterSyncModal
            isOpen={isMedicalInstSyncOpen}
            onClose={() => setIsMedicalInstSyncOpen(false)}
          />

          <div className="settings-section glass">
            <h2>医薬品マスタ更新</h2>
          <p className="section-desc">支払基金からダウンロードした医薬品マスター（CSV・ZIP）をアップロードしてマスタを更新します。</p>

          <div className="upload-area">
            <label className="file-input-label">
              <UploadCloud size={24} className="upload-icon" aria-hidden="true" />
              <span>ファイルを選択 (CSV/ZIP)</span>
              <input
                type="file"
                accept=".csv,.zip"
                onChange={handleFileChange}
                className="hidden-input"
                aria-label="医薬品マスタCSVまたはZIPファイルをアップロード"
                disabled={isUploading || isImportingDrugMasterFromUrl}
              />
            </label>
            {file && (
              <div className="file-info">
                選択中のファイル: <strong>{file.name}</strong>
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="drug-master-source-url">更新元URL（任意）</label>
            <input
              id="drug-master-source-url"
              type="url"
              value={drugMasterSourceUrl}
              onChange={(e) => setDrugMasterSourceUrl(e.target.value)}
              placeholder="https://www.ssk.or.jp/..."
              disabled={isUploading || isImportingDrugMasterFromUrl}
            />
            <small className="help-text">入力すると監査ログとロールバックJSONに更新元URL、ファイルサイズ、SHA-256を記録します。</small>
          </div>

          <section
            aria-label="支払基金マスター更新候補"
            className="drug-master-section"
          >
            <div className="form-group">
              <label htmlFor="drug-master-official-page-html">支払基金ページHTML</label>
              <div className="actions actions-compact">
                <button
                  className="btn-secondary flex-center gap-2"
                  onClick={handleFetchDrugMasterOfficialPage}
                  disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterOfficialPage}
                  type="button"
                >
                  {isFetchingDrugMasterOfficialPage ? (
                    <Loader2 size={16} className="spin" aria-hidden="true" />
                  ) : (
                    <Download size={16} aria-hidden="true" />
                  )}
                  <span>{isFetchingDrugMasterOfficialPage ? '取得中...' : '公式ページを取得'}</span>
                </button>
              </div>
              <textarea
                id="drug-master-official-page-html"
                value={drugMasterOfficialPageHtml}
                onChange={(e) => setDrugMasterOfficialPageHtml(e.target.value)}
                rows={4}
                placeholder="<a href=&quot;...&quot;>全件ファイル...</a>"
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterOfficialPage}
                className="textarea-code"
              />
            </div>
            <div className="actions actions-spaced">
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExtractDrugMasterCandidates}
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterOfficialPage}
                type="button"
              >
                <Search size={16} aria-hidden="true" />
                <span>更新候補を抽出</span>
              </button>
              {drugMasterCandidateMessage && (
                <span className="help-text">{drugMasterCandidateMessage}</span>
              )}
            </div>
            {drugMasterCandidates.length > 0 && (
              <div
                aria-label="支払基金マスター更新候補一覧"
                className="candidates-grid"
              >
                {drugMasterCandidates.map((candidate) => (
                  <button
                    key={`${candidate.kind}-${candidate.url}`}
                    type="button"
                    className="btn-secondary candidate-card"
                    onClick={() => handleSelectDrugMasterCandidate(candidate)}
                    disabled={isUploading || isImportingDrugMasterFromUrl}
                  >
                    <span className="candidate-title">
                      {drugMasterCandidateKindLabel[candidate.kind]} {candidate.fileType || ''}
                    </span>
                    <span className="candidate-subtitle">
                      {candidate.title}
                    </span>
                    <span className="candidate-meta">
                      {[candidate.updateDate, candidate.sizeLabel].filter(Boolean).join(' / ') || '日付・サイズ未記載'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section
            aria-label="医薬品マスター仕様PDF本文照合"
            className="drug-master-section"
          >
            <div className="form-group">
              <label htmlFor="drug-master-spec-pdf-text">仕様PDF本文</label>
              <textarea
                id="drug-master-spec-pdf-text"
                value={drugMasterSpecPdfText}
                onChange={(e) => {
                  setDrugMasterSpecPdfText(e.target.value);
                  setDrugMasterSpecPdfReview(null);
                  setDrugMasterSpecPdfReviewLabel('');
                }}
                rows={4}
                placeholder="〈医薬品マスター〉 項番 項目名 モード 桁数 バイト数..."
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterSpecPdf}
                className="textarea-code"
              />
            </div>
            <div className="actions actions-aligned">
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleFetchDrugMasterSpecPdf}
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterSpecPdf}
                type="button"
              >
                {isFetchingDrugMasterSpecPdf ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <Download size={16} aria-hidden="true" />
                )}
                <span>{isFetchingDrugMasterSpecPdf ? '取得中...' : '公式PDFを取得して照合'}</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleReviewDrugMasterSpecPdfText}
                disabled={isUploading || isImportingDrugMasterFromUrl || isFetchingDrugMasterSpecPdf}
                type="button"
              >
                <Search size={16} aria-hidden="true" />
                <span>PDF本文を照合</span>
              </button>
              {drugMasterSpecPdfReviewLabel && (
                <span
                  className={`help-text pdf-review-label ${drugMasterSpecPdfReview?.ok ? 'ok' : 'ng'}`}
                >
                  {drugMasterSpecPdfReviewLabel}
                </span>
              )}
            </div>
            {drugMasterSpecPdfReview && !drugMasterSpecPdfReview.ok && (
              <div className="pdf-review-diffs">
                {drugMasterSpecPdfReview.parseIssues.slice(0, 3).map((issue) => (
                  <span key={issue}>読取確認: {issue}</span>
                ))}
                {drugMasterSpecPdfReview.differences.slice(0, 4).map((diff) => (
                  <span key={`${diff.itemNumber}-${diff.field}`}>
                    {diff.itemNumber}番 {drugMasterSpecPdfDiffFieldLabel[diff.field]}: 現在 {diff.expected} / PDF {diff.observed}
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="actions">
            <span
              className="btn-tooltip-wrapper"
              data-disabled={!canImportDrugMasterFromSourceUrl || isUploading || isImportingDrugMasterFromUrl || !canUpdateDrugMaster}
              title={
                !canUpdateDrugMaster
                  ? getPermissionDeniedMessage(currentUser, 'update_drug_master')
                  : !drugMasterSourceUrl.trim()
                    ? '更新元URLを入力するか支払基金のCSV/ZIP候補を選択してください'
                    : !canImportDrugMasterFromSourceUrl
                      ? 'URLから直接更新できるのはCSVまたはZIPです'
                      : ''
              }
            >
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleImportDrugMasterFromSourceUrl}
                disabled={!canImportDrugMasterFromSourceUrl || isUploading || isImportingDrugMasterFromUrl || !canUpdateDrugMaster}
                type="button"
              >
                {isImportingDrugMasterFromUrl ? (
                  <Loader2 size={18} className="spin" aria-hidden="true" />
                ) : (
                  <Download size={18} aria-hidden="true" />
                )}
                <span>{isImportingDrugMasterFromUrl ? '取得・更新中...' : '更新元URLから取得して更新'}</span>
              </button>
            </span>
            <span
              className="btn-tooltip-wrapper"
              data-disabled={!file || isUploading || isImportingDrugMasterFromUrl || !canUpdateDrugMaster}
              title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : !file ? '更新を行うにはCSV/ZIPファイルを選択してください' : ''}
            >
              <button
                className="btn-primary"
                onClick={handleUpload}
                disabled={!file || isUploading || isImportingDrugMasterFromUrl || !canUpdateDrugMaster}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={18} className="spin" aria-hidden="true" />
                    更新中...
                  </>
                ) : (
                  'マスタを更新する'
                )}
              </button>
            </span>
          </div>

          <p className="help-text">ヘッダー付きCSVは列名を確認し、ZIPは中のCSVを展開して取り込みます。更新後に差分CSVとロールバックJSONを自動で書き出します。</p>

          <section
            aria-label="医薬品マスターロールバック"
            className="rollback-section"
          >
            <h3 className="rollback-title">医薬品マスターロールバック</h3>
            <p className="section-desc rollback-desc">
              更新時に出力されたロールバックJSONを選択すると、更新前の薬価・YJ・廃止状態へ戻せます。
            </p>

            <div className="upload-area">
              <label className="file-input-label">
                <FileText size={24} className="upload-icon" aria-hidden="true" />
                <span>ロールバックJSONを選択</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleDrugMasterRollbackFileChange}
                  className="hidden-input"
                  aria-label="医薬品マスターロールバックJSONをアップロード"
                />
              </label>
              {rollbackFile && (
                <div className="file-info">
                  選択中のロールバックJSON: <strong>{rollbackFile.name}</strong>
                </div>
              )}
            </div>

            <div className="actions">
              <span
                className="btn-tooltip-wrapper"
                data-disabled={!rollbackFile || isRollingBackDrugMaster || !canUpdateDrugMaster}
                title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : !rollbackFile ? 'ロールバックJSONを選択してください' : ''}
              >
                <button
                  className="btn-secondary flex-center gap-2"
                  onClick={handleApplyDrugMasterRollback}
                  disabled={!rollbackFile || isRollingBackDrugMaster || !canUpdateDrugMaster}
                >
                  {isRollingBackDrugMaster ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <CheckCircle size={18} aria-hidden="true" />}
                  {isRollingBackDrugMaster ? 'ロールバック中...' : 'ロールバックを実行'}
                </button>
              </span>
            </div>
          </section>

          <section
            aria-label="薬品重複点検（マスタ統合）"
            data-testid="drug-duplicate-review-section"
            className="duplicate-section"
          >
            <div className="duplicate-header">
              <div>
                <h3>薬品重複点検（マスタ統合）</h3>
                <p className="help-text">
                  YJコードまたは薬品名が一致する薬品のうち、店舗で使用中（在庫・処方参照・棚番地あり）のものを洗い出します。統合すると在庫ロットと処方参照を「残す薬品」へ付け替え、在庫数を合算し、統合元を削除します（実行は監査ログに残ります）。一般名処方マスタ【般】行とデモ薬品は対象外です。過去に出力したUKE・請求スナップショットは変更しません。
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                onClick={handleScanDrugDuplicates}
                disabled={!canUpdateDrugMaster || isScanningDrugDuplicates}
                title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : undefined}
                data-testid="drug-duplicate-scan-button"
              >
                {isScanningDrugDuplicates ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
                <span>{isScanningDrugDuplicates ? '点検中...' : '重複候補を確認'}</span>
              </button>
            </div>
            {drugDuplicateMessage && <p className="help-text" role="status">{drugDuplicateMessage}</p>}
            {drugDuplicateReport && drugDuplicateReport.groups.length > 50 && (
              <p className="help-text">候補が多いため、使用量の多い先頭50グループのみ表示しています。統合後に再度点検してください。</p>
            )}
            {drugDuplicateReport && drugDuplicateReport.groups.length > 0 && (
              <div className="duplicate-groups-grid">
                {drugDuplicateReport.groups.slice(0, 50).map((group) => {
                  const targetCode = drugMergeTargets[group.groupId] || group.suggestedTargetCode;
                  return (
                    <div key={group.groupId} className="duplicate-group-card">
                      <div className="duplicate-group-header">
                        <strong>{group.displayName}</strong>
                        <span className="help-text">{group.matchLabel} / {group.members.length}件</span>
                        {group.hasYjConflict && (
                          <span className="help-text conflict-warning">
                            YJコードが異なるため統合不可（別薬品の可能性）
                          </span>
                        )}
                      </div>
                      <div className="duplicate-members-list">
                        {group.members.map((member) => (
                          <div key={member.code} className="duplicate-member-row">
                            <label className="member-radio-label">
                              <input
                                type="radio"
                                name={`drug-merge-target-${group.groupId}`}
                                checked={targetCode === member.code}
                                onChange={() => {
                                  setDrugMergeTargets((current) => ({ ...current, [group.groupId]: member.code }));
                                  setDrugMergeReview(null);
                                }}
                              />
                              <span>残す</span>
                            </label>
                            <span className="member-name">{member.name}{member.isAbolished ? '（廃止）' : ''}</span>
                            <span className="help-text">コード {member.code}{member.yjCode ? ` / YJ ${member.yjCode}` : ''}</span>
                            <span className="help-text">在庫 {member.stockQuantity}（ロット{member.stockLotCount}件） / 処方参照 {member.prescriptionItemCount}件{member.location ? ` / 棚 ${member.location}` : ''}</span>
                            {member.code !== targetCode && (
                              <button
                                type="button"
                                className="btn-secondary btn-merge-review"
                                onClick={() => openDrugMergeReview(group, member.code)}
                                disabled={!canUpdateDrugMaster || isApplyingDrugMerge || group.hasYjConflict}
                                title={group.hasYjConflict ? 'YJコードが異なるため統合できません' : undefined}
                              >
                                統合確認
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {drugMergeReview?.groupId === group.groupId && (
                        <div className="merge-review-card" data-testid="drug-duplicate-merge-review">
                          <strong className="merge-review-title">統合内容の確認</strong>
                          <p className="help-text">{drugMergeReview.plan.summary}</p>
                          {drugMergeReview.plan.issues.length > 0 && (
                            <ul className="help-text merge-issues-list">
                              {drugMergeReview.plan.issues.map((issue) => (
                                <li key={issue.code}>{issue.severity === 'error' ? '統合不可: ' : '確認: '}{issue.message}</li>
                              ))}
                            </ul>
                          )}
                          {drugMergeReview.plan.conflicts.length > 0 && (
                            <ul className="help-text merge-issues-list">
                              {drugMergeReview.plan.conflicts.map((conflict) => (
                                <li key={conflict.field}>{conflict.label}: 統合元「{conflict.sourceValue}」→ 残す値「{conflict.targetValue}」</li>
                              ))}
                            </ul>
                          )}
                          <div className="merge-review-actions">
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={handleApplyDrugMerge}
                              disabled={!drugMergeReview.executionPlan.canApply || isApplyingDrugMerge}
                              data-testid="drug-duplicate-merge-apply"
                            >
                              {isApplyingDrugMerge ? '統合中...' : '薬品統合を実行'}
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => setDrugMergeReview(null)} disabled={isApplyingDrugMerge}>
                              閉じる
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section
            aria-label="薬価の版の訂正"
            data-testid="drug-price-history-section"
            className="price-history-section"
          >
            <h3>薬価の版の訂正</h3>
            <p className="help-text">
              薬価の版が乱れたときに直します。レセプトは調剤日時点の薬価で計算するため、版を直すと過去の調剤の薬剤料が変わります。適用開始日を空欄にした版は「開始日不明・最初の改定より前」として扱われ、履歴の先頭に1つだけ置けます。訂正は監査ログに残ります。
            </p>

            <div className="price-history-search">
              <input
                type="search"
                value={priceHistoryQuery}
                onChange={(event) => setPriceHistoryQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSearchDrugForPriceHistory();
                  }
                }}
                placeholder="薬品コードまたは薬品名"
                aria-label="薬価の版を直す薬品を検索"
                data-testid="drug-price-history-query"
                disabled={!canUpdateDrugMaster}
              />
              <button
                type="button"
                className="btn-secondary flex-center gap-2"
                onClick={handleSearchDrugForPriceHistory}
                disabled={!canUpdateDrugMaster || isLoadingPriceHistory}
                title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : undefined}
                data-testid="drug-price-history-search"
              >
                {isLoadingPriceHistory ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
                <span>薬品を検索</span>
              </button>
            </div>

            {priceHistoryMessage && <p className="help-text" role="status">{priceHistoryMessage}</p>}

            {!priceHistoryDrug && priceHistoryCandidates.length > 0 && (
              <ul className="price-history-candidates" data-testid="drug-price-history-candidates">
                {priceHistoryCandidates.map((candidate) => (
                  <li key={candidate.code}>
                    <button type="button" onClick={() => handleSelectDrugForPriceHistory(candidate.code)}>
                      <strong>{candidate.name}</strong>
                      <span className="help-text">
                        {candidate.code} / 現在薬価 {candidate.price ?? '不明'}円 / 版 {candidate.revisionCount}件
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {priceHistoryDrug && drugPriceHistoryPlan && (
              <div className="price-history-editor" data-testid="drug-price-history-editor">
                <div className="price-history-editor-head">
                  <div>
                    <strong>{priceHistoryDrug.name}</strong>
                    <span className="help-text">
                      {priceHistoryDrug.code} / 現在薬価 {drugPriceHistoryPlan.beforeCurrentPrice ?? '不明'}円
                      {drugPriceHistoryPlan.afterCurrentPrice !== drugPriceHistoryPlan.beforeCurrentPrice && (
                        <> → <strong>{drugPriceHistoryPlan.afterCurrentPrice ?? '不明'}円</strong></>
                      )}
                    </span>
                  </div>
                  <button type="button" className="btn-secondary" onClick={closeDrugPriceHistoryEditor}>
                    閉じる
                  </button>
                </div>

                <table className="price-history-table">
                  <thead>
                    <tr>
                      <th scope="col">薬価（円）</th>
                      <th scope="col">適用開始日</th>
                      <th scope="col">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {priceHistoryDraft.length === 0 && (
                      <tr>
                        <td colSpan={3} className="help-text">版がありません。この状態では現在薬価で算定します。</td>
                      </tr>
                    )}
                    {priceHistoryDraft.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        <td>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={row.price}
                            onChange={(event) => updateDrugPriceHistoryRow(rowIndex, 'price', event.target.value)}
                            aria-label={`${rowIndex + 1}行目の薬価`}
                            data-testid={`drug-price-history-price-${rowIndex}`}
                            disabled={!canUpdateDrugMaster}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.effectiveFrom}
                            onChange={(event) => updateDrugPriceHistoryRow(rowIndex, 'effectiveFrom', event.target.value)}
                            placeholder="YYYY-MM-DD（空欄=開始日不明）"
                            aria-label={`${rowIndex + 1}行目の適用開始日`}
                            data-testid={`drug-price-history-date-${rowIndex}`}
                            disabled={!canUpdateDrugMaster}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => removeDrugPriceHistoryRow(rowIndex)}
                            aria-label={`${rowIndex + 1}行目の版を削除`}
                            data-testid={`drug-price-history-remove-${rowIndex}`}
                            disabled={!canUpdateDrugMaster}
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="price-history-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={addDrugPriceHistoryRow}
                    disabled={!canUpdateDrugMaster}
                    data-testid="drug-price-history-add-row"
                  >
                    版を追加
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={resetDrugPriceHistoryDraft}
                    disabled={!canUpdateDrugMaster || !drugPriceHistoryPlan.changed}
                  >
                    編集前に戻す
                  </button>
                </div>

                {drugPriceHistoryPlan.issues.length > 0 && (
                  <ul className="price-history-issues" data-testid="drug-price-history-issues">
                    {drugPriceHistoryPlan.issues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`} className={issue.severity}>
                        {issue.severity === 'error' ? '要修正' : '確認'}: {issue.message}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="help-text" data-testid="drug-price-history-impact-summary">
                  {drugPriceHistoryPlan.changed
                    ? drugPriceHistoryPlan.summary
                    : '訂正内容がありません。'}
                </p>

                {drugPriceHistoryPlan.impact.length > 0 && (
                  <table className="price-history-impact" data-testid="drug-price-history-impact">
                    <thead>
                      <tr>
                        <th scope="col">調剤日</th>
                        <th scope="col">患者</th>
                        <th scope="col">薬価</th>
                        <th scope="col">請求</th>
                      </tr>
                    </thead>
                    <tbody>
                      {drugPriceHistoryPlan.impact.slice(0, 20).map((row) => (
                        <tr key={row.itemId}>
                          <td>{row.dispensingDate || '不明'}</td>
                          <td>{row.patientName || row.visitId}</td>
                          <td>{row.beforePrice ?? '不明'}円 → {row.afterPrice ?? '不明'}円</td>
                          <td>{row.isSubmitted ? `提出済み（${row.claimStatus}）` : '未提出'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {drugPriceHistoryPlan.impact.length > 20 && (
                  <p className="help-text">
                    薬価が変わる調剤は {drugPriceHistoryPlan.impact.length}件です（先頭20件のみ表示）。
                  </p>
                )}

                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleApplyDrugPriceHistoryEdit}
                  disabled={!canUpdateDrugMaster || !drugPriceHistoryPlan.canApply || isApplyingPriceHistory}
                  title={!canUpdateDrugMaster ? getPermissionDeniedMessage(currentUser, 'update_drug_master') : undefined}
                  data-testid="drug-price-history-apply"
                >
                  {isApplyingPriceHistory ? '訂正中...' : '薬価の版を訂正'}
                </button>
              </div>
            )}
          </section>
        </div>

        <style jsx>{`
          .price-history-section {
            margin-top: 1.5rem;
          }
          .price-history-search {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin: 0.75rem 0;
          }
          .price-history-search input {
            flex: 1 1 220px;
            min-width: min(220px, 100%);
          }
          .price-history-candidates {
            list-style: none;
            margin: 0.5rem 0;
            padding: 0;
            display: grid;
            gap: 0.35rem;
          }
          .price-history-candidates button {
            width: 100%;
            text-align: left;
            display: grid;
            gap: 0.15rem;
            padding: 0.5rem 0.6rem;
            border: 1px solid rgba(148, 163, 184, 0.45);
            border-radius: 6px;
            background: transparent;
            cursor: pointer;
          }
          .price-history-editor {
            margin-top: 0.75rem;
            border: 1px solid rgba(148, 163, 184, 0.45);
            border-radius: 8px;
            padding: 0.85rem;
          }
          .price-history-editor-head {
            display: flex;
            flex-wrap: wrap;
            justify-content: space-between;
            align-items: flex-start;
            gap: 0.75rem;
          }
          .price-history-editor-head > div {
            display: grid;
            gap: 0.15rem;
          }
          .price-history-table,
          .price-history-impact {
            width: 100%;
            border-collapse: collapse;
            margin-top: 0.75rem;
            font-size: var(--fs-sm);
          }
          .price-history-table th,
          .price-history-table td,
          .price-history-impact th,
          .price-history-impact td {
            border-bottom: 1px solid rgba(148, 163, 184, 0.3);
            padding: 0.35rem 0.4rem;
            text-align: left;
            vertical-align: middle;
          }
          .price-history-table input {
            width: 100%;
          }
          .price-history-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 0.6rem;
          }
          .price-history-issues {
            list-style: none;
            margin: 0.75rem 0 0;
            padding: 0;
            display: grid;
            gap: 0.3rem;
            font-size: var(--fs-sm);
          }
          .price-history-issues .error {
            color: #b91c1c;
            font-weight: 600;
          }
          .price-history-issues .warning {
            color: #b45309;
          }
          .price-history-impact {
            overflow-x: auto;
            display: block;
          }
        `}</style>
      </>
  );
}
