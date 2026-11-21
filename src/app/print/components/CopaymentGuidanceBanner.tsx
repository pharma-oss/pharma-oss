import React from 'react';
import type { buildVisitCopaymentGuidance } from '@/lib/patient_copayment_support';

export type VisitCopaymentGuidance = ReturnType<typeof buildVisitCopaymentGuidance>;

export interface CopaymentGuidanceBannerProps {
  guidance: VisitCopaymentGuidance;
}

export const CopaymentGuidanceBanner = React.memo(function CopaymentGuidanceBanner({
  guidance
}: CopaymentGuidanceBannerProps) {
  if (!guidance.hasGuidance) {
    return null;
  }

  return (
    <div
      className={`copayment-guidance-banner alert-${guidance.alertType}`}
      data-testid="copayment-guidance-banner"
    >
      {guidance.items.map((item, idx) => (
        <p key={idx} className="copayment-guidance-item">
          ⚠️ {item}
        </p>
      ))}
    </div>
  );
});
