import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { ElectronicPrescriptionConnectorContractReport } from './electronic_prescription_connector_contract.ts';
import type { ElectronicPrescriptionConnectorCapability } from './electronic_prescription.ts';
import { buildExternalConnectorReadinessReport } from './external_connector_readiness.ts';
import {
  ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS,
  buildElectronicPrescriptionFieldCheckRequest,
  buildElectronicPrescriptionFieldCheckRequestChecklist,
  buildElectronicPrescriptionFieldChecklist,
  buildElectronicPrescriptionFieldEvidenceTemplate,
  buildElectronicPrescriptionFieldReadinessCsv,
  buildElectronicPrescriptionFieldReadinessReport,
  type ElectronicPrescriptionFieldEvidenceInput
} from './electronic_prescription_field_readiness.ts';

const generatedAt = new Date('2026-06-30T09:00:00.000Z');
const recentPreflightAttemptAt = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();
const endpointSha256 = (endpoint: string) => createHash('sha256').update(new URL(endpoint).href).digest('hex');
const authSha256 = (token: string) => createHash('sha256')
  .update(`yakureki-electronic-prescription-auth\0${token.trim()}`)
  .digest('hex');
const connectorArtifactSha256 = 'a'.repeat(64);
const artifactVerificationId = (sha256: string) => createHash('sha256')
  .update(`yakureki-electronic-prescription-connector-artifact\0${sha256}`)
  .digest('hex');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const requiredCapabilities = [
  'prescription_fetch',
  'signature_verification',
  'hpki_verification',
  'duplicate_check',
  'reception_cancel',
  'dispensing_result',
  'dispensing_result_search',
  'dispensing_result_cancel',
  'dispensing_result_change',
  'refill_prescription',
  'paper_prescription'
].join(',');
const requiredDisplayItems = [
  'prescription_id',
  'exchange_number',
  'patient_birth_date',
  'provider',
  'doctor',
  'issued_at',
  'valid_until',
  'document_kind',
  'signature_status',
  'duplicate_check_status',
  'drug_code',
  'drug_name',
  'drug_name_master_match_status',
  'amount',
  'unit',
  'usage',
  'days',
  'unit_conversion',
  'usage_supplement',
  'prescription_comment',
  'laboratory_result',
  'narcotic_administration'
].join(',');

function readyConnector() {
  return buildExternalConnectorReadinessReport({
    generatedAt,
    mynaCardReader: { mode: 'off' },
    onlineEligibility: { mode: 'off' },
    electronicPrescription: {
      mode: 'connector',
      endpoint: 'https://bridge.vendor.invalid/electronic-prescription',
      bearerToken: 'secret-token',
      timeoutMs: 8000,
      connectorKind: 'web_api',
      connectorArtifactSha256,
      capabilities: requiredCapabilities,
      csvMaxBytes: 1048576,
      requiredDisplayItems,
      sharedFolderMode: 'not_applicable',
      lastAttemptEndpointSha256: endpointSha256('https://bridge.vendor.invalid/electronic-prescription'),
      lastAttemptAuthSha256: authSha256('secret-token'),
      lastAttemptConnectorKind: 'web_api',
      lastAttemptConnectorArtifactSha256: connectorArtifactSha256,
      lastAttemptCapabilities: requiredCapabilities,
      lastAttempt: {
        outcome: 'success',
        attemptedAt: recentPreflightAttemptAt(),
        statusCode: 200,
        durationMs: 420,
        responseShape: 'json_object'
      }
    }
  });
}

