import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildAiClinicalReview,
  buildAiClinicalReviewAuditDetail,
  buildAiClinicalReviewCheckRequest,
  buildAiClinicalReviewCheckRequestChecklist,
  buildAiClinicalReviewChecklist,
  buildAiClinicalReviewCsv,
  buildAiClinicalReviewEvidenceTemplate,
  type AiClinicalReviewCaseInput
} from './ai_clinical_review.ts';

const generatedAt = new Date('2026-06-29T16:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const realWorldProvenance = {
  capturedAt: '2026-06-29T15:50:00.000Z',
  operatorReviewId: 'ai-clinical-review-202606',
  sourceArtifactSha256: 'b'.repeat(64)
};

function goodCases(): AiClinicalReviewCaseInput[] {
  const domains: AiClinicalReviewCaseInput['domain'][] = ['prescription_audit', 'soap_draft', 'follow_up'];
  return Array.from({ length: 36 }, (_, index) => ({
    caseId: `case_${String(index + 1).padStart(3, '0')}`,
    storeId: index % 2 === 0 ? 'store_001' : 'store_002',
    reviewerId: index % 3 === 0 ? 'reviewer_001' : 'reviewer_002',
    domain: domains[index % domains.length],
    confidence: index % 5 === 0 ? 86 : 74,
    suggestionDecision: index % 4 === 0 ? 'modified' : 'accepted',
    pharmacistJudgement: index % 6 === 0 ? 'partly_useful' : 'useful',
    falseSuggestion: false,
    clinicalImpact: 'none',
    workflowSavedMinutes: index % 3
  }));
}

test('buildAiClinicalReview passes anonymized multi-store clinical AI review evidence', () => {
  const review = buildAiClinicalReview({
    generatedAt,
    evidence: {
      reviewId: 'ai-review-202606',
      ...realWorldProvenance,
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realClinicalReviewConfirmed: true,
      pharmacistPanelReviewed: true,
      managerReviewCompleted: true,
      qualityGateAttached: true,
      qualityGateModeApplied: true,
      currentAiAssistMode: 'limited',
      recommendedAiAssistMode: 'limited',
      cases: goodCases()
    }
  });

  assert.strictEqual(review.type, 'yakureki-ai-clinical-review');
  assert.strictEqual(review.schemaVersion, 1);
  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.statusLabel, 'AI症例レビュー OK');
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.summary.caseCount, 36);
  assert.strictEqual(review.summary.storeCount, 2);
  assert.strictEqual(review.summary.reviewerCount, 2);
  assert.strictEqual(review.summary.falseSuggestionRatePercent, 0);
  assert.strictEqual(review.summary.highConfidenceFalseCount, 0);
  assert.ok(review.domains.length >= 3);
  assert.ok(review.gates.every((gate) => gate.status === 'pass'));
});

