import { test } from 'node:test';
import assert from 'node:assert';
import { SoapSaveStatusIndicator } from './emr/components/SoapComponents';
import { SoapEditor } from './emr/components/SoapEditor';

test('SoapSaveStatusIndicator component is properly exported as React component', () => {
  assert.ok(SoapSaveStatusIndicator);
});

test('SoapEditor component is properly exported as React component', () => {
  assert.ok(SoapEditor);
});

