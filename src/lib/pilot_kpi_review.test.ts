import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildPilotKpiReview,
  buildPilotKpiReviewAuditDetail,
  buildPilotKpiReviewChecklist,
  buildPilotKpiReviewCsv,
  buildPilotKpiEvidenceRequest,
  buildPilotKpiEvidenceRequestChecklist,
  buildPilotKpiReviewEvidenceTemplate,
  type PilotKpiSnapshotInput
} from './pilot_kpi_review.ts';

const generatedAt = new Date('2026-06-23T15:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function goodSnapshots(): PilotKpiSnapshotInput[] {
  const weeks = [
    ['2026-06-01', '2026-06-07'],
    ['2026-06-08', '2026-06-14'],
    ['2026-06-15', '2026-06-21'],
    ['2026-06-22', '2026-06-28']
  ];
  const snapshots: PilotKpiSnapshotInput[] = [];
  for (const storeId of ['store_001', 'store_002']) {
    for (const [weekStart, weekEnd] of weeks) {
      snapshots.push({
        storeId,
        weekStart,
        weekEnd,
        operatingDays: 6,
        prescriptionCount: 500,
        claimReturnCount: 2,
        averageHandlingMinutes: storeId === 'store_001' ? 15 : 16,
        closingRemainingTaskCount: 6,
        stockoutCount: 3,
        followUpDueCount: 40,
        followUpOnTimeCount: 39,
        criticalIncidentCount: 0,
        unrecoveredIncidentCount: 0,
        supportCaseCount: 5
      });
    }
  }
  return snapshots;
}

const realWorldProvenance = {
  capturedAt: '2026-06-23T14:45:00.000Z',
  operatorReviewId: 'review-pilot-202606',
  sourceArtifactSha256: 'a'.repeat(64)
};