function readyConnectorContract(): ElectronicPrescriptionConnectorContractReport {
  return {
    type: 'yakureki-electronic-prescription-connector-contract',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    status: 'pass',
    statusLabel: '接続契約OK',
    connectorKind: 'web_api',
    connectorArtifactVerificationId: artifactVerificationId(connectorArtifactSha256),
    configuredCapabilities: requiredCapabilities.split(',') as ElectronicPrescriptionConnectorCapability[],
    missingCapabilities: [],
    specVersions: {
      onsExternalInterfaceSpecVersion: 'ONS external IF 2026-07-01',
      onsRecordConditionSpecVersion: 'record-condition 2026-07-01',
      onsStandardTestScenarioVersion: 'standard-scenario 2026-07-01',
      onsArtifactSha256Present: true,
      connectorArtifactSha256Present: true
    },
    privacy: {
      containsEndpointUrl: false,
      containsBearerToken: false,
      containsRawRequestOrResponse: false,
      containsRawCertificateIdentifier: false,
      containsRawOnsPayload: false,
      containsProductionPatientData: false,
      containsProductionPrescriptionIdentifier: false
    },
    coverage: {
      requiredScenarioCount: ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length,
      coveredScenarioCount: ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length,
      missingScenarioIds: [],
      requiredOperations: [
        'duplicate_check',
        'reception_cancel',
        'dispensing_result_register',
        'dispensing_result_search',
        'dispensing_result_cancel',
        'dispensing_result_change'
      ],
      coveredOperations: [
        'duplicate_check',
        'reception_cancel',
        'dispensing_result_register',
        'dispensing_result_search',
        'dispensing_result_cancel',
        'dispensing_result_change'
      ],
      missingOperations: [],
      missingSampleIdCount: 0,
      duplicateSampleIds: []
    },
    issueCount: 0,
    issues: [],
    requiredActions: []
  };
}

function completeEvidence(): ElectronicPrescriptionFieldEvidenceInput {
  return {
    capturedAt: '2026-06-30T08:45:00.000Z',
    operatorReviewId: 'ep-field-review-001',
    sourceArtifactSha256: 'a'.repeat(64),
    noPatientDataConfirmed: true,
    officialProcedureConfirmed: true,
    operationalOwnerAssigned: true,
    outageProcedureConfirmed: true,
    productionConnectorConfirmed: true,
    csvMaxBytesConfirmed: true,
    requiredDisplayItemsConfirmed: true,
    sharedFolderPollingPerformanceConfirmed: true,
    acceptedPrescriptionFetched: true,
    patientAndFetchKeyMatched: true,
    electronicSignatureVerified: true,
    hpkiCertificateVerificationConfirmed: true,
    hpkiPinIssuerCompatibilityConfirmed: true,
    validityPeriodConfirmed: true,
    fetchedContentMatchedSource: true,
    drugNameMasterMatchedConfirmed: true,
    drugCodeUnitUsageConfirmed: true,
    drugCodeLifecycleConfirmed: true,
    unitConversionConfirmed: true,
    usageTextFallbackConfirmed: true,
    supplementaryRecordsDisplayedAndPrintedConfirmed: true,
    narcoticAdministrationRecordConfirmed: true,
    insuranceAndRequiredPharmacyFieldsConfirmed: true,
    sameDayMultiplePrescriptionsConfirmed: true,
    exchangeNumberIntakeConfirmed: true,
    copyNotUsedAsPrescriptionConfirmed: true,
    paperPrescriptionOriginalConfirmed: true,
    duplicateCheckExecuted: true,
    duplicateAlertHandlingConfirmed: true,
    cancelledPrescriptionBlocked: true,
    changedPrescriptionReacquired: true,
    abandonedReceptionCleanupConfirmed: true,
    dispensedReceptionCancellationBlockedConfirmed: true,
    dispensingResultRegistered: true,
    dispensingResultSearchRecoveryConfirmed: true,
    dispensingInformationFileSignatureDisplayedAndPrintedConfirmed: true,
    dispensingInformationFileHpkiVerificationConfirmed: true,
    paperOriginalUnsignedDispensingConfirmed: true,
    allDispensingResultsPolicyConfirmed: true,
    scenarioReviews: ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.map((scenario, index) => ({
      scenarioId: scenario.id,
      outcome: 'pass',
      capturedAt: `2026-06-30T09:${String(index).padStart(2, '0')}:00.000Z`,
      operatorReviewId: `ep-scenario-${String(index + 1).padStart(2, '0')}`,
      sourceArtifactSha256: String(index + 1).repeat(64).slice(0, 64),
      noPatientDataConfirmed: true,
      checkedItems: scenario.requiredCheckedItems
    }))
  };
}

