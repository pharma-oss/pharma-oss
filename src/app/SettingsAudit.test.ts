import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import AuditSettingsTab from '@/components/settings/AuditSettingsTab';
import BackupSettingsTab from '@/components/settings/BackupSettingsTab';
import DrugMasterSettingsTab from '@/components/settings/DrugMasterSettingsTab';
import ExternalConnectorSettingsTab from '@/components/settings/ExternalConnectorSettingsTab';
import FacilitySettingsTab from '@/components/settings/FacilitySettingsTab';
import MedicationInfoTemplateSettingsTab from '@/components/settings/MedicationInfoTemplateSettingsTab';
import OfficialAuditSettingsTab from '@/components/settings/OfficialAuditSettingsTab';
import StaffSettingsTab from '@/components/settings/StaffSettingsTab';

describe('Settings component export contracts', () => {
  it('exports all settings tabs as callable React component functions', () => {
    assert.equal(typeof AuditSettingsTab, 'function');
    assert.equal(typeof BackupSettingsTab, 'function');
    assert.equal(typeof DrugMasterSettingsTab, 'function');
    assert.equal(typeof ExternalConnectorSettingsTab, 'function');
    assert.equal(typeof FacilitySettingsTab, 'function');
    assert.equal(typeof MedicationInfoTemplateSettingsTab, 'function');
    assert.equal(typeof OfficialAuditSettingsTab, 'function');
    assert.equal(typeof StaffSettingsTab, 'function');
  });
});
