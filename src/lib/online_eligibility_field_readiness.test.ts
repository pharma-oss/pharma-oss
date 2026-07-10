import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { buildExternalConnectorReadinessReport } from './external_connector_readiness.ts';
import type { OnlineEligibilityResponseDiffReport } from './online_eligibility_response_diff.ts';
import {
  buildOnlineEligibilityAuthEvidenceTemplate,
  buildOnlineEligibilityFieldCheckRequest,
  buildOnlineEligibilityFieldCheckRequestChecklist,
  buildOnlineEligibilityFieldReadinessCsv,
  buildOnlineEligibilityFieldReadinessReport,
  type OnlineEligibilityAuthEvidenceInput
} from './online_eligibility_field_readiness.ts';

const generatedAt = new Date('2026-06-23T09:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

function passDiff(): OnlineEligibilityResponseDiffReport {
  return {
    status: 'pass',
    sampleCount: 1,
    failedSampleCount: 0,
    issueCount: 0,
    results: [],
    privacyIssueCount: 0,
    privacyIssues: []
  };
}

function readyConnector() {
  return buildExternalConnectorReadinessReport({
    generatedAt,
    mynaCardReader: {
      mode: 'bridge',
      endpoint: 'http://127.0.0.1:39100/myna/read',
      timeoutMs: 5000,
      lastAttempt: {
        outcome: 'success',
        statusCode: 200,
        durationMs: 120,
        responseShape: 'json_object'
      }
    },
    onlineEligibility: {
      mode: 'external',
      endpoint: 'https://eligibility.example.test/check?tenant=secret',
      bearerToken: 'secret-token',
      timeoutMs: 7000,
      lastAttempt: {
        outcome: 'success',
        statusCode: 200,
        durationMs: 430,
        responseShape: 'json_object'
      }
    }
  });
}

function readyFieldEvidence(): OnlineEligibilityAuthEvidenceInput {
  return {
    capturedAt: '2026-06-23T08:45:00.000Z',
    operatorReviewId: 'eligibility-field-review-001',
    sourceArtifactSha256: 'a'.repeat(64),
    noPatientDataConfirmed: true,
    officialProcedureConfirmed: true,
    authenticationMethodRecorded: true,
    credentialStorageConfirmed: true,
    operationalOwnerAssigned: true
  };
}

test('buildOnlineEligibilityFieldReadinessReport passes when auth, devices, samples, and privacy gates pass', () => {
  const report = buildOnlineEligibilityFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    responseDiff: passDiff(),
    authEvidence: readyFieldEvidence()
  });

  assert.strictEqual(report.status, 'pass');
  assert.strictEqual(report.schemaVersion, 2);
  assert.strictEqual(report.evidenceIntegrity.status, 'pass');
  assert.strictEqual(report.canRunFieldSuccessTrial, true);
  assert.strictEqual(report.canAcceptOfficialResponseSample, true);
  assert.strictEqual(report.passedGateCount, 6);
  assert.ok(report.gates.every((gate) => gate.status === 'pass'));
});

test('field readiness blocks when official auth is not confirmed even if connector is configured', () => {
  const report = buildOnlineEligibilityFieldReadinessReport({
    connectorReadiness: readyConnector(),
    responseDiff: passDiff(),
    authEvidence: {
      ...readyFieldEvidence(),
      officialProcedureConfirmed: false,
      authenticationMethodRecorded: true,
      credentialStorageConfirmed: true,
      operationalOwnerAssigned: true
    }
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canRunFieldSuccessTrial, false);
  assert.ok(report.gates.some((gate) => gate.id === 'official_auth_procedure' && gate.status === 'blocked'));
});

test('field readiness stays attention while official response sample is not registered', () => {
  const report = buildOnlineEligibilityFieldReadinessReport({
    connectorReadiness: readyConnector(),
    responseDiff: {
      ...passDiff(),
      status: 'empty',
      sampleCount: 0
    },
    authEvidence: readyFieldEvidence()
  });

  assert.strictEqual(report.status, 'attention');
  assert.strictEqual(report.canRunFieldSuccessTrial, true);
  assert.strictEqual(report.canAcceptOfficialResponseSample, true);
  assert.ok(report.gates.some((gate) => gate.id === 'official_response_sample' && gate.status === 'attention'));
});

test('field readiness CSV omits endpoint URLs, bearer tokens, request bodies, and response bodies', () => {
  const report = buildOnlineEligibilityFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    responseDiff: passDiff(),
    authEvidence: readyFieldEvidence()
  });
  const csv = buildOnlineEligibilityFieldReadinessCsv(report);

  assert.match(csv, /現地試験OK/);
  assert.match(csv, /患者情報なし/);
  assert.doesNotMatch(csv, /eligibility\.example\.test|secret-token|tenant=secret|リクエスト本文あり|レスポンス本文あり/);
});

