import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const emrSource = readFileSync(new URL('./emr/page.tsx', import.meta.url), 'utf8');

test('EMR SOAP editor exposes save status, immediate flush, and unload guard', () => {
  assert.match(emrSource, /SoapSaveStatusIndicator/);
  assert.match(emrSource, /未保存の変更あり/);
  assert.match(emrSource, /自動保存済み/);
  assert.match(emrSource, /beforeunload/);
  assert.match(emrSource, /soapFlushRef\.current\?\.\(\)/);
  assert.match(emrSource, /setSaveStatus\('saving'\)/);
  assert.match(emrSource, /setSaveStatus\('error'\)/);
  assert.match(emrSource, /dirtyRef\.current = true;/);
});
