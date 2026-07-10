import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPatientMedicationInfoApprovalWriteSet,
  buildMedicationInfoPrintContent,
  buildPmdaMedicationSearchUrl,
  getPatientMedicationInfoApprovalIssues,
  getPatientMedicationInfoApprovalReadinessIssues,
  hasPatientMedicationInfoTemplateContentChanges,
  isApprovedPatientMedicationInfoTemplate,
  isPatientMedicationInfoTemplateReadyForApproval,
  selectApprovedPatientMedicationInfoTemplate,
  shouldForkPatientMedicationInfoTemplate
} from './patient_medication_info.ts';
import type { PatientMedicationInfoTemplate } from '../db/types.ts';

const approvedTemplate: PatientMedicationInfoTemplate = {
  templateId: 'pmit_2325003F4031',
  drugCode: '2325003F4031',
  drugName: 'ガスターD錠20mg',
  status: 'approved',
  effectText: '胃酸の分泌を抑える薬です。',
  sideEffectText: '発疹、便秘、体調変化などがあれば相談してください。',
  interactionText: '他の薬や健康食品を使う場合は薬剤師へ相談してください。',
  storageText: '直射日光、高温、湿気を避けて保管してください。',
  counselingText: '指示された飲み方を守ってください。',
  sourceType: 'pharmacy_authored',
  sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/',
  sourceRevisionDate: '2026-05-01',
  reviewerId: 'pharmacist_1',
  approvedAt: '2026-06-25T10:00:00Z'
};

test('isApprovedPatientMedicationInfoTemplate requires two safety texts, provenance, and approval metadata', () => {
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate(approvedTemplate), true);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, status: 'draft' }), false);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, effectText: '  ', interactionText: '', storageText: '' }), true);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, sideEffectText: '  ' }), false);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, counselingText: '  ' }), false);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, sourceRevisionDate: undefined }), false);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, sourceUrl: undefined, sourceHash: undefined }), false);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, reviewerId: undefined }), false);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, approvedAt: undefined }), false);
  assert.strictEqual(isApprovedPatientMedicationInfoTemplate({ ...approvedTemplate, approvedAt: 'not-a-date' }), false);
});

test('getPatientMedicationInfoApprovalIssues reports every missing approval requirement', () => {
  const issues = getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    drugCode: '',
    drugName: '',
    effectText: '',
    sideEffectText: '',
    interactionText: '',
    storageText: '',
    counselingText: '',
    sourceType: undefined,
    sourceUrl: undefined,
    sourceRevisionDate: '2026-02-30',
    sourceHash: undefined,
    reviewerId: '',
    approvedAt: 'invalid'
  });
  assert.deepStrictEqual(
    issues.map((issue) => issue.code),
    [
      'drug_code',
      'drug_name',
      'side_effect_text',
      'usage_caution_text',
      'source_type',
      'source_revision_date',
      'source_evidence',
      'reviewer_id',
      'approved_at'
    ]
  );
});

test('approval accepts a dated source with an internal evidence identifier instead of a URL', () => {
  assert.deepStrictEqual(getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    sourceUrl: undefined,
    sourceHash: 'INSERT-REV-2026-05'
  }), []);
});

test('approval rejects future source revision dates', () => {
  const issues = getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    sourceRevisionDate: '2999-01-01'
  });
  assert.deepStrictEqual(issues.map((issue) => issue.code), ['source_revision_date']);
});

test('approval accepts the local current date as a source revision date', () => {
  const today = new Date();
  const todayDateOnly = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');
  assert.deepStrictEqual(getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    sourceRevisionDate: todayDateOnly
  }), []);
});

test('approval rejects unsupported scraped source urls', () => {
  const issues = getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    sourceUrl: 'https://www.rad-ar.or.jp/siori/kekka.cgi?n=123',
    sourceHash: 'internal-review-2026-06'
  });
  assert.deepStrictEqual(issues.map((issue) => issue.code), ['unsupported_scraped_source']);
});

test('approval requires pmda source urls for pmda source types', () => {
  assert.deepStrictEqual(getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    sourceType: 'pmda_insert',
    sourceUrl: 'https://licensed.example.test/source/1'
  }).map((issue) => issue.code), ['source_url_domain']);
  assert.deepStrictEqual(getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    sourceType: 'pmda_patient_guide',
    sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/'
  }), []);
  assert.deepStrictEqual(getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    sourceType: 'pmda_patient_guide',
    sourceUrl: 'http://www.pmda.go.jp/PmdaSearch/iyakuSearch/'
  }).map((issue) => issue.code), ['source_url_domain']);
  assert.deepStrictEqual(getPatientMedicationInfoApprovalIssues({
    ...approvedTemplate,
    sourceType: 'pmda_insert',
    sourceUrl: undefined,
    sourceHash: 'PMDA-INSERT-REV-2026-05'
  }), []);
});

test('approval readiness ignores workflow metadata but keeps content and provenance requirements', () => {
  assert.strictEqual(isPatientMedicationInfoTemplateReadyForApproval({
    ...approvedTemplate,
    status: 'draft',
    reviewerId: undefined,
    approvedAt: undefined
  }), true);
  assert.deepStrictEqual(
    getPatientMedicationInfoApprovalReadinessIssues({
      ...approvedTemplate,
      status: 'draft',
      sideEffectText: '',
      sourceUrl: undefined,
      sourceHash: undefined
    }).map((issue) => issue.code),
    ['side_effect_text', 'source_evidence']
  );
});

