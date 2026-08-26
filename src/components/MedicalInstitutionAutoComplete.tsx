'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Building2, Search, Check } from 'lucide-react';
import {
  findMedicalInstitutionByCode,
  isUsingSeedMedicalInstitutionData,
  searchMedicalInstitutions,
  type MedicalInstitutionRecord
} from '@/lib/master-data/medical_institution_master';

export interface MedicalInstitutionAutoCompleteProps {
  valueCode?: string;
  valueName?: string;
  onChange: (institution: { code: string; name: string; address?: string }) => void;
  placeholderName?: string;
  placeholderCode?: string;
}

export const MedicalInstitutionAutoComplete: React.FC<MedicalInstitutionAutoCompleteProps> = ({
  valueCode = '',
  valueName = '',
  onChange,
  placeholderName = '例: 日本中央総合病院',
  placeholderCode = '10桁または7桁の医療機関コード'
}) => {
  const [code, setCode] = useState(valueCode);
  const [name, setName] = useState(valueName);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<MedicalInstitutionRecord[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < suggestions.length) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  useEffect(() => {
    setCode(valueCode);
  }, [valueCode]);

  useEffect(() => {
    setName(valueName);
  }, [valueName]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCode(val);

    const found = findMedicalInstitutionByCode(val);
    if (found) {
      setName(found.name);
      onChange({ code: found.code, name: found.name, address: found.address });
      setIsOpen(false);
    } else {
      onChange({ code: val, name });
    }
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);

    if (val.trim()) {
      const results = searchMedicalInstitutions(val);
      setSuggestions(results);
      setIsOpen(results.length > 0);
    } else {
      setSuggestions([]);
      setIsOpen(false);
    }

    onChange({ code, name: val });
  };

  const handleSelectSuggestion = (inst: MedicalInstitutionRecord) => {
    setCode(inst.code);
    setName(inst.name);
    onChange({ code: inst.code, name: inst.name, address: inst.address });
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  return (
    <div className="medical-inst-autocomplete" ref={containerRef}>
      <div className="auto-grid">
        <div>
          <label className="auto-label">
            医療機関コード (10桁)
          </label>
          <input
            type="text"
            className="input-field auto-input"
            value={code}
            onChange={handleCodeChange}
            placeholder={placeholderCode}
          />
        </div>

        <div className="auto-combobox" role="combobox" aria-expanded={isOpen} aria-haspopup="listbox" aria-controls="med-inst-suggestions-list">
          <label className="auto-label">
            医療機関名
          </label>
          <div className="auto-input-wrapper">
            <input
              type="text"
              className="input-field auto-input"
              value={name}
              onChange={handleNameChange}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (name.trim()) {
                  const results = searchMedicalInstitutions(name);
                  setSuggestions(results);
                  setIsOpen(results.length > 0);
                }
              }}
              placeholder={placeholderName}
            />
          </div>

          {isOpen && suggestions.length > 0 && (
            <div
              id="med-inst-suggestions-list"
              className="suggestions-dropdown"
              role="listbox"
            >
              {suggestions.map((inst, idx) => (
                <button
                  key={inst.code}
                  type="button"
                  role="option"
                  aria-selected={idx === selectedIndex}
                  onClick={() => handleSelectSuggestion(inst)}
                  className={`suggestion-item ${idx === selectedIndex ? 'selected' : ''}`}
                >
                  <div className="suggestion-title">
                    {inst.name}
                    {isUsingSeedMedicalInstitutionData() && (
                      <span className="suggestion-badge">
                        サンプル
                      </span>
                    )}
                  </div>
                  <div className="suggestion-meta">
                    コード: <strong>{inst.code}</strong> (点数表: {inst.scoreCode}) {inst.address ? ` / ${inst.address}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <style jsx>{`
        .auto-grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: var(--space-3);
        }
        .auto-label {
          font-size: var(--fs-sm);
          font-weight: 700;
          color: var(--text-muted);
        }
        .auto-input {
          width: 100%;
          padding: var(--space-1-5) var(--space-2-5);
          font-size: var(--fs-md);
          margin-top: var(--space-1);
        }
        .auto-combobox {
          position: relative;
        }
        .auto-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .suggestions-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          z-index: 50;
          background: #ffffff;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
          max-height: 220px;
          overflow-y: auto;
          margin-top: 4px;
        }
        .suggestion-item {
          width: 100%;
          text-align: left;
          padding: var(--space-2-5) var(--space-3);
          border: none;
          border-bottom: 1px solid var(--border-subtle);
          background: transparent;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: var(--space-1);
        }
        .suggestion-item.selected {
          background: var(--bg-subtle, #f1f5f9);
        }
        .suggestion-title {
          font-weight: 700;
          font-size: var(--fs-md);
          color: var(--text-main);
        }
        .suggestion-badge {
          margin-left: var(--space-1-5);
          font-size: var(--fs-2xs);
          font-weight: 700;
          color: var(--warning);
          background: var(--warning-soft);
          padding: 1px 6px;
          border-radius: 4px;
        }
        .suggestion-meta {
          font-size: var(--fs-xs);
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
};
