import React from 'react';
import { Info } from 'lucide-react';
import { SELF_PAY_CLAIM_EXCLUSION_NOTE } from '@/lib/self_pay_claim';
import { formatYen } from '@/lib/billing';

export interface ReceiptConsoleSummaryPanelProps {
  totalPoints: number;
  patientCopayYen: number;
  burdenRatio: number;
  isSelfPayClaimExcluded: boolean;
  pharmacistCheckStatus: string;
  pharmacistErrorCount: number;
  claimCheckStatus: string;
  claimValidationErrorCount: number;
  claimLifecycleLocked: boolean;
  claimLifecycleStatus: string;
  claimLifecycleLabel: string;
  pharmacyDeviceFlowStatus: string;
  pharmacyDeviceLabel: string;
  electronicPrescriptionFlowStatus: string;
  electronicPrescriptionLabel: string;
}

export const ReceiptConsoleSummaryPanel = React.memo(function ReceiptConsoleSummaryPanel({
  totalPoints,
  patientCopayYen,
  burdenRatio,
  isSelfPayClaimExcluded,
  pharmacistCheckStatus,
  pharmacistErrorCount,
  claimCheckStatus,
  claimValidationErrorCount,
  claimLifecycleLocked,
  claimLifecycleStatus,
  claimLifecycleLabel,
  pharmacyDeviceFlowStatus,
  pharmacyDeviceLabel,
  electronicPrescriptionFlowStatus,
  electronicPrescriptionLabel
}: ReceiptConsoleSummaryPanelProps) {
  return (
    <>
      <div className="receipt-console-main">
        <div>
          <span className="console-kicker">RECEIPT COMPUTATION CONSOLE</span>
          <h2>算定・請求前点検・帳票管理</h2>
          <p>保険調剤点数、請求前チェック、UKE出力、印刷帳票のプレビューを調停します。</p>
        </div>
        <div className="console-total">
          <span>合計請求点数</span>
          <strong>{totalPoints.toLocaleString()} 点</strong>
          <small>患者負担 ¥{formatYen(patientCopayYen)}（{burdenRatio}%）</small>
        </div>
      </div>

      {isSelfPayClaimExcluded && (
        <p className="claim-self-pay-note" role="status" data-testid="print-self-pay-claim-note">
          <Info size={14} aria-hidden="true" /> {SELF_PAY_CLAIM_EXCLUSION_NOTE}
        </p>
      )}

      <div className="receipt-flow-grid">
        <div className={`receipt-flow-step ${pharmacistCheckStatus}`}>
          <span>1 薬剤師確認</span>
          <strong>{pharmacistCheckStatus === 'ok' ? '確認済' : `${pharmacistErrorCount}件 修正要`}</strong>
        </div>
        <div className={`receipt-flow-step ${claimCheckStatus}`}>
          <span>2 請求前チェック</span>
          <strong>{isSelfPayClaimExcluded ? '対象外（自費）' : claimCheckStatus === 'ok' ? '適合' : `${claimValidationErrorCount}件 不備`}</strong>
        </div>
        <div className={`receipt-flow-step ${claimLifecycleLocked ? 'locked' : claimLifecycleStatus}`}>
          <span>3 請求ロック</span>
          <strong>{claimLifecycleLabel}</strong>
        </div>
        <div className={`receipt-flow-step ${pharmacyDeviceFlowStatus}`}>
          <span>4 調剤機器</span>
          <strong>{pharmacyDeviceLabel}</strong>
        </div>
        <div className={`receipt-flow-step ${electronicPrescriptionFlowStatus}`}>
          <span>5 電子処方箋</span>
          <strong>{electronicPrescriptionLabel}</strong>
        </div>
      </div>
    </>
  );
});
