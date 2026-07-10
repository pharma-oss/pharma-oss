import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildReleasePostReview,
  buildReleasePostReviewAuditDetail,
  buildReleasePostReviewChecklist,
  buildReleasePostReviewCsv,
  buildReleasePostReviewEvidenceTemplate
} from './release_post_review.ts';

const generatedAt = new Date('2026-06-23T14:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const realWorldProof = {
  capturedAt: '2026-06-23T14:00:00.000Z',
  operatorReviewId: 'release-post-review-20260623',
  sourceArtifactSha256: 'c'.repeat(64)
};

test('buildReleasePostReview passes when observation, metrics and closeout are complete', () => {
  const review = buildReleasePostReview({
    generatedAt,
    evidence: {
      releaseId: 'release-20260623-hotfix',
      ...realWorldProof,
      risk: 'high',
      deployedAt: '2026-06-23T00:00:00.000Z',
      observationClosedAt: '2026-06-24T01:00:00.000Z',
      observationTargetHours: 24,
      noPatientDataConfirmed: true,
      readinessReviewAttached: true,
      slaReviewAttached: true,
      smokeTestPassed: true,
      monitoringReviewed: true,
      supportCaseCount: 1,
      maxSupportCaseCount: 1,
      errorCount: 0,
      maxErrorCount: 0,
      downtimeMinutes: 0,
      maxDowntimeMinutes: 5,
      rollbackExecuted: false,
      userNoticeClosed: true,
      followUpActionsRegistered: true,
      postReleaseReviewCompleted: true
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.schemaVersion, 2);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.statusLabel, '更新後レビューOK');
  assert.strictEqual(review.riskLabel, '高');
  assert.strictEqual(review.observationHours, 25);
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.every((gate) => gate.nextAction === '対応不要'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'pass'));
});

