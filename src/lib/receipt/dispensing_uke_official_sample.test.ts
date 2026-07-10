import { test } from 'node:test';
import assert from 'node:assert';
import encoding from 'encoding-japanese';
import {
  buildDispensingUkeOfficialSampleGenerationReadiness,
  buildDispensingUkeOfficialSampleAllFieldValidationReport,
  buildDispensingUkeGeneratedRecordProfileReport,
  buildDispensingUkeOfficialSampleRecordProfileReport,
  buildDispensingUkeOfficialSampleReview,
  buildDispensingUkeOfficialSampleUnobservedGeneratedRecordReview,
  buildDispensingUkeOfficialSampleUnobservedGeneratedRecordReviewCsv,
  compareDispensingUkeRecordProfiles,
  convertOfficialSampleRecordsToUkeRecords,
  extractDispensingUkeOfficialSampleZip,
  formatDispensingUkeOfficialSampleGenerationReadiness,
  formatDispensingUkeOfficialSampleRecordProfileReport,
  formatDispensingUkeRecordProfileComparisonReport,
  formatDispensingUkeOfficialSampleReview,
  formatDispensingUkeOfficialSampleUnobservedGeneratedRecordReview,
  parseDispensingUkeOfficialSampleRecodeInfoCsv,
  validateDispensingUkeOfficialSampleRecords
} from './dispensing_uke_official_sample.ts';
import {
  DISPENSING_UKE_KNOWN_RECORD_SPEC,
  validateDispensingUkeRecords
} from './dispensing_uke_validation.ts';

interface ZipFixtureEntry {
  name: string;
  text: string;
  method?: 0 | 8;
}

function encodeShiftJis(value: string): Uint8Array {
  const converted = encoding.convert(encoding.stringToCode(value), {
    from: 'UNICODE',
    to: 'SJIS'
  }) as number[];
  return Uint8Array.from(converted);
}

function writeUint16(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >> 8) & 0xff);
}

function writeUint32(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
}

function pushBytes(bytes: number[], values: Uint8Array | number[]) {
  bytes.push(...Array.from(values));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const source = new Response(toArrayBuffer(bytes)).body;
  assert.ok(source);
  const compressed = source.pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

async function buildZipFixture(entries: ZipFixtureEntry[]): Promise<Uint8Array> {
  const localBytes: number[] = [];
  const centralBytes: number[] = [];
  const centralRecords: Array<{
    nameBytes: Uint8Array;
    method: number;
    compressed: Uint8Array;
    uncompressedSize: number;
    localHeaderOffset: number;
  }> = [];

  for (const entry of entries) {
    const method = entry.method ?? 0;
    const nameBytes = encodeShiftJis(entry.name);
    const contentBytes = encodeShiftJis(entry.text);
    const compressed = method === 8 ? await deflateRaw(contentBytes) : contentBytes;
    const localHeaderOffset = localBytes.length;

    writeUint32(localBytes, 0x04034b50);
    writeUint16(localBytes, 20);
    writeUint16(localBytes, 0);
    writeUint16(localBytes, method);
    writeUint16(localBytes, 0);
    writeUint16(localBytes, 0);
    writeUint32(localBytes, 0);
    writeUint32(localBytes, compressed.byteLength);
    writeUint32(localBytes, contentBytes.byteLength);
    writeUint16(localBytes, nameBytes.byteLength);
    writeUint16(localBytes, 0);
    pushBytes(localBytes, nameBytes);
    pushBytes(localBytes, compressed);

    centralRecords.push({
      nameBytes,
      method,
      compressed,
      uncompressedSize: contentBytes.byteLength,
      localHeaderOffset
    });
  }

  const centralDirectoryOffset = localBytes.length;
  for (const record of centralRecords) {
    writeUint32(centralBytes, 0x02014b50);
    writeUint16(centralBytes, 20);
    writeUint16(centralBytes, 20);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, record.method);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint32(centralBytes, 0);
    writeUint32(centralBytes, record.compressed.byteLength);
    writeUint32(centralBytes, record.uncompressedSize);
    writeUint16(centralBytes, record.nameBytes.byteLength);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint16(centralBytes, 0);
    writeUint32(centralBytes, 0);
    writeUint32(centralBytes, record.localHeaderOffset);
    pushBytes(centralBytes, record.nameBytes);
  }

  const eocdBytes: number[] = [];
  writeUint32(eocdBytes, 0x06054b50);
  writeUint16(eocdBytes, 0);
  writeUint16(eocdBytes, 0);
  writeUint16(eocdBytes, entries.length);
  writeUint16(eocdBytes, entries.length);
  writeUint32(eocdBytes, centralBytes.length);
  writeUint32(eocdBytes, centralDirectoryOffset);
  writeUint16(eocdBytes, 0);

  return Uint8Array.from([...localBytes, ...centralBytes, ...eocdBytes]);
}

