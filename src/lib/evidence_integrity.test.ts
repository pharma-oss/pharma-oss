import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildEvidenceIntegrityReview,
  buildEvidenceIntegrityTemplate
} from './evidence_integrity.ts';

const generatedAt = new Date('2026-06-28T09:00:00.000Z');

test('buildEvidenceIntegrityReview blocks patient data inside no-patient evidence', () => {
  const review = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: 'claim-acceptance',
    claimKind: 'online_claim_acceptance',
    realWorldEvidenceRequired: true,
    evidence: {
      status: 'pass',
      statusLabel: '現物受付結果検証OK',
      evidence: {
        rows: [
          {
            visitId: 'visit-001',
            patientId: 'pat-001',
            patientName: '山田太郎',
            result: '受付済'
          }
        ]
      }
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.privacy.containsPatientDataSignals, true);
  assert.ok(review.issues.some((issue) => issue.code === 'privacy_patient_data_signal'));
  assert.doesNotMatch(JSON.stringify(review), /山田太郎|pat-001/);
});

test('buildEvidenceIntegrityReview blocks dummy field evidence claiming real-world completion', () => {
  const review = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: 'print-field',
    claimKind: 'print_media_field',
    realWorldEvidenceRequired: true,
    evidence: {
      status: 'pass',
      statusLabel: '実紙検証OK',
      visitId: 'dummy-visit-id-for-print-test',
      fieldEvidence: [
        {
          documentId: 'receipt',
          printerChecked: true,
          paperMatched: true,
          measuredWidthMm: 148,
          expectedWidthMm: 148,
          operatorRecorded: true
        }
      ]
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.synthetic.containsSyntheticSignals, true);
  assert.ok(review.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
});

test('buildEvidenceIntegrityReview allows synthetic samples when they are not used as real evidence', () => {
  const review = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: 'developer-fixture',
    claimKind: 'unit_test_fixture',
    realWorldEvidenceRequired: false,
    allowSyntheticEvidence: true,
    evidence: {
      sampleId: 'sample-ok-a',
      note: 'mock parser fixture for a unit test'
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.synthetic.containsSyntheticSignals, true);
  assert.strictEqual(review.synthetic.allowSyntheticEvidence, true);
  assert.deepStrictEqual(review.issues, []);
});

test('buildEvidenceIntegrityReview passes sanitized real-world receipt metadata', () => {
  const review = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: 'printer-review-001',
    claimKind: 'print_media_field',
    realWorldEvidenceRequired: true,
    evidence: {
      checkedAt: '2026-06-28T08:55:00.000Z',
      operatorReviewId: 'review-001',
      sourceArtifactSha256: 'a'.repeat(64),
      deviceIdHash: 'b'.repeat(64),
      privacy: {
        noPatientDataConfirmed: true
      },
      result: 'actual printer field check completed'
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.realWorldClaimed, true);
  assert.strictEqual(review.privacy.containsPatientDataSignals, false);
  assert.strictEqual(review.synthetic.containsSyntheticSignals, false);
  assert.deepStrictEqual(review.realWorldProof.missing, []);
});

test('buildEvidenceIntegrityReview requires provenance before accepting real-world evidence', () => {
  const review = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: 'pilot-001',
    claimKind: 'pilot_kpi',
    realWorldEvidenceRequired: true,
    evidence: {
      realPilotEvidenceConfirmed: true,
      noPatientDataConfirmed: true,
      snapshots: [{ storeId: 'store_001', prescriptionCount: 500 }]
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.realWorldClaimed, true);
  assert.deepStrictEqual(review.realWorldProof.missing, [
    '実作業の取得・確認日時',
    '匿名の確認記録ID',
    '元資料のSHA-256'
  ]);
  assert.ok(review.issues.some((issue) => issue.code === 'real_world_proof_incomplete'));
});

test('buildEvidenceIntegrityReview does not infer a real-world claim from the word internal', () => {
  const review = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: 'internal-pilot',
    claimKind: 'pilot_kpi',
    evidence: {
      pilotId: 'internal-pilot-dry-run'
    }
  });

  assert.strictEqual(review.realWorldClaimed, false);
  assert.strictEqual(review.synthetic.containsSyntheticSignals, true);
  assert.strictEqual(review.status, 'pass');
});

test('buildEvidenceIntegrityReview accepts an external acceptance id as a review record', () => {
  const review = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: 'official-claim-acceptance',
    claimKind: 'official_claim_submission',
    realWorldEvidenceRequired: true,
    evidence: {
      checkedAt: '2026-06-28',
      acceptanceId: 'SSK-202606-001',
      sourceArtifactSha256: 'c'.repeat(64),
      noPatientDataConfirmed: true,
      result: 'accepted'
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.realWorldClaimed, true);
  assert.strictEqual(review.realWorldProof.reviewRecordIdPresent, true);
});

test('buildEvidenceIntegrityTemplate explains required real-world proof', () => {
  const template = buildEvidenceIntegrityTemplate();

  assert.strictEqual(template.type, 'yakureki-evidence-integrity-input-template');
  assert.strictEqual(template.example.noPatientDataExpected, true);
  assert.ok(template.requiredForRealWorldEvidence.some((item) => item.includes('external receipt')));
  assert.ok(template.forbiddenInNoPatientEvidence.some((item) => item.includes('patientId')));
});