test('electronic prescription field readiness passes only with production connection and all official operations', () => {
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: completeEvidence()
  });

  assert.strictEqual(report.status, 'pass');
  assert.strictEqual(report.statusLabel, '公式運用試験OK');
  assert.strictEqual(report.schemaVersion, 7);
  assert.strictEqual(report.gateCount, 11);
  assert.strictEqual(report.passedGateCount, 11);
  assert.strictEqual(report.scenarioCoverage.requiredCount, ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length);
  assert.strictEqual(report.scenarioCoverage.passedCount, ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length);
  assert.deepStrictEqual(report.scenarioCoverage.duplicateOperatorReviewIds, []);
  assert.strictEqual(report.connectorContract?.status, 'pass');
  assert.strictEqual(report.canStartOfficialFieldTrial, true);
  assert.strictEqual(report.canDeclareOperationalReadiness, true);
  assert.strictEqual(report.evidenceIntegrity.status, 'pass');
  assert.strictEqual(report.privacy.containsRawCertificateIdentifier, false);
  assert.strictEqual(report.privacy.containsProductionPrescriptionIdentifier, false);
  assert.strictEqual(report.privacy.containsNamedDrugOrMedicalInstitution, false);
});

test('electronic prescription field readiness blocks demo connection and missing operational checks', () => {
  const connector = buildExternalConnectorReadinessReport({
    generatedAt,
    mynaCardReader: { mode: 'off' },
    onlineEligibility: { mode: 'off' },
    electronicPrescription: { mode: 'demo' }
  });
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: connector,
    connectorContract: readyConnectorContract(),
    fieldEvidence: {
      ...completeEvidence(),
      duplicateCheckExecuted: false,
      dispensingResultRegistered: false
    }
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canStartOfficialFieldTrial, false);
  assert.strictEqual(report.canDeclareOperationalReadiness, false);
  assert.ok(report.gates.some((gate) => gate.id === 'production_connector' && gate.status === 'blocked'));
  assert.ok(report.gates.some((gate) => gate.id === 'duplicate_check' && gate.status === 'blocked'));
  assert.ok(report.gates.some((gate) => gate.id === 'dispensing_result' && gate.status === 'blocked'));
});

test('electronic prescription field readiness requires connector contract before official field trial', () => {
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    fieldEvidence: completeEvidence()
  });
  const failedContract = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: {
      ...readyConnectorContract(),
      status: 'blocked',
      statusLabel: '接続契約未完了',
      issueCount: 1,
      requiredActions: ['ONS仕様資料一式のSHA-256を記録してください。'],
      specVersions: {
        ...readyConnectorContract().specVersions,
        onsArtifactSha256Present: false
      }
    },
    fieldEvidence: completeEvidence()
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canStartOfficialFieldTrial, false);
  assert.ok(report.gates.some((gate) => gate.id === 'connector_contract' && gate.status === 'blocked'));
  assert.strictEqual(failedContract.status, 'blocked');
  assert.strictEqual(failedContract.canStartOfficialFieldTrial, false);
  assert.ok(failedContract.gates.some((gate) => gate.id === 'connector_contract' && gate.nextAction.includes('SHA-256')));
});

test('electronic prescription field readiness binds connector contract to current connector artifact', () => {
  const staleContract = {
    ...readyConnectorContract(),
    connectorArtifactVerificationId: artifactVerificationId('b'.repeat(64))
  };
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: staleContract,
    fieldEvidence: completeEvidence()
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canStartOfficialFieldTrial, false);
  assert.ok(report.gates.some((gate) => (
    gate.id === 'connector_contract'
    && gate.status === 'blocked'
    && gate.nextAction.includes('現在の接続モジュール成果物')
  )));
});

test('electronic prescription field readiness blocks malformed connector contract reports safely', () => {
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: {
      type: 'yakureki-electronic-prescription-field-readiness',
      schemaVersion: 5,
      status: 'pass'
    },
    fieldEvidence: completeEvidence()
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.connectorContract, undefined);
  assert.ok(report.gates.some((gate) => (
    gate.id === 'connector_contract'
    && gate.status === 'blocked'
    && gate.nextAction.includes('connector-contract')
  )));
});

test('electronic prescription field readiness rejects legacy connector contracts without prescription identifier privacy checks', () => {
  const legacyContract = JSON.parse(JSON.stringify(readyConnectorContract())) as Record<string, unknown>;
  delete (legacyContract.privacy as Record<string, unknown>).containsProductionPrescriptionIdentifier;
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: legacyContract,
    fieldEvidence: completeEvidence()
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.connectorContract, undefined);
  assert.ok(report.gates.some((gate) => (
    gate.id === 'connector_contract'
    && gate.status === 'blocked'
    && gate.nextAction.includes('connector-contract')
  )));
});