function padFields(fields: string[], size: number): string[] {
  return [...fields, ...Array(Math.max(0, size - fields.length)).fill('')];
}

function rec(type: string, fields: string[], claimSerial = '1', rowSerial = '1', status = '0'): string {
  return [claimSerial, rowSerial, status, type, ...fields].join(',');
}

const officialStyleRecodeInfo = [
  rec('YK', padFields(['1', '13', '4', '9999946', 'サンプル調剤薬局', '202407', '00', '03-9999-9999'], 8), '1', '1'),
  rec('RE', padFields(['7', '4118', '202406', 'サンプル　二', '1', '19491010', '', '29', '13', '1'], 41), '1', '2'),
  rec('HO', padFields(['06132013', '１１１', '１１３４５６', '1', '528'], 13), '1', '3'),
  rec('SN', padFields(['1', '01', '', '', '', '46', '', ''], 8), '1', '4'),
  rec('JD', padFields(['1'], 32), '1', '5'),
  rec('SH', padFields(['01', '1', '001', '', '3'], 9), '1', '6'),
  rec('CZ', padFields(['1', '20240616', '20240616', '1', '60', '1', '1', '01', '420001810', '24'], 70), '1', '7'),
  rec('IY', padFields(['1', '620124201', '4'], 9), '1', '8'),
  rec('CO', ['810000001', '"薬品番号,引用あり"'], '1', '9'),
  rec('TK', ['810000001', '特例による２か月処方'], '1', '10')
].join('\r\n');

