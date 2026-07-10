import { test } from 'node:test';
import assert from 'node:assert';
import { buildDispensingUkeOfficialFile } from './dispensing_uke_official.ts';
import { buildDispensingUkeOfficialClaimBody } from './dispensing_uke_official_body.ts';

test('公式UKE本文は処方単位にSH、CZ、IY、TO、COを並べ最後にTKを置く', () => {
  const records = buildDispensingUkeOfficialClaimBody({
    prescriptions: [{
      basic: {
        dosageFormCode: '1',
        usageCode: '001',
        unitDrugPoints: 24,
        publicUnitDrugPoints: [24]
      },
      dispensingGroups: [{
        dispensing: {
          doctorNumber: 1,
          prescriptionDate: '2026-06-02',
          dispensingDate: '2026-06-02',
          receptionCount: 1,
          quantity: 7,
          burdenCategory: '1',
          calculationCategory: '1',
          calculationDestinationNumber: 1,
          dispensingFeeCode: '420001810',
          dispensingFeePoints: 24,
          drugPoints: 56,
          additions: [{ burdenCategory: '1', code: '420002210', points: 8 }]
        },
        drugs: [{
          burdenCategory: '1',
          receiptDrugCode: '620124201',
          amount: '3',
          singleDose: '1'
        }],
        materials: [{
          burdenCategory: '1',
          materialCode: '700000001',
          amount: '1',
          unitCode: '001'
        }],
        comments: [{ code: '810000001', text: '朝食後に服用' }]
      }]
    }, {
      basic: {
        dosageFormCode: '3',
        specialInstruction: '患部に塗布',
        unitDrugPoints: 10
      },
      dispensingGroups: [{
        dispensing: {
          prescriptionDate: '2026-06-02',
          dispensingDate: '2026-06-03',
          receptionCount: 1,
          quantity: 1,
          burdenCategory: '1',
          calculationCategory: '1',
          calculationDestinationNumber: 2,
          dispensingFeeCode: '420001910',
          dispensingFeePoints: 10,
          drugPoints: 10
        },
        drugs: [{ burdenCategory: '1', receiptDrugCode: '620000002', amount: '10.5' }]
      }]
    }],
    summaryComments: [{ code: '810000002', text: '摘要情報' }]
  });

  assert.deepStrictEqual(records.map((record) => record.type), ['SH', 'CZ', 'IY', 'TO', 'CO', 'SH', 'CZ', 'IY', 'TK']);
  assert.deepStrictEqual(records[0].fields, ['01', '1', '001', '', '24', '24']);
  assert.deepStrictEqual(records[1].fields.slice(0, 14), [
    '1', '20260602', '20260602', '1', '7', '1', '1', '01', '420001810', '24', '', '', '56', ''
  ]);
  assert.deepStrictEqual(records[1].fields.slice(14, 17), ['1', '420002210', '8']);
  assert.deepStrictEqual(records[2].fields, ['1', '620124201', '3', '', '', '', '', '', '1']);
  assert.deepStrictEqual(records[3].fields, ['1', '700000001', '1', '001']);
  assert.deepStrictEqual(records[4].fields, ['810000001', '朝食後に服用']);
  assert.deepStrictEqual(records[5].fields, ['02', '3', '', '患部に塗布', '10']);
  assert.deepStrictEqual(records.at(-1)?.fields, ['810000002', '摘要情報']);
});

