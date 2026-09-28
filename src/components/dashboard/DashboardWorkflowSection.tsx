import { ArrowRight, ClipboardList, RefreshCw } from 'lucide-react';
import type { DashboardTask } from '@/lib/dashboard_tasks';
import { EmptyState, KanbanColumn } from './DashboardCards';
import { PatientTaskCard } from './DashboardRows';

export interface DashboardWorkflowSectionProps {
  tasks: DashboardTask[];
  pendingCount: number;
  isLoading: boolean;
  error: Error | null;
  onOpenTask: (visitId: string) => void;
  onOpenRecords: () => void;
  onRetry: () => void;
}

export function DashboardWorkflowSection({
  tasks, pendingCount, isLoading, error, onOpenTask, onOpenRecords, onRetry
}: DashboardWorkflowSectionProps) {
  const reviewTasks = tasks.filter((task) => task.priority !== 'normal');
  const standardTasks = tasks.filter((task) => task.priority === 'normal');
  const renderTask = (task: DashboardTask) => (
    <PatientTaskCard
      key={task.visitId}
      {...task}
      interactive
      onOpen={() => onOpenTask(task.visitId)}
    />
  );

  return (
    <section className="workflow-section" aria-labelledby="dashboard-workflow-heading" aria-busy={isLoading}>
      <div className="section-header">
        <div>
          <span className="dashboard-section-label"><ClipboardList size={16} aria-hidden="true" />患者ごとの対応</span>
          <h2 id="dashboard-workflow-heading">進行中の患者</h2>
          <p className="text-muted">患者カードから薬剤師確認・印刷へ進めます。</p>
        </div>
        <button className="btn-secondary compact" type="button" onClick={onOpenRecords}>
          薬歴一覧を開く<ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <div className="notice danger dashboard-load-error" role="alert">
          <span>患者一覧を読み込めませんでした。再読み込みしてください。</span>
          <button className="btn-secondary compact" type="button" onClick={onRetry}>
            <RefreshCw size={16} aria-hidden="true" />再読み込み
          </button>
        </div>
      ) : isLoading ? (
        <div role="status"><EmptyState text="患者一覧を読み込んでいます…" tone="loading" /></div>
      ) : (
        <>
          {pendingCount > 0 && (
            <div className="workflow-reception">
              <span><strong>受付待ち {pendingCount}件</strong>　受付内容を確認してください。</span>
              <button type="button" className="text-link" onClick={onOpenRecords}>
                受付を確認<ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="task-kanban">
            <KanbanColumn title="薬剤師確認・服薬指導" count={reviewTasks.length} tone="amber">
              {reviewTasks.map(renderTask)}
              {reviewTasks.length === 0 && <EmptyState text="現在、確認待ちの患者はいません。" />}
            </KanbanColumn>
            <KanbanColumn title="調剤中・処方入力済み" count={standardTasks.length} tone="neutral">
              {standardTasks.map(renderTask)}
              {standardTasks.length === 0 && <EmptyState text="現在、該当する患者はいません。" />}
            </KanbanColumn>
          </div>
        </>
      )}
    </section>
  );
}