test('extractDispensingUkeOfficialSampleZip extracts Shift-JIS RECODEINFO records from official-style ZIP', async () => {
  const zip = await buildZipFixture([
    {
      name: 'サンプルシ/0_COMMON001/04_PECULIARTEXTINFO_PHA.CSV',
      text: '1,1,0,CO,810000001,摘要',
      method: 0
    },
    {
      name: 'サンプルシ/0_COMMON001/14_RECODEINFO_PHA.CSV',
      text: officialStyleRecodeInfo,
      method: 8
    }
  ]);

  const extraction = await extractDispensingUkeOfficialSampleZip(zip);
  const review = buildDispensingUkeOfficialSampleReview(extraction);
  const readiness = buildDispensingUkeOfficialSampleGenerationReadiness(review);
  const unobservedReview = buildDispensingUkeOfficialSampleUnobservedGeneratedRecordReview(readiness);
  const unobservedCsv = buildDispensingUkeOfficialSampleUnobservedGeneratedRecordReviewCsv(unobservedReview);
  const profileReport = buildDispensingUkeOfficialSampleRecordProfileReport(extraction.records);
  const snProfile = profileReport.recordTypeProfiles.find((profile) => profile.recordType === 'SN');
  const ykProfile = profileReport.recordTypeProfiles.find((profile) => profile.recordType === 'YK');
  const coProfile = profileReport.recordTypeProfiles.find((profile) => profile.recordType === 'CO');
  const exactGeneratedProfileReport = buildDispensingUkeGeneratedRecordProfileReport(
    convertOfficialSampleRecordsToUkeRecords(extraction.records),
    '公式サンプル由来UKE'
  );
  const exactComparison = compareDispensingUkeRecordProfiles(profileReport, exactGeneratedProfileReport);
  const generatedShapeRecords = convertOfficialSampleRecordsToUkeRecords(extraction.records)
    .filter((record) => record.type !== 'SN')
    .map((record) => record.type === 'YK' ? { ...record, fields: record.fields.slice(0, 7) } : record);
  generatedShapeRecords.push({ type: 'ST', fields: ['20260602101112', 'yakureki'] });
  const generatedProfileReport = buildDispensingUkeGeneratedRecordProfileReport(generatedShapeRecords);
  const comparison = compareDispensingUkeRecordProfiles(profileReport, generatedProfileReport);
  const ykComparison = comparison.items.find((item) => item.recordType === 'YK');

  assert.deepStrictEqual(extraction.issues, []);
  assert.strictEqual(extraction.entries.length, 2);
  assert.strictEqual(extraction.recodeInfoFiles.length, 1);
  assert.ok(extraction.recodeInfoFiles[0].fileName.includes('サンプルシ'));
  assert.strictEqual(extraction.records.length, 10);
  assert.strictEqual(extraction.records[8].fields[1], '薬品番号,引用あり');
  assert.strictEqual(review.ok, false);
  assert.strictEqual(review.sourceUrl.endsWith('/phasample.zip'), true);
  assert.strictEqual(review.recordCount, 10);
  assert.strictEqual(review.claimCount, 1);
  assert.ok(review.officialRecordTypes.includes('SN'));
  assert.ok(review.knownRecordTypes.includes('SN'));
  assert.deepStrictEqual(review.unsupportedOfficialRecordTypes, []);
  assert.deepStrictEqual(review.validationOnlyOfficialRecordTypes, []);
  assert.ok(review.supportedOfficialRecordTypes.includes('YK'));
  assert.ok(review.supportedOfficialRecordTypes.includes('SN'));
  assert.ok(review.requiredImplementedRecordTypesNotObserved.includes('ST'));
  assert.strictEqual(review.validationIssueCount, 0);
  assert.strictEqual(review.validationErrorCount, 0);
  assert.strictEqual(review.validationWarningCount, 0);
  assert.strictEqual(readiness.ok, false);
  assert.deepStrictEqual(readiness.generationGapRecordTypes, []);
  assert.deepStrictEqual(readiness.requiredGeneratedRecordTypesNotObserved, ['ST']);
  assert.ok(readiness.blockingReasons.some((reason) => reason.recordType === 'ST'));
  assert.match(formatDispensingUkeOfficialSampleGenerationReadiness(readiness), /公式サンプル未観測 .*ST/);
  assert.strictEqual(unobservedReview.ok, true);
  assert.deepStrictEqual(unobservedReview.recordTypes, ['KO', 'MF', 'KI', 'TO', 'ST']);
  assert.deepStrictEqual(unobservedReview.needsReviewRecordTypes, []);
  assert.ok(unobservedReview.items.some((item) => item.recordType === 'MF' && item.reason.includes('窓口負担額情報')));
  assert.ok(unobservedReview.items.some((item) => item.recordType === 'TO' && item.reason.includes('薬剤料')));
  assert.ok(unobservedReview.items.some((item) => item.recordType === 'ST' && item.reason.includes('出力ファイル終端')));
  assert.match(formatDispensingUkeOfficialSampleUnobservedGeneratedRecordReview(unobservedReview), /理由確認済み KO・MF・KI・TO・ST/);
  assert.match(unobservedCsv, /^"出典","レコード種別","レコード名","実装範囲","判定","未観測理由","次の対応","完了条件"/);
  assert.match(unobservedCsv, /"MF","窓口負担額情報","条件付き生成","理由確認済み"/);
  assert.match(unobservedCsv, /"TO","薬剤料・摘要情報","条件付き生成","理由確認済み"/);
  assert.match(unobservedCsv, /"ST","出力情報","常時生成","理由確認済み"/);
  assert.strictEqual(profileReport.recordCount, 10);
  assert.strictEqual(profileReport.recordTypeCount, 10);
  assert.ok(snProfile);
  assert.deepStrictEqual(snProfile.nonBlankFieldNumbers, [1, 2, 6]);
  assert.strictEqual(snProfile.fields[5].digitOnlyCount, 1);
  assert.ok(ykProfile);
  assert.strictEqual(ykProfile.fields[5].monthLikeCount, 1);
  assert.ok(coProfile);
  assert.ok(coProfile.fields[1].maxShiftJisByteLength > coProfile.fields[1].maxCharacterLength);
  assert.match(formatDispensingUkeOfficialSampleRecordProfileReport(profileReport), /項目プロファイル/);
  const serializedProfile = JSON.stringify(profileReport);
  assert.doesNotMatch(serializedProfile, /サンプル調剤薬局/);
  assert.doesNotMatch(serializedProfile, /薬品番号,引用あり/);
  assert.strictEqual(exactComparison.ok, true);
  assert.match(formatDispensingUkeRecordProfileComparisonReport(exactComparison), /項目形状比較: OK/);
  assert.strictEqual(comparison.ok, false);
  assert.deepStrictEqual(comparison.officialOnlyRecordTypes, ['SN']);
  assert.deepStrictEqual(comparison.generatedOnlyRecordTypes, ['ST']);
  assert.deepStrictEqual(comparison.fieldCountMismatchRecordTypes, ['YK']);
  assert.deepStrictEqual(comparison.nonBlankMismatchRecordTypes, ['YK']);
  assert.ok(ykComparison);
  assert.strictEqual(ykComparison.fieldCountStatus, 'generated_shorter');
  assert.deepStrictEqual(ykComparison.missingGeneratedNonBlankFieldNumbers, [8]);
  assert.match(formatDispensingUkeRecordProfileComparisonReport(comparison), /公式だけ SN/);
  assert.match(formatDispensingUkeRecordProfileComparisonReport(comparison), /生成だけ ST/);
  const serializedComparison = JSON.stringify(comparison);
  assert.doesNotMatch(serializedComparison, /サンプル調剤薬局/);
  assert.doesNotMatch(serializedComparison, /薬品番号,引用あり/);
});

