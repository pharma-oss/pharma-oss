import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildSupportIncidentNoticeChecklist,
  buildSupportIncidentSlaAuditDetail,
  buildSupportIncidentSlaCheckRequest,
  buildSupportIncidentSlaCheckRequestChecklist,
  buildSupportIncidentSlaCsv,
  buildSupportIncidentSlaEvidenceTemplate,
  buildSupportIncidentSlaReview
} from './support_incident_sla.ts';
import type { SupportCaseTriage } from './support_case_triage.ts';

const generatedAt = new Date('2026-06-23T12:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const realWorldProof = {
  capturedAt: '2026-06-23T12:00:00.000Z',
  operatorReviewId: 'support-sla-review-20260623',
  sourceArtifactSha256: 'd'.repeat(64)
};

function triage(priority: SupportCaseTriage['priority'] = 'high'): SupportCaseTriage {
  return {
    type: 'yakureki-support-case-triage',
    schemaVersion: 1,
    generatedAt: '2026-06-23T11:40:00.000Z',
    diagnosticGeneratedAt: '2026-06-23T11:35:00.000Z',
    status: priority === 'watch' ? 'ready_to_close' : 'needs_support',
    statusLabel: priority === 'watch' ? '大きな異常なし' : 'サポート確認',
    priority,
    priorityLabel: priority === 'urgent' ? '最優先' : priority === 'high' ? '高' : priority === 'watch' ? '経過観察' : '通常',
    summary: '外部接続・オンライン資格確認: 現地試験を確認',
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
      collectionCount: 6,
      totalCollectionRows: 180,
      officialAuditBlockerCount: 0,
      externalConnectorCount: 1,
      unresolvedInitialSetupSteps: 0
    },
    focusAreas: [
      {
        id: 'external_connector',
        title: '外部接続・オンライン資格確認',
        priority,
        priorityLabel: priority === 'urgent' ? '最優先' : priority === 'high' ? '高' : priority === 'watch' ? '経過観察' : '通常',
        statusLabel: '現地試験を確認',
        signalCount: 1,
        nextAction: '現地機器で成功試行を記録する',
        supportOwner: 'support',
        reproduceSteps: [
          '設定画面の外部連携設定を開く',
          '診断JSONの接続モードだけを確認する'
        ]
      },
      {
        id: 'print_media',
        title: '帳票・実紙検証',
        priority: 'normal',
        priorityLabel: '通常',
        statusLabel: '実紙検証を確認',
        signalCount: 2,
        nextAction: '実プリンタ、薬袋、ラベル紙、PDFで実紙確認を記録する',
        supportOwner: 'pharmacy',
        reproduceSteps: [
          '印刷ページで主要帳票を表示する',
          '実紙確認件数を診断JSONで確認する'
        ]
      }
    ]
  };
}

test('buildSupportIncidentSlaReview passes when notice, recovery and follow-up evidence meet targets', () => {
  const review = buildSupportIncidentSlaReview({
    generatedAt,
    triage: triage('high'),
	    evidence: {
      ...realWorldProof,
      incidentId: 'incident-20260623-001',
      occurredAt: '2026-06-23T10:00:00.000Z',
      acknowledgedAt: '2026-06-23T10:20:00.000Z',
      firstNoticeAt: '2026-06-23T10:45:00.000Z',
      lastStatusUpdateAt: '2026-06-23T11:30:00.000Z',
      recoveredAt: '2026-06-23T12:30:00.000Z',
      closedAt: '2026-06-24T09:00:00.000Z',
      noPatientDataConfirmed: true,
      responseOwnerRecordedOutsideJson: true,
      noticeChannelRecorded: true,
      userNoticePrepared: true,
      updateCadenceConfirmed: true,
      recoveryRunbookLinked: true,
      followUpReviewScheduled: true,
      affectedFocusAreaIds: ['external_connector']
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.statusLabel, '障害対応OK');
  assert.strictEqual(review.schemaVersion, 2);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'pass'));
  assert.strictEqual(review.severity, 'major');
  assert.strictEqual(review.elapsed.acknowledgeMinutes, 20);
  assert.strictEqual(review.elapsed.firstNoticeMinutes, 45);
  assert.strictEqual(review.elapsed.recoveryMinutes, 150);
  assert.strictEqual(review.blockedGateCount, 0);
  assert.deepStrictEqual(review.affectedAreas.map((area) => area.id), ['external_connector']);
});

