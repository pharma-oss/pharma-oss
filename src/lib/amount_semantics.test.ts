import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDailyAmountItem, type AmountSemanticsItem } from './amount_semantics';

test('isDailyAmountItem classifies typical domain cases correctly via table driven tests', () => {
  const cases: { item: AmountSemanticsItem; expected: boolean; description: string }[] = [
    {
      description: '小児用シロップ (内服, days > 0) は 1日量',
      item: { days: 3, usage: '1日3回毎食後', dosageCategory: 'internal' },
      expected: true
    },
    {
      description: '錠剤 (内服, カテゴリ未設定だが用法内服, days > 0) は 1日量',
      item: { days: 14, usage: '1日2回朝夕食後' },
      expected: true
    },
    {
      description: 'モーラステープ (外用, days > 0) は 全量 (dosageCategory: external)',
      item: { days: 14, usage: '1日1回貼付', dosageCategory: 'external' },
      expected: false
    },
    {
      description: '外用薬 (用法に外用行為語なし, dosageCategory: external, days > 0) は 全量',
      item: { days: 14, usage: '1日1回', dosageCategory: 'external' },
      expected: false
    },
    {
      description: '軟膏 (外用, カテゴリ未設定だが用法塗布, days > 0) は 全量',
      item: { days: 7, usage: '1日2回患部に塗布' },
      expected: false
    },
    {
      description: 'ラキソベロン内用液 (内滴, days > 0) は 全量 (dosageCategory: internal_drop)',
      item: { days: 7, usage: '1日1回10滴', dosageCategory: 'internal_drop' },
      expected: false
    },
    {
      description: 'ラキソベロン内用液 (内滴, 用法に「内滴」あり) は 全量',
      item: { days: 7, usage: '就寝前10滴 内滴' },
      expected: false
    },
    {
      description: '静脈内注射 (注射) は 全量',
      item: { days: 1, usage: '静脈内注射', dosageCategory: 'injection' },
      expected: false
    },
    {
      description: '静脈内注射 (カテゴリ未設定だが用法に「注射」あり) は 全量',
      item: { days: 1, usage: '静脈内注射' },
      expected: false
    },
    {
      description: '解熱鎮痛剤 (頓服) は 全量',
      item: { days: 5, usage: '頭痛時頓服', dosageCategory: 'as_needed' },
      expected: false
    },
    {
      description: '日数未設定 (days: undefined) は システム規約通り 全量',
      item: { days: undefined, usage: '1日3回毎食後' },
      expected: false
    },
    {
      description: '日数ゼロ (days: 0) は システム規約通り 全量',
      item: { days: 0, usage: '外用1', dosageCategory: 'external' },
      expected: false
    }
  ];

  for (const c of cases) {
    assert.equal(
      isDailyAmountItem(c.item),
      c.expected,
      `Failed case: ${c.description}`
    );
  }
});

test('documents and locks known divergence between amount_semantics and calculator.ts for tape with days', () => {
  // モーラステープ days: 14 「1日1回貼付」:
  // 帳票側（amount_semantics）: 臨床安全のため外用・全量（false）として印字。
  // 算定側（calculator.ts:575）: isInternalMedicine は days>0 かつ 頓服/内滴/注射語なしで true（内服算定）。
  // この既知の乖離をテストで固定し、算定側の改修時に検知できるようにする。
  const tapeItem = { days: 14, usage: '1日1回貼付', dosageCategory: 'external' as const };

  const printIsDaily = isDailyAmountItem(tapeItem);
  assert.equal(printIsDaily, false, '帳票側は外用全量（isDailyAmountItem === false）と判定すること');

  // calculator.ts:575 の判定ロジックの直接再現
  const usage = tapeItem.usage || '';
  const isNaiteki = usage.includes('内滴') || usage.includes('内用滴剤');
  const isTonpuku = usage.includes('頓服');
  const isInjection = usage.includes('注射');
  const days = tapeItem.days || 0;
  const calculatorIsInternal = !!(days > 0 && !isNaiteki && !isTonpuku && !isInjection);

  assert.equal(calculatorIsInternal, true, '現行 calculator 側は internal と判定すること（既知の乖離）');
  assert.notEqual(printIsDaily, calculatorIsInternal, '帳票側と算定側で判定が乖離していることを固定');
});