test('field readiness does not pass real-world claims without provenance', () => {
  const report = buildOnlineEligibilityFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    responseDiff: passDiff(),
    authEvidence: {
      officialProcedureConfirmed: true,
      authenticationMethodRecorded: true,
      credentialStorageConfirmed: true,
      operationalOwnerAssigned: true,
      noPatientDataConfirmed: true
    }
  });

  assert.strictEqual(report.status, 'attention');
  assert.strictEqual(report.evidenceIntegrity.status, 'attention');
  assert.ok(report.gates.some((gate) => gate.id === 'evidence_integrity' && gate.status === 'attention'));
  assert.ok(report.evidenceIntegrity.issues.some((issue) => issue.code === 'real_world_proof_incomplete'));
});

test('field readiness blocks dummy evidence presented as a completed field trial', () => {
  const report = buildOnlineEligibilityFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    responseDiff: passDiff(),
    authEvidence: {
      ...readyFieldEvidence(),
      sourceLabel: 'dummy eligibility field fixture'
    } as OnlineEligibilityAuthEvidenceInput
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.evidenceIntegrity.status, 'blocked');
  assert.strictEqual(report.canAcceptOfficialResponseSample, false);
  assert.ok(report.evidenceIntegrity.issues.some((issue) => issue.code === 'synthetic_evidence_claims_real'));
});

test('field readiness blocks and redacts patient data in evidence', () => {
  const report = buildOnlineEligibilityFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    responseDiff: passDiff(),
    authEvidence: {
      ...readyFieldEvidence(),
      patientId: 'pat-secret-001',
      patientName: '患者 太郎'
    } as OnlineEligibilityAuthEvidenceInput
  });

  const serialized = JSON.stringify(report);
  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.evidenceIntegrity.issues.some((issue) => issue.code === 'privacy_patient_data_signal'));
  assert.doesNotMatch(serialized, /pat-secret-001|患者 太郎/);
});

test('field readiness exposes a safe evidence template and CLI', () => {
  const template = buildOnlineEligibilityAuthEvidenceTemplate();
  const script = readFileSync(new URL('../../scripts/runOnlineEligibilityFieldReadiness.ts', import.meta.url), 'utf8');

  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.sourceArtifactSha256, '');
  assert.match(template.guidance, /患者情報/);
  assert.strictEqual(
    packageJson.scripts['eligibility:field-readiness'],
    'tsx scripts/runOnlineEligibilityFieldReadiness.ts'
  );
  assert.match(script, /YAKUREKI_ELIGIBILITY_CONNECTOR_READINESS/);
  assert.match(script, /YAKUREKI_ELIGIBILITY_RESPONSE_DIFF/);
  assert.match(script, /YAKUREKI_ELIGIBILITY_FIELD_EVIDENCE/);
  assert.match(script, /ok: report\.status !== 'blocked'/);
  assert.match(script, /online-eligibility-field-check-request\.json/);
  assert.match(script, /online-eligibility-field-check-request\.txt/);
  assert.match(script, /YAKUREKI_ELIGIBILITY_FIELD_REQUEST_ONLY/);
});

test('online eligibility field check request lists auth, device and response sample evidence without free text', () => {
  const request = buildOnlineEligibilityFieldCheckRequest({ generatedAt });

  assert.strictEqual(request.type, 'yakureki-online-eligibility-field-check-request');
  assert.strictEqual(request.items.length, 3);
  assert.ok(request.items.every((item) => item.required));
  const ids = request.items.map((item) => item.id);
  assert.deepStrictEqual(ids, ['official_auth_procedure', 'device_connection_success', 'official_response_sample']);

  const checklist = buildOnlineEligibilityFieldCheckRequestChecklist(request);
  assert.match(checklist, /証跡提出依頼/);
  assert.match(checklist, /マイナ読取/);
  assert.match(checklist, /個人情報なしサンプル/);

  const serialized = JSON.stringify(request) + checklist;
  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '/Users/secret', 'bearer-token-secret', 'https://eligibility.example.com']) {
    assert.doesNotMatch(serialized, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
