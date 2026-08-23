'use client';

import {
  AlertCircle,
  ArrowRight,
  Barcode,
  CheckCircle2,
  Clock,
  FileCheck2,
  FilePlus2,
  HeartPulse,
  PackageSearch,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Users
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DailyClosingWizardModal } from '@/components/dashboard/DailyClosingWizardModal';
import { FollowUpModal } from '@/components/dashboard/FollowUpModal';
import { ClaimWorkbenchSection } from '@/components/dashboard/ClaimWorkbenchSection';
import { OperationalClosingSection } from '@/components/dashboard/OperationalClosingSection';
import { InventoryAlertSection } from '@/components/dashboard/InventoryAlertSection';
import { useDatabase } from '@/db/DatabaseProvider';
import type { AuditLog, FacilitySettings } from '@/db/types';
import {
  useDashboardTasks,
  type DashboardFollowUpCandidate
} from '@/hooks/useDashboardTasks';
import { DEFAULT_BACKUP_SCHEDULE_POLICY, type BackupSchedulePolicy } from '@/lib/backup';
import { readBackupSchedulePolicy } from '@/lib/backup_schedule_storage';
import {
  buildOperationalAiPredictions,
  summarizeOperationalAiPredictions,
  type OperationalAiPrediction
} from '@/lib/operational_ai_prediction';
import {
  AI_ASSIST_MODE_LABELS,
  filterAiAssistItemsByMode,
  normalizeAiAssistMode
} from '@/lib/ai_assist_policy';
import {
  KanbanColumn,
  EmptyState,
  OperationTile,
  StatCard
} from '@/components/dashboard/DashboardCards';
import {
  AiPredictionRow,
  PatientTaskCard,
  FollowUpCandidateRow,
  ClaimRiskRow
} from '@/components/dashboard/DashboardRows';

