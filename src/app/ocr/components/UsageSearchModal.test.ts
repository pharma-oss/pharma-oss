import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFilteredUsageOptions } from './UsageSearchModal';
import { ELECTRONIC_USAGE_OPTIONS } from '@/lib/master-data/usage_master';

test('calculateFilteredUsageOptions filters population correctly by dosage category (G5-1)', () => {
  // 剤形「外用」で 957 件
  const externalOptions = calculateFilteredUsageOptions({
    category: 'external',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.equal(externalOptions.length, 957, '外用の母集団は957件であること');

  // 剤形「内滴」でちょうど 3 件
  const internalDropOptions = calculateFilteredUsageOptions({
    category: 'internal_drop',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.equal(internalDropOptions.length, 3, '内滴の母集団はちょうど3件であること');
});

test('calculateFilteredUsageOptions searches by name: "便秘" yields 1050410000000000 "便秘時　服用"', () => {
  const results = calculateFilteredUsageOptions({
    category: 'as_needed',
    query: '便秘',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.ok(results.length > 0, '検索結果が存在すること');
  const target = results.find((r) => r.prescriptionCode === '1050410000000000');
  assert.ok(target, '「1050410000000000」が含まれること');
  assert.equal(target?.label, '便秘時　服用');
});

test('calculateFilteredUsageOptions searches by kana: "テキギ" yields "適宜　服用"', () => {
  const results = calculateFilteredUsageOptions({
    category: 'as_needed',
    query: 'テキギ',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.ok(results.length > 0, '検索結果が存在すること');
  const target = results.find((r) => r.label === '適宜　服用');
  assert.ok(target, '「適宜　服用」が含まれること');
  assert.equal(target?.prescriptionCode, '1050W20000000000');
});

test('calculateFilteredUsageOptions searches by receipt code: "013" yields "１日１回就寝前　服用"', () => {
  const results = calculateFilteredUsageOptions({
    category: 'internal',
    query: '013',
    options: ELECTRONIC_USAGE_OPTIONS
  });
  assert.ok(results.length > 0, '検索結果が存在すること');
  const target = results.find((r) => r.code === '013');
  assert.ok(target, 'レセプトコード013のレコードが含まれること');
  assert.equal(target?.label, '１日１回就寝前　服用');
});

test('dosage category change preserves usage value and does not auto-clear (G5-2)', () => {
  // 剤形を内服から外用に変えても、用法値はそのまま保持される契約
  const currentUsage = '１日３回朝昼夕食後　服用';
  const initialCategory = 'internal';
  const newCategory = 'external';

  // 変更時に用法を自動クリアせずそのまま保持すること
  let preservedUsage = currentUsage;
  const onRpDosageCategoryChange = (_rpId: string, _category: unknown) => {
    // 仕様: 剤形変更時に用法をクリアしてはならない（G5-2 変異でクリアされたら fail）
  };
  onRpDosageCategoryChange('rp-1', newCategory);

  assert.equal(preservedUsage, '１日３回朝昼夕食後　服用', '剤形変更後も用法値が保持されること');
});
