import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ELECTRONIC_USAGE_OPTIONS,
  filterUsageOptionsByCategory
} from './usage_master';

test('ELECTRONIC_USAGE_OPTIONS 001-048 are all category internal', () => {
  const standardOptions = ELECTRONIC_USAGE_OPTIONS.filter((option) => option.code !== '900');
  assert.equal(standardOptions.length, 48, '001〜048 の計48件が存在すること');
  for (const option of standardOptions) {
    assert.equal(
      option.category,
      'internal',
      `コード ${option.code} (${option.label}) は category === 'internal' であること`
    );
  }
});

test('ELECTRONIC_USAGE_OPTIONS 900 has no category defined', () => {
  const option900 = ELECTRONIC_USAGE_OPTIONS.find((option) => option.code === '900');
  assert.ok(option900, '900 未コード化用法が存在すること');
  assert.equal(option900.category, undefined, '900 に category は設定されていないこと');
});

test('filterUsageOptionsByCategory returns only 900 for external (no external options yet)', () => {
  const externalOptions = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, 'external');
  assert.equal(externalOptions.length, 1, '現時点で外用候補は未コード化用法900の1件のみであること');
  assert.equal(externalOptions[0].code, '900');
});

test('filterUsageOptionsByCategory returns 49 items for internal (001-048 + 900)', () => {
  const internalOptions = filterUsageOptionsByCategory(ELECTRONIC_USAGE_OPTIONS, 'internal');
  assert.equal(internalOptions.length, 49, '内服候補は 001〜048 (48件) ＋ 900 (1件) の計49件であること');
  const codes = internalOptions.map((o) => o.code);
  assert.ok(codes.includes('001'));
  assert.ok(codes.includes('048'));
  assert.ok(codes.includes('900'));
});