test('electronic prescription field readiness blocks connector contracts with production prescription identifiers', () => {
  const contract = readyConnectorContract();
  contract.privacy.containsProductionPrescriptionIdentifier = true;
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: contract,
    fieldEvidence: completeEvidence()
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canStartOfficialFieldTrial, false);
  assert.ok(report.gates.some((gate) => (
    gate.id === 'connector_contract'
    && gate.status === 'blocked'
    && gate.nextAction.includes('電子処方箋ID')
  )));
});

test('electronic prescription field readiness does not accept provenance-free claims as complete', () => {
  const evidence = completeEvidence();
  delete evidence.capturedAt;
  delete evidence.operatorReviewId;
  delete evidence.sourceArtifactSha256;
  evidence.scenarioReviews = evidence.scenarioReviews?.map((review) => ({
    ...review,
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: ''
  }));
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: evidence
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.evidenceIntegrity.status, 'attention');
  assert.strictEqual(report.canDeclareOperationalReadiness, false);
  assert.ok(report.evidenceIntegrity.issues.some((issue) => issue.code === 'real_world_proof_incomplete'));
  assert.strictEqual(report.scenarioCoverage.incompleteScenarioIds.length, ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length);
});

test('electronic prescription field readiness requires per-scenario anonymous proof', () => {
  const evidence = completeEvidence();
  evidence.scenarioReviews = evidence.scenarioReviews?.filter((review) => review.scenarioId !== 'narcotic_administration');
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: evidence
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canDeclareOperationalReadiness, false);
  assert.deepStrictEqual(report.scenarioCoverage.missingScenarioIds, ['narcotic_administration']);
  assert.ok(report.gates.some((gate) => gate.id === 'official_scenario_coverage' && gate.status === 'blocked'));
});

test('electronic prescription field readiness rejects reused scenario review IDs', () => {
  const evidence = completeEvidence();
  evidence.scenarioReviews = evidence.scenarioReviews?.map((review) => (
    review.scenarioId === 'exchange_number_fetch' || review.scenarioId === 'prescription_id_fetch'
      ? { ...review, operatorReviewId: 'ep-scenario-reused' }
      : review
  ));
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: evidence
  });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.canDeclareOperationalReadiness, false);
  assert.deepStrictEqual(report.scenarioCoverage.duplicateOperatorReviewIds, ['ep-scenario-reused']);
  assert.ok(report.scenarioCoverage.incompleteScenarioIds.includes('exchange_number_fetch'));
  assert.ok(report.scenarioCoverage.incompleteScenarioIds.includes('prescription_id_fetch'));
  assert.ok(report.gates.some((gate) => (
    gate.id === 'official_scenario_coverage'
    && gate.status === 'blocked'
    && gate.nextAction.includes('シナリオごとに分ける')
  )));
});

test('electronic prescription field readiness rejects incomplete scenario proof', () => {
  const evidence = completeEvidence();
  evidence.scenarioReviews = evidence.scenarioReviews?.map((review) => review.scenarioId === 'dispensing_result_register_search_change_cancel'
    ? { ...review, sourceArtifactSha256: '' }
    : review);
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: evidence
  });

  assert.strictEqual(report.status, 'blocked');
  assert.deepStrictEqual(report.scenarioCoverage.incompleteScenarioIds, ['dispensing_result_register_search_change_cancel']);
});

test('electronic prescription field readiness requires scenario checked items', () => {
  const evidence = completeEvidence();
  evidence.scenarioReviews = evidence.scenarioReviews?.map((review) => review.scenarioId === 'duplicate_check_alert'
    ? { ...review, checkedItems: [] }
    : review);
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: evidence
  });

  assert.strictEqual(report.status, 'blocked');
  assert.deepStrictEqual(report.scenarioCoverage.incompleteScenarioIds, ['duplicate_check_alert']);
  assert.ok(report.gates.some((gate) => (
    gate.id === 'official_scenario_coverage'
    && gate.status === 'blocked'
    && gate.nextAction.includes('シナリオ別確認項目')
  )));
});

test('electronic prescription field readiness blocks dummy evidence and redacts patient data', () => {
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: {
      ...completeEvidence(),
      sourceLabel: 'dummy field fixture',
      patientName: '患者 太郎',
      patientId: 'pat-secret-001'
    } as ElectronicPrescriptionFieldEvidenceInput
  });
  const serialized = JSON.stringify(report);

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.evidenceIntegrity.status, 'blocked');
  assert.ok(report.evidenceIntegrity.privacy.containsPatientDataSignals);
  assert.doesNotMatch(serialized, /患者 太郎|pat-secret-001/);
});

