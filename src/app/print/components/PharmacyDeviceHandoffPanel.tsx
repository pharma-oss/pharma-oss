import React from 'react';
import { Send, RefreshCw, XCircle, CheckCircle, Loader2 } from 'lucide-react';
import type { VisitPharmacyDeviceHandoff } from '@/db/types';
import type { PharmacyDeviceOperation } from '@/lib/pharmacy_device_connector';
import type { ExternalConnectorReadinessCheck } from '@/lib/external_connector_readiness';
import { PHARMACY_DEVICE_HANDOFF_STATUS_LABELS } from '../types';

export interface PharmacyDeviceHandoffPanelProps {
  pharmacyDeviceFlowStatus: string;
  pharmacyDeviceReadiness: ExternalConnectorReadinessCheck | null;
  pharmacyDeviceHandoff?: VisitPharmacyDeviceHandoff;
  isLoadingPharmacyDeviceReadiness: boolean;
  pharmacyDeviceConnectorReady: boolean;
  pharmacyDeviceOperationBusy: boolean;
  pharmacyDeviceOperationInFlight: PharmacyDeviceOperation | null;
  canSubmitPharmacyDevice: boolean;
  canReplacePharmacyDevice: boolean;
  canCancelPharmacyDevice: boolean;
  pharmacyDeviceBlockedTitle?: string;
  handlePharmacyDeviceOperation: (operation: PharmacyDeviceOperation) => void;
}

export const PharmacyDeviceHandoffPanel = React.memo(function PharmacyDeviceHandoffPanel({
  pharmacyDeviceFlowStatus,
  pharmacyDeviceReadiness,
  pharmacyDeviceHandoff,
  isLoadingPharmacyDeviceReadiness,
  pharmacyDeviceConnectorReady,
  pharmacyDeviceOperationBusy,
  pharmacyDeviceOperationInFlight,
  canSubmitPharmacyDevice,
  canReplacePharmacyDevice,
  canCancelPharmacyDevice,
  pharmacyDeviceBlockedTitle,
  handlePharmacyDeviceOperation
}: PharmacyDeviceHandoffPanelProps) {
  return (
    <section
      className={`print-preview-card card claim-lifecycle-panel no-print status-${pharmacyDeviceFlowStatus}`}
      data-testid="pharmacy-device-handoff-panel"
    >
      <div className="preview-header claim-check-header">
        <div>
          <h3>
            {pharmacyDeviceFlowStatus === 'ok' ? <CheckCircle size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
            外部調剤機器連携
          </h3>
          <p className="claim-check-subtitle">
            {pharmacyDeviceReadiness?.pharmacyDevice?.connectorKind === 'nsips_gateway'
              ? '許諾済みNSIPSゲートウェイ'
              : pharmacyDeviceReadiness?.pharmacyDevice?.connectorKind === 'vendor_api'
                ? 'メーカーAPI'
                : '接続方式未設定'}
            {' / '}
            仕様版 {pharmacyDeviceReadiness?.pharmacyDevice?.interfaceVersion || '未設定'}
          </p>
        </div>
        <span className={`claim-lifecycle-badge ${pharmacyDeviceFlowStatus}`}>
          {pharmacyDeviceHandoff
            ? PHARMACY_DEVICE_HANDOFF_STATUS_LABELS[pharmacyDeviceHandoff.status]
            : isLoadingPharmacyDeviceReadiness
              ? '確認中'
              : pharmacyDeviceReadiness?.statusLabel || '未設定'}
        </span>
      </div>

      <div className="claim-lifecycle-grid">
        <div className="claim-lifecycle-status-card">
          <span>接続準備</span>
          <strong>{pharmacyDeviceConnectorReady ? '送信可能' : pharmacyDeviceReadiness?.statusLabel || '確認できません'}</strong>
          <p>{pharmacyDeviceConnectorReady ? '施設内接続・仕様・必須機能・直近試行を確認済み' : pharmacyDeviceReadiness?.requiredActions?.[0] || '設定の外部連携を確認してください。'}</p>
        </div>

        <div className="claim-lifecycle-status-card">
          <span>連携結果</span>
          <strong>{pharmacyDeviceHandoff ? PHARMACY_DEVICE_HANDOFF_STATUS_LABELS[pharmacyDeviceHandoff.status] : '未送信'}</strong>
          <p>
            {pharmacyDeviceHandoff
              ? `${new Date(pharmacyDeviceHandoff.updatedAt).toLocaleString('ja-JP')} / ${pharmacyDeviceHandoff.interfaceVersion}`
              : '処方内容を確認してから明示的に送信します。'}
          </p>
        </div>

        <div className="claim-lifecycle-status-card">
          <span>連携ID</span>
          <strong>{pharmacyDeviceHandoff?.transferId || '未発行'}</strong>
          <p>{pharmacyDeviceHandoff ? `重複防止 ${pharmacyDeviceHandoff.payloadHash.slice(0, 12)}...` : '同じ内容の二重送信を接続先で防止します。'}</p>
        </div>

        <div className="claim-lifecycle-actions" aria-busy={pharmacyDeviceOperationBusy}>
          <button
            type="button"
            className="btn-primary compact-action"
            data-testid="pharmacy-device-submit-button"
            onClick={() => handlePharmacyDeviceOperation('submit')}
            disabled={!canSubmitPharmacyDevice}
            title={pharmacyDeviceBlockedTitle || (pharmacyDeviceHandoff?.status !== 'cancelled' && pharmacyDeviceHandoff ? '送信済みです。' : undefined)}
          >
            {pharmacyDeviceOperationInFlight === 'submit'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <Send size={16} aria-hidden="true" />}
            <span>外部機器へ送る</span>
          </button>
          <button
            type="button"
            className="btn-secondary compact-action"
            data-testid="pharmacy-device-replace-button"
            onClick={() => handlePharmacyDeviceOperation('replace')}
            disabled={!canReplacePharmacyDevice}
            title={pharmacyDeviceBlockedTitle || (!pharmacyDeviceHandoff || pharmacyDeviceHandoff.status === 'cancelled' ? '送信済みの連携がありません。' : undefined)}
          >
            {pharmacyDeviceOperationInFlight === 'replace'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <RefreshCw size={16} aria-hidden="true" />}
            <span>差し替える</span>
          </button>
          <button
            type="button"
            className="btn-secondary compact-action"
            data-testid="pharmacy-device-cancel-button"
            onClick={() => handlePharmacyDeviceOperation('cancel')}
            disabled={!canCancelPharmacyDevice}
            title={pharmacyDeviceBlockedTitle || (!pharmacyDeviceHandoff || pharmacyDeviceHandoff.status === 'cancelled' ? '取消できる連携がありません。' : undefined)}
          >
            {pharmacyDeviceOperationInFlight === 'cancel'
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <XCircle size={16} aria-hidden="true" />}
            <span>連携を取り消す</span>
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

        .claim-lifecycle-badge.ok,
        .claim-lifecycle-badge.accepted {
          background: #dcfce7;
          color: #15803d;
        }

        .claim-lifecycle-badge.warning {
          background: #fef3c7;
          color: #b45309;
        }

        .claim-lifecycle-badge.error,
        .claim-lifecycle-badge.cancelled {
          background: #fee2e2;
          color: #b91c1c;
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
