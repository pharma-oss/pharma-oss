import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import { Search, X, AlertCircle } from 'lucide-react';
import type { Drug } from '@/db/types';
import { useDatabase } from '@/db/DatabaseProvider';
import { getDrugMasterRecords, isGeneralNameDrugRecord, type DrugMasterRecord } from '@/lib/master-data/drug_master';
import { formatDrugDisplayName } from '@/lib/master-data/drug_display';
import { getFormulationType } from '@/lib/calculator';

// ⚡ Bolt: Wrapped DrugListItem in React.memo to prevent unnecessary re-renders when parent states (like search query) change
const DrugListItem = React.memo(({
  drug,
  isSelected,
  stockQuantity,
  onSelect
}: {
  drug: DrugMasterRecord,
  isSelected: boolean,
  stockQuantity: number,
  onSelect: (drug: DrugMasterRecord) => void
}) => {
  const stockTitle = stockQuantity > 0 ? `在庫 ${stockQuantity}` : '在庫なし';

  return (
    <div
      className={`drug-item ${isSelected ? 'selected' : ''} ${drug.isAbolished ? 'abolished' : ''}`}
      onClick={() => !drug.isAbolished && onSelect(drug)}
      role="button"
      tabIndex={drug.isAbolished ? -1 : 0}
      aria-disabled={drug.isAbolished}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !drug.isAbolished) {
          e.preventDefault();
          onSelect(drug);
        }
      }}
    >
      <div className="drug-name-row">
        <div className="drug-name">
          {formatDrugDisplayName(drug.name)}
          {drug.isAbolished && <span className="tag-abolished">廃止</span>}
        </div>
        <span
          className={`stock-dot ${stockQuantity > 0 ? 'in-stock' : 'out-of-stock'}`}
          title={stockTitle}
          aria-label={stockTitle}
        />
      </div>
      <style jsx>{`
        .drug-item {
          min-height: 46px;
          padding: 0.7rem 0.85rem;
          border-bottom: 1px solid #edf1f7;
          cursor: pointer;
          background: #ffffff;
          transition: background var(--transition-fast), box-shadow var(--transition-fast);
        }

        .drug-item:hover {
          background: #f8fafc;
        }

        .drug-item.selected {
          background: #eef6ff;
          box-shadow: inset 4px 0 0 var(--primary);
        }

        .drug-item.abolished {
          opacity: 0.58;
          cursor: not-allowed;
          background: #f8fafc;
        }

        .drug-name-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.7rem;
        }

        .drug-name {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-main);
          font-size: 0.94rem;
          font-weight: 800;
          line-height: 1.35;
        }

        .tag-abolished {
          margin-left: 0.45rem;
          font-size: 0.68rem;
          background: #71717a;
          color: white;
          padding: 2px 6px;
          border-radius: 4px;
          vertical-align: middle;
        }

        .stock-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          display: inline-block;
          background: #d1d5db;
          box-shadow: 0 0 0 3px rgb(209 213 219 / 0.28);
          opacity: 0.82;
        }

        .stock-dot.in-stock {
          background: var(--success);
          box-shadow: 0 0 0 3px rgb(21 128 61 / 0.12);
        }
      `}</style>
    </div>
  );
});
DrugListItem.displayName = 'DrugListItem';

const isGeneralNameRecord = (drug: Pick<Drug, 'code' | 'name'>) => isGeneralNameDrugRecord(drug);

const normalizeDrugQuery = (value: string) => (
  value
    .toLowerCase()
    .replace(/[【［\[]\s*般\s*[】］\]]/g, '')
    .replace(/変更調剤なし/g, '')
    .replace(/変更なし/g, '')
    .trim()
);

const getSearchTerms = (value: string) => {
  const rawValue = value.trim().toLowerCase();
  const raw = rawValue === '変更調剤なし' || rawValue === '変更なし' ? '' : rawValue;
  const normalized = normalizeDrugQuery(value);
  return Array.from(new Set([raw, normalized].filter(Boolean)));
};

