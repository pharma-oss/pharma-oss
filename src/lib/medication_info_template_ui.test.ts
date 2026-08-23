import { test } from 'node:test';
import assert from 'node:assert';
import {
  createEmptyMedicationInfoTemplateForm,
  trimOrUndefined,
  makeMedicationInfoTemplateId,
  medicationInfoTemplateToForm,
  sortMedicationInfoTemplates
} from './medication_info_template_ui.ts';
import type { PatientMedicationInfoTemplate } from '../db/types.ts';

test('trimOrUndefined trims string and returns undefined if empty or only whitespace', () => {
  assert.strictEqual(trimOrUndefined('  hello world  '), 'hello world');
  assert.strictEqual(trimOrUndefined('   '), undefined);
  assert.strictEqual(trimOrUndefined(''), undefined);
});

test('makeMedicationInfoTemplateId creates normalized predictable IDs', () => {
  const fixedDate = new Date(1700000000000);
  assert.strictEqual(makeMedicationInfoTemplateId('123456789', fixedDate), 'pmit_123456789_1700000000000');
  assert.strictEqual(makeMedicationInfoTemplateId('  ab/cd-12_3  ', fixedDate), 'pmit_abcd-12_3_1700000000000');
  assert.strictEqual(makeMedicationInfoTemplateId('///', fixedDate), 'pmit_drug_1700000000000');
});

test('medicationInfoTemplateToForm converts database record to form structure with defaults', () => {
  const template: PatientMedicationInfoTemplate = {
    templateId: 'pmit_123_1',
    drugCode: '123456789',
    drugName: 'ロキソニン錠60mg',
    genericName: 'ロキソプロフェンナトリウム水和物',
    status: 'approved',
    sideEffectText: '胃部不快感',
    counselingText: '食後に服用してください',
    sourceType: 'pmda_insert',
    sourceUrl: 'https://www.pmda.go.jp/...',
    sourceRevisionDate: '2026-01-15',
    sourceHash: 'sha256-abc',
    needsReviewReason: ''
  };
  const form = medicationInfoTemplateToForm(template);
  assert.strictEqual(form.templateId, 'pmit_123_1');
  assert.strictEqual(form.drugCode, '123456789');
  assert.strictEqual(form.drugName, 'ロキソニン錠60mg');
  assert.strictEqual(form.genericName, 'ロキソプロフェンナトリウム水和物');
  assert.strictEqual(form.status, 'approved');
  assert.strictEqual(form.sourceType, 'pmda_insert');
});

test('sortMedicationInfoTemplates sorts by timestamp descending then drugCode ascending', () => {
  const templates: PatientMedicationInfoTemplate[] = [
    {
      templateId: '1',
      drugCode: 'B',
      drugName: 'Drug B',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      templateId: '2',
      drugCode: 'A',
      drugName: 'Drug A',
      status: 'draft',
      updatedAt: '2026-02-01T00:00:00.000Z'
    },
    {
      templateId: '3',
      drugCode: 'C',
      drugName: 'Drug C',
      status: 'draft',
      updatedAt: '2026-02-01T00:00:00.000Z'
    }
  ];
  const sorted = sortMedicationInfoTemplates(templates);
  assert.strictEqual(sorted[0].templateId, '2'); // 2026-02-01, drugCode 'A'
  assert.strictEqual(sorted[1].templateId, '3'); // 2026-02-01, drugCode 'C'
  assert.strictEqual(sorted[2].templateId, '1'); // 2026-01-01, drugCode 'B'
});
