import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISPENSING_UKE_COPAYMENT_CATEGORY_CODES,
  DISPENSING_UKE_REDUCTION_CODES,
  DISPENSING_UKE_SPECIAL_NOTE_CODES,
  HIGH_COST_LIMIT_CATEGORIES,
  LATE_ELDERLY_ONLY_SPECIAL_NOTE_CODES,
  buildHighCostSpecialNoteCode,
  findDispensingUkeCodeTableEntry,
  verifyDispensingUkeCodeTablesAgainstSpecText
} from './dispensing_uke_code_tables.ts';

// 別表7・別表8・別表10 は公式仕様PDFの写し。
// 写し間違いはレセプトの特記事項をまるごと無意味にするため、
// コードと名称の対応・記録できる条件・仕様本文との突合を固定する。

test('special note table keeps the official codes and gaps', () => {
  const codes = DISPENSING_UKE_SPECIAL_NOTE_CODES.map((entry) => entry.code);
  assert.equal(new Set(codes).size, codes.length, 'コードの重複');
  assert.deepEqual([...codes].sort(), codes, 'コード順が昇順であること');

  // 別表7 は連番ではない。05・06・15・17〜20・22〜24・40 は調剤の表に存在しない。
  for (const missing of ['05', '06', '15', '17', '18', '19', '20', '22', '23', '24', '40']) {
    assert.equal(
      findDispensingUkeCodeTableEntry(DISPENSING_UKE_SPECIAL_NOTE_CODES, missing),
      undefined,
      `${missing} は別表7（調剤）に無い`
    );
  }

  assert.equal(findDispensingUkeCodeTableEntry(DISPENSING_UKE_SPECIAL_NOTE_CODES, '26')?.name, '区ア');
  assert.equal(findDispensingUkeCodeTableEntry(DISPENSING_UKE_SPECIAL_NOTE_CODES, '30')?.name, '区オ');
  assert.equal(findDispensingUkeCodeTableEntry(DISPENSING_UKE_SPECIAL_NOTE_CODES, '31')?.name, '多ア');
  assert.equal(findDispensingUkeCodeTableEntry(DISPENSING_UKE_SPECIAL_NOTE_CODES, '35')?.name, '多オ');
  assert.equal(findDispensingUkeCodeTableEntry(DISPENSING_UKE_SPECIAL_NOTE_CODES, '41')?.name, '区カ');
  assert.equal(findDispensingUkeCodeTableEntry(DISPENSING_UKE_SPECIAL_NOTE_CODES, '44')?.name, '多キ');
});

test('every high-cost limit category has both a normal and a multiple-occurrence code', () => {
  for (const category of HIGH_COST_LIMIT_CATEGORIES) {
    const normal = DISPENSING_UKE_SPECIAL_NOTE_CODES.find((entry) => entry.name === `区${category}`);
    const multiple = DISPENSING_UKE_SPECIAL_NOTE_CODES.find((entry) => entry.name === `多${category}`);
    assert.ok(normal, `区${category} が別表7に無い`);
    assert.ok(multiple, `多${category} が別表7に無い`);
  }
});

test('copayment category codes only cover the two low-income categories', () => {
  assert.deepEqual(DISPENSING_UKE_COPAYMENT_CATEGORY_CODES.map((entry) => entry.code), ['1', '3']);
  // 「2」は別表8に無い。埋めてはいけない。
  assert.equal(findDispensingUkeCodeTableEntry(DISPENSING_UKE_COPAYMENT_CATEGORY_CODES, '2'), undefined);
  assert.match(DISPENSING_UKE_COPAYMENT_CATEGORY_CODES[0].name, /適用区分II/);
  assert.match(DISPENSING_UKE_COPAYMENT_CATEGORY_CODES[1].name, /適用区分I）/);
});

test('reduction codes follow 別表10', () => {
  assert.deepEqual(
    DISPENSING_UKE_REDUCTION_CODES,
    [
      { code: '1', name: '減額' },
      { code: '2', name: '免除' },
      { code: '3', name: '支払猶予' }
    ]
  );
});

