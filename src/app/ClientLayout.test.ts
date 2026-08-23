import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STAFF_LOAD_TIMEOUT_MS,
  PRE_LOGIN_TOUR_STORAGE_KEY
} from './ClientLayout';
import {
  SESSION_LOCK_TIMEOUT_MS,
  SESSION_ACTIVITY_EVENTS
} from '@/hooks/useSessionLock';

describe('ClientLayout and session lock contracts', () => {
  it('defines valid staff load timeout and pre-login tour storage key', () => {
    assert.equal(STAFF_LOAD_TIMEOUT_MS, 8000);
    assert.equal(PRE_LOGIN_TOUR_STORAGE_KEY, 'yakureki:pre-login-tour:v1');
  });

  it('defines 15-minute inactivity session lock timeout and standard activity events', () => {
    assert.equal(SESSION_LOCK_TIMEOUT_MS, 15 * 60 * 1000);
    assert.ok(SESSION_ACTIVITY_EVENTS.includes('pointerdown'));
    assert.ok(SESSION_ACTIVITY_EVENTS.includes('keydown'));
    assert.ok(SESSION_ACTIVITY_EVENTS.includes('touchstart'));
    assert.ok(SESSION_ACTIVITY_EVENTS.includes('focus'));
  });
});
