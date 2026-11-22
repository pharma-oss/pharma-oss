import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAbortError } from './electronic_prescription_client';

describe('electronic_prescription_client isAbortError', () => {
  it('returns true for Error instances named AbortError', () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    assert.equal(isAbortError(err), true);
  });

  it('returns true for DOMException-like plain objects with name AbortError', () => {
    assert.equal(isAbortError({ name: 'AbortError', message: 'timeout' }), true);
  });

  it('returns false for non-abort errors and non-object values', () => {
    assert.equal(isAbortError(new TypeError('Failed to fetch')), false);
    assert.equal(isAbortError({ name: 'NetworkError' }), false);
    assert.equal(isAbortError(null), false);
    assert.equal(isAbortError(undefined), false);
    assert.equal(isAbortError('AbortError'), false);
  });
});