test('公式UKE本文は調剤情報CZの後半項目を公式項目順で生成する', () => {
  const records = buildDispensingUkeOfficialClaimBody({
    prescriptions: [{
      basic: { dosageFormCode: '1', usageCode: '001', unitDrugPoints: 24 },
      dispensingGroups: [{
        dispensing: {
          doctorNumber: 1,
          prescriptionDate: '2026-05-31',
          dispensingDate: '2026-05-31',
          receptionCount: 2,
          quantity: 14,
          burdenCategory: '1',
          calculationCategory: '1',
          calculationDestinationNumber: 2,
          dispensingFeeCode: '420001810',
          dispensingFeePoints: 24,
          splitCategory: 1,
          previousQuantity: 7,
          drugPoints: 42,
          additions: Array.from({ length: 10 }, (_, index) => ({
            burdenCategory: '1',
            code: String(430000370 + index),
            points: 8 + index
          })),
          ippokaDays: 28,
          splitDispensingType: '1',
          previousIppokaDays: 14,
          doctorDirectedSplit: {
            code: '460000880',
            splitCategory: 1,
            targetQuantity: 28,
            targetIppokaDays: 21
          },
          inclusiveManagementCode: '1',
          otherInstitutionVisitCode: '2',
          outpatientMedicationSupport2: { burdenCategory: '1', code: '440013610', points: 136 },
          dispensingManagement: {
            burdenCategory: '1',
            calculationCategory: '1',
            calculationDestinationNumber: 2,
            code: '440011710',
            points: 50
          },
          dispensingManagementAfterHoursAddition: { burdenCategory: '1', code: '440014170', points: 50 },
          drugFeeReduction: {
            reductionCategory: '1',
            totalPoints: 10,
            publicPoints: [1, 2, 3, 4]
          }
        }
      }]
    }]
  });

  const cz = records[1];
  assert.strictEqual(cz.type, 'CZ');
  assert.strictEqual(cz.fields.length, 70);
  assert.deepStrictEqual(cz.fields.slice(0, 14), [
    '1', '20260531', '20260531', '2', '14', '1', '1', '02', '420001810', '24', '1', '7', '42', ''
  ]);
  assert.deepStrictEqual(cz.fields.slice(14, 17), ['1', '430000370', '8']);
  assert.deepStrictEqual(cz.fields.slice(41, 44), ['1', '430000379', '17']);
  assert.deepStrictEqual(cz.fields.slice(44, 47), ['28', '1', '14']);
  assert.deepStrictEqual(cz.fields.slice(47, 53), ['460000880', '1', '28', '21', '1', '2']);
  assert.deepStrictEqual(cz.fields.slice(53, 56), ['1', '440013610', '136']);
  assert.deepStrictEqual(cz.fields.slice(56, 61), ['1', '1', '02', '440011710', '50']);
  assert.deepStrictEqual(cz.fields.slice(61, 64), ['1', '440014170', '50']);
  assert.deepStrictEqual(cz.fields.slice(64, 70), ['1', '10', '1', '2', '3', '4']);
});

test('公式UKE本文は基本料・薬学管理料KIを公式項目順で生成する', () => {
  const records = buildDispensingUkeOfficialClaimBody({
    prescriptions: [],
    managementFeeRecords: [{
      calculationDate: '2026-05-31',
      dispensingMonth: '2026-05',
      receptionCount: 4,
      baseFee: { burdenCategory: '1', code: '410004110', points: 45 },
      managementFees: [{ burdenCategory: '1', code: '440012010', count: 1, points: 45 }],
      summaryManagementFees: [{ burdenCategory: '1', code: '440021910', count: 1, points: 20 }],
      previousDispensingDate: '2026-05-18',
      previousDispensingQuantity: 28,
      baseFeeAdditions: Array.from({ length: 10 }, (_, index) => ({
        burdenCategory: '1',
        code: String(410002770 + index),
        count: 1,
        points: 32 + index
      })),
      inclusiveManagementCode: '1',
      otherInstitutionVisitCode: '2',
      doctorDirectedSplitBaseFeeCode: '410009990',
      doctorDirectedSplitManagementFeeCode: '440009991',
      doctorDirectedSplitSummaryManagementFeeCode: '440009992'
    }]
  });

  const ki = records[0];
  assert.strictEqual(ki.type, 'KI');
  assert.strictEqual(ki.fields.length, 113);
  assert.deepStrictEqual(ki.fields.slice(0, 6), ['20260531', '4', '1', '410004110', '45', '']);
  assert.deepStrictEqual(ki.fields.slice(6, 10), ['1', '440012010', '1', '45']);
  assert.deepStrictEqual(ki.fields.slice(54, 58), ['1', '440021910', '1', '20']);
  assert.strictEqual(ki.fields[66], '20260518');
  assert.strictEqual(ki.fields[67], '28');
  assert.deepStrictEqual(ki.fields.slice(68, 72), ['1', '410002770', '1', '32']);
  assert.deepStrictEqual(ki.fields.slice(104, 108), ['1', '410002779', '1', '41']);
  assert.deepStrictEqual(ki.fields.slice(108, 113), ['1', '2', '410009990', '440009991', '440009992']);
});

