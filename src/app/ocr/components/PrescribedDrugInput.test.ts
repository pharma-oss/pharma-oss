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
    unitText: '',
    unitCode: '',
    electronicUnitConversion: undefined
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.ok(unitTextUpdate, 'unitText update should be produced');
  assert.equal(unitTextUpdate?.value, 'ｍＬ');
  assert.ok(unitCodeUpdate, 'unitCode update should be produced');
  assert.equal(unitCodeUpdate?.value, '007');
});

test('calculatePrescribedDrugSelectUpdates overwrites unitText/unitCode with master unit when electronic conversion exists', () => {
  const updates = calculatePrescribedDrugSelectUpdates(mockDrugWithUnit, {
    dispensedDrug: '',
    unitText: '本',
    unitCode: '010',
    electronicUnitConversion: {
      conversionFactor: '1',
      prescribedAmount: '10',
      prescribedUnitText: '本',
      prescribedUnitCode: '010'
    }
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.ok(unitTextUpdate, '換算あり明細は表示が処方単位ペアで保護されるため、マスタ単位で上書きされること');
  assert.equal(unitTextUpdate?.value, 'ｍＬ');
  assert.ok(unitCodeUpdate, '換算あり明細はマスタ単位コードで上書きされること');
  assert.equal(unitCodeUpdate?.value, '007');
});

test('calculatePrescribedDrugSelectUpdates protects existing unitText/unitCode when no conversion exists (QR/manual entry)', () => {
  const updates = calculatePrescribedDrugSelectUpdates(mockDrugWithUnit, {
    dispensedDrug: '',
    unitText: '本',
    unitCode: '010',
    electronicUnitConversion: undefined
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.equal(unitTextUpdate, undefined, '換算なし明細で既に単位がある場合、手入力・QR単位が保護されること');
  assert.equal(unitCodeUpdate, undefined, '換算なし明細で既にコードがある場合、保護されること');
});

test('calculatePrescribedDrugSelectUpdates suppresses unitText/unitCode when master drug does not carry unit', () => {
  const drugWithoutUnit: DrugMasterRecord = {
    ...mockDrugWithUnit,
    unitText: undefined,
    unitCode: undefined
  };

  const updates = calculatePrescribedDrugSelectUpdates(drugWithoutUnit, {
    dispensedDrug: '',
    unitText: '',
    unitCode: '',
    electronicUnitConversion: undefined
  });

  const unitTextUpdate = updates.find((u) => u.field === 'unitText');
  const unitCodeUpdate = updates.find((u) => u.field === 'unitCode');

  assert.equal(unitTextUpdate, undefined);
  assert.equal(unitCodeUpdate, undefined);
});
