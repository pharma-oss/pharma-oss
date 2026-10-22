import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DrugMasterRecord } from '@/lib/master-data/types';
import { sortDrugSuggestions } from './helpers';

function drug(code: string, name: string, stockQuantity = 0): DrugMasterRecord {
  return {
    code,
    name,
    stockQuantity,
    searchNameLower: name.toLowerCase(),
    searchGenericLower: ''
  } as DrugMasterRecord;
}

describe('sortDrugSuggestions', () => {
  it('puts in-stock drugs first', () => {
    const sorted = sortDrugSuggestions([drug('1', 'アムロジピン錠５ｍｇ「Ａ」'), drug('2', 'アムロジピン錠５ｍｇ「Ｂ」', 30)], 'アムロ');
    assert.equal(sorted[0].code, '2');
  });

  it('puts a recently picked drug ahead of an unpicked one, newest pick first', () => {
    const drugs = [drug('1', 'アムロジピン錠５ｍｇ「Ａ」'), drug('2', 'アムロジピン錠５ｍｇ「Ｂ」'), drug('3', 'アムロジピン錠５ｍｇ「Ｃ」')];
    const sorted = sortDrugSuggestions(drugs, 'アムロ', ['3', '2']);
    assert.deepEqual(sorted.map((item) => item.code), ['3', '2', '1']);
  });

  it('keeps stock ahead of recents so an out-of-stock drug does not outrank one on the shelf', () => {
    const sorted = sortDrugSuggestions([drug('1', 'アムロジピン錠５ｍｇ「Ａ」', 10), drug('2', 'アムロジピン錠５ｍｇ「Ｂ」')], 'アムロ', ['2']);
    assert.equal(sorted[0].code, '1');
  });

  it('lists the plain tablet before an OD tablet when nothing else separates them', () => {
    const sorted = sortDrugSuggestions([
      drug('1', 'アムロジピンＯＤ錠１０ｍｇ「ＣＨ」'),
      drug('2', 'アムロジピン錠５ｍｇ「ＣＨ」')
    ], 'アムロ');
    assert.equal(sorted[0].code, '2');
  });

  it('still ranks a name that starts with the query above one that only contains it', () => {
    const sorted = sortDrugSuggestions([drug('1', 'ノルバスク（アムロジピン）錠'), drug('2', 'アムロジピン錠５ｍｇ「ＣＨ」')], 'アムロ');
    assert.equal(sorted[0].code, '2');
  });
});
