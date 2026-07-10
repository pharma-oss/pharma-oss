import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildDailyControlledDrugCheckAuditDetail,
  buildDailyControlledDrugCheckCsv,
  formatDailyControlledDrugDiff,
  getDailyControlledDrugDifferenceReasonLabel,
  getDailyControlledDrugCheckStatusLabel,
  getDailyControlledDrugCheckSummary,
  getDailyControlledDrugDiff,
  getDailyControlledDrugMissingReasonRows,
  mergeDailyControlledDrugCheckSnapshot,
  parseDailyControlledDrugCheckSnapshot,
  type DailyControlledDrugCheckRow,
  type DailyControlledDrugCheckSnapshot
} from './inventory_daily_check.ts';

const sampleRows: DailyControlledDrugCheckRow[] = [
  {
    drugCode: 'N-001',
    yjCode: 'YJ-001',
    drugName: '=COUNT(A1:A2)',
    kind: 'narcotic',
    systemStock: 12,
    pendingStock: 2,
    shelfStockSystem: 10,
    actualCount: 10,
    previousActualCount: 10,
    previousDiff: 0,
    previousCheckedAt: '2026-06-28T09:00:00.000Z',
    previousCheckedBy: '薬剤師A'
  },
  {
    drugCode: 'P-002',
    yjCode: 'YJ-002',
    drugName: '向精神薬A',
    kind: 'psychotropic',
    systemStock: 7,
    pendingStock: 0,
    shelfStockSystem: 7,
    actualCount: 5,
    differenceReason: 'counting_error',
    previousActualCount: 7,
    previousDiff: -1,
    previousDifferenceReason: 'investigating',
    previousCheckedAt: '2026-06-28T09:02:00.000Z',
    previousCheckedBy: '薬剤師A'
  },
  {
    drugCode: 'P-003',
    yjCode: 'YJ-003',
    drugName: '未入力薬',
    kind: 'psychotropic',
    systemStock: 4,
    pendingStock: 1,
    shelfStockSystem: 3
  }
];

test('daily controlled drug check summary separates entered, unentered, and mismatch rows', () => {
  const summary = getDailyControlledDrugCheckSummary(sampleRows);

  assert.deepStrictEqual(summary, {
    totalCount: 3,
    enteredCount: 2,
    unenteredCount: 1,
    mismatchCount: 1
  });
});

test('daily controlled drug check status and diff formatting describe row state', () => {
  assert.strictEqual(getDailyControlledDrugCheckStatusLabel(sampleRows[0]), '一致');
  assert.strictEqual(getDailyControlledDrugCheckStatusLabel(sampleRows[1]), '差異あり');
  assert.strictEqual(getDailyControlledDrugCheckStatusLabel(sampleRows[2]), '未入力');
  assert.strictEqual(getDailyControlledDrugDiff(sampleRows[1]), -2);
  assert.strictEqual(formatDailyControlledDrugDiff(3), '+3');
  assert.strictEqual(formatDailyControlledDrugDiff(0), '0');
  assert.strictEqual(formatDailyControlledDrugDiff(null), '');
});

test('daily controlled drug check csv exports operational counts without formula injection', () => {
  const csv = buildDailyControlledDrugCheckCsv(sampleRows);

  assert.match(csv, /^"確認状態","区分","薬品コード","YJコード","医薬品名","現在庫","引き渡し予定","棚在庫システム","実地数","差異","差異理由","前回実地数","前回確認日時","前回確認者"/);
  assert.match(csv, /"一致","麻薬","N-001","YJ-001","'=COUNT\(A1:A2\)","12","2","10","10","0","","10","2026-06-28T09:00:00.000Z","薬剤師A"/);
  assert.match(csv, /"差異あり","向精神薬","P-002","YJ-002","向精神薬A","7","","7","5","'-2","計数誤り","7","2026-06-28T09:02:00.000Z","薬剤師A"/);
  assert.match(csv, /"未入力","向精神薬","P-003","YJ-003","未入力薬","4","1","3","","","","","",""/);
});

