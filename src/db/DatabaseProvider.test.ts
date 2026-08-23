import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseProvider, useDatabase } from './DatabaseProvider';

describe('DatabaseProvider contracts', () => {
  it('exports DatabaseProvider and useDatabase as callable React component/hook', () => {
    assert.equal(typeof DatabaseProvider, 'function');
    assert.equal(typeof useDatabase, 'function');
  });
});
