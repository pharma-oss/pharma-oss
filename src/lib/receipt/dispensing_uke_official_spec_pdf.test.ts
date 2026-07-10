import { test } from 'node:test';
import assert from 'node:assert';
import { deflateSync } from 'node:zlib';
import {
  DispensingUkeOfficialSpecPdfFetchError,
  fetchDispensingUkeOfficialSpecPdf,
  isReadableDispensingUkeSpecificationPdfText,
  normalizeDispensingUkeOfficialSpecPdfFetchUrl
} from './dispensing_uke_official_spec_pdf.ts';
import { DISPENSING_UKE_RECORD_SPEC_SOURCE } from './dispensing_uke_validation.ts';

function utf16BeHex(value: string): string {
  return Array.from(value)
    .map((char) => char.charCodeAt(0).toString(16).padStart(4, '0'))
    .join('');
}

function makeSearchablePdf(text: string): ArrayBuffer {
  const content = text
    .split('\n')
    .filter(Boolean)
    .map((line, index) => [
      'BT',
      '/F1 12 Tf',
      `1 0 0 1 40 ${780 - index * 12} Tm`,
      `<FEFF${utf16BeHex(line)}> Tj`,
      'ET'
    ].join('\n'))
    .join('\n');
  const compressed = deflateSync(Buffer.from(content, 'latin1'));
  const buffer = Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj\n', 'latin1'),
    Buffer.from(`<< /Length ${compressed.byteLength} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    compressed,
    Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1')
  ]);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

test('normalizeDispensingUkeOfficialSpecPdfFetchUrl only allows the official dispensing UKE PDF', () => {
  assert.strictEqual(
    normalizeDispensingUkeOfficialSpecPdfFetchUrl(),
    DISPENSING_UKE_RECORD_SPEC_SOURCE.url
  );
  assert.throws(
    () => normalizeDispensingUkeOfficialSpecPdfFetchUrl('https://example.test/kirokusiyou_5.pdf'),
    (error) => error instanceof DispensingUkeOfficialSpecPdfFetchError
      && error.code === 'dispensing_uke_official_spec_pdf_url_not_allowed'
  );
});

test('fetchDispensingUkeOfficialSpecPdf extracts text and builds the all-field completion gate', async () => {
  const body = makeSearchablePdf([
    'YK 薬局情報レコード',
    '1 保険薬局コード 数字 7 7 必須'
  ].join('\n'));

  const result = await fetchDispensingUkeOfficialSpecPdf({
    fetchedAt: new Date('2026-06-20T09:00:00.000Z'),
    fetchImpl: async (url, init) => {
      assert.strictEqual(url, DISPENSING_UKE_RECORD_SPEC_SOURCE.url);
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

  assert.strictEqual(result.fileName, 'iryokikan_in_07.pdf');
  assert.strictEqual(result.fetchedAt, '2026-06-20T09:00:00.000Z');
  assert.match(result.text, /保険薬局コード/);
  assert.strictEqual(result.completionGate.ok, false);
  assert.strictEqual(result.completionGate.parsedFieldCount, 1);
  assert.ok(result.completionGate.missingRecordTypes.includes('RE'));
  assert.match(result.completionGateLabel, /未完了/);
});

test('fetchDispensingUkeOfficialSpecPdf stops when extracted PDF text is unreadable', async () => {
  assert.strictEqual(isReadableDispensingUkeSpecificationPdfText('YK 薬局情報レコード\n1 保険薬局コード 数字 7 7 必須'), true);
  assert.strictEqual(isReadableDispensingUkeSpecificationPdfText(',jSLTμR¥fμ\u0005T©e'), false);

  await assert.rejects(
    fetchDispensingUkeOfficialSpecPdf({
      fetchImpl: async () => new Response(makeSearchablePdf(',jSLTμR¥fμ\u0005T©e'), { status: 200 })
    }),
    (error) => error instanceof DispensingUkeOfficialSpecPdfFetchError
      && error.code === 'dispensing_uke_official_spec_pdf_text_unreadable'
      && error.status === 422
  );
});

test('fetchDispensingUkeOfficialSpecPdf rejects an oversized response', async () => {
  await assert.rejects(
    fetchDispensingUkeOfficialSpecPdf({
      maxBytes: 4,
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3, 4, 5]), {
        status: 200,
        headers: { 'content-length': '5' }
      })
    }),
    (error) => error instanceof DispensingUkeOfficialSpecPdfFetchError
      && error.code === 'dispensing_uke_official_spec_pdf_too_large'
      && error.status === 413
  );
});
