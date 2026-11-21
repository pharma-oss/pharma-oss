'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Info,
  MessageSquare,
  Pencil,
  Sparkles,
  XCircle
} from 'lucide-react';
import {
  formatAiSuggestionConfidence,
  summarizeAiSuggestions,
  type AiAssistSuggestion,
  type AiSuggestionDecision
} from '@/lib/ai_suggestion';
import {
  AI_ASSIST_MODE_LABELS,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import type { PrescriptionInputAuditIssue } from '@/lib/prescription_input_audit';
import { CLAIM_ISSUE_LABELS } from '../types';

export interface PharmacistCheckPanelProps {
  pharmacistCheckStatus: 'ok' | 'error' | 'warning';
  prescriptionItemCount: number;
  auditErrorCount: number;
  auditWarningCount: number;
  auditInfoCount: number;
  visibleAuditIssues: PrescriptionInputAuditIssue[];
  hiddenAuditIssueCount: number;
  aiAssistMode: ReturnType<typeof normalizeAiAssistMode>;
  aiAssistSummary: ReturnType<typeof summarizeAiSuggestions>;
  allAiAssistSuggestionCount: number;
  aiAssistSuggestions: AiAssistSuggestion[];
  canReviewAiSuggestions: boolean;
  onOpenIntervention: () => void;
  onRecordAiSuggestionDecision: (suggestion: AiAssistSuggestion, decision: AiSuggestionDecision) => void;
}

export function PharmacistCheckPanel({
  pharmacistCheckStatus,
  prescriptionItemCount,
  auditErrorCount,
  auditWarningCount,
  auditInfoCount,
  visibleAuditIssues,
  hiddenAuditIssueCount,
  aiAssistMode,
  aiAssistSummary,
  allAiAssistSuggestionCount,
  aiAssistSuggestions,
  canReviewAiSuggestions,
  onOpenIntervention,
  onRecordAiSuggestionDecision
}: PharmacistCheckPanelProps) {
  return (
    <section
      className={`print-preview-card card claim-check-panel pharmacist-check-panel no-print ${pharmacistCheckStatus}`}
      data-testid="pharmacist-check-panel"
    >
      <div className="preview-header claim-check-header">
        <div>
          <h3>
            {pharmacistCheckStatus === 'ok' ? <CheckCircle size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            薬剤師確認
          </h3>
          <p className="claim-check-subtitle">
            {prescriptionItemCount.toLocaleString()}薬品 / 要修正 {auditErrorCount} / 要確認 {auditWarningCount} / 情報 {auditInfoCount} / AI補助 {aiAssistSummary.totalCount}（{AI_ASSIST_MODE_LABELS[aiAssistMode]}）
          </p>
        </div>
        <div className="claim-header-actions">
          <button
            type="button"
            className="btn-secondary compact-action"
            onClick={onOpenIntervention}
          >
            <MessageSquare size={16} aria-hidden="true" />
            <span>疑義照会を記録</span>
          </button>
          <span className={`claim-check-badge ${pharmacistCheckStatus}`}>
            {pharmacistCheckStatus === 'ok' ? '確認済' : auditErrorCount > 0 ? '修正あり' : '確認あり'}
          </span>
        </div>
      </div>

      {visibleAuditIssues.length === 0 ? (
        <div className="claim-check-ok-row">
          <CheckCircle size={18} aria-hidden="true" />
          <span>処方監査の確認事項はありません。</span>
        </div>
      ) : (
        <div className="claim-issue-list">
          {visibleAuditIssues.map((issue, index) => (
            <div key={`${issue.code}-${issue.itemIds?.join('-') || issue.rpId || index}`} className={`claim-issue ${issue.severity}`}>
              <div className="claim-issue-icon" aria-hidden="true">
                {issue.severity === 'info' ? <Info size={17} /> : <AlertTriangle size={17} />}
              </div>
              <div>
                <div className="claim-issue-title-row">
                  <strong className="claim-issue-title">{issue.title}</strong>
                  <span className={`claim-issue-severity ${issue.severity}`}>
                    {CLAIM_ISSUE_LABELS[issue.severity]}
                  </span>
                </div>
                <p className="claim-issue-message">{issue.message}</p>
              </div>
            </div>
          ))}
          {hiddenAuditIssueCount > 0 && (
            <div className="claim-issue-more">他 {hiddenAuditIssueCount} 件</div>
          )}
        </div>
      )}

      {allAiAssistSuggestionCount > aiAssistSuggestions.length && (
        <div className="ai-assist-mode-notice" role="status" data-testid="ai-assist-mode-notice">
          AI補助は「{AI_ASSIST_MODE_LABELS[aiAssistMode]}」です。
          {aiAssistMode === 'disabled'
            ? '候補表示を停止しています。通常の処方監査は継続します。'
            : `要修正以外の候補 ${allAiAssistSuggestionCount - aiAssistSuggestions.length}件を非表示にしています。`}
        </div>
      )}

      {aiAssistSuggestions.length > 0 && (
        <div className="ai-assist-panel" aria-label="AI補助提案">
          <div className="ai-assist-topline">
            <div className="ai-assist-heading">
              <Sparkles size={17} aria-hidden="true" />
              <strong>AI補助</strong>
              <span>根拠付き {aiAssistSummary.totalCount}件 / 最高信頼度 {aiAssistSummary.maxConfidence}%</span>
            </div>
            <span className="ai-assist-review-badge">薬剤師確認必須</span>
          </div>

          <div className="ai-assist-list">
            {aiAssistSuggestions.map((suggestion) => (
              <div
                key={suggestion.suggestionId}
                className={`ai-assist-item ${suggestion.severity}`}
                data-testid="ai-assist-suggestion"
              >
                <div className="ai-assist-item-main">
                  <div className="ai-assist-title-row">
                    <strong>{suggestion.title}</strong>
                  </div>
                  <p>{suggestion.suggestedAction}</p>
                  <div className="ai-assist-meta">
                    <span>信頼度 {formatAiSuggestionConfidence(suggestion)}</span>
                  </div>
                </div>
                <div className="ai-assist-actions">
                  <button
                    type="button"
                    className="btn-secondary compact-action ai-assist-decision"
                    onClick={() => onRecordAiSuggestionDecision(suggestion, 'accepted')}
                    disabled={!canReviewAiSuggestions}
                    title="採用として監査ログに記録"
                  >
                    <CheckCircle size={15} aria-hidden="true" />
                    <span>採用</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary compact-action ai-assist-decision"
                    onClick={() => onRecordAiSuggestionDecision(suggestion, 'modified')}
                    disabled={!canReviewAiSuggestions}
                    title="修正として監査ログに記録"
                  >
                    <Pencil size={15} aria-hidden="true" />
                    <span>修正</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary compact-action ai-assist-decision"
                    onClick={() => onRecordAiSuggestionDecision(suggestion, 'rejected')}
                    disabled={!canReviewAiSuggestions}
                    title="却下として監査ログに記録"
                  >
                    <XCircle size={15} aria-hidden="true" />
                    <span>却下</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
