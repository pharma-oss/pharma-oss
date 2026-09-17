import { test } from 'node:test';
import assert from 'node:assert';
import { inferDosageCategory, resolveDosageCategory, resolveCalculationDosageFlags } from './dosage_category.ts';

test('inferDosageCategory classifies oral solids as internal', () => {
  assert.strictEqual(inferDosageCategory('アムロジピン錠5mg', '1日1回朝食後'), 'internal');
  assert.strictEqual(inferDosageCategory('ムコダインDS50%', '1日3回毎食後'), 'internal');
  assert.strictEqual(inferDosageCategory('ピコスルファートナトリウム錠2.5mg', '1日1回就寝前'), 'internal');
});

test('inferDosageCategory classifies topical forms as external', () => {
  assert.strictEqual(inferDosageCategory('モーラステープL40mg', '1日1回 腰部に貼付'), 'external');
  assert.strictEqual(inferDosageCategory('ヒルドイドソフト軟膏0.3%', '1日2回塗布'), 'external');
  assert.strictEqual(inferDosageCategory('キサラタン点眼液0.005%', '1日1回点眼'), 'external');
  assert.strictEqual(inferDosageCategory('ホクナリンテープ2mg', ''), 'external');
});

test('inferDosageCategory classifies picosulfate liquids as internal drops', () => {
  assert.strictEqual(inferDosageCategory('ピコスルファートナトリウム内用液0.75%', '便秘時 10滴'), 'internal_drop');
  assert.strictEqual(inferDosageCategory('ラキソベロン内用液0.75%', '就寝前'), 'internal_drop');
  assert.strictEqual(inferDosageCategory('シンラック内用液0.75%', ''), 'internal_drop');
});

test('inferDosageCategory classifies injections', () => {
  assert.strictEqual(inferDosageCategory('ヒューマログ注ミリオペン', '1日3回毎食直前'), 'injection');
  assert.strictEqual(inferDosageCategory('メトトレキサート皮下注シリンジ', '週1回'), 'injection');
});

test('inferDosageCategory falls back to as-needed from usage text', () => {
  assert.strictEqual(inferDosageCategory('カロナール錠500', '疼痛時 1回1錠'), 'as_needed');
  assert.strictEqual(inferDosageCategory('ロキソプロフェン錠60mg', '頓服 発熱時'), 'as_needed');
});

test('inferDosageCategory defaults to internal when nothing matches', () => {
  assert.strictEqual(inferDosageCategory('', ''), 'internal');
  assert.strictEqual(inferDosageCategory('不明な薬品', undefined), 'internal');
});

test('resolveDosageCategory respects saved dosageCategory over inference', () => {
  // 保存済み dosageCategory が manual の場合は必ず優先
  assert.strictEqual(
    resolveDosageCategory({
      drugName: 'モーラステープL40mg',
      usage: '1日1回貼付',
      dosageCategory: 'internal',
      dosageCategorySource: 'manual'
    }),
    'internal'
  );

  // 保存済み dosageCategory が auto の場合も保存済みを優先
  assert.strictEqual(
    resolveDosageCategory({
      drugName: 'モーラステープL40mg',
      usage: '1日1回貼付',
      dosageCategory: 'external',
      dosageCategorySource: 'auto'
    }),
    'external'
  );
});

test('resolveDosageCategory falls back to inferDosageCategory when dosageCategory is absent', () => {
  // drugName から推論
  assert.strictEqual(
    resolveDosageCategory({
      drugName: 'ヒルドイドソフト軟膏0.3%',
      usage: '1日2回患部に外用'
    }),
    'external'
  );

  // dispensedDrug から推論（drugName がない場合）
  assert.strictEqual(
    resolveDosageCategory({
      dispensedDrug: '小児用シロップ水剤「E2E」',
      usage: '1日3回毎食後'
    }),
    'internal'
  );

  // usage から推論
  assert.strictEqual(
    resolveDosageCategory({
      drugName: 'カロナール錠500',
      usage: '疼痛時 1回1錠'
    }),
    'as_needed'
  );
});

test('inferDosageCategory classifies external usage pattern with precedence over as-needed (PR-E1)', () => {
  // 点耳（名称に外用キーワードがなく用法に点耳がある場合）
  assert.strictEqual(inferDosageCategory('タリビッド耳科用液', '1日2回点耳'), 'external');

  // 屯服より外用が優先されること（坐剤＋発熱時）
  assert.strictEqual(inferDosageCategory('ボラザG坐剤', '発熱時に1回1個 肛門内に挿入'), 'external');
  assert.strictEqual(inferDosageCategory('解熱薬', '発熱時に1回1個 坐剤を肛門内に挿入'), 'external');

  // 既存の屯服判定が壊れていないこと
  assert.strictEqual(inferDosageCategory('カロナール錠200', '疼痛時に1回1錠'), 'as_needed');

  // 内服の回帰
  assert.strictEqual(inferDosageCategory('アムロジピン錠5mg', '1日1回朝食後'), 'internal');
});

test('resolveCalculationDosageFlags defaults to legacy mode (PR-H1)', () => {
  // 手動「内服」＋用法「点眼」の明細で、第2引数未指定時に legacy 判定（isExternal === true）になること
  const item = {
    drugName: '点眼テスト薬',
    usage: '1日1回点眼',
    dosageCategory: 'internal' as const,
    dosageCategorySource: 'manual' as const
  };
  const flags = resolveCalculationDosageFlags(item);
  assert.strictEqual(flags.isExternal, true, 'Default resolution must be legacy (isExternal should be true due to usage)');
  assert.strictEqual(flags.isTonpuku, false);
  assert.strictEqual(flags.isNaiteki, false);
  assert.strictEqual(flags.isInjection, false);
});

test('resolveCalculationDosageFlags handles legacy mode with EXTERNAL_USAGE_PATTERN', () => {
  const itemWithSavedInternalAndTopicalUsage = {
    drugName: '一般的薬品X',
    usage: '患部に1日2回外用塗布',
    dosageCategory: 'internal' as const
  };
  const flags = resolveCalculationDosageFlags(itemWithSavedInternalAndTopicalUsage, 'legacy');
  assert.strictEqual(flags.isExternal, true);
  assert.strictEqual(flags.isTonpuku, false);
});

test('resolveCalculationDosageFlags handles respect_manual mode only when source is manual', () => {
  // manual 指定の場合は手動区分をそのまま尊重
  const manualItem = {
    drugName: 'テスト薬',
    usage: '1日1回点眼',
    dosageCategory: 'internal' as const,
    dosageCategorySource: 'manual' as const
  };
  const flagsManual = resolveCalculationDosageFlags(manualItem, 'respect_manual');
  assert.strictEqual(flagsManual.isExternal, false);
  assert.strictEqual(flagsManual.isTonpuku, false);
  assert.strictEqual(flagsManual.isNaiteki, false);
  assert.strictEqual(flagsManual.isInjection, false);

  // dosageCategorySource が 'auto' の場合は用法正規表現が効いて legacy と同じ挙動になること
  const autoItem = {
    drugName: 'テスト薬',
    usage: '1日1回点眼',
    dosageCategory: 'internal' as const,
    dosageCategorySource: 'auto' as const
  };
  const flagsAuto = resolveCalculationDosageFlags(autoItem, 'respect_manual');
  assert.strictEqual(flagsAuto.isExternal, true, 'auto source should still fall back to usage pattern even in respect_manual mode');
});