test('electronic prescription field readiness blocks connector secrets in field evidence', () => {
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: {
      ...completeEvidence(),
      connectorEndpoint: 'https://bridge.vendor.invalid/electronic-prescription',
      authorization: 'Basic basic-secret',
      apiKey: 'api-key-secret',
      clientSecret: 'client-secret',
      requestBody: 'raw request body',
      responseBody: 'raw response body'
    } as ElectronicPrescriptionFieldEvidenceInput
  });
  const serialized = JSON.stringify(report);

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.privacy.containsEndpointUrl, true);
  assert.strictEqual(report.privacy.containsBearerToken, true);
  assert.strictEqual(report.privacy.containsRequestBody, true);
  assert.strictEqual(report.privacy.containsResponseBody, true);
  assert.ok(report.gates.some((gate) => (
    gate.id === 'privacy_safety'
    && gate.status === 'blocked'
    && gate.nextAction.includes('接続URL・認証情報')
    && gate.nextAction.includes('通信本文')
  )));
  assert.doesNotMatch(serialized, /bridge\.vendor|basic-secret|api-key-secret|client-secret|raw request body|raw response body/);
});

test('electronic prescription field readiness blocks raw HPKI certificate identifiers in field evidence', () => {
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: {
      ...completeEvidence(),
      rawCertificatePem: '-----BEGIN CERTIFICATE-----\nMIICREALCERT\n-----END CERTIFICATE-----',
      hpkiCertificate: {
        certificateSerial: 'A1B2C3D4E5F6',
        issuerName: 'HPKI Root CA'
      },
      pharmacistHpkiNote: '証明書シリアル: RAW-SERIAL-001'
    } as ElectronicPrescriptionFieldEvidenceInput
  });
  const serialized = JSON.stringify(report);

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.privacy.containsRawCertificateIdentifier, true);
  assert.ok(report.gates.some((gate) => (
    gate.id === 'privacy_safety'
    && gate.status === 'blocked'
    && gate.nextAction.includes('生証明書')
  )));
  assert.doesNotMatch(serialized, /MIICREALCERT|A1B2C3D4E5F6|HPKI Root CA|RAW-SERIAL-001/);
});

test('electronic prescription field readiness blocks production prescription IDs, drug names, and providers in field evidence', () => {
  const evidence = completeEvidence();
  evidence.scenarioReviews = evidence.scenarioReviews?.map((review) => review.scenarioId === 'exchange_number_fetch'
    ? {
        ...review,
        checkedItems: [
          ...(review.checkedItems || []),
          '引換番号: 123456'
        ]
      }
    : review);
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: {
      ...evidence,
      prescriptionId: 'EP-2026-REAL-001',
      drugName: 'ロキソニン錠60mg',
      medicalInstitutionName: '青山クリニック'
    } as ElectronicPrescriptionFieldEvidenceInput
  });
  const serialized = JSON.stringify(report);

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.privacy.containsProductionPrescriptionIdentifier, true);
  assert.strictEqual(report.privacy.containsNamedDrugOrMedicalInstitution, true);
  assert.ok(report.gates.some((gate) => (
    gate.id === 'privacy_safety'
    && gate.status === 'blocked'
    && gate.nextAction.includes('本番電子処方箋ID')
  )));
  assert.doesNotMatch(serialized, /EP-2026-REAL-001|123456|ロキソニン|青山クリニック/);
});

test('electronic prescription field exports explain the copy and exchange-number flow in plain language', () => {
  const report = buildElectronicPrescriptionFieldReadinessReport({
    generatedAt,
    connectorReadiness: readyConnector(),
    connectorContract: readyConnectorContract(),
    fieldEvidence: completeEvidence()
  });
  const csv = buildElectronicPrescriptionFieldReadinessCsv(report);
  const checklist = buildElectronicPrescriptionFieldChecklist(report);

  assert.match(csv, /処方内容（控え）/);
  assert.match(csv, /6桁引換番号/);
  assert.match(checklist, /処方箋原本ではありません/);
  assert.match(checklist, /調剤結果/);
  assert.doesNotMatch(csv, /bridge\.vendor|secret-token/);
});

