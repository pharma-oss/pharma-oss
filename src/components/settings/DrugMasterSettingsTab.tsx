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
  handleApplyDrugMerge
}: DrugMasterSettingsTabProps) {
  return (
        <>
          <div className="settings-section glass" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            style={{
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)'
            }}
          >
            <div className="form-group">
              <label htmlFor="drug-master-official-page-html">支払基金ページHTML</label>
              <div className="actions" style={{ margin: '0 0 0.5rem' }}>
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
                style={{ resize: 'vertical', minHeight: '96px' }}
              />
            </div>
            <div className="actions" style={{ marginTop: '0.5rem' }}>
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
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: '0.65rem',
                  marginTop: '0.85rem'
                }}
              >
                {drugMasterCandidates.map((candidate) => (
                  <button
                    key={`${candidate.kind}-${candidate.url}`}
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleSelectDrugMasterCandidate(candidate)}
                    disabled={isUploading || isImportingDrugMasterFromUrl}
                    style={{
                      justifyContent: 'flex-start',
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      padding: '0.7rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                      minHeight: '96px'
                    }}
                  >
                    <span style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                      {drugMasterCandidateKindLabel[candidate.kind]} {candidate.fileType || ''}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm)', lineHeight: 1.4 }}>
                      {candidate.title}
                    </span>
                    <span style={{ color: 'var(--text-ghost)', fontSize: 'var(--fs-xs)', lineHeight: 1.35 }}>
                      {[candidate.updateDate, candidate.sizeLabel].filter(Boolean).join(' / ') || '日付・サイズ未記載'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section
            aria-label="医薬品マスター仕様PDF本文照合"
            style={{
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border)'
            }}
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
                style={{ resize: 'vertical', minHeight: '96px' }}
              />
            </div>
            <div className="actions" style={{ marginTop: '0.5rem', alignItems: 'center' }}>
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
                  className="help-text"
                  style={{
                    color: drugMasterSpecPdfReview?.ok ? 'var(--success)' : 'var(--warning)',
                    fontWeight: 700
                  }}
                >
                  {drugMasterSpecPdfReviewLabel}
                </span>
              )}
            </div>
            {drugMasterSpecPdfReview && !drugMasterSpecPdfReview.ok && (
              <div style={{
                display: 'grid',
                gap: '0.35rem',
                marginTop: '0.75rem',
                color: 'var(--text-muted)',
                fontSize: 'var(--fs-sm)'
              }}>
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
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.25rem',
              borderTop: '1px solid var(--border)'
            }}
          >
            <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem' }}>医薬品マスターロールバック</h3>
            <p className="section-desc" style={{ marginBottom: '1rem' }}>
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
            style={{ padding: '1.2rem 0 0', marginTop: '1.2rem', borderTop: '1px solid var(--border)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
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
              <div style={{ display: 'grid', gap: '0.85rem' }}>
                {drugDuplicateReport.groups.slice(0, 50).map((group) => {
                  const targetCode = drugMergeTargets[group.groupId] || group.suggestedTargetCode;
                  return (
                    <div key={group.groupId} style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        <strong>{group.displayName}</strong>
                        <span className="help-text">{group.matchLabel} / {group.members.length}件</span>
                        {group.hasYjConflict && (
                          <span className="help-text" style={{ color: 'var(--danger)' }}>
                            YJコードが異なるため統合不可（別薬品の可能性）
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'grid', gap: '0.45rem' }}>
                        {group.members.map((member) => (
                          <div key={member.code} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
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
                            <span style={{ minWidth: '13rem' }}>{member.name}{member.isAbolished ? '（廃止）' : ''}</span>
                            <span className="help-text">コード {member.code}{member.yjCode ? ` / YJ ${member.yjCode}` : ''}</span>
                            <span className="help-text">在庫 {member.stockQuantity}（ロット{member.stockLotCount}件） / 処方参照 {member.prescriptionItemCount}件{member.location ? ` / 棚 ${member.location}` : ''}</span>
                            {member.code !== targetCode && (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: '0.25rem 0.6rem', fontSize: 'var(--fs-sm)' }}
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
                        <div style={{ marginTop: '0.7rem', padding: '0.7rem', borderRadius: '8px', background: 'var(--bg-subtle)' }} data-testid="drug-duplicate-merge-review">
                          <strong style={{ display: 'block', marginBottom: '0.35rem' }}>統合内容の確認</strong>
                          <p className="help-text">{drugMergeReview.plan.summary}</p>
                          {drugMergeReview.plan.issues.length > 0 && (
                            <ul className="help-text" style={{ margin: '0.35rem 0 0 1rem' }}>
                              {drugMergeReview.plan.issues.map((issue) => (
                                <li key={issue.code}>{issue.severity === 'error' ? '統合不可: ' : '確認: '}{issue.message}</li>
                              ))}
                            </ul>
                          )}
                          {drugMergeReview.plan.conflicts.length > 0 && (
                            <ul className="help-text" style={{ margin: '0.35rem 0 0 1rem' }}>
                              {drugMergeReview.plan.conflicts.map((conflict) => (
                                <li key={conflict.field}>{conflict.label}: 統合元「{conflict.sourceValue}」→ 残す値「{conflict.targetValue}」</li>
                              ))}
                            </ul>
                          )}
                          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.6rem' }}>
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
        </div>
      </>
  );
}
