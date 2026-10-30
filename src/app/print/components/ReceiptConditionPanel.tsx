import React from 'react';
import { Lock, Printer, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { formatYen } from '@/lib/billing';
import {
  AFTER_HOURS_CATEGORY_LABELS,
  MEDICATION_NOTEBOOK_LABELS,
  TOKKAN_OVERRIDE_LABELS,
  type AfterHoursCategory,
  type AfterHoursJudgement,
  type ClaimConditionOptions,
  type MedicationNotebookCondition,
  type TokkanOverride
} from '@/lib/claim_conditions';
import type { ConditionChoicePreview, ConditionChoicePreviews } from '@/lib/claim_condition_previews';

export interface ReceiptConditionPanelProps {
  conditions: {
    medicationNotebook: MedicationNotebookCondition;
    afterHoursCategory: AfterHoursCategory;
    tokkanOverride: TokkanOverride | undefined;
  };
  /** 各選択肢を選んだときの金額 (画面と同じ計算関数の結果) */
  previews: ConditionChoicePreviews;
  /** いまの設定での点数と窓口負担 */
  current: ConditionChoicePreview;
  autoJudgement: AfterHoursJudgement;
  /** 受付時刻の表示用の文字列 */
  receptionAtText?: string;
  busy?: boolean;
  /** 変更できない理由 (請求ロック・権限)。あれば全操作を無効にして理由を出す */
  lockedReason?: string;
  canPrintReceipt: boolean;
  onChange: (patch: ClaimConditionOptions) => void;
  onApplyAutoJudgement: () => void;
  onPrintReceiptOnly: () => void;
}

function describePreview(preview: ConditionChoicePreview): string {
  return preview.copayYen === null ? '点数未設定' : `¥${formatYen(preview.copayYen)}`;
}

// 選択肢の組。別コンポーネントに切り出すと styled-jsx の CSS が当たらないので、
// パネルの JSX の中で展開する。
interface ConditionGroup {
  legend: string;
  name: string;
  testIdPrefix: string;
  selected: string;
  options: { value: string; label: string; preview: ConditionChoicePreview }[];
  onSelect: (value: string) => void;
}

export const ReceiptConditionPanel = React.memo(function ReceiptConditionPanel({
  conditions,
  previews,
  current,
  autoJudgement,
  receptionAtText,
  busy = false,
  lockedReason,
  canPrintReceipt,
  onChange,
  onApplyAutoJudgement,
  onPrintReceiptOnly
}: ReceiptConditionPanelProps) {
  const disabled = busy || !!lockedReason;
  const autoDiffers = autoJudgement.status === 'judged'
    && autoJudgement.category !== conditions.afterHoursCategory;
  const printBlocked = current.unsetFeeNames.length > 0;

  const groups: ConditionGroup[] = [
    {
      legend: 'お薬手帳',
      name: 'claim-condition-notebook',
      testIdPrefix: 'condition-notebook',
      selected: conditions.medicationNotebook,
      options: (['carried', 'not_carried'] as const).map((value) => ({
        value,
        label: MEDICATION_NOTEBOOK_LABELS[value],
        preview: previews.medicationNotebook[value]
      })),
      onSelect: (value) => onChange({ medicationNotebook: value === 'not_carried' ? 'not_carried' : undefined })
    },
    {
      legend: '時間外・休日・深夜',
      name: 'claim-condition-after-hours',
      testIdPrefix: 'condition-after-hours',
      selected: conditions.afterHoursCategory,
      options: (['none', 'after_hours', 'holiday', 'late_night'] as const).map((value) => ({
        value,
        label: AFTER_HOURS_CATEGORY_LABELS[value],
        preview: previews.afterHoursCategory[value]
      })),
      onSelect: (value) => onChange({
        afterHoursCategory: value === 'after_hours' || value === 'holiday' || value === 'late_night' ? value : undefined
      })
    },
    {
      legend: '特定薬剤管理指導加算（特管）',
      name: 'claim-condition-tokkan',
      testIdPrefix: 'condition-tokkan',
      selected: conditions.tokkanOverride ?? 'item',
      options: [
        { value: 'item', label: '処方明細ごと', preview: previews.tokkanOverride.item },
        ...(['none', '1', '3_i'] as const).map((value) => ({
          value,
          label: TOKKAN_OVERRIDE_LABELS[value],
          preview: previews.tokkanOverride[value]
        }))
      ],
      onSelect: (value) => onChange({
        tokkanOverride: value === 'none' || value === '1' || value === '3_i' ? value : undefined
      })
    }
  ];

  return (
    <div className="receipt-condition-panel no-print" data-testid="receipt-condition-panel">
      <div className="condition-header">
        <h4><SlidersHorizontal size={16} aria-hidden="true" /> 領収証の金額を変える条件</h4>
        <div className="condition-current" data-testid="receipt-condition-current">
          <span>いまの窓口負担</span>
          <strong>{describePreview(current)}</strong>
          <small>{current.unsetFeeNames.length > 0 ? '合計は未確定' : `${current.totalPoints.toLocaleString()} 点`}</small>
        </div>
      </div>

      {lockedReason ? (
        <p className="condition-locked" role="status" data-testid="receipt-condition-locked">
          <Lock size={14} aria-hidden="true" /> {lockedReason}
        </p>
      ) : (
        <p className="condition-help">
          選ぶとその来局の請求内容に保存され、領収証・明細書・請求の点数が同じ金額に変わります（変更は監査ログに残ります）。
          各選択肢の右の金額は、それを選んだときの窓口負担です。
        </p>
      )}

      <div className="condition-groups">
        {groups.map((group) => (
          <fieldset className="condition-group" disabled={disabled} key={group.name}>
            <legend>{group.legend}</legend>
            <div className="condition-choices">
              {group.options.map((option) => (
                <label
                  key={option.value}
                  className={`condition-choice${option.value === group.selected ? ' selected' : ''}${option.preview.copayYen === null ? ' unset' : ''}`}
                >
                  <input
                    type="radio"
                    name={group.name}
                    value={option.value}
                    checked={option.value === group.selected}
                    onChange={() => group.onSelect(option.value)}
                    data-testid={`${group.testIdPrefix}-${option.value}`}
                  />
                  <span className="condition-choice-label">{option.label}</span>
                  <span className="condition-choice-amount">{describePreview(option.preview)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <div className="condition-auto" data-testid="receipt-condition-auto">
        {autoJudgement.status === 'judged' ? (
          <>
            <span>
              受付時刻{receptionAtText ? ` ${receptionAtText}` : ''} から自動判定：
              <strong>{AFTER_HOURS_CATEGORY_LABELS[autoJudgement.category]}</strong>（{autoJudgement.reason}）
            </span>
            {autoDiffers ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={onApplyAutoJudgement}
                disabled={disabled}
                data-testid="condition-apply-auto"
              >
                自動判定に合わせる（{AFTER_HOURS_CATEGORY_LABELS[autoJudgement.category]}）
              </button>
            ) : null}
          </>
        ) : (
          <span>{autoJudgement.message}</span>
        )}
      </div>

      {printBlocked ? (
        <p className="condition-unset" role="alert" data-testid="receipt-condition-unset">
          <TriangleAlert size={14} aria-hidden="true" /> {current.unsetFeeNames.join('・')}の点数が点数表に未設定のため、金額は確定していません。
          点数表に値を入れるまで、領収証は印刷できず、請求も確定できません。
        </p>
      ) : null}

      <div className="condition-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={onPrintReceiptOnly}
          disabled={!canPrintReceipt || printBlocked || busy}
          data-testid="print-receipt-only-button"
          title={printBlocked ? '点数が未設定のため印刷できません。' : '領収証だけを印刷します（他の帳票は刷りません）。'}
        >
          <Printer size={16} aria-hidden="true" />
          <span>領収証だけ印刷</span>
        </button>
      </div>

      <style jsx>{`
        .receipt-condition-panel {
          align-self: stretch;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          background: var(--bg-card, #fff);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0.9rem 1rem;
          margin-bottom: 1rem;
        }

        .condition-header {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
        }

        .condition-header h4 {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          margin: 0;
          font-size: var(--fs-base);
          color: var(--text-main);
        }

        .condition-current {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          color: var(--text-muted);
          font-size: var(--fs-sm);
        }

        .condition-current strong {
          font-size: 1.25rem;
          color: var(--text-main);
        }

        .condition-current small {
          font-size: var(--fs-xs);
        }

        .condition-help,
        .condition-locked,
        .condition-unset {
          margin: 0;
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }

        .condition-locked,
        .condition-unset {
          display: flex;
          align-items: flex-start;
          gap: 0.4rem;
          border-radius: 6px;
          padding: 0.5rem 0.75rem;
        }

        .condition-locked {
          background: var(--bg-muted, #f3f4f6);
          color: var(--text-main);
        }

        .condition-unset {
          background: var(--warning-soft);
          color: var(--warning);
        }

        .condition-groups {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 0.75rem;
        }

        .condition-group {
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 0.5rem 0.75rem 0.6rem;
          margin: 0;
          min-width: 0;
        }

        .condition-group legend {
          padding: 0 0.3rem;
          font-size: var(--fs-sm);
          font-weight: 700;
          color: var(--text-main);
        }

        .condition-choices {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }

        .condition-choice {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 0.5rem;
          border: 1px solid transparent;
          border-radius: 6px;
          padding: 0.3rem 0.45rem;
          font-size: var(--fs-sm);
          cursor: pointer;
        }

        .condition-choice.selected {
          border-color: var(--primary);
          background: var(--primary-light);
        }

        .condition-choice.unset .condition-choice-amount {
          color: var(--warning);
        }

        .condition-choice-amount {
          font-variant-numeric: tabular-nums;
          color: var(--text-muted);
        }

        .condition-group:disabled .condition-choice {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .condition-auto {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem 0.75rem;
          font-size: var(--fs-sm);
          color: var(--text-muted);
        }

        .condition-actions {
          display: flex;
          justify-content: flex-end;
        }
      `}</style>
    </div>
  );
});
