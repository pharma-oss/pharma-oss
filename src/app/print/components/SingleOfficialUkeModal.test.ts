import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import type { DispensingUkeItem } from '@/lib/receipt/dispensing_uke';
import { SingleOfficialUkeModal } from './SingleOfficialUkeModal';

const testSettings: FacilitySettings = {
  id: 'default',
  pharmacyName: 'pharma-ossテスト薬局',
  pharmacyKana: 'テストヤッキョク',
  pharmacyCode: '1312345',
  pharmacyPostalCode: '100-0001',
  pharmacyAddress: '東京都千代田区千代田1-1',
  pharmacyPhone: '03-1234-5678',
  registrationNumber: 'T1234567890123',
  baseFeeCategory: '1',
  regionalSupportAddition: 'none',
  medicalDxAddition: false
};

function createModalTestData() {
  const patient: Patient = {
    patientId: 'pat_001',
    name: '社保 太郎',
    kana: 'シャホ タロウ',
    birthDate: '1985-05-15',
    gender: 'male',
    insuranceInfo: {
      provider: '06130012',
      number: '123456',
      burdenRatio: 30,
      relationship: '本人'
    }
  };

  const visit: Visit = {
    visitId: 'visit_001',
    patientId: 'pat_001',
    prescriptionDate: '2026-06-10',
    dispensingDate: '2026-06-10',
    issueDate: '2026-06-10T10:00:00.000Z',
    status: 'completed',
    institutionId: '1312345',
    doctorId: 'doc_01',
    claimLifecycle: {
      status: 'rebilling',
      rebillingReason: '通常月次請求準備'
    }
  };

  const items: DispensingUkeItem[] = [
    {
      itemId: 'item_01',
      visitId: 'visit_001',
      drugId: '620000001',
      dispensedDrugCode: '620000001',
      drugName: 'アムロジピンOD錠5mg',
      amount: 1,
      days: 14,
      usage: '1日1回 朝食後',
      rpNumber: 1,
      dosageCategory: 'internal',
      drugPrice: 10.1,
      claimDrugFee: true
    }
  ];

  const calculatedFees: CalculationResultItem[] = [
    {
      code: 'base_fee',
      receiptFeeCode: '410004110',
      name: '調剤基本料1',
      points: 45,
      rationale: '調剤基本料1 (45点)'
    },
    {
      code: 'drug_preparation',
      receiptFeeCode: '420001810',
      name: '薬剤調製料 (内服薬)',
      points: 24,
      rationale: '薬剤調製料 内服薬 (14日分: 24点)'
    },
    {
      code: 'drug_fee',
      name: '薬剤料',
      points: 14,
      rationale: '薬剤料 (14点)'
    }
  ];

  return { visit, patient, settings: testSettings, items, calculatedFees };
}

test('SingleOfficialUkeModal renders nothing when isOpen is false', () => {
  const data = createModalTestData();
  const html = renderToStaticMarkup(
    React.createElement(SingleOfficialUkeModal, {
      isOpen: false,
      onClose: () => {},
      visitData: data.visit,
      patientData: data.patient,
      settingsData: data.settings,
      prescriptionItems: data.items,
      calculatedFees: data.calculatedFees
    })
  );

  assert.equal(html, '');
});

test('SingleOfficialUkeModal renders official preview, summary and enabled download button when data is valid', () => {
  const data = createModalTestData();
  const html = renderToStaticMarkup(
    React.createElement(SingleOfficialUkeModal, {
      isOpen: true,
      onClose: () => {},
      visitData: data.visit,
      patientData: data.patient,
      settingsData: data.settings,
      prescriptionItems: data.items,
      calculatedFees: data.calculatedFees
    })
  );

  // 1. タイトルと見出し
  assert.match(html, /<h2[^>]*>公式提出用 UKE 点検・プレビュー<\/h2>/);
  assert.match(html, /社保・国保審査支払機関/);

  // 2. 適合確認ステータス
  assert.match(html, /公式提出仕様 適合確認済み/);

  // 3. サマリー表示（RECEIPTY.CYO, 1件, 83点）
  assert.match(html, /RECEIPTY\.CYO/);
  assert.match(html, /1 件/);
  assert.match(html, /83 点/);

  // 4. レコード種別チップ（YK, RE, HO, GO, EOF）
  assert.match(html, /official-uke-type-chip">YK</);
  assert.match(html, /official-uke-type-chip">RE</);
  assert.match(html, /official-uke-type-chip">HO</);
  assert.match(html, /official-uke-type-chip">GO</);
  assert.match(html, /EOF \(0x1A\)/);

  // 5. プレビューテキストエリア（CRLF 電算コード）
  assert.match(html, /official-uke-preview-textarea/);
  assert.match(html, /GO,1,83,99/);

  // 6. ダウンロードボタン（enabled）
  assert.match(html, /data-testid="download-official-cyo-button"/);
  assert.doesNotMatch(html, /data-testid="download-official-cyo-button"[^>]*disabled/);
});

test('SingleOfficialUkeModal displays blocking alert and disables download when readiness check fails', () => {
  const data = createModalTestData();
  // 厚労省レセ電コードを未設定にする
  data.items[0].dispensedDrugCode = undefined;
  data.items[0].drugId = 'UNKNOWN_DRUG';

  const html = renderToStaticMarkup(
    React.createElement(SingleOfficialUkeModal, {
      isOpen: true,
      onClose: () => {},
      visitData: data.visit,
      patientData: data.patient,
      settingsData: data.settings,
      prescriptionItems: data.items,
      calculatedFees: data.calculatedFees
    })
  );

  // 1. エラーアラートの表示
  assert.match(html, /公式仕様未充足による出力制限/);
  assert.match(html, /公式提出準備に/);
  assert.match(html, /厚労省コード/);

  // 2. ダウンロードボタンが disabled であること
  assert.match(html, /<button[^>]*data-testid="download-official-cyo-button"[^>]*disabled|<button[^>]*disabled[^>]*data-testid="download-official-cyo-button"/);
});

test('SingleOfficialUkeModal blocks download and displays claim error alert when hasClaimErrors is true', () => {
  const data = createModalTestData();
  const html = renderToStaticMarkup(
    React.createElement(SingleOfficialUkeModal, {
      isOpen: true,
      onClose: () => {},
      visitData: data.visit,
      patientData: data.patient,
      settingsData: data.settings,
      prescriptionItems: data.items,
      calculatedFees: data.calculatedFees,
      hasClaimErrors: true,
      claimErrorMessages: ['患者アレルギー禁忌薬が処方に含まれています (patient_allergy_match)']
    })
  );

  // 1. 請求前チェックエラー警告が表示されること
  assert.match(html, /data-testid="official-uke-claim-error-alert"/);
  assert.match(html, /請求前チェックエラーによるダウンロード制限/);
  assert.match(html, /patient_allergy_match/);

  // 2. プレビュー自体は開けるが、ダウンロードボタンが disabled であること
  assert.match(html, /RECEIPTY\.CYO/);
  assert.match(html, /<button[^>]*data-testid="download-official-cyo-button"[^>]*disabled|<button[^>]*disabled[^>]*data-testid="download-official-cyo-button"/);
  assert.match(html, /title="請求前チェックのエラーを解消してください。"/);
});

