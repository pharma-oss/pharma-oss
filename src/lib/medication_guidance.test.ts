import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GUIDANCE_EMPTY_MESSAGE,
  GUIDANCE_LOADING_MESSAGE,
  GUIDANCE_LOAD_ERROR_MESSAGE,
  buildGuidanceEntriesByDrugCode,
  getGuidanceDropdownState,
  getGuidanceDuplicateNotice,
  getSafeDocumentUrl,
  getUniquePrescribedDrugs,
  getUsableGuidanceEntries,
  isGuidanceEntryType,
  pickGuidanceDocument
} from './medication_guidance.ts';

test('isGuidanceEntryType accepts only S, O, A and P', () => {
  for (const type of ['S', 'O', 'A', 'P']) assert.equal(isGuidanceEntryType(type), true, type);
  for (const value of ['medication', 'p', '', 'toString', undefined, null, 1]) {
    assert.equal(isGuidanceEntryType(value), false, String(value));
  }
});

test('getUniquePrescribedDrugs keeps the first drug of each code and falls back to the name', () => {
  const drugs = [
    { code: 'A1', name: 'アムロジピン' },
    { code: 'B2', name: 'ロキソニン' },
    { code: 'A1', name: 'アムロジピン（重複）' },
    { name: '名前だけの薬' },
    { name: '名前だけの薬' },
    { code: '', name: '' }
  ];
  assert.deepEqual(getUniquePrescribedDrugs(drugs).map((drug) => drug.name), ['アムロジピン', 'ロキソニン', '名前だけの薬']);
  assert.deepEqual(getUniquePrescribedDrugs(undefined), []);
  assert.deepEqual(getUniquePrescribedDrugs(null), []);
});

test('getUsableGuidanceEntries drops entries that would break the SOAP editor', () => {
  const usable = getUsableGuidanceEntries([
    { type: 'S', text: '服用後のふらつきはありませんか' },
    { type: 'medication', text: '種別が不正' },
    { type: 'P', text: '   ' },
    { type: 'A', text: '' },
    { type: 'O', text: '血圧を確認' },
    null as unknown as { type: string; text: string },
    { type: 'p', text: '小文字は不正' }
  ]);
  assert.deepEqual(usable, [
    { type: 'S', text: '服用後のふらつきはありませんか' },
    { type: 'O', text: '血圧を確認' }
  ]);
  assert.deepEqual(getUsableGuidanceEntries(undefined), []);
});

test('buildGuidanceEntriesByDrugCode groups the usable entries of each document by drug code', () => {
  const byCode = buildGuidanceEntriesByDrugCode([
    { id: 'g1', drugCode: 'A1', entries: [{ type: 'P', text: '朝食後に服用' }, { type: 'x', text: '無効' }] },
    { id: 'g2', drugCode: 'B2', entries: [] }
  ]);
  assert.deepEqual(byCode, { A1: [{ type: 'P', text: '朝食後に服用' }], B2: [] });
});

test('getGuidanceDropdownState tells a failed load apart from having no registered manual', () => {
  assert.deepEqual(getGuidanceDropdownState({ loadStatus: 'error', entryCount: 0 }), { status: 'error', message: GUIDANCE_LOAD_ERROR_MESSAGE });
  // 失敗は、前に読めた件数が残っていても最優先
  assert.deepEqual(getGuidanceDropdownState({ loadStatus: 'error', entryCount: 3 }), { status: 'error', message: GUIDANCE_LOAD_ERROR_MESSAGE });
  assert.deepEqual(getGuidanceDropdownState({ loadStatus: 'loading', entryCount: 0 }), { status: 'loading', message: GUIDANCE_LOADING_MESSAGE });
  assert.deepEqual(getGuidanceDropdownState({ loadStatus: 'ready', entryCount: 0 }), { status: 'empty', message: GUIDANCE_EMPTY_MESSAGE });
  assert.deepEqual(getGuidanceDropdownState({ loadStatus: 'ready', entryCount: 2 }), { status: 'list', message: null });
});

test('getSafeDocumentUrl opens only http and https links', () => {
  assert.equal(getSafeDocumentUrl('https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/2171022'), 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/2171022');
  assert.equal(getSafeDocumentUrl('  http://example.test/doc  '), 'http://example.test/doc');
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//example.test/doc', '', undefined, null, 5]) {
    assert.equal(getSafeDocumentUrl(value), null, String(value));
  }
});

test('pickGuidanceDocument picks the latest update, then the smaller id, whatever the input order', () => {
  const older = { id: 'g-b', updatedAt: '2026-10-01T09:00:00.000Z' };
  const newer = { id: 'g-a', updatedAt: '2026-10-18T09:00:00.000Z' };
  const sameTimeSmallerId = { id: 'g-0', updatedAt: '2026-10-18T09:00:00.000Z' };
  const noDate = { id: 'g-00' };
  const badDate = { id: 'g-000', updatedAt: 'not a date' };

  assert.equal(pickGuidanceDocument([older, newer]), newer);
  assert.equal(pickGuidanceDocument([newer, older]), newer);
  assert.equal(pickGuidanceDocument([newer, sameTimeSmallerId]), sameTimeSmallerId);
  assert.equal(pickGuidanceDocument([sameTimeSmallerId, newer]), sameTimeSmallerId);
  assert.equal(pickGuidanceDocument([noDate, badDate, older]), older, 'A document without a usable date is the oldest');
  assert.equal(pickGuidanceDocument([badDate, noDate]), noDate, 'Without any date the smaller id wins');
  assert.equal(pickGuidanceDocument([]), null);
  assert.equal(pickGuidanceDocument([older]), older);
});

test('buildGuidanceEntriesByDrugCode uses the picked document when a drug has duplicates', () => {
  const docs = [
    { id: 'g-1', drugCode: 'A1', updatedAt: '2026-10-01T09:00:00.000Z', entries: [{ type: 'S', text: '古い文例' }] },
    { id: 'g-2', drugCode: 'A1', updatedAt: '2026-10-18T09:00:00.000Z', entries: [{ type: 'P', text: '新しい文例' }] },
    { id: 'g-3', drugCode: 'B2', updatedAt: '2026-10-05T09:00:00.000Z', entries: [{ type: 'O', text: '別の薬' }] }
  ];
  const expected = { A1: [{ type: 'P', text: '新しい文例' }], B2: [{ type: 'O', text: '別の薬' }] };

  assert.deepEqual(buildGuidanceEntriesByDrugCode(docs), expected);
  assert.deepEqual(buildGuidanceEntriesByDrugCode([...docs].reverse()), expected);
});

test('getGuidanceDuplicateNotice appears only when a drug has more than one document', () => {
  assert.equal(getGuidanceDuplicateNotice(0), null);
  assert.equal(getGuidanceDuplicateNotice(1), null);
  assert.equal(getGuidanceDuplicateNotice(2), '同じ薬の文例が2件登録されています。更新日時が最新のものを表示・編集しています。');
});
