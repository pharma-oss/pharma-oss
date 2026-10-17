import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPreviousDoPrescriptions,
  type PreviousDoSourceItem
} from '@/lib/previous_prescription_do';
import {
  getPreviousDoViewState,
  PREVIOUS_DO_LOAD_ERROR_DISABLED_REASON,
  PREVIOUS_DO_LOAD_ERROR_SUMMARY
} from '@/app/ocr/helpers';

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

test('getPreviousDoViewState returns exact disabledReason and summary for unselected, loading, error, empty, and ready states', () => {
  const sampleItem: PreviousDoSourceItem = {
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
    isIppoka: false,
    isCrushed: false,
    tokkanType: 'none'
  };

  // 1. 患者未選択
  assert.deepStrictEqual(
    getPreviousDoViewState({
      selectedPatientId: null,
      isLoadingPreviousDo: false,
      hasPreviousDoError: false,
      previousDoSnapshot: null
    }),
    {
      disabledReason: '患者選択後に利用できます',
      summary: '前回なし'
    }
  );

  // 2. 確認中
  assert.deepStrictEqual(
    getPreviousDoViewState({
      selectedPatientId: 'patient-1',
      isLoadingPreviousDo: true,
      hasPreviousDoError: false,
      previousDoSnapshot: null
    }),
    {
      disabledReason: '前回処方を確認しています',
      summary: '確認中'
    }
  );

  // 3. 失敗
  assert.deepStrictEqual(
    getPreviousDoViewState({
      selectedPatientId: 'patient-1',
      isLoadingPreviousDo: false,
      hasPreviousDoError: true,
      previousDoSnapshot: null
    }),
    {
      disabledReason: PREVIOUS_DO_LOAD_ERROR_DISABLED_REASON,
      summary: PREVIOUS_DO_LOAD_ERROR_SUMMARY
    }
  );

  // 4. 前回なし
  assert.deepStrictEqual(
    getPreviousDoViewState({
      selectedPatientId: 'patient-1',
      isLoadingPreviousDo: false,
      hasPreviousDoError: false,
      previousDoSnapshot: null
    }),
    {
      disabledReason: '直近完了受付の処方がありません',
      summary: '前回なし'
    }
  );

  // 5. 前回あり
  assert.deepStrictEqual(
    getPreviousDoViewState({
      selectedPatientId: 'patient-1',
      isLoadingPreviousDo: false,
      hasPreviousDoError: false,
      previousDoSnapshot: {
        visit: {
          visitId: 'visit-prev-1',
          dispensingDate: '2026-10-10'
        },
        items: [sampleItem]
      }
    }),
    {
      disabledReason: '',
      summary: '2026/10/10 / 1薬品'
    }
  );
});