test('parseDispensingUkeOfficialSampleRecodeInfoCsv reports malformed sample rows', () => {
  const parsed = parseDispensingUkeOfficialSampleRecodeInfoCsv([
    '1,1,0,YK,1,13',
    '\x1a1,2,0,RE,7,4118',
    'broken,row',
    '\x1a'
  ].join('\n'));

  assert.strictEqual(parsed.records.length, 2);
  assert.strictEqual(parsed.records[0].recordType, 'YK');
  assert.strictEqual(parsed.records[1].recordType, 'RE');
  assert.strictEqual(parsed.issues.length, 1);
  assert.match(parsed.issues[0], /レコード種別/);
});

test('buildDispensingUkeOfficialSampleReview passes when official records are fully supported', () => {
  const parsed = parseDispensingUkeOfficialSampleRecodeInfoCsv([
    rec('YK', padFields(['1', '13', '4', '9999946', 'サンプル調剤薬局', '202407', '00', '03-9999-9999'], 8), '1', '1'),
    rec('RE', padFields(['7', '4118', '202406', 'サンプル　二'], 41), '1', '2'),
    rec('JD', padFields(['1'], 32), '1', '3'),
    rec('SH', padFields(['01', '1', '001'], 9), '1', '4'),
    rec('TK', ['0', '摘要'], '1', '5'),
    rec('ST', ['20260604120000', 'yakureki'], '1', '6')
  ].join('\n'));
  const review = buildDispensingUkeOfficialSampleReview({
    entries: [{ fileName: '14_RECODEINFO_PHA.CSV', compressedSize: 1, uncompressedSize: 1, compressionMethod: 0 }],
    recodeInfoFiles: [{ fileName: '14_RECODEINFO_PHA.CSV', text: '', recordCount: parsed.records.length }],
    records: parsed.records,
    issues: parsed.issues
  });
  const readiness = buildDispensingUkeOfficialSampleGenerationReadiness(review);

  assert.strictEqual(review.ok, true);
  assert.deepStrictEqual(review.unsupportedOfficialRecordTypes, []);
  assert.deepStrictEqual(review.validationOnlyOfficialRecordTypes, []);
  assert.deepStrictEqual(review.requiredImplementedRecordTypesNotObserved, []);
  assert.strictEqual(review.validationIssueCount, 0);
  assert.strictEqual(readiness.ok, true);
  assert.deepStrictEqual(readiness.generationGapRecordTypes, []);
  assert.deepStrictEqual(readiness.requiredGeneratedRecordTypesNotObserved, []);
  assert.deepStrictEqual(readiness.generationReadyOfficialRecordTypes, ['JD', 'RE', 'SH', 'ST', 'TK', 'YK']);
  assert.deepStrictEqual(readiness.blockingReasons, []);
  assert.match(formatDispensingUkeOfficialSampleGenerationReadiness(readiness), /自動生成準備: OK/);
});

