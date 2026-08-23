'use client';

import React, { useCallback } from 'react';
import { Copy, Download, PackageSearch } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { buildInventoryOrderCsv, buildInventoryOrderMemo, formatDateForFileName, formatInventoryAmount } from '@/lib/inventory_order';
import { downloadUtf8Csv } from '@/lib/dashboard_helpers';
import { EmptyState } from './DashboardCards';
import { InventoryRiskRow } from './DashboardRows';
import type { DashboardCounts, DashboardInventoryRisk } from '@/hooks/useDashboardTasks';

export interface InventoryAlertSectionProps {
  inventoryRisks: DashboardInventoryRisk[];
  counts: DashboardCounts;
  isLoading: boolean;
}

export function InventoryAlertSection({
  inventoryRisks,
  counts,
  isLoading
}: InventoryAlertSectionProps) {
  const router = useRouter();
  const visibleInventoryRisks = inventoryRisks.slice(0, 5);
  const urgentInventoryRiskCount = inventoryRisks.filter((risk) => risk.priority === 'high').length;

  const handleCopyInventoryOrderMemo = useCallback(async () => {
    if (inventoryRisks.length === 0) return;
    const memo = buildInventoryOrderMemo(inventoryRisks);
    try {
      await navigator.clipboard.writeText(memo);
      toast.success('発注・融通メモをコピーしました');
    } catch {
      toast.error('メモのコピーに失敗しました。');
    }
  }, [inventoryRisks]);

  const handleExportInventoryOrderCsv = useCallback(() => {
    if (inventoryRisks.length === 0) return;
    const csv = buildInventoryOrderCsv(inventoryRisks);
    const fileName = `inventory_order_${formatDateForFileName(new Date())}.csv`;
    downloadUtf8Csv(fileName, csv);
    toast.success('発注候補CSVを作成しました');
  }, [inventoryRisks]);

  return (
    <section id="inventory-risk-queue" className="inventory-risk-section" aria-label="在庫不足リスク">
      <div className="section-header">
        <div>
          <span className="section-title-line">
            <PackageSearch size={16} aria-hidden="true" />
            <h3>在庫不足リスク</h3>
          </span>
          <p className="text-muted">受付中・調剤中の処方から必要量を合算し、発注・融通確認が必要な薬品を先に出します（在庫管理連携）。</p>
        </div>
        <div className="section-metrics">
          <button
            type="button"
            className="section-action-button"
            onClick={handleCopyInventoryOrderMemo}
            disabled={inventoryRisks.length === 0}
          >
            <Copy size={14} aria-hidden="true" />
            <span>発注メモ</span>
          </button>
          <button
            type="button"
            className="section-action-button primary"
            onClick={handleExportInventoryOrderCsv}
            disabled={inventoryRisks.length === 0}
          >
            <Download size={14} aria-hidden="true" />
            <span>CSV</span>
          </button>
          {urgentInventoryRiskCount > 0 && <span className="section-count urgent">至急 {urgentInventoryRiskCount}</span>}
          <span className="section-count">{counts.inventoryShortageCount}品目</span>
        </div>
      </div>

      <div className="inventory-risk-list">
        {isLoading && <EmptyState text="在庫リスクを読み込んでいます..." tone="loading" />}
        {!isLoading && visibleInventoryRisks.map((risk) => (
          <InventoryRiskRow
            key={risk.drugId}
            drugName={risk.drugName}
            location={risk.location}
            supplierName={risk.supplierName}
            requiredAmount={risk.requiredAmount}
            availableAmount={risk.availableAmount}
            shortageAmount={risk.shortageAmount}
            recommendedOrderAmount={risk.recommendedOrderAmount}
            affectedVisitCount={risk.affectedVisitCount}
            affectedPatientNames={risk.affectedPatientNames}
            priority={risk.priority}
            actionLabel={risk.actionLabel}
            pickingShortageAmount={risk.pickingShortageAmount}
            onOpen={() => router.push('/inventory?tab=order-workbench')}
          />
        ))}
        {!isLoading && visibleInventoryRisks.length === 0 && <EmptyState text="現在、在庫不足リスクはありません。" />}
      </div>
    </section>
  );
}
