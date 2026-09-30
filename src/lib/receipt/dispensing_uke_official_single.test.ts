import test from 'node:test';
import assert from 'node:assert/strict';
import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import type { DispensingUkeItem } from './dispensing_uke';
import { buildSingleDispensingUkeOfficial } from './dispensing_uke_official_single';

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

function createStandardSingleSocialCase() {
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

test('buildSingleDispensingUkeOfficial builds valid RECEIPTY.CYO with header, body, GO and EOF', () => {
  const input = createStandardSingleSocialCase();
  const result = buildSingleDispensingUkeOfficial(input);

  // 1. ファイル名と基本情報
  assert.equal(result.fileName, 'RECEIPTY.CYO');
  assert.equal(result.totalClaims, 1);
  assert.equal(result.totalPoints, 83); // 45 + 24 + 14 = 83点

  // 2. レコード順序と主要レコードの検証
  const recordTypes = result.records.map((r) => r.type);
  assert.equal(recordTypes[0], 'YK'); // ヘッダー
  assert.equal(recordTypes[1], 'RE'); // レセプト共通
  assert.equal(recordTypes[2], 'HO'); // 保険者レコード
  assert.ok(recordTypes.includes('SH')); // 処方せん
  assert.ok(recordTypes.includes('CZ')); // 調剤料
  assert.ok(recordTypes.includes('IY')); // 医薬品
  assert.equal(recordTypes[recordTypes.length - 1], 'GO'); // フッター

  // 3. GO レコードの仕様検証（件数: 1, 点数: 83, 区分: 99）
  const goRecord = result.records[result.records.length - 1];
  assert.deepEqual(goRecord.fields, ['1', '83', '99']);

  // 4. EOF (0x1A) の検証
  assert.equal(result.content[result.content.length - 1], 0x1a);

  // 5. テキスト出力に CRLF と各行が含まれること
  assert.ok(result.text.includes('\r\n'));
  assert.ok(result.text.startsWith('YK,'));
  assert.ok(result.text.endsWith('GO,1,83,99\r\n'));

  // 6. レディネスレポートが正常であること
  assert.equal(result.readinessReport.ok, true);
});

test('buildSingleDispensingUkeOfficial includes supplemental records (SN, JD, MF, ST) when configured', () => {
  const input = createStandardSingleSocialCase();
  input.visit.claimOptions = {
    officialSupplementalRecords: [
      {
        payerCategory: '1',
        confirmationCategory: '01',
        insurerNumber: '06130012'
      }
    ],
    officialDispensingDateRecords: [
      {
        payerCategory: '1',
        days: { '10': '1' }
      }
    ],
    officialCopaymentRecords: [
      {
        category: '01',
        dailyAmounts: { '10': 300 }
      }
    ],
    officialSplitDispensingRecords: [
      {
        doctorNumber: '1',
        prescriptionDate: '2026-06-10',
        dispensingDate: '2026-06-10',
        splitCount: 2
      }
    ]
  };

  const result = buildSingleDispensingUkeOfficial(input);
  const recordTypes = result.records.map((r) => r.type);

  assert.ok(recordTypes.includes('SN'), 'SN record should be included');
  assert.ok(recordTypes.includes('JD'), 'JD record should be included');
  assert.ok(recordTypes.includes('MF'), 'MF record should be included');
  assert.ok(recordTypes.includes('ST'), 'ST record should be included');

  // ST レコードの内容確認
  const stRecord = result.records.find((r) => r.type === 'ST');
  assert.ok(stRecord);
  assert.equal(stRecord.fields[0], '1');
  assert.equal(stRecord.fields[1], '20260610');
  assert.equal(stRecord.fields[2], '20260610');
  assert.equal(stRecord.fields[4], '2');
});

test('buildSingleDispensingUkeOfficial throws error when readiness preflight fails', () => {
  const input = createStandardSingleSocialCase();
  // レセ電コードを欠落させる
  input.items[0].dispensedDrugCode = undefined;
  input.items[0].drugId = 'UNKNOWN_DRUG';

  assert.throws(
    () => buildSingleDispensingUkeOfficial(input),
    /公式提出準備に/
  );
});
