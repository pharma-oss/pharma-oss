'use client';

import { AlertCircle } from 'lucide-react';
import { EmptyState } from './DashboardCards';
import { ClaimRiskRow } from './DashboardRows';
import type { DashboardClaimRisk, DashboardCounts } from '@/hooks/useDashboardTasks';

export interface ClaimRiskSectionProps {
  claimRisks: DashboardClaimRisk[];
  counts: DashboardCounts;
  urgentClaimRiskCount: number;
  isLoading: boolean;
  onOpenTask: (visitId: string) => void;
}

export function ClaimRiskSection({
  claimRisks,
  counts,
  urgentClaimRiskCount,
  isLoading,
  onOpenTask
}: ClaimRiskSectionProps) {
  const visibleClaimRisks = claimRisks.slice(0, 5);

  return (
    <section id="claim-risk-queue" className="claim-risk-section" aria-label="返戻・請求リスク" data-testid="claim-risk-queue">
      <div className="section-header">
        <div>
          <span className="section-title-line">
            <AlertCircle size={16} aria-hidden="true" />
            <h3>返戻・請求リスク</h3>
          </span>
          <p className="text-muted">印刷・UKE出力前の請求チェックを横断し、保険情報・薬品マスタ・算定設定の修正候補を先に出します。</p>
        </div>
        <div className="section-metrics">
          {urgentClaimRiskCount > 0 && <span className="section-count urgent">要修正 {urgentClaimRiskCount}</span>}
          <span className="section-count">{counts.claimRiskCount}件</span>
        </div>
      </div>

      <div className="claim-risk-list">
        {isLoading && <EmptyState text="請求リスクを読み込んでいます..." tone="loading" />}
        {!isLoading && visibleClaimRisks.map((risk) => (
          <ClaimRiskRow
            key={risk.visitId}
            name={risk.name}
            time={risk.time}
            prescriptionCount={risk.prescriptionCount}
            totalPoints={risk.totalPoints}
            errorCount={risk.errorCount}
            warningCount={risk.warningCount}
            priority={risk.priority}
            riskScore={risk.riskScore}
            topIssueTitles={risk.topIssueTitles}
            actionLabel={risk.actionLabel}
            onOpen={() => onOpenTask(risk.visitId)}
          />
        ))}
        {!isLoading && visibleClaimRisks.length === 0 && <EmptyState text="現在、請求・返戻リスクはありません。" />}
      </div>
      {!isLoading && (counts.selfPayClaimExcludedCount ?? 0) > 0 && (
        <p className="text-muted" data-testid="claim-risk-self-pay-note">
          保険種別が「自費」の患者 {counts.selfPayClaimExcludedCount}件は、請求の対象外のため、この一覧に含めていません。
        </p>
      )}
    </section>
  );
}
