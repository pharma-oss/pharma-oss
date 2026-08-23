import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import DrugMasterSettingsTab from '@/components/settings/DrugMasterSettingsTab';

describe('DrugMasterSettingsTab contracts', () => {
  it('exports DrugMasterSettingsTab as a callable React component function', () => {
    assert.equal(typeof DrugMasterSettingsTab, 'function');
  });
});