export default function Dashboard() {
  const router = useRouter();
  const db = useDatabase();
  const {
    tasks,
    counts,
    kpis,
    inventoryRisks,
    claimRisks,
    claimWorkItems,
    followUpCandidates,
    completeFollowUpCandidate,
    recordFollowUpCandidate,
    hasDemoData,
    refresh,
    isLoading,
    error
  } = useDashboardTasks();

  const [recordingFollowUp, setRecordingFollowUp] = useState<DashboardFollowUpCandidate | null>(null);
  const [isClosingWizardOpen, setIsClosingWizardOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [facilitySettings, setFacilitySettings] = useState<FacilitySettings | null>(null);
  const [backupSchedulePolicy, setBackupSchedulePolicy] = useState<BackupSchedulePolicy>(DEFAULT_BACKUP_SCHEDULE_POLICY);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    db.audit_logs.find({ sort: [{ timestamp: 'desc' }] }).exec()
      .then((logs) => {
        if (!cancelled) {
          setAuditLogs(logs.map((log) => log.toJSON()));
        }
      })
      .catch((err) => console.error('Failed to load dashboard audit logs:', err));

    db.facility_settings.findOne('default').exec()
      .then((settings) => {
        if (!cancelled && settings) {
          setFacilitySettings(settings.toJSON());
        }
      })
      .catch((err) => console.error('Failed to load dashboard facility settings:', err));

    setBackupSchedulePolicy(readBackupSchedulePolicy());

    return () => {
      cancelled = true;
    };
  }, [db]);

  const aiAssistMode = normalizeAiAssistMode(facilitySettings?.aiAssistMode);
  const allOperationalAiPredictions = useMemo(() => {
    return buildOperationalAiPredictions({
      claimRisks,
      inventoryRisks,
      followUpCandidates
    });
  }, [claimRisks, inventoryRisks, followUpCandidates]);

  const operationalAiPredictions = useMemo(() => {
    return filterAiAssistItemsByMode(allOperationalAiPredictions, aiAssistMode);
  }, [allOperationalAiPredictions, aiAssistMode]);

  const operationalAiPredictionSummary = useMemo(() => {
    return summarizeOperationalAiPredictions(operationalAiPredictions);
  }, [operationalAiPredictions]);

  const standardTasks = tasks.filter((task) => task.priority === 'normal');
  const reviewTasks = tasks.filter((task) => task.priority !== 'normal');
  const visibleClaimRisks = claimRisks.slice(0, 5);
  const visibleFollowUpCandidates = followUpCandidates.slice(0, 5);
  const visibleOperationalAiPredictions = operationalAiPredictions.slice(0, 5);

  const pendingCount = counts.waitingCount;
  const reviewCount = counts.reviewCount;
  const completedCount = counts.completedCount;
  const urgentClaimRiskCount = claimRisks.filter((risk) => risk.priority === 'high').length;
  const urgentClaimWorkCount = claimWorkItems.filter((item) => item.priority === 'high').length;
  const urgentInventoryRiskCount = inventoryRisks.filter((risk) => risk.priority === 'high').length;
  const urgentFollowUpCount = followUpCandidates.filter((candidate) => candidate.priority === 'high').length;

  const handleCleanupDemoData = useCallback(async () => {
    if (!db) return;
    if (!window.confirm('チュートリアル用のデモデータを削除しますか？\n実運用データは保持されます。')) {
      return;
    }
    try {
      const { cleanupTutorialDemoData } = await import('@/lib/demo_data');
      await cleanupTutorialDemoData(db);
      toast.success('デモデータを片づけました。');
      refresh();
    } catch (err) {
      console.error('Failed to cleanup demo data:', err);
      toast.error('デモデータの削除に失敗しました。');
    }
  }, [db, refresh]);

  const handleOpenTask = useCallback((visitId: string) => {
    router.push(`/print/${visitId}`);
  }, [router]);

  const handleOpenFollowUp = useCallback((visitId: string) => {
    router.push(`/emr?visitId=${encodeURIComponent(visitId)}`);
  }, [router]);

  const handleNewReception = useCallback(() => {
    router.push('/emr?newReception=1');
  }, [router]);

  const handleFocusClaimRisks = useCallback(() => {
    document.getElementById('claim-risk-queue')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleFocusClaimWorkbench = useCallback(() => {
    document.getElementById('claim-workbench')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleFocusInventoryRisks = useCallback(() => {
    document.getElementById('inventory-risk-queue')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleFocusFollowUps = useCallback(() => {
    document.getElementById('followup-candidates')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleOpenAiPrediction = useCallback((prediction: OperationalAiPrediction) => {
    if (prediction.domain === 'claim_return') {
      if (prediction.targetId) handleOpenTask(prediction.targetId);
      return;
    }
    if (prediction.domain === 'inventory_shortage') {
      router.push('/inventory?tab=order-workbench');
      return;
    }
    if (prediction.domain === 'follow_up' && prediction.targetId) {
      handleOpenFollowUp(prediction.targetId);
      return;
    }
    if (prediction.targetId) {
      handleOpenTask(prediction.targetId);
    }
  }, [handleOpenFollowUp, handleOpenTask, router]);

  return (
    <div className="dashboard-container">
      <header className="page-header dashboard-header">
        <div>
          <h1>調剤・監査ダッシュボード</h1>
          <p className="text-muted">本日の受付状況と業務タスクをリアルタイムに把握します。</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary"
            onClick={() => setIsClosingWizardOpen(true)}
            data-testid="daily-closing-wizard-button"
          >
            <ShieldCheck size={16} aria-hidden="true" />
            <span>日次締めウィザード</span>
          </button>
          <button className="btn-primary" onClick={handleNewReception}>
            <Plus size={16} aria-hidden="true" />
            <span>新規受付</span>
          </button>
        </div>
      </header>

      {hasDemoData && (
        <div className="notice info flex items-center justify-between" role="status" data-testid="demo-data-reminder">
          <span>デモデータが読み込まれています。チュートリアル終了後に設定画面または直接片づけることができます。</span>
          <div className="flex gap-2">
            <button className="btn-secondary compact" onClick={handleCleanupDemoData} data-testid="demo-data-cleanup-button">
              デモデータを片づける
            </button>
            <button className="btn-secondary compact" onClick={() => router.push('/settings')}>
              設定を開く
            </button>
          </div>
        </div>
      )}

      <section className="stats-grid" aria-label="本日の状況">
        <StatCard icon={Users} tone="blue" label="本日受付" value={counts.todayReceptionCount} subLabel="ローカルDB集計" />
        <StatCard icon={Clock} tone="amber" label="受付待ち" value={pendingCount} subLabel="未処理の受付" />
        <StatCard icon={AlertCircle} tone="red" label="要確認" value={reviewCount} subLabel="薬剤師確認" />
        <StatCard icon={CheckCircle2} tone="green" label="完了" value={completedCount} subLabel="薬歴入力済み" />
      </section>

      <OperationalClosingSection
        db={db}
        kpis={kpis}
        counts={counts}
        claimRisks={claimRisks}
        inventoryRisks={inventoryRisks}
        claimWorkItems={claimWorkItems}
        followUpCandidates={followUpCandidates}
        auditLogs={auditLogs}
        facilitySettings={facilitySettings}
        backupSchedulePolicy={backupSchedulePolicy}
        onRefresh={refresh}
      />

      <section className="operations-grid" aria-label="運用キュー">
        <OperationTile
          icon={FileCheck2}
          label="電子処方箋・QR"
          value={pendingCount}
          subLabel="受付待ち"
          tone="blue"
          onClick={handleNewReception}
        />
        <OperationTile
          icon={Barcode}
          label="GS1監査"
          value={counts.pickingPendingCount}
          subLabel="未照合"
          tone={counts.pickingPendingCount > 0 ? 'amber' : 'green'}
          onClick={() => router.push('/emr?openPicking=1')}
        />
        <OperationTile
          icon={AlertCircle}
          label="請求リスク"
          value={counts.claimRiskCount}
          subLabel={urgentClaimRiskCount > 0 ? `要修正 ${urgentClaimRiskCount}` : '返戻予防'}
          tone={urgentClaimRiskCount > 0 ? 'red' : counts.claimRiskCount > 0 ? 'amber' : 'green'}
          onClick={counts.claimRiskCount > 0 ? handleFocusClaimRisks : () => router.push('/settings')}
        />
        <OperationTile
          icon={FileCheck2}
          label="月次請求"
          value={counts.claimWorkbenchCount}
          subLabel={urgentClaimWorkCount > 0 ? `返戻 ${urgentClaimWorkCount}` : counts.rebillingClaimCount > 0 ? `再請求 ${counts.rebillingClaimCount}` : '未締め確認'}
          tone={urgentClaimWorkCount > 0 ? 'red' : counts.rebillingClaimCount > 0 ? 'amber' : counts.claimWorkbenchCount > 0 ? 'blue' : 'green'}
          onClick={counts.claimWorkbenchCount > 0 ? handleFocusClaimWorkbench : handleFocusClaimRisks}
        />
        <OperationTile
          icon={PackageSearch}
          label="在庫注意"
          value={counts.inventoryShortageCount}
          subLabel={urgentInventoryRiskCount > 0 ? `至急 ${urgentInventoryRiskCount}` : '不足候補'}
          tone={counts.inventoryShortageCount > 0 ? 'red' : 'green'}
          onClick={counts.inventoryShortageCount > 0 ? handleFocusInventoryRisks : () => router.push('/inventory')}
        />
        <OperationTile
          icon={HeartPulse}
          label="服薬フォロー"
          value={counts.followUpDueCount}
          subLabel={urgentFollowUpCount > 0 ? `本日対応 ${urgentFollowUpCount}` : '候補'}
          tone={urgentFollowUpCount > 0 ? 'red' : 'teal'}
          onClick={handleFocusFollowUps}
        />
      </section>

      <section id="operational-ai-predictions" className="ai-prediction-section" aria-label="AI補助予測スコア">
        <div className="section-header">
          <div>
            <span className="ai-prediction-title-line">
              <Sparkles size={16} aria-hidden="true" />
              <h3>AI補助予測スコア</h3>
            </span>
            <p className="text-muted">返戻、在庫欠品、服薬フォローを横断し、優先して確認したい候補を根拠付きで表示します。</p>
          </div>
          <div className="section-metrics">
            <span className="section-count">{AI_ASSIST_MODE_LABELS[aiAssistMode]}</span>
            {operationalAiPredictionSummary.criticalCount > 0 && (
              <span className="section-count urgent">高リスク {operationalAiPredictionSummary.criticalCount}</span>
            )}
            <span className="section-count">最高 {operationalAiPredictionSummary.maxScore}</span>
            <span className="section-count">信頼度 {operationalAiPredictionSummary.averageConfidence}%</span>
            <span className="section-count">{operationalAiPredictionSummary.totalCount}件</span>
          </div>
        </div>

        <div className="ai-prediction-list">
          {isLoading && <EmptyState text="AI補助予測を読み込んでいます..." tone="loading" />}
          {!isLoading && allOperationalAiPredictions.length > operationalAiPredictions.length && (
            <div className="ai-prediction-mode-notice" role="status" data-testid="operational-ai-mode-notice">
              AI補助は「{AI_ASSIST_MODE_LABELS[aiAssistMode]}」です。
              {aiAssistMode === 'disabled'
                ? '候補表示を停止しています。通常の業務キューは継続します。'
                : `高リスク以外の候補 ${allOperationalAiPredictions.length - operationalAiPredictions.length}件を非表示にしています。`}
            </div>
          )}
          {!isLoading && visibleOperationalAiPredictions.map((prediction) => (
            <AiPredictionRow
              key={prediction.predictionId}
              prediction={prediction}
              onOpen={() => handleOpenAiPrediction(prediction)}
            />
          ))}
          {!isLoading && allOperationalAiPredictions.length === 0 && <EmptyState text="現在、優先確認が必要なAI補助予測はありません。" />}
        </div>

        {!isLoading && visibleOperationalAiPredictions.length > 0 && (
          <p className="ai-prediction-guardrail">{visibleOperationalAiPredictions[0].guardrail}</p>
        )}
      </section>

      <section id="claim-risk-queue" className="claim-risk-section" aria-label="返戻・請求リスク" data-testid="claim-risk-queue">
        <div className="section-header">
          <div>
            <span className="section-title-line">
              <AlertCircle size={16} aria-hidden="true" />
              <h3>返戻・請求リスク</h3>
            </span>
            <p className="text-muted">印刷・UKE出力前の請求チェックを横断し、保険情報・薬品マスタ・算定設定の修正候補を先に出します。</p>
          </div>
          <div className="section-metrics">
            {urgentClaimRiskCount > 0 && <span className="section-count urgent">要修正 {urgentClaimRiskCount}</span>}
            <span className="section-count">{counts.claimRiskCount}件</span>
          </div>
        </div>

        <div className="claim-risk-list">
          {isLoading && <EmptyState text="請求リスクを読み込んでいます..." tone="loading" />}
          {!isLoading && visibleClaimRisks.map((risk) => (
            <ClaimRiskRow
              key={risk.visitId}
              name={risk.name}
              time={risk.time}
              prescriptionCount={risk.prescriptionCount}
              totalPoints={risk.totalPoints}
              errorCount={risk.errorCount}
              warningCount={risk.warningCount}
              priority={risk.priority}
              riskScore={risk.riskScore}
              topIssueTitles={risk.topIssueTitles}
              actionLabel={risk.actionLabel}
              onOpen={() => handleOpenTask(risk.visitId)}
            />
          ))}
          {!isLoading && visibleClaimRisks.length === 0 && <EmptyState text="現在、請求・返戻リスクはありません。" />}
        </div>
      </section>

      <ClaimWorkbenchSection
        db={db}
        claimWorkItems={claimWorkItems}
        counts={counts}
        isLoading={isLoading}
        onOpenTask={handleOpenTask}
        onRefresh={refresh}
      />

      <InventoryAlertSection
        inventoryRisks={inventoryRisks}
        counts={counts}
        isLoading={isLoading}
      />

      <section className="workflow-section">
        <div className="section-header">
          <div>
            <h3>進行中のタスク</h3>
            <p className="text-muted">カードを開くと薬剤師確認・印刷画面へ移動します。</p>
          </div>
          <button className="text-link" type="button">
            すべて表示
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div className="notice danger" role="alert">
            タスクの読み込みに失敗しました。画面を再読み込みしてください。
          </div>
        )}

        <div className="task-kanban">
          <KanbanColumn title="受付待ち" count={pendingCount} tone="neutral">
            {pendingCount === 0 && <EmptyState text="現在、受付待ちのタスクはありません。" />}
          </KanbanColumn>

          <KanbanColumn title="調剤中・処方入力済み" count={standardTasks.length} tone="amber">
            {isLoading && <EmptyState text="タスクを読み込んでいます..." tone="loading" />}
            {!isLoading && standardTasks.map((task) => (
              <PatientTaskCard
                key={task.visitId}
                visitId={task.visitId}
                name={task.name}
                age={task.age}
                status={task.status}
                time={task.time}
                waitMinutes={task.waitMinutes}
                prescriptionCount={task.prescriptionCount}
                reviewFlags={task.reviewFlags}
                priority={task.priority}
                onOpen={() => handleOpenTask(task.visitId)}
                interactive
              />
            ))}
            {!isLoading && standardTasks.length === 0 && <EmptyState text="現在、該当するタスクはありません。" />}
          </KanbanColumn>

          <KanbanColumn title="薬剤師確認・服薬指導" count={reviewTasks.length} tone="green">
            {isLoading && <EmptyState text="タスクを読み込んでいます..." tone="loading" />}
            {!isLoading && reviewTasks.map((task) => (
              <PatientTaskCard
                key={task.visitId}
                visitId={task.visitId}
                name={task.name}
                age={task.age}
                status={task.status}
                time={task.time}
                waitMinutes={task.waitMinutes}
                prescriptionCount={task.prescriptionCount}
                reviewFlags={task.reviewFlags}
                priority={task.priority}
                onOpen={() => handleOpenTask(task.visitId)}
                interactive
              />
            ))}
            {!isLoading && reviewTasks.length === 0 && <EmptyState text="現在、監査待ちのタスクはありません。" />}
          </KanbanColumn>
        </div>
      </section>

      <section id="followup-candidates" className="followup-section" aria-label="完了後フォロー候補">
        <div className="section-header">
          <div>
            <span className="section-title-line">
              <HeartPulse size={16} aria-hidden="true" />
              <h3>完了後フォロー候補</h3>
            </span>
            <p className="text-muted">重点フォロー薬・長期処方・患者アラート・疑義照会を拾い、次回確認日を提案します。</p>
          </div>
          <div className="section-metrics">
            {urgentFollowUpCount > 0 && <span className="section-count urgent">本日対応 {urgentFollowUpCount}</span>}
            <span className="section-count">{counts.followUpDueCount}件</span>
          </div>
        </div>

        <div className="followup-list">
          {isLoading && <EmptyState text="フォロー候補を読み込んでいます..." tone="loading" />}
          {!isLoading && visibleFollowUpCandidates.map((candidate) => (
            <FollowUpCandidateRow
              key={candidate.visitId}
              name={candidate.name}
              time={candidate.time}
              prescriptionCount={candidate.prescriptionCount}
              reasonFlags={candidate.reasonFlags}
              priority={candidate.priority}
              dueLabel={candidate.dueLabel}
              suggestedAction={candidate.suggestedAction}
              riskScore={candidate.riskScore}
              attemptCount={candidate.attemptCount}
              lastContactLabel={candidate.lastContactLabel}
              isOverdue={candidate.isOverdue}
              onOpen={() => handleOpenFollowUp(candidate.visitId)}
              onComplete={() => setRecordingFollowUp(candidate)}
              isCompleting={false}
            />
          ))}
          {!isLoading && visibleFollowUpCandidates.length === 0 && <EmptyState text="本日のフォロー候補はありません。" />}
        </div>
      </section>

      <section className="quick-actions" aria-label="よく使う操作">
        <button type="button" className="quick-action" onClick={() => router.push('/ocr')}>
          <FilePlus2 size={20} aria-hidden="true" />
          <span>処方箋を読み込む</span>
        </button>
        <button type="button" className="quick-action" onClick={() => router.push('/inventory')}>
          <PackageSearch size={20} aria-hidden="true" />
          <span>在庫を確認</span>
        </button>
        <button type="button" className="quick-action" onClick={() => router.push('/settings')}>
          <Settings size={20} aria-hidden="true" />
          <span>施設設定</span>
        </button>
        <button type="button" className="quick-action muted">
          <ShieldCheck size={20} aria-hidden="true" />
          <span>ローカル保存中</span>
        </button>
      </section>

      {recordingFollowUp && (
        <FollowUpModal
          candidate={recordingFollowUp}
          onClose={() => setRecordingFollowUp(null)}
          onRecord={recordFollowUpCandidate}
        />
      )}

      <DailyClosingWizardModal
        isOpen={isClosingWizardOpen}
        onClose={() => setIsClosingWizardOpen(false)}
        onComplete={() => {
          toast.success('日次締めが正常に記録されました。');
          refresh();
        }}
      />
    </div>
  );
}
