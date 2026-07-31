import React from 'react';
import { ShieldCheck, AlertTriangle, Loader2, FileText, Download, Search } from 'lucide-react';
import {
  OFFICIAL_AUDIT_ITEMS,
  getOfficialAuditBlockers,
  getOfficialAuditSummary,
  type OfficialAuditStatus
} from '@/lib/official_audit';
import {
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  buildDispensingUkeOfficialAllFieldDefinitionGate,
  formatDispensingUkeOfficialAllFieldDefinitionGate
} from '@/lib/receipt/dispensing_uke_validation';
import type { DispensingUkeSpecificationPdfAllFieldCompletionGate } from '@/lib/receipt/dispensing_uke_spec_pdf';

  const auditStatusLabel = (status: OfficialAuditStatus) => {
    switch (status) {
      case 'verified':
        return '点検済み';
      case 'implemented':
        return '実装済み';
      case 'partial':
        return '部分対応';
      case 'open':
        return '未対応';
      default:
        return status;
    }
  };

  const auditStatusStyle = (status: OfficialAuditStatus) => {
    const styles = {
      verified: { background: '#dcfce7', color: '#166534', border: '#86efac' },
      implemented: { background: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
      partial: { background: '#fef3c7', color: '#92400e', border: '#fcd34d' },
      open: { background: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
    }[status];

    return {
      display: 'inline-flex',
      alignItems: 'center',
      borderRadius: '999px',
      border: `1px solid ${styles.border}`,
      padding: '0.15rem 0.55rem',
      fontSize: '0.76rem',
      fontWeight: 700,
      background: styles.background,
      color: styles.color,
      whiteSpace: 'nowrap' as const
    };
  };

  const auditPriorityStyle = (priority: 'critical' | 'high' | 'medium') => {
    const styles = {
      critical: { label: '最重要', color: '#b91c1c', background: '#fef2f2' },
      high: { label: '高', color: '#b45309', background: '#fffbeb' },
      medium: { label: '中', color: '#475569', background: '#f8fafc' }
    }[priority];

    return {
      ...styles,
      style: {
        display: 'inline-flex',
        borderRadius: '6px',
        padding: '0.12rem 0.45rem',
        fontSize: '0.72rem',
        fontWeight: 700,
        color: styles.color,
        background: styles.background,
        border: '1px solid rgba(148, 163, 184, 0.35)'
      }
    };
  };


interface OfficialAuditSettingsTabProps {
  canViewOfficialAudit: boolean;
  dispensingUkeSpecPdfText: string;
  setDispensingUkeSpecPdfText: (value: string) => void;
  setDispensingUkeSpecCompletionGate: (value: DispensingUkeSpecificationPdfAllFieldCompletionGate | null) => void;
  setDispensingUkeSpecCompletionLabel: (value: string) => void;
  dispensingUkeSpecConfirmationText: string;
  setDispensingUkeSpecConfirmationText: (value: string) => void;
  isFetchingDispensingUkeSpecPdf: boolean;
  handleFetchDispensingUkeSpecPdf: () => Promise<void>;
  handleReviewDispensingUkeSpecPdfText: () => Promise<void>;
  dispensingUkeSpecCompletionGate: DispensingUkeSpecificationPdfAllFieldCompletionGate | null;
  isExportingDispensingUkeSpecReview: boolean;
  handleExportDispensingUkeSpecReviewCsv: () => Promise<void>;
  isExportingDispensingUkeSpecImplementationPack: boolean;
  handleExportDispensingUkeSpecImplementationPack: () => Promise<void>;
  dispensingUkeSpecCompletionLabel: string;
  isExportingDispensingUkeOfficialAllFieldsGate: boolean;
  handleExportDispensingUkeOfficialAllFieldsGateCsv: () => Promise<void>;
}

export default function OfficialAuditSettingsTab({
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
}: OfficialAuditSettingsTabProps) {
  const officialAuditSummary = getOfficialAuditSummary();
  const officialAuditBlockers = getOfficialAuditBlockers();
  const dispensingUkeOfficialAllFieldsGate = buildDispensingUkeOfficialAllFieldDefinitionGate();
  const dispensingUkeOfficialAllFieldsGateLabel = formatDispensingUkeOfficialAllFieldDefinitionGate(dispensingUkeOfficialAllFieldsGate);
  return (
        <div className="settings-section glass official-audit-section">
          <div className="official-audit-header">
            <div>
              <h2>公式仕様点検</h2>
              <p className="section-desc">厚労省・支払基金などの公開資料に照らした、請求仕様・帳票・保険・権限・運用の自己点検です。</p>
            </div>
            <div className="official-audit-score" aria-label={`公式仕様点検進捗 ${officialAuditSummary.completionRate}%`}>
              <ShieldCheck size={22} aria-hidden="true" />
              <span>{officialAuditSummary.completionRate}%</span>
            </div>
          </div>

          <div className="official-audit-metrics">
            <div>
              <span>総項目</span>
              <strong>{officialAuditSummary.total}</strong>
            </div>
            <div>
              <span>部分対応</span>
              <strong>{officialAuditSummary.partial}</strong>
            </div>
            <div>
              <span>未対応</span>
              <strong>{officialAuditSummary.open}</strong>
            </div>
            <div className={officialAuditSummary.blockers > 0 ? 'metric-danger' : ''}>
              <span>最重要未完</span>
              <strong>{officialAuditSummary.blockers}</strong>
            </div>
          </div>

          {officialAuditBlockers.length > 0 && (
            <div className="official-audit-alert" role="status">
              <AlertTriangle size={18} aria-hidden="true" />
              <span>
                {officialAuditBlockers.length}件の最重要項目が点検未完了です。請求運用前に点数、UKE、保険・公費、バックアップを優先してください。
              </span>
            </div>
          )}

          <section
            className="official-audit-review-workspace"
            aria-labelledby="dispensing-uke-official-all-fields-gate-title"
            data-testid="dispensing-uke-official-all-fields-gate"
          >
            <div className="official-audit-review-header">
              <div>
                <h3 id="dispensing-uke-official-all-fields-gate-title">公式提出UKE allFields完了ゲート</h3>
                <a href={dispensingUkeOfficialAllFieldsGate.source.url} target="_blank" rel="noreferrer">
                  {dispensingUkeOfficialAllFieldsGate.source.fileName}
                </a>
              </div>
              <span
                className={dispensingUkeOfficialAllFieldsGate.ok ? 'review-status-ok' : 'review-status-pending'}
                data-testid="dispensing-uke-official-all-fields-gate-status"
              >
                {dispensingUkeOfficialAllFieldsGate.statusLabel}
              </span>
            </div>

            <p className="official-audit-review-label" role="status">
              {dispensingUkeOfficialAllFieldsGateLabel}
            </p>

            <div className="official-audit-review-metrics" aria-label="公式提出UKE allFields完了ゲート結果">
              <div>
                <span>レコード</span>
                <strong>{dispensingUkeOfficialAllFieldsGate.completedRecordTypeCount}/{dispensingUkeOfficialAllFieldsGate.expectedRecordTypes.length}</strong>
              </div>
              <div>
                <span>定義項目</span>
                <strong>{dispensingUkeOfficialAllFieldsGate.definedFieldCount}/{dispensingUkeOfficialAllFieldsGate.expectedFieldCount}</strong>
              </div>
              <div className={dispensingUkeOfficialAllFieldsGate.issueCount > 0 ? 'metric-danger' : ''}>
                <span>指摘</span>
                <strong>{dispensingUkeOfficialAllFieldsGate.issueCount}</strong>
              </div>
              <div>
                <span>次工程</span>
                <strong>P1-05</strong>
              </div>
            </div>

            {dispensingUkeOfficialAllFieldsGate.issues.length > 0 && (
              <div className="official-audit-review-blockers" data-testid="dispensing-uke-official-all-fields-gate-blockers">
                {dispensingUkeOfficialAllFieldsGate.issues.map((issue) => (
                  <div key={`${issue.recordType}-${issue.code}`}>
                    <AlertTriangle size={17} aria-hidden="true" />
                    <span><strong>{issue.recordType}</strong><br />{issue.message}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="actions official-audit-review-actions">
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExportDispensingUkeOfficialAllFieldsGateCsv}
                disabled={isExportingDispensingUkeOfficialAllFieldsGate || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-official-all-fields-gate-csv-button"
              >
                {isExportingDispensingUkeOfficialAllFieldsGate ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <FileText size={16} aria-hidden="true" />
                )}
                <span>完了ゲートCSV</span>
              </button>
            </div>
          </section>

          <section
            className="official-audit-review-workspace"
            aria-labelledby="dispensing-uke-spec-review-title"
            data-testid="dispensing-uke-spec-review"
          >
            <div className="official-audit-review-header">
              <div>
                <h3 id="dispensing-uke-spec-review-title">UKE仕様PDF 全項目確認</h3>
                <a href={DISPENSING_UKE_RECORD_SPEC_SOURCE.url} target="_blank" rel="noreferrer">
                  厚労省 調剤記録条件（全体版）
                </a>
              </div>
              {dispensingUkeSpecCompletionGate && (
                <span
                  className={dispensingUkeSpecCompletionGate.ok ? 'review-status-ok' : 'review-status-pending'}
                  data-testid="dispensing-uke-spec-review-status"
                >
                  {dispensingUkeSpecCompletionGate.statusLabel}
                </span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="dispensing-uke-spec-pdf-text">PDFから取り出した文字</label>
              <textarea
                id="dispensing-uke-spec-pdf-text"
                value={dispensingUkeSpecPdfText}
                onChange={(event) => {
                  setDispensingUkeSpecPdfText(event.target.value);
                  setDispensingUkeSpecCompletionGate(null);
                  setDispensingUkeSpecCompletionLabel('');
                }}
                rows={5}
                placeholder="YK 薬局情報レコード&#10;1 保険薬局コード 数字 7 7 必須"
                disabled={isFetchingDispensingUkeSpecPdf}
                style={{ resize: 'vertical', minHeight: '120px' }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="dispensing-uke-spec-confirmation-text">実装確認メモ</label>
              <textarea
                id="dispensing-uke-spec-confirmation-text"
                value={dispensingUkeSpecConfirmationText}
                onChange={(event) => setDispensingUkeSpecConfirmationText(event.target.value)}
                rows={3}
                placeholder="YK-pdf-field-definition-implementation, 定義追加準備, 仕様PDF YK 第3項目, 請求担当, 2026-06-20"
                disabled={isFetchingDispensingUkeSpecPdf}
                style={{ resize: 'vertical', minHeight: '84px' }}
              />
            </div>

            <div className="actions official-audit-review-actions">
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleFetchDispensingUkeSpecPdf}
                disabled={isFetchingDispensingUkeSpecPdf || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-spec-fetch-button"
              >
                {isFetchingDispensingUkeSpecPdf ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <Download size={16} aria-hidden="true" />
                )}
                <span>{isFetchingDispensingUkeSpecPdf ? '取得中...' : '公式PDFを取得して確認'}</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleReviewDispensingUkeSpecPdfText}
                disabled={isFetchingDispensingUkeSpecPdf || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-spec-review-button"
              >
                <Search size={16} aria-hidden="true" />
                <span>貼り付け本文を確認</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExportDispensingUkeSpecReviewCsv}
                disabled={!dispensingUkeSpecCompletionGate || isExportingDispensingUkeSpecReview || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-spec-review-csv-button"
              >
                {isExportingDispensingUkeSpecReview ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <FileText size={16} aria-hidden="true" />
                )}
                <span>確認結果CSV</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExportDispensingUkeSpecImplementationPack}
                disabled={!dispensingUkeSpecPdfText.trim() || isExportingDispensingUkeSpecImplementationPack || !canViewOfficialAudit}
                type="button"
                data-testid="dispensing-uke-spec-implementation-pack-button"
              >
                {isExportingDispensingUkeSpecImplementationPack ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <FileText size={16} aria-hidden="true" />
                )}
                <span>実装パック</span>
              </button>
            </div>

            {dispensingUkeSpecCompletionLabel && (
              <p className="official-audit-review-label" role="status">
                {dispensingUkeSpecCompletionLabel}
              </p>
            )}

            {dispensingUkeSpecCompletionGate && (
              <>
                <div className="official-audit-review-metrics" aria-label="UKE仕様PDF全項目確認結果">
                  <div><span>レコード</span><strong>{dispensingUkeSpecCompletionGate.parsedRecordTypeCount}/{dispensingUkeSpecCompletionGate.expectedRecordTypeCount}</strong></div>
                  <div><span>抽出項目</span><strong>{dispensingUkeSpecCompletionGate.parsedFieldCount}</strong></div>
                  <div><span>定義済み</span><strong>{dispensingUkeSpecCompletionGate.definedFieldCount}</strong></div>
                  <div className={dispensingUkeSpecCompletionGate.remainingFieldCount > 0 ? 'metric-danger' : ''}>
                    <span>残項目</span><strong>{dispensingUkeSpecCompletionGate.remainingFieldCount}</strong>
                  </div>
                </div>
                {dispensingUkeSpecCompletionGate.blockers.length > 0 && (
                  <div className="official-audit-review-blockers" data-testid="dispensing-uke-spec-review-blockers">
                    {dispensingUkeSpecCompletionGate.blockers.map((blocker) => (
                      <div key={blocker.code}>
                        <AlertTriangle size={17} aria-hidden="true" />
                        <span><strong>{blocker.title}</strong><br />{blocker.nextAction}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <div className="official-audit-list">
            {OFFICIAL_AUDIT_ITEMS.map((item) => {
              const priority = auditPriorityStyle(item.priority);
              return (
                <section key={item.id} className="official-audit-row">
                  <div className="official-audit-row-main">
                    <div className="official-audit-titleline">
                      <h3>{item.title}</h3>
                      <span style={auditStatusStyle(item.status)}>{auditStatusLabel(item.status)}</span>
                      <span style={priority.style}>{priority.label}</span>
                    </div>
                    <p className="official-audit-basis">{item.officialBasis}</p>
                  </div>

                  <div className="official-audit-detail-grid">
                    <div>
                      <h4>実装済み</h4>
                      <ul>
                        {item.implementationEvidence.map((text) => (
                          <li key={text}>{text}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4>残作業</h4>
                      <ul>
                        {item.remainingWork.map((text) => (
                          <li key={text}>{text}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {item.sources.length > 0 && (
                    <div className="official-audit-sources">
                      {item.sources.map((source) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                          {source.label}
                        </a>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
  );
}
