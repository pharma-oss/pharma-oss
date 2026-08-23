import React from 'react';
import { FileCheck2, CheckCircle, RefreshCw, Pencil, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import type { VisitElectronicPrescription } from '@/db/types';
import type { ElectronicPrescriptionOperationKind } from '@/lib/electronic_prescription';
import {
  ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS,
  ELECTRONIC_PRESCRIPTION_RECEPTION_STATUS_LABELS,
  ELECTRONIC_PRESCRIPTION_SIGNATURE_STATUS_LABELS,
  ELECTRONIC_PRESCRIPTION_DUPLICATE_CHECK_STATUS_LABELS
} from '../types';

export interface ElectronicPrescriptionPrintPanelProps {
  electronicPrescription?: VisitElectronicPrescription;
  electronicPrescriptionIds: string[];
  electronicPrescriptionDispensingResultStatus: VisitElectronicPrescription['dispensingResultStatus'];
  electronicPrescriptionReceptionStatus: VisitElectronicPrescription['receptionStatus'];
  electronicPrescriptionSignatureStatus: VisitElectronicPrescription['signatureStatus'];
  electronicPrescriptionDuplicateCheckStatus: VisitElectronicPrescription['duplicateCheckStatus'];
  electronicPrescriptionRegistered: boolean;
  electronicPrescriptionOperationBusy: boolean;
  electronicPrescriptionOperationInFlight: ElectronicPrescriptionOperationKind | null;
  canRunElectronicPrescriptionDuplicateCheck: boolean;
  canRegisterElectronicPrescriptionDispensingResult: boolean;
  canSearchElectronicPrescriptionDispensingResult: boolean;
  canChangeElectronicPrescriptionDispensingResult: boolean;
  canCancelElectronicPrescriptionDispensingResult: boolean;
  canCancelElectronicPrescriptionReception: boolean;
  electronicPrescriptionOperationBlockedTitle?: string;
  electronicPrescriptionValidUntilText?: string;
  electronicPrescriptionUpdatedAtText?: string;
  electronicPrescriptionDispensingInformationSignatureText: string;
  electronicPrescriptionDispensingInformationHpkiText: string;
  electronicPrescriptionDispensingInformationSignedAtText?: string;
  electronicPrescriptionDispensingInformationHashText: string;
  electronicPrescriptionComments: string[];
  electronicPrescriptionLaboratoryResults: any[];
  electronicPrescriptionNarcoticAdministration?: any;
  prescriptionAuditErrorCount: number;
  electronicPrescriptionLifecycleDecision: (op: ElectronicPrescriptionOperationKind) => { allowed: boolean; message?: string };
  handleElectronicPrescriptionOperation: (operation: ElectronicPrescriptionOperationKind) => void;
}

export const ElectronicPrescriptionPrintPanel = React.memo(function ElectronicPrescriptionPrintPanel({
  electronicPrescription,
  electronicPrescriptionIds,
  electronicPrescriptionDispensingResultStatus,
  electronicPrescriptionReceptionStatus,
  electronicPrescriptionSignatureStatus,
  electronicPrescriptionDuplicateCheckStatus,
  electronicPrescriptionRegistered,
  electronicPrescriptionOperationBusy,
  electronicPrescriptionOperationInFlight,
  canRunElectronicPrescriptionDuplicateCheck,
  canRegisterElectronicPrescriptionDispensingResult,
  canSearchElectronicPrescriptionDispensingResult,
  canChangeElectronicPrescriptionDispensingResult,
  canCancelElectronicPrescriptionDispensingResult,
  canCancelElectronicPrescriptionReception,
  electronicPrescriptionOperationBlockedTitle,
  electronicPrescriptionValidUntilText,
  electronicPrescriptionUpdatedAtText,
  electronicPrescriptionDispensingInformationSignatureText,
  electronicPrescriptionDispensingInformationHpkiText,
  electronicPrescriptionDispensingInformationSignedAtText,
  electronicPrescriptionDispensingInformationHashText,
  electronicPrescriptionComments,
  electronicPrescriptionLaboratoryResults,
  electronicPrescriptionNarcoticAdministration,
  prescriptionAuditErrorCount,
  electronicPrescriptionLifecycleDecision,
  handleElectronicPrescriptionOperation
}: ElectronicPrescriptionPrintPanelProps) {
  if (!electronicPrescription) return null;

  return (
    <section className="print-preview-card card electronic-prescription-lifecycle-panel no-print" data-testid="electronic-prescription-lifecycle-panel">
      <div className="preview-header claim-check-header">
        <div>
          <h3>
            <FileCheck2 size={18} aria-hidden="true" />
            電子処方箋ステータス
          </h3>
          <p className="claim-check-subtitle">
            処方箋 {electronicPrescriptionIds.length}件 / 受付 {ELECTRONIC_PRESCRIPTION_RECEPTION_STATUS_LABELS[electronicPrescriptionReceptionStatus]}
          </p>
        </div>
        <span className={`claim-lifecycle-badge ${electronicPrescriptionRegistered ? 'ok' : 'warning'}`}>
          {ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS[electronicPrescriptionDispensingResultStatus]}
        </span>
      </div>

      <div className="claim-lifecycle-grid">
        <div className="claim-lifecycle-status-card">
          <span>医師署名・有効期限</span>
          <strong>{ELECTRONIC_PRESCRIPTION_SIGNATURE_STATUS_LABELS[electronicPrescriptionSignatureStatus]}</strong>
          <p>{electronicPrescriptionValidUntilText ? `有効期限 ${electronicPrescriptionValidUntilText}` : '有効期限の記録なし'}</p>
        </div>

        <div className="claim-lifecycle-status-card">
          <span>重複投薬等チェック</span>
          <strong>{ELECTRONIC_PRESCRIPTION_DUPLICATE_CHECK_STATUS_LABELS[electronicPrescriptionDuplicateCheckStatus]}</strong>
          <p>{electronicPrescription.appliedAt ? `反映日時 ${new Date(electronicPrescription.appliedAt).toLocaleString('ja-JP')}` : '調剤結果登録前に確認を実施してください。'}</p>
        </div>

        <div className="claim-lifecycle-status-card">
          <span>調剤結果登録</span>
          <strong>{ELECTRONIC_PRESCRIPTION_DISPENSING_STATUS_LABELS[electronicPrescriptionDispensingResultStatus]}</strong>
          <p>{electronicPrescriptionUpdatedAtText ? `更新 ${electronicPrescriptionUpdatedAtText}` : '調剤完了後に登録します。'}</p>
        </div>

        <div className="claim-lifecycle-status-card">
          <span>調剤情報提供ファイル署名</span>
          <strong>{electronicPrescriptionDispensingInformationSignatureText}</strong>
          <p>
            {electronicPrescriptionDispensingInformationHpkiText}
            {electronicPrescriptionDispensingInformationSignedAtText ? ` / 署名日時 ${electronicPrescriptionDispensingInformationSignedAtText}` : ''}
            {electronicPrescriptionDispensingInformationHashText ? ` / SHA-256 ${electronicPrescriptionDispensingInformationHashText}` : ''}
          </p>
        </div>

        {(electronicPrescriptionComments.length > 0
          || electronicPrescriptionLaboratoryResults.length > 0
          || electronicPrescriptionNarcoticAdministration) && (
          <div className="electronic-prescription-supplementary" data-testid="electronic-prescription-supplementary-display">
            <strong>処方補足情報</strong>
            <ul>
              {electronicPrescriptionComments.map((comment) => (
                <li key={`electronic-comment-${comment}`}>処方コメント: {comment}</li>
              ))}
              {electronicPrescriptionLaboratoryResults.map((result, index) => (
                <li key={`electronic-lab-${result.testName}-${index}`}>
                  検査値: {result.testName} {result.value}{result.unit ? ` ${result.unit}` : ''}
                  {result.referenceRange ? `（基準 ${result.referenceRange}）` : ''}
                </li>
              ))}
              {electronicPrescriptionNarcoticAdministration && (
                <li>麻薬施用情報: {electronicPrescriptionNarcoticAdministration.displayText || '表示不可'}</li>
              )}
            </ul>
          </div>
        )}

        <div className="claim-lifecycle-actions electronic-prescription-actions" aria-busy={electronicPrescriptionOperationBusy}>
          <button
            type="button"
            className="btn-secondary compact-action"
            data-testid="electronic-prescription-duplicate-check-button"
            onClick={() => handleElectronicPrescriptionOperation('duplicate_check')}
            disabled={!canRunElectronicPrescriptionDuplicateCheck}
            title={electronicPrescriptionOperationBlockedTitle}
          >
            {electronicPrescriptionOperationInFlight === 'duplicate_check'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <FileCheck2 size={16} aria-hidden="true" />}
            <span>重複確認</span>
          </button>
          <button
            type="button"
            className="btn-primary compact-action"
            data-testid="electronic-prescription-register-dispensing-result-button"
            onClick={() => handleElectronicPrescriptionOperation('dispensing_result_register')}
            disabled={!canRegisterElectronicPrescriptionDispensingResult}
            title={electronicPrescriptionOperationBlockedTitle
              || (prescriptionAuditErrorCount > 0
                ? '薬剤師確認の要修正項目を解消してください。'
                : electronicPrescriptionRegistered
                  ? '調剤結果登録済みです。'
                  : electronicPrescriptionDispensingResultStatus === 'submitted'
                    ? '送信済みの調剤結果を確認中です。'
                    : undefined)}
          >
            {electronicPrescriptionOperationInFlight === 'dispensing_result_register'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <CheckCircle size={16} aria-hidden="true" />}
            <span>調剤結果登録</span>
          </button>
          <button
            type="button"
            className="btn-secondary compact-action"
            data-testid="electronic-prescription-search-dispensing-result-button"
            onClick={() => handleElectronicPrescriptionOperation('dispensing_result_search')}
            disabled={!canSearchElectronicPrescriptionDispensingResult}
            title={electronicPrescriptionOperationBlockedTitle || 'タイムアウトや再送後に管理サービス上の調剤結果IDを確認します。'}
          >
            {electronicPrescriptionOperationInFlight === 'dispensing_result_search'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <RefreshCw size={16} aria-hidden="true" />}
            <span>結果ID照会</span>
          </button>
          <button
            type="button"
            className="btn-secondary compact-action"
            data-testid="electronic-prescription-change-dispensing-result-button"
            onClick={() => handleElectronicPrescriptionOperation('dispensing_result_change')}
            disabled={!canChangeElectronicPrescriptionDispensingResult}
            title={electronicPrescriptionOperationBlockedTitle
              || (prescriptionAuditErrorCount > 0
                ? '薬剤師確認の要修正項目を解消してください。'
                : !electronicPrescription.dispensingResultId
                  ? '調剤結果IDがありません。'
                  : !electronicPrescriptionRegistered
                    ? '登録済み調剤結果だけ変更できます。'
                    : undefined)}
          >
            {electronicPrescriptionOperationInFlight === 'dispensing_result_change'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <Pencil size={16} aria-hidden="true" />}
            <span>調剤結果変更</span>
          </button>
          <button
            type="button"
            className="btn-secondary compact-action"
            data-testid="electronic-prescription-cancel-dispensing-result-button"
            onClick={() => handleElectronicPrescriptionOperation('dispensing_result_cancel')}
            disabled={!canCancelElectronicPrescriptionDispensingResult}
            title={electronicPrescriptionOperationBlockedTitle
              || (!electronicPrescription.dispensingResultId
                ? '調剤結果IDがありません。'
                : !electronicPrescriptionRegistered
                  ? '登録済み調剤結果だけ取消できます。'
                  : undefined)}
          >
            {electronicPrescriptionOperationInFlight === 'dispensing_result_cancel'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <XCircle size={16} aria-hidden="true" />}
            <span>結果取消</span>
          </button>
          <button
            type="button"
            className="btn-secondary compact-action"
            data-testid="electronic-prescription-cancel-reception-button"
            onClick={() => handleElectronicPrescriptionOperation('reception_cancel')}
            disabled={!canCancelElectronicPrescriptionReception}
            title={electronicPrescriptionOperationBlockedTitle
              || electronicPrescriptionLifecycleDecision('reception_cancel').message}
          >
            {electronicPrescriptionOperationInFlight === 'reception_cancel'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <AlertTriangle size={16} aria-hidden="true" />}
            <span>受付取消</span>
          </button>
        </div>
      </div>

      <style jsx>{`
        .claim-lifecycle-panel {
          background: #ffffff;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          padding: 1rem;
        }

        .preview-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .claim-check-header h3 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0;
          font-size: 1.05rem;
          color: #111827;
        }

        .claim-check-subtitle {
          margin: 0.2rem 0 0;
          font-size: 0.78rem;
          color: #6b7280;
        }

        .claim-lifecycle-badge {
          font-size: 0.75rem;
          font-weight: 700;
          padding: 0.25rem 0.6rem;
          border-radius: 9999px;
        }

        .claim-lifecycle-badge.ok {
          background: #dcfce7;
          color: #15803d;
        }

        .claim-lifecycle-badge.warning {
          background: #fef3c7;
          color: #b45309;
        }

        .claim-lifecycle-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
        }

        .claim-lifecycle-status-card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 6px;
          padding: 0.65rem 0.8rem;
        }

        .claim-lifecycle-status-card span {
          display: block;
          font-size: 0.7rem;
          color: #6b7280;
          font-weight: 700;
        }

        .claim-lifecycle-status-card strong {
          display: block;
          font-size: 0.95rem;
          color: #111827;
          margin: 0.15rem 0;
        }

        .claim-lifecycle-status-card p {
          margin: 0;
          font-size: 0.72rem;
          color: #4b5563;
        }

        .electronic-prescription-supplementary {
          grid-column: 1 / -1;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          padding: 0.6rem 0.8rem;
          font-size: 0.78rem;
        }

        .electronic-prescription-supplementary strong {
          display: block;
          color: #166534;
          margin-bottom: 0.25rem;
        }

        .electronic-prescription-supplementary ul {
          margin: 0;
          padding-left: 1.2rem;
          color: #15803d;
        }

        .claim-lifecycle-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: center;
          grid-column: 1 / -1;
          margin-top: 0.5rem;
        }

        .compact-action {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.82rem;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-primary {
          background: #2563eb;
          color: white;
          border: none;
        }

        .btn-primary:hover:not(:disabled) {
          background: #1d4ed8;
        }

        .btn-secondary {
          background: #ffffff;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .btn-secondary:hover:not(:disabled) {
          background: #f9fafb;
        }

        button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        @media print {
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </section>
  );
});