test('validateDispensingUkeOfficialSampleRecords uses official sample field positions', () => {
  const parsed = parseDispensingUkeOfficialSampleRecodeInfoCsv([
    '2,1,0,MN,940000030,東京都港区新橋,13450607940000030,,,',
    '1,2,0,YK,1,13,4,9999946,サンプル調剤薬局,202407,00,03-9999-9999',
    '1,3,0,RE,7,4118,202406,サンプル　二,1,19491010,,29,13,1,9999913,サンプル病院,東京都港区新橋,基金　太郎,,,,,,,,,,,,,,,,,,,,,,,,,,,サンプルニ',
    '1,4,0,IY,1,620124201,4,,,,,,',
    '2,5,1,EX,,,,,,,,,,,,1:202407:',
    '2,6,0,RC,Ver00001db528af87bae99b304282f514dc2f5a3'
  ].join('\n'));

  const generatedIssues = validateDispensingUkeRecords(convertOfficialSampleRecordsToUkeRecords(parsed.records));
  const officialSampleIssues = validateDispensingUkeOfficialSampleRecords(parsed.records);

  assert.ok(generatedIssues.some((issue) => issue.code === 'uke_first_record_not_yk'));
  assert.ok(generatedIssues.some((issue) => issue.code === 'uke_last_record_not_st'));
  assert.deepStrictEqual(officialSampleIssues, []);
});

test('official sample validation carries staged all-field checks and review summary', () => {
  const specsWithYkAllFields = DISPENSING_UKE_KNOWN_RECORD_SPEC.map((spec) => (
    spec.type === 'YK'
      ? {
        ...spec,
        allFields: [
          { index: 3, label: '薬局郵便番号', required: true, format: 'digits' as const, lengths: [7] }
        ]
      }
      : spec
  ));
  const parsed = parseDispensingUkeOfficialSampleRecodeInfoCsv([
    rec('YK', padFields(['1', '13', '4', '999-946', 'サンプル調剤薬局', '202407', '00', '03-9999-9999'], 8)),
    rec('ST', ['20260604120000', 'yakureki'], '1', '2')
  ].join('\n'));
  const options = { recordSpecs: specsWithYkAllFields };
  const issues = validateDispensingUkeOfficialSampleRecords(parsed.records, options);
  const report = buildDispensingUkeOfficialSampleAllFieldValidationReport(parsed.records, options);
  const review = buildDispensingUkeOfficialSampleReview({
    entries: [{ fileName: '14_RECODEINFO_PHA.CSV', compressedSize: 1, uncompressedSize: 1, compressionMethod: 0 }],
    recodeInfoFiles: [{ fileName: '14_RECODEINFO_PHA.CSV', text: '', recordCount: parsed.records.length }],
    records: parsed.records,
    issues: parsed.issues
  }, options);

  assert.ok(issues.some((issue) => issue.code === 'yk_all_field_4_digits_invalid'));
  assert.strictEqual(report.checkedFieldCount, 1);
  assert.strictEqual(report.issueFieldCount, 1);
  assert.strictEqual(report.formatIssueFieldCount, 1);
  assert.deepStrictEqual(report.recordTypesWithIssues, ['YK']);
  assert.strictEqual(review.allFieldValidationReport.issueFieldCount, 1);
  assert.match(formatDispensingUkeOfficialSampleReview(review), /allFields 確認 1 指摘 1/);
});
