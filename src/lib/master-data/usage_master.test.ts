import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELECTRONIC_USAGE_OPTIONS,
  INTERNAL_DROP_USAGE_PRESCRIPTION_CODES,
  filterUsageOptionsByCategory
} from './usage_master';

test('ELECTRONIC_USAGE_OPTIONS total count is 1775 (excluding 28 injection-route items)', () => {
  assert.equal(ELECTRONIC_USAGE_OPTIONS.length, 1775, '取り込み総件数は1775件であること');
});

test('filterUsageOptionsByCategory internal returns 178 items', () => {
  const internalOptions = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, 'internal');
  assert.equal(internalOptions.length, 178, '内服の候補件数は178件であること');
  for (const option of internalOptions) {
    assert.equal(option.category, 'internal');
  }
});

test('filterUsageOptionsByCategory as_needed returns 75 items with timing code 5', () => {
  const asNeededOptions = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, 'as_needed');
  assert.equal(asNeededOptions.length, 75, '屯服の候補件数は75件であること');
  for (const option of asNeededOptions) {
    assert.equal(option.category, 'as_needed');
    assert.equal(
      option.prescriptionCode?.[2],
      '5',
      `屯服コード ${option.prescriptionCode} の第3桁はタイミング指定5であること`
    );
  }
});

test('filterUsageOptionsByCategory external returns 957 items', () => {
  const externalOptions = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, 'external');
  assert.equal(externalOptions.length, 957, '外用の候補件数は957件であること');
  for (const option of externalOptions) {
    assert.equal(option.category, 'external');
  }
});

test('filterUsageOptionsByCategory injection returns 565 items', () => {
  const injectionOptions = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, 'injection');
  assert.equal(injectionOptions.length, 565, '注射の候補件数は565件であること');
  for (const option of injectionOptions) {
    assert.equal(option.category, 'injection');
  }
});

test('filterUsageOptionsByCategory internal_drop returns exactly 3 items in priority order', () => {
  const dropOptions = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, 'internal_drop');
  assert.equal(dropOptions.length, 3, '内滴の候補件数はちょうど3件であること');

  // 返る順序が INTERNAL_DROP_USAGE_PRESCRIPTION_CODES の順（就寝前 → 適宜 → 便秘時）であること
  const codes = dropOptions.map((o) => o.prescriptionCode);
  assert.deepEqual(codes, [
    '1011100000000000', // １日１回就寝前　服用
    '1050W20000000000', // 適宜　服用
    '1050410000000000'  // 便秘時　服用
  ]);

  const labels = dropOptions.map((o) => o.label);
  assert.deepEqual(labels, [
    '１日１回就寝前　服用',
    '適宜　服用',
    '便秘時　服用'
  ]);

  // それ以外の内服用法（例:「１日３回朝昼夕食後　服用」）が含まれないこと
  assert.equal(labels.some((l) => l.includes('朝昼夕食後')), false);
  assert.equal(labels.some((l) => l.includes('毎食後')), false);
});

test('basic usage category 4 (注入: prescriptionCode starts with 4) is 0 items', () => {
  const route4Items = ELECTRONIC_USAGE_OPTIONS.filter((o) => o.prescriptionCode?.startsWith('4'));
  assert.equal(route4Items.length, 0, '基本用法区分4（注入）は取り込まないため0件であること');
});

test('specific verified records match plan expectations', () => {
  const lookup = new Map(ELECTRONIC_USAGE_OPTIONS.map((o) => [o.prescriptionCode, o]));

  // 1011000100000000「１日１回朝食前　服用」→ category: 'internal', code: '005'
  const item1 = lookup.get('1011000100000000');
  assert.ok(item1);
  assert.equal(item1.label, '１日１回朝食前　服用');
  assert.equal(item1.category, 'internal');
  assert.equal(item1.code, '005');

  // 1011100000000000「１日１回就寝前　服用」→ category: 'internal', code: '013'
  const item2 = lookup.get('1011100000000000');
  assert.ok(item2);
  assert.equal(item2.label, '１日１回就寝前　服用');
  assert.equal(item2.category, 'internal');
  assert.equal(item2.code, '013');

  // 1050W20000000000「適宜　服用」→ category: 'as_needed', code: '900', supplement.asNeededCondition === true
  const item3 = lookup.get('1050W20000000000');
  assert.ok(item3);
  assert.equal(item3.label, '適宜　服用');
  assert.equal(item3.category, 'as_needed');
  assert.equal(item3.code, '900');
  assert.equal(item3.supplement?.asNeededCondition, true);

  // 1050410000000000「便秘時　服用」→ category: 'as_needed', code: '900'
  const item4 = lookup.get('1050410000000000');
  assert.ok(item4);
  assert.equal(item4.label, '便秘時　服用');
  assert.equal(item4.category, 'as_needed');
  assert.equal(item4.code, '900');

  // 2A50110000000000「疼痛時　貼付」→ category: 'external', code: '900', supplement.site === 'required'
  const item5 = lookup.get('2A50110000000000');
  assert.ok(item5);
  assert.equal(item5.label, '疼痛時　貼付');
  assert.equal(item5.category, 'external');
  assert.equal(item5.code, '900');
  assert.equal(item5.supplement?.site, 'required');
});

test('all external and injection items have receipt usage code 900', () => {
  const nonInternal = ELECTRONIC_USAGE_OPTIONS.filter(
    (o) => o.category === 'external' || o.category === 'injection'
  );
  assert.equal(nonInternal.length, 957 + 565);
  for (const option of nonInternal) {
    assert.equal(
      option.code,
      '900',
      `外用・注射コード ${option.prescriptionCode} (${option.label}) の調剤レセ用法コードは900であること`
    );
  }
});