test('electronic prescription field exposes a safe template and CLI contract', () => {
  const template = buildElectronicPrescriptionFieldEvidenceTemplate();
  const script = readFileSync(new URL('../../scripts/runElectronicPrescriptionFieldReadiness.ts', import.meta.url), 'utf8');

  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.strictEqual(template.schemaVersion, 5);
  assert.strictEqual(template.productionConnectorConfirmed, false);
  assert.strictEqual(template.csvMaxBytesConfirmed, false);
  assert.strictEqual(template.requiredDisplayItemsConfirmed, false);
  assert.strictEqual(template.sharedFolderPollingPerformanceConfirmed, false);
  assert.strictEqual(template.copyNotUsedAsPrescriptionConfirmed, false);
  assert.strictEqual(template.electronicSignatureVerified, false);
  assert.strictEqual(template.hpkiCertificateVerificationConfirmed, false);
  assert.strictEqual(template.hpkiPinIssuerCompatibilityConfirmed, false);
  assert.strictEqual(template.paperPrescriptionOriginalConfirmed, false);
  assert.strictEqual(template.drugNameMasterMatchedConfirmed, false);
  assert.strictEqual(template.drugCodeLifecycleConfirmed, false);
  assert.strictEqual(template.unitConversionConfirmed, false);
  assert.strictEqual(template.usageTextFallbackConfirmed, false);
  assert.strictEqual(template.supplementaryRecordsDisplayedAndPrintedConfirmed, false);
  assert.strictEqual(template.narcoticAdministrationRecordConfirmed, false);
  assert.strictEqual(template.insuranceAndRequiredPharmacyFieldsConfirmed, false);
  assert.strictEqual(template.sameDayMultiplePrescriptionsConfirmed, false);
  assert.strictEqual(template.dispensingResultSearchRecoveryConfirmed, false);
  assert.strictEqual(template.dispensingInformationFileSignatureDisplayedAndPrintedConfirmed, false);
  assert.strictEqual(template.dispensingInformationFileHpkiVerificationConfirmed, false);
  assert.strictEqual(template.paperOriginalUnsignedDispensingConfirmed, false);
  assert.strictEqual(template.abandonedReceptionCleanupConfirmed, false);
  assert.strictEqual(template.dispensedReceptionCancellationBlockedConfirmed, false);
  assert.strictEqual(template.scenarioReviews.length, ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length);
  assert.ok(template.scenarioReviews.every((review) => review.outcome === 'not_checked'));
  assert.ok(template.scenarioReviews.every((review) => Array.isArray(review.checkedItems) && review.checkedItems.length > 0));
  assert.match(template.guidance, /デモ・ダミー証跡/);
  assert.match(template.guidance, /一意な匿名確認ID/);
  assert.match(template.guidance, /checkedItems/);
  assert.strictEqual(
    packageJson.scripts['electronic-prescription:field-readiness'],
    'tsx scripts/runElectronicPrescriptionFieldReadiness.ts'
  );
  assert.match(script, /YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_READINESS/);
  assert.match(script, /YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_REPORT/);
  assert.match(script, /YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_EVIDENCE/);
  assert.match(script, /ok: report\.status !== 'blocked'/);
  assert.match(script, /electronic-prescription-field-check-request\.json/);
  assert.match(script, /electronic-prescription-field-check-request\.txt/);
  assert.match(script, /YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_REQUEST_ONLY/);
});

test('electronic prescription field check request lists connector, scenario and dispensing evidence without free text', () => {
  const request = buildElectronicPrescriptionFieldCheckRequest({ generatedAt });

  assert.strictEqual(request.type, 'yakureki-electronic-prescription-field-check-request');
  assert.strictEqual(request.items.length, 6);
  assert.ok(request.items.every((item) => item.required));
  const ids = request.items.map((item) => item.id);
  assert.deepStrictEqual(ids, [
    'governance_and_connector',
    'connector_contract',
    'accepted_prescription_and_signature',
    'exchange_number_duplicate_and_changes',
    'dispensing_result',
    'official_scenario_coverage'
  ]);

  const checklist = buildElectronicPrescriptionFieldCheckRequestChecklist(request);
  assert.match(checklist, /証跡提出依頼/);
  assert.match(checklist, /HPKI/);
  assert.match(checklist, /引換番号/);

  const serialized = JSON.stringify(request) + checklist;
  for (const sensitiveValue of ['患者 太郎', '秘密薬局', '/Users/secret', 'bearer-token-secret', 'https://ons.example.com', '-----BEGIN CERTIFICATE-----']) {
    assert.doesNotMatch(serialized, new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
