import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import StaffSettingsTab from '@/components/settings/StaffSettingsTab';

describe('StaffSettingsTab contracts', () => {
  it('exports StaffSettingsTab as a callable React component function', () => {
    assert.equal(typeof StaffSettingsTab, 'function');
  });
});
