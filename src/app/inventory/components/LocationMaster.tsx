'use client';

import React, { useState, useMemo } from 'react';
import { Location } from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import { type DrugWithSearchCache, toHalfWidth } from '../types';

export const buildLocationDisplayText = (p1: string, p2: string, p3: string): string => (
    [p1, p2, p3].filter(Boolean).join('-')
);

export interface LocationMasterProps {
    db: any;
    locations: Location[];
    drugs: DrugWithSearchCache[];
}

export function LocationMaster({ db, locations, drugs }: LocationMasterProps) {
    const [part1, setPart1] = useState('');
    const [part2, setPart2] = useState('');
    const [part3, setPart3] = useState('');
    const [bulkPrefix, setBulkPrefix] = useState('');
    const [bulkStart, setBulkStart] = useState('1');
    const [bulkEnd, setBulkEnd] = useState('10');
    const [isBulkCreating, setIsBulkCreating] = useState(false);

    const isInputEmpty = !part1.trim() && !part2.trim() && !part3.trim();

    // 棚番ごとの使用状況(薬品マスタのlocationと照合)
    const usageByLocation = useMemo(() => {
        const map = new Map<string, number>();
        for (const drug of drugs) {
            if (!drug.location) continue;
            map.set(drug.location, (map.get(drug.location) || 0) + 1);
        }
        return map;
    }, [drugs]);

    const sortedLocations = useMemo(() => (
        locations.slice().sort((a, b) => a.displayText.localeCompare(b.displayText, 'ja', { numeric: true }))
    ), [locations]);

    const unusedLocations = useMemo(
        () => sortedLocations.filter((loc) => !(usageByLocation.get(loc.displayText))),
        [sortedLocations, usageByLocation]
    );

    const unassignedStockedCount = useMemo(
        () => drugs.reduce((count, drug) => count + (((drug.stockQuantity || 0) > 0 && !drug.location) ? 1 : 0), 0),
        [drugs]
    );

    const handleBulkCreate = async () => {
        if (!db || isBulkCreating) return;
        const prefix = bulkPrefix.trim();
        const start = parseInt(bulkStart, 10);
        const end = parseInt(bulkEnd, 10);
        if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start) {
            alert('開始番号と終了番号を正しく入力してください(例: 1 〜 10)。');
            return;
        }
        if (end - start + 1 > 200) {
            alert('一括作成は一度に最大200件までです。');
            return;
        }

        setIsBulkCreating(true);
        try {
            const existingSet = new Set(locations.map((l) => l.displayText));
            const padLength = String(end).length >= 2 ? String(end).length : 2;
            const newDocs: any[] = [];

            for (let num = start; num <= end; num += 1) {
                const numStr = String(num).padStart(padLength, '0');
                const displayText = prefix ? `${prefix}-${numStr}` : numStr;
                if (existingSet.has(displayText)) continue;

                newDocs.push({
                    id: generateUUID(),
                    part1: prefix,
                    part2: numStr,
                    part3: '',
                    displayText
                });
            }

            if (newDocs.length === 0) {
                alert('作成対象の棚番はすべて登録済みです。');
                return;
            }

            await db.locations.bulkInsert(newDocs);
            setBulkPrefix('');
            setBulkStart('1');
            setBulkEnd('10');
        } catch (err: any) {
            console.error('Failed to bulk create locations', err);
            alert(`棚番の一括作成に失敗しました: ${err?.message || err}`);
        } finally {
            setIsBulkCreating(false);
        }
    };

    const handleDeleteUnused = async () => {
        if (!db || unusedLocations.length === 0) return;
        if (window.confirm(`未使用の棚番 ${unusedLocations.length}件 をすべて削除しますか？`)) {
            try {
                const ids = unusedLocations.map((l) => l.id);
                const docs = await db.locations.find({ selector: { id: { $in: ids } } }).exec();
                await Promise.all(docs.map((d: any) => d.remove()));
            } catch (err: any) {
                console.error('Failed to delete unused locations', err);
                alert('未使用棚番の削除に失敗しました。');
            }
        }
    };

    const handleAdd = async () => {
        if (!db || isInputEmpty) return;

        const p1 = part1.trim();
        const p2 = part2.trim();
        const p3 = part3.trim();
        const locationString = buildLocationDisplayText(p1, p2, p3);

        const existing = locations.find(l => l.displayText === locationString);
        if (existing) {
            alert('この棚番地は既に登録されています');
            return;
        }

        await db.locations.insert({
            id: generateUUID(),
            part1: p1,
            part2: p2,
            part3: p3,
            displayText: locationString
        });

        setPart1('');
        setPart2('');
        setPart3('');
    };

    const handleDelete = async (id: string) => {
        if (!db) return;
        if (window.confirm('この棚番地を削除しますか？')) {
            const doc = await db.locations.findOne(id).exec();
            if (doc) {
                await doc.remove();
            }
        }
    };

    return (
        <div className="location-master">
            <div className="add-location card">
                <h3>棚番の一括作成</h3>
                <p className="location-help-text">
                    「A-01 〜 A-10」のような連番の棚番をまとめて作成します。登録済みの棚番はスキップします。
                </p>
                <div className="location-inputs">
                    <input
                        type="text"
                        placeholder="A"
                        value={bulkPrefix}
                        onChange={e => setBulkPrefix(toHalfWidth(e.target.value))}
                        maxLength={10}
                        aria-label="一括作成する棚のプレフィックス"
                        className="location-code-input"
                    />
                    <span aria-hidden="true">-</span>
                    <input
                        type="number"
                        min={0}
                        value={bulkStart}
                        onChange={e => setBulkStart(e.target.value)}
                        aria-label="一括作成の開始番号"
                        className="location-code-input"
                    />
                    <span aria-hidden="true">〜</span>
                    <input
                        type="number"
                        min={0}
                        value={bulkEnd}
                        onChange={e => setBulkEnd(e.target.value)}
                        aria-label="一括作成の終了番号"
                        className="location-code-input"
                    />
                    <button className="btn-primary" onClick={handleBulkCreate} disabled={isBulkCreating}>
                        {isBulkCreating ? '作成中...' : '一括作成'}
                    </button>
                </div>
            </div>

            <div className="add-location card">
                <h3>新しい棚番地を追加</h3>
                <div className="location-inputs">
                    <input
                        type="text"
                        placeholder="あ"
                        value={part1}
                        onChange={e => setPart1(toHalfWidth(e.target.value))}
                        maxLength={10}
                        aria-label="新しい棚番地パート1"
                    />
                    <span aria-hidden="true">-</span>
                    <input
                        type="text"
                        placeholder="A"
                        value={part2}
                        onChange={e => setPart2(toHalfWidth(e.target.value))}
                        maxLength={10}
                        aria-label="新しい棚番地パート2"
                    />
                    <span aria-hidden="true">-</span>
                    <input
                        type="text"
                        placeholder="1"
                        value={part3}
                        onChange={e => setPart3(toHalfWidth(e.target.value))}
                        maxLength={10}
                        aria-label="新しい棚番地パート3"
                    />
                    <span
                        className="btn-tooltip-wrapper"
                        data-disabled={isInputEmpty}
                        title={isInputEmpty ? '棚番地を入力してください' : ''}
                    >
                        <button
                            className="btn-primary"
                            onClick={handleAdd}
                            disabled={isInputEmpty}
                        >
                            追加
                        </button>
                    </span>
                </div>
            </div>

            <div className="location-list">
                <div className="location-list-header">
                    <h3>登録済みの棚番地</h3>
                    <div className="location-list-actions">
                        <span className="location-count-badge">
                            登録 {locations.length}件 / 未使用 {unusedLocations.length}件
                            {unassignedStockedCount > 0 && ` / 棚番未設定の在庫あり薬品 ${unassignedStockedCount}件`}
                        </span>
                        <button
                            className="btn-secondary"
                            onClick={handleDeleteUnused}
                            disabled={unusedLocations.length === 0}
                            title="どの薬品にも割り当てられていない棚番をまとめて削除します"
                        >
                            未使用の棚番を一括削除
                        </button>
                    </div>
                </div>
                {locations.length === 0 ? (
                    <p className="text-muted">棚番地が登録されていません</p>
                ) : (
                    <ul className="location-grid">
                        {sortedLocations.map(loc => {
                            const count = usageByLocation.get(loc.displayText) || 0;
                            return (
                                <li key={loc.id} className="location-item card">
                                    <div>
                                        <span className="location-text">{loc.displayText}</span>
                                        <small className="location-desc-small">
                                            {count > 0 ? `${count}品目で使用中` : '未使用'}
                                        </small>
                                    </div>
                                    <button
                                        className="btn-delete"
                                        onClick={() => handleDelete(loc.id)}
                                        aria-label={`棚番地 ${loc.displayText} を削除`}
                                    >
                                        削除
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
