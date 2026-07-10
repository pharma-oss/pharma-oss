import { test } from 'node:test';
import assert from 'node:assert';
import {
  DrugMasterOfficialFileFetchError,
  fetchDrugMasterOfficialFile,
  getOfficialDrugMasterFileName,
  getOfficialDrugMasterFileType,
  normalizeOfficialDrugMasterFileFetchUrl
} from './drug_master_official_file.ts';

const officialCsvUrl = 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/kihonmasta_04.files/y_update_20260611.csv';
const officialZipUrl = 'https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/kihonmasta_04.files/y_all_20260611.zip';

test('normalizeOfficialDrugMasterFileFetchUrl only allows SSK drug master CSV or ZIP files', () => {
  assert.strictEqual(normalizeOfficialDrugMasterFileFetchUrl(officialCsvUrl), officialCsvUrl);
  assert.strictEqual(normalizeOfficialDrugMasterFileFetchUrl(officialZipUrl), officialZipUrl);

  assert.throws(
    () => normalizeOfficialDrugMasterFileFetchUrl('https://example.test/y_all.zip'),
    (error) => error instanceof DrugMasterOfficialFileFetchError
      && error.code === 'official_drug_master_file_url_not_allowed'
  );
  assert.throws(
    () => normalizeOfficialDrugMasterFileFetchUrl('https://www.ssk.or.jp/seikyushiharai/tensuhyo/kihonmasta/index.html'),
    (error) => error instanceof DrugMasterOfficialFileFetchError
      && error.status === 400
  );
});

test('getOfficialDrugMasterFileName prefers content disposition and sanitizes names', () => {
  assert.strictEqual(
    getOfficialDrugMasterFileName(officialCsvUrl, "attachment; filename*=UTF-8''%E5%8C%BB%E8%96%AC%E5%93%81.csv"),
    '医薬品.csv'
  );
  assert.strictEqual(
    getOfficialDrugMasterFileName(officialZipUrl, 'attachment; filename="../../evil.zip"'),
    'evil.zip'
  );
  assert.strictEqual(getOfficialDrugMasterFileType('sample.zip'), 'zip');
  assert.strictEqual(getOfficialDrugMasterFileType('sample.csv'), 'csv');
});

test('fetchDrugMasterOfficialFile fetches official files and returns bytes with metadata', async () => {
  const body = new TextEncoder().encode('"2","Y","620000001"\n');

  const result = await fetchDrugMasterOfficialFile({
    fileUrl: officialCsvUrl,
    fetchedAt: new Date('2026-06-19T09:00:00.000Z'),
    fetchImpl: async (url, init) => {
      assert.strictEqual(url, officialCsvUrl);
      assert.strictEqual(init?.cache, 'no-store');
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'text/csv',
          'content-length': String(body.byteLength)
        }
      });
    }
  });

  assert.strictEqual(result.sourceUrl, officialCsvUrl);
  assert.strictEqual(result.fileName, 'y_update_20260611.csv');
  assert.strictEqual(result.fileType, 'csv');
  assert.strictEqual(result.fetchedAt, '2026-06-19T09:00:00.000Z');
  assert.strictEqual(result.contentType, 'text/csv');
  assert.strictEqual(new TextDecoder().decode(result.arrayBuffer), '"2","Y","620000001"\n');
});

test('fetchDrugMasterOfficialFile blocks files above the configured size limit', async () => {
  await assert.rejects(
    fetchDrugMasterOfficialFile({
      fileUrl: officialZipUrl,
      maxBytes: 4,
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3, 4, 5]), {
        status: 200,
        headers: {
          'content-length': '5'
        }
      })
    }),
    (error) => error instanceof DrugMasterOfficialFileFetchError
      && error.code === 'official_drug_master_file_too_large'
      && error.status === 413
  );
});

test('fetchDrugMasterOfficialFile reports HTTP failures without leaking response bodies', async () => {
  await assert.rejects(
    fetchDrugMasterOfficialFile({
      fileUrl: officialCsvUrl,
      fetchImpl: async () => new Response('secret body', { status: 503 })
    }),
    (error) => error instanceof DrugMasterOfficialFileFetchError
      && error.code === 'official_drug_master_file_http_error'
      && !error.message.includes('secret body')
  );
});
