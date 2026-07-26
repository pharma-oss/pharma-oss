import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  findMedicalInstitutionByCode,
  searchMedicalInstitutions,
  normalizeInstitutionCode
} from './medical_institution_master';

describe('Official Medical Institution Master Engine', () => {
  test('normalizeInstitutionCode removes non-digit characters', () => {
    assert.equal(normalizeInstitutionCode('13-101-12345'), '1310112345');
    assert.equal(normalizeInstitutionCode(' 1011234 '), '1011234');
  });

  test('findMedicalInstitutionByCode matches 10-digit official code', () => {
    const found = findMedicalInstitutionByCode('1310112345');
    assert.ok(found);
    assert.equal(found?.name, '日本中央総合病院');
    assert.equal(found?.prefectureCode, '13');
  });

  test('findMedicalInstitutionByCode matches 7-digit score code', () => {
    const found = findMedicalInstitutionByCode('1022345');
    assert.ok(found);
    assert.equal(found?.name, 'サクラ内科クリニック');
  });

  test('findMedicalInstitutionByCode returns undefined for unknown code', () => {
    const found = findMedicalInstitutionByCode('9999999999');
    assert.equal(found, undefined);
  });

  test('searchMedicalInstitutions matches by name and kana', () => {
    const resultsName = searchMedicalInstitutions('サクラ');
    assert.equal(resultsName.length, 1);
    assert.equal(resultsName[0].name, 'サクラ内科クリニック');

    const resultsKana = searchMedicalInstitutions('ミドリ');
    assert.equal(resultsKana.length, 1);
    assert.equal(resultsKana[0].name, 'みどり小児科医院');
  });

  test('searchMedicalInstitutions matches partial code', () => {
    const results = searchMedicalInstitutions('27101');
    assert.equal(results.length, 1);
    assert.equal(results[0].name, '大阪なんばクリニック');
  });

  test('importMedicalInstitutionMasterCsv parses CSV and dynamically updates lookup', async () => {
    const { importMedicalInstitutionMasterCsv, findMedicalInstitutionByCode: findUpdated } = await import('./medical_institution_master');
    const csvData = `1399999999,新世代高度医療センター,9999999,13,シンセダイコウドイリョウセンター,東京都新宿区西新宿1-1`;
    const parsed = importMedicalInstitutionMasterCsv(csvData);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, '新世代高度医療センター');

    const foundNew = findUpdated('1399999999');
    assert.ok(foundNew);
    assert.equal(foundNew?.name, '新世代高度医療センター');
  });

  test('importMedicalInstitutionMasterJson parses JSON and updates master', async () => {
    const { importMedicalInstitutionMasterJson, findMedicalInstitutionByCode: findUpdated } = await import('./medical_institution_master');
    const jsonData = JSON.stringify([
      {
        code: '1388888888',
        scoreCode: '8888888',
        prefectureCode: '13',
        name: '未来先端クリニック'
      }
    ]);
    const parsed = importMedicalInstitutionMasterJson(jsonData);
    assert.equal(parsed.length, 1);

    const foundNew = findUpdated('1388888888');
    assert.ok(foundNew);
    assert.equal(foundNew?.name, '未来先端クリニック');
  });
});
