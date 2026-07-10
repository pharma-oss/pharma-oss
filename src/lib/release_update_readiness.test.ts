import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildReleaseUpdateChecklist,
  buildReleaseUpdateEvidenceTemplate,
  buildReleaseUpdateReadinessAuditDetail,
  buildReleaseUpdateReadinessCsv,
  buildReleaseUpdateReadinessReview
} from './release_update_readiness.ts';

const generatedAt = new Date('2026-06-23T13:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const realWorldProof = {
  capturedAt: '2026-06-23T13:00:00.000Z',
  operatorReviewId: 'release-readiness-review-20260623',
  sourceArtifactSha256: 'b'.repeat(64)
};

test('buildReleaseUpdateReadinessReview passes when a high risk update has rollback, notice and support evidence', () => {
  const review = buildReleaseUpdateReadinessReview({
    generatedAt,
    evidence: {
      releaseId: 'release-20260623-001',
      ...realWorldProof,
      kind: 'hotfix',
      risk: 'high',
      plannedAt: '2026-06-23T22:00:00.000Z',
      noPatientDataConfirmed: true,
      releaseNotePrepared: true,
      userNoticePrepared: true,
      maintenanceWindowConfirmed: true,
      buildVerified: true,
      versionTagged: true,
      migrationReviewed: true,
      preUpdateBackupConfirmed: true,
      rollbackPackageVerified: true,
      rollbackTested: true,
      rollbackTargetMinutes: 25,
      expectedDowntimeMinutes: 5,
      smokeTestPlanReady: true,
      canaryOrPhasedRollout: true,
      pauseSwitchConfirmed: true,
      monitoringPrepared: true,
      supportStaffingConfirmed: true,
      slaReviewAttached: true,
      dataMigrationImpactChecked: true,
      postReleaseReviewScheduled: true
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.schemaVersion, 2);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.statusLabel, '更新準備OK');
  assert.strictEqual(review.kindLabel, '緊急修正');
  assert.strictEqual(review.riskLabel, '高');
  assert.strictEqual(review.rollbackTargetMinutes, 25);
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.every((gate) => gate.nextAction === '対応不要'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'pass'));
});

