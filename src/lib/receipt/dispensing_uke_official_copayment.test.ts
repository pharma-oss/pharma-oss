import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { UkeRecord } from './uke_generator.ts';
import {
  buildDispensingUkeOfficialFile,
  type DispensingUkeOfficialClaimInput
} from './dispensing_uke_official.ts';
import {
  DISPENSING_UKE_OFFICIAL_RECORD_SPEC,
  validateDispensingUkeRecords
} from './dispensing_uke_validation.ts';

// 公式レイアウトで組んだレコードは、公式の項目定義で検証する。
// アプリ独自レイアウト (既定の DISPENSING_UKE_KNOWN_RECORD_SPEC) とは項番が違う。
function validateOfficialIssues(records: UkeRecord[]) {
  return validateDispensingUkeRecords(records, {
    recordSpecs: DISPENSING_UKE_OFFICIAL_RECORD_SPEC,
    context: 'official_submission'
  });
}

/**
 * 公式項目定義に対するエラーだけを取り出す。
 * GO (請求情報) は DISPENSING_UKE_OFFICIAL_RECORD_SPEC に定義が無く警告が出るが、
 * これは本変更以前からの状態なので、ここでは切り分けて扱う。
 */
function validateOfficial(records: UkeRecord[]) {
  return validateOfficialIssues(records).filter((issue) => issue.severity === 'error');
}

// 高額療養費 (別表7 特記事項 / 別表8 一部負担金区分)、一部負担金、
// 減免 (別表10) を UKE へ記録する部分。
// レセ電はCSVの位置で項目が決まるので、「どの項番に入るか」を実際の出力で固定する。

const bodyRecords: UkeRecord[] = [
  { type: 'SH', fields: ['01', '1', '001', '', '127'] },
  { type: 'JD', fields: ['1'] },
  { type: 'IY', fields: ['1', '620000001', '1'] },
  { type: 'TK', fields: ['810000001', '摘要'] }
];

function buildFile(claim: DispensingUkeOfficialClaimInput) {
  return buildDispensingUkeOfficialFile({
    header: {
      payerOrganizationCode: '1',
      prefectureCode: '13',
      pharmacyCode: '1234567',
      pharmacyName: '青空薬局',
      claimMonth: '2026-06',
      phone: '03-1111-2222'
    },
    claims: [claim]
  });
}

function baseClaim(overrides: Partial<DispensingUkeOfficialClaimInput> = {}): DispensingUkeOfficialClaimInput {
  return {
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
    bodyRecords,
    totalPoints: 127,
    ...overrides
  };
}

function recordOf(records: UkeRecord[], type: string): UkeRecord {
  const record = records.find((item) => item.type === type);
  assert.ok(record, `${type} レコードがありません`);
  return record;
}

test('claims without copayment data keep the previous record length', () => {
  // 任意項目を渡さなければ1バイトも増やさない (末尾の空項目は省略できる)。
  const { records } = buildFile(baseClaim());
  assert.equal(recordOf(records, 'RE').fields.length, 6);
  assert.equal(recordOf(records, 'HO').fields.length, 5);
});

test('high-cost limit category is written to the RE special note field', () => {
  const { records } = buildFile(baseClaim({
    common: {
      ...baseClaim().common,
      benefitRatio: 70,
      // 区ウ + 多ウ を同時に持つことはないので、ここは区ウ単独
      specialNoteCodes: ['28'],
      copaymentCategoryCode: '1'
    }
  }));
  const re = recordOf(records, 'RE');

  assert.equal(re.fields[6], '70', '給付割合は第7項目');
  assert.equal(re.fields[7], '28', 'レセプト特記事項は第8項目');
  assert.equal(re.fields[39], '1', '一部負担金区分は第40項目');
  // 間の項目は空で埋める (位置がずれるとレセプトが読めなくなる)
  assert.deepEqual(re.fields.slice(8, 39), Array.from({ length: 31 }, () => ''));
  assert.equal(re.fields.length, 40);

  assert.deepEqual(validateOfficial(records), []);
});

test('multiple special notes are concatenated in two-byte units', () => {
  const { records } = buildFile(baseClaim({
    common: { ...baseClaim().common, specialNoteCodes: ['01', '28', '02'] }
  }));
  assert.equal(recordOf(records, 'RE').fields[7], '012802');
});