test('daily controlled drug check requires reasons only for entered mismatch rows', () => {
  const rowsWithoutReason = sampleRows.map((row) => (
    row.drugCode === 'P-002' ? { ...row, differenceReason: undefined } : row
  ));

  assert.deepStrictEqual(
    getDailyControlledDrugMissingReasonRows(rowsWithoutReason).map((row) => row.drugCode),
    ['P-002']
  );
  assert.deepStrictEqual(getDailyControlledDrugMissingReasonRows(sampleRows), []);
  assert.strictEqual(getDailyControlledDrugDifferenceReasonLabel('counting_error'), '計数誤り');
});

test('daily controlled drug check snapshot merge keeps previous untouched rows and updates entered rows', () => {
  const previous: DailyControlledDrugCheckSnapshot = {
    version: 1,
    updatedAt: '2026-06-28T09:00:00.000Z',
    entries: {
      'OLD-001': {
        actualCount: 1,
        diff: 0,
        checkedAt: '2026-06-27T09:00:00.000Z',
        checkedBy: '薬剤師A'
      },
      'N-001': {
        actualCount: 9,
        diff: -1,
        differenceReason: 'investigating',
        checkedAt: '2026-06-28T09:00:00.000Z',
        checkedBy: '薬剤師A'
      }
    }
  };

  const snapshot = mergeDailyControlledDrugCheckSnapshot(
    previous,
    sampleRows,
    '2026-06-29T09:00:00.000Z',
    '薬剤師B'
  );

  assert.strictEqual(snapshot.entries['OLD-001'].actualCount, 1);
  assert.strictEqual(snapshot.entries['N-001'].actualCount, 10);
  assert.strictEqual(snapshot.entries['N-001'].diff, 0);
  assert.strictEqual(snapshot.entries['N-001'].differenceReason, undefined);
  assert.strictEqual(snapshot.entries['P-002'].diff, -2);
  assert.strictEqual(snapshot.entries['P-002'].differenceReason, 'counting_error');
  assert.strictEqual(snapshot.entries['P-003'], undefined);
});

test('daily controlled drug check snapshot parser tolerates invalid entries', () => {
  const parsed = parseDailyControlledDrugCheckSnapshot(JSON.stringify({
    version: 1,
    updatedAt: '2026-06-29T09:00:00.000Z',
    entries: {
      valid: {
        actualCount: 2,
        diff: -1,
        differenceReason: 'damage_disposal',
        checkedAt: '2026-06-29T09:00:00.000Z',
        checkedBy: '薬剤師B'
      },
      invalidReason: {
        actualCount: 3,
        diff: 1,
        differenceReason: 'unknown',
        checkedAt: '2026-06-29T09:00:00.000Z',
        checkedBy: '薬剤師B'
      },
      broken: {
        actualCount: '3',
        diff: 1,
        checkedAt: '2026-06-29T09:00:00.000Z',
        checkedBy: '薬剤師B'
      }
    }
  }));

  assert.strictEqual(parsed?.entries.valid.differenceReason, 'damage_disposal');
  assert.strictEqual(parsed?.entries.invalidReason.differenceReason, undefined);
  assert.strictEqual(parsed?.entries.broken, undefined);
  assert.strictEqual(parseDailyControlledDrugCheckSnapshot('{'), null);
  assert.strictEqual(parseDailyControlledDrugCheckSnapshot(JSON.stringify({ version: 2 })), null);
});

test('daily controlled drug check audit detail records mismatch reasons', () => {
  const mismatchDetail = buildDailyControlledDrugCheckAuditDetail(sampleRows, 3);

  assert.match(mismatchDetail, /棚卸補正: 麻薬・向精神薬の実地棚卸で 1件の在庫を補正しました/);
  assert.match(mismatchDetail, /確認 2\/3件/);
  assert.match(mismatchDetail, /向精神薬A -2（計数誤り）/);

  const noDifferenceDetail = buildDailyControlledDrugCheckAuditDetail([sampleRows[0]], 3);
  assert.match(noDifferenceDetail, /棚卸確認: 麻薬・向精神薬の実地棚卸で 1\/3件を確認/);
  assert.match(noDifferenceDetail, /在庫補正はありませんでした/);
});
