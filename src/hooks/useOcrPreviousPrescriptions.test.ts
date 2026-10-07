import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PrescriptionItem, Visit } from '@/db/types';
import { comparePrescriptionHistory } from '@/lib/prescription_history_compare';
import {
  buildPrescriptionHistorySnapshot,
  buildPreviousDoSourceItems,
  collectReferencedDrugIds,
  selectLatestCompletedVisit,
  selectRecentVisits,
  type PreviousPrescriptionDrugDoc
} from './useOcrPreviousPrescriptions';

function visit(overrides: Partial<Visit> & Pick<Visit, 'visitId'>): Visit {
  return {
    patientId: 'p1',
    issueDate: '2026-01-01',
    status: 'completed',
    ...overrides
  } as Visit;
}

function item(overrides: Partial<PrescriptionItem> & Pick<PrescriptionItem, 'drugId'>): PrescriptionItem {
  return {
    itemId: 'item-1',
    visitId: 'v1',
    amount: 1,
    days: 14,
    usage: '1日1回朝食後',
    ...overrides
  } as PrescriptionItem;
}

const lookup = (docs: Record<string, PreviousPrescriptionDrugDoc>) => new Map(Object.entries(docs));

describe('selectRecentVisits', () => {
  const visits = [
    visit({ visitId: 'jan', issueDate: '2026-01-10' }),
    visit({ visitId: 'apr', issueDate: '2026-04-10' }),
    visit({ visitId: 'feb', issueDate: '2026-02-10' }),
    visit({ visitId: 'mar', issueDate: '2026-03-10' })
  ];

  it('returns the newest visits first and defaults to two', () => {
    assert.deepEqual(selectRecentVisits(visits).map((v) => v.visitId), ['apr', 'mar']);
    assert.deepEqual(selectRecentVisits(visits, 3).map((v) => v.visitId), ['apr', 'mar', 'feb']);
    assert.deepEqual(selectRecentVisits(visits, 10).map((v) => v.visitId), ['apr', 'mar', 'feb', 'jan']);
  });

  it('does not reorder the caller\'s array', () => {
    const before = visits.map((v) => v.visitId);
    selectRecentVisits(visits);
    assert.deepEqual(visits.map((v) => v.visitId), before);
  });

  it('orders by dispensing date, then prescription date, then issue date', () => {
    const ordered = selectRecentVisits([
      visit({ visitId: 'issued-may', issueDate: '2026-05-01' }),
      visit({ visitId: 'dispensed-june', issueDate: '2026-01-01', dispensingDate: '2026-06-01' }),
      visit({ visitId: 'prescribed-july', issueDate: '2026-01-01', prescriptionDate: '2026-07-01' })
    ], 3);
    assert.deepEqual(ordered.map((v) => v.visitId), ['prescribed-july', 'dispensed-june', 'issued-may']);
  });

  it('treats an unreadable date as the oldest instead of failing', () => {
    const ordered = selectRecentVisits([
      visit({ visitId: 'broken', issueDate: 'not-a-date' }),
      visit({ visitId: 'valid', issueDate: '2026-01-01' })
    ], 2);
    assert.deepEqual(ordered.map((v) => v.visitId), ['valid', 'broken']);
  });

  it('returns an empty list when there are no visits', () => {
    assert.deepEqual(selectRecentVisits([]), []);
  });
});

describe('selectLatestCompletedVisit', () => {
  it('picks the newest completed visit and ignores newer unfinished or cancelled ones', () => {
    const picked = selectLatestCompletedVisit([
      visit({ visitId: 'old-done', issueDate: '2026-01-01', status: 'completed' }),
      visit({ visitId: 'new-waiting', issueDate: '2026-09-01', status: 'waiting' }),
      visit({ visitId: 'new-processing', issueDate: '2026-08-01', status: 'processing' }),
      visit({ visitId: 'new-cancelled', issueDate: '2026-07-01', status: 'cancelled' }),
      visit({ visitId: 'mid-done', issueDate: '2026-03-01', status: 'completed' })
    ]);
    assert.equal(picked?.visitId, 'mid-done');
  });

  it('returns undefined when nothing is completed', () => {
    assert.equal(selectLatestCompletedVisit([visit({ visitId: 'w', status: 'waiting' })]), undefined);
    assert.equal(selectLatestCompletedVisit([]), undefined);
  });
});

describe('collectReferencedDrugIds', () => {
  it('collects prescribed and dispensed codes once each, skipping empty values, in first-seen order', () => {
    const ids = collectReferencedDrugIds([
      item({ drugId: 'A', dispensedDrugCode: 'A-GE' }),
      item({ drugId: 'B' }),
      item({ drugId: 'A', dispensedDrugCode: 'A-GE' }),
      item({ drugId: 'C', dispensedDrugCode: '' }),
      item({ drugId: 'A-GE' })
    ]);
    assert.deepEqual(ids, ['A', 'A-GE', 'B', 'C']);
  });

  it('returns an empty list for no items', () => {
    assert.deepEqual(collectReferencedDrugIds([]), []);
  });
});

