import { test } from 'node:test';
import assert from 'node:assert';
import { inferDosageCategory } from './dosage_category.ts';

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
