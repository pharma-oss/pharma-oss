'use client';

import React, { useState, useMemo } from 'react';
import { Clipboard, Download, CheckCircle2, PackageCheck, AlertTriangle, ArrowRightLeft, Layers, CalendarClock } from 'lucide-react';
import { type InventoryOrderRisk } from '@/lib/inventory_order';
import { type EnhancedInventoryOrderRisk, type OrderRiskReason } from '@/lib/inventory_reorder_support';
import {
  type ReceivingDraft,
  defaultReceivingDraft,
  formatInventoryAmount
} from '../types';

export type OrderWorkbenchCandidate = EnhancedInventoryOrderRisk | InventoryOrderRisk;

export interface OrderWorkbenchProps {
    candidates: OrderWorkbenchCandidate[];
    orderedDrugIds: Set<string>;
    receivingDrafts: Record<string, ReceivingDraft>;
    receivingDrugId: string;
    onRequestTransfer: (candidate: OrderWorkbenchCandidate) => void;
    onToggleOrdered: (drugId: string) => void;
    onUpdateReceivingDraft: (candidate: OrderWorkbenchCandidate, patch: Partial<ReceivingDraft>) => void;
    onRegisterReceivedStock: (candidate: OrderWorkbenchCandidate) => void;
    onExportCsv: () => void;
    onCopyMemo: () => void;
    onExportReceivingChecklist: () => void;
    onCopyReceivingMemo: () => void;
    onClearOrdered: () => void;
}

export type OrderFilterReason = 'all' | 'prescription_shortage' | 'below_reorder_point' | 'expiring_soon';

function isEnhancedCandidate(candidate: OrderWorkbenchCandidate): candidate is EnhancedInventoryOrderRisk {
    return 'expiryRisk' in candidate && 'substitutes' in candidate;
}

