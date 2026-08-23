import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('./official-spec-pdf/route.ts', import.meta.url), 'utf8');

test('dispensing UKE official spec PDF route applies limits and returns the completion gate', () => {
  assert.match(routeSource, /fetchDispensingUkeOfficialSpecPdf/);
  assert.match(routeSource, /getAppEnv/);
  assert.match(routeSource, /dispensingUkeOfficialSpecPdfTimeoutMs/);
  assert.match(routeSource, /dispensingUkeOfficialSpecPdfMaxBytes/);
  assert.match(routeSource, /NextResponse\.json\(result\)/);
  assert.match(routeSource, /DispensingUkeOfficialSpecPdfFetchError/);
});
