import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDrugSelectionToPrescriptions } from './useOcrDrugSearchModal';
import type { Prescription } from '@/app/ocr/types';
import type { Drug } from '@/db/types';

const basePrescription: Prescription = {
  id: 'row-1',
  rpId: 'rp-1',
  drugCode: '610000001',
  drugName: '旧処方薬',
  dispensedDrug: '',
  changeReason: '',
  amount: '1',
  usage: '1日1回朝食後',
  days: '14'
};

const masterDrugWithUnit: Drug = {
  code: '620000002',
  name: 'アモキシシリンカプセル２５０ｍｇ',
  yjCode: '6132001M1023',
  isGeneric: true,
  isAbolished: false,
  price: 15.2,
  stockQuantity: 100,
  unitText: 'カプセル',
  unitCode: '003'
};

test('applyDrugSelectionToPrescriptions in prescribed mode sets master unitText and unitCode when no electronic conversion exists', () => {
  const result = applyDrugSelectionToPrescriptions({
    prescriptions: [basePrescription],
    editingRowId: 'row-1',
    modalTargetField: 'prescribed',
    drug: masterDrugWithUnit,
    changeReason: ''
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].drugCode, '620000002');
  assert.equal(result[0].unitText, 'カプセル');
  assert.equal(result[0].unitCode, '003');
});

test('applyDrugSelectionToPrescriptions in prescribed mode protects electronic prescription unit from master unit overwrite', () => {
  const prescriptionFromEp: Prescription = {
    ...basePrescription,
    unitText: '包',
    unitCode: '005',
    electronicUnitConversion: {
      conversionFactor: '1',
      prescribedAmount: '3',
      prescribedUnitText: '包',
      prescribedUnitCode: '005'
    }
  };

  const result = applyDrugSelectionToPrescriptions({
    prescriptions: [prescriptionFromEp],
    editingRowId: 'row-1',
    modalTargetField: 'prescribed',
    drug: masterDrugWithUnit,
    changeReason: ''
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].drugCode, '620000002');
  assert.equal(result[0].unitText, '包', '電子処方箋の処方単位 "包" がマスタの "カプセル" で上書きされないこと');
  assert.equal(result[0].unitCode, '005', '電子処方箋の処方単位コード "005" が保持されること');
});

test('applyDrugSelectionToPrescriptions in dispensed mode does not modify prescribed unitText or unitCode', () => {
  const initialPrescription: Prescription = {
    ...basePrescription,
    unitText: '錠',
    unitCode: '001'
  };

  const result = applyDrugSelectionToPrescriptions({
    prescriptions: [initialPrescription],
    editingRowId: 'row-1',
    modalTargetField: 'dispensed',
    drug: masterDrugWithUnit,
    changeReason: '後発品変更'
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].dispensedDrugCode, '620000002');
  assert.equal(result[0].changeReason, '後発品変更');
  assert.equal(result[0].unitText, '錠', '調剤薬変更時にも処方薬の単位は維持されること');
  assert.equal(result[0].unitCode, '001');
});