const matchesDrug = (drug: DrugMasterRecord, terms: string[]) => (
  terms.some((term) => (
    drug.searchNameLower.includes(term) ||
    drug.searchGenericLower.includes(term) ||
    drug.code.toLowerCase().includes(term) ||
    (drug.yjCode || '').toLowerCase().includes(term)
  ))
);

const getDosageGroup = (yjCode: string | undefined) => {
  if (!yjCode || yjCode.length < 8) return 'unknown';
  const dosageChar = yjCode[7];
  // 錠剤(F)、カプセル(G)、丸剤(H)は同一グループ
  if (['F', 'G', 'H'].includes(dosageChar)) return 'solid';
  // 散剤(B)、細粒(C)、顆粒(D)、ドライシロップ等(M)は同一グループ
  if (['B', 'C', 'D', 'M'].includes(dosageChar)) return 'powder';
  // 液剤(A)、シロップ(S)は同一グループ
  if (['A', 'S'].includes(dosageChar)) return 'liquid';
  return dosageChar;
};

interface DrugSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (drug: Drug, changeReason: string) => void;
  initialQuery?: string;
  mode?: 'prescribed' | 'dispensed';
  prescribedDrugCode?: string;
}

export default function DrugSearchModal({ isOpen, onClose, onSelect, initialQuery = '', mode = 'dispensed', prescribedDrugCode }: DrugSearchModalProps) {
  const db = useDatabase();
  const [query, setQuery] = useState(initialQuery);
  const [showAllCandidates, setShowAllCandidates] = useState(true);
  const [selectedDrug, setSelectedDrug] = useState<DrugMasterRecord | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  // ⚡ Bolt: Pre-compute lowercase names to avoid calling .toLowerCase() on every search keystroke
  const [allDrugs, setAllDrugs] = useState<DrugMasterRecord[]>([]);
  const [stockByCode, setStockByCode] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // ⚡ Bolt: Use useDeferredValue for the search query to prevent main thread blocking
  // during fast typing. This allows the input to remain responsive while the expensive
  // filtering of a large dataset happens in the background.
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load the app-local drug master instead of adding more RxDB collection work.
  useEffect(() => {
    let isMounted = true;
    if (isOpen) {
      setIsLoading(true);
      getDrugMasterRecords().then((drugs) => {
        if (!isMounted) return;
        setAllDrugs(drugs);
        setIsLoading(false);
      }).catch((error) => {
        console.error('Failed to load drug master:', error);
        if (!isMounted) return;
        setAllDrugs([]);
        setIsLoading(false);
      });
    }
    return () => { isMounted = false; };
  }, [isOpen]);

  useEffect(() => {
    let isMounted = true;
    if (!isOpen || !db) {
      setStockByCode(new Map());
      return () => { isMounted = false; };
    }

    db.drug_stocks.find().exec().then((stocks) => {
      if (!isMounted) return;
      const next = new Map<string, number>();
      for (const stock of stocks) {
        next.set(stock.drugCode, (next.get(stock.drugCode) || 0) + stock.quantity);
      }
      setStockByCode(next);
    }).catch((error) => {
      console.error('Failed to load drug stock:', error);
      if (isMounted) setStockByCode(new Map());
    });

    return () => { isMounted = false; };
  }, [db, isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setShowAllCandidates(true);
      setSelectedDrug(null);
      setChangeReason('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialQuery]);

  const getAvailableStock = React.useCallback((drug: DrugMasterRecord) => (
    stockByCode.get(drug.code) ?? drug.stockQuantity ?? 0
  ), [stockByCode]);

  const sortDrugsForInput = React.useCallback((drugs: DrugMasterRecord[], terms: string[]) => {
    const primaryTerm = terms.find((term) => !term.includes('【般】')) || terms[0] || '';
    const preferGeneral = terms.some((term) => term.includes('【般】'));
    const rank = (drug: DrugMasterRecord) => {
      const stockRank = getAvailableStock(drug) > 0 ? 0 : 1;
      const abolishedRank = drug.isAbolished ? 1 : 0;
      const generalRank = mode === 'prescribed' && isGeneralNameRecord(drug) !== preferGeneral ? 1 : 0;
      const name = drug.searchNameLower;
      const generic = drug.searchGenericLower;
      let matchRank = 5;

      if (primaryTerm) {
        if (name === primaryTerm) matchRank = 0;
        else if (name.startsWith(primaryTerm)) matchRank = 1;
        else if (name.includes(primaryTerm)) matchRank = 2;
        else if (generic.startsWith(primaryTerm)) matchRank = 3;
        else if (generic.includes(primaryTerm)) matchRank = 4;
      }

      return abolishedRank * 1000 + stockRank * 100 + generalRank * 10 + matchRank;
    };

    return [...drugs].sort((a, b) => {
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name, 'ja');
    });
  }, [getAvailableStock, mode]);

  const filteredDrugs = useMemo(() => {
    const terms = getSearchTerms(deferredQuery);
    if (terms.length === 0) return [];

    if (mode === 'prescribed') {
      const prescribedResults: DrugMasterRecord[] = [];
      for (let i = 0; i < allDrugs.length; i++) {
        const drug = allDrugs[i];
        if (matchesDrug(drug, terms)) {
          prescribedResults.push(drug);
          if (prescribedResults.length >= 150) break;
        }
      }
      return sortDrugsForInput(prescribedResults, terms);
    }

    const matchingGenericNames = new Set<string>();
    const matchingSourceDrugs: DrugMasterRecord[] = [];

    // ⚡ Bolt: Replace chained .filter().map() with a single manual loop to avoid O(N) array allocations
    // This is significantly faster for large arrays and reduces GC pressure during fast typing.
    for (let i = 0; i < allDrugs.length; i++) {
      const d = allDrugs[i];
      if (matchesDrug(d, terms)) {
        if (d.genericName) {
          matchingGenericNames.add(d.genericName);
          matchingSourceDrugs.push(d);
        }
      }
    }

    const prescribedPrefix = prescribedDrugCode && prescribedDrugCode.length >= 7
      ? prescribedDrugCode.substring(0, 7)
      : '';
    const prescribedFormulation = prescribedDrugCode ? getFormulationType(prescribedDrugCode) : '';

    if (!showAllCandidates) {
      // ⚡ Bolt: Replace O(N*M) nested array search with O(M) Map building and O(N) Map lookup.
      // Build a criteria map for valid substitutions per generic ingredient and dosage group.
      const substitutionCriteria = new Map<string, { hasBrand: boolean; maxGenericPrice: number }>();
      for (let i = 0; i < matchingSourceDrugs.length; i++) {
        const source = matchingSourceDrugs[i];
        if (!source.genericName) continue;
        const group = getDosageGroup(source.yjCode);
        const key = `${source.genericName}|${group}`;

        let criteria = substitutionCriteria.get(key);
        if (!criteria) {
          criteria = { hasBrand: false, maxGenericPrice: -1 };
          substitutionCriteria.set(key, criteria);
        }

        if (!source.isGeneric) {
          criteria.hasBrand = true;
        } else {
          if ((source.price || 0) > criteria.maxGenericPrice) {
            criteria.maxGenericPrice = source.price || 0;
          }
        }
      }

      const ruleResults: DrugMasterRecord[] = [];
      for (let i = 0; i < allDrugs.length; i++) {
        const drug = allDrugs[i];
        if (isGeneralNameRecord(drug)) continue;
        // 1. Must be part of the matched generic ingredient groups
        if (!drug.genericName || !matchingGenericNames.has(drug.genericName)) continue;

        // 2. Rule filtering: standard substitution candidates only
        if (!drug.isGeneric) continue;

        const targetGroup = getDosageGroup(drug.yjCode);
        const key = `${drug.genericName}|${targetGroup}`;
        const criteria = substitutionCriteria.get(key);

        // If no criteria exists for this generic/group combo, it is not a valid substitution
        if (!criteria) continue;

        // If replacing a generic with another generic, price must not be higher.
        // If replacing a brand name drug (hasBrand === true), price check is not required.
        if (!criteria.hasBrand && (drug.price || 0) > criteria.maxGenericPrice) {
          continue;
        }

        ruleResults.push(drug);

        // ⚡ Bolt: Prevent massive React renders by capping results.
        if (ruleResults.length >= 150) break;
      }

      return sortDrugsForInput(ruleResults, terms);
    }

    const results: DrugMasterRecord[] = [];
    const seenCodes = new Set<string>();

    for (let i = 0; i < allDrugs.length; i++) {
      const drug = allDrugs[i];
      if (isGeneralNameRecord(drug)) continue;

      const samePrescribedIngredient = !!(
        prescribedPrefix &&
        drug.yjCode?.startsWith(prescribedPrefix) &&
        getFormulationType(drug.yjCode) === prescribedFormulation
      );
      const sameMatchedIngredient = !prescribedPrefix && !!drug.genericName && matchingGenericNames.has(drug.genericName);

      if (!matchesDrug(drug, terms) && !samePrescribedIngredient && !sameMatchedIngredient) {
        continue;
      }
      if (seenCodes.has(drug.code)) continue;

      seenCodes.add(drug.code);
      results.push(drug);

      if (results.length >= 150) break;
    }

    return sortDrugsForInput(results, terms);
  }, [deferredQuery, mode, showAllCandidates, allDrugs, prescribedDrugCode, sortDrugsForInput]);

  const handleSelect = React.useCallback((drug: DrugMasterRecord) => {
    setSelectedDrug(drug);
    if (drug.isGeneric) {
      setChangeReason('');
    }
  }, []);

  // Condition to show change reason:
  // 1. If it's a non-generic drug (original drug), it is actually NORMAL to change to original drug, so no reason needed.
  // wait, the user said: "一般名処方から先発を選ぶのは普通なので理由いりません"
  // So if it's general prescription -> original drug, it is NOT out of rule.
  // Out of rule means: e.g. different ingredient or different dosage form group.
  const isOutOfRule = useMemo(() => {
    if (mode !== 'dispensed' || !selectedDrug) return false;

    // If there is a prescribed drug code (e.g., from general drug)
    if (prescribedDrugCode && prescribedDrugCode.length >= 8 && selectedDrug.yjCode) {
       const pPrefix = prescribedDrugCode.substring(0, 7);
       const sPrefix = selectedDrug.yjCode.substring(0, 7);

       if (pPrefix !== sPrefix) return true; // Different ingredient

       if (getFormulationType(prescribedDrugCode) !== getFormulationType(selectedDrug.yjCode)) {
         return true; // Different dosage form group
       }
       return false; // Same ingredient, same dosage group, even if it's original drug, it's fine!
    }

    return false;
  }, [mode, selectedDrug, prescribedDrugCode]);

  const isConfirmDisabled = !selectedDrug ? true : !!(isOutOfRule && changeReason.trim() === '');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedDrug) return;
    onSelect({ ...selectedDrug, name: formatDrugDisplayName(selectedDrug.name) }, changeReason);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Search size={20} aria-hidden="true" /> {mode === 'prescribed' ? '処方薬品検索' : '調剤薬品検索'}</h2>
          <button className="btn-close" onClick={onClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
        </div>

        <div className="modal-body">
          <div className="search-box">
            <Search className="search-icon" size={18} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              placeholder="薬品名を入力..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
              aria-label="薬品名を入力"
            />
            {query && (
              <button
                className="btn-clear"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                aria-label="検索キーワードをクリア"
                title="検索キーワードをクリア"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>

          {mode === 'dispensed' && (
            <div className="filter-options">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showAllCandidates}
                onChange={(e) => {
                  setShowAllCandidates(e.target.checked);
                  setSelectedDrug(null);
                }}
              />
              <span>商品名・先発/後発を含めて探す</span>
            </label>
            </div>
          )}

          <div className="drug-list">
            {isLoading ? (
              <div className="empty-state">データを読み込み中...</div>
            ) : filteredDrugs.length > 0 ? (
              <>
                {/* ⚡ Bolt: Prevent massive React renders by capping the display list to 100 items. */}
                {filteredDrugs.slice(0, 100).map(drug => (
                  <DrugListItem
                    key={drug.code}
                    drug={drug}
                    isSelected={selectedDrug?.code === drug.code}
                    stockQuantity={getAvailableStock(drug)}
                    onSelect={handleSelect}
                  />
                ))}
                {filteredDrugs.length > 100 && (
                  <div className="limit-message text-muted text-sm" style={{ textAlign: 'center', marginTop: '1rem', paddingBottom: '1rem' }}>
                    ※検索結果が多すぎます。上位100件のみ表示しています。条件を絞り込んでください。
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                {query.trim() ? "該当するお薬が見つかりません" : "お薬の名前を入力してください"}
              </div>
            )}
          </div>

          {selectedDrug && (
            <div className="selection-area">
              <div className="selected-info">
                選択中: <strong>{formatDrugDisplayName(selectedDrug.name)}</strong>
              </div>

              {isOutOfRule && (
                <div className="reason-input-group">
                  <label htmlFor="changeReasonInput"><AlertCircle size={16} aria-hidden="true" /> 変更理由（ルール外の変更のため入力が必要です）</label>
                  <input
                    type="text"
                    placeholder="例: 患者の希望により先発品へ変更"
                    value={changeReason}
                    id="changeReasonInput"
                    onChange={(e) => setChangeReason(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>キャンセル</button>
          <span
            className="btn-tooltip-wrapper"
            data-disabled={isConfirmDisabled}
            title={isOutOfRule && changeReason.trim() === '' ? '変更理由を入力してください' : ''}
            tabIndex={isConfirmDisabled ? 0 : -1}
          >
            <button
              className="btn-primary"
              disabled={isConfirmDisabled}
              onClick={handleConfirm}
            >
              決定
            </button>
          </span>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.36);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          padding: 1rem;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          background: white;
          border-radius: 10px;
          width: min(760px, 96vw);
          max-height: 88vh;
          display: flex;
          flex-direction: column;
          border: 1px solid rgb(255 255 255 / 0.72);
          box-shadow: 0 28px 76px rgb(15 23 42 / 0.22);
          overflow: hidden;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.95rem 1.2rem;
          border-bottom: 1px solid var(--border);
          background: #ffffff;
        }
        .modal-header h2 {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 1rem;
          margin: 0;
        }
        .btn-close {
          width: 34px;
          min-height: 34px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
        }
        .btn-close:hover {
          color: var(--text-main);
          background: var(--bg-subtle);
        }
        .modal-body {
          padding: 1rem;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          overflow: hidden;
          background: #f8fafc;
        }
        .search-box {
          position: relative;
        }
        .search-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-ghost);
        }
        .search-input {
          width: 100%;
          min-height: 42px;
          padding: 0.75rem 2.5rem 0.75rem 2.5rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #ffffff;
          color: var(--text-main);
          font-size: 0.95rem;
          font-weight: 700;
          outline: none;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }
        .search-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgb(37 99 235 / 0.12);
        }
        .filter-options {
          display: flex;
          align-items: center;
          font-size: 0.84rem;
        }
        .checkbox-label {
          min-height: 30px;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.2rem 0.55rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #ffffff;
          color: var(--text-muted);
          font-weight: 700;
          cursor: pointer;
        }
        .drug-list {
          flex: 1;
          overflow-y: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          min-height: 340px;
        }
        .empty-state {
          padding: 2rem;
          text-align: center;
          color: var(--text-ghost);
        }
        .selection-area {
          background: #ffffff;
          padding: 0.75rem 0.9rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .selected-info {
          font-size: 0.9rem;
          color: var(--text-main);
          line-height: 1.45;
        }
        .reason-input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .reason-input-group label {
          font-size: 0.85rem;
          color: #f59e0b;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .reason-input-group input {
          width: 100%;
          min-height: 38px;
          padding: 0.5rem 0.6rem;
          border: 1px solid var(--border);
          border-radius: 6px;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 0.65rem;
          padding: 0.9rem 1.2rem;
          border-top: 1px solid var(--border);
          background: #ffffff;
        }
      `}</style>
    </div>
  );
}