test('buildAiClinicalReview blocks privacy gaps, weak coverage, and safety issues', () => {
  const review = buildAiClinicalReview({
    generatedAt,
    evidence: {
      reviewId: 'blocked-ai-review',
      noPatientDataConfirmed: false,
      anonymizedStoreIdsConfirmed: false,
      realClinicalReviewConfirmed: true,
      cases: [
        {
          caseId: 'case_001',
          storeId: 'store_001',
          reviewerId: 'reviewer_001',
          domain: 'prescription_audit',
          confidence: 94,
          suggestionDecision: 'accepted',
          pharmacistJudgement: 'unsafe',
          falseSuggestion: true,
          clinicalImpact: 'near_miss',
          workflowSavedMinutes: 0
        }
      ]
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.ok(review.gates.some((gate) => gate.id === 'privacy' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'coverage' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'safety' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('正式拡大を止め')));
});

test('buildAiClinicalReview blocks repeated high-confidence false suggestions', () => {
  const cases = goodCases().map((caseInput, index) => (
    index < 2
      ? {
          ...caseInput,
          confidence: 91,
          suggestionDecision: 'rejected' as const,
          pharmacistJudgement: 'not_useful' as const,
          falseSuggestion: true
        }
      : caseInput
  ));
  const review = buildAiClinicalReview({
    generatedAt,
    evidence: {
      reviewId: 'ai-review-high-confidence-false',
      ...realWorldProvenance,
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realClinicalReviewConfirmed: true,
      pharmacistPanelReviewed: true,
      managerReviewCompleted: true,
      qualityGateAttached: true,
      qualityGateModeApplied: true,
      cases
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.summary.highConfidenceFalseCount, 2);
  assert.ok(review.gates.some((gate) => gate.id === 'high_confidence_false' && gate.status === 'blocked'));
});

test('buildAiClinicalReview keeps useful but unproven clinical evidence as attention', () => {
  const review = buildAiClinicalReview({
    generatedAt,
    evidence: {
      reviewId: 'internal-ai-review',
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realClinicalReviewConfirmed: false,
      pharmacistPanelReviewed: true,
      managerReviewCompleted: false,
      qualityGateAttached: true,
      qualityGateModeApplied: false,
      cases: goodCases()
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.some((gate) => gate.id === 'real_clinical_review' && gate.status === 'attention'));
  assert.ok(review.gates.some((gate) => gate.id === 'monthly_quality_gate' && gate.status === 'attention'));
});

test('buildAiClinicalReview blocks dummy evidence presented as real clinical review', () => {
  const review = buildAiClinicalReview({
    generatedAt,
    evidence: {
      reviewId: 'dummy-ai-review',
      ...realWorldProvenance,
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realClinicalReviewConfirmed: true,
      pharmacistPanelReviewed: true,
      managerReviewCompleted: true,
      qualityGateAttached: true,
      qualityGateModeApplied: true,
      cases: goodCases()
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity.status, 'blocked');
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
});

test('AI clinical review exports privacy-safe template, CSV, checklist, audit detail, and package script', () => {
  const review = buildAiClinicalReview({
    generatedAt,
    evidence: {
      reviewId: '=ai-review',
      ...realWorldProvenance,
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realClinicalReviewConfirmed: true,
      pharmacistPanelReviewed: true,
      managerReviewCompleted: true,
      qualityGateAttached: true,
      qualityGateModeApplied: true,
      currentAiAssistMode: 'limited',
      recommendedAiAssistMode: 'limited',
      cases: goodCases().map((caseInput) => ({ ...caseInput, storeId: '=store_001' }))
    }
  });
  const template = buildAiClinicalReviewEvidenceTemplate({ generatedAt, reviewId: '=ai-review' });
  const csv = buildAiClinicalReviewCsv(review);
  const checklist = buildAiClinicalReviewChecklist(review);
  const auditDetail = buildAiClinicalReviewAuditDetail(review);
  const combined = JSON.stringify(review) + JSON.stringify(template) + csv + checklist + auditDetail;

  assert.match(csv, /"'=ai-review/);
  assert.match(csv, /"'=store_001/);
  assert.match(checklist, /AI症例レビュー/);
  assert.match(auditDetail, /高信頼度誤提案/);
  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.currentAiAssistMode, 'limited');
  assert.strictEqual(template.privacy.containsPatientData, false);
  assert.strictEqual(packageJson.scripts['ai:clinical-review'], 'tsx scripts/runAiClinicalReview.ts');
  for (const forbidden of ['patientName', 'patientId', '患者名', '薬局名', '/Users/secret']) {
    assert.doesNotMatch(combined, new RegExp(forbidden));
  }

  const script = readFileSync(new URL('../../scripts/runAiClinicalReview.ts', import.meta.url), 'utf8');
  assert.match(script, /YAKUREKI_AI_CLINICAL_REVIEW_EVIDENCE/);
  assert.match(script, /ai-clinical-review-check-request\.json/);
  assert.match(script, /ai-clinical-review-check-request\.txt/);
  assert.match(script, /YAKUREKI_AI_CLINICAL_REVIEW_REQUEST_ONLY/);
});

test('AI clinical review check request lists privacy, coverage, safety and governance evidence without free text', () => {
  const request = buildAiClinicalReviewCheckRequest({ generatedAt, reviewId: 'ai-clinical-review-202607' });

  assert.strictEqual(request.type, 'yakureki-ai-clinical-review-check-request');
  assert.strictEqual(request.reviewId, 'ai-clinical-review-202607');
  assert.strictEqual(request.items.length, 4);
  assert.ok(request.items.every((item) => item.required));
  const ids = request.items.map((item) => item.id);
  assert.deepStrictEqual(ids, ['privacy_and_real_review', 'case_coverage', 'safety_and_accuracy', 'governance_review']);

  const checklist = buildAiClinicalReviewCheckRequestChecklist(request);
  assert.match(checklist, /証跡提出依頼/);
  assert.match(checklist, /誤提案率/);
  assert.match(checklist, /品質ゲート/);

  const serialized = JSON.stringify(request) + checklist;
  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '/Users/secret', 'reviewer-real-name']) {
    assert.doesNotMatch(serialized, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
