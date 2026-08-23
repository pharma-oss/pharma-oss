import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPreviousDoPrescriptions,
  type PreviousDoSourceItem
} from '@/lib/previous_prescription_do';

test('buildPreviousDoPrescriptions は前回処方アイテムから編集フォーム行を正常にクローン生成する', () => {
  const sourceItems: PreviousDoSourceItem[] = [
    {
      itemId: 'item-prev-1',
      rpNumber: 1,
      drugId: '620000001',
      prescribedDrugName: 'アムロジピン錠5mg',
      dispensedDrug: '変更なし',
      dispensedDrugCode: '',
      changeReason: '',
      amount: 1,
      usage: '1日1回朝食後',
      days: 14,
      isIppoka: true,
      isCrushed: false,
      tokkanType: '1'
    }
  ];

  const cloned = buildPreviousDoPrescriptions(
    sourceItems,
    (prefix) => `${prefix}_test_uuid`
  );

  assert.strictEqual(cloned.length, 1);
  assert.strictEqual(cloned[0].drugName, 'アムロジピン錠5mg');
  assert.strictEqual(cloned[0].drugCode, '620000001');
  assert.strictEqual(cloned[0].amount, '1');
  assert.strictEqual(cloned[0].usage, '1日1回朝食後');
  assert.strictEqual(cloned[0].days, '14');
  assert.strictEqual(cloned[0].isIppoka, true);
  assert.strictEqual(cloned[0].tokkanType, '1');
});
