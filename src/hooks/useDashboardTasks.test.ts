import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_COUNTS,
  FOLLOW_UP_METHOD_LABELS,
  FOLLOW_UP_OUTCOME_LABELS,
  buildFollowUpRecordPayload,
  classifyDashboardVisits
} from '@/lib/dashboard_tasks';
import { useDashboardTasks } from './useDashboardTasks';

describe('useDashboardTasks hook contracts and types', () => {
  it('exports valid empty default counts', () => {
    assert.equal(EMPTY_COUNTS.todayReceptionCount, 0);
    assert.equal(EMPTY_COUNTS.waitingCount, 0);
    assert.equal(EMPTY_COUNTS.processingCount, 0);
    assert.equal(EMPTY_COUNTS.reviewCount, 0);
    assert.equal(EMPTY_COUNTS.completedCount, 0);
    assert.equal(EMPTY_COUNTS.pickingPendingCount, 0);
    assert.equal(EMPTY_COUNTS.inventoryShortageCount, 0);
    assert.equal(EMPTY_COUNTS.claimRiskCount, 0);
    assert.equal(EMPTY_COUNTS.urgentClaimRiskCount, 0);
    assert.equal(EMPTY_COUNTS.claimWorkbenchCount, 0);
    assert.equal(EMPTY_COUNTS.returnedClaimCount, 0);
    assert.equal(EMPTY_COUNTS.rebillingClaimCount, 0);
    assert.equal(EMPTY_COUNTS.followUpDueCount, 0);
    assert.equal(EMPTY_COUNTS.urgentFollowUpCount, 0);
  });

  it('exports valid follow up method and outcome labels', () => {
    assert.equal(FOLLOW_UP_METHOD_LABELS.phone, '電話');
    assert.equal(FOLLOW_UP_METHOD_LABELS.sms, 'SMS/メッセージ');
    assert.equal(FOLLOW_UP_METHOD_LABELS.visit, '来局時');
    assert.equal(FOLLOW_UP_METHOD_LABELS.other, 'その他');

    assert.equal(FOLLOW_UP_OUTCOME_LABELS.completed, '対応済み');
    assert.equal(FOLLOW_UP_OUTCOME_LABELS.no_answer, '不在/未応答');
    assert.equal(FOLLOW_UP_OUTCOME_LABELS.rescheduled, '次回確認へ継続');
    assert.equal(FOLLOW_UP_OUTCOME_LABELS.dismissed, '対象外');
  });

  it('builds rollback-safe follow-up payload through pure helper', () => {
    const candidate: any = {
      visitId: 'v1',
      patientId: 'p1',
      name: '患者A',
      reasonFlags: ['高齢者ハイリスク薬'],
      suggestedAction: '確認',
      dueDate: '2026-08-30',
      riskScore: 30
    };
    const input: any = {
      contactMethod: 'phone',
      outcome: 'completed',
      completedNote: '確認完了',
      nextAction: '次回確認',
      dueDate: '2026-09-01'
    };
    const previousVisit: any = { visitId: 'v1' };

    const { payload, nextStatus } = buildFollowUpRecordPayload({
      candidate,
      input,
      currentUserName: '薬剤師A',
      previousVisit,
      nowIso: '2026-08-23T12:00:00Z'
    });

    assert.equal(nextStatus, 'completed');
    assert.equal(payload.status, 'completed');
    assert.equal(payload.completedBy, '薬剤師A');
  });

  it('classifies visits and guarantees demo visits are excluded from monthly claims', () => {
    const basisDate = new Date('2026-08-23T12:00:00');
    const allVisits = [
      { visitId: 'v_normal', patientId: 'p_real_1', status: 'completed', issueDate: '2026-08-23T10:00:00', claimLifecycle: { status: 'exported', exportedAt: '2026-08-23T10:00:00' } },
      { visitId: 'v_demo', patientId: 'pt_demo_tutorial', status: 'completed', issueDate: '2026-08-23T10:00:00', claimLifecycle: { status: 'exported', exportedAt: '2026-08-23T10:00:00' } }
    ];

    const result = classifyDashboardVisits({ allVisits, basisDate });
    const claimIds = result.monthlyClaimVisits.map((v: any) => v.visitId);

    assert.ok(claimIds.includes('v_normal'));
    assert.ok(!claimIds.includes('v_demo'), 'Demo visit must never enter monthly claim workbench');
  });

  it('exports useDashboardTasks function', () => {
    assert.equal(typeof useDashboardTasks, 'function');
  });
});
