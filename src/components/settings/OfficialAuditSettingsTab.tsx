import React from 'react';
import { ShieldCheck, AlertTriangle, Loader2, FileText, Download, Search } from 'lucide-react';
import {
  OFFICIAL_AUDIT_ITEMS,
  getOfficialAuditBlockers,
  getOfficialAuditSummary,
  type OfficialAuditStatus
} from '@/lib/official_audit';
import { formatClaimPointsDriftSummary, type ClaimPointsDriftReview } from '@/lib/claim_points_drift';
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

  const auditPriorityLabel = (priority: 'critical' | 'high' | 'medium') => {
    return {
      critical: '最重要',
      high: '高',
      medium: '中'
    }[priority];
  };


interface OfficialAuditSettingsTabProps {
  canViewOfficialAudit: boolean;
  claimPointsDrift: ClaimPointsDriftReview | null;
  isReviewingClaimPointsDrift: boolean;
  handleReviewClaimPointsDrift: () => Promise<void>;
  handleExportClaimPointsDriftCsv: () => void;
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
  claimPointsDrift,
  isReviewingClaimPointsDrift,
  handleReviewClaimPointsDrift,
  handleExportClaimPointsDriftCsv,
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
            aria-labelledby="claim-points-drift-title"
            data-testid="claim-points-drift-section"
          >
            <h3 id="claim-points-drift-title">請求点数の変動点検</h3>
            <p className="help-text">
              出力済みの請求について、<strong>出力時点に記録した点数</strong>と、
              いま同じ受付を計算し直した点数を突き合わせます。
              算定の実装を直したあと、どの請求が影響を受けたかを確かめるためのものです。
              点数を作り直したり再提出したりはしません。
            </p>

            <div className="actions official-audit-review-actions">
              <button
                className="btn-primary flex-center gap-2"
                onClick={handleReviewClaimPointsDrift}
                disabled={isReviewingClaimPointsDrift || !canViewOfficialAudit}
                type="button"
                data-testid="claim-points-drift-run-button"
              >
                {isReviewingClaimPointsDrift ? (
                  <Loader2 size={16} className="spin" aria-hidden="true" />
                ) : (
                  <AlertTriangle size={16} aria-hidden="true" />
                )}
                <span>{isReviewingClaimPointsDrift ? '点検中...' : '出力済みの請求を点検'}</span>
              </button>
              <button
                className="btn-secondary flex-center gap-2"
                onClick={handleExportClaimPointsDriftCsv}
                disabled={!claimPointsDrift || claimPointsDrift.cases.length === 0}
                type="button"
                data-testid="claim-points-drift-csv-button"
              >
                <FileText size={16} aria-hidden="true" />
                <span>変動一覧CSV</span>
              </button>
            </div>

