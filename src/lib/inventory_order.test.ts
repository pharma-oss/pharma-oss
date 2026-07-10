import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildInventoryOrderCsv,
  buildInventoryOrderMemo,
  buildInventoryReceivingChecklistCsv,
  buildInventoryReceivingChecklistMemo,
  buildInventoryReceivingChecklistRows,
  choosePrimarySupplier,
  csvCell,
  formatDateForFileName,
  getInventoryOrderActionLabel,
  getInventoryOrderPriority,
  type InventoryOrderRisk
} from './inventory_order.ts';

const sampleRisks: Array<InventoryOrderRisk & { affectedPatientNames: string[] }> = [
  {
    drugId: 'D-001',
    drugName: '=HYPERLINK("https://example.invalid")',
    location: 'A-1',
    supplierName: '中央卸',
    requiredAmount: 28,
    availableAmount: 3,
    shortageAmount: 25,
    recommendedOrderAmount: 25,
    affectedVisitCount: 2,
    affectedPatientNames: ['山田 太郎'],
    priority: 'high',
    actionLabel: '至急発注・融通確認'
  },
  {
    drugId: 'D-002',
    drugName: '普通錠10mg',
    location: '棚位置未設定',
    supplierName: '卸未設定',
    requiredAmount: 7.5,
    availableAmount: 2,
    shortageAmount: 5.5,
    recommendedOrderAmount: 5.5,
    affectedVisitCount: 1,
    affectedPatientNames: ['佐藤 花子'],
    priority: 'medium',
    actionLabel: '不足数を発注・代替候補を確認'
  }
];

test('buildInventoryOrderCsv exports shortage order fields without patient names', () => {
  const csv = buildInventoryOrderCsv(sampleRisks);

  assert.match(csv, /^"優先度","薬品コード","薬品名","棚位置","仕入先候補"/);
  assert.match(csv, /"至急","D-001","'=HYPERLINK\(""https:\/\/example\.invalid""\)"/);
  assert.match(csv, /"注意","D-002","普通錠10mg","棚位置未設定","卸未設定","7\.5","2","5\.5","5\.5","1"/);
  assert.doesNotMatch(csv, /山田 太郎|佐藤 花子/);
});

test('buildInventoryOrderMemo keeps order actions compact and patient-free', () => {
  const memo = buildInventoryOrderMemo(sampleRisks);

  assert.match(memo, /^在庫不足リスク 2品目/);
  assert.match(memo, /至急: =HYPERLINK\("https:\/\/example\.invalid"\) \/ 発注目安 25 \/ 不足 25 \/ 仕入先候補 中央卸/);
  assert.match(memo, /注意: 普通錠10mg \/ 発注目安 5\.5 \/ 不足 5\.5 \/ 仕入先候補 卸未設定/);
  assert.doesNotMatch(memo, /山田 太郎|佐藤 花子/);
});

test('buildInventoryReceivingChecklistRows includes only ordered risks for later lot and expiry checks', () => {
  const rows = buildInventoryReceivingChecklistRows(sampleRisks, new Set(['D-002']));

  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].statusLabel, '入庫待ち');
  assert.strictEqual(rows[0].drugId, 'D-002');
  assert.strictEqual(rows[0].priorityLabel, '注意');
  assert.strictEqual(rows[0].recommendedOrderAmount, 5.5);
});

test('buildInventoryReceivingChecklistCsv keeps receiving fields blank and patient-free', () => {
  const csv = buildInventoryReceivingChecklistCsv(sampleRisks, ['D-001', 'D-002']);

  assert.match(csv, /^"確認状態","優先度","薬品コード","薬品名","棚位置","仕入先","発注目安","不足量","影響件数","納品数量","ロット番号","使用期限","入庫日","確認者","確認メモ"/);
  assert.match(csv, /"入庫待ち","至急","D-001","'=HYPERLINK\(""https:\/\/example\.invalid""\)","A-1","中央卸","25","25","2","","","","","",""/);
  assert.match(csv, /"入庫待ち","注意","D-002","普通錠10mg","棚位置未設定","卸未設定","5\.5","5\.5","1","","","","","",""/);
  assert.doesNotMatch(csv, /山田 太郎|佐藤 花子/);
});