test('buildSupportIncidentSlaReview blocks high impact incidents without privacy, owner, notice or runbook evidence', () => {
  const review = buildSupportIncidentSlaReview({
    generatedAt,
    triage: triage('urgent'),
	    evidence: {
      ...realWorldProof,
      occurredAt: '2026-06-23T10:00:00.000Z',
      acknowledgedAt: '2026-06-23T10:10:00.000Z',
      noPatientDataConfirmed: false,
      responseOwnerRecordedOutsideJson: false,
      noticeChannelRecorded: false,
      userNoticePrepared: false,
      recoveryRunbookLinked: false
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.severity, 'critical');
  assert.ok(review.blockedGateCount >= 4);
  assert.ok(review.nextActions.some((action) => action.includes('個人情報なし診断')));
  assert.ok(review.gates.some((gate) => gate.id === 'user_notice' && gate.status === 'blocked'));
});

test('buildSupportIncidentSlaReview asks for attention when timing targets are missed', () => {
  const review = buildSupportIncidentSlaReview({
    generatedAt,
    triage: triage('normal'),
    evidence: {
      occurredAt: '2026-06-23T10:00:00.000Z',
      acknowledgedAt: '2026-06-23T11:30:00.000Z',
      firstNoticeAt: '2026-06-23T13:00:00.000Z',
      recoveredAt: '2026-06-23T20:30:00.000Z',
      closedAt: '2026-06-27T10:00:00.000Z',
      noPatientDataConfirmed: true,
      responseOwnerRecordedOutsideJson: true,
      noticeChannelRecorded: true,
      userNoticePrepared: true,
      updateCadenceConfirmed: false,
      recoveryRunbookLinked: true,
      followUpReviewScheduled: false
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.severity, 'standard');
  assert.ok(review.gates.some((gate) => gate.id === 'acknowledge' && gate.status === 'attention'));
  assert.ok(review.gates.some((gate) => gate.id === 'recovery' && gate.status === 'attention'));
  assert.strictEqual(review.blockedGateCount, 0);
});

test('support incident SLA review covers update failure rollback evidence', () => {
  const review = buildSupportIncidentSlaReview({
    generatedAt,
    triage: triage('high'),
	    evidence: {
      ...realWorldProof,
      incidentId: 'update-failure-drill',
      occurredAt: '2026-06-23T10:00:00.000Z',
      acknowledgedAt: '2026-06-23T10:10:00.000Z',
      firstNoticeAt: '2026-06-23T10:30:00.000Z',
      rollbackDecisionAt: '2026-06-23T10:50:00.000Z',
      recoveredAt: '2026-06-23T11:10:00.000Z',
      closedAt: '2026-06-24T10:00:00.000Z',
      noPatientDataConfirmed: true,
      responseOwnerRecordedOutsideJson: true,
      noticeChannelRecorded: true,
      userNoticePrepared: true,
      updateCadenceConfirmed: true,
      recoveryRunbookLinked: true,
      updateFailureDrill: true,
      preUpdateBackupConfirmed: true,
      rollbackOrWorkaroundConfirmed: true,
      dataMigrationImpactChecked: true,
      releasePausedUntilFixed: true,
      followUpReviewScheduled: true
    }
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.evidence.updateFailureDrill, true);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.ok(review.gates.some((gate) => gate.id === 'pre_update_backup' && gate.status === 'pass'));
  assert.ok(review.gates.some((gate) => gate.id === 'rollback_decision' && gate.actual === '50分'));
  assert.ok(review.gates.some((gate) => gate.id === 'release_pause' && gate.status === 'pass'));
});

test('support incident SLA outputs privacy-safe template, CSV, checklist and audit detail', () => {
  const source = triage('high');
  source.focusAreas[0].title = '=外部接続';
	  const review = buildSupportIncidentSlaReview({
    generatedAt,
    triage: source,
    evidence: {
      ...realWorldProof,
      occurredAt: '2026-06-23T10:00:00.000Z',
      acknowledgedAt: '2026-06-23T10:20:00.000Z',
      firstNoticeAt: '2026-06-23T10:45:00.000Z',
      recoveredAt: '2026-06-23T12:30:00.000Z',
      closedAt: '2026-06-24T09:00:00.000Z',
      noPatientDataConfirmed: true,
      responseOwnerRecordedOutsideJson: true,
      noticeChannelRecorded: true,
      userNoticePrepared: true,
      updateCadenceConfirmed: true,
      recoveryRunbookLinked: true,
      followUpReviewScheduled: true
    }
  });
  const template = buildSupportIncidentSlaEvidenceTemplate({ generatedAt, triage: source });
  const csv = buildSupportIncidentSlaCsv(review);
  const checklist = buildSupportIncidentNoticeChecklist(review);
  const auditDetail = buildSupportIncidentSlaAuditDetail(review);
  const combined = JSON.stringify(review) + JSON.stringify(template) + csv + checklist + auditDetail;

  assert.match(csv, /"'=外部接続"/);
  assert.match(checklist, /告知に入れる要点/);
	  assert.match(auditDetail, /障害対応・SLA/);
  assert.strictEqual(template.schemaVersion, 2);
  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.capturedAt, '');
  assert.strictEqual(template.operatorReviewId, '');
  assert.strictEqual(template.sourceArtifactSha256, '');
  assert.strictEqual(template.privacy.containsRawNoticeText, false);
  assert.deepStrictEqual(template.affectedFocusAreaIds, []);

  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '担当 花子', '/Users/secret', 'bearer-token-secret', 'https://example.test']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('support incident SLA blocks dummy evidence even when operational gates look complete', () => {
  const review = buildSupportIncidentSlaReview({
    generatedAt,
    triage: triage('high'),
    evidence: {
      ...realWorldProof,
      incidentId: 'dummy-update-failure-drill',
      operatorReviewId: 'dummy-sla-review',
      occurredAt: '2026-06-23T10:00:00.000Z',
      acknowledgedAt: '2026-06-23T10:10:00.000Z',
      firstNoticeAt: '2026-06-23T10:30:00.000Z',
      rollbackDecisionAt: '2026-06-23T10:50:00.000Z',
      recoveredAt: '2026-06-23T11:10:00.000Z',
      closedAt: '2026-06-24T10:00:00.000Z',
      noPatientDataConfirmed: true,
      responseOwnerRecordedOutsideJson: true,
      noticeChannelRecorded: true,
      userNoticePrepared: true,
      updateCadenceConfirmed: true,
      recoveryRunbookLinked: true,
      updateFailureDrill: true,
      preUpdateBackupConfirmed: true,
      rollbackOrWorkaroundConfirmed: true,
      dataMigrationImpactChecked: true,
      releasePausedUntilFixed: true,
      followUpReviewScheduled: true
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity.status, 'blocked');
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
  assert.ok(review.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'blocked'));
});

test('support incident SLA CLI is exposed and writes review artifacts', () => {
  const script = readFileSync(new URL('../../scripts/runSupportIncidentSlaReview.ts', import.meta.url), 'utf8');

  assert.strictEqual(packageJson.scripts['support:sla'], 'tsx scripts/runSupportIncidentSlaReview.ts');
  assert.match(script, /YAKUREKI_SUPPORT_TRIAGE_JSON/);
  assert.match(script, /YAKUREKI_SUPPORT_SLA_EVIDENCE/);
  assert.match(script, /support-incident-sla-review\.json/);
  assert.match(script, /support-incident-sla-review\.csv/);
	  assert.match(script, /support-incident-sla-evidence-template\.json/);
  assert.match(script, /support-incident-notice-checklist\.txt/);
  assert.match(script, /evidenceIntegrityStatus/);
  assert.match(script, /support-incident-sla-check-request\.json/);
  assert.match(script, /support-incident-sla-check-request\.txt/);
  assert.match(script, /YAKUREKI_SUPPORT_SLA_REQUEST_ONLY/);
});

test('support incident SLA check request lists timeline, response and drill evidence without free text', () => {
  const request = buildSupportIncidentSlaCheckRequest({
    generatedAt,
    triage: triage('urgent'),
    incidentId: 'incident-2026-07-08'
  });

  assert.strictEqual(request.type, 'yakureki-support-incident-sla-check-request');
  assert.strictEqual(request.incidentId, 'incident-2026-07-08');
  assert.strictEqual(request.severity, 'critical');
  assert.strictEqual(request.policy.acknowledgeTargetMinutes, 15);

  const timelineItem = request.items.find((item) => item.id === 'incident_timeline')!;
  assert.strictEqual(timelineItem.required, true);
  assert.match(timelineItem.purpose, /15分以内/);

  const drillItem = request.items.find((item) => item.id === 'update_failure_drill')!;
  assert.strictEqual(drillItem.required, false);

  const checklist = buildSupportIncidentSlaCheckRequestChecklist(request);
  assert.match(checklist, /障害対応・更新失敗訓練 証跡提出依頼/);
  assert.match(checklist, /YAKUREKI_SUPPORT_TRIAGE_JSON/);
  assert.match(checklist, /YAKUREKI_SUPPORT_SLA_EVIDENCE/);

  const combined = JSON.stringify(request) + checklist;
  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '担当 花子', '/Users/secret', 'bearer-token-secret']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
