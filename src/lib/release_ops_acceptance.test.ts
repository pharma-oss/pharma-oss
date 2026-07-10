import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildReleaseOpsAcceptanceAuditDetail,
  buildReleaseOpsAcceptanceChecklist,
  buildReleaseOpsAcceptanceCsv,
  buildReleaseOpsAcceptanceEvidenceTemplate,
  buildReleaseOpsAcceptanceReview
} from './release_ops_acceptance.ts';
import { buildReleasePostReview } from './release_post_review.ts';
import { buildReleaseUpdateReadinessReview } from './release_update_readiness.ts';
import { buildSupportCaseDrillReview } from './support_case_drill.ts';
import type { SupportCaseTriage } from './support_case_triage.ts';
import { buildSupportIncidentSlaReview } from './support_incident_sla.ts';

const generatedAt = new Date('2026-06-23T16:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const realWorldProof = {
  capturedAt: '2026-06-23T16:00:00.000Z',
  operatorReviewId: 'ops-review-20260623',
  sourceArtifactSha256: 'f'.repeat(64)
};

function triageFixture(): SupportCaseTriage {
  return {
    type: 'yakureki-support-case-triage',
    schemaVersion: 1,
    generatedAt: '2026-06-23T00:00:00.000Z',
    diagnosticGeneratedAt: '2026-06-23T00:00:00.000Z',
    status: 'needs_support',
    statusLabel: 'サポート確認',
    priority: 'high',
    priorityLabel: '高',
    summary: '更新失敗訓練の匿名サンプル',
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false
    },
    snapshot: {
      auditLogCount: 20,
      latestAuditLogRecorded: true,
      collectionCount: 8,
      totalCollectionRows: 200,
      officialAuditBlockerCount: 0,
      externalConnectorCount: 2,
      unresolvedInitialSetupSteps: 0
    },
    focusAreas: [
      {
        id: 'release_update_failure',
        title: '更新失敗時の復旧',
        priority: 'high',
        priorityLabel: '高',
        statusLabel: '要確認',
        signalCount: 3,
        nextAction: '戻し判断と回避策を確認する',
        supportOwner: 'joint',
        reproduceSteps: [
          '更新失敗を検知する',
          '配信停止判断を確認する',
          '戻しまたは回避策の結果を確認する'
        ]
      }
    ]
  };
}

