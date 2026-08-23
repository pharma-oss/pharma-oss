import { test } from 'node:test';
import assert from 'node:assert';
import { type DrugMasterRecord } from '@/lib/master-data/drug_master';
import { calculateFilteredDrugs } from './DrugSearchModal';

const mockDrugs: DrugMasterRecord[] = [
  {
    code: 'GEN001',
    yjCode: '2171022F1000',
    name: '【般】アムロジピン錠５ｍｇ',
    genericName: 'アムロジピンベシル酸塩',
    price: 0,
    isGeneric: false,
    isAbolished: false,
    searchNameLower: '【般】アムロジピン錠５ｍｇ',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'BRAND001',
    yjCode: '2171022F1022',
    name: 'ノルバスク錠５ｍｇ',
    genericName: 'アムロジピンベシル酸塩',
    price: 35.5,
    isGeneric: false,
    isAbolished: false,
    searchNameLower: 'ノルバスク錠５ｍｇ',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'GENERIC001',
    yjCode: '2171022F1103',
    name: 'アムロジピン錠５ｍｇ「サワイ」',
    genericName: 'アムロジピンベシル酸塩',
    price: 10.1,
    isGeneric: true,
    isAbolished: false,
    searchNameLower: 'アムロジピン錠５ｍｇ「サワイ」',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'GENERIC002',
    yjCode: '2171022F1111',
    name: 'アムロジピン錠５ｍｇ「日医工」',
    genericName: 'アムロジピンベシル酸塩',
    price: 9.8,
    isGeneric: true,
    isAbolished: false,
    searchNameLower: 'アムロジピン錠５ｍｇ「日医工」',
    searchGenericLower: 'アムロジピンベシル酸塩'
  }
];

test('calculateFilteredDrugs in prescribed mode includes general name placeholder drugs for prescription entry', () => {
  const results = calculateFilteredDrugs({
    query: 'アムロジピン',
    mode: 'prescribed',
    showAllCandidates: true,
    allDrugs: mockDrugs,
    workerSearchResults: []
  });

  assert.strictEqual(results.length, 4);
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'GEN001'), 'General name placeholder should be included in prescribed mode');
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'BRAND001'));
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'GENERIC001'));
});

test('calculateFilteredDrugs in dispensed mode excludes general name placeholders from dispensing candidates', () => {
  const results = calculateFilteredDrugs({
    query: 'アムロジピン',
    mode: 'dispensed',
    showAllCandidates: true,
    allDrugs: mockDrugs,
    workerSearchResults: []
  });

  assert.strictEqual(results.length, 3);
  assert.ok(!results.some((d: DrugMasterRecord) => d.code === 'GEN001'), 'General name placeholder must be excluded from dispensing selection');
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'BRAND001'));
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'GENERIC001'));
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'GENERIC002'));
});

test('calculateFilteredDrugs preserves direct query matches even when worker search is empty', () => {
  const results = calculateFilteredDrugs({
    query: 'ノルバスク',
    mode: 'prescribed',
    showAllCandidates: false,
    allDrugs: mockDrugs,
    workerSearchResults: []
  });

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].code, 'BRAND001');
  assert.ok(results.some((d: DrugMasterRecord) => d.code === 'BRAND001'));
});
