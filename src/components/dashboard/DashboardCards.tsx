import { CheckCircle2, Loader2 } from 'lucide-react';
import React from 'react';

export const KanbanColumn = React.memo(function KanbanColumn({
  title,
  count,
  tone,
  children
}: {
  title: string;
  count: number;
  tone: 'neutral' | 'amber' | 'green';
  children: React.ReactNode;
}) {
  return (
    <div className="kanban-column">
      <div className="column-header">
        <h4>{title}</h4>
        <span className={`badge ${tone}`}>{count}</span>
      </div>
      <div className="task-list">{children}</div>
    </div>
  );
});

// tone: 'loading' でスピナー、'ok' でチェック(≒異常なし)を添え、
// 「読み込み中」と「確認済み・対象なし」を一目で区別できるようにする
export const EmptyState = React.memo(function EmptyState({
  text,
  tone = 'ok'
}: {
  text: string;
  tone?: 'loading' | 'ok';
}) {
  return (
    <div className="empty-state">
      {tone === 'loading' ? (
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 size={15} aria-hidden="true" />
      )}
      <span>{text}</span>
    </div>
  );
});

export const KpiCard = React.memo(function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  subLabel,
  detail
}: {
  icon: React.ElementType;
  tone: 'blue' | 'amber' | 'red' | 'green';
  label: string;
  value: string | number;
  subLabel: string;
  detail: string;
}) {
  return (
    <div className={`kpi-card ${tone}`}>
      <span className="kpi-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="kpi-copy">
        <span className="kpi-label">{label}</span>
        <span className="kpi-value">{value}</span>
        <span className="kpi-sub">{subLabel}</span>
        <span className="kpi-detail">{detail}</span>
      </span>
    </div>
  );
});

export const OperationTile = React.memo(function OperationTile({
  icon: Icon,
  label,
  value,
  subLabel,
  tone,
  onClick
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  subLabel: string;
  tone: 'blue' | 'amber' | 'red' | 'green' | 'teal';
  onClick: () => void;
}) {
  return (
    <button type="button" className={`operation-tile ${tone}`} onClick={onClick}>
      <span className="operation-icon">
        <Icon size={20} aria-hidden="true" />
      </span>
      <span className="operation-copy">
        <span className="operation-label">{label}</span>
        <span className="operation-value">{value}</span>
        <span className="operation-sub">{subLabel}</span>
      </span>
    </button>
  );
});

export const StatCard = React.memo(function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  subLabel
}: {
  icon: React.ElementType;
  tone: 'blue' | 'amber' | 'red' | 'green';
  label: string;
  value: string | number;
  subLabel: string;
}) {
  return (
    <div className="card stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={23} aria-hidden="true" />
      </div>
      <div>
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        <span className="stat-sub">{subLabel}</span>
      </div>
    </div>
  );
});
