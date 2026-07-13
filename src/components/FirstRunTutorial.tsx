'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LockKeyhole,
  PackageCheck,
  PlayCircle,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const TUTORIAL_VERSION = 'v1';
const DEMO_TUTORIAL_FIXTURE = {
  dashboard: {
    receivedToday: 12,
    waiting: 3,
    needsReview: 1,
  },
  reception: {
    prescriptionId: 'DEMO-RX-001',
    medicineName: 'デモ薬品 A',
    usage: '1日3回・7日分',
  },
  medicationRecord: {
    patientName: 'デモ患者 さくら',
    reviewPoints: 2,
  },
} as const;

type FirstRunTutorialProps = {
  userId: string;
  autoOpen: boolean;
  onStartReception: () => void;
  // デモ患者・受付・在庫一式の投入/削除は呼び出し側(ClientLayout)が担い、
  // このコンポーネント自体はDBに触れない設計を保つ。
  onStartDemo: () => void;
  onCleanupDemo: () => void;
};

type TutorialStep = {
  label: string;
  title: string;
  description: string;
  points: string[];
  icon: typeof LayoutDashboard;
  preview: ReactNode;
};

// ClientLayoutがゲスト体験開始時に既読マークするために公開する
// (PreLoginTourと連続で同じような案内が2回出るのを防ぐ)。
export function tutorialStorageKey(userId: string): string {
  return `yakureki:first-run-tutorial:${TUTORIAL_VERSION}:${userId}`;
}

function DashboardPreview() {
  return (
    <div className="tutorial-mini-dashboard" aria-label="ダッシュボードの独立デモ表示">
      <div className="tutorial-mini-head">
        <span>本日の業務</span>
        <strong>迷ったら、まずここ</strong>
      </div>
      <div className="tutorial-mini-stats">
        <div><span>本日受付</span><strong>{DEMO_TUTORIAL_FIXTURE.dashboard.receivedToday}</strong></div>
        <div><span>受付待ち</span><strong>{DEMO_TUTORIAL_FIXTURE.dashboard.waiting}</strong></div>
        <div><span>要確認</span><strong>{DEMO_TUTORIAL_FIXTURE.dashboard.needsReview}</strong></div>
      </div>
      <div className="tutorial-mini-task">
        <span className="tutorial-mini-task-icon"><FileCheck2 size={17} /></span>
        <div>
          <strong>次にすることが分かります</strong>
          <span>優先度の高い業務から上に表示</span>
        </div>
        <ArrowRight size={17} />
      </div>
    </div>
  );
}

function ReceptionPreview() {
  return (
    <div className="tutorial-scan-preview" aria-label="処方箋受付の独立デモ表示">
      <div className="tutorial-scan-paper">
        <div className="tutorial-demo-id">{DEMO_TUTORIAL_FIXTURE.reception.prescriptionId}</div>
        <div className="tutorial-scan-line short" />
        <div className="tutorial-scan-line" />
        <div className="tutorial-scan-line" />
        <div className="tutorial-scan-medicine">
          <span>{DEMO_TUTORIAL_FIXTURE.reception.medicineName}</span>
          <strong>{DEMO_TUTORIAL_FIXTURE.reception.usage}</strong>
        </div>
        <div className="tutorial-scan-line" />
      </div>
      <div className="tutorial-scan-focus" aria-hidden="true"><ScanLine size={28} /></div>
      <div className="tutorial-preview-status"><CheckCircle2 size={16} /> 読み取り候補を確認</div>
    </div>
  );
}

