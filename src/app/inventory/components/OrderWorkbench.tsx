'use client';

import React from 'react';
import { Clipboard, Download, CheckCircle2, PackageCheck } from 'lucide-react';
import { type InventoryOrderRisk } from '@/lib/inventory_order';
import {
  type ReceivingDraft,
  defaultReceivingDraft,
  formatInventoryAmount
} from '../types';

export interface OrderWorkbenchProps {
    candidates: InventoryOrderRisk[];
    orderedDrugIds: Set<string>;
    receivingDrafts: Record<string, ReceivingDraft>;
    receivingDrugId: string;
    onRequestTransfer: (candidate: InventoryOrderRisk) => void;
    onToggleOrdered: (drugId: string) => void;
    onUpdateReceivingDraft: (candidate: InventoryOrderRisk, patch: Partial<ReceivingDraft>) => void;
    onRegisterReceivedStock: (candidate: InventoryOrderRisk) => void;
    onExportCsv: () => void;
    onCopyMemo: () => void;
    onExportReceivingChecklist: () => void;
    onCopyReceivingMemo: () => void;
    onClearOrdered: () => void;
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
    const orderedCount = candidates.filter((candidate) => orderedDrugIds.has(candidate.drugId)).length;
    const openCount = candidates.length - orderedCount;
    const urgentCount = candidates.filter((candidate) => candidate.priority === 'high' && !orderedDrugIds.has(candidate.drugId)).length;
    const canExport = openCount > 0;

    return (
        <div className="order-workbench">
            <div className="order-workbench-card">
                <div className="order-workbench-header">
                    <div>
                        <h3>発注ワークベンチ</h3>
                        <p className="text-muted">受付中・調剤中の処方で不足する薬品を、未対応と発注済みに分けて管理します。</p>
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

                {candidates.length === 0 ? (
                    <div className="order-empty">
                        現在、発注候補はありません。
                    </div>
                ) : (
                    <div className="order-candidate-list">
                        {candidates.map((candidate) => {
                            const isOrdered = orderedDrugIds.has(candidate.drugId);
                            const receivingDraft = receivingDrafts[candidate.drugId] || defaultReceivingDraft(candidate);
                            const isReceiving = receivingDrugId === candidate.drugId;
                            return (
                                <div key={candidate.drugId} className={`order-candidate-row ${candidate.priority} ${isOrdered ? 'ordered' : ''}`}>
                                    <div className="order-candidate-main">
                                        <div className="order-candidate-title">
                                            <span className={`order-priority ${candidate.priority}`}>{candidate.priority === 'high' ? '至急' : '注意'}</span>
                                            <strong>{candidate.drugName}</strong>
                                        </div>
                                        <div className="order-candidate-meta">
                                            <span>{candidate.location}</span>
                                            <span>仕入先候補 {candidate.supplierName}</span>
                                            <span>{candidate.affectedVisitCount}件に影響</span>
                                        </div>
                                        <div className="order-candidate-action">{candidate.actionLabel}</div>
                                    </div>
                                    <div className="order-candidate-amounts">
                                        <span>必要 {formatInventoryAmount(candidate.requiredAmount)}</span>
                                        <span>在庫 {formatInventoryAmount(candidate.availableAmount)}</span>
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
