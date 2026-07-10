import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildSupportCaseDrillAuditDetail,
  buildSupportCaseDrillCsv,
  buildSupportCaseDrillEvidenceTemplate,
  buildSupportCaseDrillReview
} from './support_case_drill.ts';
import type { SupportCaseTriage } from './support_case_triage.ts';

const generatedAt = new Date('2026-06-23T10:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const drillScript = readFileSync(new URL('../../scripts/runSupportCaseDrill.ts', import.meta.url), 'utf8');
const realWorldProof = {
  capturedAt: '2026-06-23T10:00:00.000Z',
  operatorReviewId: 'support-drill-review-20260623',
  sourceArtifactSha256: 'e'.repeat(64)
};

function triage(priority: SupportCaseTriage['priority'] = 'normal'): SupportCaseTriage {
  return {
    type: 'yakureki-support-case-triage',
    schemaVersion: 1,
    generatedAt: '2026-06-23T09:45:00.000Z',
    diagnosticGeneratedAt: '2026-06-23T09:40:00.000Z',
    status: priority === 'watch' ? 'ready_to_close' : 'needs_support',
    statusLabel: priority === 'watch' ? '大きな異常なし' : 'サポート確認',
    priority,
    priorityLabel: priority === 'urgent' ? '最優先' : priority === 'high' ? '高' : priority === 'watch' ? '経過観察' : '通常',
    summary: '帳票・実紙検証: 実紙検証を確認',
    privacy: {
      containsPatientData: false,
      containsStaffNames: false,
      containsFacilityName: false,
      containsRawAuditDetails: false,
      containsLocalPath: false,
      containsExternalSecrets: false
    },
    snapshot: {
      auditLogCount: 12,
      latestAuditLogRecorded: true,
      collectionCount: 5,
      totalCollectionRows: 120,
      officialAuditBlockerCount: 0,
      externalConnectorCount: 1,
      unresolvedInitialSetupSteps: 0
    },
    focusAreas: [
      {
        id: 'print_media',
        title: '帳票・実紙検証',
        priority,
        priorityLabel: priority === 'urgent' ? '最優先' : priority === 'high' ? '高' : priority === 'watch' ? '経過観察' : '通常',
        statusLabel: '実紙検証を確認',
        signalCount: 2,
        nextAction: '実プリンタ、薬袋、ラベル紙、PDFで実紙確認を記録する',
        supportOwner: 'pharmacy',
        reproduceSteps: [
          '印刷ページで主要帳票を表示する',
          '実紙確認件数を診断JSONで確認する'
        ]
      },
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
      }
    ]
  };
}

test('buildSupportCaseDrillReview passes when every required confirmation is recorded', () => {
  const review = buildSupportCaseDrillReview({
    generatedAt,
    triage: triage('normal'),
	    evidence: {
      ...realWorldProof,
      scenarioId: 'field-print-drill',
      memoShared: true,
      diagnosticAttached: true,
      noPatientDataConfirmed: true,
      participantsRecordedOutsideJson: true,
      escalationRecorded: false,
      responseStartedAt: '2026-06-23T09:00:00.000Z',
      responseClosedAt: '2026-06-23T09:18:00.000Z',
      responseTargetMinutes: 30,
      pharmacyConfirmedFocusAreaIds: ['print_media'],
      supportConfirmedFocusAreaIds: ['external_connector'],
      reproducedFocusAreaIds: ['print_media', 'external_connector']
    }
  });

	  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.statusLabel, '訓練OK');
  assert.strictEqual(review.schemaVersion, 2);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.strictEqual(review.passedFocusAreaCount, 2);
  assert.strictEqual(review.blockedFocusAreaCount, 0);
  assert.strictEqual(review.responseMinutes, 18);
  assert.strictEqual(review.responseStartedWithinTarget, true);
  assert.ok(review.focusAreas.every((area) => area.nextAction === '対応不要'));
});

