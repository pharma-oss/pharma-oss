'use client';

import React, { useState, useEffect } from 'react';
import { Location } from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import { logAuditAction } from '@/lib/audit';
import { type DrugWithSearchCache, toHalfWidth } from '../types';

export interface InventoryRowProps {
    drug: DrugWithSearchCache;
    pendingStock: number;
    db: any;
    locations: Location[];
}

export const InventoryRow = React.memo(function InventoryRow({ drug, pendingStock, db, locations }: InventoryRowProps) {
    const totalStock = drug.stockQuantity ?? 0;
    const availableStock = totalStock - pendingStock;
    const isTotalStockNegative = totalStock < 0;
    const isAvailableStockNegative = availableStock < 0;
    const [isAdjusting, setIsAdjusting] = useState(false);

    const handleAdjustNegativeStock = async () => {
        if (!db || !drug.doc || totalStock >= 0) return;

        const shortageAmount = Math.abs(totalStock);
        const confirmed = window.confirm(
            `${drug.name} の現在庫 ${totalStock} を 0 に補正します。\n` +
            `不足 ${shortageAmount.toLocaleString()} 分を入荷・実地補正済みとして扱います。よろしいですか？`
        );

        if (!confirmed) return;

        setIsAdjusting(true);
        try {
            const previousStockQuantity = totalStock;
            const newStockQuantity = 0;
            const difference = newStockQuantity - previousStockQuantity;

            await drug.doc.patch({ stockQuantity: newStockQuantity });
            const auditOk = await logAuditAction(
                db,
                'stock_update',
                `マイナス在庫0補正: ${drug.name} を ${previousStockQuantity} から ${newStockQuantity} へ補正しました（差分 +${difference}）。`
            );

            if (!auditOk) {
                try {
                    await drug.doc.patch({ stockQuantity: previousStockQuantity });
                    alert(`${drug.name} の監査ログを記録できなかったため、在庫補正を取り消しました。`);
                } catch (rollbackError) {
                    console.error('Failed to rollback negative stock adjustment:', rollbackError);
                    alert(`${drug.name} の現在庫は 0 に補正しましたが、監査ログ記録と在庫補正の取り消しに失敗しました。管理者に確認してください。`);
                }
                return;
            }

            alert(`${drug.name} の現在庫を 0 に補正し、監査ログに記録しました。`);
        } catch (error) {
            console.error('Failed to adjust negative stock:', error);
            alert('在庫補正に失敗しました。');
        } finally {
            setIsAdjusting(false);
        }
    };

    return (
        <tr>
            {/* 一般名マスタ(【般】)はYJコードを持たないため一般名コードで代替表示する */}
            <td>{drug.yjCode || drug.code}</td>
            <td
                className="text-right"
                style={{ fontWeight: isTotalStockNegative ? 'bold' : 'normal', color: isTotalStockNegative ? 'var(--destructive)' : 'inherit' }}
            >
                {totalStock}
            </td>
            <td className="text-right">{pendingStock > 0 ? pendingStock : '-'}</td>
            <td
                className="text-right"
                style={{ fontWeight: isAvailableStockNegative ? 'bold' : 'normal', color: isAvailableStockNegative ? 'var(--destructive)' : 'inherit' }}
            >
                {availableStock}
            </td>
            <td>
                <div className="inventory-name-cell">
                    <span>{drug.name}</span>
                    {isTotalStockNegative && (
                        <button
                            type="button"
                            className="inline-adjust-button"
                            onClick={handleAdjustNegativeStock}
                            disabled={isAdjusting}
                            title="現在庫を0へ補正"
                        >
                            {isAdjusting ? '補正中...' : '0へ補正'}
                        </button>
                    )}
                </div>
            </td>
            <td>
                <LocationEditor
                    drug={drug}
                    db={db}
                    locations={locations}
                />
            </td>
        </tr>
    );
});

// Separate component for location editing to isolate state and logic
const LocationEditor = React.memo(function LocationEditor({ drug, db, locations }: { drug: DrugWithSearchCache, db: any, locations: Location[] }) {
    const defaultParts = drug.location ? drug.location.split('-') : ['', '', ''];
    const [part1, setPart1] = useState(defaultParts[0] || '');
    const [part2, setPart2] = useState(defaultParts[1] || '');
    const [part3, setPart3] = useState(defaultParts[2] || '');

    // Sync with external changes if any
    useEffect(() => {
        const parts = drug.location ? drug.location.split('-') : ['', '', ''];
        setPart1(parts[0] || '');
        setPart2(parts[1] || '');
        setPart3(parts[2] || '');
    }, [drug.location]);

    const handleSave = async () => {
        if (!db) return;

        const p1 = toHalfWidth(part1.trim());
        const p2 = toHalfWidth(part2.trim());
        const p3 = toHalfWidth(part3.trim());

        setPart1(p1);
        setPart2(p2);
        setPart3(p3);

        if (!p1 && !p2 && !p3) {
            if (drug.doc) {
                await drug.doc.patch({ location: '' });
            }
            return;
        }

        const locationString = `${p1}-${p2}-${p3}`;

        let exists = false;
        for (let i = 0; i < locations.length; i++) {
            const l = locations[i];
            if (l.part1 === p1 && l.part2 === p2 && l.part3 === p3) {
                exists = true;
                break;
            }
        }

        if (!exists) {
            if (window.confirm(`棚番地「${locationString}」はマスターに存在しません。新しく作成しますか？`)) {
                await db.locations.insert({
                    id: generateUUID(),
                    part1: p1,
                    part2: p2,
                    part3: p3,
                    displayText: locationString
                });
            } else {
                return;
            }
        }

        if (drug.doc) {
            await drug.doc.patch({ location: locationString });
        }
    };

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
            handleSave();
        }
    };

    return (
        <div className="location-inputs" onBlur={handleBlur} tabIndex={-1}>
            <input
                type="text"
                value={part1}
                onChange={e => setPart1(toHalfWidth(e.target.value))}
                maxLength={10}
                aria-label="棚番地パート1"
            />
            <span aria-hidden="true">-</span>
            <input
                type="text"
                value={part2}
                onChange={e => setPart2(toHalfWidth(e.target.value))}
                maxLength={10}
                aria-label="棚番地パート2"
            />
            <span aria-hidden="true">-</span>
            <input
                type="text"
                value={part3}
                onChange={e => setPart3(toHalfWidth(e.target.value))}
                maxLength={10}
                aria-label="棚番地パート3"
            />
        </div>
    );
});
