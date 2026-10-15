import { test } from 'node:test';
import assert from 'node:assert';
import { findPatientAlertDrugWarnings, formatPatientAlertLabel, tokenizePatientAlertContent, createPatientDataFetchErrorWarning, createWarningsCalculationErrorWarning } from './patient_alerts.ts';
import type { Alert } from '../db/types.ts';

const allergyAlert: Alert = {
  alertId: 'a1',
  patientId: 'p1',
  type: 'allergy',
  content: 'アレルギー: ペニシリン',
  status: 'active'
};

const sideEffectAlert: Alert = {
  alertId: 'a2',
  patientId: 'p1',
  type: 'side_effect',
  content: 'ロキソニンで発疹',
  status: 'active'
};

test('tokenizePatientAlertContent splits alert text and removes simple prefixes', () => {
  assert.deepStrictEqual(tokenizePatientAlertContent('アレルギー: ペニシリン、ロキソニン'), [
    'ペニシリン',
    'ロキソニン',
    'アレルギー: ペニシリン、ロキソニン'
  ]);
});

test('findPatientAlertDrugWarnings returns danger warnings for matching allergies', () => {
  const warnings = findPatientAlertDrugWarnings(
    [allergyAlert],
    [{ itemId: 'i1', drugId: 'd1', drugName: 'ペニシリンVカリウム錠' }]
  );

  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].severity, 'danger');
  assert.strictEqual(warnings[0].alertType, 'allergy');
  assert.strictEqual(warnings[0].matchedText, 'ペニシリン');
});

test('findPatientAlertDrugWarnings returns warning for matching side effect history', () => {
  const warnings = findPatientAlertDrugWarnings(
    [sideEffectAlert],
    [{ itemId: 'i1', drugId: 'd1', dispensedDrug: 'ロキソニン錠60mg' }]
  );

  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].severity, 'warning');
  assert.strictEqual(warnings[0].alertType, 'side_effect');
});

test('findPatientAlertDrugWarnings ignores resolved alerts and unrelated disease alerts', () => {
  const warnings = findPatientAlertDrugWarnings(
    [
      { ...allergyAlert, status: 'resolved' },
      { alertId: 'a3', patientId: 'p1', type: 'chronic_disease', content: '緑内障', status: 'active' }
    ],
    [{ itemId: 'i1', drugId: 'd1', drugName: 'ペニシリンVカリウム錠' }]
  );

  assert.strictEqual(warnings.length, 0);
});

test('formatPatientAlertLabel formats each alert type for UI badges', () => {
  assert.strictEqual(formatPatientAlertLabel(allergyAlert), 'アレルギー: ペニシリン');
  assert.strictEqual(formatPatientAlertLabel(sideEffectAlert), '副作用歴: ロキソニンで発疹');
});

test('findPatientAlertDrugWarnings matches on genericName too', () => {
  const warnings = findPatientAlertDrugWarnings(
    [
      {
        alertId: 'a4',
        patientId: 'p1',
        type: 'allergy',
        content: 'ロキソプロフェン',
        status: 'active'
      }
    ],
    [{ itemId: 'i1', drugId: 'd1', drugName: 'ロキソニン錠60mg', genericName: 'ロキソプロフェンナトリウム水和物' }]
  );

  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].severity, 'danger');
  assert.strictEqual(warnings[0].matchedText, 'ロキソプロフェン');
});

test('createPatientDataFetchErrorWarning returns warning object for patient data retrieval failure', () => {
  const warning = createPatientDataFetchErrorWarning();
  assert.strictEqual(warning.type, 'usage');
  assert.strictEqual(warning.severity, 'warning');
  assert.strictEqual(warning.drug, '（患者情報）');
  assert.strictEqual(warning.message, '患者情報（アレルギー・副作用歴・年齢）の取得に失敗したため、警告を判定できませんでした。患者情報を確認してください。');
});

test('createWarningsCalculationErrorWarning returns warning object when warning calculation fails', () => {
  const warning = createWarningsCalculationErrorWarning();
  assert.strictEqual(warning.type, 'usage');
  assert.strictEqual(warning.severity, 'warning');
  assert.strictEqual(warning.drug, '（処方監査）');
  assert.strictEqual(warning.message, '処方と患者情報に基づく警告の算出に失敗したため、警告を判定できませんでした。処方内容と患者情報を確認してください。');
});
