import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import BackupSettingsTab from '@/components/settings/BackupSettingsTab';

describe('BackupSettingsTab contracts', () => {
  it('exports BackupSettingsTab as a callable React component function', () => {
    assert.equal(typeof BackupSettingsTab, 'function');
  });
});
