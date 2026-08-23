'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DrugStock } from '@/db/types';
import {
  applyStockTransferIn,
  applyStockTransferOut,
  isTransferAuditDetail,
  openTransferDocumentPrintWindow,
  parseTransferAuditDetail,
  TRANSFER_DIRECTION_LABELS,
  type StockTransferDirection,
  type StockTransferRecord
} from '@/lib/stock_transfer';
import { getCurrentUser } from '@/lib/audit';
import type { DrugWithSearchCache, TransferPrefill } from '../types';

export interface StockTransferPanelProps {
    db: any;
    drugs: DrugWithSearchCache[];
    stockLots: DrugStock[];
    prefill?: TransferPrefill | null;
}

export function StockTransferPanel({ db, drugs, stockLots, prefill }: StockTransferPanelProps) {
    const [direction, setDirection] = useState<StockTransferDirection>('out');
    const [drugQuery, setDrugQuery] = useState('');
    const [selectedDrugCode, setSelectedDrugCode] = useState('');
    const [quantityInput, setQuantityInput] = useState('');
    const [lotId, setLotId] = useState('');
    const [lotNumberInput, setLotNumberInput] = useState('');
    const [expirationInput, setExpirationInput] = useState('');
    const [partnerName, setPartnerName] = useState('');
    const [partnerAddress, setPartnerAddress] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [historyReloadKey, setHistoryReloadKey] = useState(0);
    const [history, setHistory] = useState<Array<StockTransferRecord & { logId: string }>>([]);

    // 不動在庫・発注ワークベンチからの引き継ぎ(薬品・数量・方向)を反映する
    useEffect(() => {
        if (!prefill) return;
        setDirection(prefill.direction || 'out');
        setSelectedDrugCode(prefill.drugCode);
        setQuantityInput(prefill.quantity && prefill.quantity > 0 ? String(prefill.quantity) : '');
        setDrugQuery('');
        setLotId('');
    }, [prefill]);

    const listedDrug = useMemo(
        () => drugs.find((drug) => drug.code === selectedDrugCode),
        [drugs, selectedDrugCode]
    );

    // 一覧に載っていない薬品(在庫0で表示上限外など)が引き継がれた場合はDBから直接補完する
    const [fallbackDrug, setFallbackDrug] = useState<{ code: string; name: string; stockQuantity?: number; location?: string } | null>(null);
    useEffect(() => {
        let isMounted = true;
        if (!db || !selectedDrugCode || listedDrug) {
            setFallbackDrug(null);
            return;
        }
        db.drugs.findOne(selectedDrugCode).exec().then((doc: any) => {
            if (!isMounted || !doc) return;
            setFallbackDrug({ code: doc.code, name: doc.name, stockQuantity: doc.stockQuantity, location: doc.location });
        }).catch(() => {});
        return () => { isMounted = false; };
    }, [db, selectedDrugCode, listedDrug]);

    const selectedDrug = listedDrug || (fallbackDrug && fallbackDrug.code === selectedDrugCode ? fallbackDrug : undefined);

    const drugSuggestions = useMemo(() => {
        const query = drugQuery.trim().toLowerCase();
        if (!query || selectedDrug) return [];
        const results: DrugWithSearchCache[] = [];
        for (const drug of drugs) {
            if (drug.searchNameLower.includes(query) || drug.searchYjCodeLower.includes(query) || drug.code.toLowerCase().includes(query)) {
                results.push(drug);
                if (results.length >= 8) break;
            }
        }
        return results;
    }, [drugQuery, drugs, selectedDrug]);

    const selectedDrugLots = useMemo(() => (
        stockLots
            .filter((lot) => lot.drugCode === selectedDrugCode && (lot.quantity || 0) > 0)
            .slice()
            .sort((a, b) => String(a.expirationDate || '9999').localeCompare(String(b.expirationDate || '9999')))
    ), [stockLots, selectedDrugCode]);

    useEffect(() => {
        let isMounted = true;
        const loadHistory = async () => {
            if (!db) return;
            try {
                const logs = await db.audit_logs.find({ selector: { actionType: 'stock_update' } }).exec();
                if (!isMounted) return;
                const records: Array<StockTransferRecord & { logId: string }> = [];
                for (const log of logs) {
                    if (!isTransferAuditDetail(log.details)) continue;
                    const parsed = parseTransferAuditDetail(log.details);
                    if (!parsed) continue;
                    records.push({
                        ...parsed,
                        transferredAt: log.timestamp,
                        operatorName: log.userName,
                        logId: log.logId
                    });
                }
                records.sort((a, b) => b.transferredAt.localeCompare(a.transferredAt));
                setHistory(records.slice(0, 100));
            } catch (error) {
                console.error('Failed to load transfer history:', error);
            }
        };
        loadHistory();
        return () => { isMounted = false; };
    }, [db, historyReloadKey]);

    const printRecord = async (record: StockTransferRecord) => {
        try {
            const settings = await db?.facility_settings.findOne('default').exec();
            const opened = openTransferDocumentPrintWindow({
                record,
                pharmacyName: settings?.pharmacyName || '薬局名未設定',
                pharmacyAddress: settings?.pharmacyAddress || '',
                pharmacyPhone: settings?.pharmacyPhone || ''
            });
            if (!opened) alert('印刷ウィンドウを開けませんでした。ポップアップを許可してください。');
        } catch (error) {
            console.error('Failed to print transfer document:', error);
            alert('記録書の印刷に失敗しました。');
        }
    };

    const resetForm = () => {
        setDrugQuery('');
        setSelectedDrugCode('');
        setQuantityInput('');
        setLotId('');
        setLotNumberInput('');
        setExpirationInput('');
        setNote('');
    };

    const handleSubmit = async () => {
        if (!db || isSubmitting) return;
        const quantity = parseFloat(quantityInput);
        if (!selectedDrugCode) {
            alert('薬品を選択してください。');
            return;
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
            alert('数量は0より大きい数値で入力してください。');
            return;
        }
        if (!partnerName.trim()) {
            alert(direction === 'out' ? '分譲先(相手方の名称)を入力してください。' : '分譲元(相手方の名称)を入力してください。');
            return;
        }

        setIsSubmitting(true);
        try {
            const input = {
                drugCode: selectedDrugCode,
                quantity,
                partnerName,
                partnerAddress,
                note,
                lotId: lotId || undefined,
                lotNumber: lotNumberInput || undefined,
                expirationDate: expirationInput || undefined
            };
            const record = direction === 'out'
                ? await applyStockTransferOut(db, input)
                : await applyStockTransferIn(db, input);
            record.operatorName = getCurrentUser().name;
            setHistoryReloadKey((key) => key + 1);
            resetForm();
            await printRecord(record);
        } catch (error: any) {
            console.error('Failed to apply stock transfer:', error);
            alert(error?.message || '分譲の記録に失敗しました。');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="transfer-panel">
            <div className="card transfer-form-card">
                <h3>分譲を記録</h3>
                <p className="text-muted transfer-note">
                    在庫の増減と、譲渡・譲受の法定記録(監査ログ・3年保存)を同時に行い、記録書を印刷します。
                </p>

                <div className="transfer-direction" role="radiogroup" aria-label="分譲の方向">
                    <label className={direction === 'out' ? 'active' : ''}>
                        <input type="radio" name="transfer-direction" checked={direction === 'out'} onChange={() => setDirection('out')} />
                        出庫(他薬局へ譲渡)
                    </label>
                    <label className={direction === 'in' ? 'active' : ''}>
                        <input type="radio" name="transfer-direction" checked={direction === 'in'} onChange={() => setDirection('in')} />
                        入庫(他薬局から譲受)
                    </label>
                </div>

                <div className="transfer-field">
                    <label htmlFor="transfer-drug">薬品</label>
                    {selectedDrug ? (
                        <div className="transfer-selected-drug">
                            <div>
                                <strong>{selectedDrug.name}</strong>
                                <span>現在庫 {selectedDrug.stockQuantity ?? 0} / {selectedDrug.location || '棚位置未設定'}</span>
                            </div>
                            <button type="button" className="btn-secondary" onClick={() => { setSelectedDrugCode(''); setLotId(''); }}>変更</button>
                        </div>
                    ) : (
                        <div className="transfer-drug-search">
                            <input
                                id="transfer-drug"
                                type="text"
                                placeholder="医薬品名またはコードで検索"
                                value={drugQuery}
                                onChange={(e) => setDrugQuery(e.target.value)}
                            />
                            {drugSuggestions.length > 0 && (
                                <ul className="transfer-drug-suggestions">
                                    {drugSuggestions.map((drug) => (
                                        <li key={drug.code}>
                                            <button type="button" onClick={() => { setSelectedDrugCode(drug.code); setDrugQuery(''); }}>
                                                <span className="suggestion-name">{drug.name}</span>
                                                <span className="suggestion-meta">在庫 {drug.stockQuantity ?? 0} / {drug.yjCode || drug.code}</span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                <div className="transfer-grid">
                    <label className="transfer-field">
                        <span>数量</span>
                        <input
                            type="number"
                            min={0}
                            step="any"
                            value={quantityInput}
                            onChange={(e) => setQuantityInput(e.target.value)}
                            aria-label="分譲数量"
                        />
                    </label>
                    {direction === 'out' ? (
                        <label className="transfer-field">
                            <span>ロット</span>
                            <select value={lotId} onChange={(e) => setLotId(e.target.value)} aria-label="出庫ロット">
                                <option value="">期限の近い順に自動引落</option>
                                {selectedDrugLots.map((lot) => (
                                    <option key={lot.id} value={lot.id}>
                                        {lot.lotNumber || 'ロット未記録'} / 期限 {lot.expirationDate || '-'} / 残 {lot.quantity}
                                    </option>
                                ))}
                            </select>
                        </label>
                    ) : (
                        <>
                            <label className="transfer-field">
                                <span>ロット番号</span>
                                <input type="text" maxLength={100} value={lotNumberInput} onChange={(e) => setLotNumberInput(e.target.value)} />
                            </label>
                            <label className="transfer-field">
                                <span>使用期限</span>
                                <input type="date" value={expirationInput} onChange={(e) => setExpirationInput(e.target.value)} />
                            </label>
                        </>
                    )}
                </div>

                <div className="transfer-grid">
                    <label className="transfer-field">
                        <span>{direction === 'out' ? '分譲先 名称' : '分譲元 名称'} *</span>
                        <input type="text" maxLength={100} placeholder="例: ひかり薬局 中央店" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
                    </label>
                    <label className="transfer-field">
                        <span>{direction === 'out' ? '分譲先 住所' : '分譲元 住所'}</span>
                        <input type="text" maxLength={200} value={partnerAddress} onChange={(e) => setPartnerAddress(e.target.value)} />
                    </label>
                </div>

                <label className="transfer-field">
                    <span>備考</span>
                    <input type="text" maxLength={200} placeholder="融通理由、伝票番号など" value={note} onChange={(e) => setNote(e.target.value)} />
                </label>

                <div className="transfer-actions">
                    <button type="button" className="btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? '記録中...' : `${TRANSFER_DIRECTION_LABELS[direction]}を記録して記録書を印刷`}
                    </button>
                </div>
            </div>

            <div className="card transfer-history-card">
                <h3>分譲履歴 (直近{history.length}件)</h3>
                {history.length === 0 ? (
                    <p className="text-muted">分譲の記録はまだありません。</p>
                ) : (
                    <table className="transfer-history-table">
                        <thead>
                            <tr>
                                <th>日時</th>
                                <th>区分</th>
                                <th>薬品</th>
                                <th className="text-right">数量</th>
                                <th>相手先</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((record) => (
                                <tr key={record.logId}>
                                    <td>{record.transferredAt.slice(0, 16).replace('T', ' ')}</td>
                                    <td>
                                        <span className={`transfer-badge ${record.direction}`}>
                                            {TRANSFER_DIRECTION_LABELS[record.direction]}
                                        </span>
                                    </td>
                                    <td className="transfer-history-drug">{record.drugName}</td>
                                    <td className="text-right">{record.quantity}</td>
                                    <td>{record.partnerName}</td>
                                    <td>
                                        <button type="button" className="btn-secondary" onClick={() => printRecord(record)}>記録書</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
