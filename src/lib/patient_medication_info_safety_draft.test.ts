import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPatientMedicationInfoSafetyDraft,
  buildPatientMedicationInfoSafetyDraftTemplate,
  extractDrugCodeFromDrugInfoId,
  makePatientMedicationInfoSafetyDraftCsvFileName
} from './patient_medication_info_safety_draft.ts';
import type { DrugInfo } from '../db/types.ts';

const drugInfo: DrugInfo = {
  id: 'drug_info_1149019F1560',
  drugName: 'ロキソニン錠60mg',
  genericName: 'ロキソプロフェンNa錠60mg',
  contraindications: [{
    targetDrugs: ['ワルファリン'],
    severity: 'warning',
    clinicalEffect: '抗凝固作用を増強するおそれがある。',
    sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/example',
    fetchedAt: '2026-06-28T00:00:00.000Z'
  }],
  usageWarnings: [{
    condition: 'amount > 180',
    message: '1日最大用量（180mg）を超過している可能性があります。'
  }]
};

test('buildPatientMedicationInfoSafetyDraft creates side effect and usage caution drafts only', () => {
  const draft = buildPatientMedicationInfoSafetyDraft({
    drugCode: '1149019F1560',
    drugName: 'ロキソニン錠60mg',
    genericName: 'ロキソプロフェンNa錠60mg',
    drugInfo,
    generatedAt: new Date(2026, 5, 28, 0, 0, 0)
  });

  assert.match(draft.sideEffectText, /発疹/);
  assert.doesNotMatch(draft.sideEffectText, /眠気|吐き気|下痢|むくみ/);
  assert.match(draft.usageCautionText, /用法・用量/);
  assert.match(draft.usageCautionText, /指示された量を超えて使用しない/);
  assert.match(draft.usageCautionText, /飲み合わせ/);
  assert.strictEqual(draft.sourceType, 'other');
  assert.strictEqual(draft.sourceHash, 'yakureki-safety-draft:v2:drug_info_1149019F1560:u1:i1');
  assert.match(draft.needsReviewReason, /用量注意 1件、飲み合わせ注意 1件/);
  assert.match(draft.needsReviewReason, /薬剤師確認/);
});

test('buildPatientMedicationInfoSafetyDraftTemplate stays draft and does not invent effect or storage text', () => {
  const template = buildPatientMedicationInfoSafetyDraftTemplate({
    drugCode: extractDrugCodeFromDrugInfoId(drugInfo.id),
    drugName: drugInfo.drugName,
    genericName: drugInfo.genericName,
    drugInfo,
    generatedAt: new Date(2026, 5, 28, 12, 0, 0)
  });

  assert.strictEqual(template.status, 'draft');
  assert.strictEqual(template.effectText, undefined);
  assert.strictEqual(template.storageText, undefined);
  assert.strictEqual(template.interactionText, undefined);
  assert.match(template.sideEffectText || '', /発疹/);
  assert.match(template.counselingText || '', /用法・用量/);
  assert.match(template.counselingText || '', /飲み合わせ/);
});

test('buildPatientMedicationInfoSafetyDraft marks unmatched generic drafts explicitly', () => {
  const draft = buildPatientMedicationInfoSafetyDraft({
    drugCode: 'unknown-1',
    drugName: '未登録薬',
    generatedAt: new Date(2026, 5, 29, 0, 0, 0)
  });

  assert.strictEqual(draft.sourceHash, 'yakureki-safety-draft:v2:unmatched:unknown-1');
  assert.match(draft.needsReviewReason, /一致する薬剤参照データがない/);
});

test('makePatientMedicationInfoSafetyDraftCsvFileName is deterministic', () => {
  assert.strictEqual(
    makePatientMedicationInfoSafetyDraftCsvFileName(new Date(2026, 5, 28, 9, 8, 7)),
    'yakureki_medication_safety_drafts_20260628_090807.csv'
  );
});