function passingBundle() {
  const triage = triageFixture();
  const readinessReview = buildReleaseUpdateReadinessReview({
    generatedAt,
    evidence: {
      releaseId: 'release-20260623-hotfix',
      capturedAt: '2026-06-23T16:00:00.000Z',
      operatorReviewId: 'readiness-review-20260623',
      sourceArtifactSha256: '1'.repeat(64),
      kind: 'hotfix',
      risk: 'high',
      plannedAt: '2026-06-23T00:00:00.000Z',
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
      rollbackTargetMinutes: 30,
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
  const releasePostReview = buildReleasePostReview({
    generatedAt,
    evidence: {
      releaseId: 'release-20260623-hotfix',
      capturedAt: '2026-06-23T16:00:00.000Z',
      operatorReviewId: 'post-review-20260623',
      sourceArtifactSha256: '2'.repeat(64),
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
  const slaReview = buildSupportIncidentSlaReview({
    generatedAt,
    triage,
    evidence: {
      incidentId: 'incident-20260623-update',
      capturedAt: '2026-06-23T16:00:00.000Z',
      operatorReviewId: 'sla-review-20260623',
      sourceArtifactSha256: '3'.repeat(64),
      occurredAt: '2026-06-23T00:00:00.000Z',
      acknowledgedAt: '2026-06-23T00:10:00.000Z',
      firstNoticeAt: '2026-06-23T00:20:00.000Z',
      lastStatusUpdateAt: '2026-06-23T00:40:00.000Z',
      rollbackDecisionAt: '2026-06-23T00:35:00.000Z',
      recoveredAt: '2026-06-23T01:30:00.000Z',
      closedAt: '2026-06-23T04:00:00.000Z',
      noPatientDataConfirmed: true,
      responseOwnerRecordedOutsideJson: true,
      noticeChannelRecorded: true,
      userNoticePrepared: true,
      updateCadenceConfirmed: true,
      recoveryRunbookLinked: true,
      rollbackOrWorkaroundConfirmed: true,
      updateFailureDrill: true,
      preUpdateBackupConfirmed: true,
      dataMigrationImpactChecked: true,
      releasePausedUntilFixed: true,
      followUpReviewScheduled: true,
      affectedFocusAreaIds: ['release_update_failure']
    }
  });
  const supportDrillReview = buildSupportCaseDrillReview({
    generatedAt,
    triage,
    evidence: {
      scenarioId: 'drill-20260623-update',
      capturedAt: '2026-06-23T16:00:00.000Z',
      operatorReviewId: 'drill-review-20260623',
      sourceArtifactSha256: '4'.repeat(64),
      memoShared: true,
      diagnosticAttached: true,
      noPatientDataConfirmed: true,
      participantsRecordedOutsideJson: true,
      escalationRecorded: true,
      responseTargetMinutes: 30,
      responseStartedAt: '2026-06-23T00:00:00.000Z',
      responseClosedAt: '2026-06-23T00:12:00.000Z',
      pharmacyConfirmedFocusAreaIds: ['release_update_failure'],
      supportConfirmedFocusAreaIds: ['release_update_failure'],
      reproducedFocusAreaIds: ['release_update_failure']
    }
  });

  return { readinessReview, releasePostReview, slaReview, supportDrillReview };
}

test('buildReleaseOpsAcceptanceReview passes when release, SLA and drill evidence are tied together', () => {
  const review = buildReleaseOpsAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'acceptance-20260623',
      ...realWorldProof,
      noPatientDataConfirmed: true,
      realInquiryOrUpdateFailureDrillConfirmed: true,
      ownerApproved: true,
      handoffChecklistStored: true,
      nextBusinessDayReviewScheduled: true,
      ...passingBundle()
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.schemaVersion, 3);
  assert.strictEqual(review.statusLabel, '運用受入OK');
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.linkage.status, 'pass');
  assert.strictEqual(review.linkage.releaseIdsMatch, true);
  assert.deepStrictEqual(review.linkage.sharedFocusAreaIds, ['release_update_failure']);
  assert.strictEqual(review.sources.releaseId, 'release-20260623-hotfix');
  assert.strictEqual(review.sources.incidentId, 'incident-20260623-update');
  assert.strictEqual(review.sources.scenarioId, 'drill-20260623-update');
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.every((gate) => gate.status === 'pass'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'pass'));
  assert.ok(review.gates.some((gate) => gate.id === 'cross_review_linkage' && gate.status === 'pass'));
});

test('buildReleaseOpsAcceptanceReview blocks missing artifacts and missing real drill evidence', () => {
  const review = buildReleaseOpsAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'missing-acceptance',
      noPatientDataConfirmed: false
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.ok(review.gates.some((gate) => gate.id === 'required_reviews' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'privacy' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'real_inquiry_or_update_failure_drill' && gate.status === 'blocked'));
});

test('buildReleaseOpsAcceptanceReview blocks unrelated release or drill reviews', () => {
  const bundle = passingBundle();
  const review = buildReleaseOpsAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'unlinked-acceptance',
      ...realWorldProof,
      noPatientDataConfirmed: true,
      realInquiryOrUpdateFailureDrillConfirmed: true,
      ownerApproved: true,
      handoffChecklistStored: true,
      nextBusinessDayReviewScheduled: true,
      ...bundle,
      releasePostReview: {
        ...bundle.releasePostReview,
        releaseId: 'release-20260623-unrelated'
      },
      supportDrillReview: {
        ...bundle.supportDrillReview,
        focusAreas: bundle.supportDrillReview.focusAreas.map((area) => ({
          ...area,
          id: 'unrelated_focus_area'
        }))
      }
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.linkage.status, 'blocked');
  assert.strictEqual(review.linkage.releaseIdsMatch, false);
  assert.deepStrictEqual(review.linkage.sharedFocusAreaIds, []);
  assert.ok(review.gates.some((gate) => gate.id === 'cross_review_linkage' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('同じreleaseId')));
  assert.ok(review.nextActions.some((action) => action.includes('問い合わせ訓練でも薬局・サポート確認済み')));
});

test('buildReleaseOpsAcceptanceReview keeps owner handoff gaps as attention after safe evidence passes', () => {
  const review = buildReleaseOpsAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'handoff-attention',
      ...realWorldProof,
      noPatientDataConfirmed: true,
      realInquiryOrUpdateFailureDrillConfirmed: true,
      ownerApproved: false,
      handoffChecklistStored: true,
      nextBusinessDayReviewScheduled: false,
      ...passingBundle()
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.some((gate) => gate.id === 'owner_handoff' && gate.status === 'attention'));
});

test('buildReleaseOpsAcceptanceReview blocks dummy operation acceptance evidence', () => {
  const review = buildReleaseOpsAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: 'dummy-acceptance',
      ...realWorldProof,
      noPatientDataConfirmed: true,
      realInquiryOrUpdateFailureDrillConfirmed: true,
      ownerApproved: true,
      handoffChecklistStored: true,
      nextBusinessDayReviewScheduled: true,
      ...passingBundle()
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity.status, 'blocked');
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'blocked'));
});

