'use client';

import {
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileSearch,
  History,
  LockKeyhole,
  PackageCheck,
  PlayCircle,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const WORKFLOW_TUTORIAL_VERSION = 'v1';

const WORKFLOW_DEMO_FIXTURE = {
  input: {
    prescriptionId: 'DEMO-INPUT-RX-001',
    patientName: 'デモ患者 みどり',
    medicineName: 'デモ薬品 A錠 10mg',
    usage: '1日3回 毎食後・7日分',
  },
  picking: {
    taskId: 'DEMO-PICK-001',
    medicineName: 'デモ薬品 A錠 10mg',
    gs1: '(01)04912345678904',
    lot: 'DEMO-LOT-A',
    expiration: '2027-06',
  },
  medication: {
    recordId: 'DEMO-SOAP-001',
    patientName: 'デモ患者 みどり',
    previousDifference: '用量変更あり',
    soapDraft: '服用状況と副作用の有無を確認',
  },
} as const;

export type WorkflowTutorialKind = 'input' | 'picking' | 'medication';

type WorkflowMiniTutorialProps = {
  kind: WorkflowTutorialKind;
  userId: string;
  autoOpen?: boolean;
};

type WorkflowStep = {
  title: string;
  description: string;
  icon: LucideIcon;
};

type WorkflowConfig = {
  eyebrow: string;
  title: string;
  description: string;
  triggerLabel: string;
  finishLabel: string;
  accent: string;
  steps: WorkflowStep[];
  preview: ReactNode;
};

function workflowTutorialStorageKey(userId: string, kind: WorkflowTutorialKind): string {
  return `yakureki:workflow-tutorial:${WORKFLOW_TUTORIAL_VERSION}:${userId}:${kind}`;
}

function InputDemoPreview() {
  const fixture = WORKFLOW_DEMO_FIXTURE.input;
  return (
    <div className="workflow-demo-preview-card input" aria-label="処方入力の独立デモ表示">
      <div className="workflow-demo-preview-head">
        <span>{fixture.prescriptionId}</span>
        <strong>確認が必要な項目だけ見直す</strong>
      </div>
      <div className="workflow-demo-fields">
        <div className="checked"><span>患者</span><strong>{fixture.patientName}</strong><Check size={15} /></div>
        <div className="attention"><span>薬品</span><strong>{fixture.medicineName}</strong><FileSearch size={15} /></div>
        <div className="checked"><span>用法</span><strong>{fixture.usage}</strong><Check size={15} /></div>
      </div>
      <div className="workflow-demo-preview-status"><ShieldCheck size={16} /> 原本と確認してから受付へ</div>
    </div>
  );
}

function PickingDemoPreview() {
  const fixture = WORKFLOW_DEMO_FIXTURE.picking;
  return (
    <div className="workflow-demo-preview-card picking" aria-label="ピッキングの独立デモ表示">
      <div className="workflow-demo-preview-head">
        <span>{fixture.taskId}</span>
        <strong>{fixture.medicineName}</strong>
      </div>
      <div className="workflow-demo-scan-code"><ScanLine size={20} /><span>{fixture.gs1}</span></div>
      <div className="workflow-demo-lot-grid">
        <div><span>ロット</span><strong>{fixture.lot}</strong></div>
        <div><span>使用期限</span><strong>{fixture.expiration}</strong></div>
      </div>
      <div className="workflow-demo-preview-status success"><PackageCheck size={16} /> 薬品・ロット・期限が一致</div>
    </div>
  );
}

function MedicationDemoPreview() {
  const fixture = WORKFLOW_DEMO_FIXTURE.medication;
  return (
    <div className="workflow-demo-preview-card medication" aria-label="薬歴の独立デモ表示">
      <div className="workflow-demo-preview-head">
        <span>{fixture.recordId}</span>
        <strong>{fixture.patientName}</strong>
      </div>
      <div className="workflow-demo-history-diff"><History size={16} /><span>前回との差分</span><strong>{fixture.previousDifference}</strong></div>
      <div className="workflow-demo-soap-row">
        {['S', 'O', 'A', 'P'].map((label, index) => (
          <span key={label} className={index < 2 ? 'filled' : ''}>{label}{index < 2 ? <Check size={12} /> : null}</span>
        ))}
      </div>
      <div className="workflow-demo-preview-status"><Sparkles size={16} /> {fixture.soapDraft}</div>
    </div>
  );
}

const WORKFLOW_CONFIG: Record<WorkflowTutorialKind, WorkflowConfig> = {
  input: {
    eyebrow: '入力・30秒デモ',
    title: '処方箋は「取り込む → 確認 → 受付」の3手です',
    description: 'OCRでも手入力でも、最後に人が確認してから受付データになります。迷った時は、色が付いた項目から見直してください。',
    triggerLabel: '入力デモ',
    finishLabel: '入力を始める',
    accent: 'input',
    steps: [
      { title: '取り込む', description: '画像を選ぶか、手入力受付を選びます。', icon: ScanLine },
      { title: '確認する', description: '患者・薬品・用法の候補を原本と照合します。', icon: FileCheck2 },
      { title: '受付する', description: '確認後に印刷・ピッキングへ進みます。', icon: ArrowRight },
    ],
    preview: <InputDemoPreview />,
  },
  picking: {
    eyebrow: 'ピッキング・30秒デモ',
    title: 'GS1を読み、薬品・ロット・期限を照合します',
    description: '今回の処方と一致した薬品だけを照合済みにします。実物と画面が一致しない時は、その場で止められます。',
    triggerLabel: 'ピッキングデモ',
    finishLabel: 'ピッキングに戻る',
    accent: 'picking',
    steps: [
      { title: '読み取る', description: '薬品のGS1データバーをスキャンします。', icon: ScanLine },
      { title: '照合する', description: '薬品・ロット・使用期限の一致を確認します。', icon: ShieldCheck },
      { title: 'そろえる', description: '全明細が照合済みになったら次へ進みます。', icon: PackageCheck },
    ],
    preview: <PickingDemoPreview />,
  },
  medication: {
    eyebrow: '薬歴・30秒デモ',
    title: '前回との差分から見て、SOAPを仕上げます',
    description: '処方差分と確認ポイントを見てからSOAPを入力します。AI下書きは補助として使い、保存前に薬剤師が内容を確定します。',
    triggerLabel: '薬歴デモ',
    finishLabel: '薬歴を始める',
    accent: 'medication',
    steps: [
      { title: '差分を見る', description: '前回処方・前回薬歴との違いを確認します。', icon: History },
      { title: 'SOAPを書く', description: '確認した事実と評価を4区分で整理します。', icon: ClipboardCheck },
      { title: '薬剤師が確定', description: '下書きを見直し、保存・完了します。', icon: ShieldCheck },
    ],
    preview: <MedicationDemoPreview />,
  },
};

export default function WorkflowMiniTutorial({ kind, userId, autoOpen = false }: WorkflowMiniTutorialProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [canUsePortal, setCanUsePortal] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const config = WORKFLOW_CONFIG[kind];
  const titleId = `workflow-demo-${kind}-title`;
  const descriptionId = `workflow-demo-${kind}-description`;

  useEffect(() => {
    setCanUsePortal(true);
  }, []);

  const rememberSeen = useCallback(() => {
    if (!userId) return;
    try {
      window.localStorage.setItem(workflowTutorialStorageKey(userId, kind), new Date().toISOString());
    } catch {
      // The demo remains usable when browser storage is unavailable.
    }
  }, [kind, userId]);

  const markSeenAndClose = useCallback(() => {
    rememberSeen();
    restoreFocusRef.current = true;
    setIsOpen(false);
  }, [rememberSeen]);

  useEffect(() => {
    if (!autoOpen || !userId) return;
    try {
      if (window.localStorage.getItem(workflowTutorialStorageKey(userId, kind))) return;
    } catch {
      // Manual opening remains available if storage access fails.
    }
    setIsOpen(true);
  }, [autoOpen, kind, userId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !canUsePortal) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [canUsePortal, isOpen]);

  const openTutorial = () => {
    restoreFocusRef.current = false;
    setIsOpen(true);
  };

  const demoDialog = (
    <dialog
      ref={dialogRef}
      className={`workflow-demo-dialog ${config.accent}`}
      data-testid={`workflow-demo-${kind}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        markSeenAndClose();
      }}
      onClose={() => {
        setIsOpen(false);
        if (restoreFocusRef.current) {
          restoreFocusRef.current = false;
          window.setTimeout(() => triggerRef.current?.focus(), 0);
        }
      }}
    >
      <header className="workflow-demo-header">
        <div>
          <span className="workflow-demo-eyebrow"><PlayCircle size={14} /> {config.eyebrow}</span>
          <h2 id={titleId}>{config.title}</h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="workflow-demo-close"
          onClick={markSeenAndClose}
          aria-label={`${config.triggerLabel}を閉じる`}
        >
          <X size={20} />
        </button>
      </header>

      <div className="workflow-demo-content">
        <div className="workflow-demo-visual">
          <span className="workflow-demo-isolated"><LockKeyhole size={14} /> 独立デモ・DB未保存</span>
          {config.preview}
        </div>
        <div className="workflow-demo-guide">
          <p id={descriptionId}>{config.description}</p>
          <ol>
            {config.steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title}>
                  <span className="workflow-demo-step-icon"><Icon size={18} /></span>
                  <div><strong>{index + 1}. {step.title}</strong><span>{step.description}</span></div>
                </li>
              );
            })}
          </ol>
          <p className="workflow-demo-data-note">
            <LockKeyhole size={15} />
            <span>これは練習用の固定データです。患者・受付・在庫・薬歴には保存されません。</span>
          </p>
        </div>
      </div>

      <footer className="workflow-demo-footer">
        <button type="button" className="workflow-demo-later" onClick={markSeenAndClose}>あとで見る</button>
        <button type="button" className="workflow-demo-finish" onClick={markSeenAndClose}>
          <CheckCircle2 size={18} /> {config.finishLabel}
        </button>
      </footer>
    </dialog>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`workflow-demo-trigger ${config.accent}`}
        data-testid={`workflow-demo-trigger-${kind}`}
        onClick={openTutorial}
        aria-haspopup="dialog"
        title={`${config.triggerLabel}を開く`}
      >
        <PlayCircle size={16} aria-hidden="true" />
        <span>{config.triggerLabel}</span>
      </button>
      {canUsePortal ? createPortal(demoDialog, document.body) : null}
    </>
  );
}
