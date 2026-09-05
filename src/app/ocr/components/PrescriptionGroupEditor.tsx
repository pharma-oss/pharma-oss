import React from 'react';
import { Plus } from 'lucide-react';
import { DOSAGE_CATEGORIES, DOSAGE_CATEGORY_LABELS, type DosageCategory } from '@/lib/dosage_category';
import { ELECTRONIC_USAGE_OPTIONS, formatElectronicUsage } from '@/lib/master-data/usage_master';
import type { PrescriptionGroup, PrescriptionFieldValue } from '../types';
import { getGroupDosageCategory } from '../helpers';
import { PrescriptionRow } from './PrescriptionRow';

export interface PrescriptionGroupEditorProps {
  group: PrescriptionGroup;
  groupIndex: number;
  onChange: (id: string, field: string, value: PrescriptionFieldValue, index: number) => void;
  onOpenDrugSearch: (id: string, currentDrug: string, targetField: 'prescribed' | 'dispensed', prescribedCode?: string) => void;
  onToggleIppoka: (id: string, checked: boolean, index: number) => void;
  onToggleCrushed: (id: string, checked: boolean, index: number) => void;
  onToggleReceiptRemark: (id: string, checked: boolean, index: number) => void;
  onRpFieldChange: (rpId: string, field: 'usage' | 'days' | 'rpComment', value: string) => void;
  onRpDosageCategoryChange: (rpId: string, category: DosageCategory | null) => void;
  onAddDrugToRp: (rpId: string) => void;
  onAddRpAfter: (rpId: string) => void;
  onDelete: (id: string) => void;
}

