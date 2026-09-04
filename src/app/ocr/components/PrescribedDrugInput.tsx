import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useDatabase } from '@/db/DatabaseProvider';
import { searchDrugMaster, type DrugMasterRecord } from '@/lib/master-data/drug_master';
import { formatDrugDisplayName } from '@/lib/master-data/drug_display';
import type { Prescription, PrescriptionFieldValue } from '../types';
import {
  getDrugAuditMeta,
  attachStockQuantities,
  sortDrugSuggestions,
  stockClassName,
  stockTitle,
  isNoSubstitutionValue,
  NO_SUBSTITUTION_LABEL
} from '../helpers';

export interface PrescribedDrugInputProps {
  prescription: Prescription;
  index: number;
  onChange: (id: string, field: string, value: PrescriptionFieldValue, index: number) => void;
  onOpenDrugSearch: (id: string, currentDrug: string, targetField: 'prescribed' | 'dispensed', prescribedCode?: string) => void;
}

export interface PrescribedDrugSelectUpdate {
  field: string;
  value: PrescriptionFieldValue;
}

export function calculatePrescribedDrugSelectUpdates(
  drug: DrugMasterRecord,
  prescription: Pick<Prescription, 'dispensedDrug' | 'electronicUnitConversion'>
): PrescribedDrugSelectUpdate[] {
  const auditMeta = getDrugAuditMeta(drug);
  const updates: PrescribedDrugSelectUpdate[] = [
    { field: 'drugName', value: formatDrugDisplayName(drug.name) },
    { field: 'drugCode', value: drug.code },
    { field: 'yjCode', value: auditMeta.yjCode },
    { field: 'genericName', value: auditMeta.genericName },
    { field: 'isHighRisk', value: auditMeta.isHighRisk },
    { field: 'isAbolished', value: auditMeta.isAbolished },
    { field: 'stockQuantity', value: auditMeta.stockQuantity },
    { field: 'dispensedDrugCode', value: '' },
    { field: 'dispensedYjCode', value: '' },
    { field: 'dispensedGenericName', value: '' },
    { field: 'dispensedIsHighRisk', value: false },
    { field: 'dispensedIsAbolished', value: false },
    { field: 'dispensedStockQuantity', value: undefined }
  ];
  if (drug.unitText && !prescription.electronicUnitConversion?.prescribedUnitText) {
    updates.push({ field: 'unitText', value: drug.unitText });
  }
  if (drug.unitCode && !prescription.electronicUnitConversion?.prescribedUnitCode) {
    updates.push({ field: 'unitCode', value: drug.unitCode });
  }
  if (!prescription.dispensedDrug || isNoSubstitutionValue(prescription.dispensedDrug)) {
    updates.push(
      { field: 'dispensedDrug', value: NO_SUBSTITUTION_LABEL },
      { field: 'changeReason', value: '' }
    );
  }
  return updates;
}