describe('buildPrescriptionHistorySnapshot', () => {
  const v = visit({ visitId: 'v-june', issueDate: '2026-06-03', institutionName: '聖マリア記念病院' });

  it('carries the visit identity, a readable date label and the institution', () => {
    const snapshot = buildPrescriptionHistorySnapshot(v, [], lookup({}));
    assert.deepEqual(snapshot, {
      visitId: 'v-june',
      dateLabel: '2026/6/3',
      institutionName: '聖マリア記念病院',
      items: []
    });
  });

  it('labels a visit without any date explicitly', () => {
    const undated = buildPrescriptionHistorySnapshot(visit({ visitId: 'x', issueDate: '' }), [], lookup({}));
    assert.equal(undated.dateLabel, '日付未設定');
  });

  it('shows the cleaned master name for the prescribed drug and falls back to the code when the master has no entry', () => {
    const snapshot = buildPrescriptionHistorySnapshot(v, [
      item({ itemId: 'a', drugId: 'D1' }),
      item({ itemId: 'b', drugId: 'UNKNOWN' })
    ], lookup({ D1: { name: '薬品名: アムロジピン錠5mg「サワイ」' } }));

    assert.equal(snapshot.items[0].drugName, 'アムロジピン錠5mg「サワイ」');
    assert.equal(snapshot.items[1].drugName, 'UNKNOWN');
  });

  it('prefers the recorded dispensed name, then the dispensed master name, then empty', () => {
    const snapshot = buildPrescriptionHistorySnapshot(v, [
      item({ itemId: 'a', drugId: 'D1', dispensedDrug: '手入力の調剤名', dispensedDrugCode: 'D1-GE' }),
      item({ itemId: 'b', drugId: 'D1', dispensedDrugCode: 'D1-GE' }),
      item({ itemId: 'c', drugId: 'D1' })
    ], lookup({ D1: { name: '先発品' }, 'D1-GE': { name: '成分名: 後発品A' } }));

    assert.deepEqual(snapshot.items.map((i) => i.dispensedDrug), ['手入力の調剤名', '後発品A', '']);
  });

  it('takes the YJ code and generic name from the dispensed drug when there is one, otherwise from the prescribed drug', () => {
    const snapshot = buildPrescriptionHistorySnapshot(v, [
      item({ itemId: 'swapped', drugId: 'BRAND', dispensedDrugCode: 'GENERIC' }),
      item({ itemId: 'plain', drugId: 'BRAND' }),
      item({ itemId: 'dispensed-without-codes', drugId: 'BRAND', dispensedDrugCode: 'BARE' })
    ], lookup({
      BRAND: { name: '先発品', yjCode: 'YJ-BRAND', genericName: '一般名B' },
      GENERIC: { name: '後発品', yjCode: 'YJ-GENERIC', genericName: '一般名G' },
      BARE: { name: '情報の少ない後発品' }
    }));

    assert.deepEqual(
      snapshot.items.map((i) => [i.yjCode, i.genericName]),
      [['YJ-GENERIC', '一般名G'], ['YJ-BRAND', '一般名B'], ['YJ-BRAND', '一般名B']]
    );
  });

  it('leaves YJ code and generic name empty when no master entry exists', () => {
    const [only] = buildPrescriptionHistorySnapshot(v, [item({ drugId: 'NOPE' })], lookup({})).items;
    assert.equal(only.yjCode, '');
    assert.equal(only.genericName, '');
  });

  it('keeps the item id, falling back to visitId-index, and passes amount, usage and days through untouched', () => {
    const snapshot = buildPrescriptionHistorySnapshot(v, [
      item({ itemId: 'real-id', drugId: 'D1', amount: 1.5, usage: '1日2回朝夕食後', days: 28 }),
      item({ itemId: '', drugId: 'D2' })
    ], lookup({}));

    assert.equal(snapshot.items[0].id, 'real-id');
    assert.equal(snapshot.items[0].amount, 1.5);
    assert.equal(snapshot.items[0].usage, '1日2回朝夕食後');
    assert.equal(snapshot.items[0].days, 28);
    assert.equal(snapshot.items[1].id, 'v-june-1');
  });

  it('produces items the real history comparison can match: change, addition and stop are detected', () => {
    const previous = buildPrescriptionHistorySnapshot(v, [
      item({ itemId: 'keep', drugId: 'AMLO', amount: 1, days: 14, usage: '1日1回朝食後' }),
      item({ itemId: 'stop', drugId: 'LOXO', amount: 3, days: 5, usage: '1日3回毎食後' })
    ], lookup({ AMLO: { name: 'アムロジピン錠5mg' }, LOXO: { name: 'ロキソニン錠60mg' } }));

    const comparison = comparePrescriptionHistory([
      { drugCode: 'AMLO', drugName: 'アムロジピン錠5mg', amount: 1, days: 28, usage: '1日1回朝食後' },
      { drugCode: 'MAG', drugName: '酸化マグネシウム錠', amount: 3, days: 14, usage: '1日3回毎食後' }
    ], previous.items);

    assert.equal(comparison.changedCount, 1, 'days 14 -> 28');
    assert.equal(comparison.addedCount, 1);
    assert.equal(comparison.stoppedCount, 1);
    assert.equal(comparison.unchangedCount, 0);
    const changed = comparison.changes.find((c) => c.kind === 'changed');
    assert.deepEqual(changed?.fieldChanges.map((f) => [f.field, f.before, f.after]), [['days', '14日', '28日']]);
  });
});