test('special note field rejects more than five codes and unknown codes', () => {
  assert.throws(
    () => buildFile(baseClaim({
      common: { ...baseClaim().common, specialNoteCodes: ['01', '02', '03', '04', '07', '08'] }
    })),
    /最大5つ/
  );
  assert.throws(
    () => buildFile(baseClaim({
      common: { ...baseClaim().common, specialNoteCodes: ['99'] }
    })),
    /別表7にないレセプト特記事項コード/
  );
  assert.throws(
    () => buildFile(baseClaim({
      common: { ...baseClaim().common, specialNoteCodes: ['28', '28'] }
    })),
    /重複/
  );
});

test('copayment category outside 別表8 is refused', () => {
  // 「2」は別表8に無い。埋めると審査側で突合できない。
  assert.throws(
    () => buildFile(baseClaim({
      common: { ...baseClaim().common, copaymentCategoryCode: '2' }
    })),
    /別表8にない一部負担金区分コード/
  );
});

test('copayment and reduction are written to the HO record', () => {
  const { records } = buildFile(baseClaim({
    insurances: [{
      insurerNumber: '06139999',
      symbol: '111',
      number: '123456',
      prescriptionCount: 1,
      totalPoints: 127,
      certificateNumber: '012',
      copaymentYen: 380,
      copaymentReduction: { code: '1', ratioPercent: 30, reducedYen: 120 }
    }]
  }));
  const ho = recordOf(records, 'HO');

  assert.equal(ho.fields[7], '012', '証明書番号は第8項目');
  assert.equal(ho.fields[8], '380', '一部負担金は第9項目');
  assert.equal(ho.fields[9], '', '第10項目は予備');
  assert.equal(ho.fields[10], '1', '減免区分は第11項目');
  assert.equal(ho.fields[11], '30', '減額割合は第12項目');
  assert.equal(ho.fields[12], '120', '減額金額は第13項目');
  assert.equal(ho.fields[5], '', '第6項目は予備');
  assert.equal(ho.fields[6], '', '職務上の事由は未指定');

  assert.deepEqual(validateOfficial(records), []);
});

test('exemption records only the reduction code', () => {
  // 別表10 の「2 免除」。割合も金額も無い。
  const { records } = buildFile(baseClaim({
    insurances: [{
      insurerNumber: '06139999',
      number: '123456',
      prescriptionCount: 1,
      totalPoints: 127,
      copaymentReduction: { code: '2' }
    }]
  }));
  const ho = recordOf(records, 'HO');
  assert.equal(ho.fields[10], '2');
  assert.equal(ho.fields.length, 11, '減額割合以降は空なので伸ばさない');
  assert.deepEqual(validateOfficial(records), []);
});

test('reduction validation refuses unknown codes and impossible ratios', () => {
  const withCode = (code: string, ratioPercent?: number) => () => buildFile(baseClaim({
    insurances: [{
      insurerNumber: '06139999',
      number: '123456',
      prescriptionCount: 1,
      totalPoints: 127,
      copaymentReduction: { code, ratioPercent }
    }]
  }));

  assert.throws(withCode('4'), /別表10にない減免区分コード/);
  assert.throws(withCode('1', 120), /100以下/);
  assert.throws(
    () => buildFile(baseClaim({
      insurances: [{
        insurerNumber: '06139999',
        number: '123456',
        prescriptionCount: 1,
        totalPoints: 127,
        certificateNumber: '1234'
      }]
    })),
    /証明書番号は数字（3桁）で入力してください。/
  );
});

test('public expense copayment fields land on the KO record', () => {
  const { records } = buildFile(baseClaim({
    publicExpenses: [{
      payerNumber: '51136018',
      recipientNumber: '1234567',
      prescriptionCount: 1,
      totalPoints: 127,
      copaymentYen: 500,
      publicBenefitCopaymentYen: 380
    }]
  }));
  const ko = recordOf(records, 'KO');

  assert.equal(ko.fields[6], '500', '一部負担金額は第7項目');
  assert.equal(ko.fields[7], '', '第8項目は予備');
  assert.equal(ko.fields[8], '380', '公費給付対象一部負担金は第9項目');
  assert.deepEqual(validateOfficial(records), []);
});

test('the only official-spec warning is the pre-existing missing GO definition', () => {
  // 本変更で新しい警告を増やしていないことを固定する。
  const { records } = buildFile(baseClaim({
    common: {
      ...baseClaim().common,
      benefitRatio: 70,
      specialNoteCodes: ['28'],
      copaymentCategoryCode: '1'
    }
  }));
  const warnings = validateOfficialIssues(records).filter((issue) => issue.severity === 'warning');
  assert.deepEqual(warnings.map((issue) => issue.code), ['uke_unknown_record_type']);
  assert.deepEqual(warnings.map((issue) => issue.recordType), ['GO']);
});