test('buildReleasePostReview blocks unsafe high risk post release signals', () => {
  const review = buildReleasePostReview({
    generatedAt,
    evidence: {
      releaseId: 'unsafe-release',
      risk: 'critical',
      deployedAt: '2026-06-23T00:00:00.000Z',
      observationClosedAt: '2026-06-23T02:00:00.000Z',
      noPatientDataConfirmed: false,
      readinessReviewAttached: false,
      slaReviewAttached: false,
      smokeTestPassed: false,
      monitoringReviewed: false,
      supportCaseCount: 3,
      maxSupportCaseCount: 1,
      errorCount: 2,
      maxErrorCount: 0,
      downtimeMinutes: 20,
      maxDowntimeMinutes: 5
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.ok(review.blockedGateCount >= 6);
  assert.ok(review.gates.some((gate) => gate.id === 'privacy' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'errors' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('配信停止')));
});

test('buildReleasePostReview asks for attention on low risk follow-up gaps', () => {
  const review = buildReleasePostReview({
    generatedAt,
    evidence: {
      risk: 'low',
      ...realWorldProof,
      deployedAt: '2026-06-23T00:00:00.000Z',
      observationClosedAt: '2026-06-26T00:00:00.000Z',
      noPatientDataConfirmed: true,
      readinessReviewAttached: true,
      slaReviewAttached: false,
      smokeTestPassed: true,
      monitoringReviewed: true,
      supportCaseCount: 0,
      errorCount: 0,
      downtimeMinutes: 0,
      userNoticeClosed: false,
      followUpActionsRegistered: false,
      postReleaseReviewCompleted: false
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.some((gate) => gate.id === 'user_notice_close' && gate.status === 'attention'));
});

test('buildReleasePostReview requires rollback outcome and release pause after rollback', () => {
  const review = buildReleasePostReview({
    generatedAt,
    evidence: {
      risk: 'high',
      ...realWorldProof,
      deployedAt: '2026-06-23T00:00:00.000Z',
      observationClosedAt: '2026-06-24T01:00:00.000Z',
      noPatientDataConfirmed: true,
      readinessReviewAttached: true,
      slaReviewAttached: true,
      smokeTestPassed: true,
      monitoringReviewed: true,
      supportCaseCount: 1,
      errorCount: 0,
      downtimeMinutes: 2,
      rollbackExecuted: true,
      rollbackOutcomeConfirmed: false,
      releasePausedUntilFixed: false,
      userNoticeClosed: true,
      followUpActionsRegistered: true,
      postReleaseReviewCompleted: true
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.ok(review.gates.some((gate) => gate.id === 'rollback_outcome' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'release_pause' && gate.status === 'blocked'));
});

test('buildReleasePostReview blocks dummy post release evidence', () => {
  const review = buildReleasePostReview({
    generatedAt,
    evidence: {
      releaseId: 'dummy-release-post',
      ...realWorldProof,
      risk: 'high',
      deployedAt: '2026-06-23T00:00:00.000Z',
      observationClosedAt: '2026-06-24T01:00:00.000Z',
      observationTargetHours: 24,
      noPatientDataConfirmed: true,
      readinessReviewAttached: true,
      slaReviewAttached: true,
      smokeTestPassed: true,
      monitoringReviewed: true,
      supportCaseCount: 1,
      maxSupportCaseCount: 1,
      errorCount: 0,
      maxErrorCount: 0,
      downtimeMinutes: 0,
      maxDowntimeMinutes: 5,
      rollbackExecuted: false,
      userNoticeClosed: true,
      followUpActionsRegistered: true,
      postReleaseReviewCompleted: true
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity.status, 'blocked');
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'blocked'));
});

test('release post review exports privacy-safe template, CSV, checklist and audit detail', () => {
  const review = buildReleasePostReview({
    generatedAt,
    evidence: {
      releaseId: '=release',
      ...realWorldProof,
      risk: 'normal',
      deployedAt: '2026-06-23T00:00:00.000Z',
      observationClosedAt: '2026-06-26T00:00:00.000Z',
      noPatientDataConfirmed: true,
      readinessReviewAttached: true,
      slaReviewAttached: true,
      smokeTestPassed: true,
      monitoringReviewed: true,
      supportCaseCount: 0,
      errorCount: 0,
      downtimeMinutes: 0,
      userNoticeClosed: true,
      followUpActionsRegistered: true,
      postReleaseReviewCompleted: true
    }
  });
  const template = buildReleasePostReviewEvidenceTemplate({ generatedAt, releaseId: '=release' });
  const csv = buildReleasePostReviewCsv(review);
  const checklist = buildReleasePostReviewChecklist(review);
  const auditDetail = buildReleasePostReviewAuditDetail(review);
  const combined = JSON.stringify(review) + JSON.stringify(template) + csv + checklist + auditDetail;

  assert.match(csv, /"'=release \//);
  assert.match(checklist, /更新後に見るもの/);
  assert.match(auditDetail, /リリース後レビュー/);
  assert.strictEqual(template.schemaVersion, 2);
  assert.strictEqual(template.capturedAt, '');
  assert.strictEqual(template.operatorReviewId, '');
  assert.strictEqual(template.sourceArtifactSha256, '');
  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.privacy.containsRawSupportText, false);

  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '担当 花子', '/Users/secret', 'bearer-token-secret', 'https://example.test']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('release post review CLI is exposed and writes artifacts', () => {
  const script = readFileSync(new URL('../../scripts/runReleasePostReview.ts', import.meta.url), 'utf8');

  assert.strictEqual(packageJson.scripts['release:post-review'], 'tsx scripts/runReleasePostReview.ts');
  assert.match(script, /YAKUREKI_RELEASE_POST_REVIEW_EVIDENCE/);
  assert.match(script, /ok = review\.status !== 'blocked'/);
  assert.match(script, /evidenceIntegrityStatus/);
  assert.match(script, /release-post-review\.json/);
  assert.match(script, /release-post-review\.csv/);
  assert.match(script, /release-post-review-evidence-template\.json/);
  assert.match(script, /release-post-review-checklist\.txt/);
});
