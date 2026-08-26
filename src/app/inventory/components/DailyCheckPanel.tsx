'use client';

import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { logAuditAction, getCurrentUser } from '@/lib/audit';
import { CheckCircle2, Download, Loader2, Search, X } from 'lucide-react';
import { formatInventoryAmount, formatDateForFileName } from '@/lib/inventory_order';
import {
  DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS,
  DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY,
  buildDailyControlledDrugCheckAuditDetail,
  buildDailyControlledDrugCheckCsv,
  formatDailyControlledDrugDiff,
  getDailyControlledDrugCheckSummary,
  getDailyControlledDrugDiff,
  getDailyControlledDrugDifferenceReasonLabel,
  getDailyControlledDrugMissingReasonRows,
  mergeDailyControlledDrugCheckSnapshot,
  parseDailyControlledDrugCheckSnapshot,
  type DailyControlledDrugCheckRow,
  type DailyControlledDrugCheckSnapshot,
  type DailyControlledDrugDifferenceReason
} from '@/lib/inventory_daily_check';
import type { DrugWithSearchCache } from '../types';

export type DailyCheckKindFilter = 'all' | 'narcotic' | 'psychotropic';
export type DailyCheckStatusFilter = 'all' | 'unentered' | 'mismatch';

function formatDailyCheckPreviousCheckedAt(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
  });
}

export interface DailyCheckPanelProps {
  db: any;
  drugs: DrugWithSearchCache[];
  pendingStockMap: Map<string, number>;
}

