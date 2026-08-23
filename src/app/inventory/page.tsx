'use client';

import React, { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import './inventory.css';
import { useDatabase } from '@/db/DatabaseProvider';
import { Drug, Location, DrugStock } from '@/db/types';
import { generateUUID } from '@/lib/crypto';
import { calculateRequiredStockAmount, getStockDrugId, getTotalStock } from '@/lib/stock';
import { isGeneralNameDrugRecord } from '@/lib/master-data/drug_master';
import { logAuditAction, getCurrentUser } from '@/lib/audit';
import { isClaimEditBlocked } from '@/lib/claim_edit_guard';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Download,
  LayoutGrid,
  Loader2,
  MapPin,
  PackageX,
  ScanLine,
  Search,
  ShieldAlert,
  ShoppingCart,
  Upload,
  X
} from 'lucide-react';
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
  type DrugWithSearchCache,
  type TransferPrefill,
  type ReceivingDraft,
  defaultReceivingDraft,
  todayDateKey,
  toHalfWidth
} from './types';
import { LocationMaster } from './components/LocationMaster';
import { StockTransferPanel } from './components/StockTransferPanel';
import { DeadStockPanel } from './components/DeadStockPanel';
import { OrderWorkbench } from './components/OrderWorkbench';
import { ImportMaster } from './components/ImportMaster';
import { InventoryRow } from './components/InventoryRow';
import { DailyCheckPanel } from './components/DailyCheckPanel';

type InventoryTab = 'drugs' | 'locations' | 'import' | 'import-ocr' | 'daily-check' | 'order-workbench' | 'transfer' | 'dead-stock';
const INVENTORY_TABS: InventoryTab[] = ['drugs', 'locations', 'import', 'import-ocr', 'daily-check', 'order-workbench', 'transfer', 'dead-stock'];

const ORDER_WORKBENCH_STORAGE_PREFIX = 'yakureki_inventory_order_workbench_';

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
  const [transferPrefill, setTransferPrefill] = useState<TransferPrefill | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNegativeOnly, setShowNegativeOnly] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchInputRef = useRef<HTMLInputElement>(null);
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
            <DailyCheckPanel db={db} drugs={drugs} pendingStockMap={pendingStockMap} />
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
    </div>
  );
}
