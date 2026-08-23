import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePatientAge,
  isSameLocalDate,
  isBeforeLocalDate,
  formatDateInput,
  addLocalDays,
  parseDateForSort,
  buildFollowUpSuggestion,
  formatFollowUpContactLabel,
  calculateDashboardInventoryRisks,
  calculateDashboardClaimRisks,
  calculateDashboardClaimWorkItems,
  calculateDashboardFollowUpCandidates,
  calculateDashboardProcessingTasks,
  buildFollowUpRecordPayload,
  classifyDashboardVisits,
  aggregatePrescriptionItemRequirements,
  calculateDashboardStockShortages,
  EMPTY_COUNTS
} from './dashboard_tasks';

describe('dashboard_tasks pure functions', () => {
  describe('calculatePatientAge', () => {
    it('calculates age correctly from birthDate string', () => {
      const basisDate = new Date('2026-08-23T12:00:00Z');
      assert.equal(calculatePatientAge('1990-05-15', basisDate), '36');
      assert.equal(calculatePatientAge('1990-09-01', basisDate), '35');
      assert.equal(calculatePatientAge('2026-08-23', basisDate), '0');
      assert.equal(calculatePatientAge(undefined, basisDate), '不明');
      assert.equal(calculatePatientAge('invalid-date', basisDate), '不明');
    });
  });

  describe('isSameLocalDate and isBeforeLocalDate', () => {
    it('compares local dates properly', () => {
      const today = new Date('2026-08-23T12:00:00');
      assert.equal(isSameLocalDate('2026-08-23T09:30:00', today), true);
      assert.equal(isSameLocalDate('2026-08-22T23:59:59', today), false);

      assert.equal(isBeforeLocalDate('2026-08-22', today), true);
      assert.equal(isBeforeLocalDate('2026-08-23', today), false);
      assert.equal(isBeforeLocalDate('2026-08-24', today), false);
    });
  });

  describe('date helper functions (formatDateInput, addLocalDays, parseDateForSort)', () => {
    it('formats date to YYYY-MM-DD correctly', () => {
      const date = new Date('2026-08-23T05:30:00');
      assert.equal(formatDateInput(date), '2026-08-23');
    });

    it('adds local days accurately', () => {
      const base = new Date('2026-08-23T10:00:00');
      const added = addLocalDays(base, 7);
      assert.equal(formatDateInput(added), '2026-08-30');

      const monthEnd = new Date('2026-08-31T10:00:00');
      const nextMonth = addLocalDays(monthEnd, 1);
      assert.equal(formatDateInput(nextMonth), '2026-09-01');
    });

    it('parses dates for sort order with fallback', () => {
      assert.ok(parseDateForSort('2026-08-23T10:00:00') > 0);
      assert.equal(parseDateForSort(undefined), 0);
      assert.equal(parseDateForSort('invalid'), 0);
    });
  });

  describe('buildFollowUpSuggestion', () => {
    it('returns urgent suggestion for patient alert', () => {
      const suggestion = buildFollowUpSuggestion({
        hasFollowUpMedicationRisk: false,
        hasLongTermPrescription: false,
        hasIntervention: false,
        hasPatientAlert: true,
        issueDate: new Date('2026-08-23T10:00:00')
      });
      assert.equal(suggestion.priority, 'high');
      assert.equal(suggestion.dueLabel, '本日対応');
      assert.ok(suggestion.riskScore >= 30);
    });

    it('returns routine 7-day suggestion for regular prescription', () => {
      const suggestion = buildFollowUpSuggestion({
        hasFollowUpMedicationRisk: false,
        hasLongTermPrescription: false,
        hasIntervention: false,
        hasPatientAlert: false,
        issueDate: new Date('2026-08-23T10:00:00')
      });
      assert.equal(suggestion.priority, 'medium');
      assert.equal(suggestion.dueLabel, '7日以内');
      assert.equal(suggestion.riskScore, 0);
    });
  });

  describe('formatFollowUpContactLabel', () => {
    it('formats attempt label correctly', () => {
      const label = formatFollowUpContactLabel({
        at: '2026-08-23T14:30:00',
        by: '薬剤師A',
        method: 'phone',
        outcome: 'completed',
        note: '体調良好',
        dueDate: '2026-08-30'
      });
      assert.ok(label.includes('電話'));
      assert.ok(label.includes('対応済み'));
      assert.ok(label.includes('8/23'));
    });
  });

  describe('classifyDashboardVisits', () => {
    it('correctly classifies waiting, processing, completed and monthly claim visits, excluding tutorial demo visits', () => {
      const basisDate = new Date('2026-08-23T12:00:00');
      const allVisits = [
        { visitId: 'v_wait', status: 'waiting', issueDate: '2026-08-23T09:00:00' },
        { visitId: 'v_proc', status: 'processing', issueDate: '2026-08-23T09:30:00' },
        { visitId: 'v_comp_today', status: 'completed', issueDate: '2026-08-23T10:00:00', claimLifecycle: { status: 'exported', exportedAt: '2026-08-23T10:00:00' } },
        { visitId: 'v_past_returned', status: 'completed', issueDate: '2026-08-01T10:00:00', claimLifecycle: { status: 'returned' } },
        { visitId: 'v_demo', isDemo: true, status: 'completed', issueDate: '2026-08-23T11:00:00', claimLifecycle: { status: 'unexported' } },
        { visitId: 'v_other_day', status: 'waiting', issueDate: '2026-08-20T10:00:00' }
      ];

      const result = classifyDashboardVisits({ allVisits, basisDate });

      assert.equal(result.todayReceptionCount, 4); // v_wait, v_proc, v_comp_today, v_demo
      assert.equal(result.waitingCount, 1);
      assert.equal(result.completedCount, 2); // v_comp_today, v_demo
      assert.equal(result.processingVisits.length, 1);
      assert.equal(result.processingVisits[0].visitId, 'v_proc');
      assert.equal(result.activeVisits.length, 2); // v_wait, v_proc

      // 念のための防御: デモ受付 (v_demo) は月次請求対象に絶対に含めない
      const monthlyIds = result.monthlyClaimVisits.map((v: any) => v.visitId);
      assert.ok(monthlyIds.includes('v_comp_today'));
      assert.ok(monthlyIds.includes('v_past_returned'));
      assert.ok(!monthlyIds.includes('v_demo'), 'Tutorial demo visits must never be included in monthlyClaimVisits');
    });
  });

  describe('aggregatePrescriptionItemRequirements', () => {
    it('aggregates required stock, shortages, and picking pending counts from prescription items', () => {
      const activeVisitIdSet = new Set(['v_proc', 'v_wait']);
      const processingVisitIds = new Set(['v_proc']);
      const prescriptionItems = [
        {
          visitId: 'v_proc',
          drugId: 'drug_A',
          dispensedDrugCode: 'drug_A_generic',
          amount: 2,
          days: 14,
          shortageQuantity: 10,
          isPicked: false,
          isDiagnosticTest: false
        },
        {
          visitId: 'v_wait',
          drugId: 'drug_B',
          amount: 1,
          days: 30,
          isPicked: true,
          isDiagnosticTest: false
        },
        {
          visitId: 'v_completed',
          drugId: 'drug_A',
          amount: 1,
          days: 7,
          isPicked: true
        }
      ];

      const result = aggregatePrescriptionItemRequirements({
        prescriptionItems,
        activeVisitIdSet,
        processingVisitIds
      });

      assert.equal(result.itemsByVisitId.get('v_proc')?.length, 1);
      assert.equal(result.itemsByVisitId.get('v_wait')?.length, 1);
      assert.equal(result.itemsByVisitId.get('v_completed')?.length, 1);

      // drug_A_generic: 2 * 14 = 28
      assert.equal(result.requiredByStockDrugId.get('drug_A_generic'), 28);
      // drug_B: 1 * 30 = 30
      assert.equal(result.requiredByStockDrugId.get('drug_B'), 30);

      // pickingShortage
      assert.equal(result.pickingShortageByStockDrugId.get('drug_A_generic'), 10);

      // pickingPendingCount (only v_proc is processing and not picked)
      assert.equal(result.pickingPendingCount, 1);
    });
  });

  describe('calculateDashboardStockShortages', () => {
    it('computes shortages based on stock lots and picking shortages', () => {
      const requiredByStockDrugId = new Map([
        ['drug_1', 100], // available 30 -> shortage 70
        ['drug_2', 50]   // available 100 -> ok
      ]);
      const pickingShortageByStockDrugId = new Map([
        ['drug_3', 15] // reported picking shortage 15
      ]);
      const drugMap = new Map([
        ['drug_1', { code: 'drug_1', name: '薬品1', stockQuantity: 30 }],
        ['drug_2', { code: 'drug_2', name: '薬品2', stockQuantity: 100 }],
        ['drug_3', { code: 'drug_3', name: '薬品3', stockQuantity: 50 }]
      ]);
      const stocksByDrugId = new Map([
        ['drug_1', [{ drugCode: 'drug_1', quantity: 30 }]],
        ['drug_2', [{ drugCode: 'drug_2', quantity: 100 }]]
      ]);

      const result = calculateDashboardStockShortages({
        requiredByStockDrugId,
        pickingShortageByStockDrugId,
        drugMap,
        stocksByDrugId
      });

      assert.equal(result.inventoryShortageCount, 2);
      assert.ok(result.shortageDrugIds.has('drug_1'));
      assert.ok(result.shortageDrugIds.has('drug_3'));

      const data1 = result.inventoryShortageData.get('drug_1');
      assert.equal(data1?.shortageAmount, 70);

      const data3 = result.inventoryShortageData.get('drug_3');
      assert.equal(data3?.pickingShortageAmount, 15);
    });
  });

  describe('buildFollowUpRecordPayload', () => {
    it('creates follow-up payload and contactAttempt for completed outcome', () => {
      const candidate: any = {
        visitId: 'v1',
        patientId: 'p1',
        name: '山田太郎',
        reasonFlags: ['高齢者ハイリスク薬', '残薬調整'],
        suggestedAction: '7日後に電話確認',
        dueDate: '2026-08-30',
        riskScore: 40
      };
      const input = {
        contactMethod: 'phone' as const,
        outcome: 'completed' as const,
        completedNote: '体調良好を確認、服薬アドヒアランス良好',
        nextAction: '次回来局時確認',
        dueDate: '2026-09-15'
      };
      const previousVisit: any = {
        visitId: 'v1',
        followUp: {
          status: 'open',
          contactAttempts: [
            { at: '2026-08-20T10:00:00Z', by: '薬剤師B', method: 'phone', outcome: 'no_answer', note: '不在' }
          ]
        }
      };

      const result = buildFollowUpRecordPayload({
        candidate,
        input,
        currentUserName: '薬剤師A',
        previousVisit,
        nowIso: '2026-08-23T14:00:00Z'
      });

      assert.equal(result.nextStatus, 'completed');
      assert.equal(result.payload.status, 'completed');
      assert.equal(result.payload.completedBy, '薬剤師A');
      assert.equal(result.payload.completedAt, '2026-08-23T14:00:00Z');
      assert.equal(result.payload.completedNote, '体調良好を確認、服薬アドヒアランス良好');
      assert.equal(result.payload.contactAttempts.length, 2);
      assert.equal(result.contactAttempt.method, 'phone');
      assert.equal(result.contactAttempt.outcome, 'completed');
    });

    it('creates follow-up payload for open status (reschedule)', () => {
      const candidate: any = {
        visitId: 'v1',
        patientId: 'p1',
        name: '鈴木花子',
        reasonFlags: ['副作用モニタリング'],
        suggestedAction: '再架電',
        dueDate: '2026-08-24',
        riskScore: 25
      };
      const input = {
        contactMethod: 'phone' as const,
        outcome: 'no_answer' as const,
        completedNote: 'お留守番電話へ伝言',
        nextAction: '明日再架電',
        dueDate: '2026-08-24'
      };
      const previousVisit: any = { visitId: 'v1' };

      const result = buildFollowUpRecordPayload({
        candidate,
        input,
        currentUserName: '薬剤師C',
        previousVisit,
        nowIso: '2026-08-23T15:00:00Z'
      });

      assert.equal(result.nextStatus, 'open');
      assert.equal(result.payload.status, 'open');
      assert.equal(result.payload.reminderAt, '2026-08-24');
      assert.equal(result.payload.reminderReason, '明日再架電');
      assert.equal(result.payload.contactAttempts.length, 1);
    });
  });

  describe('calculateDashboardInventoryRisks', () => {
    it('sorts high priority inventory shortage first', () => {
      const inventoryShortageData = new Map([
        ['drug_1', { requiredAmount: 100, availableAmount: 20, shortageAmount: 80 }],
        ['drug_high', { requiredAmount: 50, availableAmount: 0, shortageAmount: 50 }]
      ]);
      const drugMap = new Map([
        ['drug_1', { code: 'drug_1', name: '通常薬A', location: 'A-1' }],
        ['drug_high', { code: 'drug_high', name: '麻薬B', location: 'S-1', isNarcotic: true }]
      ]);
      const stocksByDrugId = new Map();
      const requiredVisitIdsByStockDrugId = new Map([
        ['drug_1', new Set(['v1'])],
        ['drug_high', new Set(['v2'])]
      ]);
      const activeVisitById = new Map([
        ['v1', { visitId: 'v1', patientId: 'p1' }],
        ['v2', { visitId: 'v2', patientId: 'p2' }]
      ]);
      const patientMap = new Map([
        ['p1', { id: 'p1', name: '患者1' }],
        ['p2', { id: 'p2', name: '患者2' }]
      ]);

      const risks = calculateDashboardInventoryRisks({
        inventoryShortageData,
        drugMap,
        stocksByDrugId,
        requiredVisitIdsByStockDrugId,
        activeVisitById,
        patientMap
      });

      assert.equal(risks.length, 2);
      assert.equal(risks[0].drugId, 'drug_high');
      assert.equal(risks[0].priority, 'high');
      assert.deepEqual(risks[0].affectedPatientNames, ['患者2']);
    });
  });

  describe('calculateDashboardClaimWorkItems', () => {
    it('filters exported / returned / rebilling items and sets priority', () => {
      const monthlyClaimVisits = [
        {
          visitId: 'v_returned',
          patientId: 'p1',
          issueDate: '2026-08-01',
          claimLifecycle: {
            status: 'returned',
            returnedAt: '2026-08-20',
            returnReason: '保険者番号相違',
            totalPoints: 1200
          }
        },
        {
          visitId: 'v_exported',
          patientId: 'p2',
          issueDate: '2026-08-05',
          claimLifecycle: {
            status: 'exported',
            exportedAt: '2026-08-10',
            exportedFileName: 'RECEIPTC.UKE',
            totalPoints: 850
          }
        }
      ];
      const patientMap = new Map([
        ['p1', { id: 'p1', name: '佐藤花子' }],
        ['p2', { id: 'p2', name: '鈴木一郎' }]
      ]);
      const itemsByVisitId = new Map([
        ['v_returned', [{ itemId: 'item_1' }]],
        ['v_exported', [{ itemId: 'item_2' }]]
      ]);

      const { claimWorkItems, returnedClaimCount } = calculateDashboardClaimWorkItems({
        monthlyClaimVisits,
        patientMap,
        itemsByVisitId,
        basisDate: new Date('2026-08-23')
      });

      assert.equal(claimWorkItems.length, 2);
      assert.equal(returnedClaimCount, 1);
      assert.equal(claimWorkItems[0].status, 'returned');
      assert.equal(claimWorkItems[0].reason, '保険者番号相違');
    });
  });

  describe('calculateDashboardProcessingTasks', () => {
    it('creates and sorts processing tasks by priority and waitMinutes', () => {
      const processingVisits = [
        {
          visitId: 'v_urgent',
          patientId: 'p1',
          issueDate: '2026-08-23T10:00:00'
        },
        {
          visitId: 'v_normal',
          patientId: 'p2',
          issueDate: '2026-08-23T10:15:00'
        }
      ];
      const patientMap = new Map([
        ['p1', { id: 'p1', name: '山田太郎', birthDate: '1980-01-01' }],
        ['p2', { id: 'p2', name: '田中次郎', birthDate: '1995-05-10' }]
      ]);
      const itemsByVisitId = new Map([
        ['v_urgent', [
          { itemId: 'i1', drugId: 'd_short', isPicked: false, amount: 2, days: 14 }
        ]],
        ['v_normal', [
          { itemId: 'i2', drugId: 'd_ok', isPicked: true, amount: 1, days: 7 }
        ]]
      ]);
      const drugMap = new Map([
        ['d_short', { code: 'd_short', name: '不足薬' }],
        ['d_ok', { code: 'd_ok', name: '通常薬' }]
      ]);
      const shortageDrugIds = new Set(['d_short']);
      const alertsByPatientId = new Map();

      const tasks = calculateDashboardProcessingTasks({
        processingVisits,
        patientMap,
        itemsByVisitId,
        drugMap,
        shortageDrugIds,
        alertsByPatientId,
        basisDate: new Date('2026-08-23T10:45:00')
      });

      assert.equal(tasks.length, 2);
      assert.equal(tasks[0].visitId, 'v_urgent');
      assert.equal(tasks[0].priority, 'high');
      assert.ok(tasks[0].reviewFlags.some((f: string) => f.includes('在庫注意')));
      assert.equal(tasks[0].waitMinutes, 45);
      assert.equal(tasks[1].visitId, 'v_normal');
    });
  });
});