test('buildInventoryReceivingChecklistMemo summarizes ordered items without patient names', () => {
  const memo = buildInventoryReceivingChecklistMemo(sampleRisks, ['D-001']);

  assert.match(memo, /^入庫確認 1品目/);
  assert.match(memo, /至急: =HYPERLINK\("https:\/\/example\.invalid"\) \/ 発注目安 25 \/ 仕入先 中央卸 \/ ロット・使用期限・納品数量確認/);
  assert.doesNotMatch(memo, /山田 太郎|佐藤 花子/);
});

test('csvCell quotes values and neutralizes spreadsheet formulas', () => {
  assert.strictEqual(csvCell('普通錠 "A"'), '"普通錠 ""A"""');
  assert.strictEqual(csvCell('+SUM(1,2)'), `"'+SUM(1,2)"`);
});

test('formatDateForFileName returns sortable local date text', () => {
  assert.strictEqual(formatDateForFileName(new Date(2026, 5, 14)), '20260614');
});

test('choosePrimarySupplier prefers the supplier with the largest stock history', () => {
  assert.strictEqual(choosePrimarySupplier([
    { supplier: 'A卸', quantity: 2 },
    { supplier: 'B卸', quantity: 8 },
    { supplier: 'A卸', quantity: 4 }
  ]), 'B卸');
  assert.strictEqual(choosePrimarySupplier([{ supplier: '', quantity: 10 }]), '卸未設定');
});

test('inventory order priority and action label describe operational urgency', () => {
  assert.strictEqual(getInventoryOrderPriority({
    availableAmount: 0,
    isHighRiskMedication: false,
    affectedVisitCount: 1
  }), 'high');
  assert.strictEqual(getInventoryOrderPriority({
    availableAmount: 3,
    isHighRiskMedication: false,
    affectedVisitCount: 1
  }), 'medium');
  assert.strictEqual(getInventoryOrderActionLabel({
    availableAmount: 0,
    isHighRiskMedication: true
  }), '至急発注・融通確認');
  assert.strictEqual(getInventoryOrderActionLabel({
    availableAmount: 3,
    isHighRiskMedication: true
  }), '重点薬の代替可否を薬剤師確認');
});

test('order outputs surface picking shortage reports for on-shelf discrepancies', () => {
  const riskWithPickingShortage: InventoryOrderRisk & { affectedPatientNames: string[] } = {
    ...sampleRisks[1],
    drugId: 'D-003',
    drugName: 'デモ内用液0.75%',
    shortageAmount: 1,
    recommendedOrderAmount: 1,
    pickingShortageAmount: 1,
    actionLabel: getInventoryOrderActionLabel({
      availableAmount: 1,
      isHighRiskMedication: false,
      pickingShortageAmount: 1
    })
  };

  assert.strictEqual(riskWithPickingShortage.actionLabel, '棚不足の報告あり・現物確認と至急手配');
  assert.strictEqual(
    getInventoryOrderPriority({
      availableAmount: 1,
      isHighRiskMedication: false,
      affectedVisitCount: 1,
      pickingShortageAmount: 1
    }),
    'high'
  );

  const csv = buildInventoryOrderCsv([riskWithPickingShortage]);
  assert.match(csv, /"棚不足報告"$/m);
  assert.match(csv, /"デモ内用液0\.75%"/);
  assert.match(csv, /"棚不足の報告あり・現物確認と至急手配","1"/);

  const memo = buildInventoryOrderMemo([riskWithPickingShortage]);
  assert.match(memo, /棚不足報告 1/);
});