test('公式UKE本文を公式ファイルへ組み込むと厳格提出ゲートを通る', () => {
  const bodyRecords = buildDispensingUkeOfficialClaimBody({
    prescriptions: [{
      basic: { dosageFormCode: '1', usageCode: '001', unitDrugPoints: 24 },
      dispensingGroups: [{
        dispensing: {
          prescriptionDate: '2026-06-02',
          dispensingDate: '2026-06-02',
          receptionCount: 1,
          quantity: 7,
          burdenCategory: '1',
          calculationCategory: '1',
          calculationDestinationNumber: 1,
          dispensingFeeCode: '420001810',
          dispensingFeePoints: 24,
          drugPoints: 56
        },
        drugs: [{ burdenCategory: '1', receiptDrugCode: '620124201', amount: '3' }]
      }]
    }]
  });
  const file = buildDispensingUkeOfficialFile({
    header: {
      payerOrganizationCode: '1',
      prefectureCode: '13',
      pharmacyCode: '1234567',
      pharmacyName: '青空薬局',
      claimMonth: '2026-06',
      phone: '03-1111-2222'
    },
    claims: [{
      common: {
        claimNumber: 1,
        claimTypeCode: '4118',
        dispensingMonth: '2026-06',
        patientName: '山田 太郎',
        genderCode: '1',
        birthDate: '1980-04-05'
      },
      bodyRecords,
      totalPoints: 80
    }]
  });

  assert.strictEqual(file.gate.ok, true);
  assert.deepStrictEqual(file.gate.nonStandardRecordTypes, []);
  assert.ok(!file.records.some((record) => ['JD', 'ST', 'SN'].includes(record.type)));
});

test('公式UKE本文は複数処方グループの期待形状を公式ファイル内で固定する', () => {
  const bodyRecords = buildDispensingUkeOfficialClaimBody({
    prescriptions: [{
      basic: { dosageFormCode: '1', usageCode: '001', unitDrugPoints: 80 },
      dispensingGroups: [{
        dispensing: {
          prescriptionDate: '2026-06-02',
          dispensingDate: '2026-06-02',
          receptionCount: 1,
          quantity: 14,
          burdenCategory: '1',
          calculationCategory: '1',
          calculationDestinationNumber: 1,
          dispensingFeeCode: '420001810',
          dispensingFeePoints: 24,
          drugPoints: 80
        },
        drugs: [
          { burdenCategory: '1', receiptDrugCode: '620124201', amount: '3', singleDose: '1' },
          { burdenCategory: '1', receiptDrugCode: '620000002', amount: '2', singleDose: '1' }
        ]
      }]
    }, {
      basic: { dosageFormCode: '3', specialInstruction: '患部に塗布', unitDrugPoints: 35 },
      dispensingGroups: [{
        dispensing: {
          prescriptionDate: '2026-06-05',
          dispensingDate: '2026-06-05',
          receptionCount: 2,
          quantity: 1,
          burdenCategory: '1',
          calculationCategory: '1',
          calculationDestinationNumber: 2,
          dispensingFeeCode: '420001910',
          dispensingFeePoints: 10,
          drugPoints: 35
        },
        drugs: [{ burdenCategory: '1', receiptDrugCode: '620000003', amount: '10.5' }]
      }]
    }],
    summaryComments: [{ code: '810000002', text: '複数処方グループ確認' }],
    managementFeeRecords: [{
      calculationDate: '2026-06-05',
      dispensingMonth: '2026-06',
      receptionCount: 2,
      baseFee: { burdenCategory: '1', code: '410004110', points: 45 },
      managementFees: [{ burdenCategory: '1', code: '440012010', count: 2, points: 20 }]
    }]
  });

  const file = buildDispensingUkeOfficialFile({
    header: {
      payerOrganizationCode: '1',
      prefectureCode: '13',
      pharmacyCode: '1234567',
      pharmacyName: '青空薬局',
      claimMonth: '2026-06',
      phone: '03-1111-2222'
    },
    claims: [{
      common: {
        claimNumber: 1,
        claimTypeCode: '4118',
        dispensingMonth: '2026-06',
        patientName: '山田 太郎',
        genderCode: '1',
        birthDate: '1980-04-05'
      },
      insurances: [{
        insurerNumber: '06139999',
        symbol: '記号',
        number: '123456',
        prescriptionCount: 2,
        totalPoints: 194
      }],
      bodyRecords,
      totalPoints: 194
    }]
  });

  assert.strictEqual(file.gate.ok, true);
  assert.deepStrictEqual(file.records.map((record) => record.type), [
    'YK', 'RE', 'HO', 'SH', 'CZ', 'IY', 'IY', 'SH', 'CZ', 'IY', 'TK', 'KI', 'GO'
  ]);
  const shRecords = file.records.filter((record) => record.type === 'SH');
  const czRecords = file.records.filter((record) => record.type === 'CZ');
  const iyRecords = file.records.filter((record) => record.type === 'IY');
  const tkRecord = file.records.find((record) => record.type === 'TK');
  const kiRecord = file.records.find((record) => record.type === 'KI');

  assert.deepStrictEqual(shRecords.map((record) => record.fields[0]), ['01', '02']);
  assert.deepStrictEqual(shRecords[0].fields, ['01', '1', '001', '', '80']);
  assert.deepStrictEqual(shRecords[1].fields, ['02', '3', '', '患部に塗布', '35']);
  assert.deepStrictEqual(czRecords[0].fields.slice(0, 13), [
    '', '20260602', '20260602', '1', '14', '1', '1', '01', '420001810', '24', '', '', '80'
  ]);
  assert.deepStrictEqual(czRecords[1].fields.slice(0, 13), [
    '', '20260605', '20260605', '2', '1', '1', '1', '02', '420001910', '10', '', '', '35'
  ]);
  assert.deepStrictEqual(iyRecords.map((record) => record.fields.slice(0, 3)), [
    ['1', '620124201', '3'],
    ['1', '620000002', '2'],
    ['1', '620000003', '10.5']
  ]);
  assert.deepStrictEqual(tkRecord?.fields, ['810000002', '複数処方グループ確認']);
  assert.strictEqual(kiRecord?.fields[0], '20260605');
  assert.strictEqual(kiRecord?.fields[1], '2');
  assert.deepStrictEqual(file.records.at(-1), { type: 'GO', fields: ['1', '194', '99'] });
});

