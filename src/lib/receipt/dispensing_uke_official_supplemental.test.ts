import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOfficialDailyFields,
  buildOfficialSupplementalRecords,
  buildOfficialDispensingDateRecords,
  buildOfficialCopaymentRecords,
  buildOfficialSplitDispensingRecords
} from './dispensing_uke_official_supplemental';

test('buildOfficialDailyFields formats 31 days with optional zero-padding', () => {
  const values = {
    '01': '10',
    '5': 20,
    '31': '999'
  };

  const unpadded = buildOfficialDailyFields(values);
  assert.equal(unpadded.length, 31);
  assert.equal(unpadded[0], '10');
  assert.equal(unpadded[4], '20');
  assert.equal(unpadded[30], '999');
  assert.equal(unpadded[1], '');

  const padded = buildOfficialDailyFields(values, 5);
  assert.equal(padded[0], '00010');
  assert.equal(padded[4], '00020');
  assert.equal(padded[30], '00999');
  assert.equal(padded[1], '');
});

test('buildOfficialSupplementalRecords conditionally creates SN records', () => {
  // 1. レコード未指定時は空配列
  const empty = buildOfficialSupplementalRecords({
    patientName: '患者花子',
    hasPayerRecord: true,
    claimOptions: undefined
  });
  assert.deepEqual(empty, []);

  // 2. レコード指定ありだが保険者(HO/KO)なしはエラー
  assert.throws(
    () =>
      buildOfficialSupplementalRecords({
        patientName: '患者花子',
        hasPayerRecord: false,
        claimOptions: {
          officialSupplementalRecords: [
            {
              payerCategory: '1',
              confirmationCategory: '1',
              insurerNumber: '12345678'
            }
          ]
        }
      }),
    /患者花子 のSN補助情報はHOまたはKOがある受付でだけ公式提出できます。/
  );

  // 3. レコード指定あり＋保険者ありで SN レコードを生成
  const records = buildOfficialSupplementalRecords({
    patientName: '患者花子',
    hasPayerRecord: true,
    claimOptions: {
      officialSupplementalRecords: [
        {
          payerCategory: '1',
          confirmationCategory: '2',
          insurerNumber: '98765432',
          symbol: '記号A',
          number: '番号123',
          branch: '01',
          recipientNumber: '受給者456',
          reserve: '予備'
        }
      ]
    }
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'SN');
  assert.deepEqual(records[0].fields, [
    '1',
    '2',
    '98765432',
    '記号A',
    '番号123',
    '01',
    '受給者456',
    '予備'
  ]);
});

test('buildOfficialDispensingDateRecords conditionally creates JD records', () => {
  // 1. レコード未指定時は空配列
  const empty = buildOfficialDispensingDateRecords({
    patientName: '患者太郎',
    hasPayerRecord: true
  });
  assert.deepEqual(empty, []);

  // 2. レコード指定ありだが保険者なしはエラー
  assert.throws(
    () =>
      buildOfficialDispensingDateRecords({
        patientName: '患者太郎',
        hasPayerRecord: false,
        claimOptions: {
          officialDispensingDateRecords: [
            {
              payerCategory: '1',
              days: { '01': '1' }
            }
          ]
        }
      }),
    /患者太郎 のJD調剤日情報はHOまたはKOがある受付でだけ公式提出できます。/
  );

  // 3. レコード指定あり＋保険者ありで JD レコードを生成
  const records = buildOfficialDispensingDateRecords({
    patientName: '患者太郎',
    hasPayerRecord: true,
    claimOptions: {
      officialDispensingDateRecords: [
        {
          payerCategory: '1',
          days: { '01': '1', '15': '1' }
        }
      ]
    }
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'JD');
  assert.equal(records[0].fields.length, 32); // payerCategory + 31 days
  assert.equal(records[0].fields[0], '1');
  assert.equal(records[0].fields[1], '1'); // day 1
  assert.equal(records[0].fields[15], '1'); // day 15
  assert.equal(records[0].fields[2], ''); // day 2
});

test('buildOfficialCopaymentRecords conditionally creates MF records', () => {
  // 1. レコード未指定時は空配列
  const empty = buildOfficialCopaymentRecords({
    patientName: '患者次郎',
    hasPayerRecord: true
  });
  assert.deepEqual(empty, []);

  // 2. レコード指定ありだが保険者なしはエラー
  assert.throws(
    () =>
      buildOfficialCopaymentRecords({
        patientName: '患者次郎',
        hasPayerRecord: false,
        claimOptions: {
          officialCopaymentRecords: [
            {
              category: '1',
              dailyAmounts: { '01': 500 }
            }
          ]
        }
      }),
    /患者次郎 のMF窓口負担額情報はHOまたはKOがある受付でだけ公式提出できます。/
  );

  // 3. レコード指定あり＋保険者ありで MF レコードを生成（9桁パディング）
  const records = buildOfficialCopaymentRecords({
    patientName: '患者次郎',
    hasPayerRecord: true,
    claimOptions: {
      officialCopaymentRecords: [
        {
          category: '1',
          dailyAmounts: { '01': 500, '31': 1200 }
        }
      ]
    }
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'MF');
  assert.equal(records[0].fields.length, 32); // category + 31 days
  assert.equal(records[0].fields[0], '1');
  assert.equal(records[0].fields[1], '000000500'); // day 1 padded to 9 digits
  assert.equal(records[0].fields[31], '000001200'); // day 31 padded to 9 digits
  assert.equal(records[0].fields[2], '');
});

test('buildOfficialSplitDispensingRecords conditionally creates ST records', () => {
  // 1. レコード未指定時は空配列
  const empty = buildOfficialSplitDispensingRecords({
    defaultPrescriptionDate: '2026-09-01',
    defaultDispensingDate: '2026-09-02'
  });
  assert.deepEqual(empty, []);

  // 2. レコード指定ありで ST レコードを生成
  const records = buildOfficialSplitDispensingRecords({
    defaultPrescriptionDate: '2026-09-01',
    defaultDispensingDate: '2026-09-02',
    defaultDoctorId: 'DOC001',
    claimOptions: {
      officialSplitDispensingRecords: [
        {
          doctorNumber: '1',
          prescriptionDate: '2026-09-10',
          dispensingDate: '2026-09-11',
          receptionCount: 2,
          splitCount: 3,
          insuranceTargetPoints: 500,
          insuranceAfterSplitPoints: 200,
          publicTargetPoints: [100, 50],
          publicAfterSplitPoints: [40, 20]
        }
      ]
    }
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].type, 'ST');
  assert.deepEqual(records[0].fields, [
    '1',
    '20260910',
    '20260911',
    '2',
    '3',
    '500',
    '200',
    '100',
    '40',
    '50',
    '20',
    '',
    '',
    '',
    ''
  ]);

  // 3. デフォルト日付・デフォルト医師番号の適用
  const defaultApplied = buildOfficialSplitDispensingRecords({
    defaultPrescriptionDate: '2026-09-01',
    defaultDispensingDate: '2026-09-02',
    defaultDoctorId: 'DOC999',
    claimOptions: {
      officialSplitDispensingRecords: [
        {
          splitCount: 2
        }
      ]
    }
  });
  assert.equal(defaultApplied[0].fields[0], 'DOC999');
  assert.equal(defaultApplied[0].fields[1], '20260901');
  assert.equal(defaultApplied[0].fields[2], '20260902');
  assert.equal(defaultApplied[0].fields[3], '1'); // default receptionCount
  assert.equal(defaultApplied[0].fields[4], '2'); // splitCount
});
