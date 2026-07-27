import { test } from 'node:test';
import assert from 'node:assert';
import { isGeneralNameDrugRecord, type DrugMasterRecord } from '@/lib/master-data/drug_master';

const mockDrugs: DrugMasterRecord[] = [
  {
    code: 'GEN001',
    yjCode: '2171022F1000',
    name: '【般】アムロジピン錠５ｍｇ',
    kana: 'アムロジピン',
    genericName: 'アムロジピンベシル酸塩',
    price: 0,
    unit: '錠',
    isGeneric: false,
    isAbolished: false,
    searchNameLower: '【般】アムロジピン錠５ｍｇ',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'BRAND001',
    yjCode: '2171022F1022',
    name: 'ノルバスク錠５ｍｇ',
    kana: 'ノルバスク',
    genericName: 'アムロジピンベシル酸塩',
    price: 35.5,
    unit: '錠',
    isGeneric: false,
    isAbolished: false,
    searchNameLower: 'ノルバスク錠５ｍｇ',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'GENERIC001',
    yjCode: '2171022F1103',
    name: 'アムロジピン錠５ｍｇ「サワイ」',
    kana: 'アムロジピン',
    genericName: 'アムロジピンベシル酸塩',
    price: 10.1,
    unit: '錠',
    isGeneric: true,
    isAbolished: false,
    searchNameLower: 'アムロジピン錠５ｍｇ「サワイ」',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: 'GENERIC002',
    yjCode: '2171022F1111',
    name: 'アムロジピン錠５ｍｇ「日医工」',
    kana: 'アムロジピン',
    genericName: 'アムロジピンベシル酸塩',
    price: 9.8,
    unit: '錠',
    isGeneric: true,
    isAbolished: false,
    searchNameLower: 'アムロジピン錠５ｍｇ「日医工」',
    searchGenericLower: 'アムロジピンベシル酸塩'
  }
];

test('isGeneralNameDrugRecord correctly identifies placeholder general name drugs', () => {
  assert.strictEqual(isGeneralNameDrugRecord(mockDrugs[0]), true);
  assert.strictEqual(isGeneralNameDrugRecord(mockDrugs[1]), false);
  assert.strictEqual(isGeneralNameDrugRecord(mockDrugs[2]), false);
});

test('Drug search filtering excludes general name placeholders from prescription candidates', () => {
  const filtered = mockDrugs.filter(d => !isGeneralNameDrugRecord(d));
  assert.strictEqual(filtered.length, 3);
  assert.ok(!filtered.some(d => d.code === 'GEN001'));
});

test('Generic substitution candidate search scans all master records correctly', () => {
  const genericCandidates = mockDrugs.filter(d => !isGeneralNameDrugRecord(d) && d.isGeneric && d.genericName === 'アムロジピンベシル酸塩');
  assert.strictEqual(genericCandidates.length, 2);
  assert.strictEqual(genericCandidates[0].code, 'GENERIC001');
  assert.strictEqual(genericCandidates[1].code, 'GENERIC002');
});