test('buildSupportCaseDrillReview blocks when privacy or reproduction evidence is missing', () => {
  const review = buildSupportCaseDrillReview({
    generatedAt,
    triage: triage('normal'),
	    evidence: {
      ...realWorldProof,
      memoShared: true,
      diagnosticAttached: false,
      noPatientDataConfirmed: false,
      participantsRecordedOutsideJson: true,
      pharmacyConfirmedFocusAreaIds: [],
      supportConfirmedFocusAreaIds: ['external_connector'],
      reproducedFocusAreaIds: ['external_connector']
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.blockedFocusAreaCount, 1);
  assert.strictEqual(review.noPatientDataConfirmed, false);
  assert.ok(review.focusAreas.some((area) => area.id === 'print_media' && area.nextAction.includes('薬局側')));
});

test('buildSupportCaseDrillReview asks for attention on high priority without escalation or timely response', () => {
  const review = buildSupportCaseDrillReview({
    generatedAt,
    triage: triage('high'),
	    evidence: {
      ...realWorldProof,
      memoShared: true,
      diagnosticAttached: true,
      noPatientDataConfirmed: true,
      participantsRecordedOutsideJson: true,
      escalationRecorded: false,
      responseStartedAt: '2026-06-23T09:00:00.000Z',
      responseClosedAt: '2026-06-23T10:10:00.000Z',
      responseTargetMinutes: 30,
      pharmacyConfirmedFocusAreaIds: ['print_media'],
      supportConfirmedFocusAreaIds: ['external_connector'],
      reproducedFocusAreaIds: ['print_media', 'external_connector']
    }
  });

  assert.strictEqual(review.status, 'attention');
  assert.strictEqual(review.statusLabel, '訓練を確認');
  assert.strictEqual(review.responseStartedWithinTarget, false);
  assert.strictEqual(review.blockedFocusAreaCount, 0);
});

test('support case drill exports privacy-safe template, CSV and audit detail', () => {
  const source = triage('normal');
  source.focusAreas[0].title = '=危険';
	  const review = buildSupportCaseDrillReview({
    generatedAt,
    triage: source,
    evidence: {
      ...realWorldProof,
      memoShared: true,
      diagnosticAttached: true,
      noPatientDataConfirmed: true,
      participantsRecordedOutsideJson: true,
      responseStartedAt: '2026-06-23T09:00:00.000Z',
      responseClosedAt: '2026-06-23T09:05:00.000Z',
      pharmacyConfirmedFocusAreaIds: ['print_media'],
      supportConfirmedFocusAreaIds: ['external_connector'],
      reproducedFocusAreaIds: ['print_media', 'external_connector']
    }
  });
  const template = buildSupportCaseDrillEvidenceTemplate({ generatedAt, triage: source });
  const csv = buildSupportCaseDrillCsv(review);
  const auditDetail = buildSupportCaseDrillAuditDetail(review);
  const combined = JSON.stringify(review) + JSON.stringify(template) + csv + auditDetail;

	  assert.match(csv, /"'=危険"/);
  assert.match(csv, /証跡品質/);
  assert.match(auditDetail, /問い合わせ訓練/);
  assert.match(auditDetail, /証跡品質/);
  assert.strictEqual(template.schemaVersion, 2);
  assert.strictEqual(template.memoShared, false);
  assert.strictEqual(template.capturedAt, '');
  assert.strictEqual(template.operatorReviewId, '');
  assert.strictEqual(template.sourceArtifactSha256, '');
  assert.strictEqual(template.privacy.containsRawNotes, false);
  assert.deepStrictEqual(template.pharmacyConfirmedFocusAreaIds, []);

  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '担当 花子', '/Users/secret', 'bearer-token-secret']) {
    assert.doesNotMatch(combined, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('support case drill blocks dummy evidence even when all confirmations are recorded', () => {
  const review = buildSupportCaseDrillReview({
    generatedAt,
    triage: triage('normal'),
    evidence: {
      ...realWorldProof,
      scenarioId: 'dummy-support-case-drill',
      operatorReviewId: 'dummy-drill-review',
      memoShared: true,
      diagnosticAttached: true,
      noPatientDataConfirmed: true,
      participantsRecordedOutsideJson: true,
      responseStartedAt: '2026-06-23T09:00:00.000Z',
      responseClosedAt: '2026-06-23T09:18:00.000Z',
      responseTargetMinutes: 30,
      pharmacyConfirmedFocusAreaIds: ['print_media'],
      supportConfirmedFocusAreaIds: ['external_connector'],
      reproducedFocusAreaIds: ['print_media', 'external_connector']
    }
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.evidenceIntegrity.status, 'blocked');
  assert.ok(review.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
  assert.strictEqual(review.blockedFocusAreaCount, 0);
});

test('support case drill CLI is exposed and writes review artifacts', () => {
  assert.strictEqual(packageJson.scripts['support:drill'], 'tsx scripts/runSupportCaseDrill.ts');
  assert.match(drillScript, /YAKUREKI_SUPPORT_TRIAGE_JSON/);
  assert.match(drillScript, /YAKUREKI_SUPPORT_DRILL_EVIDENCE/);
  assert.match(drillScript, /support-case-drill-review\.json/);
	  assert.match(drillScript, /support-case-drill-review\.csv/);
  assert.match(drillScript, /support-case-drill-evidence-template\.json/);
  assert.match(drillScript, /evidenceIntegrityStatus/);
});
