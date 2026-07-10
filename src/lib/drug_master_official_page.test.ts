import { test } from 'node:test';
import assert from 'node:assert';
import {
  DrugMasterOfficialPageFetchError,
  fetchDrugMasterOfficialPage,
  normalizeOfficialDrugMasterPageFetchUrl
} from './drug_master_official_page.ts';
import { SSK_DRUG_MASTER_PAGE_URL } from './drug_master_provenance.ts';

test('normalizeOfficialDrugMasterPageFetchUrl only allows the SSK drug master page', () => {
  assert.strictEqual(normalizeOfficialDrugMasterPageFetchUrl(), SSK_DRUG_MASTER_PAGE_URL);
  assert.strictEqual(
    normalizeOfficialDrugMasterPageFetchUrl(SSK_DRUG_MASTER_PAGE_URL),
    SSK_DRUG_MASTER_PAGE_URL
  );

  assert.throws(
    () => normalizeOfficialDrugMasterPageFetchUrl('https://example.test/other.html'),
    (error) => error instanceof DrugMasterOfficialPageFetchError
      && error.code === 'official_drug_master_page_url_not_allowed'
  );
  assert.throws(
    () => normalizeOfficialDrugMasterPageFetchUrl('not a url'),
    (error) => error instanceof DrugMasterOfficialPageFetchError
      && error.status === 400
  );
});

test('fetchDrugMasterOfficialPage fetches the official page and extracts candidates', async () => {
  const html = [
    '<h1>医薬品マスター</h1>',
    '<p>2026年6月11日 <a href="kihonmasta_04.files/y_all_20260611.zip">全件ファイル(ZIP:852KB)</a></p>',
    '<p>2026年6月11日 <a href="kihonmasta_04.files/y_update_20260611.csv">改定分ファイル(CSV:25KB)</a></p>'
  ].join('\n');
  const body = new TextEncoder().encode(html);

  const result = await fetchDrugMasterOfficialPage({
    fetchedAt: new Date('2026-06-18T09:00:00.000Z'),
    fetchImpl: async (url, init) => {
      assert.strictEqual(url, SSK_DRUG_MASTER_PAGE_URL);
      assert.strictEqual(init?.cache, 'no-store');
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': String(body.byteLength)
        }
      });
    }
  });

  assert.strictEqual(result.sourcePageUrl, SSK_DRUG_MASTER_PAGE_URL);
  assert.strictEqual(result.fetchedAt, '2026-06-18T09:00:00.000Z');
  assert.strictEqual(result.contentType, 'text/html; charset=utf-8');
  assert.strictEqual(result.contentLength, body.byteLength);
  assert.strictEqual(result.html, html);
  assert.deepStrictEqual(
    result.candidates.map((candidate) => candidate.kind),
    ['full_master', 'revision_master']
  );
});

test('fetchDrugMasterOfficialPage reports HTTP failures without leaking response bodies', async () => {
  await assert.rejects(
    fetchDrugMasterOfficialPage({
      fetchImpl: async () => new Response('secret response body', { status: 503 })
    }),
    (error) => error instanceof DrugMasterOfficialPageFetchError
      && error.code === 'official_drug_master_page_http_error'
      && error.status === 503
      && !error.message.includes('secret response body')
  );
});
