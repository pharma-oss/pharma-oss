import { test } from 'node:test';
import assert from 'node:assert';
import type { Visit } from '../db/types.ts';
import { buildOperationalKpis } from './operational_kpi.ts';

const basisDate = new Date('2026-06-15T12:00:00+09:00');

function visit(partial: Partial<Visit> & Pick<Visit, 'visitId' | 'issueDate' | 'status'>): Visit {
  return {
    patientId: `pt_${partial.visitId}`,
    ...partial
  };
}

test('buildOperationalKpis summarizes daily completion and closing blockers', () => {
  const kpis = buildOperationalKpis({
    basisDate,
    visits: [
      visit({
        visitId: 'visit_1',
        issueDate: '2026-06-15T09:00:00+09:00',
        status: 'completed',
        claimLifecycle: { status: 'closed', closedAt: '2026-06-15T11:00:00+09:00' }
      }),
      visit({
        visitId: 'visit_2',
        issueDate: '2026-06-15T10:00:00+09:00',
        status: 'processing',
        claimLifecycle: { status: 'returned', returnedAt: '2026-06-15T10:30:00+09:00' }
      }),
      visit({
        visitId: 'visit_3',
        issueDate: '2026-05-14T10:00:00+09:00',
        status: 'completed',
        claimLifecycle: { status: 'closed', closedAt: '2026-05-14T11:00:00+09:00' }
      })
    ],
    soapRecords: [
      { visitId: 'visit_1', updatedAt: '2026-06-15T09:42:00+09:00' },
      { visitId: 'visit_1', updatedAt: '2026-06-15T09:45:00+09:00' }
    ],
    counts: {
      todayReceptionCount: 2,
      waitingCount: 0,
      processingCount: 1,
      reviewCount: 1,
      pickingPendingCount: 1,
      inventoryShortageCount: 1,
      urgentClaimRiskCount: 1,
      returnedClaimCount: 1,
      rebillingClaimCount: 0,
      urgentFollowUpCount: 1
    }
  });

  assert.strictEqual(kpis.daily.receptionCount, 2);
  assert.strictEqual(kpis.daily.completedCount, 1);
  assert.strictEqual(kpis.daily.completionRate, 50);
  assert.strictEqual(kpis.daily.averageCompletionMinutes, 45);
  assert.strictEqual(kpis.daily.averageCompletionLabel, '45分');
  assert.strictEqual(kpis.daily.closingBlockerCount, 7);
  assert.strictEqual(kpis.daily.closingStatus, 'blocked');
  assert.strictEqual(kpis.monthly.claimTargetCount, 2);
  assert.strictEqual(kpis.monthly.closedClaimCount, 1);
  assert.strictEqual(kpis.monthly.closedClaimRateLabel, '50%');
  assert.strictEqual(kpis.monthly.openClaimCount, 1);
});

test('buildOperationalKpis reports clear day when there are no open queues', () => {
  const kpis = buildOperationalKpis({
    basisDate,
    visits: [
      visit({
        visitId: 'visit_1',
        issueDate: '2026-06-15T09:00:00+09:00',
        status: 'completed',
        claimLifecycle: { status: 'closed', closedAt: '2026-06-15T10:00:00+09:00' }
      })
    ],
    soapRecords: [],
    counts: {
      todayReceptionCount: 1,
      waitingCount: 0,
      processingCount: 0,
      reviewCount: 0,
      pickingPendingCount: 0,
      inventoryShortageCount: 0,
      urgentClaimRiskCount: 0,
      returnedClaimCount: 0,
      rebillingClaimCount: 0,
      urgentFollowUpCount: 0
    }
  });

  assert.strictEqual(kpis.daily.completionRateLabel, '100%');
  assert.strictEqual(kpis.daily.averageCompletionLabel, '算出待ち');
  assert.strictEqual(kpis.daily.closingBlockerCount, 0);
  assert.strictEqual(kpis.daily.closingStatus, 'clear');
  assert.strictEqual(kpis.daily.closingStatusLabel, '主要キュー0件');
  assert.strictEqual(kpis.monthly.closedClaimRate, 100);
});
