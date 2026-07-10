'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileText,
  LockKeyhole,
  PlayCircle,
  ScanLine,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const PRE_LOGIN_TOUR_FIXTURE = {
  medicationRecord: {
    patientName: 'デモ患者 さくら',
    reviewPoints: 2,
  },
  reception: {
    prescriptionId: 'DEMO-RX-001',
    medicineName: 'デモ薬品 A',
    usage: '1日3回・7日分',
  },
} as const;

type PreLoginTourProps = {
  // ログイン前の体験のため、デモ投入や後続画面遷移はすべて呼び出し側に委譲する。
  // このコンポーネント自体はDBに触れない設計を保つ。
  onFinish: () => void;
};

type PreLoginTourStep = {
  label: string;
  title: string;
  description: string;
  icon: typeof FileText;
  preview: ReactNode;
};

function MedicationDemoPreview() {
  const fixture = PRE_LOGIN_TOUR_FIXTURE.medicationRecord;
  return (
    <div className="tutorial-record-preview" aria-label="薬歴入力の独立デモ表示">
      <div className="tutorial-record-person">
        <span>{fixture.patientName}</span>
        <strong>今回の確認ポイント {fixture.reviewPoints}件</strong>
      </div>
      <div className="tutorial-soap-grid">
        {[
          ['S', '患者さんの訴え'],
          ['O', '確認できた事実'],
          ['A', '薬剤師の評価'],
          ['P', '説明・次回計画'],
        ].map(([key, value], index) => (
          <div key={key} className={index < 2 ? 'filled' : ''}>
            <strong>{key}</strong>
            <span>{value}</span>
            {index < 2 && <Check size={14} />}
          </div>
        ))}
      </div>
      <div className="tutorial-ai-note"><Sparkles size={15} /> 下書きを使い、最後は薬剤師が確認</div>
    </div>
  );
}

function ReceptionDemoPreview() {
  const fixture = PRE_LOGIN_TOUR_FIXTURE.reception;
  return (
    <div className="tutorial-scan-preview" aria-label="処方箋受付の独立デモ表示">
      <div className="tutorial-scan-paper">
        <div className="tutorial-demo-id">{fixture.prescriptionId}</div>
        <div className="tutorial-scan-line short" />
        <div className="tutorial-scan-line" />
        <div className="tutorial-scan-line" />
        <div className="tutorial-scan-medicine">
          <span>{fixture.medicineName}</span>
          <strong>{fixture.usage}</strong>
        </div>
        <div className="tutorial-scan-line" />
      </div>
      <div className="tutorial-scan-focus" aria-hidden="true"><ScanLine size={28} /></div>
      <div className="tutorial-preview-status"><CheckCircle2 size={16} /> 読み取り候補を確認</div>
    </div>
  );
}

const PRE_LOGIN_TOUR_STEPS: PreLoginTourStep[] = [
  {
    label: '薬歴デモ',
    title: '前回との差分から見て、薬歴を仕上げます',
    description: '処方差分と確認ポイントを見てからSOAPを入力します。AI下書きは補助として使い、保存前に薬剤師が内容を確定します。',
    icon: FileText,
    preview: <MedicationDemoPreview />,
  },
  {
    label: '処方箋入力デモ',
    title: '処方箋は「取り込む → 確認 → 受付」の3手です',
    description: 'OCRでも手入力でも、最後に人が確認してから受付データになります。迷った時は、色が付いた項目から見直してください。',
    icon: ScanLine,
    preview: <ReceptionDemoPreview />,
  },
];

export default function PreLoginTour({ onFinish }: PreLoginTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [canUsePortal, setCanUsePortal] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const step = PRE_LOGIN_TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === PRE_LOGIN_TOUR_STEPS.length - 1;

  useEffect(() => {
    setCanUsePortal(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onFinish();
      }
      if (event.key === 'ArrowRight') {
        setStepIndex((current) => Math.min(current + 1, PRE_LOGIN_TOUR_STEPS.length - 1));
      }
      if (event.key === 'ArrowLeft') {
        setStepIndex((current) => Math.max(current - 1, 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onFinish]);

  const tourModal = (
    <div className="tutorial-overlay" data-testid="pre-login-tour" role="presentation">
      <section
        className="tutorial-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-login-tour-title"
        aria-describedby="pre-login-tour-description"
      >
        <header className="tutorial-dialog-header">
          <div>
            <span className="tutorial-kicker"><Sparkles size={14} /> はじめての pharma-oss</span>
            <h2 id="pre-login-tour-title">ログイン前に、2つのデモを体験できます</h2>
          </div>
          <div className="tutorial-header-actions">
            <span className="tutorial-safe-badge"><LockKeyhole size={14} /> 独立デモ・DB未保存</span>
            <button
              ref={closeButtonRef}
              type="button"
              className="tutorial-close"
              onClick={onFinish}
              data-testid="pre-login-tour-skip"
              aria-label="デモをスキップしてログインへ進む"
              title="デモをスキップしてログインへ進む"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <nav className="tutorial-progress" aria-label="デモの進捗">
          {PRE_LOGIN_TOUR_STEPS.map((item, index) => {
            const Icon = item.icon;
            const isCurrent = index === stepIndex;
            const isComplete = index < stepIndex;
            return (
              <button
                key={item.label}
                type="button"
                className={`${isCurrent ? 'current' : ''} ${isComplete ? 'complete' : ''}`.trim()}
                onClick={() => setStepIndex(index)}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span>{isComplete ? <Check size={16} /> : <Icon size={16} />}</span>
                <strong>{index + 1}. {item.label}</strong>
              </button>
            );
          })}
        </nav>

        <div className="tutorial-body">
          <div className="tutorial-preview" key={`preview-${stepIndex}`}>
            <div className="tutorial-preview-label"><PlayCircle size={14} /> 独立デモ画面</div>
            {step.preview}
          </div>
          <div className="tutorial-copy" key={`copy-${stepIndex}`}>
            <span className="tutorial-step-count">STEP {stepIndex + 1} / {PRE_LOGIN_TOUR_STEPS.length}</span>
            <h3>{step.title}</h3>
            <p id="pre-login-tour-description">{step.description}</p>
            <p className="tutorial-data-note">
              <LockKeyhole size={15} />
              <span>表示中のデモデータは体験専用です。ログインや患者・受付・薬歴データには一切保存されません。</span>
            </p>
          </div>
        </div>

        <footer className="tutorial-footer">
          <div>
            {stepIndex > 0 && (
              <button type="button" className="tutorial-back" onClick={() => setStepIndex((current) => current - 1)}>
                <ArrowLeft size={17} /> 戻る
              </button>
            )}
          </div>
          <div className="tutorial-footer-actions">
            <button type="button" className="tutorial-later" onClick={onFinish} data-testid="pre-login-tour-skip-footer">
              <SkipForward size={16} /> スキップしてログインへ
            </button>
            {isLastStep ? (
              <button type="button" className="tutorial-demo-start" onClick={onFinish} data-testid="pre-login-tour-finish">
                <CheckCircle2 size={18} /> ログインへ進む
              </button>
            ) : (
              <button type="button" className="tutorial-next" onClick={() => setStepIndex((current) => current + 1)}>
                次へ <ArrowRight size={18} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );

  return canUsePortal ? createPortal(tourModal, document.body) : null;
}