export const PrescribedDrugInput = React.memo(({
  prescription,
  index,
  onChange,
  onOpenDrugSearch
}: PrescribedDrugInputProps) => {
  const db = useDatabase();
  const [suggestions, setSuggestions] = useState<DrugMasterRecord[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectDrug = useCallback((drug: DrugMasterRecord) => {
    const updates = calculatePrescribedDrugSelectUpdates(drug, prescription);
    for (const update of updates) {
      onChange(prescription.id, update.field, update.value, index);
    }
    setShowDropdown(false);
  }, [
    index,
    onChange,
    prescription.dispensedDrug,
    prescription.electronicUnitConversion?.prescribedUnitCode,
    prescription.electronicUnitConversion?.prescribedUnitText,
    prescription.id
  ]);

  useEffect(() => {
    let isMounted = true;
    const query = prescription.drugName.trim().toLowerCase();

    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    searchDrugMaster(query, 200).then((nextSuggestions) => attachStockQuantities(db, nextSuggestions)).then((nextSuggestions) => {
      if (!isMounted) return;
      setSuggestions(sortDrugSuggestions(nextSuggestions, prescription.drugName).slice(0, 8));
      setShowDropdown(nextSuggestions.length > 0);
      setFocusedIndex(-1);
    }).catch((error) => {
      console.error('Failed to search drug master:', error);
      if (isMounted) setSuggestions([]);
    });

    return () => { isMounted = false; };
  }, [db, prescription.drugName]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      setShowDropdown(true);
      setFocusedIndex((prev) => Math.min(prev + 1, suggestions.length));
      e.preventDefault();
      return;
    }

    if (e.key === 'ArrowUp' && showDropdown) {
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
      e.preventDefault();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && focusedIndex >= 0 && focusedIndex < suggestions.length) {
        selectDrug(suggestions[focusedIndex]);
      } else {
        onOpenDrugSearch(prescription.id, prescription.drugName, 'prescribed');
      }
      return;
    }

    if (e.key === 'Escape') {
      setShowDropdown(false);
      e.preventDefault();
    }
  };

  return (
    <div className="prescribed-drug-container" ref={containerRef}>
      <input
        type="text"
        className="drug-name"
        aria-label={`処方薬品名 ${index + 1}`}
        placeholder="3文字以上で薬品候補..."
        value={prescription.drugName}
        onChange={(e) => {
          onChange(prescription.id, 'drugName', e.target.value, index);
          onChange(prescription.id, 'drugCode', '', index);
          onChange(prescription.id, 'yjCode', '', index);
          onChange(prescription.id, 'genericName', '', index);
          onChange(prescription.id, 'isHighRisk', false, index);
          onChange(prescription.id, 'isAbolished', false, index);
          onChange(prescription.id, 'stockQuantity', undefined, index);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setShowDropdown(true);
        }}
        onKeyDown={handleKeyDown}
      />
      {showDropdown && suggestions.length > 0 && (
        <ul className="drug-dropdown prescribed-dropdown">
          {suggestions.map((drug, i) => (
            <li
              key={drug.code}
              className={i === focusedIndex ? 'focused' : ''}
              onMouseEnter={() => setFocusedIndex(i)}
              onClick={() => selectDrug(drug)}
            >
              <div className="drug-suggestion-main">
                <span className="drug-suggestion-name">{formatDrugDisplayName(drug.name)}</span>
                <span className="drug-suggestion-meta">
                  {drug.yjCode || drug.code}
                  <span
                    className={`stock-mini-dot ${stockClassName(drug.stockQuantity)}`}
                    title={stockTitle(drug.stockQuantity)}
                    aria-label={stockTitle(drug.stockQuantity)}
                  />
                  {stockTitle(drug.stockQuantity)}
                </span>
              </div>
            </li>
          ))}
          <li
            className={`search-more ${focusedIndex === suggestions.length ? 'focused' : ''}`}
            onMouseEnter={() => setFocusedIndex(suggestions.length)}
            onClick={() => {
              setShowDropdown(false);
              onOpenDrugSearch(prescription.id, prescription.drugName, 'prescribed');
            }}
          >
            詳細検索を開く
          </li>
        </ul>
      )}
      <style jsx>{`
        .prescribed-drug-container {
          position: relative;
          min-width: 0;
        }

        .drug-name {
          width: 100%;
          min-height: 38px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #ffffff;
          color: var(--text-main);
          font-size: var(--fs-base);
          font-weight: 600;
          padding: 0.45rem 0.65rem;
          min-width: 0;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
        }

        .drug-name::placeholder {
          color: #9aa6b5;
          font-weight: 500;
        }

        .drug-name:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgb(37 99 235 / 0.12);
          background: #ffffff;
        }

        .drug-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          right: 0;
          z-index: 40;
          max-height: 240px;
          overflow-y: auto;
          margin: 0;
          padding: 0.25rem;
          list-style: none;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 16px 36px rgb(15 23 42 / 0.14);
        }

        .drug-dropdown li {
          border-radius: 6px;
          padding: 0.55rem 0.6rem;
          cursor: pointer;
        }

        .drug-dropdown li:hover,
        .drug-dropdown li.focused {
          background: var(--primary-light);
        }

        .drug-suggestion-main {
          display: grid;
          gap: 0.2rem;
        }

        .drug-suggestion-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 700;
          line-height: 1.35;
        }

        .drug-suggestion-meta {
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

        .search-more {
          color: var(--primary);
          font-weight: 800;
          text-align: center;
        }
      `}</style>
    </div>
  );
});

PrescribedDrugInput.displayName = 'PrescribedDrugInput';