test('buildHighCostSpecialNoteCode picks 区 or 多 by multiple occurrence', () => {
  assert.deepEqual(
    buildHighCostSpecialNoteCode({ category: 'ウ', dispensingMonth: '202606' }),
    { ok: true, code: '28', name: '区ウ' }
  );
  assert.deepEqual(
    buildHighCostSpecialNoteCode({ category: 'ウ', dispensingMonth: '202606', multipleOccurrence: true }),
    { ok: true, code: '33', name: '多ウ' }
  );
  assert.deepEqual(
    buildHighCostSpecialNoteCode({ category: 'ア', dispensingMonth: '2026-06-14T09:00:00.000Z' }),
    { ok: true, code: '26', name: '区ア' }
  );
});

test('buildHighCostSpecialNoteCode restricts 区カ・区キ to late-elderly insurance', () => {
  // 別表7 注2: 41〜44 は後期高齢者医療のみ
  const withoutLateElderly = buildHighCostSpecialNoteCode({ category: 'カ', dispensingMonth: '202606' });
  assert.equal(withoutLateElderly.ok, false);
  assert.match((withoutLateElderly as { reason: string }).reason, /後期高齢者医療のみ/);

  assert.deepEqual(
    buildHighCostSpecialNoteCode({ category: 'カ', dispensingMonth: '202606', lateElderly: true }),
    { ok: true, code: '41', name: '区カ' }
  );
  assert.deepEqual(
    buildHighCostSpecialNoteCode({ category: 'キ', dispensingMonth: '202606', lateElderly: true, multipleOccurrence: true }),
    { ok: true, code: '44', name: '多キ' }
  );
});

test('buildHighCostSpecialNoteCode refuses 区カ・区キ before 令和4年10月', () => {
  const tooEarly = buildHighCostSpecialNoteCode({
    category: 'カ',
    dispensingMonth: '202209',
    lateElderly: true
  });
  assert.equal(tooEarly.ok, false);
  assert.match((tooEarly as { reason: string }).reason, /令和4年10月調剤以降/);

  // 境界: 令和4年10月ちょうどは記録できる
  assert.equal(
    buildHighCostSpecialNoteCode({ category: 'カ', dispensingMonth: '202210', lateElderly: true }).ok,
    true
  );

  const unreadableMonth = buildHighCostSpecialNoteCode({
    category: 'キ',
    dispensingMonth: '',
    lateElderly: true
  });
  assert.equal(unreadableMonth.ok, false);
  assert.match((unreadableMonth as { reason: string }).reason, /調剤年月/);
});

test('late-elderly-only codes are exactly 41 to 44', () => {
  assert.deepEqual([...LATE_ELDERLY_ONLY_SPECIAL_NOTE_CODES], ['41', '42', '43', '44']);
  // 70歳未満の区ア〜区オは、後期高齢者医療でなくても記録できる
  assert.equal(buildHighCostSpecialNoteCode({ category: 'オ', dispensingMonth: '202209' }).ok, true);
});

test('verifyDispensingUkeCodeTablesAgainstSpecText reports entries missing from the spec body', () => {
  // 公式PDFの別表と同じ並び (コードと名称が続けて記録される)
  const specBody = [
    '別表7レセプト特記事項コード',
    ...DISPENSING_UKE_SPECIAL_NOTE_CODES.map((entry) => `${entry.code}${entry.name}`),
    '別表10減免区分コード',
    ...DISPENSING_UKE_REDUCTION_CODES.map((entry) => `${entry.code}${entry.name}`)
  ].join('\n');

  assert.deepEqual(verifyDispensingUkeCodeTablesAgainstSpecText(specBody), []);

  // 改定で「区ウ」が消えた想定
  const revised = specBody.replace('28区ウ', '28区ワ');
  const issues = verifyDispensingUkeCodeTablesAgainstSpecText(revised);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, '28');
  assert.match(issues[0].table, /別表7/);

  // 本文が空なら全件が差分として出る (取得失敗を「一致」と誤認しない)
  assert.equal(
    verifyDispensingUkeCodeTablesAgainstSpecText('').length,
    DISPENSING_UKE_SPECIAL_NOTE_CODES.length + DISPENSING_UKE_REDUCTION_CODES.length
  );
});
