import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  HeartPulse,
  PackageSearch
} from 'lucide-react';
import React, { useCallback } from 'react';
import type {
  DashboardClaimRisk,
  DashboardClaimWorkItem,
  DashboardInventoryRisk
} from '@/hooks/useDashboardTasks';
import { formatInventoryAmount } from '@/lib/inventory_order';
import type { OperationalAiPrediction } from '@/lib/operational_ai_prediction';

export const OPERATIONAL_AI_DOMAIN_META: Record<
  OperationalAiPrediction['domain'],
  {
    label: string;
    buttonLabel: string;
    Icon: React.ElementType;
  }
> = {
  claim_return: {
    label: '返戻',
    buttonLabel: '請求確認',
    Icon: FileCheck2
  },
  inventory_shortage: {
    label: '欠品',
    buttonLabel: '在庫管理',
    Icon: PackageSearch
  },
  follow_up: {
    label: 'フォロー',
    buttonLabel: '薬歴確認',
    Icon: HeartPulse
  }
};

export const AiPredictionRow = React.memo(function AiPredictionRow({
  prediction,
  onOpen
}: {
  prediction: OperationalAiPrediction;
  onOpen: () => void;
}) {
  const meta = OPERATIONAL_AI_DOMAIN_META[prediction.domain];
  const Icon = meta.Icon;

  return (
    <div
      className={`ai-prediction-row severity-${prediction.severity} domain-${prediction.domain}`}
    >
      <span className="ai-prediction-main">
        <span className="ai-prediction-name-line">
          <span className="ai-prediction-domain-badge">{meta.label}</span>
          <span className="ai-prediction-title">{prediction.title}</span>
          <span className="ai-prediction-score">スコア {prediction.score}</span>
          <span className="ai-prediction-confidence">信頼度 {prediction.confidence}%</span>
        </span>
        <span className="ai-prediction-message">{prediction.message}</span>
        <span className="ai-prediction-evidence" aria-label="AI補助予測の根拠">
          {prediction.evidence.slice(0, 3).map((evidence) => (
            <span key={`${prediction.predictionId}-${evidence.label}`}>
              {evidence.label}: {evidence.detail}
            </span>
          ))}
        </span>
      </span>
      <span className="ai-prediction-action">{prediction.suggestedAction}</span>
      <button type="button" className="ai-prediction-button" onClick={onOpen}>
        <Icon size={14} aria-hidden="true" />
        <span>{meta.buttonLabel}</span>
      </button>
    </div>
  );
});

export const PatientTaskCard = React.memo(function PatientTaskCard({
  visitId,
  name,
  age,
  status,
  time,
  waitMinutes,
  prescriptionCount,
  reviewFlags,
  priority,
  interactive,
  onOpen
}: {
  visitId: string;
  name: string;
  age: string;
  status: string;
  time: string;
  waitMinutes: number;
  prescriptionCount: number;
  reviewFlags: string[];
  priority: 'high' | 'medium' | 'normal';
  interactive?: boolean;
  onOpen?: () => void;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!onOpen) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    },
    [onOpen]
  );

  return (
    <div
      className={`card patient-mini-card priority-${priority} ${interactive ? 'interactive' : ''}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? `${name}さんの薬剤師確認を開く` : undefined}
      data-visit-id={visitId}
    >
      <div className="card-top">
        <span className="name">{name}</span>
        <span className="time">{time}</span>
      </div>
      <div className="card-bottom">
        <span className="age">{age}歳</span>
        <span className={`status-tag ${priority === 'high' ? 'urgent' : ''}`}>{status}</span>
      </div>
      <div className="task-meta-row">
        <span>{prescriptionCount}薬</span>
        <span>{waitMinutes}分</span>
      </div>
      {reviewFlags.length > 0 && (
        <div className="review-flags" aria-label="確認項目">
          {reviewFlags.slice(0, 3).map((flag) => (
            <span key={flag}>{flag}</span>
          ))}
        </div>
      )}
    </div>
  );
});

export const FollowUpCandidateRow = React.memo(function FollowUpCandidateRow({
  name,
  time,
  prescriptionCount,
  reasonFlags,
  priority,
  dueLabel,
  suggestedAction,
  riskScore,
  attemptCount,
  lastContactLabel,
  isOverdue,
  isCompleting,
  onOpen,
  onComplete
}: {
  name: string;
  time: string;
  prescriptionCount: number;
  reasonFlags: string[];
  priority: 'high' | 'medium';
  dueLabel: string;
  suggestedAction: string;
  riskScore: number;
  attemptCount: number;
  lastContactLabel?: string;
  isOverdue: boolean;
  isCompleting: boolean;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpen();
      }
    },
    [onOpen]
  );

  return (
    <div
      className={`followup-row priority-${priority}`}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${name}さんのフォロー薬歴を開く`}
    >
      <span className="followup-main">
        <span className="followup-name-line">
          <span className="followup-name">{name}</span>
          <span className="followup-risk-badge">リスク {riskScore}</span>
        </span>
        <span className="followup-meta">
          {time}・{prescriptionCount}薬 / {isOverdue ? '期限超過' : dueLabel}
        </span>
        {attemptCount > 0 && (
          <span className="followup-meta contact">
            接触{attemptCount}回{lastContactLabel ? ` / ${lastContactLabel}` : ''}
          </span>
        )}
        <span className="followup-plan-line">{suggestedAction}</span>
      </span>
      <span className="followup-reasons" aria-label="フォロー理由">
        {reasonFlags.slice(0, 3).map((flag) => (
          <span key={flag}>{flag}</span>
        ))}
      </span>
      <span className="followup-actions">
        <button
          type="button"
          className="followup-complete-button"
          onClick={(e) => {
            e.stopPropagation();
            onComplete();
          }}
          disabled={isCompleting}
        >
          <CheckCircle2 size={14} aria-hidden="true" />
          <span>{isCompleting ? '更新中' : '対応記録'}</span>
        </button>
        <ArrowRight size={16} aria-hidden="true" />
      </span>
    </div>
  );
});

