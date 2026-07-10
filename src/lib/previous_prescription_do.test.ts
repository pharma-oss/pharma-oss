import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPreviousDoPrescriptions,
  sortPreviousDoItems,
  type PreviousDoSourceItem
} from './previous_prescription_do.ts';

const previousItems: PreviousDoSourceItem[] = [
  {
    itemId: 'prev_2',
    rpNumber: 2,
    drugId: 'D002',
    prescribedDrugName: 'カロナール錠200',
    amount: 3,
    usage: '1日3回毎食後',
    days: 5,
    rpComment: '疼痛時は医師確認',
    receiptRemark: '粉砕指示',
    isCrushed: true
  },
  {
    itemId: 'prev_1',
    rpNumber: 1,
    drugId: 'D001',
    prescribedDrugName: 'アムロジピン錠5mg',
    prescribedYjCode: '2171022F',
    prescribedGenericName: 'アムロジピン',
    prescribedIsHighRisk: true,
    prescribedStockQuantity: 42,
    dispensedDrug: 'アムロジピンOD錠5mg',
    dispensedDrugCode: 'D101',
    dispensedYjCode: '2171022F',
    changeReason: '患者希望',
    amount: 1,
    usage: '1日1回朝食後',
    days: 28,
    rpComment: '血圧確認',
    isIppoka: true,
    tokkanType: '1',
    billingAgentGroupKey: 'mtx-weekly',
    billingAgentGroupReason: '地域審査の運用に合わせる'
  },
  {
    itemId: 'prev_3',
    rpNumber: 1,
    drugId: 'D003',
    prescribedDrugName: 'ランソプラゾールOD錠15mg',
    amount: 1,
    usage: '1日1回朝食後',
    days: 28,
    rpComment: '血圧確認'
  }
];

test('sortPreviousDoItems keeps previous prescription order grouped by rpNumber', () => {
  const sorted = sortPreviousDoItems(previousItems);

  assert.deepStrictEqual(sorted.map((item) => item.itemId), ['prev_1', 'prev_3', 'prev_2']);
});

test('buildPreviousDoPrescriptions clones prior items into editable prescription input rows', () => {
  const cloned = buildPreviousDoPrescriptions(previousItems, (prefix, index) => `${prefix}_${index + 1}`);

  assert.strictEqual(cloned.length, 3);
  assert.strictEqual(cloned[0].id, 'item_1');
  assert.strictEqual(cloned[0].rpId, 'rp_1');
  assert.strictEqual(cloned[1].rpId, 'rp_1');
  assert.strictEqual(cloned[2].rpId, 'rp_2');
  assert.strictEqual(cloned[0].drugCode, 'D001');
  assert.strictEqual(cloned[0].drugName, 'アムロジピン錠5mg');
  assert.strictEqual(cloned[0].amount, '1');
  assert.strictEqual(cloned[0].usage, '1日1回朝食後');
  assert.strictEqual(cloned[0].days, '28');
  assert.strictEqual(cloned[0].rpComment, '血圧確認');
  assert.strictEqual(cloned[0].isIppoka, true);
  assert.strictEqual(cloned[0].tokkanType, '1');
  assert.strictEqual(cloned[0].billingAgentGroupKey, 'mtx-weekly');
  assert.strictEqual(cloned[0].billingAgentGroupReason, '地域審査の運用に合わせる');
  assert.strictEqual(cloned[0].dispensedDrug, 'アムロジピンOD錠5mg');
  assert.strictEqual(cloned[0].dispensedDrugCode, 'D101');
  assert.strictEqual(cloned[0].changeReason, '患者希望');
  assert.strictEqual(cloned[0].yjCode, '2171022F');
  assert.strictEqual(cloned[0].isHighRisk, true);
  assert.strictEqual(cloned[0].stockQuantity, 42);
  assert.strictEqual(cloned[2].showReceiptRemark, true);
  assert.strictEqual(cloned[2].receiptRemark, '粉砕指示');
  assert.strictEqual(cloned[2].isCrushed, true);
});

test('buildPreviousDoPrescriptions falls back to drug code when master display data is unavailable', () => {
  const cloned = buildPreviousDoPrescriptions([
    {
      itemId: 'prev_without_master',
      drugId: 'UNKNOWN',
      amount: 2,
      days: 7
    }
  ], (prefix, index) => `${prefix}_${index}`);

  assert.strictEqual(cloned[0].drugName, 'UNKNOWN');
  assert.strictEqual(cloned[0].usage, '');
  assert.strictEqual(cloned[0].days, '7');
});