export function OrderWorkbench({
    candidates,
    orderedDrugIds,
    receivingDrafts,
    receivingDrugId,
    onRequestTransfer,
    onToggleOrdered,
    onUpdateReceivingDraft,
    onRegisterReceivedStock,
    onExportCsv,
    onCopyMemo,
    onExportReceivingChecklist,
    onCopyReceivingMemo,
    onClearOrdered
}: OrderWorkbenchProps) {
    const [filterReason, setFilterReason] = useState<OrderFilterReason>('all');
    const [expandedSubstituteDrugIds, setExpandedSubstituteDrugIds] = useState<Set<string>>(new Set());

    const orderedCount = candidates.filter((candidate) => orderedDrugIds.has(candidate.drugId)).length;
    const openCount = candidates.length - orderedCount;
    const urgentCount = candidates.filter((candidate) => candidate.priority === 'high' && !orderedDrugIds.has(candidate.drugId)).length;
    const canExport = openCount > 0;

    // フィルタごとの件数集計
    const filterCounts = useMemo(() => {
        let prescriptionShortage = 0;
        let belowReorderPoint = 0;
        let expiringSoon = 0;

        for (const candidate of candidates) {
            if (isEnhancedCandidate(candidate)) {
                if (candidate.riskReason === 'prescription_shortage' || candidate.riskReason === 'combined') {
                    prescriptionShortage++;
                }
                if (candidate.riskReason === 'below_reorder_point' || candidate.riskReason === 'combined') {
                    belowReorderPoint++;
                }
                if (candidate.riskReason === 'expiring_soon' || candidate.expiryRisk.hasExpired || candidate.expiryRisk.hasUrgentExpiring) {
                    expiringSoon++;
                }
            } else {
                prescriptionShortage++;
            }
        }

        return {
            all: candidates.length,
            prescriptionShortage,
            belowReorderPoint,
            expiringSoon
        };
    }, [candidates]);

    // フィルタ適用
    const filteredCandidates = useMemo(() => {
        if (filterReason === 'all') return candidates;

        return candidates.filter((candidate) => {
            if (!isEnhancedCandidate(candidate)) {
                return filterReason === 'prescription_shortage';
            }
            if (filterReason === 'prescription_shortage') {
                return candidate.riskReason === 'prescription_shortage' || candidate.riskReason === 'combined';
            }
            if (filterReason === 'below_reorder_point') {
                return candidate.riskReason === 'below_reorder_point' || candidate.riskReason === 'combined';
            }
            if (filterReason === 'expiring_soon') {
                return candidate.riskReason === 'expiring_soon' || candidate.expiryRisk.hasExpired || candidate.expiryRisk.hasUrgentExpiring;
            }
            return true;
        });
    }, [candidates, filterReason]);

    const toggleSubstitutes = (drugId: string) => {
        setExpandedSubstituteDrugIds((prev) => {
            const next = new Set(prev);
            if (next.has(drugId)) next.delete(drugId);
            else next.add(drugId);
            return next;
        });
    };

    return (
        <div className="order-workbench">
            <div className="order-workbench-card">
                <div className="order-workbench-header">
                    <div>
                        <h3>発注ワークベンチ</h3>
                        <p className="text-muted">処方不足、発注点割れ、使用期限切迫の薬品を統合検知し、未対応と発注済みに分けて管理します。</p>
                    </div>
                    <div className="order-workbench-actions">
                        <button type="button" className="btn-secondary compact" onClick={onCopyMemo} disabled={!canExport}>
                            <Clipboard size={15} aria-hidden="true" />
                            <span>未対応メモ</span>
                        </button>
                        <button type="button" className="btn-primary compact" onClick={onExportCsv} disabled={!canExport}>
                            <Download size={15} aria-hidden="true" />
                            <span>CSV</span>
                        </button>
                        <button type="button" className="btn-secondary compact" onClick={onCopyReceivingMemo} disabled={orderedCount === 0}>
                            <Clipboard size={15} aria-hidden="true" />
                            <span>入庫メモ</span>
                        </button>
                        <button type="button" className="btn-secondary compact" onClick={onExportReceivingChecklist} disabled={orderedCount === 0}>
                            <Download size={15} aria-hidden="true" />
                            <span>入庫確認CSV</span>
                        </button>
                    </div>
                </div>

                <div className="order-summary-grid" aria-label="発注候補サマリー">
                    <div className="order-summary-item">
                        <span>未対応</span>
                        <strong>{openCount}</strong>
                    </div>
                    <div className="order-summary-item urgent">
                        <span>至急</span>
                        <strong>{urgentCount}</strong>
                    </div>
                    <div className="order-summary-item done">
                        <span>発注済み</span>
                        <strong>{orderedCount}</strong>
                    </div>
                </div>

                {/* 理由別フィルタタブ */}
                <div className="order-filter-bar" role="tablist" aria-label="発注理由絞り込み">
                    <button
                        type="button"
                        className={`order-filter-btn ${filterReason === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterReason('all')}
                        role="tab"
                        aria-selected={filterReason === 'all'}
                    >
                        すべて ({filterCounts.all})
                    </button>
                    <button
                        type="button"
                        className={`order-filter-btn ${filterReason === 'prescription_shortage' ? 'active' : ''}`}
                        onClick={() => setFilterReason('prescription_shortage')}
                        role="tab"
                        aria-selected={filterReason === 'prescription_shortage'}
                    >
                        処方不足 ({filterCounts.prescriptionShortage})
                    </button>
                    <button
                        type="button"
                        className={`order-filter-btn ${filterReason === 'below_reorder_point' ? 'active' : ''}`}
                        onClick={() => setFilterReason('below_reorder_point')}
                        role="tab"
                        aria-selected={filterReason === 'below_reorder_point'}
                    >
                        発注点割れ ({filterCounts.belowReorderPoint})
                    </button>
                    <button
                        type="button"
                        className={`order-filter-btn ${filterReason === 'expiring_soon' ? 'active' : ''}`}
                        onClick={() => setFilterReason('expiring_soon')}
                        role="tab"
                        aria-selected={filterReason === 'expiring_soon'}
                    >
                        期限切迫 ({filterCounts.expiringSoon})
                    </button>
                </div>

                {filteredCandidates.length === 0 ? (
                    <div className="order-empty">
                        現在、該当する発注候補はありません。
                    </div>
                ) : (
                    <div className="order-candidate-list">
                        {filteredCandidates.map((candidate) => {
                            const isOrdered = orderedDrugIds.has(candidate.drugId);
                            const receivingDraft = receivingDrafts[candidate.drugId] || defaultReceivingDraft(candidate);
                            const isReceiving = receivingDrugId === candidate.drugId;
                            const isEnhanced = isEnhancedCandidate(candidate);
                            const inStockSubstitutes = isEnhanced
                                ? candidate.substitutes.filter((sub) => sub.availableAmount > 0)
                                : [];
                            const isExpandedSubstitutes = expandedSubstituteDrugIds.has(candidate.drugId);

                            return (
                                <div key={candidate.drugId} className={`order-candidate-row ${candidate.priority} ${isOrdered ? 'ordered' : ''}`}>
                                    <div className="order-candidate-main">
                                        <div className="order-candidate-title">
                                            <span className={`order-priority ${candidate.priority}`}>{candidate.priority === 'high' ? '至急' : '注意'}</span>
                                            {isEnhanced && (
                                                <span className={`order-reason-tag ${candidate.riskReason}`}>
                                                    {candidate.riskReason === 'prescription_shortage'
                                                        ? '処方不足'
                                                        : candidate.riskReason === 'below_reorder_point'
                                                            ? '発注点割れ'
                                                            : candidate.riskReason === 'expiring_soon'
                                                                ? '期限切迫'
                                                                : '処方不足+発注点'}
                                                </span>
                                            )}
                                            <strong>{candidate.drugName}</strong>
                                        </div>
                                        <div className="order-candidate-meta">
                                            <span>棚: {candidate.location}</span>
                                            <span>仕入先: {candidate.supplierName}</span>
                                            {candidate.affectedVisitCount > 0 && (
                                                <span>{candidate.affectedVisitCount}件の処方に影響</span>
                                            )}
                                            {isEnhanced && candidate.reorderPoint > 0 && (
                                                <span className="order-meta-point">発注点: {formatInventoryAmount(candidate.reorderPoint)}</span>
                                            )}
                                            {isEnhanced && candidate.leadTimeDays > 0 && (
                                                <span>納品目安: {candidate.leadTimeDays}日</span>
                                            )}
                                            {isEnhanced && candidate.expiryRisk.hasExpired && (
                                                <span className="order-meta-expired">
                                                    <AlertTriangle size={12} aria-hidden="true" />
                                                    期限切れ: {formatInventoryAmount(candidate.expiryRisk.expiredQuantity)}
                                                </span>
                                            )}
                                            {isEnhanced && !candidate.expiryRisk.hasExpired && candidate.expiryRisk.hasUrgentExpiring && (
                                                <span className="order-meta-expiring-urgent">
                                                    <CalendarClock size={12} aria-hidden="true" />
                                                    切迫(60日以内): {formatInventoryAmount(candidate.expiryRisk.urgentExpiringQuantity)} (最短 {candidate.expiryRisk.nearestExpirationDate})
                                                </span>
                                            )}
                                            {isEnhanced && !candidate.expiryRisk.hasExpired && !candidate.expiryRisk.hasUrgentExpiring && candidate.expiryRisk.hasAttentionExpiring && (
                                                <span className="order-meta-expiring-attention">
                                                    <CalendarClock size={12} aria-hidden="true" />
                                                    切迫(半年以内): {formatInventoryAmount(candidate.expiryRisk.attentionExpiringQuantity)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="order-candidate-action">{candidate.actionLabel}</div>

                                        {/* 院内代替薬候補の表示 */}
                                        {isEnhanced && candidate.substitutes.length > 0 && (
                                            <div className="order-substitutes-section">
                                                <div className="order-substitutes-header">
                                                    <button
                                                        type="button"
                                                        className="order-substitutes-toggle"
                                                        onClick={() => toggleSubstitutes(candidate.drugId)}
                                                        aria-expanded={isExpandedSubstitutes}
                                                    >
                                                        <ArrowRightLeft size={13} aria-hidden="true" />
                                                        <span>
                                                            院内代替薬候補 {candidate.substitutes.length}件
                                                            {inStockSubstitutes.length > 0 && `（在庫あり ${inStockSubstitutes.length}品目）`}
                                                        </span>
                                                        <span className="toggle-indicator">{isExpandedSubstitutes ? '▲' : '▼'}</span>
                                                    </button>
                                                </div>

                                                {isExpandedSubstitutes ? (
                                                    <div className="order-substitutes-list">
                                                        {candidate.substitutes.map((sub) => (
                                                            <div key={sub.drugCode} className={`order-substitute-item ${sub.availableAmount > 0 ? 'in-stock' : 'out-of-stock'}`}>
                                                                <div className="sub-main">
                                                                    <span className="sub-name">{sub.drugName}</span>
                                                                    <span className="sub-type">{sub.isGeneric ? '後発' : '先発'}</span>
                                                                    {sub.price !== undefined && <span className="sub-price">{sub.price}円</span>}
                                                                </div>
                                                                <div className="sub-stock">
                                                                    <span className={`stock-badge ${sub.availableAmount > 0 ? 'positive' : 'zero'}`}>
                                                                        在庫: {formatInventoryAmount(sub.availableAmount)}
                                                                    </span>
                                                                    <span className="sub-location">{sub.location}</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : inStockSubstitutes.length > 0 ? (
                                                    <div className="order-substitutes-preview">
                                                        <span className="preview-label">有効代替:</span>
                                                        {inStockSubstitutes.slice(0, 2).map((sub) => (
                                                            <span key={sub.drugCode} className="substitute-chip">
                                                                {sub.drugName} (在庫: {formatInventoryAmount(sub.availableAmount)})
                                                            </span>
                                                        ))}
                                                        {inStockSubstitutes.length > 2 && (
                                                            <span className="preview-more">他 {inStockSubstitutes.length - 2}件</span>
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                    </div>

                                    <div className="order-candidate-amounts">
                                        {candidate.requiredAmount > 0 && (
                                            <span>処方必要 {formatInventoryAmount(candidate.requiredAmount)}</span>
                                        )}
                                        <span>現在庫 {formatInventoryAmount(candidate.availableAmount)}</span>
                                        {isEnhanced && candidate.reorderPoint > 0 && (
                                            <span>発注点 {formatInventoryAmount(candidate.reorderPoint)}</span>
                                        )}
                                        <strong>発注目安 {formatInventoryAmount(candidate.recommendedOrderAmount)}</strong>
                                    </div>

                                    <div className="order-candidate-buttons">
                                        {!isOrdered && (
                                            <button
                                                type="button"
                                                className="btn-secondary compact"
                                                onClick={() => onRequestTransfer(candidate)}
                                                title="不足数を引き継いで分譲(譲受)フォームを開きます"
                                            >
                                                分譲で融通
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={`order-status-button ${isOrdered ? 'ordered' : ''}`}
                                            onClick={() => onToggleOrdered(candidate.drugId)}
                                            aria-pressed={isOrdered}
                                        >
                                            {isOrdered ? <CheckCircle2 size={16} aria-hidden="true" /> : <PackageCheck size={16} aria-hidden="true" />}
                                            <span>{isOrdered ? '発注済み' : '発注済みにする'}</span>
                                        </button>
                                    </div>

                                    {isOrdered && (
                                        <div className="receiving-form" aria-label={`${candidate.drugName}の入庫登録`}>
                                            <label>
                                                <span>納品数量</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={receivingDraft.quantity}
                                                    onChange={(event) => onUpdateReceivingDraft(candidate, { quantity: event.target.value })}
                                                />
                                            </label>
                                            <label>
                                                <span>ロット</span>
                                                <input
                                                    type="text"
                                                    value={receivingDraft.lotNumber}
                                                    onChange={(event) => onUpdateReceivingDraft(candidate, { lotNumber: event.target.value })}
                                                />
                                            </label>
                                            <label>
                                                <span>使用期限</span>
                                                <input
                                                    type="date"
                                                    value={receivingDraft.expirationDate}
                                                    onChange={(event) => onUpdateReceivingDraft(candidate, { expirationDate: event.target.value })}
                                                />
                                            </label>
                                            <label>
                                                <span>入庫日</span>
                                                <input
                                                    type="date"
                                                    value={receivingDraft.arrivalDate}
                                                    onChange={(event) => onUpdateReceivingDraft(candidate, { arrivalDate: event.target.value })}
                                                />
                                            </label>
                                            <label>
                                                <span>仕入先</span>
                                                <input
                                                    type="text"
                                                    value={receivingDraft.supplierName}
                                                    onChange={(event) => onUpdateReceivingDraft(candidate, { supplierName: event.target.value })}
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                className="receiving-submit-button"
                                                onClick={() => onRegisterReceivedStock(candidate)}
                                                disabled={isReceiving}
                                            >
                                                <PackageCheck size={15} aria-hidden="true" />
                                                <span>{isReceiving ? '登録中...' : '入庫登録'}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {orderedCount > 0 && (
                    <div className="order-workbench-footer">
                        <button type="button" className="btn-secondary compact" onClick={onClearOrdered}>
                            発注済みチェックを解除
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