test('buildReleaseUpdateReadinessReview blocks unsafe major updates', () => {
  const review = buildReleaseUpdateReadinessReview({
    generatedAt,
    evidence: {
      kind: 'major',
      risk: 'critical',
      noPatientDataConfirmed: false,
      buildVerified: false,
      versionTagged: false,
      preUpdateBackupConfirmed: false,
      rollbackPackageVerified: false,
      rollbackTested: false,
      smokeTestPlanReady: false,
      monitoringPrepared: false
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.kindLabel, '大型更新');
  assert.strictEqual(review.riskLabel, '重大');
  assert.ok(review.blockedGateCount >= 8);
  assert.ok(review.gates.some((gate) => gate.id === 'build_verified' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'rollback_package' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('production build')));
});

test('buildReleaseUpdateReadinessReview asks for attention on low risk updates without rollout polish', () => {
  const review = buildReleaseUpdateReadinessReview({
    generatedAt,
    evidence: {
      kind: 'maintenance',
      risk: 'low',
      ...realWorldProof,
      noPatientDataConfirmed: true,
      releaseNotePrepared: false,
      userNoticePrepared: false,
      maintenanceWindowConfirmed: false,
      buildVerified: true,
      versionTagged: true,
      migrationReviewed: false,
      preUpdateBackupConfirmed: true,
      rollbackPackageVerified: true,
      rollbackTested: false,
      rollbackTargetMinutes: 60,
      expectedDowntimeMinutes: 0,
      smokeTestPlanReady: true,
      canaryOrPhasedRollout: false,
      pauseSwitchConfirmed: false,
      monitoringPrepared: true,
      supportStaffingConfirmed: false,
      slaReviewAttached: false,
      dataMigrationImpactChecked: false,
      postReleaseReviewScheduled: false
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.attentionGateCount > 0);
  assert.ok(review.gates.some((gate) => gate.id === 'post_release_review' && gate.status === 'attention'));
});

test('release update readiness catches rollback target overrun', () => {
  const review = buildReleaseUpdateReadinessReview({
    generatedAt,
    evidence: {
      kind: 'hotfix',
      risk: 'high',
      ...realWorldProof,
      noPatientDataConfirmed: true,
      releaseNotePrepared: true,
      userNoticePrepared: true,
      maintenanceWindowConfirmed: true,
      buildVerified: true,
      versionTagged: true,
      migrationReviewed: true,
      preUpdateBackupConfirmed: true,
      rollbackPackageVerified: true,
      rollbackTested: true,
      rollbackTargetMinutes: 45,
      expectedDowntimeMinutes: 5,
      smokeTestPlanReady: true,
      canaryOrPhasedRollout: true,
      pauseSwitchConfirmed: true,
      monitoringPrepared: true,
      supportStaffingConfirmed: true,
      slaReviewAttached: true,
      dataMigrationImpactChecked: true,
      postReleaseReviewScheduled: true
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.ok(review.gates.some((gate) => gate.id === 'rollback_time' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('戻しにかかる見込み時間')));
});

test('release update readiness blocks dummy readiness evidence', () => {
  const review = buildReleaseUpdateReadinessReview({
    generatedAt,
    evidence: {
      releaseId: 'dummy-release-readiness',
      ...realWorldProof,
      kind: 'hotfix',
      risk: 'high',
      plannedAt: '2026-06-23T22:00:00.000Z',
      noPatientDataConfirmed: true,
      releaseNotePrepared: true,
      userNoticePrepared: true,
      maintenanceWindowConfirmed: true,
      buildVerified: true,
      versionTagged: true,
      migrationReviewed: true,
      preUpdateBackupConfirmed: true,
      rollbackPackageVerified: true,
      rollbackTested: true,
      rollbackTargetMinutes: 25,
      expectedDowntimeMinutes: 5,
      smokeTestPlanReady: true,
      canaryOrPhasedRollout: true,
      pauseSwitchConfirmed: true,
      monitoringPrepared: true,
      supportStaffingConfirmed: true,
      slaReviewAttached: true,
      dataMigrationImpactChecked: true,
      postReleaseReviewScheduled: true
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity.status, 'blocked');
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'blocked'));
});

test('release update readiness exports privacy-safe template, CSV, checklist and audit detail', () => {
  const review = buildReleaseUpdateReadinessReview({
    generatedAt,
    evidence: {
      releaseId: '=release',
      ...realWorldProof,
      kind: 'minor',
      risk: 'normal',
      noPatientDataConfirmed: true,
      releaseNotePrepared: true,
      userNoticePrepared: true,
      maintenanceWindowConfirmed: true,
      buildVerified: true,
      versionTagged: true,
      migrationReviewed: true,
      preUpdateBackupConfirmed: true,
      rollbackPackageVerified: true,
      rollbackTested: true,
      rollbackTargetMinutes: 50,
      expectedDowntimeMinutes: 0,
      smokeTestPlanReady: true,
      canaryOrPhasedRollout: true,
      pauseSwitchConfirmed: true,
      monitoringPrepared: true,
      supportStaffingConfirmed: true,
      slaReviewAttached: true,
      dataMigrationImpactChecked: true,
      postReleaseReviewScheduled: true
    }
  });
  const template = buildReleaseUpdateEvidenceTemplate({ generatedAt, releaseId: '=release' });
  const csv = buildReleaseUpdateReadinessCsv(review);
  const checklist = buildReleaseUpdateChecklist(review);
  const auditDetail = buildReleaseUpdateReadinessAuditDetail(review);
  const combined = JSON.stringify(review) + JSON.stringify(template) + csv + checklist + auditDetail;

  assert.match(csv, /"'=release \//);
  assert.match(checklist, /更新前に見るもの/);
  assert.match(auditDetail, /更新準備/);
  assert.strictEqual(template.schemaVersion, 2);
  assert.strictEqual(template.capturedAt, '');
  assert.strictEqual(template.operatorReviewId, '');
  assert.strictEqual(template.sourceArtifactSha256, '');
  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.privacy.containsRawReleaseNotes, false);

  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '担当 花子', '/Users/secret', 'bearer-token-secret', 'https://example.test']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('release update readiness CLI is exposed and writes artifacts', () => {
  const script = readFileSync(new URL('../../scripts/runReleaseUpdateReadiness.ts', import.meta.url), 'utf8');

  assert.strictEqual(packageJson.scripts['release:readiness'], 'tsx scripts/runReleaseUpdateReadiness.ts');
  assert.match(script, /YAKUREKI_RELEASE_READINESS_EVIDENCE/);
  assert.match(script, /ok = review\.status !== 'blocked'/);
  assert.match(script, /evidenceIntegrityStatus/);
  assert.match(script, /release-update-readiness-review\.json/);
  assert.match(script, /release-update-readiness-review\.csv/);
  assert.match(script, /release-update-readiness-evidence-template\.json/);
  assert.match(script, /release-update-checklist\.txt/);
});
