'use client';

import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import type { ClaimValidationIssue } from '@/lib/claim_validation';
import { CLAIM_ISSUE_LABELS } from '../types';

export interface ClaimCheckPanelProps {
  claimCheckStatus: 'ok' | 'error' | 'warning';
  isSelfPayClaimExcluded: boolean;
  hasClaimErrors: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  issues: ClaimValidationIssue[];
}

export function ClaimCheckPanel({
  claimCheckStatus,
  isSelfPayClaimExcluded,
  hasClaimErrors,
  errorCount,
  warningCount,
  infoCount,
  issues
}: ClaimCheckPanelProps) {
  return (
    <section
      className={`print-preview-card card claim-check-panel no-print ${claimCheckStatus}`}
      data-testid="claim-check-panel"
    >
      <div className="preview-header claim-check-header">
        <div>
          <h3>
            {claimCheckStatus === 'ok' ? <CheckCircle size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            レセコン請求前チェック
          </h3>
          <p className="claim-check-subtitle">
            エラー {errorCount} 件 / 警告 {warningCount} 件 / 情報 {infoCount} 件
          </p>
        </div>
        <span className={`claim-check-badge ${claimCheckStatus}`}>
          {isSelfPayClaimExcluded ? '対象外' : claimCheckStatus === 'ok' ? '適合' : hasClaimErrors ? '要修正' : '要確認'}
        </span>
      </div>

      {issues.length > 0 && (
        <div className="claim-issue-list" aria-label="請求前チェック結果">
          {issues.slice(0, 10).map((issue, idx) => (
            <div key={`${issue.code}-${idx}`} className={`claim-issue-item ${issue.severity}`}>
              <div className="claim-issue-icon">
                {issue.severity === 'error' ? <AlertTriangle size={16} /> : issue.severity === 'warning' ? <AlertTriangle size={16} /> : <Info size={16} />}
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
        </div>
      )}
    </section>
  );
}
