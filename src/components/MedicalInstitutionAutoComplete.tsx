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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            医療機関コード (10桁)
          </label>
          <input
            type="text"
            className="input-field"
            value={code}
            onChange={handleCodeChange}
            placeholder={placeholderCode}
            style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.88rem', marginTop: '0.2rem' }}
          />
        </div>

        <div style={{ position: 'relative' }} role="combobox" aria-expanded={isOpen} aria-haspopup="listbox" aria-controls="med-inst-suggestions-list">
          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            医療機関名
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              className="input-field"
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
              style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.88rem', marginTop: '0.2rem' }}
            />
          </div>

          {isOpen && suggestions.length > 0 && (
            <div
              id="med-inst-suggestions-list"
              className="suggestions-dropdown"
              role="listbox"
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 50,
                background: '#ffffff',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                maxHeight: '220px',
                overflowY: 'auto',
                marginTop: '4px'
              }}
            >
              {suggestions.map((inst, idx) => (
                <button
                  key={inst.code}
                  type="button"
                  role="option"
                  aria-selected={idx === selectedIndex}
                  onClick={() => handleSelectSuggestion(inst)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.6rem 0.8rem',
                    border: 'none',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: idx === selectedIndex ? 'var(--bg-subtle, #f1f5f9)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem'
                  }}
                  className="suggestion-item"
                >
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                    {inst.name}
                    {isUsingSeedMedicalInstitutionData() && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-soft)', padding: '1px 6px', borderRadius: '4px' }}>
                        サンプル
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                    コード: <strong>{inst.code}</strong> (点数表: {inst.scoreCode}) {inst.address ? ` / ${inst.address}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
