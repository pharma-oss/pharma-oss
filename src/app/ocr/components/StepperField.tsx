import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { normalizeNumericInput, stepNumericText } from '@/lib/number_stepper';

export interface StepperFieldProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  /** 入力欄に付けるクラス。見た目は親の :global() ルールで決める(1日量・日数で太さが違うため)。 */
  inputClassName?: string;
  inputMode?: 'decimal' | 'numeric';
  placeholder?: string;
  maxLength?: number;
  step?: number;
  min?: number;
  max?: number;
  /** 画面幅が広いときは±ボタンを隠す(PC は入力欄だけで足りる)。 */
  compactOnDesktop?: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement> & { [dataAttribute: `data-${string}`]: string };
}

export const StepperField = React.memo(({
  value,
  onChange,
  ariaLabel,
  inputClassName,
  inputMode = 'decimal',
  placeholder,
  maxLength,
  step = 1,
  min = 0,
  max,
  compactOnDesktop = true,
  inputProps
}: StepperFieldProps) => {
  const stepBy = (delta: number) => onChange(stepNumericText(value, delta, { min, max, maxLength }));

  return (
    <div className={`stepper-field ${compactOnDesktop ? 'compact-on-desktop' : ''}`}>
      <button
        type="button"
        className="stepper-button"
        aria-label={`${ariaLabel}を減らす`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => stepBy(-step)}
        tabIndex={-1}
      >
        <Minus size={18} aria-hidden="true" />
      </button>
      <input
        {...inputProps}
        type="text"
        inputMode={inputMode}
        className={inputClassName}
        aria-label={ariaLabel}
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(event) => {
          // IMEの変換中は書き換えない(確定時に半角へ揃える)。変換中に値を差し替えると確定が崩れる。
          const composing = (event.nativeEvent as InputEvent).isComposing;
          onChange(composing ? event.target.value : normalizeNumericInput(event.target.value));
        }}
        onCompositionEnd={(event) => onChange(normalizeNumericInput(event.currentTarget.value))}
      />
      <button
        type="button"
        className="stepper-button"
        aria-label={`${ariaLabel}を増やす`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => stepBy(step)}
        tabIndex={-1}
      >
        <Plus size={18} aria-hidden="true" />
      </button>
      <style jsx>{`
        .stepper-field {
          display: grid;
          grid-template-columns: 44px minmax(0, 1fr) 44px;
          align-items: stretch;
          gap: 0.35rem;
          min-width: 0;
        }

        .stepper-button {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: #f8fafc;
          color: var(--primary-dark);
          cursor: pointer;
        }

        .stepper-button:active {
          background: var(--primary-light);
        }

        @media (max-width: 380px) {
          .stepper-field {
            grid-template-columns: 38px minmax(0, 1fr) 38px;
            gap: 0.25rem;
          }
        }

        /* PC では行の幅が狭く(1日量は72px)、キーボードで打つので±ボタンは出さない */
        @media (min-width: 721px) {
          .stepper-field.compact-on-desktop {
            display: block;
          }

          .stepper-field.compact-on-desktop .stepper-button {
            display: none;
          }
        }
      `}</style>
    </div>
  );
});

StepperField.displayName = 'StepperField';