test('selectApprovedPatientMedicationInfoTemplate deterministically chooses the latest valid approval', () => {
  const older = { ...approvedTemplate, templateId: 'pmit_old', approvedAt: '2026-06-20T10:00:00Z' };
  const newer = { ...approvedTemplate, templateId: 'pmit_new', approvedAt: '2026-06-25T10:00:00Z' };
  const invalidLatest = {
    ...approvedTemplate,
    templateId: 'pmit_invalid',
    approvedAt: '2026-06-26T10:00:00Z',
    sideEffectText: ''
  };
  assert.strictEqual(
    selectApprovedPatientMedicationInfoTemplate([invalidLatest, older, newer])?.templateId,
    'pmit_new'
  );
  assert.strictEqual(selectApprovedPatientMedicationInfoTemplate([invalidLatest]), null);
});

test('approval write set retires prior approvals while preserving their content as history', () => {
  const priorApproval = { ...approvedTemplate, templateId: 'pmit_old' };
  const nextApproval = {
    ...approvedTemplate,
    templateId: 'pmit_new',
    approvedAt: '2026-06-26T10:00:00Z',
    updatedAt: '2026-06-26T10:00:00Z'
  };
  const writeSet = buildPatientMedicationInfoApprovalWriteSet(nextApproval, [priorApproval]);
  assert.deepStrictEqual(writeSet.supersededTemplateIds, ['pmit_old']);
  assert.strictEqual(writeSet.writes[0], nextApproval);
  assert.deepStrictEqual(writeSet.writes[1], {
    ...priorApproval,
    status: 'retired',
    needsReviewReason: '承認版 pmit_new に置換',
    updatedAt: nextApproval.updatedAt
  });
});

test('editing a non-draft template forks a new immutable revision', () => {
  assert.strictEqual(shouldForkPatientMedicationInfoTemplate(approvedTemplate, 'draft'), true);
  assert.strictEqual(shouldForkPatientMedicationInfoTemplate(approvedTemplate, 'approved'), true);
  assert.strictEqual(shouldForkPatientMedicationInfoTemplate(approvedTemplate, 'needs_review'), false);
  assert.strictEqual(shouldForkPatientMedicationInfoTemplate({ ...approvedTemplate, status: 'needs_review' }, 'approved'), true);
  assert.strictEqual(shouldForkPatientMedicationInfoTemplate({ ...approvedTemplate, status: 'retired' }, 'draft'), true);
  assert.strictEqual(shouldForkPatientMedicationInfoTemplate({ ...approvedTemplate, status: 'draft' }, 'approved'), false);
});

test('template content change detection ignores workflow metadata but protects patient-facing revision content', () => {
  assert.strictEqual(hasPatientMedicationInfoTemplateContentChanges(approvedTemplate, {
    ...approvedTemplate,
    status: 'needs_review',
    needsReviewReason: '添付文書改訂を確認中',
    updatedAt: '2026-06-29T12:00:00.000Z'
  }), false);
  assert.strictEqual(hasPatientMedicationInfoTemplateContentChanges(approvedTemplate, {
    ...approvedTemplate,
    sideEffectText: ` ${approvedTemplate.sideEffectText} `
  }), false);
  assert.strictEqual(hasPatientMedicationInfoTemplateContentChanges(approvedTemplate, {
    ...approvedTemplate,
    sideEffectText: '発疹が出た場合は、服用を中止して相談してください。'
  }), true);
  assert.strictEqual(hasPatientMedicationInfoTemplateContentChanges(approvedTemplate, {
    ...approvedTemplate,
    sourceRevisionDate: '2026-06-01'
  }), true);
});

test('buildMedicationInfoPrintContent uses only approved templates', () => {
  const approved = buildMedicationInfoPrintContent({
    drugName: 'ガスターD錠20mg',
    approvedTemplate
  });
  assert.strictEqual(approved.source, 'approved_template');
  assert.strictEqual(approved.sideEffectText, approvedTemplate.sideEffectText);
  assert.strictEqual(approved.usageCautionText, approvedTemplate.counselingText);
  assert.strictEqual(approved.templateId, approvedTemplate.templateId);

  const licensed = buildMedicationInfoPrintContent({
    drugName: 'ガスターD錠20mg',
    approvedTemplate: {
      ...approvedTemplate,
      sourceType: 'licensed',
      sourceUrl: 'https://licensed.example.test/source/1'
    }
  });
  assert.strictEqual(licensed.sourceUrl, 'https://licensed.example.test/source/1');
  assert.match(licensed.officialSearchUrl, /^https:\/\/www\.pmda\.go\.jp\//);

  const draft = buildMedicationInfoPrintContent({
    drugName: 'ガスターD錠20mg',
    approvedTemplate: { ...approvedTemplate, status: 'needs_review' }
  });
  assert.strictEqual(draft.source, 'safe_fallback');
  assert.notStrictEqual(draft.sideEffectText, approvedTemplate.sideEffectText);
  assert.match(draft.usageCautionText, /用法・用量/);
});

test('buildPmdaMedicationSearchUrl points patients to official PMDA search without copying source text', () => {
  const url = buildPmdaMedicationSearchUrl('ガスターD錠20mg');
  assert.match(url, /^https:\/\/www\.pmda\.go\.jp\/PmdaSearch\/iyakuSearch\//);
  assert.match(url, /%E3%82%AC%E3%82%B9%E3%82%BF%E3%83%BC/);
});