export const PrescriptionGroupEditor = React.memo(({
  group,
  groupIndex,
  onChange,
  onOpenDrugSearch,
  onToggleIppoka,
  onToggleCrushed,
  onToggleReceiptRemark,
  onRpFieldChange,
  onRpDosageCategoryChange,
  onAddDrugToRp,
  onAddRpAfter,
  onDelete
}: PrescriptionGroupEditorProps) => {
  const usageOptionsId = `usage-options-${group.rpId}`;
  const { category: dosageCategory, isManual: isManualDosageCategory } = getGroupDosageCategory(group);

  return (
    <div className="rp-group">
      <div className="rp-group-header">
        <div className="rp-heading">
          <span className="rp-title">Rp {groupIndex + 1}</span>
          <span className="rp-count">{group.prescriptions.length}薬品</span>
          <span className={`rp-category dosage-${dosageCategory}`}>
            <select
              aria-label={`Rp ${groupIndex + 1} 調剤区分`}
              value={dosageCategory}
              onChange={(e) => onRpDosageCategoryChange(group.rpId, e.target.value as DosageCategory)}
            >
              {DOSAGE_CATEGORIES.map((category) => (
                <option key={category} value={category}>{DOSAGE_CATEGORY_LABELS[category]}</option>
              ))}
            </select>
            {isManualDosageCategory ? (
              <button
                type="button"
                className="rp-category-reset"
                onClick={() => onRpDosageCategoryChange(group.rpId, null)}
                title="薬品名からの自動判定に戻す"
              >
                自動に戻す
              </button>
            ) : (
              <em className="rp-category-source" title="薬品名・用法から自動判定しています">自動</em>
            )}
          </span>
        </div>
        <div className="rp-actions">
          <button
            type="button"
            className="btn-mini"
            onClick={() => onAddDrugToRp(group.rpId)}
            title="同じRpに薬品を追加"
          >
            <Plus size={14} />
            同Rpに追加
          </button>
          <button
            type="button"
            className="btn-mini"
            onClick={() => onAddRpAfter(group.rpId)}
            title="次のRpを追加"
          >
            <Plus size={14} />
            Rp追加
          </button>
        </div>
      </div>

      <div className="prescription-row-header" aria-hidden="true">
        <span></span>
        <span>薬品名</span>
        <span className="header-amount">1日量</span>
        <span className="header-unit">単位</span>
      </div>

      {group.prescriptions.map((prescription, itemIndex) => (
        <PrescriptionRow
          key={prescription.id}
          prescription={prescription}
          index={group.startIndex + itemIndex}
          onChange={onChange}
          onOpenDrugSearch={onOpenDrugSearch}
          onToggleIppoka={onToggleIppoka}
          onToggleCrushed={onToggleCrushed}
          onToggleReceiptRemark={onToggleReceiptRemark}
          onDelete={onDelete}
        />
      ))}

      <div className="rp-prescription-footer">
        <label className="rp-usage-field">
          <span>用法</span>
          <input
            type="text"
            className="usage"
            aria-label={`Rp ${groupIndex + 1} 用法`}
            placeholder="例: 1日1回朝食後"
            list={usageOptionsId}
            maxLength={200}
            value={group.usage}
            onChange={(e) => onRpFieldChange(group.rpId, 'usage', e.target.value)}
          />
        </label>
        <datalist id={usageOptionsId}>
          {ELECTRONIC_USAGE_OPTIONS.map((usage) => (
            <option key={usage.code} value={formatElectronicUsage(usage)} label={usage.code} />
          ))}
        </datalist>
        <label className="rp-days-field">
          <span>日数</span>
          <div className="days-input-wrap">
            <input
              type="text"
              className="days"
              aria-label={`Rp ${groupIndex + 1} 日数`}
              placeholder="14"
              maxLength={3}
              value={group.days}
              onChange={(e) => onRpFieldChange(group.rpId, 'days', e.target.value)}
            />
            <strong>日分</strong>
          </div>
        </label>
      </div>

      <label className="rp-comment-row">
        <span>Rpコメント</span>
        <textarea
          aria-label={`Rp ${groupIndex + 1} コメント`}
          placeholder="疑義照会、医師指示、服薬上の注意など"
          maxLength={500}
          rows={2}
          value={group.rpComment}
          onChange={(e) => onRpFieldChange(group.rpId, 'rpComment', e.target.value)}
        />
      </label>
      <style jsx>{`
        .rp-group {
          border: 1px solid #cbd5e1;
          border-left: 5px solid var(--primary);
          border-radius: 8px;
          background: #ffffff;
          padding: 0.85rem;
          box-shadow: 0 8px 20px rgb(15 23 42 / 0.05);
        }

        .rp-group + .rp-group {
          margin-top: 0.85rem;
        }

        .rp-group-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
          padding-bottom: 0.55rem;
          border-bottom: 1px solid #dbe4ef;
        }

        .rp-heading {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          min-width: 0;
        }

        .rp-title {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 58px;
          min-height: 30px;
          border-radius: 6px;
          background: #eff6ff;
          color: var(--primary-dark);
          font-size: var(--fs-md);
          font-weight: 800;
          border: 1px solid #bfdbfe;
        }

        .rp-count {
          color: var(--text-muted);
          font-size: var(--fs-sm);
          font-weight: 800;
          white-space: nowrap;
        }

        .rp-category {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          min-height: 30px;
          padding: 0 0.3rem 0 0.45rem;
          border-radius: 6px;
          border: 1px solid;
          white-space: nowrap;
        }

        .rp-category select {
          border: none;
          background: transparent;
          color: inherit;
          font-size: var(--fs-sm);
          font-weight: 800;
          cursor: pointer;
          outline: none;
          min-height: 28px;
        }

        .rp-category-source {
          font-style: normal;
          font-size: var(--fs-2xs);
          font-weight: 800;
          opacity: 0.75;
        }

        .rp-category-reset {
          min-height: 22px;
          border: none;
          border-radius: 4px;
          background: rgb(255 255 255 / 0.65);
          color: inherit;
          font-size: var(--fs-2xs);
          font-weight: 800;
          padding: 0 0.35rem;
          cursor: pointer;
        }

        .rp-category-reset:hover {
          background: #ffffff;
        }

        .rp-category.dosage-internal {
          background: #eff6ff;
          border-color: #bfdbfe;
          color: #1d4ed8;
        }

        .rp-category.dosage-as_needed {
          background: #f5f3ff;
          border-color: #ddd6fe;
          color: #6d28d9;
        }

        .rp-category.dosage-external {
          background: #fff7ed;
          border-color: #fed7aa;
          color: #c2410c;
        }

        .rp-category.dosage-internal_drop {
          background: #f0fdfa;
          border-color: #99f6e4;
          color: #0f766e;
        }

        .rp-category.dosage-injection {
          background: #fef2f2;
          border-color: #fecaca;
          color: #b91c1c;
        }

        .rp-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 0.4rem;
        }

        .btn-mini {
          min-height: 30px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #ffffff;
          color: var(--text-main);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.25rem;
          padding: 0 0.6rem;
          cursor: pointer;
          white-space: nowrap;
          font-size: var(--fs-sm);
          font-weight: 800;
          transition: border-color var(--transition-fast), color var(--transition-fast), background var(--transition-fast);
        }

        .btn-mini:hover {
          border-color: var(--primary);
          color: var(--primary);
          background: var(--primary-light);
        }

        .prescription-row-header {
          display: grid;
          grid-template-columns: 26px minmax(0, 1fr) 72px 64px;
          gap: 0.65rem;
          margin-bottom: 0.45rem;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 800;
          padding: 0 calc(0.55rem + 1px);
        }

        .prescription-row-header .header-amount {
          text-align: right;
        }

        .prescription-row-header .header-unit {
          text-align: left;
        }

        .rp-prescription-footer {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 116px;
          align-items: end;
          gap: 0.65rem;
          margin-top: 0.65rem;
          padding: 0.65rem;
          border: 1px solid #dbe4ef;
          border-radius: 8px;
          background: #f8fafc;
        }

        .rp-usage-field,
        .rp-days-field,
        .rp-comment-row {
          min-width: 0;
          display: grid;
          gap: 0.32rem;
        }

        .rp-usage-field span,
        .rp-days-field span,
        .rp-comment-row span {
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 800;
        }

        .days-input-wrap {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.35rem;
          color: var(--text-main);
          font-size: var(--fs-md);
        }

        .rp-prescription-footer input,
        .rp-comment-row textarea {
          min-height: 38px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #ffffff;
          color: var(--text-main);
          font-size: var(--fs-md);
          font-weight: 600;
          padding: 0.45rem 0.6rem;
          min-width: 0;
        }

        .rp-comment-row {
          margin-top: 0.65rem;
        }

        .rp-comment-row textarea {
          width: 100%;
          resize: vertical;
          line-height: 1.45;
        }

        .rp-prescription-footer input.days {
          text-align: right;
          font-weight: 800;
        }

        .rp-prescription-footer input:focus,
        .rp-comment-row textarea:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgb(37 99 235 / 0.12);
        }

        @media (max-width: 720px) {
          .rp-group-header {
            align-items: flex-start;
            flex-direction: column;
          }

          .rp-actions {
            justify-content: flex-start;
          }

          .prescription-row-header {
            display: none;
          }

          .rp-prescription-footer {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
});

PrescriptionGroupEditor.displayName = 'PrescriptionGroupEditor';
