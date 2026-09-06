import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { DOSAGE_CATEGORY_LABELS, type DosageCategory } from '@/lib/dosage_category';
import type { ElectronicUsageOption } from '@/lib/master-data/types';
import { ELECTRONIC_USAGE_OPTIONS, filterUsageOptionsByCategory } from '@/lib/master-data/usage_master';
import { normalizeSearchString } from '@/workers/drug_search.worker';

export interface FilterUsageOptionsParams {
  category?: DosageCategory;
  query?: string;
  options?: ElectronicUsageOption[];
}

export function calculateFilteredUsageOptions(params: FilterUsageOptionsParams): ElectronicUsageOption[] {
  const { category, query, options = ELECTRONIC_USAGE_OPTIONS } = params;
  const baseOptions = category ? filterUsageOptionsByCategory(options, category) : options;
  const trimmed = query?.trim() ?? '';
  if (!trimmed) {
    return baseOptions;
  }

  const terms = trimmed.split(/\s+/).map((t) => normalizeSearchString(t)).filter(Boolean);
  if (terms.length === 0) {
    return baseOptions;
  }

  return baseOptions.filter((opt) => {
    const normLabel = normalizeSearchString(opt.label);
    const normKana = opt.kana ? normalizeSearchString(opt.kana) : '';
    const normCode = opt.code ? normalizeSearchString(opt.code) : '';

    return terms.every((term) => (
      normLabel.includes(term) || normKana.includes(term) || normCode.includes(term)
    ));
  });
}

export interface UsageSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (option: ElectronicUsageOption) => void;
  dosageCategory: DosageCategory;
  initialQuery?: string;
  currentUsage?: string;
}

export const UsageSearchModal = React.memo(({
  isOpen,
  onClose,
  onSelect,
  dosageCategory,
  initialQuery = '',
  currentUsage = ''
}: UsageSearchModalProps) => {
  const [query, setQuery] = useState(initialQuery);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery(initialQuery);
      setFocusedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialQuery]);

  const filteredOptions = useMemo(() => (
    calculateFilteredUsageOptions({
      category: dosageCategory,
      query,
      options: ELECTRONIC_USAGE_OPTIONS
    })
  ), [dosageCategory, query]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  // キーボード操作 (Escape, ArrowUp, ArrowDown, Enter)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredOptions[focusedIndex]) {
        onSelect(filteredOptions[focusedIndex]);
      }
    }
  };

  if (!isOpen) return null;

  const categoryLabel = DOSAGE_CATEGORY_LABELS[dosageCategory] || dosageCategory;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-container" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <div className="modal-title-group">
            <h2 className="modal-title">用法選択</h2>
            <span className="category-tag">{categoryLabel}</span>
            <span className="count-badge">{filteredOptions.length} 件</span>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="閉じる">
            <X size={20} />
          </button>
        </div>

        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="用法名・カナ・レセコードで検索 (例: 朝食後、テキギ、013)"
            aria-label="用法検索"
          />
          {query && (
            <button
              type="button"
              className="clear-query-btn"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="検索条件をクリア"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="list-container">
          {filteredOptions.length === 0 ? (
            <div className="empty-message">該当する用法が見つかりません</div>
          ) : (
            <ul className="usage-list" ref={listRef} role="listbox">
              {filteredOptions.map((opt, index) => {
                const isSelected = currentUsage === opt.label;
                const isFocused = focusedIndex === index;
                return (
                  <li
                    key={`${opt.prescriptionCode || opt.code}_${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`usage-item ${isFocused ? 'focused' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelect(opt)}
                    onMouseEnter={() => setFocusedIndex(index)}
                  >
                    <div className="usage-main">
                      <span className="usage-label">{opt.label}</span>
                      {opt.kana && <span className="usage-kana">{opt.kana}</span>}
                    </div>
                    <div className="usage-meta">
                      {opt.code && <span className="code-badge">レセ: {opt.code}</span>}
                      {isSelected && <span className="selected-indicator">選択中</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="modal-footer">
          <span className="help-text">↑↓ で移動、Enter で決定、Esc で閉じる</span>
          <button type="button" className="btn-secondary" onClick={onClose}>キャンセル</button>
        </div>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-container {
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
          width: 100%;
          max-width: 640px;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }

        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .modal-title-group {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .modal-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .category-tag {
          font-size: 0.75rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
        }

        .count-badge {
          font-size: 0.75rem;
          font-weight: 600;
          color: #64748b;
        }

        .close-btn {
          background: none;
          border: none;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }

        .search-bar {
          display: flex;
          align-items: center;
          padding: 0.75rem 1.25rem;
          border-bottom: 1px solid #e2e8f0;
          gap: 0.5rem;
          position: relative;
        }

        :global(.search-icon) {
          color: #94a3b8;
          flex-shrink: 0;
        }

        .search-input {
          flex: 1;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .search-input:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
        }

        .clear-query-btn {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .clear-query-btn:hover {
          color: #0f172a;
        }

        .list-container {
          flex: 1;
          overflow-y: auto;
          min-height: 280px;
          max-height: 50vh;
        }

        .empty-message {
          padding: 3rem 1rem;
          text-align: center;
          color: #94a3b8;
          font-size: 0.95rem;
        }

        .usage-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }

        .usage-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.65rem 1.25rem;
          border-bottom: 1px solid #f1f5f9;
          cursor: pointer;
          transition: background 0.1s;
        }

        .usage-item:hover,
        .usage-item.focused {
          background: #f8fafc;
        }

        .usage-item.selected {
          background: #eff6ff;
          border-left: 4px solid #2563eb;
        }

        .usage-main {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          min-width: 0;
        }

        .usage-label {
          font-size: 0.95rem;
          font-weight: 600;
          color: #1e293b;
        }

        .usage-kana {
          font-size: 0.75rem;
          color: #64748b;
        }

        .usage-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .code-badge {
          font-size: 0.75rem;
          font-family: monospace;
          color: #475569;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .selected-indicator {
          font-size: 0.75rem;
          font-weight: 700;
          color: #2563eb;
          background: #dbeafe;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .modal-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.25rem;
          border-top: 1px solid #e2e8f0;
          background: #f8fafc;
        }

        .help-text {
          font-size: 0.75rem;
          color: #94a3b8;
        }

        .btn-secondary {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #334155;
          padding: 0.4rem 0.85rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
        }

        .btn-secondary:hover {
          background: #f1f5f9;
        }
      `}</style>
    </div>
  );
});

UsageSearchModal.displayName = 'UsageSearchModal';
