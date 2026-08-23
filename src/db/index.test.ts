import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDatabase } from './index';

describe('Database initialization contracts', () => {
  it('exports getDatabase as a callable factory function', () => {
    assert.equal(typeof getDatabase, 'function');
  });
});
