import React, { useState, useMemo, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { DOSAGE_CATEGORIES, DOSAGE_CATEGORY_LABELS, type DosageCategory } from '@/lib/dosage_category';
import { ELECTRONIC_USAGE_OPTIONS, filterUsageOptionsByCategory } from '@/lib/master-data/usage_master';
import type { ElectronicUsageOption } from '@/lib/master-data/types';
import {
  QUICK_DAYS,
  buildQuickUsageOptions,
  formatQuickUsageLabel,
  pushUsageRecent,
  readUsageRecents
} from '@/lib/usage_quick_picks';
import type { PrescriptionGroup, PrescriptionFieldValue } from '../types';
import { getGroupDosageCategory } from '../helpers';
import { PrescriptionRow } from './PrescriptionRow';
import { StepperField } from './StepperField';
import { UsageSearchModal } from './UsageSearchModal';

export interface PrescriptionGroupEditorProps {
  group: PrescriptionGroup;
  groupIndex: number;
  onChange: (id: string, field: string, value: PrescriptionFieldValue, index: number) => void;
  onOpenDrugSearch: (id: string, currentDrug: string, targetField: 'prescribed' | 'dispensed', prescribedCode?: string) => void;
  onToggleIppoka: (id: string, checked: boolean, index: number) => void;
  onToggleCrushed: (id: string, checked: boolean, index: number) => void;
  onToggleReceiptRemark: (id: string, checked: boolean, index: number) => void;
  onRpFieldChange: (rpId: string, field: 'usage' | 'usageSupplementText' | 'days' | 'rpComment', value: string) => void;
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
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false);
  const { category: dosageCategory, isManual: isManualDosageCategory } = getGroupDosageCategory(group);

  // 「最近使った用法」は端末ごと(localStorage)。マウント後に読むので、サーバー描画では定番だけが並ぶ。
  const [recentUsageLabels, setRecentUsageLabels] = useState<string[]>([]);
  useEffect(() => {
    setRecentUsageLabels(readUsageRecents(dosageCategory));
  }, [dosageCategory]);

  const quickUsageOptions = useMemo(() => buildQuickUsageOptions({
    category: dosageCategory,
    options: ELECTRONIC_USAGE_OPTIONS,
    recentLabels: recentUsageLabels
  }), [dosageCategory, recentUsageLabels]);

  const applyUsageOption = (option: ElectronicUsageOption) => {
    onRpFieldChange(group.rpId, 'usage', option.label);
    setRecentUsageLabels(pushUsageRecent(dosageCategory, option.label));
  };

  const hasUsageCategoryMismatch = useMemo(() => {
    if (!group.usage?.trim()) return false;
    const allowed = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, dosageCategory);
    return !allowed.some((opt) => opt.label === group.usage.trim());
  }, [dosageCategory, group.usage]);

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
          {hasUsageCategoryMismatch && (
            <span
              className="rp-category-mismatch-badge"
              title={`用法が調剤区分「${DOSAGE_CATEGORY_LABELS[dosageCategory]}」の候補にありません（このままでも保存できます）`}
            >
              ⚠️ 用法と調剤区分が不一致
            </span>
          )}
        </div>
        <div className="rp-actions rp-actions-header">
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

      {/* スマホでは「追加」を薬品リストの末尾(次に指が向かう場所)に置く。PCでは見出し側のボタンを使う */}
      <div className="rp-actions rp-actions-footer">
        <button
          type="button"
          className="btn-add-drug"
          onClick={() => onAddDrugToRp(group.rpId)}
          aria-label={`Rp ${groupIndex + 1} に薬品を追加`}
        >
          <Plus size={18} aria-hidden="true" />
          薬品を追加
        </button>
        <button
          type="button"
          className="btn-add-rp"
          onClick={() => onAddRpAfter(group.rpId)}
          aria-label={`Rp ${groupIndex + 1} の次にRpを追加`}
        >
          <Plus size={18} aria-hidden="true" />
          次のRp
        </button>
      </div>

      <div className="rp-prescription-footer">
        <div className="rp-footer-fields">
        <div className="rp-usage-field">
          <span>用法</span>
          <div className="usage-selector-wrap">
            <input
              type="text"
              className="usage usage-readonly"
              readOnly
              aria-label={`Rp ${groupIndex + 1} 用法`}
              placeholder="タップして用法を選ぶ"
              value={group.usage}
              onClick={() => setIsUsageModalOpen(true)}
            />
            <button
              type="button"
              className="btn-select-usage"
              onClick={() => setIsUsageModalOpen(true)}
              aria-label={`Rp ${groupIndex + 1} 用法を選ぶ`}
            >
              用法を選ぶ
            </button>
            {group.usage && (
              <button
                type="button"
                className="btn-clear-usage"
                onClick={() => onRpFieldChange(group.rpId, 'usage', '')}
                title="用法をクリア"
                aria-label={`Rp ${groupIndex + 1} 用法をクリア`}
              >
                クリア
              </button>
            )}
          </div>
        </div>
        <label className="rp-supplement-field">
          <span>用法補足（手入力）</span>
          <input
            type="text"
            className="usage-supplement"
            aria-label={`Rp ${groupIndex + 1} 用法補足`}
            placeholder="例: 入浴後、患部に、疼痛時"
            maxLength={500}
            value={group.usageSupplementText || ''}
            onChange={(e) => onRpFieldChange(group.rpId, 'usageSupplementText', e.target.value)}
          />
        </label>
        <div className="rp-days-field">
          <span>日数</span>
          <div className="days-input-wrap">
            <StepperField
              value={group.days}
              onChange={(next) => onRpFieldChange(group.rpId, 'days', next)}
              ariaLabel={`Rp ${groupIndex + 1} 日数`}
              inputClassName="days"
              inputMode="numeric"
              placeholder="14"
              maxLength={3}
              min={0}
              max={365}
              step={1}
            />
            <strong>日分</strong>
          </div>
        </div>
        </div>

        <div className="rp-quick-picks">
          {quickUsageOptions.length > 0 && (
            <div className="quick-pick-row" role="group" aria-label={`Rp ${groupIndex + 1} よく使う用法`}>
              <span className="quick-pick-label">よく使う用法</span>
              <div className="quick-pick-chips usage-chips">
                {quickUsageOptions.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={`quick-chip ${group.usage === option.label ? 'is-selected' : ''}`}
                    aria-pressed={group.usage === option.label}
                    title={option.label.replace(/\u3000/g, ' ')}
                    onClick={() => applyUsageOption(option)}
                  >
                    {formatQuickUsageLabel(option.label)}
                  </button>
                ))}
                <button
                  type="button"
                  className="quick-chip quick-chip-more"
                  onClick={() => setIsUsageModalOpen(true)}
                >
                  ほかを検索
                </button>
              </div>
            </div>
          )}
          <div className="quick-pick-row" role="group" aria-label={`Rp ${groupIndex + 1} 日数のよく使う値`}>
            <span className="quick-pick-label">よく使う日数</span>
            <div className="quick-pick-chips">
              {QUICK_DAYS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`quick-chip quick-chip-days ${group.days === String(days) ? 'is-selected' : ''}`}
                  aria-pressed={group.days === String(days)}
                  onClick={() => onRpFieldChange(group.rpId, 'days', String(days))}
                >
                  {days}日
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isUsageModalOpen && (
        <UsageSearchModal
          isOpen={isUsageModalOpen}
          onClose={() => setIsUsageModalOpen(false)}
          onSelect={(option) => {
            applyUsageOption(option);
            setIsUsageModalOpen(false);
          }}
          dosageCategory={dosageCategory}
          currentUsage={group.usage}
        />
      )}

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
          grid-template-columns: minmax(0, 1fr);
          gap: 0.65rem;
          margin-top: 0.65rem;
          padding: 0.65rem;
          border: 1px solid #dbe4ef;
          border-radius: 8px;
          background: #f8fafc;
        }

        .rp-footer-fields {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 116px;
          align-items: end;
          gap: 0.65rem;
        }

        /* 選んだ用法・「用法を選ぶ」・クリアが1行に収まるよう、用法は1段目を全幅で使う */
        .rp-usage-field {
          grid-column: 1 / -1;
        }

        .rp-supplement-field {
          grid-column: 1 / 3;
        }

        .rp-quick-picks {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 0.5rem;
          min-width: 0;
        }

        .quick-pick-row {
          display: grid;
          grid-template-columns: 5.5rem minmax(0, 1fr);
          align-items: start;
          gap: 0.5rem;
        }

        .quick-pick-label {
          padding-top: 0.45rem;
          color: var(--text-muted);
          font-size: var(--fs-xs);
          font-weight: 800;
        }

        .quick-pick-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          min-width: 0;
        }

        .quick-chip {
          min-height: 34px;
          padding: 0.25rem 0.7rem;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          background: #ffffff;
          color: var(--text-main);
          font-size: var(--fs-sm);
          font-weight: 700;
          line-height: 1.3;
          text-align: left;
          white-space: nowrap;
          cursor: pointer;
        }

        .quick-chip:hover {
          border-color: var(--primary);
          color: var(--primary-dark);
        }

        .quick-chip.is-selected {
          border-color: var(--primary);
          background: var(--primary);
          color: #ffffff;
        }

        .quick-chip-more {
          border-style: dashed;
          color: var(--text-muted);
        }

        .rp-actions-footer {
          display: none;
        }

        .rp-usage-field,
        .rp-supplement-field,
        .rp-days-field,
        .rp-comment-row {
          min-width: 0;
          display: grid;
          gap: 0.32rem;
        }

        .rp-usage-field span,
        .rp-supplement-field span,
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

        .rp-category-mismatch-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-size: var(--fs-xs);
          font-weight: 700;
          color: #b45309;
          background: #fef3c7;
          border: 1px solid #fde68a;
          border-radius: 4px;
          padding: 2px 8px;
          margin-left: 0.5rem;
        }

        .usage-selector-wrap {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          flex-wrap: wrap;
        }

        .usage-readonly {
          cursor: pointer;
          flex: 1 1 140px;
          min-width: 0;
        }

        .usage-readonly:hover {
          border-color: var(--primary);
        }

        .btn-select-usage {
          height: 38px;
          padding: 0 0.85rem;
          background: var(--primary-light);
          border: 1px solid var(--primary);
          color: var(--primary-dark);
          border-radius: 6px;
          font-size: var(--fs-sm);
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          transition: background var(--transition-fast), color var(--transition-fast);
        }

        .btn-select-usage:hover {
          background: var(--primary);
          color: #ffffff;
        }

        .btn-clear-usage {
          height: 38px;
          padding: 0 0.6rem;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: var(--text-muted);
          border-radius: 6px;
          font-size: var(--fs-xs);
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }

        .btn-clear-usage:hover {
          background: #f1f5f9;
          color: var(--text-main);
        }

        .rp-prescription-footer :global(input.days) {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          min-height: 38px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #ffffff;
          color: var(--text-main);
          font-size: var(--fs-md);
          padding: 0.45rem 0.6rem;
          text-align: right;
          font-weight: 800;
        }

        .rp-prescription-footer :global(input.days:focus) {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgb(37 99 235 / 0.12);
        }

        .rp-prescription-footer input:focus,
        .rp-comment-row textarea:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgb(37 99 235 / 0.12);
        }

        @media (max-width: 720px) {
          .rp-group {
            padding: 0.65rem;
            border-left-width: 4px;
          }

          .rp-group-header {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.5rem;
          }

          .rp-heading {
            flex-wrap: wrap;
          }

          .rp-category-mismatch-badge {
            margin-left: 0;
          }

          .rp-actions {
            width: 100%;
            justify-content: flex-end;
          }

          /* 追加ボタンは薬品リストの末尾に置くので、見出し側は隠す */
          .rp-actions-header {
            display: none;
          }

          .rp-actions-footer {
            display: grid;
            grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
            gap: 0.5rem;
            margin-top: 0.1rem;
          }

          .btn-add-drug,
          .btn-add-rp {
            min-height: 44px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.3rem;
            border-radius: 6px;
            font-size: var(--fs-sm);
            font-weight: 800;
            white-space: nowrap;
            cursor: pointer;
          }

          .btn-add-drug {
            border: 1px solid var(--primary);
            background: var(--primary-light);
            color: var(--primary-dark);
          }

          .btn-add-rp {
            border: 1px dashed #94a3b8;
            background: #ffffff;
            color: var(--text-muted);
          }

          .prescription-row-header {
            display: none;
          }

          .rp-footer-fields {
            grid-template-columns: minmax(0, 1fr);
          }

          .rp-supplement-field {
            grid-column: auto;
          }

          .rp-prescription-footer {
            padding: 0.55rem;
          }

          /* 1fr だと列の最小幅が中身(横に長く並べたチップ)になり、画面より広がってしまう */
          .quick-pick-row {
            grid-template-columns: minmax(0, 1fr);
            gap: 0.3rem;
          }

          .quick-pick-label {
            padding-top: 0;
          }

          .quick-chip {
            min-height: 40px;
            padding: 0.3rem 0.8rem;
          }

          /* 用法は候補が多いので、縦に並べず横にスクロールさせて画面の高さを使わない */
          .usage-chips {
            flex-wrap: nowrap;
            overflow-x: auto;
            margin-inline: -0.55rem;
            padding: 0.1rem 0.55rem 0.4rem;
            scroll-snap-type: x proximity;
            -webkit-overflow-scrolling: touch;
          }

          .usage-chips .quick-chip {
            flex: 0 0 auto;
            scroll-snap-align: start;
          }

          /* 用法欄そのものが押せて、チップ列の「ほかを検索」でも開けるので、広い「用法を選ぶ」ボタンは出さない */
          .btn-select-usage {
            display: none;
          }

          /* 選んだ用法は長い(「１日３回朝昼夕食後　服用」)ので、欄を全幅にして読み切れるようにし、
             クリアは下に小さく置く */
          .usage-selector-wrap {
            grid-template-columns: minmax(0, 1fr);
          }

          .btn-clear-usage {
            width: auto;
            min-height: 36px;
            justify-self: end;
          }

          .rp-prescription-footer :global(input.days) {
            min-height: 44px;
            text-align: center;
          }

          .rp-prescription-footer input {
            min-height: 44px;
          }

          .usage-selector-wrap {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 0.35rem;
          }

          .btn-select-usage {
            padding: 0 0.65rem;
          }
        }

        @media (max-width: 480px) {
          /* 「用法を選ぶ」ボタンは出さず、欄のタップ・チップ列から開く */
          .usage-selector-wrap {
            grid-template-columns: minmax(0, 1fr);
          }

          .btn-select-usage {
            display: none;
          }

          .btn-clear-usage {
            width: auto;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
});

PrescriptionGroupEditor.displayName = 'PrescriptionGroupEditor';
