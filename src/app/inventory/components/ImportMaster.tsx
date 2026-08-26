'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import encoding from 'encoding-japanese';
import { DrugStock } from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import { processPrescription, parseDeliverySlip } from '@/lib/ocr/processor';
import { logAuditAction } from '@/lib/audit';
import type { DrugWithSearchCache } from '../types';

export interface ImportMasterProps {
    db: any;
    drugs: DrugWithSearchCache[];
    activeTab: string;
    orderedDrugIds: Set<string>;
    onDrugsReceived: (drugCodes: string[]) => number;
}

export function ImportMaster({
    db,
    drugs,
    activeTab,
    orderedDrugIds,
    onDrugsReceived
}: ImportMasterProps) {
    const [parsedData, setParsedData] = useState<any[]>([]);
    const [isImporting, setIsImporting] = useState(false);
    const [isOcrProcessing, setIsOcrProcessing] = useState(false);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const arrayBuffer = event.target?.result as ArrayBuffer;
            if (!arrayBuffer) return;

            const uint8Array = new Uint8Array(arrayBuffer);
            // Detect encoding and convert to Unicode string (handling Shift-JIS)
            const unicodeArray = encoding.convert(uint8Array, {
                to: 'UNICODE',
                type: 'string'
            }) as string;

            parseCSV(unicodeArray);
        };
        // Read as ArrayBuffer to properly handle Shift-JIS via encoding-japanese
        reader.readAsArrayBuffer(file);

        // Reset input
        e.target.value = '';
    };

    // ⚡ Bolt: Hoist RegExp to avoid compilation inside loop
    const EXP_REGEX = /20\d{2}[-/\.]\d{2}/;

    // ⚡ Bolt: Cache the master drug map in a ref to prevent rebuilding a 20,000+ item map
    // on every file upload, while avoiding eager initialization during render (like useMemo would).
    const drugMapRef = useRef<{ source: DrugWithSearchCache[], map: Map<string, DrugWithSearchCache> } | null>(null);

    const parseCSV = (csvText: string) => {
        // Lazily initialize the O(1) lookup map only when actually parsing or when data changes
        if (!drugMapRef.current || drugMapRef.current.source !== drugs) {
            const map = new Map<string, DrugWithSearchCache>();
            for (let i = 0; i < drugs.length; i++) {
                const d = drugs[i];
                if (d.code && !map.has(d.code)) map.set(d.code, d);
                if (d.yjCode && !map.has(d.yjCode)) map.set(d.yjCode, d);
            }
            drugMapRef.current = { source: drugs, map };
        }

        const drugMap = drugMapRef.current.map;
        const lines = csvText.split(/\r?\n/);
        const results = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim()) continue;

            const cols = [];
            let inQuotes = false;
            let currentCol = '';
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    cols.push(currentCol);
                    currentCol = '';
                } else {
                    currentCol += char;
                }
            }
            cols.push(currentCol);

            // Clean quotes
            for (let j = 0; j < cols.length; j++) {
                if (cols[j].startsWith('"') && cols[j].endsWith('"')) {
                    cols[j] = cols[j].substring(1, cols[j].length - 1);
                }
            }

            // Expected JD-NET / NHI (approximate, flexible parsing)
            // 0: 伝票番号, 1: 納品日, 2: 卸, 3: 商品コード(YJ/JAN), 4: 商品名, 5: 規格, 6: 数量, ... 11: ロット/期限
            if (cols.length < 7) continue;

            const codeStr = cols[3]?.trim();
            const quantityStr = cols[6]?.trim();
            const qty = parseInt(quantityStr, 10);

            if (!codeStr || isNaN(qty)) continue;

            // Attempt to extract Lot and Expiration from col 11 or later
            let lot = '';
            let exp = '';
            for (let k = 11; k < cols.length; k++) {
                 // Very basic heuristic: if it looks like a date (202x/xx, 202x.xx, etc), it's exp
                 if (EXP_REGEX.test(cols[k])) {
                     exp = cols[k];
                 } else if (cols[k].trim() && !lot) {
                     lot = cols[k];
                 }
            }

            // Match with master drug
            // ⚡ Bolt: Use Map lookup instead of .find() to avoid O(N) iteration per row
            const matchedDrug = drugMap.get(codeStr);

            results.push({
                rawCode: codeStr,
                quantity: qty,
                lotNumber: lot,
                expirationDate: exp,
                matchedDrug
            });
        }

        setParsedData(results);
    };

    // ⚡ Bolt: Memoize the validity check to avoid O(N) evaluations multiple times during render
    const hasValidData = useMemo(() => {
        if (parsedData.length === 0) return false;
        // Manual loop for performance rather than .some()
        for (let i = 0; i < parsedData.length; i++) {
            if (parsedData[i].matchedDrug) return true;
        }
        return false;
    }, [parsedData]);

    const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsOcrProcessing(true);
        try {
            const text = await processPrescription(file);
            const deliveryItems = parseDeliverySlip(text);

            // ⚡ Bolt: Eliminate N+1 RxDB queries during OCR import by fetching all potential matches in a single batch query
            let drugsMap = new Map();
            if (db && deliveryItems.length > 0) {
                // ⚡ Bolt: Replace chained .map() and .filter() with a manual for loop to avoid intermediate array allocations
                const codes = [];
                const names = [];
                for (let i = 0; i < deliveryItems.length; i++) {
                    const item = deliveryItems[i];
                    if (item.code) codes.push(item.code);
                    if (item.name) names.push(item.name);
                }

                const matches = await db.drugs.find({
                    selector: {
                        $or: [
                            { code: { $in: codes } },
                            { yjCode: { $in: codes } },
                            { name: { $in: names } }
                        ]
                    }
                }).exec();

                for (let i = 0; i < matches.length; i++) {
                    const match = matches[i];
                    const docData = {
                        code: match.code,
                        name: match.name,
                        yjCode: match.yjCode,
                        isGeneric: match.isGeneric,
                        genericName: match.genericName,
                        price: match.price,
                    };
                    if (match.code) drugsMap.set(match.code, docData);
                    if (match.yjCode) drugsMap.set(match.yjCode, docData);
                    if (match.name) drugsMap.set(match.name, docData);
                }
            }

            // ⚡ Bolt: Replace .map() with a manual for loop and pre-allocated array to prevent closure allocations
            const processedData = new Array(deliveryItems.length);
            for (let i = 0; i < deliveryItems.length; i++) {
                const item = deliveryItems[i];
                // O(1) map lookup instead of await db.drugs.findOne()
                const matchedDrug = drugsMap.get(item.code) || drugsMap.get(item.name) || null;

                processedData[i] = {
                    rawCode: item.code,
                    matchedDrug,
                    quantity: item.quantity,
                    lotNumber: '',
                    expirationDate: item.expirationDate,
                    arrivalDate: item.arrivalDate,
                    supplier: item.supplier
                };
            }

            setParsedData(processedData);

        } catch (error) {
            console.error('OCR Error:', error);
            alert('納品書の読み取りに失敗しました。');
        } finally {
            setIsOcrProcessing(false);
            if (e.target) e.target.value = ''; // Reset
        }
    };

    const executeImport = async () => {
        if (!db) return;
        setIsImporting(true);
        const insertedStockDocs: Array<{ remove: () => Promise<unknown> }> = [];
        const drugRollbackPatches: Array<{ doc: any; stockQuantity: number }> = [];

        try {
            const stockInserts: DrugStock[] = [];
            const drugUpdates = new Map<string, number>();
            const defaultArrivalDate = new Date().toISOString().split('T')[0];

            for (let i = 0; i < parsedData.length; i++) {
                const item = parsedData[i];
                if (!item.matchedDrug) continue; // Skip unmapped

                const stockInsert: DrugStock = {
                    id: generateUUID(),
                    drugCode: item.matchedDrug.code,
                    quantity: item.quantity,
                    arrivalDate: item.arrivalDate || defaultArrivalDate
                };
                if (item.rawCode) stockInsert.janCode = item.rawCode;
                if (item.lotNumber) stockInsert.lotNumber = item.lotNumber;
                if (item.expirationDate) stockInsert.expirationDate = item.expirationDate;
                if (item.supplier) stockInsert.supplier = item.supplier;
                stockInserts.push(stockInsert);

                const currentDiff = drugUpdates.get(item.matchedDrug.code) || 0;
                drugUpdates.set(item.matchedDrug.code, currentDiff + item.quantity);
            }

            if (stockInserts.length > 0) {
                // Insert stocks
                const stockInsertResult = await db.drug_stocks.bulkInsert(stockInserts);
                insertedStockDocs.push(...stockInsertResult.success);
                if (stockInsertResult.error.length > 0) {
                    console.error('Failed to insert some stock lots:', stockInsertResult.error);
                    throw new Error(`${stockInsertResult.error.length} 件のロット在庫登録に失敗しました。`);
                }

                // Update drugs quantities
                const drugIds = Array.from(drugUpdates.keys());
                const drugDocsMap = await db.drugs.findByIds(drugIds).exec();

                const updates = [];
                for (const [id, doc] of drugDocsMap.entries()) {
                    const diff = drugUpdates.get(id) || 0;
                    const currentQty = doc.stockQuantity || 0;
                    drugRollbackPatches.push({ doc, stockQuantity: currentQty });
                    updates.push({
                        code: doc.code,
                        name: doc.name,
                        yjCode: doc.yjCode,
                        isGeneric: doc.isGeneric,
                        genericName: doc.genericName,
                        isAbolished: doc.isAbolished,
                        price: doc.price,
                        location: doc.location,
                        isNarcotic: doc.isNarcotic,
                        isPsychotropic: doc.isPsychotropic,
                        isPoisonous: doc.isPoisonous,
                        isHighRisk: doc.isHighRisk,
                        documentUrl: doc.documentUrl,
                        stockQuantity: currentQty + diff
                    });
                }

                if (updates.length > 0) {
                    const drugUpdateResult = await db.drugs.bulkUpsert(updates);
                    if (drugUpdateResult.error.length > 0) {
                        console.error('Failed to update some master stock quantities:', drugUpdateResult.error);
                        throw new Error(`${drugUpdateResult.error.length} 件のマスタ在庫更新に失敗しました。`);
                    }
                }

                // 発注ワークベンチで「発注済み」の薬品が届いていれば、消し込み操作なしでチェックを外す
                const receivedDrugCodes = Array.from(drugUpdates.keys());
                const autoClearedCount = onDrugsReceived(receivedDrugCodes);

                // 監査ログの記録
                const auditOk = await logAuditAction(
                    db,
                    'stock_update',
                    `卸データ/納品書インポート: 在庫データを ${stockInserts.length} 件インポートしました。${autoClearedCount > 0 ? `発注ワークベンチの発注済みチェックを${autoClearedCount}件自動解除しました。` : ''}`
                );
                if (!auditOk) {
                    throw new Error('在庫インポートの監査ログ記録に失敗しました。');
                }

                alert(
                    `${stockInserts.length} 件の在庫データをインポートしました。` +
                    (autoClearedCount > 0 ? `\n発注ワークベンチの発注済みチェックを${autoClearedCount}件自動で解除しました。` : '')
                );
                setParsedData([]);
            } else {
                alert('インポート可能な有効なデータがありませんでした（マスター未登録など）。');
            }
        } catch (error) {
            console.error('Import error:', error);
            for (let i = insertedStockDocs.length - 1; i >= 0; i--) {
                try {
                    await insertedStockDocs[i].remove();
                } catch (rollbackError) {
                    console.error('Failed to rollback imported stock lot:', rollbackError);
                }
            }
            for (let i = drugRollbackPatches.length - 1; i >= 0; i--) {
                try {
                    const rollback = drugRollbackPatches[i];
                    await rollback.doc.patch({ stockQuantity: rollback.stockQuantity });
                } catch (rollbackError) {
                    console.error('Failed to rollback master stock quantity:', rollbackError);
                }
            }
            alert('インポート中にエラーが発生しました。');
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="import-master card">
            {activeTab === 'import-ocr' ? (
                <>
                    <h3 className="import-section-title">納品書写真から取り込み (OCR)</h3>
                    <p className="import-section-desc">納品書の写真をアップロードして、数量やロットなどを自動入力します。（スズケン等のフォーマットに対応）</p>

                    <div className="upload-zone">
                        <label className={`file-input-label ${isOcrProcessing ? 'is-busy' : ''}`}>
                            <span className="btn-secondary">
                                {isOcrProcessing ? '読み取り中...' : '納品書の画像を選択 (PNG, JPG)'}
                            </span>
                            <input
                                type="file"
                                accept=".png,.jpg,.jpeg"
                                onChange={handleOcrUpload}
                                className="hidden-input"
                                disabled={isOcrProcessing}
                            />
                        </label>
                    </div>
                </>
            ) : (
                <>
                    <h3 className="import-section-title">卸データ（CSV）から入荷インポート</h3>
                    <p className="import-section-desc compact">JD-NET / NHI形式などのCSVファイルを選択してください。</p>

                    <div className="upload-zone">
                        <label className="file-input-label">
                            <span className="btn-secondary">ファイルを選択 (CSV)</span>
                            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden-input" aria-label="卸データCSVファイルをアップロード" />
                        </label>
                    </div>
                </>
            )}

            {(parsedData.length > 0) && (
                <div className="preview-section">
                    <h4>プレビュー ({parsedData.length} 件)</h4>
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>商品コード (CSV)</th>
                                    <th>照合した医薬品</th>
                                    <th>数量</th>
                                    <th>ロット</th>
                                    <th>有効期限</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsedData.slice(0, 100).map((row, idx) => (
                                    <tr key={idx} className={row.matchedDrug ? '' : 'unmatched-import-row'}>
                                        <td>{row.rawCode}</td>
                                        <td>
                                            {row.matchedDrug ? (
                                                <span className="matched">
                                                    {row.matchedDrug.name}
                                                    {orderedDrugIds.has(row.matchedDrug.code) && (
                                                        <span
                                                             className="order-auto-clear-badge"
                                                             title="発注ワークベンチで発注済みです。インポートすると自動でチェックを外します。"
                                                        >
                                                            発注済み→自動解除
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className="unmatched">マスター未登録</span>
                                            )}
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                value={row.quantity}
                                                onChange={(e) => {
                                                    const newData = [...parsedData];
                                                    newData[idx].quantity = Number(e.target.value);
                                                    setParsedData(newData);
                                                }}
                                                className="edit-input import-qty-input"
                                                aria-label={`${row.matchedDrug ? row.matchedDrug.name : row.rawCode}の入荷数量`}
                                            />
                                        </td>
                                        <td>{row.lotNumber || '未抽出'}</td>
                                        <td>{row.expirationDate || '未抽出'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {parsedData.length > 100 && (
                            <div className="limit-message text-muted text-sm">
                                ※プレビューが多すぎます。上位100件のみ表示しています（全 {parsedData.length} 件）。
                            </div>
                        )}
                    </div>

                    <div className="action-bar">
                        <span
                            className="btn-tooltip-wrapper"
                            data-disabled={isImporting || !hasValidData}
                            title={isImporting ? 'インポート中...' : !hasValidData ? 'インポート可能なデータがありません' : ''}
                        >
                            <button
                                className="btn-primary flex-center gap-2"
                                onClick={executeImport}
                                disabled={isImporting || !hasValidData}
                            >
                                {isImporting && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                                {isImporting ? 'インポート中...' : 'インポート実行'}
                            </button>
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
