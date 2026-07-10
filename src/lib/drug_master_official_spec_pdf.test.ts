import { test } from 'node:test';
import assert from 'node:assert';
import { deflateSync } from 'node:zlib';
import { DRUG_MASTER_SPECIFICATION_SOURCE } from './drug_master_csv.ts';
import {
  DrugMasterOfficialSpecPdfFetchError,
  extractSearchableTextFromPdfBytes,
  fetchDrugMasterOfficialSpecPdf,
  getOfficialDrugMasterSpecPdfFileName,
  isReadableDrugMasterSpecificationPdfText,
  normalizeOfficialDrugMasterSpecPdfFetchUrl,
  reviewDrugMasterOfficialSpecPdfExternalText
} from './drug_master_official_spec_pdf.ts';

function utf16BeHex(value: string): string {
  return Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('');
}

function makeSearchablePdf(text: string): ArrayBuffer {
  const content = text
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line, index) => [
      'BT',
      '/F1 12 Tf',
      `1 0 0 1 40 ${780 - index * 12} Tm`,
      `<FEFF${utf16BeHex(line)}> Tj`,
      'ET'
    ].join('\n'))
    .join('\n');
  const compressed = deflateSync(Buffer.from(content, 'latin1'));
  const chunks = [
    '%PDF-1.4\n',
    '1 0 obj\n',
    `<< /Length ${compressed.byteLength} /Filter /FlateDecode >>\n`,
    'stream\n',
    compressed,
    '\nendstream\n',
    'endobj\n',
    '%%EOF\n'
  ];
  const buffer = Buffer.concat(chunks.map((chunk) => typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : chunk));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

const officialSpecPdfUrl = DRUG_MASTER_SPECIFICATION_SOURCE.url;
const officialSpecPdfText = `
〈医薬品マスター〉
１ 変更区分 数字 １ １
２ マスター種別 英数 １ １
３ 医薬品コード 数字 ９ ９
４ 漢字有効桁数 数字 ２ ２
５ 漢字名称 漢字 ３２ ６４
６ カナ有効桁数 数字 ２ ２
７ カナ名称 英数カナ ２０ ２０
８ コード 数字 ３ ３
９ 漢字有効桁数 数字 １ １
１０ 漢字名称 漢字 ６ １２
１１ 金額種別 数字 １ １
１２ 新又は現金額 数字 １３ １３
１３ 予備 数字 ２ ２
１４ 麻薬・毒薬・覚醒剤原料・向精神薬 数字 １ １
１５ 神経破壊剤 数字 １ １
１６ 生物学的製剤 数字 １ １
１７ 後発品 数字 １ １
１８ 予備 数字 １ １
１９ 歯科特定薬剤 数字 １ １
２０ 造影（補助）剤 数字 １ １
２１ 注射容量 数字 ５ ５
２２ 収載方式等識別 数字 １ １
２３ 商品名等関連 数字 ９ ９
２４ 予備 数字 １ １
２５ 予備 数字 １３ １３
２６ 漢字名称変更区分 数字 １ １
２７ カナ名称変更区分 数字 １ １
２８ 剤形 数字 １ １
２９ 予備 英数 ４９ ４９
３０ 変更年月日 数字 ８ ８
３１ 廃止年月日 数字 ８ ８
３２ 薬価基準収載医薬品コード 英数 １２ １２
３３ 公表順序番号 数字 ９ ９
３４ 経過措置年月日又は商品名医薬品コード使用期限 数字 ８ ８
３５ 基本漢字名称 漢字 １００ ２００
３６ 薬価基準収載年月日 数字 ８ ８
３７ 一般名コード 英数 １２ １２
３８ 一般名処方の標準的な記載 漢字 １００ ２００
３９ 一般名処方加算対象区分 英数 １ １
４０ 抗ＨＩＶ薬区分 英数 １ １
４１ 長期収載品関連 数字 ９ ９
４２ 選定療養区分 数字 １ １
〈特定器材マスター〉
`;

test('normalizeOfficialDrugMasterSpecPdfFetchUrl only allows SSK basic master PDFs', () => {
  assert.strictEqual(normalizeOfficialDrugMasterSpecPdfFetchUrl(), officialSpecPdfUrl);
  assert.strictEqual(normalizeOfficialDrugMasterSpecPdfFetchUrl(officialSpecPdfUrl), officialSpecPdfUrl);

  assert.throws(
    () => normalizeOfficialDrugMasterSpecPdfFetchUrl('https://example.test/master_3_20260601.pdf'),
    (error) => error instanceof DrugMasterOfficialSpecPdfFetchError
      && error.code === 'official_drug_master_spec_pdf_url_not_allowed'
  );
  assert.throws(
    () => normalizeOfficialDrugMasterSpecPdfFetchUrl('https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/kihonmasta_04.files/y_update_20260611.csv'),
    (error) => error instanceof DrugMasterOfficialSpecPdfFetchError
      && error.status === 400
  );
});