describe('buildPreviousDoSourceItems', () => {
  it('copies the prescription fields needed to re-create the previous order', () => {
    const [source] = buildPreviousDoSourceItems([
      item({
        itemId: 'it-9',
        drugId: 'D1',
        rpNumber: 2,
        amount: 2,
        days: 30,
        usage: '1日2回朝夕食後',
        changeReason: '患者希望',
        rpComment: '粉砕指示あり',
        isIppoka: true,
        isCrushed: true,
        tokkanType: '3_i',
        receiptRemark: '備考',
        billingAgentGroupKey: 'grp-1',
        billingAgentGroupReason: '同一薬効'
      })
    ], lookup({}));

    assert.equal(source.itemId, 'it-9');
    assert.equal(source.rpNumber, 2);
    assert.equal(source.drugId, 'D1');
    assert.equal(source.amount, 2);
    assert.equal(source.days, 30);
    assert.equal(source.usage, '1日2回朝夕食後');
    assert.equal(source.changeReason, '患者希望');
    assert.equal(source.rpComment, '粉砕指示あり');
    assert.equal(source.isIppoka, true);
    assert.equal(source.isCrushed, true);
    assert.equal(source.tokkanType, '3_i');
    assert.equal(source.receiptRemark, '備考');
    assert.equal(source.billingAgentGroupKey, 'grp-1');
    assert.equal(source.billingAgentGroupReason, '同一薬効');
  });

  it('treats an unreadable or zero quantity as 1 and keeps real quantities, including decimals', () => {
    const amounts = buildPreviousDoSourceItems([
      item({ drugId: 'a', amount: 0 }),
      item({ drugId: 'b', amount: Number.NaN }),
      item({ drugId: 'c', amount: 2.5 }),
      item({ drugId: 'd', amount: '3' as unknown as number }),
      item({ drugId: 'e', amount: undefined as unknown as number })
    ], lookup({})).map((s) => s.amount);

    assert.deepEqual(amounts, [1, 1, 2.5, 3, 1]);
  });

  it('attaches master facts to both the prescribed and the dispensed side', () => {
    const [source] = buildPreviousDoSourceItems([
      item({ drugId: 'BRAND', dispensedDrugCode: 'GENERIC' })
    ], lookup({
      BRAND: { name: '薬品名: 先発品', yjCode: 'YJ-B', genericName: '一般名B', isHighRisk: true, isAbolished: false, stockQuantity: 12 },
      GENERIC: { name: '後発品', yjCode: 'YJ-G', genericName: '一般名G', isHighRisk: false, isAbolished: true, stockQuantity: 0 }
    }));

    assert.equal(source.prescribedDrugName, '先発品');
    assert.equal(source.prescribedYjCode, 'YJ-B');
    assert.equal(source.prescribedGenericName, '一般名B');
    assert.equal(source.prescribedIsHighRisk, true);
    assert.equal(source.prescribedIsAbolished, false);
    assert.equal(source.prescribedStockQuantity, 12);

    assert.equal(source.dispensedDrugName, '後発品');
    assert.equal(source.dispensedYjCode, 'YJ-G');
    assert.equal(source.dispensedGenericName, '一般名G');
    assert.equal(source.dispensedIsHighRisk, false);
    assert.equal(source.dispensedIsAbolished, true, 'an abolished dispensed drug must stay flagged');
    assert.equal(source.dispensedStockQuantity, 0, 'zero stock is kept, not turned into undefined');
  });

  it('leaves the dispensed side blank when nothing was dispensed instead and flags default to false', () => {
    const [source] = buildPreviousDoSourceItems([item({ drugId: 'BRAND' })], lookup({ BRAND: { name: '先発品' } }));

    assert.equal(source.dispensedDrugName, undefined);
    assert.equal(source.dispensedYjCode, '');
    assert.equal(source.dispensedGenericName, '');
    assert.equal(source.dispensedIsHighRisk, false);
    assert.equal(source.dispensedIsAbolished, false);
    assert.equal(source.dispensedStockQuantity, undefined);
    assert.equal(source.prescribedIsHighRisk, false);
    assert.equal(source.prescribedIsAbolished, false);
  });

  it('degrades gracefully when the master has no entry: empty strings, false flags, no names', () => {
    const [source] = buildPreviousDoSourceItems([item({ drugId: 'GONE', dispensedDrugCode: 'ALSO-GONE' })], lookup({}));

    assert.equal(source.prescribedDrugName, undefined);
    assert.equal(source.prescribedYjCode, '');
    assert.equal(source.prescribedStockQuantity, undefined);
    assert.equal(source.dispensedDrugName, undefined);
    assert.equal(source.dispensedYjCode, '');
  });
});