function MedicationPreview() {
  return (
    <div className="tutorial-record-preview" aria-label="薬歴入力の独立デモ表示">
      <div className="tutorial-record-person">
        <span>{DEMO_TUTORIAL_FIXTURE.medicationRecord.patientName}</span>
        <strong>今回の確認ポイント {DEMO_TUTORIAL_FIXTURE.medicationRecord.reviewPoints}件</strong>
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

function CompletionPreview() {
  return (
    <div className="tutorial-completion-preview" aria-label="業務完了までの独立デモ表示">
      <div className="tutorial-completion-ring"><Check size={32} /></div>
      <strong>受付から完了まで、ひと続き</strong>
      <div className="tutorial-completion-list">
        <span><PackageCheck size={16} /> ピッキング・監査</span>
        <span><ClipboardCheck size={16} /> 薬剤師確認</span>
        <span><FileText size={16} /> 印刷・請求確認</span>
      </div>
      <div className="tutorial-local-note"><LockKeyhole size={15} /> このデモはDBに保存しません</div>
    </div>
  );
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    label: '全体を見る',
    title: '今日の仕事は、ここを見れば分かります',
    description: 'ダッシュボードには、受付待ち・要確認・完了がまとまっています。数字を見るだけで、次に動く場所を判断できます。',
    points: ['優先度の高い業務を先に表示', '受付から薬歴完了までをひと目で確認'],
    icon: LayoutDashboard,
    preview: <DashboardPreview />,
  },
  {
    label: '受付する',
    title: '処方箋を読み取り、候補だけ確認します',
    description: '「新規受付」から処方箋を読み取ります。認識結果はそのまま確定されず、患者・薬品・用法を人の目で確認できます。',
    points: ['手入力を減らして受付を短縮', '読み取りに自信がない項目を明示'],
    icon: ScanLine,
    preview: <ReceptionPreview />,
  },
  {
    label: '薬歴を書く',
    title: '確認ポイントから、薬歴を仕上げます',
    description: '前回薬歴や処方差分を見ながらSOAPを入力します。AIの下書きは補助として使い、保存前に薬剤師が確認します。',
    points: ['前回との違いを見落としにくい', '下書きから始めても確認責任は明確'],
    icon: FileText,
    preview: <MedicationPreview />,
  },
  {
    label: '完了する',
    title: '監査・印刷・請求まで迷わず完了',
    description: 'ピッキング、薬剤師確認、印刷、請求確認へ順番につながります。未完了があれば止まるので、抜けたまま進みません。「デモ患者で体験を始める」を押すと、練習用のデモ患者・受付・在庫(棚番地/JAN付き)に加えて、過去3回分の薬歴と副作用歴アラートも投入され、プロブレムが回を追って書き継がれる様子や薬剤師確認まで実際の画面で試せます。',
    points: [
      '必要な確認が終わるまで完了を防止',
      '操作記録を残してあとから追跡可能',
      'デモ患者はいつでも見分けられる「デモ」表記',
      'デモ受付は請求(UKE)・外部機器連携に載らず、練習後は片づけボタンで削除可能'
    ],
    icon: ShieldCheck,
    preview: <CompletionPreview />,
  },
];

export default function FirstRunTutorial({ userId, autoOpen, onStartReception, onStartDemo, onCleanupDemo }: FirstRunTutorialProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [canUsePortal, setCanUsePortal] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const step = TUTORIAL_STEPS[stepIndex];
  const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1;

  useEffect(() => {
    setCanUsePortal(true);
  }, []);

  const rememberSeen = useCallback(() => {
    try {
      window.localStorage.setItem(tutorialStorageKey(userId), new Date().toISOString());
    } catch {
      // Closing the tutorial should never depend on browser storage access.
    }
  }, [userId]);

  const markSeenAndClose = useCallback(() => {
    rememberSeen();
    setIsOpen(false);
    window.setTimeout(() => previousFocusRef.current?.focus(), 0);
  }, [rememberSeen]);

  useEffect(() => {
    if (!autoOpen || !userId) return;
    try {
      if (window.localStorage.getItem(tutorialStorageKey(userId))) return;
    } catch {
      // The tutorial can still be opened manually when storage is unavailable.
    }
    setStepIndex(0);
    setIsOpen(true);
  }, [autoOpen, userId]);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        markSeenAndClose();
      }
      if (event.key === 'ArrowRight') {
        setStepIndex((current) => Math.min(current + 1, TUTORIAL_STEPS.length - 1));
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
  }, [isOpen, markSeenAndClose]);

  const openTutorial = () => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStepIndex(0);
    setIsOpen(true);
  };

  const handleStartReception = () => {
    rememberSeen();
    setIsOpen(false);
    onStartReception();
  };

  const handleStartDemo = () => {
    rememberSeen();
    setIsOpen(false);
    onStartDemo();
  };

  const handleCleanupDemo = () => {
    const shouldCleanup = window.confirm(
      '練習用のデモ患者・受付・処方・薬歴・アラート・在庫(「デモ」表記のデータ)をすべて削除します。よろしいですか？'
    );
    if (!shouldCleanup) return;
    rememberSeen();
    setIsOpen(false);
    onCleanupDemo();
  };

  const tutorialModal = isOpen ? (
    <div className="tutorial-overlay" data-testid="first-run-tutorial" role="presentation">
      <section
        className="tutorial-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-description"
      >
        <header className="tutorial-dialog-header">
          <div>
            <span className="tutorial-kicker"><Sparkles size={14} /> はじめての pharma-oss</span>
            <h2 id="tutorial-title">3分で、毎日の流れを体験</h2>
          </div>
          <div className="tutorial-header-actions">
            <span className="tutorial-safe-badge"><LockKeyhole size={14} /> 独立デモ・DB未保存</span>
            <button
              ref={closeButtonRef}
              type="button"
              className="tutorial-close"
              onClick={markSeenAndClose}
              aria-label="チュートリアルを閉じる"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <nav className="tutorial-progress" aria-label="チュートリアルの進捗">
          {TUTORIAL_STEPS.map((item, index) => {
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
            <span className="tutorial-step-count">STEP {stepIndex + 1} / {TUTORIAL_STEPS.length}</span>
            <h3>{step.title}</h3>
            <p id="tutorial-description">{step.description}</p>
            <p className="tutorial-data-note">
              <LockKeyhole size={15} />
              <span>表示中のデモデータはチュートリアル専用です。患者・受付・薬歴データには保存されません。</span>
            </p>
            <ul>
              {step.points.map((point) => (
                <li key={point}><CheckCircle2 size={18} /> <span>{point}</span></li>
              ))}
            </ul>
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
            <button type="button" className="tutorial-later" onClick={markSeenAndClose}>
              {isLastStep ? 'ダッシュボードを見る' : 'あとで見る'}
            </button>
            {isLastStep ? (
              <>
                <button
                  type="button"
                  className="tutorial-later"
                  onClick={handleCleanupDemo}
                  data-testid="tutorial-cleanup-demo"
                  title="練習用のデモ患者・受付・薬歴・アラート・在庫をすべて削除します"
                >
                  <Trash2 size={16} /> デモデータを片づける
                </button>
                <button
                  type="button"
                  className="tutorial-demo-start"
                  onClick={handleStartDemo}
                  data-testid="tutorial-start-demo"
                  title="デモ患者・受付・在庫(棚番地/JAN付き)に過去3回分の薬歴・副作用歴アラートも投入し、履歴参照や不足記録まで練習できます"
                >
                  <PackageCheck size={18} /> デモ患者で体験を始める
                </button>
                <button type="button" className="tutorial-next" onClick={handleStartReception} data-testid="tutorial-start-reception">
                  <ScanLine size={18} /> 実際の受付画面へ
                </button>
              </>
            ) : (
              <button type="button" className="tutorial-next" onClick={() => setStepIndex((current) => current + 1)}>
                次へ <ArrowRight size={18} />
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className="tutorial-trigger"
        data-testid="tutorial-trigger"
        onClick={openTutorial}
        aria-haspopup="dialog"
        title="はじめての方向け3分デモ"
      >
        <PlayCircle size={17} aria-hidden="true" />
        <span>3分デモ</span>
      </button>

      {canUsePortal && tutorialModal ? createPortal(tutorialModal, document.body) : null}
    </>
  );
}
