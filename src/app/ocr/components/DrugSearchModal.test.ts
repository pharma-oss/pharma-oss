import { test } from 'node:test';
import assert from 'node:assert';
import { type DrugMasterRecord } from '@/lib/master-data/drug_master';
import { calculateFilteredDrugs } from '@/app/ocr/DrugSearchModal';

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
  assert.ok(results.some(d => d.code === 'GEN001'), 'General name placeholder should be included in prescribed mode');
  assert.ok(results.some(d => d.code === 'BRAND001'));
  assert.ok(results.some(d => d.code === 'GENERIC001'));
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
  assert.ok(!results.some(d => d.code === 'GEN001'), 'General name placeholder must be excluded in dispensed mode');
  assert.ok(results.some(d => d.code === 'BRAND001'));
  assert.ok(results.some(d => d.code === 'GENERIC001'));
  assert.ok(results.some(d => d.code === 'GENERIC002'));
});

test('calculateFilteredDrugs scans full allDrugs master for generic substitution candidates even when worker is active', () => {
  // Worker has top 1 result
  const workerResults = [mockDrugs[1]]; // BRAND001 only

  const results = calculateFilteredDrugs({
    query: 'ノルバスク',
    mode: 'dispensed',
    showAllCandidates: true,
    allDrugs: mockDrugs,
    workerSearchResults: workerResults
  });

  // Should include BRAND001 and also scan full allDrugs to find same generic ingredient generics (GENERIC001 & GENERIC002)
  assert.ok(results.some(d => d.code === 'BRAND001'));
  assert.ok(results.some(d => d.code === 'GENERIC001'), 'Must find generic candidate from full allDrugs master scan');
  assert.ok(results.some(d => d.code === 'GENERIC002'), 'Must find generic candidate from full allDrugs master scan');
});
