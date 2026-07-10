'use client';

import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import { useDatabase } from '@/db/DatabaseProvider';
import { Drug, Location, DrugStock } from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import { processPrescription, parseDeliverySlip } from '@/lib/ocr/processor';
import { calculateRequiredStockAmount, getStockDrugId, getTotalStock } from '@/lib/stock';
import { isGeneralNameDrugRecord } from '@/lib/master-data/drug_master';
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
import { buildDeadStockCsv, buildDeadStockReport, type DeadStockEntry } from '@/lib/dead_stock';
import { getCurrentUser, logAuditAction } from '@/lib/audit';
import { isClaimEditBlocked } from '@/lib/claim_edit_guard';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Clipboard, Download, LayoutGrid, MapPin, PackageCheck, PackageX, ScanLine, Search, ShieldAlert, ShoppingCart, Upload, X, Loader2 } from 'lucide-react';
import encoding from 'encoding-japanese';
import {
  buildInventoryOrderCsv,
  buildInventoryOrderMemo,
  buildInventoryReceivingChecklistCsv,
  buildInventoryReceivingChecklistMemo,
  choosePrimarySupplier,
  formatDateForFileName,
  formatInventoryAmount,
  getInventoryOrderActionLabel,
  getInventoryOrderPriority,
  type InventoryOrderRisk
} from '@/lib/inventory_order';
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

// Utility to convert full-width alphanumeric to half-width
const toHalfWidth = (str: string) => {
  return str.replace(/[！-～]/g, function(s) {
    return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
  });
};

type DrugWithSearchCache = Drug & { doc: any; stockQuantity?: number; searchNameLower: string; searchYjCodeLower: string };
type InventoryTab = 'drugs' | 'locations' | 'import' | 'import-ocr' | 'daily-check' | 'order-workbench' | 'transfer' | 'dead-stock';
const INVENTORY_TABS: InventoryTab[] = ['drugs', 'locations', 'import', 'import-ocr', 'daily-check', 'order-workbench', 'transfer', 'dead-stock'];
// 分譲フォームへの引き継ぎ(不動在庫・発注ワークベンチからの連携)
type TransferPrefill = { drugCode: string; quantity?: number; direction?: StockTransferDirection };
type DailyCheckKindFilter = 'all' | 'narcotic' | 'psychotropic';
type DailyCheckStatusFilter = 'all' | 'unentered' | 'mismatch';
type ReceivingDraft = {
  quantity: string;
  lotNumber: string;
  expirationDate: string;
  arrivalDate: string;
  supplierName: string;
};

const ORDER_WORKBENCH_STORAGE_PREFIX = 'yakureki_inventory_order_workbench_';

function todayDateKey(): string {
  return new Date().toISOString().split('T')[0];
}

function defaultReceivingDraft(candidate: InventoryOrderRisk): ReceivingDraft {
  return {
      quantity: String(candidate.recommendedOrderAmount),
      lotNumber: '',
      expirationDate: '',
      arrivalDate: todayDateKey(),
      supplierName: candidate.supplierName === '卸未設定' ? '' : candidate.supplierName
  };
}

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

function getDailyCheckPreviousSummary(row: DailyControlledDrugCheckRow): string {
  if (typeof row.previousActualCount !== 'number') {
      return '前回なし';
  }

  const parts = [`前回 ${formatInventoryAmount(row.previousActualCount)}`];
  if (typeof row.previousDiff === 'number') {
      if (row.previousDiff === 0) {
          parts.push('差異なし');
      } else {
          const reasonLabel = getDailyControlledDrugDifferenceReasonLabel(row.previousDifferenceReason);
          parts.push(`差異 ${formatDailyControlledDrugDiff(row.previousDiff)}${reasonLabel ? ` (${reasonLabel})` : ''}`);
      }
  }

  const checkedAt = formatDailyCheckPreviousCheckedAt(row.previousCheckedAt);
  if (checkedAt) parts.push(checkedAt);
  if (row.previousCheckedBy) parts.push(row.previousCheckedBy);
  return parts.join(' ・ ');
}