            {claimPointsDrift && (
              <>
                <p className="claim-points-drift-summary" data-testid="claim-points-drift-summary">
                  {formatClaimPointsDriftSummary(claimPointsDrift)}
                </p>

                {claimPointsDrift.cases.length > 0 && (
                  <div className="claim-points-drift-table-wrap">
                    <table className="claim-points-drift-table" data-testid="claim-points-drift-table">
                      <thead>
                        <tr>
                          <th>調剤日</th>
                          <th>患者</th>
                          <th>出力時点</th>
                          <th>現在</th>
                          <th>差</th>
                        </tr>
                      </thead>
                      <tbody>
                        {claimPointsDrift.cases.map((item) => (
                          <tr key={item.visitId} data-kind={item.kind}>
                            <td>{item.dispensingDate}</td>
                            <td>{item.patientName}</td>
                            <td className="num">{item.exportedPoints}点</td>
                            <td className="num">
                              {item.currentPoints === undefined ? '再計算できず' : `${item.currentPoints}点`}
                            </td>
                            <td className="num">
                              {item.deltaPoints === undefined
                                ? '-'
                                : `${item.deltaPoints > 0 ? '+' : ''}${item.deltaPoints}点`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
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
                className="form-control textarea-spec-text"
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
                className="form-control textarea-memo"
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
            {OFFICIAL_AUDIT_ITEMS.map((item) => (
              <section key={item.id} className="official-audit-row">
                <div className="official-audit-row-main">
                  <div className="official-audit-titleline">
                    <h3>{item.title}</h3>
                    <span className={`audit-status-badge status-${item.status}`}>{auditStatusLabel(item.status)}</span>
                    <span className={`audit-priority-badge priority-${item.priority}`}>{auditPriorityLabel(item.priority)}</span>
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
              ))}
          </div>

      <style jsx>{`
        .official-audit-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .official-audit-score {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.9rem;
          border-radius: 999px;
          background: #dcfce7;
          color: #166534;
          border: 1px solid #86efac;
          font-size: 1rem;
          font-weight: 800;
        }
        .official-audit-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 1rem;
        }
        .official-audit-metrics div {
          padding: 0.75rem 0.85rem;
          border-right: 1px solid var(--border);
          background: rgba(248, 250, 252, 0.7);
        }
        .official-audit-metrics div:last-child {
          border-right: none;
        }
        .official-audit-metrics span {
          display: block;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .official-audit-metrics strong {
          display: block;
          color: var(--text-main);
          font-size: 1.15rem;
          font-weight: 800;
          margin-top: 0.15rem;
        }
        .official-audit-alert {
          border: 1px solid #fecaca;
          background: #fef2f2;
          border-radius: 8px;
          padding: 0.9rem 1rem;
          margin-bottom: 1.5rem;
        }
        .official-audit-alert-title {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          font-size: var(--fs-base);
          font-weight: 800;
          color: #991b1b;
          margin-bottom: 0.45rem;
        }
        .official-audit-alert ul {
          margin: 0;
          padding-left: 1.25rem;
          color: #7f1d1d;
          font-size: var(--fs-base);
        }
        .official-audit-review-workspace {
          border: 1px solid rgba(148, 163, 184, 0.45);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.82);
          padding: 1rem;
          margin-bottom: 1.5rem;
        }
        .claim-points-drift-summary {
          margin: 0.85rem 0 0;
          font-size: var(--fs-sm);
          font-weight: 700;
        }
        .claim-points-drift-table-wrap {
          margin-top: 0.6rem;
          overflow-x: auto;
        }
        .claim-points-drift-table {
          width: 100%;
          border-collapse: collapse;
          font-size: var(--fs-xs);
        }
        .claim-points-drift-table th,
        .claim-points-drift-table td {
          border-bottom: 1px solid rgba(148, 163, 184, 0.4);
          padding: 0.35rem 0.5rem;
          text-align: left;
          white-space: nowrap;
        }
        .claim-points-drift-table th {
          font-weight: 800;
          color: var(--primary);
        }
        .claim-points-drift-table td.num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .claim-points-drift-table tr[data-kind='increased'] td:last-child {
          color: #b45309;
          font-weight: 700;
        }
        .claim-points-drift-table tr[data-kind='decreased'] td:last-child {
          color: #b91c1c;
          font-weight: 700;
        }
        .claim-points-drift-table tr[data-kind='unknown'] {
          background: rgba(254, 243, 199, 0.5);
        }
        .official-audit-review-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 0.85rem;
        }
        .official-audit-review-label {
          margin: 0 0 0.2rem;
          font-size: var(--fs-xs);
          font-weight: 800;
          color: var(--primary);
          letter-spacing: 0.04em;
        }
        .official-audit-review-header h3 {
          margin: 0;
          font-size: 1.05rem;
          color: var(--text-main);
        }
        .official-audit-review-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 0.85rem;
        }
        .official-audit-review-metrics div {
          padding: 0.65rem 0.75rem;
          border-right: 1px solid var(--border);
          background: rgba(248, 250, 252, 0.7);
        }
        .official-audit-review-metrics div:last-child {
          border-right: none;
        }
        .official-audit-review-metrics span {
          display: block;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 700;
        }
        .official-audit-review-metrics strong {
          display: block;
          color: var(--text-main);
          font-size: 1.05rem;
          font-weight: 800;
          margin-top: 0.12rem;
        }
        .metric-danger strong {
          color: #b91c1c;
        }
        .official-audit-review-blockers {
          display: grid;
          gap: 0.45rem;
          border: 1px solid #fecaca;
          border-radius: 8px;
          background: #fef2f2;
          padding: 0.75rem;
          margin-bottom: 0.85rem;
        }
        .official-audit-review-blockers > div {
          display: flex;
          align-items: flex-start;
          gap: 0.45rem;
          color: #7f1d1d;
          font-size: var(--fs-base);
          line-height: 1.45;
        }
        .official-audit-review-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.65rem;
        }
        .review-status-ok {
          color: #166534;
          font-size: var(--fs-sm);
          font-weight: 700;
        }
        .review-status-pending {
          color: #b45309;
          font-size: var(--fs-sm);
          font-weight: 700;
        }
        .official-audit-list {
          display: flex;
          flex-direction: column;
        }
        .official-audit-row {
          padding: 1.15rem 0;
          border-bottom: 1px solid var(--border);
        }
        .official-audit-row-main {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .official-audit-titleline {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
        }
        .official-audit-titleline h3 {
          margin: 0;
          font-size: 1rem;
          color: var(--text-main);
          line-height: 1.35;
        }
        .official-audit-basis {
          margin: 0;
          color: var(--text-muted);
          font-size: var(--fs-md);
          line-height: 1.55;
        }
        .official-audit-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
          margin-top: 0.85rem;
        }
        .official-audit-detail-grid h4 {
          margin: 0 0 0.35rem;
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }
        .official-audit-detail-grid ul {
          margin: 0;
          padding-left: 1.15rem;
          color: var(--text-main);
          font-size: var(--fs-md);
          line-height: 1.55;
        }
        .textarea-spec-text {
          resize: vertical;
          min-height: 120px;
        }
        .textarea-memo {
          resize: vertical;
          min-height: 84px;
        }
        .audit-status-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          font-size: var(--fs-xs);
          font-weight: 700;
          white-space: nowrap;
        }
        .audit-status-badge.status-verified {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #86efac;
        }
        .audit-status-badge.status-implemented {
          background: #dbeafe;
          color: #1d4ed8;
          border: 1px solid #93c5fd;
        }
        .audit-status-badge.status-partial {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fcd34d;
        }
        .audit-status-badge.status-open {
          background: #fee2e2;
          color: #991b1b;
          border: 1px solid #fca5a5;
        }
        .audit-priority-badge {
          display: inline-flex;
          border-radius: 6px;
          padding: 0.12rem 0.45rem;
          font-size: var(--fs-xs);
          font-weight: 700;
          border: 1px solid rgba(148, 163, 184, 0.35);
        }
        .audit-priority-badge.priority-critical {
          color: #b91c1c;
          background: #fef2f2;
        }
        .audit-priority-badge.priority-high {
          color: #b45309;
          background: #fffbeb;
        }
        .audit-priority-badge.priority-medium {
          color: #475569;
          background: #f8fafc;
        }
        .official-audit-sources {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 0.85rem;
        }
        .official-audit-sources a {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.25rem 0.5rem;
          color: var(--primary);
          background: rgba(255, 255, 255, 0.7);
          font-size: var(--fs-sm);
          text-decoration: none;
        }
        @media (max-width: 700px) {
          .official-audit-header {
            flex-direction: column;
          }
          .official-audit-metrics,
          .official-audit-detail-grid,
          .official-audit-review-metrics {
            grid-template-columns: 1fr;
          }
          .official-audit-metrics div,
          .official-audit-review-metrics div {
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
          .official-audit-metrics div:last-child,
          .official-audit-review-metrics div:last-child {
            border-bottom: none;
          }
        }
      `}</style>
    </div>
  );
}

