'use client';

import React from 'react';
import { Download, FileCheck2, Package, Printer } from 'lucide-react';
import { SELF_PAY_UKE_BLOCKED_MESSAGE } from '@/lib/self_pay_claim';
import { UKE_UI_GUIDANCE } from '@/lib/receipt/uke_migration_policy';

export interface PrintHeaderActionsProps {
  canExportUke: boolean;
  canPrintDocuments: boolean;
  hasClaimErrors: boolean;
  isSelfPayClaimExcluded: boolean;
  onOpenPicking: () => void;
  onOpenOfficialUke: () => void;
  onDownloadLegacyUke: () => void;
  onPrint: () => void;
}

export function PrintHeaderActions({
  canExportUke,
  canPrintDocuments,
  hasClaimErrors,
  isSelfPayClaimExcluded,
  onOpenPicking,
  onOpenOfficialUke,
  onDownloadLegacyUke,
  onPrint
}: PrintHeaderActionsProps) {
  const legacyTitle = isSelfPayClaimExcluded
    ? SELF_PAY_UKE_BLOCKED_MESSAGE
    : hasClaimErrors
      ? UKE_UI_GUIDANCE.singleVisit.legacyButtonTitleWithErrors
      : UKE_UI_GUIDANCE.singleVisit.legacyButtonTitleReady;

  const officialTitle = isSelfPayClaimExcluded
    ? SELF_PAY_UKE_BLOCKED_MESSAGE
    : UKE_UI_GUIDANCE.singleVisit.officialButtonTitle;

  return (
    <div className="print-header-actions flex items-center gap-2">
      <button
        type="button"
        className="btn-secondary"
        onClick={onOpenPicking}
        title="薬歴入力画面でピッキング支援を開きます"
      >
        <Package size={16} aria-hidden="true" />
        <span>ピッキングへ</span>
      </button>
      <button
        type="button"
        className="btn-secondary official-uke-btn"
        onClick={onOpenOfficialUke}
        disabled={!canExportUke || isSelfPayClaimExcluded}
        data-testid="print-official-uke-button"
        title={officialTitle}
      >
        <FileCheck2 size={16} aria-hidden="true" />
        <span>公式UKE</span>
      </button>
      <details
        className="legacy-uke-details"
        data-testid="print-legacy-uke-disclosure"
      >
        <summary className="legacy-uke-summary">旧形式UKE</summary>
        <div className="legacy-uke-disclosure-body">
          <button
            type="button"
            className="btn-secondary legacy-uke-btn"
            onClick={onDownloadLegacyUke}
            disabled={!canExportUke || hasClaimErrors || isSelfPayClaimExcluded}
            data-testid="print-uke-export-button"
            title={legacyTitle}
          >
            <Download size={16} aria-hidden="true" />
            <span>UKE出力</span>
          </button>
        </div>
      </details>
      <button
        type="button"
        className="btn-primary"
        onClick={onPrint}
        disabled={!canPrintDocuments}
        data-testid="print-execute-button"
      >
        <Printer size={16} aria-hidden="true" />
        <span>印刷実行</span>
      </button>
    </div>
  );
}