test('buildPilotKpiReview passes for anonymized multi-store four-week pilot metrics', () => {
  const review = buildPilotKpiReview({
    generatedAt,
    evidence: {
      pilotId: 'pilot-202606',
      ...realWorldProvenance,
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realPilotEvidenceConfirmed: true,
      releasePostReviewAttached: true,
      slaReviewAttached: true,
      supportTriageAttached: true,
      improvementActionsRegistered: true,
      ownerReviewCompleted: true,
      snapshots: goodSnapshots()
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.statusLabel, 'パイロットKPI OK');
  assert.strictEqual(review.schemaVersion, 3);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.coverage.storeCount, 2);
  assert.strictEqual(review.coverage.weekCount, 4);
  assert.strictEqual(review.coverage.missingMetricCount, 0);
  assert.strictEqual(review.summary.prescriptionCount, 4000);
  assert.strictEqual(review.summary.claimReturnRatePercent, 0.4);
  assert.strictEqual(review.summary.followUpOnTimeRatePercent, 97.5);
  assert.strictEqual(review.trend.status, 'pass');
  assert.strictEqual(review.trend.statusLabel, '4週トレンド維持');
  assert.strictEqual(review.trend.worseningStoreCount, 0);
  assert.ok(review.gates.some((gate) => gate.id === 'four_week_trend' && gate.status === 'pass'));
  assert.ok(review.gates.every((gate) => gate.status === 'pass'));
});

test('buildPilotKpiReview blocks missing privacy, coverage and critical incidents', () => {
  const review = buildPilotKpiReview({
    generatedAt,
    evidence: {
      pilotId: 'blocked-pilot',
      noPatientDataConfirmed: false,
      anonymizedStoreIdsConfirmed: false,
      realPilotEvidenceConfirmed: true,
      snapshots: [
        {
          storeId: 'store_001',
          weekStart: '2026-06-01',
          weekEnd: '2026-06-07',
          operatingDays: 6,
          prescriptionCount: 80,
          claimReturnCount: 5,
          averageHandlingMinutes: 31,
          closingRemainingTaskCount: 40,
          stockoutCount: 8,
          followUpDueCount: 12,
          followUpOnTimeCount: 6,
          criticalIncidentCount: 1,
          unrecoveredIncidentCount: 1,
          supportCaseCount: 12
        }
      ]
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.ok(review.gates.some((gate) => gate.id === 'privacy' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'coverage' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'critical_incidents' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('正式拡大を止め')));
});

test('buildPilotKpiReview flags late pilot deterioration even when overall targets pass', () => {
  const snapshots = goodSnapshots().map((snapshot) => {
    if (snapshot.storeId !== 'store_001') return snapshot;
    const lateWeek = snapshot.weekStart === '2026-06-15' || snapshot.weekStart === '2026-06-22';
    return {
      ...snapshot,
      averageHandlingMinutes: lateWeek ? 17 : 13,
      supportCaseCount: lateWeek ? 10 : 2
    };
  });
  const review = buildPilotKpiReview({
    generatedAt,
    evidence: {
      pilotId: 'pilot-late-deterioration',
      ...realWorldProvenance,
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realPilotEvidenceConfirmed: true,
      releasePostReviewAttached: true,
      slaReviewAttached: true,
      supportTriageAttached: true,
      improvementActionsRegistered: true,
      ownerReviewCompleted: true,
      snapshots
    }
  });

  const storeTrend = review.trend.stores.find((store) => store.storeId === 'store_001');
  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.trend.status, 'attention');
  assert.strictEqual(review.trend.statusLabel, '後半悪化あり');
  assert.strictEqual(review.trend.worseningStoreCount, 1);
  assert.ok(storeTrend?.worseningMetricLabels.includes('平均処理時間'));
  assert.ok(storeTrend?.worseningMetricLabels.includes('問い合わせ負荷'));
  assert.ok(review.gates.some((gate) => gate.id === 'four_week_trend' && gate.status === 'attention'));
  assert.ok(review.nextActions.some((action) => action.includes('後半週で悪化')));
});

test('buildPilotKpiReview keeps internal or weak pilot evidence as attention', () => {
  const review = buildPilotKpiReview({
    generatedAt,
    evidence: {
      pilotId: 'internal-pilot-dry-run',
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realPilotEvidenceConfirmed: false,
      releasePostReviewAttached: true,
      slaReviewAttached: false,
      supportTriageAttached: true,
      improvementActionsRegistered: false,
      ownerReviewCompleted: true,
      snapshots: goodSnapshots()
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.blockedGateCount, 0);
  assert.ok(review.gates.some((gate) => gate.id === 'real_pilot_evidence' && gate.status === 'attention'));
  assert.ok(review.gates.some((gate) => gate.id === 'release_sla_evidence' && gate.status === 'attention'));
});

test('buildPilotKpiReview does not accept a real-pilot flag without source provenance', () => {
  const review = buildPilotKpiReview({
    generatedAt,
    evidence: {
      pilotId: 'pilot-without-source-proof',
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realPilotEvidenceConfirmed: true,
      releasePostReviewAttached: true,
      slaReviewAttached: true,
      supportTriageAttached: true,
      improvementActionsRegistered: true,
      ownerReviewCompleted: true,
      snapshots: goodSnapshots()
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.evidenceIntegrity.status, 'attention');
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'attention'));
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'real_world_proof_incomplete'));
});

test('buildPilotKpiReview blocks dummy data presented as a real pilot', () => {
  const review = buildPilotKpiReview({
    generatedAt,
    evidence: {
      pilotId: 'dummy-pilot',
      ...realWorldProvenance,
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realPilotEvidenceConfirmed: true,
      snapshots: goodSnapshots()
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity.status, 'blocked');
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
});

test('pilot KPI review exports privacy-safe template, CSV, checklist and audit detail', () => {
  const review = buildPilotKpiReview({
    generatedAt,
    evidence: {
      pilotId: '=pilot',
      ...realWorldProvenance,
      noPatientDataConfirmed: true,
      anonymizedStoreIdsConfirmed: true,
      realPilotEvidenceConfirmed: true,
      releasePostReviewAttached: true,
      slaReviewAttached: true,
      supportTriageAttached: true,
      improvementActionsRegistered: true,
      ownerReviewCompleted: true,
      snapshots: goodSnapshots().map((snapshot) => ({ ...snapshot, storeId: '=store_001' }))
    }
  });
  const template = buildPilotKpiReviewEvidenceTemplate({ generatedAt, pilotId: '=pilot' });
  const evidenceRequest = buildPilotKpiEvidenceRequest({ generatedAt, pilotId: '=pilot' });
  const evidenceRequestChecklist = buildPilotKpiEvidenceRequestChecklist(evidenceRequest);
  const csv = buildPilotKpiReviewCsv(review);
  const checklist = buildPilotKpiReviewChecklist(review);
  const auditDetail = buildPilotKpiReviewAuditDetail(review);
  const combined = [
    JSON.stringify(review),
    JSON.stringify(template),
    JSON.stringify(evidenceRequest),
    csv,
    checklist,
    evidenceRequestChecklist,
    auditDetail
  ].join('\n');

  assert.match(csv, /"'=pilot/);
  assert.match(csv, /"'=store_001/);
  assert.match(checklist, /パイロットKPIレビュー/);
  assert.match(auditDetail, /パイロットKPIレビュー/);
  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.schemaVersion, 3);
  assert.strictEqual(template.capturedAt, '');
  assert.strictEqual(template.privacy.containsPatientData, false);
  assert.match(csv, /4週間トレンド/);
  assert.match(checklist, /店舗別トレンド/);
  assert.match(auditDetail, /4週トレンド/);
  assert.strictEqual(evidenceRequest.type, 'yakureki-pilot-kpi-evidence-request');
  assert.strictEqual(evidenceRequest.schemaVersion, 1);
  assert.ok(evidenceRequest.items.some((item) => item.id === 'weekly_kpi_snapshots' && item.required));
  assert.ok(evidenceRequest.items.some((item) => item.id === 'owner_review' && item.neededFields.includes('元資料SHA-256')));
  assert.match(evidenceRequestChecklist, /パイロットKPI提出依頼/);
  assert.match(evidenceRequestChecklist, /YAKUREKI_PILOT_KPI_EVIDENCE/);
  assert.match(evidenceRequestChecklist, /ダミー、モック、練習用データ/);

  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '担当 花子', '/Users/secret', 'bearer-token-secret', 'https://example.test']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('pilot KPI review CLI is exposed and writes artifacts', () => {
  const script = readFileSync(new URL('../../scripts/runPilotKpiReview.ts', import.meta.url), 'utf8');

  assert.strictEqual(packageJson.scripts['pilot:kpi-review'], 'tsx scripts/runPilotKpiReview.ts');
  assert.match(script, /YAKUREKI_PILOT_KPI_EVIDENCE/);
  assert.match(script, /pilot-kpi-review\.json/);
  assert.match(script, /pilot-kpi-review\.csv/);
  assert.match(script, /pilot-kpi-evidence-template\.json/);
  assert.match(script, /pilot-kpi-checklist\.txt/);
  assert.match(script, /buildPilotKpiEvidenceRequest/);
  assert.match(script, /pilot-kpi-evidence-request\.json/);
  assert.match(script, /pilot-kpi-evidence-request\.txt/);
  assert.match(script, /trendStatusLabel/);
  assert.match(script, /evidenceIntegrityStatus/);
  assert.match(script, /ok: review\.status !== 'blocked'/);
});
