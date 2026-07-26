import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  normalizeKatakanaToHiragana,
  normalizeSearchString,
  indexDrugRecords,
  searchIndexedDrugs,
  type DrugMasterRecord
} from '../workers/drug_search.worker';
import { searchDrugMasterFast } from '../lib/master-data/drug_master';

const sampleDrugs: DrugMasterRecord[] = [
  {
    code: '1111001F1023',
    name: 'アムロジピン錠5mg「サワイ」',
    genericName: 'アムロジピンベシル酸塩',
    yjCode: '1111001F1023',
    janCode: '4987123456789',
    isGeneric: true,
    price: 10.1,

    searchNameLower: 'アムロジピン錠5mg「サワイ」',
    searchGenericLower: 'アムロジピンベシル酸塩'
  },
  {
    code: '2149001F1020',
    name: 'ロキソニン錠60mg',
    genericName: 'ロキソプロフェンナトリウム水和物',
    yjCode: '2149001F1020',
    janCode: '4987123999999',
    isGeneric: false,
    price: 15.5,

    searchNameLower: 'ロキソニン錠60mg',
    searchGenericLower: 'ロキソプロフェンナトリウム水和物'
  },
  {
    code: '2149001F2026',
    name: 'ロキソプロフェンNa錠60mg「サワイ」',
    genericName: 'ロキソプロフェンナトリウム水和物',
    yjCode: '2149001F2026',
    janCode: '4987123888888',
    isGeneric: true,
    price: 9.8,

    searchNameLower: 'ロキソプロフェンna錠60mg「サワイ」',
    searchGenericLower: 'ロキソプロフェンナトリウム水和物'
  }
];

describe('Drug Search Worker & Fast Utility', () => {
  test('normalizeKatakanaToHiragana converts katakana to hiragana', () => {
    assert.equal(normalizeKatakanaToHiragana('アムロジピン'), 'あむろじぴん');
    assert.equal(normalizeKatakanaToHiragana('ロキソニン'), 'ろきそにん');
  });

  test('normalizeSearchString handles full-width numbers and katakana', () => {
    assert.equal(normalizeSearchString('ロキソニン６０mg'), 'ろきそにん60mg');
  });

  test('indexDrugRecords & searchIndexedDrugs scores hiragana query against katakana drug name', () => {
    const indexed = indexDrugRecords(sampleDrugs);
    const results = searchIndexedDrugs(indexed, 'あむろじぴん');
    assert.equal(results.length, 1);
    assert.equal(results[0].code, '1111001F1023');
  });

  test('searchIndexedDrugs matches generic name', () => {
    const indexed = indexDrugRecords(sampleDrugs);
    const results = searchIndexedDrugs(indexed, 'ろきそぷろふぇん');
    assert.equal(results.length, 2);
  });

  test('searchIndexedDrugs matches YJ and JAN codes', () => {
    const indexed = indexDrugRecords(sampleDrugs);
    const yjResults = searchIndexedDrugs(indexed, '1111001');
    assert.equal(yjResults.length, 1);
    assert.equal(yjResults[0].yjCode, '1111001F1023');

    const janResults = searchIndexedDrugs(indexed, '4987123999999');
    assert.equal(janResults.length, 1);
    assert.equal(janResults[0].name, 'ロキソニン錠60mg');
  });

  test('searchDrugMasterFast executes fast in-memory search with fallback', async () => {
    const results = await searchDrugMasterFast('ロキソニン');
    assert.ok(Array.isArray(results));
  });
});
