import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildPilotOperationalReadinessAuditDetail,
  buildPilotOperationalReadinessChecklist,
  buildPilotOperationalReadinessCsv,
  buildPilotOperationalReadinessEvidenceTemplate,
  buildPilotOperationalReadinessRequest,
  buildPilotOperationalReadinessRequestChecklist,
  buildPilotOperationalReadinessReview
} from './pilot_operational_readiness.ts';
import type { EvidenceIntegrityReview } from './evidence_integrity.ts';
import type { AiClinicalReview } from './ai_clinical_review.ts';
import type { ElectronicPrescriptionFieldReadinessReport } from './electronic_prescription_field_readiness.ts';
import type { MigrationTrialAcceptanceReview } from './migration_trial_acceptance.ts';
import type { OnlineEligibilityFieldReadinessReport } from './online_eligibility_field_readiness.ts';
import type { PilotKpiReview } from './pilot_kpi_review.ts';
import type { PrintMediaFieldVerificationReview } from './print_media_field_verification.ts';
import type { ReleaseOpsAcceptanceReview } from './release_ops_acceptance.ts';

const generatedAt = new Date('2026-06-29T18:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const script = readFileSync(new URL('../../scripts/runPilotOperationalReadiness.ts', import.meta.url), 'utf8');

const realWorldProvenance = {
  capturedAt: '2026-06-29T17:45:00.000Z',
  operatorReviewId: 'pilot-readiness-202606',
  sourceArtifactSha256: 'c'.repeat(64)
};

function evidenceIntegrity(status: 'pass' | 'attention' | 'blocked'): EvidenceIntegrityReview {
  return {
    type: 'yakureki-evidence-integrity-review',
    generatedAt: generatedAt.toISOString(),
    evidenceId: 'artifact',
    claimKind: 'pilot_operational_readiness',
    status,
    statusLabel: status === 'pass' ? '証跡OK' : status === 'attention' ? '証跡確認' : '証跡NG',
    realWorldEvidenceRequired: true,
    realWorldClaimed: true,
    realWorldProof: {
      capturedAtPresent: true,
      reviewRecordIdPresent: true,
      sourceArtifactSha256Present: true,
      noPatientDataConfirmedPresent: true,
      missing: []
    },
    noPatientDataExpected: true,
    privacy: {
      containsPatientDataSignals: false,
      signals: []
    },
    synthetic: {
      containsSyntheticSignals: false,
      allowSyntheticEvidence: false,
      signals: []
    },
    issues: status === 'blocked'
      ? [{
          code: 'synthetic_evidence_claims_real',
          severity: 'error',
          path: 'artifact',
          message: 'ダミー証跡は正式運用判定に使えません。'
        }]
      : [],
    requiredActions: status === 'blocked' ? ['実証跡へ差し替える'] : []
  };
}

const privacy = {
  containsPatientData: false,
  containsStaffNames: false,
  containsFacilityName: false,
  containsRawAuditDetails: false,
  containsRawSupportText: false,
  containsLocalPath: false,
  containsExternalSecrets: false
} as const;

function pilotKpiReview(status: 'pass' | 'attention' | 'blocked' = 'pass'): PilotKpiReview {
  return {
    type: 'yakureki-pilot-kpi-review',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    pilotId: 'pilot-202606',
    status,
    statusLabel: status === 'pass' ? 'パイロットKPI OK' : status === 'attention' ? 'パイロットKPIを確認' : 'パイロット継続判断を保留',
    targets: {
      minStoreCount: 2,
      minWeekCount: 4,
      maxClaimReturnRatePercent: 1,
      maxAverageHandlingMinutes: 18,
      maxClosingRemainingTasksPerDay: 3,
      maxStockoutsPer100Prescriptions: 1,
      minFollowUpOnTimeRatePercent: 95,
      maxSupportCasesPer100Prescriptions: 2
    },
    coverage: {
      storeCount: 2,
      weekCount: 4,
      snapshotCount: 8,
      missingMetricCount: 0,
      missingMetricSamples: []
    },
    summary: {
      storeId: 'all_stores',
      weekCount: 4,
      operatingDays: 48,
      prescriptionCount: 4000,
      claimReturnCount: 8,
      claimReturnRatePercent: 0.2,
      averageHandlingMinutes: 15.4,
      closingRemainingTasksPerDay: 1,
      stockoutsPer100Prescriptions: 0.4,
      followUpOnTimeRatePercent: 98,
      criticalIncidentCount: 0,
      unrecoveredIncidentCount: 0,
      supportCasesPer100Prescriptions: 0.8
    },
    stores: [],
    evidence: {
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realPilotEvidenceConfirmed: true,
      releasePostReviewAttached: true,
      slaReviewAttached: true,
      supportTriageAttached: true,
      improvementActionsRegistered: true,
      ownerReviewCompleted: true
    },
    privacy,
    evidenceIntegrity: evidenceIntegrity('pass'),
    trend: {
      status: 'pass',
      statusLabel: '4週トレンド維持',
      storeCount: 2,
      worseningStoreCount: 0,
      improvingStoreCount: 0,
      insufficientStoreCount: 0,
      stores: [],
      requiredActions: []
    },
    gates: [],
    passedGateCount: 14,
    attentionGateCount: status === 'attention' ? 1 : 0,
    blockedGateCount: status === 'blocked' ? 1 : 0,
    nextActions: status === 'pass' ? [] : ['パイロットKPIの未完了ゲートを確認する']
  };
}

function artifact<T>(type: string, status: 'pass' | 'attention' | 'blocked', statusLabel: string): T {
  return {
    type,
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel,
    privacy,
    evidenceIntegrity: evidenceIntegrity(status === 'blocked' ? 'blocked' : 'pass'),
    passedGateCount: status === 'pass' ? 4 : 3,
    attentionGateCount: status === 'attention' ? 1 : 0,
    blockedGateCount: status === 'blocked' ? 1 : 0,
    nextActions: status === 'pass' ? [] : [`${statusLabel}の未完了ゲートを確認する`]
  } as T;
}

function goodEvidence() {
  return {
    readinessId: 'pilot-readiness-202606',
    ...realWorldProvenance,
    noPatientDataConfirmed: true,
    realPilotDecisionConfirmed: true,
    ownerReviewCompleted: true,
    rolloutStopRuleConfirmed: true,
    supportHandoffCompleted: true,
    pilotKpiReview: pilotKpiReview(),
    releaseOpsAcceptance: artifact<ReleaseOpsAcceptanceReview>('yakureki-release-ops-acceptance', 'pass', '運用受入OK'),
    migrationAcceptance: artifact<MigrationTrialAcceptanceReview>('yakureki-migration-trial-acceptance', 'pass', '移行受入OK'),
    printFieldVerification: artifact<PrintMediaFieldVerificationReview>('yakureki-print-media-field-verification-review', 'pass', '実紙検証OK'),
    aiClinicalReview: artifact<AiClinicalReview>('yakureki-ai-clinical-review', 'pass', 'AI症例レビュー OK'),
    onlineEligibilityFieldReadiness: artifact<OnlineEligibilityFieldReadinessReport>('yakureki-online-eligibility-field-readiness', 'pass', 'OK'),
    electronicPrescriptionFieldReadiness: artifact<ElectronicPrescriptionFieldReadinessReport>('yakureki-electronic-prescription-field-readiness', 'pass', '公式運用試験OK')
  };
}

test('buildPilotOperationalReadinessReview passes only when pilot, operations, field, and owner gates pass', () => {
  const review = buildPilotOperationalReadinessReview({
    generatedAt,
    evidence: goodEvidence()
  });

  assert.strictEqual(review.type, 'yakureki-pilot-operational-readiness');
  assert.strictEqual(review.schemaVersion, 2);
  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.statusLabel, '正式運用候補');
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.pilot.storeCount, 2);
  assert.strictEqual(review.pilot.weekCount, 4);
  assert.strictEqual(review.artifacts.length, 7);
  assert.ok(review.artifacts.every((item) => item.status === 'pass'));
  assert.ok(review.gates.every((gate) => gate.status === 'pass'));
});

