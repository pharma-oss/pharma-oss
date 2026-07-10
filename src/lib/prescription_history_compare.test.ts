import { test } from 'node:test';
import assert from 'node:assert';
import { comparePrescriptionHistory, comparePrescriptionHistoryTimeline } from './prescription_history_compare.ts';

test('comparePrescriptionHistory detects added, stopped, changed, and unchanged drugs', () => {
  const comparison = comparePrescriptionHistory(
    [
      {
        id: 'c1',
        drugCode: 'amlodipine',
        drugName: 'アムロジピン錠5mg',
        amount: '2',
        usage: '1日1回朝食後',
        days: '28'
      },
      {
        id: 'c2',
        drugCode: 'rosuvastatin',
        drugName: 'ロスバスタチン錠2.5mg',
        amount: '1',
        usage: '1日1回夕食後',
        days: '28'
      },
      {
        id: 'c3',
        drugCode: 'rebamipide',
        drugName: 'レバミピド錠100mg',
        amount: '3',
        usage: '1日3回毎食後',
        days: '14'
      }
    ],
    [
      {
        id: 'p1',
        drugCode: 'amlodipine',
        drugName: 'アムロジピン錠5mg',
        amount: '1',
        usage: '1日1回朝食後',
        days: '14'
      },
      {
        id: 'p2',
        drugCode: 'rosuvastatin',
        drugName: 'ロスバスタチン錠2.5mg',
        amount: '1',
        usage: '1日1回夕食後',
        days: '28'
      },
      {
        id: 'p3',
        drugCode: 'loxoprofen',
        drugName: 'ロキソプロフェン錠60mg',
        amount: '3',
        usage: '疼痛時',
        days: '5'
      }
    ]
  );

  assert.strictEqual(comparison.changedCount, 1);
  assert.strictEqual(comparison.addedCount, 1);
  assert.strictEqual(comparison.stoppedCount, 1);
  assert.strictEqual(comparison.unchangedCount, 1);

  const changed = comparison.changes.find((change) => change.kind === 'changed');
  assert.ok(changed);
  assert.deepStrictEqual(changed.fieldChanges.map((field) => field.field), ['amount', 'days']);
});

test('comparePrescriptionHistory can match by YJ code or generic name when drug code is unavailable', () => {
  const byYj = comparePrescriptionHistory(
    [{ drugName: 'アムロジピン錠5mg', yjCode: '2171022F1010', amount: '1', usage: '朝食後', days: '14' }],
    [{ drugName: 'アムロジピン錠5mg', yjCode: '2171022F1010', amount: 1, usage: '朝食後', days: 14 }]
  );
  assert.strictEqual(byYj.unchangedCount, 1);

  const byGeneric = comparePrescriptionHistory(
    [{ drugName: '薬品A', genericName: 'ロキソプロフェン', amount: '3', usage: '毎食後', days: '7' }],
    [{ drugName: '薬品B', genericName: 'ロキソプロフェン', amount: '3', usage: '毎食後', days: '7' }]
  );
  assert.strictEqual(byGeneric.unchangedCount, 1);
});

test('comparePrescriptionHistory normalizes numeric strings before comparing', () => {
  const comparison = comparePrescriptionHistory(
    [{ drugCode: 'd1', drugName: '薬品A', amount: '1.0', usage: '朝食後', days: '14.00' }],
    [{ drugCode: 'd1', drugName: '薬品A', amount: 1, usage: '朝食後', days: 14 }]
  );

  assert.strictEqual(comparison.unchangedCount, 1);
  assert.strictEqual(comparison.changedCount, 0);
});

test('comparePrescriptionHistory ignores no-substitution labels when choosing display names', () => {
  const comparison = comparePrescriptionHistory(
    [{ drugCode: 'd1', drugName: 'アムロジピン錠5mg', dispensedDrug: '変更なし', amount: '2', usage: '朝食後', days: '28' }],
    [{ drugCode: 'd1', drugName: 'アムロジピン錠5mg', amount: '1', usage: '朝食後', days: '14' }]
  );

  const changed = comparison.changes.find((change) => change.kind === 'changed');
  assert.ok(changed);
  assert.strictEqual(changed.label, 'アムロジピン錠5mg');
});

test('comparePrescriptionHistoryTimeline compares the current input against the latest two snapshots', () => {
  const timeline = comparePrescriptionHistoryTimeline(
    [{ drugCode: 'd1', drugName: 'アムロジピン錠5mg', amount: '2', usage: '朝食後', days: '28' }],
    [
      {
        visitId: 'v_latest',
        dateLabel: '2026/6/1',
        institutionName: '青山内科',
        items: [{ drugCode: 'd1', drugName: 'アムロジピン錠5mg', amount: '1', usage: '朝食後', days: '14' }]
      },
      {
        visitId: 'v_second',
        dateLabel: '2026/5/1',
        institutionName: '青山内科',
        items: [{ drugCode: 'd1', drugName: 'アムロジピン錠5mg', amount: '2', usage: '朝食後', days: '28' }]
      },
      {
        visitId: 'v_older',
        dateLabel: '2026/4/1',
        items: [{ drugCode: 'd2', drugName: 'ロスバスタチン錠2.5mg', amount: '1', usage: '夕食後', days: '28' }]
      }
    ]
  );

  assert.strictEqual(timeline.length, 2);
  assert.strictEqual(timeline[0].snapshot.visitId, 'v_latest');
  assert.strictEqual(timeline[0].comparison.changedCount, 1);
  assert.strictEqual(timeline[1].snapshot.visitId, 'v_second');
  assert.strictEqual(timeline[1].comparison.unchangedCount, 1);
});
