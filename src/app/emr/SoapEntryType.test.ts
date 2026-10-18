import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isSoapEntryType, soapEntryTypeMeta } from './components/SoapComponents';

describe('isSoapEntryType', () => {
  it('accepts exactly the SOAP entry types that have display metadata', () => {
    for (const type of ['S', 'O', 'A', 'P']) {
      assert.equal(isSoapEntryType(type), true, type);
      assert.ok(soapEntryTypeMeta[type as 'S' | 'O' | 'A' | 'P'].className);
    }
  });

  it('rejects values that would make soapEntryTypeMeta[type] undefined', () => {
    for (const value of ['medication', 'p', 'SO', '', 'toString', 'constructor', '__proto__', undefined, null, 1, {}]) {
      assert.equal(isSoapEntryType(value), false, String(value));
    }
  });
});
