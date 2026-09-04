import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePrescribedDrugSelectUpdates } from './PrescribedDrugInput';
import type { DrugMasterRecord } from '@/lib/master-data/drug_master';

const mockDrugWithUnit: DrugMasterRecord = {
  code: '620000003',
  name: 'アンブロキソール塩酸塩シロップ０．３％',
  yjCode: '2239001S1020',
  isGeneric: true,
  isAbolished: false,
  price: 5.4,
  stockQuantity: 500,
  unitText: 'ｍＬ',
  unitCode: '007',
  searchNameLower: 'アンブロキソール塩酸塩シロップ０．３％',
  searchGenericLower: 'アンブロキソール塩酸塩'
};

test('calculatePrescribedDrugSelectUpdates produces unitText and unitCode updates when drug has unit', () => {
  const updates = calculatePrescribedDrugSelectUpdates(mockDrugWithUnit, {
    dispensedDrug: '',
    electronicUnitConversion: undefined
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.ok(unitTextUpdate, 'unitText update should be produced');
  assert.equal(unitTextUpdate?.value, 'ｍＬ');
  assert.ok(unitCodeUpdate, 'unitCode update should be produced');
  assert.equal(unitCodeUpdate?.value, '007');
});

test('calculatePrescribedDrugSelectUpdates suppresses unitText/unitCode updates when electronic conversion exists', () => {
  const updates = calculatePrescribedDrugSelectUpdates(mockDrugWithUnit, {
    dispensedDrug: '',
    electronicUnitConversion: {
      conversionFactor: '1',
      prescribedAmount: '10',
      prescribedUnitText: '本',
      prescribedUnitCode: '010'
    }
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.equal(unitTextUpdate, undefined, '電子処方箋の処方単位がある場合、マスタ単位による更新は抑止されること');
  assert.equal(unitCodeUpdate, undefined, '電子処方箋の処方単位コードがある場合、マスタ単位コードによる更新は抑止されること');
});

test('calculatePrescribedDrugSelectUpdates suppresses unitText/unitCode when master drug does not carry unit', () => {
  const drugWithoutUnit: DrugMasterRecord = {
    ...mockDrugWithUnit,
    unitText: undefined,
    unitCode: undefined
  };

  const updates = calculatePrescribedDrugSelectUpdates(drugWithoutUnit, {
    dispensedDrug: '',
    electronicUnitConversion: undefined
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.equal(unitTextUpdate, undefined);
  assert.equal(unitCodeUpdate, undefined);
});
