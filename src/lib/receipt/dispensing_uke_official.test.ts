import { test } from 'node:test';
import assert from 'node:assert';
import encoding from 'encoding-japanese';
import type { UkeRecord } from './uke_generator.ts';
import {
  buildDispensingUkeOfficialFile,
  DISPENSING_UKE_OFFICIAL_FILE_NAME,
  formatDispensingUkeGregorianDate,
  formatDispensingUkeGregorianMonth,
  generateDispensingUkeOfficialContent
} from './dispensing_uke_official.ts';

const bodyRecords: UkeRecord[] = [
  { type: 'SH', fields: ['01', '1', '001', '', '127'] },
  { type: 'IY', fields: ['1', '620000001', '1'] },
  { type: 'TK', fields: ['810000001', '摘要'] }
];

test('公式UKE日付は令和8年6月版仕様に従い西暦YYYYMM/YYYYMMDDへ変換する', () => {
  assert.strictEqual(formatDispensingUkeGregorianMonth('2026-06'), '202606');
  assert.strictEqual(formatDispensingUkeGregorianMonth('2019-04'), '201904');
  assert.strictEqual(formatDispensingUkeGregorianMonth('2019-05'), '201905');
  assert.strictEqual(formatDispensingUkeGregorianDate('2019-04-30'), '20190430');
  assert.strictEqual(formatDispensingUkeGregorianDate('2019-05-01'), '20190501');
  assert.strictEqual(formatDispensingUkeGregorianDate('1980-04-05'), '19800405');
});

test('公式提出ファイルはYKからGOまで標準レコードだけで組み立てる', () => {
  const result = buildDispensingUkeOfficialFile({
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
        symbol: '111',
        number: '123456',
        prescriptionCount: 1,
        totalPoints: 127
      }],
      publicExpenses: [{
        payerNumber: '51136018',
        recipientNumber: '1234567',
        prescriptionCount: 1,
        totalPoints: 127
      }],
      bodyRecords,
      totalPoints: 127
    }]
  });

  assert.strictEqual(result.fileName, DISPENSING_UKE_OFFICIAL_FILE_NAME);
  assert.deepStrictEqual(result.records.map((record) => record.type), ['YK', 'RE', 'HO', 'KO', 'SH', 'IY', 'TK', 'GO']);
  assert.deepStrictEqual(result.records[0].fields, ['1', '13', '4', '1234567', '青空薬局', '202606', '00', '03-1111-2222']);
  assert.deepStrictEqual(result.records[1].fields, ['1', '4118', '202606', '山田 太郎', '1', '19800405']);
  assert.deepStrictEqual(result.records.at(-1)?.fields, ['1', '127', '99']);
  assert.strictEqual(result.totalClaims, 1);
  assert.strictEqual(result.totalPoints, 127);
  assert.strictEqual(result.gate.ok, true);
  assert.deepStrictEqual(result.gate.nonStandardRecordTypes, []);
});

test('公式提出ファイルはYK全項目定義に従い電話番号欠落を拒否する', () => {
  assert.throws(
    () => buildDispensingUkeOfficialFile({
      header: {
        payerOrganizationCode: '1',
        prefectureCode: '13',
        pharmacyCode: '1234567',
        pharmacyName: '青空薬局',
        claimMonth: '2026-06'
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
        totalPoints: 127
      }]
    }),
    /電話番号は全項目定義で必須/
  );
});

test('公式提出ファイルはRE/HO/KO全項目定義に従い主要項目欠落を拒否する', () => {
  assert.throws(
    () => buildDispensingUkeOfficialFile({
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
          symbol: '111',
          prescriptionCount: 1,
          totalPoints: 127
        }],
        bodyRecords,
        totalPoints: 127
      }]
    }),
    /被保険者番号は全項目定義で必須/
  );
});

test('公式提出ファイルは本文レコード全項目定義に従い主要項目欠落を拒否する', () => {
  assert.throws(
    () => buildDispensingUkeOfficialFile({
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
        bodyRecords: [
          { type: 'SH', fields: ['01', '1', '001', '', '24'] },
          { type: 'IY', fields: ['1', ''] }
        ],
        totalPoints: 127
      }]
    }),
    /医薬品コードは全項目定義で必須/
  );
});

