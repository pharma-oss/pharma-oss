'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Download } from 'lucide-react';
import { DrugStock } from '@/db/types';
import { buildDeadStockCsv, buildDeadStockReport, type DeadStockEntry } from '@/lib/dead_stock';
import type { DrugWithSearchCache } from '../types';

export interface DeadStockPanelProps {
    db: any;
    drugs: DrugWithSearchCache[];
    stockLots: DrugStock[];
    onOpenTransfer: (entry: DeadStockEntry) => void;
}

export function DeadStockPanel({ db, drugs, stockLots, onOpenTransfer }: DeadStockPanelProps) {
    const [thresholdDays, setThresholdDays] = useState(90);
    const [movementSources, setMovementSources] = useState<{ items: any[]; visits: any[] } | null>(null);

    useEffect(() => {
        let isMounted = true;
        const loadMovementSources = async () => {
            if (!db) return;
            try {
                const [itemDocs, visitDocs] = await Promise.all([
                    db.prescription_items.find().exec(),
                    db.visits.find().exec()
                ]);
                if (!isMounted) return;
                setMovementSources({
                    items: itemDocs.map((doc: any) => ({ visitId: doc.visitId, drugId: doc.drugId, dispensedDrugCode: doc.dispensedDrugCode })),
                    visits: visitDocs.map((doc: any) => ({ visitId: doc.visitId, issueDate: doc.issueDate, status: doc.status }))
                });
            } catch (error) {
                console.error('Failed to load movement sources for dead stock:', error);
            }
        };
        loadMovementSources();
        return () => { isMounted = false; };
    }, [db]);

    const entries: DeadStockEntry[] = useMemo(() => {
        if (!movementSources) return [];
        return buildDeadStockReport({
            drugs,
            stockLots,
            prescriptionItems: movementSources.items,
            visits: movementSources.visits,
            thresholdDays
        });
    }, [drugs, stockLots, movementSources, thresholdDays]);

    const totalValue = useMemo(
        () => Math.round(entries.reduce((sum, entry) => sum + entry.stockValue, 0) * 100) / 100,
        [entries]
    );

    const handleExportCsv = () => {
        if (entries.length === 0) return;
        const csv = buildDeadStockCsv(entries);
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `dead_stock_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="dead-stock-panel">
            <div className="card">
                <div className="dead-stock-header">
                    <div>
                        <h3>不動在庫</h3>
                        <p className="text-muted">
                            指定期間、調剤(出庫)も入荷もない在庫です。分譲・返品・期限確認の候補になります。
                        </p>
                    </div>
                    <div className="dead-stock-controls">
                        <label>
                            滞留
                            <select value={thresholdDays} onChange={(e) => setThresholdDays(parseInt(e.target.value, 10))} aria-label="不動在庫の滞留日数しきい値">
                                <option value={30}>30日以上</option>
                                <option value={60}>60日以上</option>
                                <option value={90}>90日以上</option>
                                <option value={180}>180日以上</option>
                            </select>
                        </label>
                        <button type="button" className="btn-secondary" onClick={handleExportCsv} disabled={entries.length === 0}>
                            <Download size={14} aria-hidden="true" /> CSV
                        </button>
                    </div>
                </div>

                <div className="dead-stock-summary">
                    <span>該当 <strong>{entries.length}</strong> 品目</span>
                    <span>在庫金額(薬価) <strong>{totalValue.toLocaleString()}</strong> 円</span>
                </div>

                {!movementSources ? (
                    <p className="text-muted">入出庫の記録を確認しています...</p>
                ) : entries.length === 0 ? (
                    <p className="text-muted">条件に該当する不動在庫はありません。</p>
                ) : (
                    <div className="dead-stock-table-wrap">
                        <table className="dead-stock-table">
                            <thead>
                                <tr>
                                    <th>薬品</th>
                                    <th>棚位置</th>
                                    <th className="text-right">在庫数</th>
                                    <th className="text-right">金額</th>
                                    <th>最終調剤</th>
                                    <th>最終入荷</th>
                                    <th className="text-right">滞留</th>
                                    <th>直近期限</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((entry) => (
                                    <tr key={entry.drugCode}>
                                        <td className="dead-stock-drug">{entry.drugName}</td>
                                        <td>{entry.location}</td>
                                        <td className="text-right">{entry.stockQuantity}</td>
                                        <td className="text-right">{entry.stockValue.toLocaleString()}円</td>
                                        <td>{entry.lastDispensedAt || '-'}</td>
                                        <td>{entry.lastArrivalAt || '-'}</td>
                                        <td className="text-right">
                                            {entry.idleDays === null
                                                ? <span className="dead-stock-flag">記録なし</span>
                                                : `${entry.idleDays}日`}
                                        </td>
                                        <td>
                                            {entry.nearestExpiry || '-'}
                                            {entry.isExpiringSoon && <span className="dead-stock-flag expiry">期限注意</span>}
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                onClick={() => onOpenTransfer(entry)}
                                                title="薬品と在庫数を引き継いで分譲(譲渡)フォームを開きます"
                                            >
                                                分譲へ
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