export function DailyCheckPanel({ db, drugs, pendingStockMap }: DailyCheckPanelProps) {
  const [actualCounts, setActualCounts] = useState<Record<string, number>>({});
  const [dailyCheckReasons, setDailyCheckReasons] = useState<Record<string, DailyControlledDrugDifferenceReason>>({});
  const [previousDailyCheckSnapshot, setPreviousDailyCheckSnapshot] = useState<DailyControlledDrugCheckSnapshot | null>(null);
  const [dailyCheckQuery, setDailyCheckQuery] = useState('');
  const [dailyCheckKindFilter, setDailyCheckKindFilter] = useState<DailyCheckKindFilter>('all');
  const [dailyCheckStatusFilter, setDailyCheckStatusFilter] = useState<DailyCheckStatusFilter>('all');
  const [isSavingInventory, setIsSavingInventory] = useState(false);

  const deferredDailyCheckQuery = useDeferredValue(dailyCheckQuery);
  const dailyCountInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dailyReasonSelectRefs = useRef<Record<string, HTMLSelectElement | null>>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
        const raw = window.localStorage.getItem(DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY);
        if (!raw) return;
        const parsed = parseDailyControlledDrugCheckSnapshot(raw);
        setPreviousDailyCheckSnapshot(parsed);
    } catch (error) {
        console.warn('Failed to restore controlled drug daily check snapshot:', error);
    }
  }, []);

  const controlledDrugs = useMemo(() => {
    const results: DrugWithSearchCache[] = [];
    for (let i = 0; i < drugs.length; i++) {
        const drug = drugs[i];
        if (drug.isNarcotic || drug.isPsychotropic) {
            results.push(drug);
        }
    }
    return results.sort((a, b) => {
        if (Boolean(a.isNarcotic) !== Boolean(b.isNarcotic)) {
            return a.isNarcotic ? -1 : 1;
        }
        return a.name.localeCompare(b.name, 'ja');
    });
  }, [drugs]);

  const dailyCheckRows: DailyControlledDrugCheckRow[] = useMemo(() => {
    const rows: DailyControlledDrugCheckRow[] = [];
    for (let i = 0; i < controlledDrugs.length; i++) {
        const drug = controlledDrugs[i];
        const pendingStock = pendingStockMap.get(drug.code) || 0;
        const systemStock = drug.stockQuantity ?? 0;
        const shelfStockSystem = systemStock - pendingStock;
        const hasActualCount = Object.prototype.hasOwnProperty.call(actualCounts, drug.code);
        const previousItem = previousDailyCheckSnapshot?.entries?.[drug.code];

        rows.push({
            drugCode: drug.code,
            drugName: drug.name,
            yjCode: drug.yjCode,
            kind: drug.isNarcotic ? 'narcotic' : 'psychotropic',
            systemStock,
            pendingStock,
            shelfStockSystem,
            actualCount: hasActualCount ? actualCounts[drug.code] : undefined,
            differenceReason: dailyCheckReasons[drug.code],
            previousActualCount: previousItem?.actualCount,
            previousDiff: previousItem?.diff,
            previousDifferenceReason: previousItem?.differenceReason,
            previousCheckedAt: previousItem?.checkedAt,
            previousCheckedBy: previousItem?.checkedBy
        });
    }
    return rows;
  }, [controlledDrugs, pendingStockMap, actualCounts, dailyCheckReasons, previousDailyCheckSnapshot]);

  const dailyCheckSummary = useMemo(() => {
    return getDailyControlledDrugCheckSummary(dailyCheckRows);
  }, [dailyCheckRows]);

  const dailyCheckMissingReasonRows = useMemo(() => {
    return getDailyControlledDrugMissingReasonRows(dailyCheckRows);
  }, [dailyCheckRows]);

  const filteredDailyCheckRows = useMemo(() => {
    const query = deferredDailyCheckQuery.trim().toLowerCase();
    const rows: DailyControlledDrugCheckRow[] = [];

    for (let i = 0; i < dailyCheckRows.length; i++) {
        const row = dailyCheckRows[i];
        if (dailyCheckKindFilter !== 'all' && row.kind !== dailyCheckKindFilter) {
            continue;
        }

        const diff = getDailyControlledDrugDiff(row);
        if (dailyCheckStatusFilter === 'unentered' && diff !== null) {
            continue;
        }
        if (dailyCheckStatusFilter === 'mismatch' && (diff === null || diff === 0)) {
            continue;
        }

        if (query) {
            const matchesName = row.drugName.toLowerCase().includes(query);
            const matchesCode = row.drugCode.toLowerCase().includes(query);
            const matchesYj = Boolean(row.yjCode && row.yjCode.toLowerCase().includes(query));
            if (!matchesName && !matchesCode && !matchesYj) {
                continue;
            }
        }

        rows.push(row);
    }
    return rows;
  }, [dailyCheckRows, dailyCheckKindFilter, dailyCheckStatusFilter, deferredDailyCheckQuery]);

  const filteredDailyCheckSummary = useMemo(() => {
    return getDailyControlledDrugCheckSummary(filteredDailyCheckRows);
  }, [filteredDailyCheckRows]);

  const persistDailyCheckSnapshot = (rows: DailyControlledDrugCheckRow[]) => {
      const checkedAt = new Date().toISOString();
      const checkedBy = getCurrentUser().name || '未ログイン';
      const snapshot = mergeDailyControlledDrugCheckSnapshot(
          previousDailyCheckSnapshot,
          rows,
          checkedAt,
          checkedBy
      );

      setPreviousDailyCheckSnapshot(snapshot);
      if (typeof window === 'undefined') return;
      try {
          window.localStorage.setItem(
              DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY,
              JSON.stringify(snapshot)
          );
      } catch (error) {
          console.warn('Failed to persist controlled drug daily check snapshot:', error);
      }
  };

  const handleSaveInventory = async () => {
      if (!db) return;
      const missingReasonRows = getDailyControlledDrugMissingReasonRows(dailyCheckRows);
      if (missingReasonRows.length > 0) {
          const sampleNames = missingReasonRows.slice(0, 3).map(r => r.drugName).join('、');
          alert(`差異がある品目の差異理由を選択してください。\n未選択: ${missingReasonRows.length}件 (${sampleNames})`);
          const firstMissing = missingReasonRows[0];
          return;
      }

      const unenteredCount = dailyCheckSummary.unenteredCount;
      if (unenteredCount > 0) {
          if (!window.confirm(`未入力が ${unenteredCount} 件あります。このまま保存しますか？`)) {
              return;
          }
      }

      setIsSavingInventory(true);
      try {
          const auditDetail = buildDailyControlledDrugCheckAuditDetail(
              dailyCheckRows,
              controlledDrugs.length
          );

          const auditOk = await logAuditAction(
              db,
              'stock_update',
              auditDetail
          );

          if (!auditOk) {
              alert('日次棚卸しログの記録に失敗しました。');
              return;
          }

          persistDailyCheckSnapshot(dailyCheckRows);
          alert('日次棚卸し結果を保存し、監査ログに記録しました。');
      } catch (error) {
          console.error('Failed to save daily check inventory:', error);
          alert('日次棚卸し結果の保存に失敗しました。');
      } finally {
          setIsSavingInventory(false);
      }
  };

  const focusNextDailyCheckInput = useCallback((currentDrugCode: string) => {
    const currentIndex = filteredDailyCheckRows.findIndex(row => row.drugCode === currentDrugCode);
    if (currentIndex < 0) return;
    const nextRow = filteredDailyCheckRows[currentIndex + 1];
    if (nextRow) {
        dailyCountInputRefs.current[nextRow.drugCode]?.focus();
        dailyCountInputRefs.current[nextRow.drugCode]?.select();
    }
  }, [filteredDailyCheckRows]);

  const handleDailyCheckCountChange = useCallback((row: DailyControlledDrugCheckRow, rawValue: string) => {
    const trimmed = rawValue.trim();
    if (trimmed === '') {
        setActualCounts(prev => {
            const next = { ...prev };
            delete next[row.drugCode];
            return next;
        });
        setDailyCheckReasons(prev => {
            const next = { ...prev };
            delete next[row.drugCode];
            return next;
        });
        return;
    }

    const value = parseFloat(trimmed);
    if (isNaN(value) || value < 0) return;

    setActualCounts(prev => ({
        ...prev,
        [row.drugCode]: value
    }));

    const diff = value - row.shelfStockSystem;
    if (diff === 0) {
        setDailyCheckReasons(prev => {
            const next = { ...prev };
            delete next[row.drugCode];
            return next;
        });
    }
  }, []);

  const handleSetDailyCheckCount = useCallback((row: DailyControlledDrugCheckRow, value: number) => {
    setActualCounts(prev => ({
        ...prev,
        [row.drugCode]: value
    }));
    setDailyCheckReasons(prev => {
        const next = { ...prev };
        delete next[row.drugCode];
        return next;
    });
  }, []);

  const handleAdjustDailyCheckCount = useCallback((row: DailyControlledDrugCheckRow, delta: number) => {
    const baseCount = row.actualCount ?? row.shelfStockSystem;
    const nextValue = Math.max(0, Math.round((baseCount + delta) * 100) / 100);
    handleSetDailyCheckCount(row, nextValue);
  }, [handleSetDailyCheckCount]);

  const handleClearDailyCheckCount = useCallback((drugCode: string) => {
    setActualCounts(prev => {
        const next = { ...prev };
        delete next[drugCode];
        return next;
    });
    setDailyCheckReasons(prev => {
        const next = { ...prev };
        delete next[drugCode];
        return next;
    });
  }, []);

  const handleDailyCheckReasonChange = useCallback((row: DailyControlledDrugCheckRow, reasonValue: string) => {
    setDailyCheckReasons(prev => {
        if (!reasonValue) {
            const next = { ...prev };
            delete next[row.drugCode];
            return next;
        }
        return {
            ...prev,
            [row.drugCode]: reasonValue as DailyControlledDrugDifferenceReason
        };
    });
  }, []);

  const handleFillDailyCheckSystemCounts = useCallback(() => {
    setActualCounts(prev => {
        const next = { ...prev };
        for (let i = 0; i < filteredDailyCheckRows.length; i++) {
            const row = filteredDailyCheckRows[i];
            next[row.drugCode] = row.shelfStockSystem;
        }
        return next;
    });
    setDailyCheckReasons(prev => {
        const next = { ...prev };
        for (let i = 0; i < filteredDailyCheckRows.length; i++) {
            delete next[filteredDailyCheckRows[i].drugCode];
        }
        return next;
    });
  }, [filteredDailyCheckRows]);

  const handleClearDailyCheckInputs = useCallback(() => {
    setActualCounts(prev => {
        const next = { ...prev };
        for (let i = 0; i < filteredDailyCheckRows.length; i++) {
            delete next[filteredDailyCheckRows[i].drugCode];
        }
        return next;
    });
    setDailyCheckReasons(prev => {
        const next = { ...prev };
        for (let i = 0; i < filteredDailyCheckRows.length; i++) {
            delete next[filteredDailyCheckRows[i].drugCode];
        }
        return next;
    });
  }, [filteredDailyCheckRows]);

  const handleDailyCheckInputKeyDown = useCallback((row: DailyControlledDrugCheckRow, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const diff = getDailyControlledDrugDiff(row);
    if (diff !== null && diff !== 0 && !row.differenceReason) {
        dailyReasonSelectRefs.current[row.drugCode]?.focus();
        return;
    }
    focusNextDailyCheckInput(row.drugCode);
  }, [focusNextDailyCheckInput]);

  const handleExportDailyCheckCsv = useCallback(() => {
    if (filteredDailyCheckRows.length === 0) return;
    const csvContent = buildDailyControlledDrugCheckCsv(filteredDailyCheckRows);
    const dateStr = formatDateForFileName(new Date());
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yakureki-controlled-drug-daily-check-${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredDailyCheckRows]);

  const getDailyCheckPreviousSummary = (row: DailyControlledDrugCheckRow): string => {
    if (typeof row.previousDiff !== 'number') {
        return '前回なし';
    }
    const when = formatDailyCheckPreviousCheckedAt(row.previousCheckedAt);
    const statusText = row.previousDiff === 0
        ? '前回一致'
        : `前回差異 ${formatDailyControlledDrugDiff(row.previousDiff)}`;
    const reasonText = row.previousDifferenceReason
        ? ` (${getDailyControlledDrugDifferenceReasonLabel(row.previousDifferenceReason)})`
        : '';
    return `${statusText}${reasonText}${when ? ` (${when})` : ''}`;
  };

  return (
    <div className="card daily-check-card">
        <div className="daily-check-header">
            <div>
                <h3>1日の終わりの在庫チェック (麻薬・向精神薬)</h3>
                <p className="text-muted">棚にある実地数を入力し、差異がある品目だけをすばやく確認します。</p>
            </div>
            <div className="daily-check-actions">
                <button type="button" className="btn-secondary compact" onClick={handleFillDailyCheckSystemCounts} disabled={filteredDailyCheckRows.length === 0}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    <span>表示中を一致</span>
                </button>
                <button type="button" className="btn-secondary compact" onClick={handleClearDailyCheckInputs} disabled={filteredDailyCheckSummary.enteredCount === 0}>
                    <X size={15} aria-hidden="true" />
                    <span>表示中クリア</span>
                </button>
                <button type="button" className="btn-secondary compact" onClick={handleExportDailyCheckCsv} disabled={filteredDailyCheckRows.length === 0}>
                    <Download size={15} aria-hidden="true" />
                    <span>表示中CSV</span>
                </button>
            </div>
        </div>

        <div className="daily-check-summary-grid" aria-label="麻薬・向精神薬の日次棚卸サマリー">
            <div className="daily-check-summary-item">
                <span>対象</span>
                <strong>{dailyCheckSummary.totalCount.toLocaleString()}</strong>
            </div>
            <div className="daily-check-summary-item done">
                <span>入力済み</span>
                <strong>{dailyCheckSummary.enteredCount.toLocaleString()}</strong>
            </div>
            <div className={`daily-check-summary-item ${dailyCheckSummary.unenteredCount > 0 ? 'attention' : 'done'}`}>
                <span>未入力</span>
                <strong>{dailyCheckSummary.unenteredCount.toLocaleString()}</strong>
            </div>
            <div className={`daily-check-summary-item ${dailyCheckSummary.mismatchCount > 0 ? 'alert' : 'done'}`}>
                <span>差異あり</span>
                <strong>{dailyCheckSummary.mismatchCount.toLocaleString()}</strong>
            </div>
        </div>

        <div className="daily-check-toolbar">
            <div className="daily-check-search">
                <Search size={17} className="search-icon" aria-hidden="true" />
                <input
                    type="search"
                    placeholder="薬品名・コードで検索"
                    value={dailyCheckQuery}
                    onChange={(event) => setDailyCheckQuery(event.target.value)}
                    aria-label="日次棚卸の薬品名またはコードで検索"
                />
                {dailyCheckQuery && (
                    <button
                        type="button"
                        className="btn-clear"
                        onClick={() => setDailyCheckQuery('')}
                        aria-label="日次棚卸の検索キーワードをクリア"
                        title="検索キーワードをクリア"
                    >
                        <X size={14} aria-hidden="true" />
                    </button>
                )}
            </div>
            <label className="daily-check-filter">
                <span>区分</span>
                <select
                    value={dailyCheckKindFilter}
                    onChange={(event) => setDailyCheckKindFilter(event.target.value as DailyCheckKindFilter)}
                    aria-label="区分で絞り込み"
                >
                    <option value="all">すべて</option>
                    <option value="narcotic">麻薬</option>
                    <option value="psychotropic">向精神薬</option>
                </select>
            </label>
            <label className="daily-check-filter">
                <span>表示</span>
                <select
                    value={dailyCheckStatusFilter}
                    onChange={(event) => setDailyCheckStatusFilter(event.target.value as DailyCheckStatusFilter)}
                    aria-label="入力状態で絞り込み"
                >
                    <option value="all">すべて</option>
                    <option value="unentered">未入力のみ</option>
                    <option value="mismatch">差異ありのみ</option>
                </select>
            </label>
            <div className="daily-check-filter-count" aria-live="polite">
                表示 {filteredDailyCheckRows.length.toLocaleString()} 件
            </div>
        </div>

        <div className="table-wrapper">
            <table className="data-table daily-check-table">
                <thead>
                    <tr>
                        <th>区分</th>
                        <th>医薬品名</th>
                        <th>現在庫 (合計)</th>
                        <th>引き渡し予定</th>
                        <th>棚在庫 (システム)</th>
                        <th>棚在庫 (実地入力)</th>
                        <th>差異</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredDailyCheckRows.map(row => {
                        const diff = getDailyControlledDrugDiff(row);
                        const hasActualCount = diff !== null;

                        return (
                            <tr key={row.drugCode} className={diff === null ? 'unentered-row' : diff === 0 ? 'matched-row' : 'mismatch-row'}>
                                <td>
                                    {row.kind === 'narcotic' ? <span className="status-tag urgent">麻薬</span> : <span className="status-tag psychotropic">向精神薬</span>}
                                </td>
                                <td>
                                    <div className="daily-drug-name">
                                        <span>{row.drugName}</span>
                                        <span className={`daily-previous-check ${typeof row.previousDiff === 'number' && row.previousDiff !== 0 ? 'warn' : ''}`}>
                                            {getDailyCheckPreviousSummary(row)}
                                        </span>
                                    </div>
                                </td>
                                <td className="text-right">{formatInventoryAmount(row.systemStock)}</td>
                                <td className="text-right">{row.pendingStock > 0 ? formatInventoryAmount(row.pendingStock) : '-'}</td>
                                <td className="text-right">{formatInventoryAmount(row.shelfStockSystem)}</td>
                                <td>
                                    <div className="daily-count-cell">
                                        <div className="daily-count-input">
                                            <button
                                                type="button"
                                                className="count-step-button"
                                                onClick={() => handleAdjustDailyCheckCount(row, -1)}
                                                aria-label={`${row.drugName}の実地棚在庫数を1減らす`}
                                                title="1減らす"
                                            >
                                                -
                                            </button>
                                            <input
                                                ref={(element) => {
                                                    dailyCountInputRefs.current[row.drugCode] = element;
                                                }}
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={row.actualCount ?? ''}
                                                placeholder={formatInventoryAmount(row.shelfStockSystem)}
                                                onChange={(event) => handleDailyCheckCountChange(row, event.target.value)}
                                                onKeyDown={(event) => handleDailyCheckInputKeyDown(row, event)}
                                                aria-label={`${row.drugName}の実地棚在庫数`}
                                            />
                                            <button
                                                type="button"
                                                className="count-step-button"
                                                onClick={() => handleAdjustDailyCheckCount(row, 1)}
                                                aria-label={`${row.drugName}の実地棚在庫数を1増やす`}
                                                title="1増やす"
                                            >
                                                +
                                            </button>
                                            <button
                                                type="button"
                                                className="daily-match-button"
                                                onClick={() => handleSetDailyCheckCount(row, row.shelfStockSystem)}
                                                aria-label={`${row.drugName}の実地棚在庫数をシステム数と一致させる`}
                                                title="システム数と一致"
                                            >
                                                <CheckCircle2 size={15} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className="daily-clear-row-button"
                                                onClick={() => handleClearDailyCheckCount(row.drugCode)}
                                                disabled={!hasActualCount}
                                                aria-label={`${row.drugName}の実地棚在庫数をクリア`}
                                                title="入力をクリア"
                                            >
                                                <X size={15} aria-hidden="true" />
                                            </button>
                                        </div>
                                        {diff !== null && diff !== 0 && (
                                            <select
                                                ref={(element) => {
                                                    dailyReasonSelectRefs.current[row.drugCode] = element;
                                                }}
                                                className={`daily-reason-select ${row.differenceReason ? '' : 'missing'}`}
                                                value={row.differenceReason || ''}
                                                onChange={(event) => handleDailyCheckReasonChange(row, event.target.value)}
                                                onKeyDown={(event) => {
                                                    if (event.key !== 'Enter' || !row.differenceReason) return;
                                                    event.preventDefault();
                                                    focusNextDailyCheckInput(row.drugCode);
                                                }}
                                                aria-label={`${row.drugName}の差異理由`}
                                            >
                                                <option value="">差異理由を選択</option>
                                                {DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS.map((option) => (
                                                    <option key={option.value} value={option.value}>{option.label}</option>
                                                ))}
                                            </select>
                                        )}
                                    </div>
                                </td>
                                <td className={`daily-diff-cell ${diff === null ? 'unentered' : diff === 0 ? 'ok' : 'mismatch'}`}>
                                    {diff === null ? '未入力' : diff === 0 ? '一致' : formatDailyControlledDrugDiff(diff)}
                                </td>
                            </tr>
                        );
                    })}
                    {filteredDailyCheckRows.length === 0 && (
                        <tr>
                            <td colSpan={7} className="daily-check-empty text-muted">
                                表示できる品目がありません
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
        <div className="action-bar daily-check-footer">
            <div className={`daily-check-save-note ${dailyCheckMissingReasonRows.length > 0 ? 'alert' : ''}`}>
                {dailyCheckMissingReasonRows.length > 0
                    ? `差異理由未選択 ${dailyCheckMissingReasonRows.length.toLocaleString()} 件`
                    : dailyCheckSummary.unenteredCount === 0 && dailyCheckSummary.totalCount > 0
                    ? '全件入力済み'
                    : `未入力 ${dailyCheckSummary.unenteredCount.toLocaleString()} 件`}
            </div>
            <span
                className="btn-tooltip-wrapper"
                data-disabled={isSavingInventory || dailyCheckSummary.enteredCount === 0}
                title={isSavingInventory ? '保存中...' : dailyCheckSummary.enteredCount === 0 ? '実地数を入力してください' : ''}
            >
                <button
                    className="btn-primary flex-center gap-2"
                    onClick={handleSaveInventory}
                    disabled={isSavingInventory || dailyCheckSummary.enteredCount === 0}
                >
                    {isSavingInventory && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                    {isSavingInventory ? '保存中...' : '棚卸し結果を保存'}
                </button>
            </span>
        </div>
    </div>
  );
}