test('release ops acceptance exports privacy-safe template, CSV, checklist and audit detail', () => {
  const review = buildReleaseOpsAcceptanceReview({
    generatedAt,
    evidence: {
      acceptanceId: '=acceptance',
      ...realWorldProof,
      noPatientDataConfirmed: true,
      realInquiryOrUpdateFailureDrillConfirmed: true,
      ownerApproved: true,
      handoffChecklistStored: true,
      nextBusinessDayReviewScheduled: true,
      ...passingBundle()
    }
  });
  const template = buildReleaseOpsAcceptanceEvidenceTemplate({ generatedAt, acceptanceId: '=acceptance' });
  const csv = buildReleaseOpsAcceptanceCsv(review);
  const checklist = buildReleaseOpsAcceptanceChecklist(review);
  const auditDetail = buildReleaseOpsAcceptanceAuditDetail(review);
  const combined = JSON.stringify(review) + JSON.stringify(template) + csv + checklist + auditDetail;

  assert.match(csv, /"'=acceptance/);
  assert.match(csv, /レビューひも付けOK/);
  assert.match(checklist, /実問い合わせまたは更新失敗訓練/);
  assert.match(checklist, /同じreleaseId/);
  assert.match(auditDetail, /リリース運用受入/);
  assert.match(auditDetail, /ひも付け/);
  assert.strictEqual(template.schemaVersion, 3);
  assert.strictEqual(template.capturedAt, '');
  assert.strictEqual(template.operatorReviewId, '');
  assert.strictEqual(template.sourceArtifactSha256, '');
  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.privacy.containsRawSupportText, false);

  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '担当 花子', '/Users/secret', 'bearer-token-secret', 'https://example.test']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('release ops acceptance CLI is exposed and writes artifacts', () => {
  const script = readFileSync(new URL('../../scripts/runReleaseOpsAcceptance.ts', import.meta.url), 'utf8');

  assert.strictEqual(packageJson.scripts['release:ops-acceptance'], 'tsx scripts/runReleaseOpsAcceptance.ts');
  assert.match(script, /YAKUREKI_RELEASE_OPS_ACCEPTANCE_EVIDENCE/);
  assert.match(script, /YAKUREKI_RELEASE_READINESS_REVIEW_JSON/);
  assert.match(script, /YAKUREKI_RELEASE_POST_REVIEW_JSON/);
  assert.match(script, /YAKUREKI_SUPPORT_SLA_REVIEW_JSON/);
  assert.match(script, /YAKUREKI_SUPPORT_DRILL_REVIEW_JSON/);
  assert.match(script, /ok = review\.status !== 'blocked'/);
  assert.match(script, /evidenceIntegrityStatus/);
  assert.match(script, /linkageStatusLabel/);
  assert.match(script, /release-ops-acceptance\.json/);
  assert.match(script, /release-ops-acceptance\.csv/);
  assert.match(script, /release-ops-acceptance-evidence-template\.json/);
  assert.match(script, /release-ops-acceptance-checklist\.txt/);
});