test('公式提出ファイルは条件付きSNをHOまたはKOなしで出力しない', () => {
  assert.throws(
    () => buildDispensingUkeOfficialFile({
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
        bodyRecords: [
          { type: 'SN', fields: ['1', '01', '06139999', '記号', '123456', '01', '', ''] },
          { type: 'SH', fields: ['01', '1', '', '', '123'] }
        ],
        totalPoints: 127
      }]
    }),
    /SNレコードは同じレセプト内のHOまたはKOに付随/
  );
});

test('公式提出ファイルは複数レセプトの件数と点数をGOへ集計する', () => {
  const commonHeader = {
    payerOrganizationCode: '2' as const,
    prefectureCode: '13',
    pharmacyCode: '1234567',
    pharmacyName: '青空薬局',
    claimMonth: '2026-06',
    phone: '03-1111-2222'
  };
  const claim = (claimNumber: number, totalPoints: number) => ({
    common: {
      claimNumber,
      claimTypeCode: '4218',
      dispensingMonth: '2026-06',
      patientName: `患者 ${claimNumber}`,
      genderCode: '2' as const,
      birthDate: '1990-01-08'
    },
    bodyRecords,
    totalPoints
  });
  const result = buildDispensingUkeOfficialFile({
    header: commonHeader,
    claims: [claim(1, 100), claim(2, 250)]
  });

  assert.deepStrictEqual(result.records.at(-1), { type: 'GO', fields: ['2', '350', '99'] });
});

test('公式提出ファイルは本文不足、非標準レコード、重複番号を拒否する', () => {
  const base = {
    header: {
      payerOrganizationCode: '1' as const,
      prefectureCode: '13',
      pharmacyCode: '1234567',
      pharmacyName: '青空薬局',
      claimMonth: '2026-06',
      phone: '03-1111-2222'
    },
    common: {
      claimNumber: 1,
      claimTypeCode: '4118',
      dispensingMonth: '2026-06',
      patientName: '山田 太郎',
      genderCode: '1' as const,
      birthDate: '1980-04-05'
    }
  };

  assert.throws(
    () => buildDispensingUkeOfficialFile({ ...base, claims: [{ common: base.common, bodyRecords: [], totalPoints: 1 }] }),
    /SHまたはKI/
  );
  assert.throws(
    () => buildDispensingUkeOfficialFile({
      ...base,
      claims: [{ common: base.common, bodyRecords: [{ type: 'KH', fields: ['1'] }, { type: 'SH', fields: ['01'] }], totalPoints: 1 }]
    }),
    /KHレコード/
  );
  assert.throws(
    () => buildDispensingUkeOfficialFile({
      ...base,
      claims: [
        { common: base.common, bodyRecords, totalPoints: 1 },
        { common: base.common, bodyRecords, totalPoints: 1 }
      ]
    }),
    /重複/
  );
});

test('公式提出内容はShift-JIS、CRLF、EOFで出力し引用が必要な値を拒否する', () => {
  const result = buildDispensingUkeOfficialFile({
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
      totalPoints: 127
    }]
  });
  const bytes = generateDispensingUkeOfficialContent(result.records);
  const decoded = encoding.codeToString(encoding.convert([...bytes.slice(0, -1)], {
    to: 'UNICODE',
    from: 'SJIS'
  }));

  assert.strictEqual(bytes.at(-1), 0x1a);
  assert.match(decoded, /^YK,1,13,4,1234567,青空薬局,202606,00,03-1111-2222\r\nRE,/);
  assert.match(decoded, /GO,1,127,99\r\n$/);
  assert.ok(!decoded.includes('"'));
  assert.throws(
    () => generateDispensingUkeOfficialContent([{ type: 'CO', fields: ['810000001', 'カンマ,あり'] }]),
    /カンマ、引用符、改行/
  );
  assert.throws(
    () => generateDispensingUkeOfficialContent([
      ...result.records.slice(0, -1),
      { type: 'CO', fields: ['810000001', '絵文字😀'] },
      result.records.at(-1)!
    ]),
    /Shift-JISで表現できない文字/
  );
  assert.throws(
    () => generateDispensingUkeOfficialContent(result.records.slice(0, -1)),
    /末尾はGOレコード/
  );
});