test('buildPilotOperationalReadinessReview blocks missing required artifacts and weak pilot coverage', () => {
  const review = buildPilotOperationalReadinessReview({
    generatedAt,
    evidence: {
      readinessId: 'missing-readiness',
      noPatientDataConfirmed: false,
      realPilotDecisionConfirmed: true,
      pilotKpiReview: {
        ...pilotKpiReview(),
        coverage: {
          storeCount: 1,
          weekCount: 2,
          snapshotCount: 2,
          missingMetricCount: 0,
          missingMetricSamples: []
        }
      }
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.ok(review.gates.some((gate) => gate.id === 'privacy' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'pilot_kpi_coverage' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'required_artifacts' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('リリース運用受入')));
});

test('buildPilotOperationalReadinessReview keeps attached AI review attention as pre-go-live attention', () => {
  const review = buildPilotOperationalReadinessReview({
    generatedAt,
    evidence: {
      ...goodEvidence(),
      aiClinicalReview: artifact<AiClinicalReview>('yakureki-ai-clinical-review', 'attention', 'AI症例レビューを確認')
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.artifacts.some((item) => item.id === 'ai_clinical_review' && item.status === 'attention'));
  assert.ok(review.gates.some((gate) => gate.id === 'required_artifacts' && gate.status === 'attention'));
});

test('buildPilotOperationalReadinessReview blocks nested privacy or evidence-integrity failures', () => {
  const unsafePrint = artifact<PrintMediaFieldVerificationReview>('yakureki-print-media-field-verification-review', 'pass', '実紙検証OK') as any;
  unsafePrint.privacy = {
    ...privacy,
    containsPatientData: true
  };
  const review = buildPilotOperationalReadinessReview({
    generatedAt,
    evidence: {
      ...goodEvidence(),
      printFieldVerification: unsafePrint,
      releaseOpsAcceptance: artifact<ReleaseOpsAcceptanceReview>('yakureki-release-ops-acceptance', 'blocked', '運用受入を保留')
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.ok(review.artifacts.some((item) => item.id === 'print_field_verification' && !item.privacyClear));
  assert.ok(review.artifacts.some((item) => item.id === 'release_ops_acceptance' && item.evidenceIntegrityStatus === 'blocked'));
});

test('pilot operational readiness exports privacy-safe CSV, template, checklist, audit detail, and CLI contract', () => {
  const review = buildPilotOperationalReadinessReview({
    generatedAt,
    evidence: {
      ...goodEvidence(),
      readinessId: '=readiness'
    }
  });
  const csv = buildPilotOperationalReadinessCsv(review);
  const template = buildPilotOperationalReadinessEvidenceTemplate({ generatedAt, readinessId: '=readiness' });
  const request = buildPilotOperationalReadinessRequest({ generatedAt, readinessId: '=readiness' });
  const requestChecklist = buildPilotOperationalReadinessRequestChecklist(request);
  const checklist = buildPilotOperationalReadinessChecklist(review);
  const auditDetail = buildPilotOperationalReadinessAuditDetail(review);
  const combined = JSON.stringify(review)
    + JSON.stringify(template)
    + JSON.stringify(request)
    + csv
    + checklist
    + requestChecklist
    + auditDetail;

  assert.match(csv, /"'=readiness/);
  assert.match(csv, /正式運用候補/);
  assert.match(checklist, /パイロット正式運用判定/);
  assert.strictEqual(request.type, 'yakureki-pilot-operational-readiness-request');
  assert.strictEqual(request.schemaVersion, 1);
  assert.ok(request.items.some((item) => item.id === 'pilot_kpi_review' && item.required && item.environmentVariable === 'YAKUREKI_PILOT_KPI_REVIEW_JSON'));
  assert.ok(request.items.some((item) => item.id === 'owner_decision' && item.neededFields.includes('停止ルール')));
  assert.match(requestChecklist, /パイロット正式運用判定 提出依頼/);
  assert.match(requestChecklist, /YAKUREKI_PILOT_OPERATIONAL_READINESS_EVIDENCE/);
  assert.match(requestChecklist, /ダミー、モック、練習用データ/);
  assert.match(auditDetail, /パイロット正式運用判定/);
  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.artifactEnvironmentVariables.pilotKpiReview, 'YAKUREKI_PILOT_KPI_REVIEW_JSON');
  assert.strictEqual(template.artifactEnvironmentVariables.electronicPrescriptionFieldReadiness, 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_READINESS_JSON');
  assert.strictEqual(template.privacy.containsPatientData, false);
  assert.strictEqual(packageJson.scripts['pilot:operational-readiness'], 'tsx scripts/runPilotOperationalReadiness.ts');
  assert.match(script, /YAKUREKI_PILOT_OPERATIONAL_READINESS_EVIDENCE/);
  assert.match(script, /YAKUREKI_RELEASE_OPS_ACCEPTANCE_JSON/);
  assert.match(script, /YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_READINESS_JSON/);
  assert.match(script, /pilot-operational-readiness\.json/);
  assert.match(script, /buildPilotOperationalReadinessRequest/);
  assert.match(script, /pilot-operational-readiness-request\.json/);
  assert.match(script, /pilot-operational-readiness-request\.txt/);

  for (const sensitiveValue of ['秘密薬局', '患者 太郎', '担当 花子', '/Users/secret', 'bearer-token-secret', 'https://example.test']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