export const ClaimRiskRow = React.memo(function ClaimRiskRow({
  name,
  time,
  prescriptionCount,
  totalPoints,
  errorCount,
  warningCount,
  priority,
  riskScore,
  topIssueTitles,
  actionLabel,
  onOpen
}: Omit<DashboardClaimRisk, 'visitId' | 'patientId'> & {
  onOpen: () => void;
}) {
  const issueSummary =
    topIssueTitles.length > 0 ? topIssueTitles.join(' / ') : '請求前チェックを確認';

  return (
    <div className={`claim-risk-row priority-${priority}`}>
      <span className="claim-risk-main">
        <span className="claim-risk-name-line">
          <span className="claim-risk-name">{name}</span>
          <span className={`claim-risk-badge ${priority}`}>
            {priority === 'high' ? '要修正' : '要確認'}
          </span>
          <span className="claim-risk-score">リスク {riskScore}</span>
        </span>
        <span className="claim-risk-meta">
          {time}・{prescriptionCount}薬 / {totalPoints.toLocaleString('ja-JP')}点 / 要修正{' '}
          {errorCount}・確認 {warningCount}
        </span>
        <span className="claim-risk-issues">{issueSummary}</span>
      </span>
      <span className="claim-risk-action">{actionLabel}</span>
      <button
        type="button"
        className="claim-risk-button"
        data-testid="claim-risk-open-print"
        onClick={onOpen}
      >
        <FileCheck2 size={14} aria-hidden="true" />
        <span>請求確認</span>
      </button>
    </div>
  );
});

export const ClaimWorkbenchRow = React.memo(function ClaimWorkbenchRow({
  item,
  onOpen
}: {
  item: DashboardClaimWorkItem;
  onOpen: () => void;
}) {
  return (
    <div className={`claim-workbench-row priority-${item.priority} status-${item.status}`}>
      <span className="claim-workbench-main">
        <span className="claim-workbench-name-line">
          <span className="claim-workbench-name">{item.name}</span>
          <span className={`claim-workbench-badge ${item.priority}`}>{item.priorityLabel}</span>
          <span className={`claim-workbench-status ${item.status}`}>{item.statusLabel}</span>
        </span>
        <span className="claim-workbench-meta">
          {item.issueDateLabel} / {item.monthLabel} / {item.totalPoints.toLocaleString('ja-JP')}点 /{' '}
          {item.prescriptionCount}薬
        </span>
        <span className="claim-workbench-event">
          {item.latestEventLabel}
          {item.exportedFileName ? ` / ${item.exportedFileName}` : ''}
        </span>
        {item.reason && <span className="claim-workbench-reason">{item.reason}</span>}
      </span>
      <span className="claim-workbench-action">{item.actionLabel}</span>
      <button
        type="button"
        className="claim-workbench-button"
        data-testid="claim-workbench-open-print"
        onClick={onOpen}
      >
        <FileCheck2 size={14} aria-hidden="true" />
        <span>請求確認</span>
      </button>
    </div>
  );
});

export const InventoryRiskRow = React.memo(function InventoryRiskRow({
  drugName,
  location,
  supplierName,
  requiredAmount,
  availableAmount,
  shortageAmount,
  recommendedOrderAmount,
  affectedVisitCount,
  affectedPatientNames,
  priority,
  actionLabel,
  pickingShortageAmount,
  onOpen
}: Omit<DashboardInventoryRisk, 'drugId'> & {
  onOpen: () => void;
}) {
  const patientSummary =
    affectedPatientNames.length > 0 ? affectedPatientNames.slice(0, 3).join('、') : '患者名未登録';
  const remainingCount = Math.max(0, affectedPatientNames.length - 3);

  return (
    <div className={`inventory-risk-row priority-${priority}`}>
      <span className="inventory-risk-main">
        <span className="inventory-risk-name-line">
          <span className="inventory-risk-name">{drugName}</span>
          <span className={`inventory-risk-badge ${priority}`}>
            {priority === 'high' ? '至急' : '注意'}
          </span>
          {(pickingShortageAmount || 0) > 0 && (
            <span className="inventory-risk-badge high">
              棚不足報告 {formatInventoryAmount(pickingShortageAmount as number)}
            </span>
          )}
        </span>
        <span className="inventory-risk-meta">
          必要 {formatInventoryAmount(requiredAmount)} / 在庫{' '}
          {formatInventoryAmount(availableAmount)} / 不足 {formatInventoryAmount(shortageAmount)}
        </span>
        <span className="inventory-risk-order">
          発注目安 {formatInventoryAmount(recommendedOrderAmount)} / 仕入先候補 {supplierName}
        </span>
        <span className="inventory-risk-patients">
          {affectedVisitCount}件: {patientSummary}
          {remainingCount > 0 ? ` ほか${remainingCount}名` : ''}
        </span>
      </span>
      <span className="inventory-risk-side">
        <span className="inventory-risk-location">{location}</span>
        <span className="inventory-risk-action">{actionLabel}</span>
      </span>
      <button
        type="button"
        className="inventory-risk-button"
        onClick={onOpen}
        title="発注ワークベンチを開きます"
      >
        <PackageSearch size={14} aria-hidden="true" />
        <span>発注へ</span>
      </button>
    </div>
  );
});
