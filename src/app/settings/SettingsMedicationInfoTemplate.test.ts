import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import MedicationInfoTemplateSettingsTab from '@/components/settings/MedicationInfoTemplateSettingsTab';
import {
  MEDICATION_INFO_TEMPLATE_STATUS_LABELS,
  MEDICATION_INFO_SOURCE_TYPE_LABELS,
  MEDICATION_INFO_TEMPLATE_READINESS_LABELS,
  createEmptyMedicationInfoTemplateForm,
  makeMedicationInfoTemplateId,
  medicationInfoTemplateToForm,
  sortMedicationInfoTemplates
} from '@/lib/medication_info_template_ui';

describe('SettingsMedicationInfoTemplate contracts and pure helpers', () => {
  it('exports MedicationInfoTemplateSettingsTab as a callable React component function', () => {
    assert.equal(typeof MedicationInfoTemplateSettingsTab, 'function');
  });

  it('provides comprehensive status, source type, and readiness labels', () => {
    assert.equal(MEDICATION_INFO_TEMPLATE_STATUS_LABELS.draft, '下書き');
    assert.equal(MEDICATION_INFO_TEMPLATE_STATUS_LABELS.approved, '承認済み');
    assert.equal(MEDICATION_INFO_SOURCE_TYPE_LABELS.pmda_insert, 'PMDA 添付文書');
    assert.equal(MEDICATION_INFO_TEMPLATE_READINESS_LABELS.ready, '承認準備OK');
  });

  it('creates empty template form with default draft status', () => {
    const form = createEmptyMedicationInfoTemplateForm();
    assert.equal(form.status, 'draft');
    assert.equal(form.sourceType, 'pharmacy_authored');
    assert.equal(form.templateId, '');
  });

  it('generates unique and sanitized template IDs from drug code', () => {
    const id = makeMedicationInfoTemplateId('DRUG-001/A', new Date('2026-08-23T10:00:00Z'));
    assert.ok(id.startsWith('pmit_DRUG-001A_'));
  });

  it('converts template document to form data and sorts by timestamp descending', () => {
    const docA: any = {
      templateId: 'pmit_1',
      drugCode: 'D1',
      drugName: '薬品A',
      status: 'approved',
      updatedAt: '2026-08-20T10:00:00Z'
    };
    const docB: any = {
      templateId: 'pmit_2',
      drugCode: 'D2',
      drugName: '薬品B',
      status: 'draft',
      updatedAt: '2026-08-22T10:00:00Z'
    };

    const form = medicationInfoTemplateToForm(docA);
    assert.equal(form.templateId, 'pmit_1');
    assert.equal(form.drugName, '薬品A');

    const sorted = sortMedicationInfoTemplates([docA, docB]);
    assert.equal(sorted[0].templateId, 'pmit_2', 'Latest updated document should come first');
    assert.equal(sorted[1].templateId, 'pmit_1');
  });
});