export default function InventoryPage() {
  const db = useDatabase();
  const [limitedDrugs, setLimitedDrugs] = useState<DrugWithSearchCache[]>([]);
  const [stockedDrugs, setStockedDrugs] = useState<DrugWithSearchCache[]>([]);
  // 一覧はコード順の先頭のみに制限しているため、在庫のある薬品(コード順で後方の
  // 銘柄や英字コードを含む)が漏れないよう別購読でマージする。
  const drugs = useMemo(() => {
    if (stockedDrugs.length === 0) return limitedDrugs;
    const seen = new Set(limitedDrugs.map((drug) => drug.code));
    const merged = limitedDrugs.slice();
    for (const drug of stockedDrugs) {
      if (!seen.has(drug.code)) merged.push(drug);
    }
    return merged;
  }, [limitedDrugs, stockedDrugs]);
  const [pendingStockMap, setPendingStockMap] = useState<Map<string, number>>(new Map());
  const [pendingVisitCountMap, setPendingVisitCountMap] = useState<Map<string, number>>(new Map());
  const [stockLots, setStockLots] = useState<DrugStock[]>([]);
  const [orderedDrugIds, setOrderedDrugIds] = useState<Set<string>>(new Set());
  const [receivingDrafts, setReceivingDrafts] = useState<Record<string, ReceivingDraft>>({});
  const [receivingDrugId, setReceivingDrugId] = useState('');
  const [hasLoadedOrderState, setHasLoadedOrderState] = useState(false);
  const [actualCounts, setActualCounts] = useState<Record<string, number>>({});
  const [transferPrefill, setTransferPrefill] = useState<TransferPrefill | null>(null);
  const [dailyCheckReasons, setDailyCheckReasons] = useState<Record<string, DailyControlledDrugDifferenceReason>>({});
  const [previousDailyCheckSnapshot, setPreviousDailyCheckSnapshot] = useState<DailyControlledDrugCheckSnapshot | null>(null);
  const [dailyCheckQuery, setDailyCheckQuery] = useState('');
  const [dailyCheckKindFilter, setDailyCheckKindFilter] = useState<DailyCheckKindFilter>('all');
  const [dailyCheckStatusFilter, setDailyCheckStatusFilter] = useState<DailyCheckStatusFilter>('all');
  const [locations, setLocations] = useState<Location[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNegativeOnly, setShowNegativeOnly] = useState(false);
  const [isSavingInventory, setIsSavingInventory] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredDailyCheckQuery = useDeferredValue(dailyCheckQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dailyCountInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dailyReasonSelectRefs = useRef<Record<string, HTMLSelectElement | null>>({});
  const orderWorkbenchStorageKey = useMemo(
    () => `${ORDER_WORKBENCH_STORAGE_PREFIX}${formatDateForFileName(new Date())}`,
    []
  );

  const [activeTab, setActiveTab] = useState<InventoryTab>('drugs');

  // ダッシュボード等からのディープリンク(/inventory?tab=order-workbench など)に対応する
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab') as InventoryTab | null;
    if (tab && INVENTORY_TABS.includes(tab)) setActiveTab(tab);
  }, []);

  // タブ切替をURLへ反映し、リロード・共有時も同じタブへ戻れるようにする
  const selectTab = (tab: InventoryTab) => {
    setActiveTab(tab);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      window.history.replaceState(null, '', url.toString());
    } catch {
      // URL更新に失敗しても画面遷移は継続する
    }
  };

  // 不動在庫・発注ワークベンチから薬品と数量を引き継いで分譲フォームを開く
  const openTransferWith = (prefill: TransferPrefill) => {
    setTransferPrefill(prefill);
    selectTab('transfer');
  };

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
          setDailyCheckQuery('');
          setDailyCheckKindFilter('all');
          setDailyCheckStatusFilter('mismatch');
          alert(`差異理由が未選択の品目が ${missingReasonRows.length} 件あります。理由を選択してから保存してください。`);
          window.requestAnimationFrame(() => {
              dailyReasonSelectRefs.current[missingReasonRows[0].drugCode]?.focus();
          });
          return;
      }

      setIsSavingInventory(true);
      try {
          const updates: Drug[] = [];
          const rollbackUpdates: Drug[] = [];
          let enteredCount = 0;
          // ⚡ Bolt: Replace for...of with manual for loop to prevent iterator allocations
          for (let i = 0; i < narcoticDrugs.length; i++) {
              const drug = narcoticDrugs[i];
              const hasActualCount = Object.prototype.hasOwnProperty.call(actualCounts, drug.code) &&
                  Number.isFinite(actualCounts[drug.code]);
              if (hasActualCount) {
                  enteredCount++;
                  const pendingStock = pendingStockMap.get(drug.code) || 0;
                  const systemStock = drug.stockQuantity ?? 0;
                  const shelfStockSystem = systemStock - pendingStock;
                  const shelfStockActual = actualCounts[drug.code];

                  if (shelfStockActual !== shelfStockSystem) {
                      const newTotalStock = shelfStockActual + pendingStock;
                      const baseDrugRecord = {
                          code: drug.code,
                          name: drug.name,
                          yjCode: drug.yjCode,
                          isGeneric: drug.isGeneric,
                          genericName: drug.genericName,
                          isAbolished: drug.isAbolished,
                          price: drug.price,
                          location: drug.location,
                          isNarcotic: drug.isNarcotic,
                          isPsychotropic: drug.isPsychotropic,
                          isPoisonous: drug.isPoisonous,
                          isHighRisk: drug.isHighRisk,
                          documentUrl: drug.documentUrl
                      };
                      updates.push({
                          ...baseDrugRecord,
                          stockQuantity: newTotalStock
                      });
                      rollbackUpdates.push({
                          ...baseDrugRecord,
                          stockQuantity: systemStock
                      });
                  }
              }
          }

          const auditDetail = buildDailyControlledDrugCheckAuditDetail(dailyCheckRows, narcoticDrugs.length);

          if (enteredCount === 0) {
              alert('実地数を入力してから保存してください。');
              return;
          }

          const unenteredCount = narcoticDrugs.length - enteredCount;
          if (unenteredCount > 0 && !window.confirm(
              `未入力が ${unenteredCount} 件あります。入力済みの ${enteredCount} 件だけ保存しますか？`
          )) {
              return;
          }

          if (updates.length > 0) {
              const updateResult = await db.drugs.bulkUpsert(updates);
              if (updateResult.error.length > 0) {
                  console.error('Failed to update daily inventory records:', updateResult.error);
                  throw new Error(`${updateResult.error.length}件の在庫更新に失敗しました。`);
              }

              const auditOk = await logAuditAction(
                  db,
                  'stock_update',
                  auditDetail
              );
              if (!auditOk) {
                  const rollbackResult = await db.drugs.bulkUpsert(rollbackUpdates);
                  if (rollbackResult.error.length > 0) {
                      console.error('Failed to rollback daily inventory records:', rollbackResult.error);
                      alert(`${updates.length}件の在庫を更新しましたが、監査ログ記録に失敗し、在庫更新の取り消しにも失敗しました。管理者に確認してください。`);
                      return;
                  }
                  alert('監査ログを記録できなかったため、在庫更新を取り消しました。');
                  return;
              }

              alert(`${updates.length}件の在庫を更新し、監査ログに記録しました。`);
              persistDailyCheckSnapshot(dailyCheckRows);
              setActualCounts({});
              setDailyCheckReasons({});
          } else {
              const auditOk = await logAuditAction(
                  db,
                  'stock_update',
                  auditDetail
              );
              if (!auditOk) {
                  alert('差異はありませんでしたが、監査ログを記録できなかったため保存を完了できませんでした。');
                  return;
              }
              alert('差異なしで棚卸確認を監査ログに記録しました。');
              persistDailyCheckSnapshot(dailyCheckRows);
              setActualCounts({});
              setDailyCheckReasons({});
          }
      } catch (error) {
          console.error('Save error:', error);
          alert('保存中にエラーが発生しました。');
      } finally {
          setIsSavingInventory(false);
      }
  };


  useEffect(() => {
    if (!db) return;

    const calculatePending = async () => {
        const processingVisits = await db.visits.find({
            selector: {
                status: { $in: ['waiting', 'processing'] }
            }
        }).exec();

        const visitIds = processingVisits
            .filter((visit) => !isClaimEditBlocked(visit.claimLifecycle))
            .map(v => v.visitId);
        if (visitIds.length === 0) {
            setPendingStockMap(new Map());
            setPendingVisitCountMap(new Map());
            return;
        }

        const items = await db.prescription_items.find({
            selector: {
                visitId: { $in: visitIds }
            }
        }).exec();

        const newMap = new Map<string, number>();
        const visitIdsByDrugCode = new Map<string, Set<string>>();
        for (const item of items) {
            const amount = calculateRequiredStockAmount(item);
            if (amount <= 0) continue;
            const stockDrugId = getStockDrugId(item);
            newMap.set(stockDrugId, (newMap.get(stockDrugId) || 0) + amount);
            const visitIdsForDrug = visitIdsByDrugCode.get(stockDrugId) || new Set<string>();
            visitIdsForDrug.add(item.visitId);
            visitIdsByDrugCode.set(stockDrugId, visitIdsForDrug);
        }

        const countMap = new Map<string, number>();
        for (const [drugCode, visitSet] of visitIdsByDrugCode.entries()) {
            countMap.set(drugCode, visitSet.size);
        }
        setPendingStockMap(newMap);
        setPendingVisitCountMap(countMap);
    };

    calculatePending();

    // Subscribe to changes in visits/items to recalculate
    // ⚡ Bolt: Debounce the recalculation to prevent redundant database queries and state updates
    // when multiple items or visits are updated in rapid succession.
    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedCalculatePending = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            calculatePending();
            debounceTimer = null;
        }, 300); // 300ms debounce window
    };

    const subVisit = db.visits.$.subscribe(debouncedCalculatePending);
    const subItems = db.prescription_items.$.subscribe(debouncedCalculatePending);

    return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        subVisit.unsubscribe();
        subItems.unsubscribe();
    };
  }, [db]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
        const saved = window.localStorage.getItem(orderWorkbenchStorageKey);
        const parsed = saved ? JSON.parse(saved) : [];
        setOrderedDrugIds(new Set(Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []));
    } catch (error) {
        console.warn('Failed to restore inventory order workbench state:', error);
        setOrderedDrugIds(new Set());
    } finally {
        setHasLoadedOrderState(true);
    }
  }, [orderWorkbenchStorageKey]);

  useEffect(() => {
    if (!hasLoadedOrderState || typeof window === 'undefined') return;
    window.localStorage.setItem(orderWorkbenchStorageKey, JSON.stringify(Array.from(orderedDrugIds)));
  }, [hasLoadedOrderState, orderWorkbenchStorageKey, orderedDrugIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
        setPreviousDailyCheckSnapshot(
            parseDailyControlledDrugCheckSnapshot(
                window.localStorage.getItem(DAILY_CONTROLLED_DRUG_SNAPSHOT_STORAGE_KEY)
            )
        );
    } catch (error) {
        console.warn('Failed to restore controlled drug daily check snapshot:', error);
        setPreviousDailyCheckSnapshot(null);
    }
  }, []);


  useEffect(() => {
    if (!db) return;

    // 【般】一般名処方マスタ(約1,400件・コード末尾ZZZ)は在庫の実体ではないため除外する。
    // 般コードは数字始まりでコード順の先頭に固まるため、除外しないと limit がほぼ般で埋まる。
    const mapDrugDocs = (data: any[]) => {
        // ⚡ Bolt: Replace .map() with a manual for loop and pre-allocated array to prevent
        // O(N) closure allocations when processing large datasets.
        const mappedDrugs = [];
        for (let i = 0; i < data.length; i++) {
            const d = data[i];
            if (isGeneralNameDrugRecord(d)) continue;
            mappedDrugs.push({
                code: d.code,
                name: d.name,
                yjCode: d.yjCode,
                isGeneric: d.isGeneric,
                genericName: d.genericName,
                isAbolished: d.isAbolished,
                price: d.price,
                location: d.location,
                stockQuantity: d.stockQuantity,
                // ⚡ Bolt: Cache the document instance to avoid redundant lookups during updates
                doc: d,
                // ⚡ Bolt: Pre-compute lowercase strings for search to avoid allocations on every keystroke
                searchNameLower: (d.name || '').toLowerCase(),
                searchYjCodeLower: (d.yjCode || '').toLowerCase()
            });
        }
        return mappedDrugs;
    };

    const drugSub = db.drugs.find({
        selector: {
            isAbolished: { $ne: true }
        },
        limit: 2500 // Limiting for initial load, typically you'd want pagination or virtualization for 20k+ drugs
    }).$.subscribe(data => {
        setLimitedDrugs(mapDrugDocs(data));
    });

    // 在庫を持つ薬品はコード順に関係なく常に一覧・分譲・不動在庫の対象にする
    const stockedDrugSub = db.drugs.find({
        selector: {
            isAbolished: { $ne: true },
            stockQuantity: { $gt: 0 }
        }
    }).$.subscribe(data => {
        setStockedDrugs(mapDrugDocs(data));
    });

    const locSub = db.locations.find().$.subscribe(data => {
        // ⚡ Bolt: Replace .map() with a manual for loop and pre-allocated array to prevent closure allocations.
        const mappedLocations = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            const l = data[i];
            mappedLocations[i] = {
                id: l.id,
                part1: l.part1,
                part2: l.part2,
                part3: l.part3,
                displayText: l.displayText
            };
        }
        setLocations(mappedLocations);
    });

    const stockSub = db.drug_stocks.find().$.subscribe(data => {
        const mappedStockLots = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            const stock = data[i];
            mappedStockLots[i] = {
                id: stock.id,
                drugCode: stock.drugCode,
                janCode: stock.janCode,
                lotNumber: stock.lotNumber,
                expirationDate: stock.expirationDate,
                quantity: stock.quantity,
                arrivalDate: stock.arrivalDate,
                supplier: stock.supplier
            };
        }
        setStockLots(mappedStockLots);
    });

    return () => {
        drugSub.unsubscribe();
        stockedDrugSub.unsubscribe();
        locSub.unsubscribe();
        stockSub.unsubscribe();
    };
  }, [db]);

  // ⚡ Bolt: Extract repeated drug filtering into useMemo to prevent unnecessary array allocations
  // on every render and during interactions in the daily check tab.
  const narcoticDrugs = useMemo(() => {
      // ⚡ Bolt: Use a manual loop for optimal performance instead of .filter
      const result = [];
      for (let i = 0; i < drugs.length; i++) {
          if (drugs[i].isNarcotic || drugs[i].isPsychotropic) {
              result.push(drugs[i]);
          }
      }
      return result;
  }, [drugs]);

  const dailyCheckRows = useMemo<DailyControlledDrugCheckRow[]>(() => {
      const rows: DailyControlledDrugCheckRow[] = [];
      for (let i = 0; i < narcoticDrugs.length; i++) {
          const drug = narcoticDrugs[i];
          const systemStock = drug.stockQuantity ?? 0;
          const pendingStock = pendingStockMap.get(drug.code) || 0;
          const hasActualCount = Object.prototype.hasOwnProperty.call(actualCounts, drug.code) &&
              Number.isFinite(actualCounts[drug.code]);
          const previousEntry = previousDailyCheckSnapshot?.entries[drug.code];
          rows.push({
              drugCode: drug.code,
              yjCode: drug.yjCode,
              drugName: drug.name,
              kind: drug.isNarcotic ? 'narcotic' : 'psychotropic',
              systemStock,
              pendingStock,
              shelfStockSystem: systemStock - pendingStock,
              actualCount: hasActualCount ? actualCounts[drug.code] : undefined,
              differenceReason: dailyCheckReasons[drug.code],
              previousActualCount: previousEntry?.actualCount,
              previousDiff: previousEntry?.diff,
              previousDifferenceReason: previousEntry?.differenceReason,
              previousCheckedAt: previousEntry?.checkedAt,
              previousCheckedBy: previousEntry?.checkedBy
          });
      }
      return rows;
  }, [actualCounts, dailyCheckReasons, narcoticDrugs, pendingStockMap, previousDailyCheckSnapshot]);

  const filteredDailyCheckRows = useMemo(() => {
      const lowerQuery = deferredDailyCheckQuery.trim().toLowerCase();
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
          if (dailyCheckStatusFilter === 'mismatch' && diff !== null && diff === 0) {
              continue;
          }
          if (dailyCheckStatusFilter === 'mismatch' && diff === null) {
              continue;
          }

          if (lowerQuery) {
              const searchText = `${row.drugName} ${row.drugCode} ${row.yjCode || ''}`.toLowerCase();
              if (!searchText.includes(lowerQuery)) continue;
          }

          rows.push(row);
      }
      return rows;
  }, [dailyCheckKindFilter, dailyCheckRows, dailyCheckStatusFilter, deferredDailyCheckQuery]);

  const dailyCheckSummary = useMemo(() => (
      getDailyControlledDrugCheckSummary(dailyCheckRows)
  ), [dailyCheckRows]);

  const dailyCheckMissingReasonRows = useMemo(() => (
      getDailyControlledDrugMissingReasonRows(dailyCheckRows)
  ), [dailyCheckRows]);

  const filteredDailyCheckSummary = useMemo(() => (
      getDailyControlledDrugCheckSummary(filteredDailyCheckRows)
  ), [filteredDailyCheckRows]);

  const negativeStockSummary = useMemo(() => {
      let count = 0;
      let totalShortage = 0;
      const sampleNames: string[] = [];

      for (let i = 0; i < drugs.length; i++) {
          const stockQuantity = drugs[i].stockQuantity ?? 0;
          if (stockQuantity < 0) {
              count++;
              totalShortage += Math.abs(stockQuantity);
              if (sampleNames.length < 3) {
                  sampleNames.push(drugs[i].name);
              }
          }
      }

      return { count, totalShortage, sampleNames };
  }, [drugs]);

  const filteredDrugs = useMemo(() => {
    const lowerQuery = deferredSearchQuery.toLowerCase();
    const result: DrugWithSearchCache[] = [];

    for (let i = 0; i < drugs.length; i++) {
        const drug = drugs[i];
        if (showNegativeOnly && (drug.stockQuantity ?? 0) >= 0) {
            continue;
        }

        const matchesQuery = !lowerQuery || drug.searchNameLower.includes(lowerQuery) || drug.searchYjCodeLower.includes(lowerQuery);
        if (matchesQuery) {
            result.push(drug);

            // ⚡ Bolt: Prevent massive React renders by capping results.
            // Even with manual loops, rendering thousands of DOM nodes causes severe main thread blocking.
            if (result.length >= 100) break;
        }
    }
    return result;
  }, [drugs, deferredSearchQuery, showNegativeOnly]);

  const stockLotsByDrugCode = useMemo(() => {
      const map = new Map<string, DrugStock[]>();
      for (let i = 0; i < stockLots.length; i++) {
          const lot = stockLots[i];
          const list = map.get(lot.drugCode) || [];
          list.push(lot);
          map.set(lot.drugCode, list);
      }
      return map;
  }, [stockLots]);

  const orderCandidates = useMemo<InventoryOrderRisk[]>(() => {
      const candidates: InventoryOrderRisk[] = [];
      for (let i = 0; i < drugs.length; i++) {
          const drug = drugs[i];
          const requiredAmount = pendingStockMap.get(drug.code) || 0;
          if (requiredAmount <= 0) continue;

          const lots = stockLotsByDrugCode.get(drug.code) || [];
          const availableAmount = lots.length > 0 ? getTotalStock(lots) : drug.stockQuantity || 0;
          if (requiredAmount <= availableAmount) continue;

          const shortageAmount = requiredAmount - availableAmount;
          const affectedVisitCount = pendingVisitCountMap.get(drug.code) || 1;
          const isHighRiskMedication = !!(
              drug.isHighRisk ||
              drug.isNarcotic ||
              drug.isPsychotropic ||
              drug.isPoisonous
          );
          const priority = getInventoryOrderPriority({
              availableAmount,
              isHighRiskMedication,
              affectedVisitCount
          });

          candidates.push({
              drugId: drug.code,
              drugName: drug.name,
              location: drug.location || '棚位置未設定',
              supplierName: choosePrimarySupplier(lots),
              requiredAmount,
              availableAmount,
              shortageAmount,
              recommendedOrderAmount: shortageAmount,
              affectedVisitCount,
              priority,
              actionLabel: getInventoryOrderActionLabel({
                  availableAmount,
                  isHighRiskMedication
              })
          });
      }

      candidates.sort((a, b) => {
          if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
          if (orderedDrugIds.has(a.drugId) !== orderedDrugIds.has(b.drugId)) {
              return orderedDrugIds.has(a.drugId) ? 1 : -1;
          }
          return b.shortageAmount - a.shortageAmount;
      });
      return candidates;
  }, [drugs, orderedDrugIds, pendingStockMap, pendingVisitCountMap, stockLotsByDrugCode]);

  const openOrderCandidates = useMemo(() => (
      orderCandidates.filter((candidate) => !orderedDrugIds.has(candidate.drugId))
  ), [orderCandidates, orderedDrugIds]);

  const orderedOrderCandidates = useMemo(() => (
      orderCandidates.filter((candidate) => orderedDrugIds.has(candidate.drugId))
  ), [orderCandidates, orderedDrugIds]);

  const handleExportOrderCsv = () => {
      if (openOrderCandidates.length === 0) {
          alert('出力できる未対応の発注候補はありません。');
          return;
      }

      const csv = buildInventoryOrderCsv(openOrderCandidates);
      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `yakureki-order-workbench-${formatDateForFileName(new Date())}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
  };

  const handleCopyOrderMemo = async () => {
      if (openOrderCandidates.length === 0) {
          alert('コピーできる未対応の発注候補はありません。');
          return;
      }

      try {
          await navigator.clipboard.writeText(buildInventoryOrderMemo(openOrderCandidates));
          alert('未対応の発注・融通メモをコピーしました。');
      } catch (error) {
          console.error('Failed to copy order memo:', error);
          alert('メモのコピーに失敗しました。');
      }
  };

  const handleExportReceivingChecklistCsv = () => {
      if (orderedOrderCandidates.length === 0) {
          alert('出力できる入庫待ちの発注済み候補はありません。');
          return;
      }

      const csv = buildInventoryReceivingChecklistCsv(orderCandidates, orderedDrugIds);
      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `yakureki-receiving-checklist-${formatDateForFileName(new Date())}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
  };

  const handleCopyReceivingChecklistMemo = async () => {
      if (orderedOrderCandidates.length === 0) {
          alert('コピーできる入庫待ちの発注済み候補はありません。');
          return;
      }

      try {
          await navigator.clipboard.writeText(buildInventoryReceivingChecklistMemo(orderCandidates, orderedDrugIds));
          alert('入庫確認メモをコピーしました。');
      } catch (error) {
          console.error('Failed to copy receiving checklist memo:', error);
          alert('入庫確認メモのコピーに失敗しました。');
      }
  };

  const handleToggleOrdered = (drugId: string) => {
      setOrderedDrugIds((current) => {
          const next = new Set(current);
          if (next.has(drugId)) {
              next.delete(drugId);
          } else {
              next.add(drugId);
          }
          return next;
      });
  };

  const handleUpdateReceivingDraft = (candidate: InventoryOrderRisk, patch: Partial<ReceivingDraft>) => {
      setReceivingDrafts((current) => ({
          ...current,
          [candidate.drugId]: {
              ...(current[candidate.drugId] || defaultReceivingDraft(candidate)),
              ...patch
          }
      }));
  };

  const handleRegisterReceivedStock = async (candidate: InventoryOrderRisk) => {
      if (!db || receivingDrugId) return;

      const draft = receivingDrafts[candidate.drugId] || defaultReceivingDraft(candidate);
      const quantity = Number(draft.quantity);
      const lotNumber = draft.lotNumber.trim();
      const expirationDate = draft.expirationDate.trim();
      const arrivalDate = draft.arrivalDate.trim() || todayDateKey();
      const supplierName = draft.supplierName.trim();

      if (!Number.isFinite(quantity) || quantity <= 0) {
          alert('納品数量は0より大きい数で入力してください。');
          return;
      }
      if (!lotNumber || !expirationDate) {
          alert('ロット番号と使用期限を入力してください。');
          return;
      }

      setReceivingDrugId(candidate.drugId);
      let insertedStockDoc: { remove: () => Promise<unknown> } | null = null;
      let drugDoc: any | null = null;
      let previousStockQuantity = 0;

      try {
          const stockInsert: DrugStock = {
              id: generateUUID(),
              drugCode: candidate.drugId,
              quantity,
              lotNumber,
              expirationDate,
              arrivalDate
          };
          if (supplierName) stockInsert.supplier = supplierName;

          insertedStockDoc = await db.drug_stocks.insert(stockInsert);
          drugDoc = await db.drugs.findOne(candidate.drugId).exec();
          if (!drugDoc) {
              throw new Error('対象薬品が見つかりません。');
          }

          previousStockQuantity = drugDoc.stockQuantity || 0;
          await drugDoc.patch({ stockQuantity: previousStockQuantity + quantity });

          const auditOk = await logAuditAction(
              db,
              'stock_update',
              `発注ワークベンチ入庫登録: ${candidate.drugName} を ${quantity} 入庫しました。ロット ${lotNumber}、使用期限 ${expirationDate}。`
          );
          if (!auditOk) {
              throw new Error('入庫登録の監査ログ記録に失敗しました。');
          }

          setOrderedDrugIds((current) => {
              const next = new Set(current);
              next.delete(candidate.drugId);
              return next;
          });
          setReceivingDrafts((current) => {
              const next = { ...current };
              delete next[candidate.drugId];
              return next;
          });
          alert(`${candidate.drugName} の入庫を登録しました。`);
      } catch (error) {
          console.error('Failed to register received stock:', error);
          if (drugDoc) {
              try {
                  await drugDoc.patch({ stockQuantity: previousStockQuantity });
              } catch (rollbackError) {
                  console.error('Failed to rollback received stock quantity:', rollbackError);
              }
          }
          if (insertedStockDoc) {
              try {
                  await insertedStockDoc.remove();
              } catch (rollbackError) {
                  console.error('Failed to rollback received stock lot:', rollbackError);
              }
          }
          alert('入庫登録に失敗しました。');
      } finally {
          setReceivingDrugId('');
      }
  };

  const handleClearOrdered = () => {
      if (orderedDrugIds.size === 0) return;
      if (!window.confirm('本日の発注済みチェックをすべて解除しますか？')) return;
      setOrderedDrugIds(new Set());
      setReceivingDrafts({});
  };

  // 卸データCSV・納品書OCRの一括インポートで届いた薬品が発注ワークベンチで
  // 「発注済み」になっていれば、手動での消し込み操作なしに自動でチェックを外す。
  const handleDrugsReceivedViaImport = useCallback((drugCodes: string[]): number => {
      const receivedOrderedCodes = drugCodes.filter((code) => orderedDrugIds.has(code));
      if (receivedOrderedCodes.length === 0) return 0;
      setOrderedDrugIds((current) => {
          const next = new Set(current);
          for (const code of receivedOrderedCodes) next.delete(code);
          return next;
      });
      setReceivingDrafts((current) => {
          const next = { ...current };
          for (const code of receivedOrderedCodes) delete next[code];
          return next;
      });
      return receivedOrderedCodes.length;
  }, [orderedDrugIds]);

  const clearDailyCheckReason = (drugCode: string) => {
      setDailyCheckReasons((current) => {
          if (!Object.prototype.hasOwnProperty.call(current, drugCode)) return current;
          const next = { ...current };
          delete next[drugCode];
          return next;
      });
  };

  const focusNextDailyCheckInput = (currentDrugCode: string) => {
      const currentIndex = filteredDailyCheckRows.findIndex((row) => row.drugCode === currentDrugCode);
      if (currentIndex === -1 || filteredDailyCheckRows.length < 2) return;

      for (let offset = 1; offset < filteredDailyCheckRows.length; offset++) {
          const nextRow = filteredDailyCheckRows[(currentIndex + offset) % filteredDailyCheckRows.length];
          if (typeof nextRow.actualCount === 'number') continue;
          window.requestAnimationFrame(() => {
              const input = dailyCountInputRefs.current[nextRow.drugCode];
              input?.focus();
              input?.select();
          });
          return;
      }
  };

  const handleDailyCheckCountChange = (row: DailyControlledDrugCheckRow, value: string) => {
      setActualCounts((current) => {
          const next = { ...current };
          if (value.trim() === '') {
              delete next[row.drugCode];
              return next;
          }

          const parsedValue = Number(value);
          if (Number.isFinite(parsedValue)) {
              next[row.drugCode] = Math.max(0, parsedValue);
          }
          return next;
      });

      const parsedValue = Number(value);
      if (value.trim() === '' || (Number.isFinite(parsedValue) && Math.max(0, parsedValue) === row.shelfStockSystem)) {
          clearDailyCheckReason(row.drugCode);
      }
  };

  const handleSetDailyCheckCount = (row: DailyControlledDrugCheckRow, count: number) => {
      const nextCount = Math.max(0, count);
      setActualCounts((current) => ({
          ...current,
          [row.drugCode]: nextCount
      }));
      if (nextCount === row.shelfStockSystem) {
          clearDailyCheckReason(row.drugCode);
      }
  };

  const handleAdjustDailyCheckCount = (row: DailyControlledDrugCheckRow, delta: number) => {
      const currentCount = typeof row.actualCount === 'number' ? row.actualCount : row.shelfStockSystem;
      handleSetDailyCheckCount(row, currentCount + delta);
  };

  const handleClearDailyCheckCount = (drugCode: string) => {
      setActualCounts((current) => {
          const next = { ...current };
          delete next[drugCode];
          return next;
      });
      clearDailyCheckReason(drugCode);
  };

  const handleDailyCheckReasonChange = (row: DailyControlledDrugCheckRow, value: string) => {
      const matchedReason = DAILY_CONTROLLED_DRUG_DIFFERENCE_REASONS.find((option) => option.value === value)?.value;
      setDailyCheckReasons((current) => {
          const next = { ...current };
          if (matchedReason) {
              next[row.drugCode] = matchedReason;
          } else {
              delete next[row.drugCode];
          }
          return next;
      });
  };

  const handleDailyCheckInputKeyDown = (
      row: DailyControlledDrugCheckRow,
      event: React.KeyboardEvent<HTMLInputElement>
  ) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const inputValue = event.currentTarget.value.trim();
      const parsedValue = Number(inputValue);
      const hasEnteredNumber = inputValue !== '' && Number.isFinite(parsedValue);
      const nextActualCount = hasEnteredNumber ? Math.max(0, parsedValue) : null;
      if (
          nextActualCount !== null &&
          nextActualCount !== row.shelfStockSystem &&
          !dailyCheckReasons[row.drugCode]
      ) {
          window.requestAnimationFrame(() => {
              dailyReasonSelectRefs.current[row.drugCode]?.focus();
          });
          return;
      }

      focusNextDailyCheckInput(row.drugCode);
  };

  const handleFillDailyCheckSystemCounts = () => {
      if (filteredDailyCheckRows.length === 0) {
          alert('一括入力できる表示中の品目がありません。');
          return;
      }

      setActualCounts((current) => {
          const next = { ...current };
          for (let i = 0; i < filteredDailyCheckRows.length; i++) {
              const row = filteredDailyCheckRows[i];
              next[row.drugCode] = Math.max(0, row.shelfStockSystem);
          }
          return next;
      });
      setDailyCheckReasons((current) => {
          const next = { ...current };
          for (let i = 0; i < filteredDailyCheckRows.length; i++) {
              delete next[filteredDailyCheckRows[i].drugCode];
          }
          return next;
      });
  };

  const handleClearDailyCheckInputs = () => {
      if (filteredDailyCheckRows.length === 0) return;
      setActualCounts((current) => {
          const next = { ...current };
          for (let i = 0; i < filteredDailyCheckRows.length; i++) {
              delete next[filteredDailyCheckRows[i].drugCode];
          }
          return next;
      });
      setDailyCheckReasons((current) => {
          const next = { ...current };
          for (let i = 0; i < filteredDailyCheckRows.length; i++) {
              delete next[filteredDailyCheckRows[i].drugCode];
          }
          return next;
      });
  };

  const handleExportDailyCheckCsv = () => {
      if (filteredDailyCheckRows.length === 0) {
          alert('CSVに出力できる表示中の品目がありません。');
          return;
      }

      const csv = buildDailyControlledDrugCheckCsv(filteredDailyCheckRows);
      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `yakureki-controlled-drug-daily-check-${formatDateForFileName(new Date())}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
  };


  return (
    <div className="inventory-container">
      <header className="page-header">
        <h1>在庫管理 (Inventory Management)</h1>
        <div className="tabs" role="tablist" aria-label="在庫管理タブ">
            <button
                id="tab-drugs"
                className={`tab ${activeTab === 'drugs' ? 'active' : ''}`}
                onClick={() => selectTab('drugs')}
                role="tab"
                aria-selected={activeTab === 'drugs'}
                aria-controls="panel-drugs"
            >
                <MapPin size={15} aria-hidden="true" />
                医薬品の棚番地設定
            </button>
            <button
                id="tab-locations"
                className={`tab ${activeTab === 'locations' ? 'active' : ''}`}
                onClick={() => selectTab('locations')}
                role="tab"
                aria-selected={activeTab === 'locations'}
                aria-controls="panel-locations"
            >
                <LayoutGrid size={15} aria-hidden="true" />
                棚マスター管理
            </button>
            <button
                id="tab-import"
                className={`tab ${activeTab === 'import' ? 'active' : ''}`}
                onClick={() => selectTab('import')}
                role="tab"
                aria-selected={activeTab === 'import'}
                aria-controls="panel-import"
            >
                <Upload size={15} aria-hidden="true" />
                入荷インポート (卸データ)
            </button>
            <button
                id="tab-import-ocr"
                className={`tab ${activeTab === 'import-ocr' ? 'active' : ''}`}
                onClick={() => selectTab('import-ocr')}
                role="tab"
                aria-selected={activeTab === 'import-ocr'}
                aria-controls="panel-import-ocr"
            >
                <ScanLine size={15} aria-hidden="true" />
                納品書OCR読取
            </button>
            <button
                id="tab-daily-check"
                className={`tab ${activeTab === 'daily-check' ? 'active' : ''}`}
                onClick={() => selectTab('daily-check')}
                role="tab"
                aria-selected={activeTab === 'daily-check'}
                aria-controls="panel-daily-check"
            >
                <ShieldAlert size={15} aria-hidden="true" />
                麻薬・向精神薬 棚卸
            </button>
            <button
                id="tab-order-workbench"
                className={`tab ${activeTab === 'order-workbench' ? 'active' : ''}`}
                onClick={() => selectTab('order-workbench')}
                role="tab"
                aria-selected={activeTab === 'order-workbench'}
                aria-controls="panel-order-workbench"
            >
                <ShoppingCart size={15} aria-hidden="true" />
                発注ワークベンチ
            </button>
            <button
                id="tab-transfer"
                className={`tab ${activeTab === 'transfer' ? 'active' : ''}`}
                onClick={() => selectTab('transfer')}
                role="tab"
                aria-selected={activeTab === 'transfer'}
                aria-controls="panel-transfer"
            >
                <ArrowLeftRight size={15} aria-hidden="true" />
                分譲 (譲渡・譲受)
            </button>
            <button
                id="tab-dead-stock"
                className={`tab ${activeTab === 'dead-stock' ? 'active' : ''}`}
                onClick={() => selectTab('dead-stock')}
                role="tab"
                aria-selected={activeTab === 'dead-stock'}
                aria-controls="panel-dead-stock"
            >
                <PackageX size={15} aria-hidden="true" />
                不動在庫
            </button>

        </div>
      </header>

      {activeTab === 'order-workbench' && (
        <section className="tab-content" id="panel-order-workbench" role="tabpanel" aria-labelledby="tab-order-workbench">
            <OrderWorkbench
                candidates={orderCandidates}
                orderedDrugIds={orderedDrugIds}
                receivingDrafts={receivingDrafts}
                receivingDrugId={receivingDrugId}
                onRequestTransfer={(candidate) => openTransferWith({
                    drugCode: candidate.drugId,
                    quantity: candidate.recommendedOrderAmount,
                    direction: 'in'
                })}
                onToggleOrdered={handleToggleOrdered}
                onUpdateReceivingDraft={handleUpdateReceivingDraft}
                onRegisterReceivedStock={handleRegisterReceivedStock}
                onExportCsv={handleExportOrderCsv}
                onCopyMemo={handleCopyOrderMemo}
                onExportReceivingChecklist={handleExportReceivingChecklistCsv}
                onCopyReceivingMemo={handleCopyReceivingChecklistMemo}
                onClearOrdered={handleClearOrdered}
            />
        </section>
      )}

      {activeTab === 'daily-check' && (
        <section className="tab-content" id="panel-daily-check" role="tabpanel" aria-labelledby="tab-daily-check">
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
                                            {row.kind === 'narcotic' ? <span className="status-tag urgent">麻薬</span> : <span className="status-tag" style={{ background: '#dbeafe', color: '#1e40af' }}>向精神薬</span>}
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
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }} className="text-muted">
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
        </section>
      )}


      {activeTab === 'drugs' && (
        <section className="tab-content" id="panel-drugs" role="tabpanel" aria-labelledby="tab-drugs">
            {negativeStockSummary.count > 0 && (
                <div className="inventory-alert" role="status">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <div>
                        <strong>マイナス在庫が {negativeStockSummary.count} 件あります</strong>
                        <span>
                            不足合計 {negativeStockSummary.totalShortage.toLocaleString()}。
                            {negativeStockSummary.sampleNames.length > 0 && ` 例: ${negativeStockSummary.sampleNames.join('、')}`}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="btn-secondary negative-filter-button"
                        onClick={() => setShowNegativeOnly(prev => !prev)}
                    >
                        {showNegativeOnly ? '全件表示' : 'マイナス在庫のみ表示'}
                    </button>
                </div>
            )}
            <div className="search-bar">
                <Search size={18} className="search-icon" aria-hidden="true" />
                <input
                    ref={searchInputRef}
                    type="search"
                    placeholder="医薬品名またはYJコードで検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="医薬品名またはYJコードで検索"
                />
                {searchQuery && (
                    <button
                        className="btn-clear"
                        onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                        aria-label="検索キーワードをクリア"
                        title="検索キーワードをクリア"
                    >
                        <X size={14} aria-hidden="true" />
                    </button>
                )}
                {showNegativeOnly && (
                    <span className="negative-filter-chip">
                        マイナス在庫のみ
                        <button
                            type="button"
                            onClick={() => setShowNegativeOnly(false)}
                            aria-label="マイナス在庫のみ表示を解除"
                            title="マイナス在庫のみ表示を解除"
                        >
                            <X size={13} aria-hidden="true" />
                        </button>
                    </span>
                )}
            </div>

            <div className="drug-list">
                {filteredDrugs.length === 0 ? (
                    <p className="no-results">検索結果がありません。</p>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>YJコード</th>
                                    <th>現在庫 (実在庫)</th>
                                    <th>引き渡し予定</th>
                                    <th>利用可能在庫</th>
                                    <th>医薬品名</th>
                                    <th>棚番地 (MAP)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDrugs.map(drug => (
                                    <InventoryRow
                                        key={drug.code}
                                        drug={drug}
                                        pendingStock={pendingStockMap.get(drug.code) || 0}
                                        db={db}
                                        locations={locations}
                                    />
                                ))}
                            </tbody>
                        </table>
                        {filteredDrugs.length >= 100 && (
                            <div className="limit-message text-muted text-sm" style={{ textAlign: 'center', marginTop: '1rem' }}>
                                ※検索結果が多すぎます。上位100件のみ表示しています。条件を絞り込んでください。
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
      )}

      {activeTab === 'locations' && (
        <section className="tab-content" id="panel-locations" role="tabpanel" aria-labelledby="tab-locations">
            <LocationMaster db={db} locations={locations} drugs={drugs} />
        </section>
      )}

      {activeTab === 'transfer' && (
        <section className="tab-content" id="panel-transfer" role="tabpanel" aria-labelledby="tab-transfer">
            <StockTransferPanel db={db} drugs={drugs} stockLots={stockLots} prefill={transferPrefill} />
        </section>
      )}

      {activeTab === 'dead-stock' && (
        <section className="tab-content" id="panel-dead-stock" role="tabpanel" aria-labelledby="tab-dead-stock">
            <DeadStockPanel
                db={db}
                drugs={drugs}
                stockLots={stockLots}
                onOpenTransfer={(entry) => openTransferWith({ drugCode: entry.drugCode, quantity: entry.stockQuantity, direction: 'out' })}
            />
        </section>
      )}




      {(activeTab === 'import' || activeTab === 'import-ocr') && (
        <section className="tab-content" id={activeTab === 'import' ? "panel-import" : "panel-import-ocr"} role="tabpanel" aria-labelledby={activeTab === 'import' ? "tab-import" : "tab-import-ocr"}>
            <ImportMaster db={db} drugs={drugs} activeTab={activeTab} orderedDrugIds={orderedDrugIds} onDrugsReceived={handleDrugsReceivedViaImport} />
        </section>
      )}

      <style jsx>{`
        .inventory-container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .page-header {
            margin-bottom: 2rem;
        }
        .page-header h1 {
            font-size: 1.5rem;
            color: var(--text-dark);
            margin-bottom: 1rem;
        }
        .tabs {
            display: flex;
            gap: 0.5rem;
            overflow-x: auto;
            scrollbar-width: thin;
            border-bottom: 1px solid var(--border);
            padding-bottom: 0.65rem;
        }
        .tab {
            flex: 0 0 auto;
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.55rem 0.9rem;
            background: white;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            font-size: 0.86rem;
            font-weight: 700;
            white-space: nowrap;
            cursor: pointer;
            color: var(--text-muted);
            transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
        }
        .tab:hover {
            color: var(--primary);
            border-color: var(--primary);
            background: var(--primary-light);
        }
        .tab:focus-visible {
            outline: 2px solid var(--primary);
            outline-offset: 2px;
        }
        .tab.active {
            color: white;
            background: var(--primary);
            border-color: var(--primary);
            box-shadow: 0 8px 18px rgb(37 99 235 / 0.14);
        }
        .search-bar {
            position: relative;
            margin-bottom: 1.5rem;
            max-width: 500px;
        }
        .search-icon {
            position: absolute;
            left: 1rem;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-ghost);
        }
        .search-bar input {
            width: 100%;
            padding: 0.75rem 2.5rem 0.75rem 2.5rem !important;
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            font-size: 1rem;
        }
        .search-bar input:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }
        .daily-check-card {
            padding: 1.25rem;
            border-radius: 8px;
        }
        .daily-check-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 1rem;
            margin-bottom: 1rem;
        }
        .daily-check-header h3 {
            margin: 0 0 0.3rem;
            font-size: 1.1rem;
            line-height: 1.4;
            letter-spacing: 0;
        }
        .daily-check-header p {
            margin: 0;
            font-size: 0.86rem;
        }
        .daily-check-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 0.5rem;
        }
        .compact {
            min-height: 36px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.35rem;
            padding: 0.4rem 0.65rem;
            font-size: 0.8rem;
            white-space: nowrap;
        }
        .daily-check-summary-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 1rem;
            background: white;
        }
        .daily-check-summary-item {
            min-width: 0;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            padding: 0.75rem 0.9rem;
            border-right: 1px solid var(--border);
            color: var(--text-muted);
            background: var(--bg-muted);
        }
        .daily-check-summary-item:last-child {
            border-right: none;
        }
        .daily-check-summary-item span {
            font-size: 0.78rem;
            font-weight: 700;
        }
        .daily-check-summary-item strong {
            color: var(--text-dark);
            font-size: 1.2rem;
            line-height: 1;
        }
        .daily-check-summary-item.done {
            background: var(--success-soft, #ecfdf5);
        }
        .daily-check-summary-item.done strong {
            color: var(--success, #047857);
        }
        .daily-check-summary-item.attention {
            background: #fffbeb;
        }
        .daily-check-summary-item.attention strong {
            color: #b45309;
        }
        .daily-check-summary-item.alert {
            background: var(--danger-soft, #fef2f2);
        }
        .daily-check-summary-item.alert strong {
            color: var(--destructive, #dc2626);
        }
        .daily-check-toolbar {
            display: grid;
            grid-template-columns: minmax(230px, 1fr) auto auto auto;
            align-items: end;
            gap: 0.65rem;
            margin-bottom: 0.85rem;
        }
        .daily-check-search {
            position: relative;
            min-width: 0;
        }
        .daily-check-search .search-icon {
            left: 0.75rem;
        }
        .daily-check-search input {
            width: 100%;
            min-height: 40px;
            box-sizing: border-box;
            padding: 0.55rem 2.25rem;
            border: 1px solid var(--border);
            border-radius: 6px;
            background: white;
            color: var(--text-dark);
            font-size: 0.88rem;
        }
        .daily-check-search input:focus,
        .daily-check-filter select:focus,
        .daily-count-input input:focus,
        .daily-reason-select:focus {
            outline: 2px solid rgba(37, 99, 235, 0.24);
            outline-offset: 0;
            border-color: var(--primary);
        }
        .daily-check-search .btn-clear {
            right: 0.55rem;
            top: 50%;
            transform: translateY(-50%);
        }
        .daily-check-filter {
            display: grid;
            gap: 0.2rem;
            color: var(--text-muted);
            font-size: 0.72rem;
            font-weight: 700;
        }
        .daily-check-filter select {
            min-height: 40px;
            padding: 0.45rem 2rem 0.45rem 0.65rem;
            border: 1px solid var(--border);
            border-radius: 6px;
            background: white;
            color: var(--text-dark);
            font-size: 0.85rem;
        }
        .daily-check-filter-count {
            min-height: 40px;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            color: var(--text-muted);
            font-size: 0.8rem;
            white-space: nowrap;
        }
        .data-table {
            width: 100%;
            min-width: 980px;
            border-collapse: collapse;
            background: white;
            border-radius: var(--radius-md);
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .data-table th, .data-table td {
            padding: 1rem;
            text-align: left;
            border-bottom: 1px solid var(--border);
            white-space: nowrap;
        }
        .data-table th {
            background: var(--bg-muted);
            font-weight: 600;
            color: var(--text-dark);
        }
        .data-table th:nth-child(5),
        .data-table td:nth-child(5) {
            min-width: 280px;
            white-space: normal;
        }
        .daily-check-table {
            min-width: 1040px;
        }
        .daily-check-table th,
        .daily-check-table td {
            padding: 0.72rem 0.65rem;
            vertical-align: middle;
        }
        .daily-check-table th {
            font-size: 0.78rem;
        }
        .daily-check-table th:nth-child(2),
        .daily-check-table td:nth-child(2) {
            width: 24%;
            min-width: 210px;
            white-space: normal;
        }
        .daily-check-table th:nth-child(5),
        .daily-check-table td:nth-child(5) {
            width: auto;
            min-width: 120px;
            white-space: nowrap;
        }
        .daily-check-table th:nth-child(6),
        .daily-check-table td:nth-child(6) {
            min-width: 230px;
        }
        .daily-drug-name {
            min-width: 0;
            display: grid;
            gap: 0.22rem;
        }
        .daily-drug-name > span:first-child {
            font-weight: 700;
            color: var(--text-dark);
            line-height: 1.35;
        }
        .daily-previous-check {
            color: var(--text-muted);
            font-size: 0.74rem;
            line-height: 1.35;
            white-space: normal;
        }
        .daily-previous-check.warn {
            color: #b45309;
        }
        .daily-check-table tbody tr.unentered-row {
            background: #fffdf5;
        }
        .daily-check-table tbody tr.matched-row {
            background: #fbfefc;
        }
        .daily-check-table tbody tr.mismatch-row {
            background: var(--danger-soft, #fef2f2);
        }
        .daily-check-table tbody tr:hover {
            filter: brightness(0.985);
        }
        .daily-count-input {
            display: grid;
            grid-template-columns: 32px minmax(68px, 84px) 32px 34px 34px;
            align-items: center;
            gap: 0.3rem;
        }
        .daily-count-cell {
            display: grid;
            gap: 0.35rem;
            min-width: 220px;
        }
        .daily-count-input input {
            width: 100%;
            min-height: 34px;
            box-sizing: border-box;
            padding: 0.3rem 0.4rem;
            border: 1px solid var(--border);
            border-radius: 5px;
            background: white;
            color: var(--text-dark);
            text-align: right;
            font-size: 0.92rem;
            font-variant-numeric: tabular-nums;
        }
        .daily-count-input input::placeholder {
            color: var(--text-ghost);
        }
        .daily-reason-select {
            width: 100%;
            min-height: 34px;
            box-sizing: border-box;
            padding: 0.35rem 1.8rem 0.35rem 0.5rem;
            border: 1px solid var(--border);
            border-radius: 5px;
            background: white;
            color: var(--text-dark);
            font-size: 0.8rem;
        }
        .daily-reason-select.missing {
            border-color: rgba(220, 38, 38, 0.65);
            background: #fff7f7;
            color: var(--destructive, #dc2626);
        }
        .count-step-button,
        .daily-match-button,
        .daily-clear-row-button {
            min-height: 34px;
            border: 1px solid var(--border);
            border-radius: 5px;
            background: white;
            color: var(--text-dark);
            cursor: pointer;
            font-weight: 700;
        }
        .count-step-button {
            width: 32px;
            padding: 0;
            font-size: 1rem;
        }
        .daily-match-button {
            width: 34px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            color: var(--primary);
            border-color: rgba(37, 99, 235, 0.35);
        }
        .count-step-button:hover,
        .daily-match-button:hover,
        .daily-clear-row-button:hover:not(:disabled) {
            border-color: var(--primary);
            background: var(--primary-light);
        }
        .daily-diff-cell {
            font-weight: 800;
            text-align: right;
            font-variant-numeric: tabular-nums;
        }
        .daily-diff-cell.unentered {
            color: #92400e;
        }
        .daily-diff-cell.ok {
            color: var(--success, #047857);
        }
        .daily-diff-cell.mismatch {
            color: var(--destructive, #dc2626);
        }
        .daily-clear-row-button {
            width: 34px;
            min-height: 34px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            color: var(--text-muted);
        }
        .daily-clear-row-button:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .daily-check-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            margin-top: 1rem;
            padding-top: 1rem;
            border-top: 1px solid var(--border);
        }
        .daily-check-save-note {
            color: var(--text-muted);
            font-size: 0.85rem;
            font-weight: 700;
        }
        .daily-check-save-note.alert {
            color: var(--destructive, #dc2626);
        }
        .drug-list,
        .table-wrapper {
            overflow-x: auto;
        }
        .no-results {
            color: var(--text-muted);
            text-align: center;
            padding: 2rem;
        }
        .inventory-alert {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-bottom: 1rem;
            padding: 0.9rem 1rem;
            border: 1px solid var(--destructive);
            border-radius: var(--radius-md);
            color: var(--destructive);
            background: var(--danger-soft, #fef2f2);
        }
        .inventory-alert div {
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            flex: 1;
        }
        .inventory-alert span {
            color: var(--text-muted);
            font-size: 0.86rem;
        }
        .negative-filter-button {
            white-space: nowrap;
            border-color: var(--destructive);
            color: var(--destructive);
            background: white;
        }
        .negative-filter-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            margin-left: 0.5rem;
            padding: 0.3rem 0.5rem;
            border-radius: 999px;
            font-size: 0.8rem;
            color: var(--destructive);
            background: var(--danger-soft, #fef2f2);
            border: 1px solid rgba(220, 38, 38, 0.2);
        }
        .negative-filter-chip button {
            border: none;
            background: transparent;
            color: inherit;
            cursor: pointer;
            display: inline-flex;
            padding: 0;
        }
        .inventory-name-cell {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
        }
        .inline-adjust-button {
            border: 1px solid var(--destructive);
            color: var(--destructive);
            background: white;
            border-radius: 6px;
            padding: 0.25rem 0.5rem;
            font-size: 0.78rem;
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
        }
        .inline-adjust-button:hover:not(:disabled) {
            background: var(--danger-soft, #fef2f2);
        }
        .inline-adjust-button:disabled {
            opacity: 0.65;
            cursor: not-allowed;
        }
        @media (max-width: 900px) {
            .daily-check-header {
                flex-direction: column;
            }
            .daily-check-actions {
                justify-content: flex-start;
            }
            .daily-check-toolbar {
                grid-template-columns: minmax(220px, 1fr) repeat(2, auto);
            }
            .daily-check-filter-count {
                grid-column: 1 / -1;
                min-height: auto;
                justify-content: flex-start;
            }
        }
        @media (max-width: 760px) {
            .daily-check-card {
                padding: 0.9rem;
            }
            .daily-check-summary-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .daily-check-summary-item:nth-child(2) {
                border-right: none;
            }
            .daily-check-summary-item:nth-child(-n + 2) {
                border-bottom: 1px solid var(--border);
            }
            .daily-check-toolbar {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .daily-check-search,
            .daily-check-filter-count {
                grid-column: 1 / -1;
            }
            .daily-check-footer {
                align-items: stretch;
                flex-direction: column;
            }
            .daily-check-footer .btn-tooltip-wrapper,
            .daily-check-footer button {
                width: 100%;
            }
            .inventory-alert {
                align-items: flex-start;
                flex-direction: column;
            }
            .negative-filter-button {
                width: 100%;
            }
        }
        @media (max-width: 520px) {
            .daily-check-actions,
            .daily-check-actions .compact {
                width: 100%;
            }
            .daily-check-toolbar {
                grid-template-columns: 1fr;
            }
            .daily-check-filter,
            .daily-check-search,
            .daily-check-filter-count {
                grid-column: 1;
            }
        }
      `}</style>
    </div>
  );
}

function OrderWorkbench({
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
}: {
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
}) {
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

            <style jsx>{`
                .order-workbench-card {
                    background: #fff;
                    border: 1px solid var(--border);
                    border-radius: var(--radius-md);
                    box-shadow: var(--shadow-sm);
                    padding: 1.25rem;
                }
                .order-workbench-header {
                    display: flex;
                    align-items: flex-start;
                    justify-content: space-between;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .order-workbench-header h3 {
                    margin: 0 0 0.25rem;
                    font-size: 1.18rem;
                }
                .order-workbench-actions {
                    flex: 0 0 auto;
                    display: flex;
                    flex-wrap: wrap;
                    justify-content: flex-end;
                    gap: 0.5rem;
                }
                .compact {
                    min-height: 36px;
                    padding: 0.35rem 0.7rem;
                    gap: 0.35rem;
                }
                .order-summary-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 0.75rem;
                    margin-bottom: 1rem;
                }
                .order-summary-item {
                    min-height: 76px;
                    display: grid;
                    align-content: center;
                    gap: 0.15rem;
                    padding: 0.8rem;
                    border: 1px solid var(--border);
                    border-radius: var(--radius-md);
                    background: var(--bg-subtle);
                }
                .order-summary-item span {
                    color: var(--text-muted);
                    font-size: 0.78rem;
                    font-weight: 800;
                }
                .order-summary-item strong {
                    color: var(--text-main);
                    font-size: 1.55rem;
                    line-height: 1;
                }
                .order-summary-item.urgent {
                    background: var(--danger-soft);
                    border-color: #fecaca;
                }
                .order-summary-item.urgent strong,
                .order-summary-item.urgent span {
                    color: var(--danger);
                }
                .order-summary-item.done {
                    background: var(--success-soft);
                    border-color: var(--green-200);
                }
                .order-summary-item.done strong,
                .order-summary-item.done span {
                    color: var(--success);
                }
                .order-empty {
                    min-height: 120px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px dashed var(--border-strong);
                    border-radius: var(--radius-md);
                    color: var(--text-muted);
                    font-weight: 700;
                }
                .order-candidate-list {
                    display: grid;
                    gap: 0.7rem;
                }
                .order-candidate-row {
                    min-height: 92px;
                    display: grid;
                    grid-template-columns: minmax(0, 1.3fr) minmax(170px, 0.7fr) auto;
                    align-items: center;
                    gap: 0.85rem;
                    padding: 0.85rem;
                    border: 1px solid var(--border);
                    border-left-width: 4px;
                    border-radius: var(--radius-md);
                    background: #fff;
                }
                .order-candidate-row.high {
                    border-left-color: var(--danger);
                }
                .order-candidate-row.medium {
                    border-left-color: var(--warning);
                }
                .order-candidate-row.ordered {
                    opacity: 0.66;
                    background: var(--bg-subtle);
                }
                .order-candidate-main,
                .order-candidate-amounts {
                    min-width: 0;
                    display: grid;
                    gap: 0.25rem;
                }
                .order-candidate-title {
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    gap: 0.45rem;
                }
                .order-candidate-title strong {
                    min-width: 0;
                    overflow-wrap: anywhere;
                }
                .order-priority {
                    flex: 0 0 auto;
                    min-height: 22px;
                    display: inline-flex;
                    align-items: center;
                    padding: 0.05rem 0.38rem;
                    border-radius: var(--radius-sm);
                    font-size: 0.7rem;
                    font-weight: 850;
                }
                .order-priority.high {
                    background: var(--danger-soft);
                    color: var(--danger);
                    border: 1px solid #fecaca;
                }
                .order-priority.medium {
                    background: #fff7ed;
                    color: #c2410c;
                    border: 1px solid #fed7aa;
                }
                .order-candidate-meta {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.35rem;
                    color: var(--text-muted);
                    font-size: 0.78rem;
                    font-weight: 800;
                }
                .order-candidate-meta span {
                    min-height: 23px;
                    display: inline-flex;
                    align-items: center;
                    padding: 0.06rem 0.38rem;
                    border-radius: var(--radius-sm);
                    background: var(--bg-subtle);
                }
                .order-candidate-action {
                    color: #0369a1;
                    font-size: 0.8rem;
                    font-weight: 850;
                }
                .order-candidate-amounts {
                    color: var(--text-muted);
                    font-size: 0.8rem;
                    font-weight: 800;
                    text-align: right;
                }
                .order-candidate-amounts strong {
                    color: var(--text-main);
                }
                .order-candidate-buttons {
                    display: flex;
                    flex-direction: column;
                    align-items: stretch;
                    gap: 0.4rem;
                }
                .order-status-button {
                    min-height: 36px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.35rem;
                    padding: 0.35rem 0.65rem;
                    border: 1px solid #bae6fd;
                    border-radius: var(--radius-sm);
                    background: #f0f9ff;
                    color: #0369a1;
                    cursor: pointer;
                    font-size: 0.78rem;
                    font-weight: 850;
                    white-space: nowrap;
                }
                .order-status-button.ordered {
                    border-color: var(--green-200);
                    background: var(--success-soft);
                    color: var(--success);
                }
                .receiving-form {
                    grid-column: 1 / -1;
                    display: grid;
                    grid-template-columns: minmax(96px, 0.7fr) minmax(110px, 1fr) minmax(128px, 1fr) minmax(128px, 1fr) minmax(140px, 1fr) auto;
                    gap: 0.6rem;
                    align-items: end;
                    padding-top: 0.7rem;
                    border-top: 1px solid var(--border);
                }
                .receiving-form label {
                    min-width: 0;
                    display: grid;
                    gap: 0.2rem;
                    color: var(--text-muted);
                    font-size: 0.72rem;
                    font-weight: 850;
                }
                .receiving-form input {
                    width: 100%;
                    min-height: 36px;
                    box-sizing: border-box;
                    border: 1px solid var(--border);
                    border-radius: var(--radius-sm);
                    padding: 0.35rem 0.45rem;
                    color: var(--text-main);
                    background: #fff;
                    font-size: 0.85rem;
                }
                .receiving-form input:focus {
                    outline: 2px solid rgba(37, 99, 235, 0.28);
                    border-color: var(--primary);
                }
                .receiving-submit-button {
                    min-height: 36px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.35rem;
                    padding: 0.35rem 0.7rem;
                    border: 1px solid var(--green-200);
                    border-radius: var(--radius-sm);
                    background: var(--success-soft);
                    color: var(--success);
                    cursor: pointer;
                    font-size: 0.78rem;
                    font-weight: 850;
                    white-space: nowrap;
                }
                .receiving-submit-button:disabled {
                    opacity: 0.65;
                    cursor: wait;
                }
                .order-workbench-footer {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 1rem;
                    padding-top: 1rem;
                    border-top: 1px solid var(--border);
                }
                @media (max-width: 860px) {
                    .order-workbench-header {
                        flex-direction: column;
                    }
                    .order-workbench-actions {
                        width: 100%;
                        justify-content: flex-start;
                    }
                    .order-summary-grid,
                    .order-candidate-row {
                        grid-template-columns: 1fr;
                    }
                    .receiving-form {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                    .order-candidate-amounts {
                        text-align: left;
                    }
                    .order-status-button {
                        width: 100%;
                    }
                    .receiving-submit-button {
                        width: 100%;
                    }
                }
                @media (max-width: 560px) {
                    .order-summary-grid {
                        grid-template-columns: 1fr;
                    }
                    .receiving-form {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </div>
    );
}

// ⚡ Bolt: Memoize individual inventory rows to prevent unnecessary re-renders of 1000+ DOM elements
// on every keystroke when typing in the search bar. This is a crucial optimization for large lists.
const InventoryRow = React.memo(function InventoryRow({ drug, pendingStock, db, locations }: { drug: DrugWithSearchCache, pendingStock: number, db: any, locations: Location[] }) {
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
// ⚡ Bolt: Wrapped LocationEditor in React.memo() to prevent unnecessary re-renders of all rows when typing in the search query.
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
            // ⚡ Bolt: Use cached RxDocument instead of redundant findOne lookup
            // Clearing location
            if (drug.doc) {
                await drug.doc.patch({ location: '' });
            }
            return;
        }

        const locationString = `${p1}-${p2}-${p3}`;

        // Check if location exists in master
        // ⚡ Bolt: Replace .some() with a manual loop to prevent closure allocations and optimize iteration speed.
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
                // Revert if cancelled? User requested a dialog, if they say no, maybe we just don't save or still save to drug but not master?
                // Typically if they say no, we shouldn't proceed.
                return;
            }
        }

        // ⚡ Bolt: Use cached RxDocument instead of redundant findOne lookup
        if (drug.doc) {
            await drug.doc.patch({ location: locationString });
        }
    };

    const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
        // Only trigger save if focus moved outside the parent container
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

            <style jsx>{`
                .location-inputs {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .location-inputs input {
                    width: 60px;
                    padding: 0.5rem;
                    border: 1px solid var(--border);
                    border-radius: 4px;
                    text-align: center;
                }
                .location-inputs input:focus {
                    outline: none;
                    border-color: var(--primary);
                }
                .location-inputs span {
                    color: var(--text-muted);
                    font-weight: bold;
                }
            `}</style>
        </div>
    );
});

// 分譲(薬局間の医薬品譲渡・譲受)。在庫を増減し、法定記録を監査ログへ残して記録書を印刷する。
function StockTransferPanel({ db, drugs, stockLots, prefill }: { db: any, drugs: DrugWithSearchCache[], stockLots: DrugStock[], prefill?: TransferPrefill | null }) {
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

            <style jsx>{`
                .transfer-panel { display: grid; gap: 1rem; }
                .transfer-form-card h3, .transfer-history-card h3 { margin-bottom: 0.5rem; }
                .transfer-note { margin-bottom: 0.9rem; font-size: 0.85rem; }
                .transfer-direction { display: flex; gap: 0.6rem; margin-bottom: 0.9rem; }
                .transfer-direction label {
                    display: inline-flex; align-items: center; gap: 0.4rem;
                    border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem 0.8rem;
                    cursor: pointer; font-weight: 700; font-size: 0.86rem; background: #fff;
                }
                .transfer-direction label.active { border-color: var(--primary); background: var(--primary-light); color: var(--primary-dark); }
                .transfer-field { display: grid; gap: 0.3rem; margin-bottom: 0.75rem; min-width: 0; }
                .transfer-field > span, .transfer-field > label { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); }
                .transfer-field input, .transfer-field select {
                    min-height: 40px; border: 1px solid var(--border); border-radius: 8px;
                    padding: 0 0.7rem; font-size: 0.9rem; background: #fff; min-width: 0;
                }
                .transfer-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
                .transfer-selected-drug {
                    display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
                    border: 1px solid var(--primary-soft); background: var(--primary-light);
                    border-radius: 8px; padding: 0.6rem 0.8rem;
                }
                .transfer-selected-drug strong { display: block; font-size: 0.92rem; }
                .transfer-selected-drug span { font-size: 0.78rem; color: var(--text-muted); }
                .transfer-drug-search { position: relative; }
                .transfer-drug-search input { width: 100%; }
                .transfer-drug-suggestions {
                    position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 4px);
                    background: #fff; border: 1px solid var(--border); border-radius: 8px;
                    box-shadow: var(--shadow-md); list-style: none; margin: 0; padding: 0.25rem;
                    max-height: 280px; overflow-y: auto;
                }
                .transfer-drug-suggestions button {
                    width: 100%; display: grid; gap: 0.1rem; text-align: left; border: none;
                    background: transparent; padding: 0.5rem 0.6rem; border-radius: 6px; cursor: pointer;
                }
                .transfer-drug-suggestions button:hover { background: var(--bg-hover); }
                .suggestion-name { font-weight: 700; font-size: 0.88rem; }
                .suggestion-meta { font-size: 0.75rem; color: var(--text-muted); }
                .transfer-actions { margin-top: 0.5rem; }
                .transfer-history-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
                .transfer-history-table th, .transfer-history-table td {
                    border-bottom: 1px solid var(--border); padding: 0.5rem 0.55rem; text-align: left;
                }
                .transfer-history-table .text-right { text-align: right; }
                .transfer-history-drug { word-break: break-all; }
                .transfer-badge {
                    display: inline-block; padding: 0.12rem 0.5rem; border-radius: 999px;
                    font-size: 0.74rem; font-weight: 800; white-space: nowrap;
                }
                .transfer-badge.out { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
                .transfer-badge.in { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
            `}</style>
        </div>
    );
}

// 不動在庫: 一定期間、調剤も入荷もない在庫を金額・期限リスク付きで洗い出す
function DeadStockPanel({ db, drugs, stockLots, onOpenTransfer }: { db: any, drugs: DrugWithSearchCache[], stockLots: DrugStock[], onOpenTransfer: (entry: DeadStockEntry) => void }) {
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

            <style jsx>{`
                .dead-stock-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.75rem; }
                .dead-stock-header h3 { margin-bottom: 0.25rem; }
                .dead-stock-controls { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
                .dead-stock-controls label { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); }
                .dead-stock-controls select { min-height: 38px; border: 1px solid var(--border); border-radius: 8px; padding: 0 0.5rem; background: #fff; }
                .dead-stock-summary { display: flex; gap: 1.25rem; margin-bottom: 0.75rem; font-size: 0.9rem; color: var(--text-muted); }
                .dead-stock-summary strong { color: var(--text-main); font-size: 1.05rem; }
                .dead-stock-table-wrap { overflow-x: auto; }
                .dead-stock-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
                .dead-stock-table th, .dead-stock-table td { border-bottom: 1px solid var(--border); padding: 0.5rem 0.55rem; text-align: left; white-space: nowrap; }
                .dead-stock-table .text-right { text-align: right; }
                .dead-stock-drug { white-space: normal; word-break: break-all; min-width: 180px; }
                .dead-stock-flag {
                    display: inline-block; margin-left: 0.35rem; padding: 0.1rem 0.45rem; border-radius: 999px;
                    background: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-size: 0.72rem; font-weight: 800;
                }
                .dead-stock-flag.expiry { background: #fee2e2; color: #b91c1c; border-color: #fecaca; }
            `}</style>
        </div>
    );
}

// 表示用の棚番テキスト。空のパートを飛ばして「A-01」「A-1-2」の形にする
const buildLocationDisplayText = (p1: string, p2: string, p3: string): string => (
    [p1, p2, p3].filter(Boolean).join('-')
);

function LocationMaster({ db, locations, drugs }: { db: any, locations: Location[], drugs: DrugWithSearchCache[] }) {
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
        const prefix = toHalfWidth(bulkPrefix.trim());
        const start = parseInt(bulkStart, 10);
        const end = parseInt(bulkEnd, 10);
        if (!prefix) {
            alert('棚のプレフィックス(例: A)を入力してください。');
            return;
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
            alert('開始・終了番号を正しく入力してください(開始 ≦ 終了)。');
            return;
        }
        if (end - start + 1 > 200) {
            alert('一括作成は一度に200件までにしてください。');
            return;
        }

        setIsBulkCreating(true);
        try {
            const existing = new Set(locations.map((loc) => `${loc.part1}|${loc.part2}|${loc.part3}`));
            const padWidth = String(end).length >= 2 ? String(end).length : 2;
            let created = 0;
            for (let n = start; n <= end; n++) {
                const p2 = String(n).padStart(padWidth, '0');
                if (existing.has(`${prefix}|${p2}|`)) continue;
                await db.locations.insert({
                    id: generateUUID(),
                    part1: prefix,
                    part2: p2,
                    part3: '',
                    displayText: buildLocationDisplayText(prefix, p2, '')
                });
                created++;
            }
            alert(created > 0
                ? `棚番を${created}件作成しました(${prefix}-${String(start).padStart(padWidth, '0')} 〜 ${prefix}-${String(end).padStart(padWidth, '0')})。`
                : '追加対象はありませんでした(すべて登録済み)。');
        } catch (error) {
            console.error('Failed to bulk-create locations:', error);
            alert('棚番の一括作成に失敗しました。');
        } finally {
            setIsBulkCreating(false);
        }
    };

    const handleDeleteUnused = async () => {
        if (!db || unusedLocations.length === 0) return;
        if (!window.confirm(`未使用の棚番 ${unusedLocations.length}件を削除しますか？(薬品が割り当てられている棚番は残ります)`)) return;
        try {
            for (const loc of unusedLocations) {
                const doc = await db.locations.findOne(loc.id).exec();
                if (doc) await doc.remove();
            }
        } catch (error) {
            console.error('Failed to delete unused locations:', error);
            alert('未使用棚番の削除に失敗しました。');
        }
    };

    const handleAdd = async () => {
        if (!db) return;
        const p1 = toHalfWidth(part1.trim());
        const p2 = toHalfWidth(part2.trim());
        const p3 = toHalfWidth(part3.trim());

        if (!p1 && !p2 && !p3) return;

        const locationString = buildLocationDisplayText(p1, p2, p3);

        // ⚡ Bolt: Replace .some() with a manual loop to prevent closure allocations and optimize iteration speed.
        let exists = false;
        for (let i = 0; i < locations.length; i++) {
            const l = locations[i];
            if (l.part1 === p1 && l.part2 === p2 && l.part3 === p3) {
                exists = true;
                break;
            }
        }
        if (exists) {
            alert('この棚番地はすでに存在します。');
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
                <p className="text-muted" style={{ fontSize: '0.83rem', marginBottom: '0.6rem' }}>
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
                        style={{ width: '90px' }}
                    />
                    <span aria-hidden="true">-</span>
                    <input
                        type="number"
                        min={0}
                        value={bulkStart}
                        onChange={e => setBulkStart(e.target.value)}
                        aria-label="一括作成の開始番号"
                        style={{ width: '90px' }}
                    />
                    <span aria-hidden="true">〜</span>
                    <input
                        type="number"
                        min={0}
                        value={bulkEnd}
                        onChange={e => setBulkEnd(e.target.value)}
                        aria-label="一括作成の終了番号"
                        style={{ width: '90px' }}
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
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginBottom: '0.5rem' }}>
                    <h3 style={{ margin: 0 }}>登録済みの棚番地</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span className="text-muted" style={{ fontSize: '0.83rem' }}>
                            登録 {locations.length}件 / 未使用 {unusedLocations.length}件
                            {unassignedStockedCount > 0 && ` / 棚番未設定の在庫あり薬品 ${unassignedStockedCount}件`}
                        </span>
                        <button
                            className="btn-secondary"
                            onClick={handleDeleteUnused}
                            disabled={unusedLocations.length === 0}
                            title="どの薬品にも割り当てられていない棚番をまとめて削除します"
                        >
                            未使用棚番を整理
                        </button>
                    </div>
                </div>
                {locations.length === 0 ? (
                    <p className="text-muted">棚番地が登録されていません。</p>
                ) : (
                    <ul className="location-grid">
                        {sortedLocations.map(loc => {
                            const usedCount = usageByLocation.get(loc.displayText) || 0;
                            return (
                                <li key={loc.id} className="location-item card">
                                    <span className="location-text">{loc.displayText}</span>
                                    <span
                                        className="location-usage"
                                        style={{
                                            fontSize: '0.72rem',
                                            fontWeight: 800,
                                            padding: '0.1rem 0.45rem',
                                            borderRadius: '999px',
                                            whiteSpace: 'nowrap',
                                            background: usedCount > 0 ? 'var(--primary-light)' : 'var(--bg-muted)',
                                            color: usedCount > 0 ? 'var(--primary-dark)' : 'var(--text-muted)'
                                        }}
                                    >
                                        {usedCount > 0 ? `使用 ${usedCount}` : '未使用'}
                                    </span>
                                    <button
                                      className="btn-delete"
                                      onClick={() => handleDelete(loc.id)}
                                      aria-label={`${loc.displayText}の棚番地を削除`}
                                    >
                                      削除
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <style jsx>{`
                .card {
                    background: white;
                    padding: 1.5rem;
                    border-radius: var(--radius-md);
                    border: 1px solid var(--border);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .add-location {
                    margin-bottom: 2rem;
                }
                .add-location h3, .location-list h3 {
                    margin-top: 0;
                    margin-bottom: 1rem;
                    font-size: 1.1rem;
                    color: var(--text-dark);
                }
                .location-inputs {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .location-inputs input {
                    width: 80px;
                    padding: 0.5rem;
                    border: 1px solid var(--border);
                    border-radius: 4px;
                    text-align: center;
                }
                .location-inputs input:focus {
                    outline: none;
                    border-color: var(--primary);
                }
                .btn-primary {
                    margin-left: 1rem;
                    padding: 0.5rem 1.5rem;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 500;
                }
                .btn-primary:hover {
                    background: var(--primary-dark);
                }
                .location-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 1rem;
                    list-style: none;
                    padding: 0;
                }
                .location-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem;
                }
                .location-text {
                    font-weight: 600;
                    font-size: 1.1rem;
                }
                .btn-delete {
                    padding: 0.25rem 0.5rem;
                    background: none;
                    border: 1px solid #ef4444;
                    color: #ef4444;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.8rem;
                }
                .btn-delete:hover {
                    background: #fef2f2;
                }
                .btn-delete:focus-visible {
                    outline: 2px solid var(--primary);
                    outline-offset: 2px;
                }
                .text-muted {
                    color: var(--text-muted);
                }
            `}</style>
        </div>
    );
}


function ImportMaster({ db, drugs, activeTab, orderedDrugIds, onDrugsReceived }: {
    db: any,
    drugs: DrugWithSearchCache[],
    activeTab: string,
    orderedDrugIds: Set<string>,
    onDrugsReceived: (drugCodes: string[]) => number
}) {
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
                    // ⚡ Bolt: Manually map ALL current schema properties to avoid .toJSON() overhead
                    // on large batches while ensuring no data loss. Use bulkUpsert to reduce
                    // database transactions and event emissions.
                    // NOTE: 'code' is the primary key for the 'drugs' collection.
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
                    <h3 style={{ marginTop: 0 }}>納品書写真から取り込み (OCR)</h3>
                    <p className="text-muted" style={{ marginBottom: '1.5rem' }}>納品書の写真をアップロードして、数量やロットなどを自動入力します。（スズケン等のフォーマットに対応）</p>

                    <div className="upload-zone" style={{ textAlign: 'center' }}>
                        <label className="file-input-label" style={{ cursor: isOcrProcessing ? 'wait' : 'pointer' }}>
                            <span className="btn-secondary" style={{ pointerEvents: 'none' }}>
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
                    <h3>卸データ（CSV）から入荷インポート</h3>
                    <p className="text-muted" style={{marginBottom: '1rem'}}>JD-NET / NHI形式などのCSVファイルを選択してください。</p>

                    <div className="upload-zone">
                        <label className="file-input-label">
                            <span className="btn-secondary" style={{ pointerEvents: 'none' }}>ファイルを選択 (CSV)</span>
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
                                {/* ⚡ Bolt: Prevent massive React renders by capping the preview list to 100 items. Rendering thousands of DOM nodes from a large CSV causes severe main thread blocking and browser freezes. */}
                                {parsedData.slice(0, 100).map((row, idx) => (
                                    <tr key={idx} style={{ backgroundColor: row.matchedDrug ? 'inherit' : '#fef2f2' }}>
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
                                                style={{ width: '80px', padding: '0.2rem' }}
                                                className="edit-input"
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
                            <div className="limit-message text-muted text-sm" style={{ textAlign: 'center', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
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

            <style jsx>{`
                .card {
                    background: white;
                    padding: 1.5rem;
                    border-radius: var(--radius-md);
                    border: 1px solid var(--border);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .text-muted { color: var(--text-muted); }
                .upload-zone {
                    margin-bottom: 2rem;
                }
                .preview-section h4 { margin-top: 0; margin-bottom: 1rem; }
                .table-wrapper {
                    max-height: 400px;
                    overflow-y: auto;
                    margin-bottom: 1rem;
                }
                .matched { color: #166534; font-weight: 500; }
                .unmatched { color: #dc2626; font-size: 0.9em; }
                .order-auto-clear-badge {
                    display: inline-block;
                    margin-left: 0.5rem;
                    padding: 0.1rem 0.45rem;
                    border-radius: 999px;
                    background: #eff6ff;
                    color: #1d4ed8;
                    border: 1px solid #bfdbfe;
                    font-size: 0.72rem;
                    font-weight: 800;
                    white-space: nowrap;
                }
                .action-bar {
                    display: flex;
                    justify-content: flex-end;
                    padding-top: 1rem;
                    border-top: 1px solid var(--border);
                }
                .btn-primary {
                    padding: 0.75rem 1.5rem;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 500;
                }
                .btn-primary:disabled {
                    background: var(--bg-muted);
                    color: var(--text-ghost);
                    cursor: not-allowed;
                }
                .file-input-label {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 2rem;
                    border: 2px dashed var(--border);
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    transition: all var(--transition-fast);
                    color: var(--primary);
                    font-weight: 500;
                }
                .file-input-label:hover {
                    border-color: var(--primary);
                    background: rgba(37, 99, 235, 0.05);
                }
                .file-input-label:focus-within {
                    outline: 2px solid var(--primary);
                    outline-offset: 2px;
                    border-color: var(--primary);
                }
                .hidden-input {
                    clip: rect(0 0 0 0);
                    clip-path: inset(50%);
                    height: 1px;
                    overflow: hidden;
                    position: absolute;
                    white-space: nowrap;
                    width: 1px;
                }
            `}</style>
        </div>
    );
}