test('公式UKE本文はYJコード、桁超過、小数超過、誤ったKI種別を拒否する', () => {
  const base = {
    prescriptions: [{
      basic: { dosageFormCode: '1', usageCode: '001', unitDrugPoints: 24 },
      dispensingGroups: [{
        dispensing: {
          prescriptionDate: '2026-06-02',
          dispensingDate: '2026-06-02',
          receptionCount: 1,
          quantity: 7,
          burdenCategory: '1',
          calculationCategory: '1',
          calculationDestinationNumber: 1,
          dispensingFeeCode: '420001810',
          dispensingFeePoints: 24,
          drugPoints: 56
        },
        drugs: [{ burdenCategory: '1', receiptDrugCode: '620124201', amount: '3' }]
      }]
    }]
  };

  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      ...base,
      prescriptions: [{
        ...base.prescriptions[0],
        dispensingGroups: [{
          ...base.prescriptions[0].dispensingGroups[0],
          drugs: [{ burdenCategory: '1', receiptDrugCode: '2171022F1010', amount: '3' }]
        }]
      }]
    }),
    /レセ電医薬品コードは9桁/
  );
  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      ...base,
      prescriptions: [{
        ...base.prescriptions[0],
        dispensingGroups: [{
          ...base.prescriptions[0].dispensingGroups[0],
          drugs: [{ burdenCategory: '1', receiptDrugCode: '620124201', amount: '1.123456' }]
        }]
      }]
    }),
    /小数部5桁以内/
  );
  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      ...base,
      summaryComments: [{ code: '810000001', text: 'あ'.repeat(39) }]
    }),
    /76バイト以内/
  );
  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      ...base,
      managementRecords: [{ type: 'ST', fields: ['yakureki'] }]
    }),
    /KIレコードだけ/
  );
  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      ...base,
      prescriptions: [{
        ...base.prescriptions[0],
        dispensingGroups: [{
          ...base.prescriptions[0].dispensingGroups[0],
          dispensing: {
            ...base.prescriptions[0].dispensingGroups[0].dispensing,
            inclusiveManagementCode: '1'
          }
        }]
      }]
    }),
    /令和8年6月調剤以降/
  );
  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      ...base,
      prescriptions: [{
        ...base.prescriptions[0],
        dispensingGroups: [{
          ...base.prescriptions[0].dispensingGroups[0],
          dispensing: {
            ...base.prescriptions[0].dispensingGroups[0].dispensing,
            drugFeeReduction: { reductionCategory: '1', publicPoints: [1, 2, 3, 4, 5] }
          }
        }]
      }]
    }),
    /第四公費まで/
  );
  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      ...base,
      managementFeeRecords: [{
        calculationDate: '2026-06-01',
        receptionCount: 1,
        inclusiveManagementCode: '1'
      }]
    }),
    /令和8年6月調剤以降/
  );
  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      prescriptions: [],
      managementFeeRecords: [{
        calculationDate: '2026-05-31',
        receptionCount: 1,
        managementFees: Array.from({ length: 13 }, (_, index) => ({
          burdenCategory: '1',
          code: String(440012010 + index),
          count: 1,
          points: 45
        }))
      }]
    }),
    /12種類まで/
  );
  assert.throws(
    () => buildDispensingUkeOfficialClaimBody({
      prescriptions: [],
      managementFeeRecords: [{ calculationDate: '2026-05-31', receptionCount: 1 }]
    }),
    /少なくとも1つ/
  );
});
