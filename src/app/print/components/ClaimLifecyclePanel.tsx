'use client';

import React from 'react';
import { AlertTriangle, FileCheck2 } from 'lucide-react';
import {
  CLAIM_LIFECYCLE_STATUS_LABELS,
  getClaimLifecycleStatus,
  type ClaimLifecycleEvent,
  type ClaimLifecycleState,
  type ClaimLifecycleStatus
} from '@/lib/claim_lifecycle';
import {
  OFFICIAL_CLAIM_RETURN_REASONS,
  formatClaimReturnReasonLabel,
  getClaimReturnReasonByCode
} from '@/lib/claim_return_manager';

export interface ClaimLifecyclePanelProps {
  claimLifecycle?: ClaimLifecycleState;
  claimLifecycleStatus: ClaimLifecycleStatus;
  claimLifecycleLocked: boolean;
  latestClaimLifecycleEvent?: ClaimLifecycleEvent | null;
  returnReasonCode: string;
  returnReasonNote: string;
  selectedReturnReason?: ReturnType<typeof getClaimReturnReasonByCode>;
  canChangeBilling: boolean;
  changeBillingDeniedMessage?: string;
  onReturnReasonCodeChange: (code: string) => void;
  onReturnReasonNoteChange: (note: string) => void;
  onRegisterReturn: () => void;
  onPrepareRebilling: () => void;
  onCloseClaim: () => void;
}

export function ClaimLifecyclePanel({
  claimLifecycle,
  claimLifecycleStatus,
  claimLifecycleLocked,
  latestClaimLifecycleEvent,
  returnReasonCode,
  returnReasonNote,
  selectedReturnReason,
  canChangeBilling,
  changeBillingDeniedMessage,
  onReturnReasonCodeChange,
  onReturnReasonNoteChange,
  onRegisterReturn,
  onPrepareRebilling,
  onCloseClaim
}: ClaimLifecyclePanelProps) {
  return (
    <section
      className={`print-preview-card card claim-lifecycle-panel no-print status-${claimLifecycleStatus}`}
      data-testid="claim-lifecycle-panel"
    >
      <div className="preview-header claim-check-header">
        <div>
          <h3>
            {claimLifecycleLocked ? <AlertTriangle size={18} aria-hidden="true" /> : <FileCheck2 size={18} aria-hidden="true" />}
            請求ライフサイクル
          </h3>
          <p className="claim-check-subtitle">
            UKE出力後は算定をロックし、返戻・月遅れ・再請求の理由と担当者を履歴に残します。
          </p>
        </div>
        <span className={`claim-lifecycle-badge ${claimLifecycleStatus}`}>
          {CLAIM_LIFECYCLE_STATUS_LABELS[claimLifecycleStatus]}
        </span>
      </div>

      <div className="claim-lifecycle-grid">
        <div className="claim-lifecycle-status-card">
          <span>請求ロック</span>
          <strong>{claimLifecycleLocked ? 'ロック中' : '変更可能'}</strong>
          <p>
            {claimLifecycleLocked
              ? `${claimLifecycle?.exportedFileName || 'UKE出力'} 後の算定変更は返戻登録または再請求準備が必要です。`
              : claimLifecycleStatus === 'draft'
                ? 'UKE出力前の請求です。請求前チェックを通してから出力してください。'
                : '返戻・再請求対応中のため、算定修正が可能です。'}
          </p>
        </div>

        <div className="claim-lifecycle-status-card">
          <span>最新イベント</span>
          <strong>{latestClaimLifecycleEvent ? CLAIM_LIFECYCLE_STATUS_LABELS[getClaimLifecycleStatus({ status: latestClaimLifecycleEvent.type })] : '未出力'}</strong>
          <p>
            {latestClaimLifecycleEvent
              ? `${new Date(latestClaimLifecycleEvent.at).toLocaleString('ja-JP')} / ${latestClaimLifecycleEvent.by || '担当者未記録'}`
              : 'UKE出力後に履歴が作成されます。'}
          </p>
          {claimLifecycle?.returnReasonCode && (
            <p className="claim-lifecycle-return-code" data-testid="claim-registered-return-reason">
              記録済みの返戻理由: {formatClaimReturnReasonLabel(claimLifecycle.returnReasonCode)}
            </p>
          )}
        </div>

        <div className="claim-lifecycle-return-reason" data-testid="claim-return-reason-picker">
          <label htmlFor="claim-return-reason-code">返戻理由</label>
          <select
            id="claim-return-reason-code"
            data-testid="claim-return-reason-code"
            value={returnReasonCode}
            onChange={(event) => onReturnReasonCodeChange(event.target.value)}
            disabled={!canChangeBilling || claimLifecycleStatus === 'draft'}
          >
            {OFFICIAL_CLAIM_RETURN_REASONS.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.code} {reason.title}
              </option>
            ))}
          </select>
          <input
            type="text"
            id="claim-return-reason-note"
            data-testid="claim-return-reason-note"
            value={returnReasonNote}
            onChange={(event) => onReturnReasonNoteChange(event.target.value)}
            placeholder="補足メモ（任意）"
            maxLength={200}
            disabled={!canChangeBilling || claimLifecycleStatus === 'draft'}
          />
          {selectedReturnReason && (
            <p className="claim-return-reason-hint" data-testid="claim-return-reason-hint">
              {selectedReturnReason.suggestedAction}
            </p>
          )}
        </div>

        <div className="claim-lifecycle-actions">
          <button
            type="button"
            className="btn-secondary compact-action"
            onClick={onRegisterReturn}
            disabled={!canChangeBilling || claimLifecycleStatus === 'draft'}
            title={!canChangeBilling ? changeBillingDeniedMessage : undefined}
          >
            <span>返戻登録</span>
          </button>
          <button
            type="button"
            className="btn-secondary compact-action"
            onClick={onPrepareRebilling}
            disabled={!canChangeBilling || claimLifecycleStatus !== 'returned'}
            title={!canChangeBilling ? changeBillingDeniedMessage : undefined}
          >
            <span>再請求/月遅れ</span>
          </button>
          <button
            type="button"
            className="btn-secondary compact-action"
            onClick={onCloseClaim}
            disabled={!canChangeBilling || (claimLifecycleStatus !== 'exported' && claimLifecycleStatus !== 'rebilling')}
            title={!canChangeBilling ? changeBillingDeniedMessage : undefined}
          >
            <span>請求完了</span>
          </button>
        </div>
      </div>
    </section>
  );
}