test('extractSearchableTextFromPdfBytes extracts compressed UTF-16BE text streams', () => {
  const extracted = extractSearchableTextFromPdfBytes(makeSearchablePdf('〈医薬品マスター〉\n４２ 選定療養区分 数字 １ １'));

  assert.match(extracted, /医薬品マスター/);
  assert.match(extracted, /選定療養区分/);
});

test('fetchDrugMasterOfficialSpecPdf fetches official PDF and reviews extracted text', async () => {
  const body = makeSearchablePdf(officialSpecPdfText);

  const result = await fetchDrugMasterOfficialSpecPdf({
    fileUrl: officialSpecPdfUrl,
    fetchedAt: new Date('2026-06-19T09:00:00.000Z'),
    fetchImpl: async (url, init) => {
      assert.strictEqual(url, officialSpecPdfUrl);
      assert.strictEqual(init?.cache, 'no-store');
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(body.byteLength)
        }
      });
    }
  });

  assert.strictEqual(result.sourceUrl, officialSpecPdfUrl);
  assert.strictEqual(result.fileName, 'master_3_20260601.pdf');
  assert.strictEqual(result.fetchedAt, '2026-06-19T09:00:00.000Z');
  assert.strictEqual(result.contentType, 'application/pdf');
  assert.strictEqual(result.extractionMethod, 'searchable-pdf');
  assert.strictEqual(result.review.ok, true);
  assert.match(result.reviewLabel, /PDF本文項目 42\/42/);
  assert.match(result.text, /選定療養区分/);
});

test('fetchDrugMasterOfficialSpecPdf asks for OCR text when PDF text is unreadable', async () => {
  await assert.rejects(
    fetchDrugMasterOfficialSpecPdf({
      fileUrl: officialSpecPdfUrl,
      fetchImpl: async () => new Response(makeSearchablePdf(''), {
        status: 200,
        headers: {
          'content-type': 'application/pdf'
        }
      })
    }),
    (error) => error instanceof DrugMasterOfficialSpecPdfFetchError
      && error.code === 'official_drug_master_spec_pdf_text_unreadable'
      && error.status === 422
      && error.message.includes('OCR')
  );
});

test('reviewDrugMasterOfficialSpecPdfExternalText accepts OCR text and returns the same review shape', () => {
  const result = reviewDrugMasterOfficialSpecPdfExternalText({
    text: officialSpecPdfText,
    sourceUrl: officialSpecPdfUrl,
    fileName: 'ocr-output.txt',
    extractorName: 'store-ocr',
    extractedAt: '2026-06-20T10:00:00.000Z'
  });

  assert.strictEqual(result.extractionMethod, 'external-ocr-or-text');
  assert.strictEqual(result.fileName, 'ocr-output.txt');
  assert.strictEqual(result.extractorName, 'store-ocr');
  assert.strictEqual(result.extractedAt, '2026-06-20T10:00:00.000Z');
  assert.strictEqual(result.review.ok, true);
  assert.match(result.reviewLabel, /PDF本文項目 42\/42/);
  assert.ok(result.requiredActions.some((action) => action.includes('OCR')));
});

test('reviewDrugMasterOfficialSpecPdfExternalText rejects unreadable OCR text', () => {
  assert.strictEqual(isReadableDrugMasterSpecificationPdfText('画像だけのPDF'), false);
  assert.throws(
    () => reviewDrugMasterOfficialSpecPdfExternalText({ text: '画像だけのPDF' }),
    (error) => error instanceof DrugMasterOfficialSpecPdfFetchError
      && error.code === 'official_drug_master_spec_pdf_text_unreadable'
  );
});

test('getOfficialDrugMasterSpecPdfFileName prefers content disposition and sanitizes names', () => {
  assert.strictEqual(
    getOfficialDrugMasterSpecPdfFileName(officialSpecPdfUrl, 'attachment; filename="../../evil.pdf"'),
    'evil.pdf'
  );
  assert.strictEqual(getOfficialDrugMasterSpecPdfFileName(officialSpecPdfUrl), 'master_3_20260601.pdf');
});

test('fetchDrugMasterOfficialSpecPdf blocks files above the configured size limit', async () => {
  await assert.rejects(
    fetchDrugMasterOfficialSpecPdf({
      fileUrl: officialSpecPdfUrl,
      maxBytes: 4,
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3, 4, 5]), {
        status: 200,
        headers: {
          'content-length': '5'
        }
      })
    }),
    (error) => error instanceof DrugMasterOfficialSpecPdfFetchError
      && error.code === 'official_drug_master_spec_pdf_too_large'
      && error.status === 413
  );
});

test('fetchDrugMasterOfficialSpecPdf reports HTTP failures without leaking response bodies', async () => {
  await assert.rejects(
    fetchDrugMasterOfficialSpecPdf({
      fileUrl: officialSpecPdfUrl,
      fetchImpl: async () => new Response('secret body', { status: 503 })
    }),
    (error) => error instanceof DrugMasterOfficialSpecPdfFetchError
      && error.code === 'official_drug_master_spec_pdf_http_error'
      && !error.message.includes('secret body')
  );
});
