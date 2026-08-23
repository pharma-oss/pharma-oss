import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('./official-spec-pdf/route.ts', import.meta.url), 'utf8');

test('official spec PDF route fetches and returns extracted PDF review', () => {
  assert.match(routeSource, /fetchDrugMasterOfficialSpecPdf/);
  assert.match(routeSource, /reviewDrugMasterOfficialSpecPdfExternalText/);
  assert.match(routeSource, /DrugMasterOfficialSpecPdfFetchError/);
  assert.match(routeSource, /getAppEnv/);
  assert.match(routeSource, /drugMasterOfficialSpecPdfTimeoutMs/);
  assert.match(routeSource, /drugMasterOfficialSpecPdfMaxBytes/);
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /extractedText/);
  assert.match(routeSource, /reviewLabel/);
  assert.match(routeSource, /official_drug_master_spec_pdf_unexpected_error/);
});
