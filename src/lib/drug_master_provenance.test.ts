import { test } from 'node:test';
import assert from 'node:assert';
import { webcrypto } from 'node:crypto';
import {
  buildDrugMasterSourceEvidence,
  extractSskDrugMasterDownloadCandidates,
  formatDrugMasterSourceUrlReview,
  normalizeDrugMasterSourceUrl,
  reviewDrugMasterSourceUrl,
  sha256Hex
} from './drug_master_provenance.ts';

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true
  });
}

test('normalizeDrugMasterSourceUrl accepts http and https URLs', () => {
  assert.strictEqual(
    normalizeDrugMasterSourceUrl(' https://www.ssk.or.jp/download/index.html '),
    'https://www.ssk.or.jp/download/index.html'
  );
  assert.strictEqual(normalizeDrugMasterSourceUrl(''), undefined);
});

test('normalizeDrugMasterSourceUrl rejects unsafe URLs', () => {
  assert.throws(() => normalizeDrugMasterSourceUrl('javascript:alert(1)'), /http:\/\/ または https:\/\//);
  assert.throws(() => normalizeDrugMasterSourceUrl('not a url'), /http:\/\/ または https:\/\//);
});

test('sha256Hex returns a stable digest', async () => {
  const digest = await sha256Hex(new TextEncoder().encode('abc').buffer);

  assert.strictEqual(
    digest,
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('buildDrugMasterSourceEvidence captures provenance fields', async () => {
  const evidence = await buildDrugMasterSourceEvidence({
    sourceFileName: 'iyakuhin.csv',
    sourceFileType: 'zip',
    extractedCsvFileName: 'y_all.csv',
    archiveEntryCount: 2,
    csvEntryCount: 1,
    sourceUrl: 'https://www.ssk.or.jp/download/index.html',
    fileSizeBytes: 3,
    arrayBuffer: new TextEncoder().encode('abc').buffer,
    capturedAt: new Date('2026-06-16T01:02:03.000Z'),
    layoutLabel: 'ヘッダー列名',
    rowCount: 12,
    skippedRowCount: 1,
    sourceUrlReviewLabel: '支払基金 医薬品マスター候補ファイル',
    specificationRevisionLabel: '支払基金 令和8年基本マスターファイルレイアウト 医薬品マスター: OK / 仕様PDF master_3_20260601.pdf',
    specificationSourceUrl: 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.files/master_3_20260601.pdf'
  });

  assert.strictEqual(evidence.sourceFileName, 'iyakuhin.csv');
  assert.strictEqual(evidence.sourceFileType, 'zip');
  assert.strictEqual(evidence.extractedCsvFileName, 'y_all.csv');
  assert.strictEqual(evidence.archiveEntryCount, 2);
  assert.strictEqual(evidence.csvEntryCount, 1);
  assert.strictEqual(evidence.sourceUrl, 'https://www.ssk.or.jp/download/index.html');
  assert.strictEqual(evidence.fileSizeBytes, 3);
  assert.strictEqual(evidence.sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(evidence.capturedAt, '2026-06-16T01:02:03.000Z');
  assert.strictEqual(evidence.layoutLabel, 'ヘッダー列名');
  assert.strictEqual(evidence.rowCount, 12);
  assert.strictEqual(evidence.skippedRowCount, 1);
  assert.strictEqual(evidence.sourceUrlReviewLabel, '支払基金 医薬品マスター候補ファイル');
  assert.match(evidence.specificationRevisionLabel || '', /master_3_20260601\.pdf/);
  assert.strictEqual(evidence.specificationSourceUrl, 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.files/master_3_20260601.pdf');
});

test('reviewDrugMasterSourceUrl identifies SSK drug master URLs', () => {
  const pageReview = reviewDrugMasterSourceUrl('https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/kihonmasta_04.html');
  assert.strictEqual(pageReview.isOfficialSskUrl, true);
  assert.strictEqual(pageReview.sourceKind, 'ssk-drug-master-page');
  assert.match(formatDrugMasterSourceUrlReview(pageReview), /医薬品マスター掲載ページ/);

  const fileReview = reviewDrugMasterSourceUrl('https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/kihonmasta_04.files/iryoyakuhin_20260611.csv');
  assert.strictEqual(fileReview.isOfficialSskUrl, true);
  assert.strictEqual(fileReview.sourceKind, 'ssk-drug-master-file');

  const otherReview = reviewDrugMasterSourceUrl('https://example.test/iyakuhin.csv');
  assert.strictEqual(otherReview.isOfficialSskUrl, false);
  assert.strictEqual(otherReview.sourceKind, 'other');
});

test('extractSskDrugMasterDownloadCandidates follows SSK drug master page links', () => {
  const html = [
    '<h1>医薬品マスター</h1>',
    '<p>最終更新日：2026年6月11日</p>',
    '<h2>医薬品の全件マスター</h2>',
    '<p>2026年6月11日 <a href="kihonmasta_04.files/y_all_20260611.zip">全件ファイル(ZIP:852KB)</a> 18,495件</p>',
    '<h2>医薬品の改定分マスター</h2>',
    '<p>2026年6月11日 <a href="/seikyushiharai/tensuhyo/kihonmasta/kihonmasta_04.files/y_update_20260611.csv">改定分ファイル(CSV:25KB)</a> 82件 <a href="kihonmasta_04.files/y_update_20260611.pdf">改定分内容(PDF:61KB)</a></p>'
  ].join('\n');

  const candidates = extractSskDrugMasterDownloadCandidates(html);

  assert.strictEqual(candidates.length, 3);
  assert.deepStrictEqual(
    candidates.map((candidate) => candidate.kind),
    ['full_master', 'revision_master', 'revision_notice']
  );
  assert.strictEqual(candidates[0].updateDate, '2026年6月11日');
  assert.strictEqual(candidates[0].fileType, 'ZIP');
  assert.strictEqual(candidates[1].fileType, 'CSV');
  assert.ok(candidates[1].url.startsWith('https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/'));
});
