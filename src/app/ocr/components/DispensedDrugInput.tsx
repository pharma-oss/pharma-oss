import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDatabase } from '@/db/DatabaseProvider';
import { findSubstitutionCandidates, type DrugMasterRecord } from '@/lib/master-data/drug_master';
import { formatDrugDisplayName } from '@/lib/master-data/drug_display';
import type { Prescription, PrescriptionFieldValue } from '../types';
import {
  getDispensedDrugAuditMeta,
  stockClassName,
  stockTitle,
  isNoSubstitutionValue,
  NO_SUBSTITUTION_LABEL
} from '../helpers';

export interface DispensedDrugInputProps {
  prescription: Prescription;
  index: number;
  onChange: (id: string, field: string, value: PrescriptionFieldValue, index: number) => void;
  onOpenDrugSearch: (id: string, currentDrug: string, targetField: 'prescribed' | 'dispensed', prescribedCode?: string) => void;
}

export const DispensedDrugInput = React.memo(({
  prescription,
  index,
  onChange,
  onOpenDrugSearch,
}: DispensedDrugInputProps) => {
  const db = useDatabase();
  const [candidates, setCandidates] = useState<DrugMasterRecord[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getSearchQuery = useCallback(() => {
    if (prescription.dispensedDrug && !isNoSubstitutionValue(prescription.dispensedDrug)) {
      return prescription.dispensedDrug;
    }
    return prescription.drugName;
  }, [prescription.dispensedDrug, prescription.drugName]);

  useEffect(() => {
    let isMounted = true;
    const fetchCandidates = async () => {
      if (!db || !prescription.drugName.startsWith('【般】') || !prescription.drugCode) {
        setCandidates([]);
        return;
      }

      try {
        const filtered = await findSubstitutionCandidates(prescription.drugCode);
        const drugCodes = filtered.map(d => d.code);
        let stocksMap = new Map<string, number>();

        if (drugCodes.length > 0) {
           const stocks = await db.drug_stocks.find({
             selector: { drugCode: { $in: drugCodes } }
           }).exec();

           for (const stock of stocks) {
             const current = stocksMap.get(stock.drugCode) || 0;
             stocksMap.set(stock.drugCode, current + stock.quantity);
           }
        }

        const mapped = filtered.map(d => ({
          ...d,
          stockQuantity: stocksMap.get(d.code) ?? d.stockQuantity ?? 0
        }));

        mapped.sort((a, b) => {
          const stockDiff = (b.stockQuantity || 0) - (a.stockQuantity || 0);
          if (stockDiff !== 0) return stockDiff;
          return a.name.localeCompare(b.name, 'ja');
        });

        if (isMounted) {
          setCandidates(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch candidates", err);
      }
    };

    fetchCandidates();
    return () => { isMounted = false; };
  }, [db, prescription.drugName, prescription.drugCode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown && candidates.length > 0 && e.key === 'ArrowDown') {
      setShowDropdown(true);
      setFocusedIndex(0);
      e.preventDefault();
      return;
    }

    if (showDropdown) {
      if (e.key === 'ArrowDown') {
        setFocusedIndex(prev => Math.min(prev + 1, candidates.length + 1));
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        setFocusedIndex(prev => Math.max(prev - 1, 0));
        e.preventDefault();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (focusedIndex === 0) {
          onChange(prescription.id, 'dispensedDrug', NO_SUBSTITUTION_LABEL, index);
          onChange(prescription.id, 'dispensedDrugCode', '', index);
          onChange(prescription.id, 'dispensedYjCode', '', index);
          onChange(prescription.id, 'dispensedGenericName', '', index);
          onChange(prescription.id, 'dispensedIsHighRisk', false, index);
          onChange(prescription.id, 'dispensedIsAbolished', false, index);
          onChange(prescription.id, 'dispensedStockQuantity', undefined, index);
          onChange(prescription.id, 'changeReason', '', index);
          setShowDropdown(false);
        } else if (focusedIndex > 0 && focusedIndex <= candidates.length) {
          const candidate = candidates[focusedIndex - 1];
          const auditMeta = getDispensedDrugAuditMeta(candidate);
          onChange(prescription.id, 'dispensedDrug', formatDrugDisplayName(candidate.name), index);
          onChange(prescription.id, 'dispensedDrugCode', candidate.code, index);
          onChange(prescription.id, 'dispensedYjCode', auditMeta.dispensedYjCode, index);
          onChange(prescription.id, 'dispensedGenericName', auditMeta.dispensedGenericName, index);
          onChange(prescription.id, 'dispensedIsHighRisk', auditMeta.dispensedIsHighRisk, index);
          onChange(prescription.id, 'dispensedIsAbolished', auditMeta.dispensedIsAbolished, index);
          onChange(prescription.id, 'dispensedStockQuantity', auditMeta.dispensedStockQuantity, index);
          onChange(prescription.id, 'changeReason', '', index);
          setShowDropdown(false);
        } else {
          setShowDropdown(false);
          onOpenDrugSearch(prescription.id, getSearchQuery(), 'dispensed', prescription.drugCode);
        }
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
        e.preventDefault();
      }
    } else {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setShowDropdown(true);
        setFocusedIndex(-1);
      }
    }
  };

  return (
    <div className="dispensed-drug-container" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        readOnly
        className="dispensed-drug-name"
        aria-label={`調剤薬品名 ${index + 1}`}
        placeholder="クリックまたはEnterで薬品検索..."
        value={prescription.dispensedDrug}
        onClick={() => {
          setShowDropdown(true);
          setFocusedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && (
        <ul className="drug-dropdown">
          <li
            className={`no-substitution-option ${focusedIndex === 0 ? 'focused' : ''}`}
            onMouseEnter={() => setFocusedIndex(0)}
            onClick={() => {
              onChange(prescription.id, 'dispensedDrug', NO_SUBSTITUTION_LABEL, index);
              onChange(prescription.id, 'dispensedDrugCode', '', index);
              onChange(prescription.id, 'dispensedYjCode', '', index);
              onChange(prescription.id, 'dispensedGenericName', '', index);
              onChange(prescription.id, 'dispensedIsHighRisk', false, index);
              onChange(prescription.id, 'dispensedIsAbolished', false, index);
              onChange(prescription.id, 'dispensedStockQuantity', undefined, index);
              onChange(prescription.id, 'changeReason', '', index);
              setShowDropdown(false);
            }}
          >
            {NO_SUBSTITUTION_LABEL}
          </li>
          {candidates.map((candidate, i) => (
            <li
              key={candidate.code}
              className={`dispensed-candidate ${i + 1 === focusedIndex ? 'focused' : ''} ${(candidate.stockQuantity || 0) === 0 ? 'out-of-stock' : ''}`}
              onMouseEnter={() => setFocusedIndex(i + 1)}
              onClick={() => {
                const auditMeta = getDispensedDrugAuditMeta(candidate);
                onChange(prescription.id, 'dispensedDrug', formatDrugDisplayName(candidate.name), index);
                onChange(prescription.id, 'dispensedDrugCode', candidate.code, index);
                onChange(prescription.id, 'dispensedYjCode', auditMeta.dispensedYjCode, index);
                onChange(prescription.id, 'dispensedGenericName', auditMeta.dispensedGenericName, index);
                onChange(prescription.id, 'dispensedIsHighRisk', auditMeta.dispensedIsHighRisk, index);
                onChange(prescription.id, 'dispensedIsAbolished', auditMeta.dispensedIsAbolished, index);
                onChange(prescription.id, 'dispensedStockQuantity', auditMeta.dispensedStockQuantity, index);
                onChange(prescription.id, 'changeReason', '', index);
                setShowDropdown(false);
              }}
            >
              <span className="candidate-name">
                {formatDrugDisplayName(candidate.name)}
              </span>
              <span className="candidate-meta">
                {candidate.yjCode || candidate.code}
                <span
                  className={`stock-mini-dot ${stockClassName(candidate.stockQuantity)}`}
                  title={stockTitle(candidate.stockQuantity)}
                  aria-label={stockTitle(candidate.stockQuantity)}
                />
                {stockTitle(candidate.stockQuantity)}
              </span>
            </li>
          ))}
          <li
            className={`search-more ${focusedIndex === candidates.length + 1 ? 'focused' : ''}`}
            onMouseEnter={() => setFocusedIndex(candidates.length + 1)}
            onClick={() => {
              setShowDropdown(false);
              onOpenDrugSearch(prescription.id, getSearchQuery(), 'dispensed', prescription.drugCode);
            }}
          >
            薬品検索を開く
          </li>
        </ul>
      )}
      <style jsx>{`
        .dispensed-drug-container {
          position: relative;
          flex: 1;
          min-width: 0;
        }

        .dispensed-drug-name {
          width: 100%;
          min-height: 36px;
          cursor: pointer;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #f8fafc;
          color: var(--text-main);
          font-size: var(--fs-md);
          font-weight: 600;
          padding: 0.4rem 0.65rem;
          min-width: 0;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
        }

        .dispensed-drug-name:focus {
          outline: none;
          border-color: var(--accent);
          background: #ffffff;
          box-shadow: 0 0 0 3px rgb(15 118 110 / 0.12);
        }

        .drug-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 35;
          max-height: 220px;
          overflow-y: auto;
          margin: 0;
          padding: 0.25rem;
          list-style: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 16px 36px rgb(15 23 42 / 0.14);
        }

        .no-substitution-option,
        .dispensed-candidate,
        .search-more {
          border-radius: 6px;
          padding: 0.55rem 0.6rem;
          cursor: pointer;
        }

        .no-substitution-option {
          color: var(--text-main);
          font-weight: 800;
        }

        .dispensed-candidate {
          display: grid;
          gap: 0.2rem;
        }

        .dispensed-candidate.out-of-stock {
          color: #9ca3af;
        }

        .candidate-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 700;
          line-height: 1.35;
        }

        .candidate-meta {
          display: inline-flex;
          align-items: center;
          gap: 0.38rem;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 700;
          line-height: 1.25;
        }

        .stock-mini-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #d1d5db;
          box-shadow: 0 0 0 3px rgb(209 213 219 / 0.28);
        }

        .stock-mini-dot.in-stock {
          background: var(--success);
          box-shadow: 0 0 0 3px rgb(21 128 61 / 0.12);
        }

        .no-substitution-option:hover,
        .dispensed-candidate:hover,
        .search-more:hover,
        .focused {
          background: var(--primary-light);
        }

        .search-more {
          color: var(--primary);
          font-weight: 800;
          text-align: center;
        }
      `}</style>
    </div>
  );
});

DispensedDrugInput.displayName = 'DispensedDrugInput';
