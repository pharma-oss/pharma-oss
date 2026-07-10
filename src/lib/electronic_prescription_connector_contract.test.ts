import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS
} from './electronic_prescription_field_readiness.ts';
import {
  buildElectronicPrescriptionConnectorContractCsv,
  buildElectronicPrescriptionConnectorContractReport,
  buildElectronicPrescriptionConnectorContractTemplate,
  type ElectronicPrescriptionConnectorContractInput
} from './electronic_prescription_connector_contract.ts';

const generatedAt = new Date('2026-07-01T09:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const connectorArtifactSha256 = 'a'.repeat(64);
const allCapabilities = [
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
];

const artifactVerificationId = (sha256: string) => createHash('sha256')
  .update(`yakureki-electronic-prescription-connector-artifact\0${sha256}`)
  .digest('hex');

function hpki(role: 'doctor' | 'pharmacist') {
  return {
    status: 'valid',
    signerRole: role,
    certificateSerialHash: role === 'doctor' ? 'd'.repeat(64) : 'a'.repeat(64),
    certificateIssuerHash: role === 'doctor' ? 'e'.repeat(64) : 'b'.repeat(64),
    certificateNotAfter: '2027-06-30',
    revocationCheckedAt: role === 'doctor'
      ? '2026-07-01T08:55:00.000Z'
      : '2026-07-01T10:01:00.000Z'
  };
}

function prescription(overrides: Record<string, unknown> = {}) {
  return {
    prescriptionId: 'EP-TEST-001',
    exchangeNumber: 'TEST-123456',
    prescriptionDate: '2026-07-01',
    validUntil: '2026-07-05',
    documentKind: 'electronic_prescription',
    signatureVerification: {
      status: 'valid',
      verifiedAt: '2026-07-01T08:55:00.000Z',
      hpkiVerification: hpki('doctor')
    },
    patient: {
      name: '匿名 太郎',
      birthDate: '1980-01-01'
    },
    provider: {
      institutionName: '匿名医療機関',
      doctorName: '匿名医師'
    },
    items: [{
      rpNumber: 1,
      drugCode: '123456789',
      drugCodeStatus: 'active',
      drugName: '匿名薬A',
      sourceDrugName: '匿名薬A',
      masterDrugName: '匿名薬A',
      drugNameVerificationStatus: 'matched',
      drugNameVerificationCheckedAt: '2026-07-01T08:56:00.000Z',
      amount: '1',
      unitText: '錠',
      unitConversion: {
        conversionFactor: '250',
        masterUnitText: 'mL',
        prescribedAmount: '3',
        prescribedUnitText: '缶'
      },
      usageFallbackText: '1日1回 朝食後',
      usage: '1日1回 朝食後',
      usageSupplementText: '患部に貼付',
      days: '7'
    }],
    supplementaryInformation: {
      prescriptionComments: ['検査値を確認すること。'],
      laboratoryResults: [{
        testName: 'eGFR',
        value: '58.2',
        unit: 'mL/min/1.73m2',
        measuredAt: '2026-06-30T09:00:00.000Z'
      }],
      narcoticAdministration: {
        isNarcoticPrescription: true,
        recordPresent: true,
        displayText: '麻薬施用者情報確認済み'
      }
    },
    ...overrides
  };
}

function dispensingInformationFile(signatureStatus = 'valid') {
  return {
    signatureStatus,
    signedAt: '2026-07-01T10:00:00.000Z',
    fileHash: 'f'.repeat(64),
    hpkiVerification: hpki('pharmacist')
  };
}

function completeContract(): ElectronicPrescriptionConnectorContractInput {
  return {
    connectorKind: 'qualification_terminal',
    capabilities: allCapabilities,
    onsExternalInterfaceSpecVersion: 'ONS external IF 2026-07-01',
    onsRecordConditionSpecVersion: 'record-condition 2026-07-01',
    onsStandardTestScenarioVersion: 'standard-scenario 2026-07-01',
    onsArtifactSha256: 'c'.repeat(64),
    connectorArtifactSha256,
    noRawOnsPayloadConfirmed: true,
    noProductionPatientDataConfirmed: true,
    samples: [
      { id: 'exchange', kind: 'fetch', scenarioId: 'exchange_number_fetch', response: { status: 'success', prescription: prescription() } },
      { id: 'prescription-id', kind: 'fetch', scenarioId: 'prescription_id_fetch', response: { status: 'success', prescription: prescription() } },
      { id: 'multiple', kind: 'fetch', scenarioId: 'same_day_multiple_prescriptions', response: { status: 'success', prescription: prescription({ prescriptionId: 'EP-TEST-002' }) } },
      { id: 'signature', kind: 'fetch', scenarioId: 'signature_hpki_validation', response: { status: 'success', prescription: prescription() } },
      { id: 'unit-conversion', kind: 'fetch', scenarioId: 'unit_conversion_usage_supplement', response: { status: 'success', prescription: prescription() } },
      { id: 'supplementary', kind: 'fetch', scenarioId: 'supplementary_records', response: { status: 'success', prescription: prescription() } },
      { id: 'narcotic', kind: 'fetch', scenarioId: 'narcotic_administration', response: { status: 'success', prescription: prescription() } },
      { id: 'duplicate', kind: 'operation', scenarioId: 'duplicate_check_alert', operation: 'duplicate_check', response: { status: 'success', duplicateCheck: { status: 'warning', messages: ['匿名化済み警告'] }, prescriptionIds: ['EP-TEST-001'] } },
      { id: 'reception-cancel', kind: 'operation', operation: 'reception_cancel', response: { status: 'success', operationId: 'op-001', cancelledAt: '2026-07-01T10:20:00.000Z', prescriptionIds: ['EP-TEST-001'] } },
      { id: 'register', kind: 'operation', scenarioId: 'dispensing_result_register_search_change_cancel', operation: 'dispensing_result_register', response: { status: 'success', dispensingResultId: 'DR-001', registeredAt: '2026-07-01T10:00:00.000Z', prescriptionIds: ['EP-TEST-001', 'EP-TEST-002'], dispensingInformationFile: dispensingInformationFile() } },
      { id: 'search', kind: 'operation', scenarioId: 'dispensing_result_register_search_change_cancel', operation: 'dispensing_result_search', response: { status: 'success', dispensingResultId: 'DR-001', registeredAt: '2026-07-01T10:00:00.000Z', prescriptionIds: ['EP-TEST-001', 'EP-TEST-002'] } },
      { id: 'cancel', kind: 'operation', scenarioId: 'dispensing_result_register_search_change_cancel', operation: 'dispensing_result_cancel', response: { status: 'success', dispensingResultId: 'DR-001', registeredAt: '2026-07-01T10:10:00.000Z', prescriptionIds: ['EP-TEST-001', 'EP-TEST-002'] } },
      { id: 'change', kind: 'operation', scenarioId: 'dispensing_result_register_search_change_cancel', operation: 'dispensing_result_change', response: { status: 'success', dispensingResultId: 'DR-001', registeredAt: '2026-07-01T10:05:00.000Z', prescriptionIds: ['EP-TEST-001', 'EP-TEST-002'], dispensingInformationFile: dispensingInformationFile() } },
      { id: 'paper-unsigned', kind: 'operation', scenarioId: 'paper_original_unsigned_dispensing', operation: 'dispensing_result_register', response: { status: 'success', dispensingResultId: 'DR-PAPER-001', registeredAt: '2026-07-01T10:00:00.000Z', prescriptionIds: ['EP-TEST-PAPER-001'], dispensingInformationFile: { signatureStatus: 'unsigned' } } },
      {
        id: 'dispensed-cancel-block',
        kind: 'scenario',
        scenarioId: 'dispensed_reception_cancel_block',
        response: {
          status: 'success',
          receptionCancelBlockedAfterDispensing: true,
          lifecycleDecision: { allowed: false }
        }
      },
      {
        id: 'abandoned-cleanup',
        kind: 'scenario',
        scenarioId: 'abandoned_reception_cleanup',
        response: {
          status: 'success',
          abandonedReceptionCleanupConfirmed: true,
          cleanupStatus: 'confirmed'
        }
      }
    ]
  };
}

test('electronic prescription connector contract passes with ONS provenance, samples, and privacy-safe normalized responses', () => {
  const report = buildElectronicPrescriptionConnectorContractReport({
    generatedAt,
    contract: completeContract()
  });
  const csv = buildElectronicPrescriptionConnectorContractCsv(report);

  assert.strictEqual(report.status, 'pass');
  assert.strictEqual(report.schemaVersion, 3);
  assert.strictEqual(report.statusLabel, '接続契約OK');
  assert.strictEqual(report.connectorArtifactVerificationId, artifactVerificationId(connectorArtifactSha256));
  assert.strictEqual(report.coverage.requiredScenarioCount, ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length);
  assert.strictEqual(report.coverage.coveredScenarioCount, ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length);
  assert.deepStrictEqual(report.coverage.missingOperations, []);
  assert.strictEqual(report.coverage.missingSampleIdCount, 0);
  assert.deepStrictEqual(report.coverage.duplicateSampleIds, []);
  assert.deepStrictEqual(report.missingCapabilities, []);
  assert.strictEqual(report.privacy.containsRawCertificateIdentifier, false);
  assert.strictEqual(report.privacy.containsProductionPatientData, false);
  assert.strictEqual(report.privacy.containsProductionPrescriptionIdentifier, false);
  assert.match(csv, /接続契約OK/);
});

test('electronic prescription connector contract blocks missing ONS provenance and scenario samples', () => {
  const report = buildElectronicPrescriptionConnectorContractReport({
    generatedAt,
    contract: {
      ...completeContract(),
      onsExternalInterfaceSpecVersion: '',
      onsArtifactSha256: '',
      connectorArtifactSha256: '',
      capabilities: ['prescription_fetch'],
      samples: completeContract().samples?.filter((sample) => sample.scenarioId !== 'narcotic_administration')
    }
  });

  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.missingCapabilities.includes('dispensing_result_change'));
  assert.deepStrictEqual(report.coverage.missingScenarioIds, ['narcotic_administration']);
  assert.ok(report.issues.some((issue) => issue.code === 'ons_external_interface_spec_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'ons_artifact_hash_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'connector_artifact_hash_missing'));
});

test('electronic prescription connector contract blocks secrets, raw payloads, and raw certificate identifiers', () => {
  const contract = completeContract();
  contract.samples = [
    ...(contract.samples || []),
    {
      id: 'leaky',
      kind: 'operation',
      operation: 'duplicate_check',
      response: {
        status: 'success',
        endpoint: 'https://connector.vendor.invalid/ep',
        authorization: 'Basic basic-secret',
        clientSecret: 'client-secret',
        apiKey: 'api-key-secret',
        note: 'X-API-Key: inline-api-secret',
        rawCsv: 'RE,1,2,3',
        certificateSerial: '0123456789',
        duplicateCheck: { status: 'passed' }
      }
    }
  ];
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.privacy.containsEndpointUrl, true);
  assert.strictEqual(report.privacy.containsBearerToken, true);
  assert.strictEqual(report.privacy.containsRawOnsPayload, true);
  assert.strictEqual(report.privacy.containsRawCertificateIdentifier, true);
});

test('electronic prescription connector contract blocks production patient identifiers in samples', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.scenarioId === 'exchange_number_fetch'
    ? {
        ...sample,
        response: {
          status: 'success',
          prescription: prescription({
            patient: {
              name: '山田 太郎',
              birthDate: '1980-01-01',
              insuranceNumber: 'INSURED-001'
            }
          })
        }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.privacy.containsProductionPatientData, true);
  assert.ok(report.issues.some((issue) => issue.code === 'production_patient_data_leak'));
});

test('electronic prescription connector contract blocks production prescription identifiers in samples', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.scenarioId === 'prescription_id_fetch'
    ? {
        ...sample,
        requestShape: {
          fetchKey: '123456',
          '引換番号': '123456'
        },
        response: {
          status: 'success',
          prescription: prescription({
            prescriptionId: 'EP-2026-REAL-001',
            exchangeNumber: '123456'
          })
        }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.privacy.containsProductionPrescriptionIdentifier, true);
  assert.ok(report.issues.some((issue) => issue.code === 'production_prescription_identifier_leak'));
});

test('electronic prescription connector contract blocks unchecked drug master display names', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.scenarioId === 'exchange_number_fetch'
    ? {
        ...sample,
        response: {
          status: 'success',
          prescription: prescription({
            items: [{
              rpNumber: 1,
              drugCode: '123456789',
              drugCodeStatus: 'active',
              drugName: '匿名薬A',
              sourceDrugName: '匿名薬A',
              masterDrugName: '匿名薬B',
              drugNameVerificationStatus: 'mismatch',
              amount: '1',
              unitText: '錠',
              usage: '1日1回 朝食後',
              days: '7'
            }]
          })
        }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some((issue) => (
    issue.code === 'fetch_payload_invalid'
    && issue.path.includes('drugNameVerificationStatus')
  )));
});

test('electronic prescription connector contract validates scenario-specific normalized fields', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.scenarioId === 'unit_conversion_usage_supplement'
    ? {
        ...sample,
        response: {
          status: 'success',
          prescription: prescription({
            items: [{
              rpNumber: 1,
              drugCode: '123456789',
              drugName: '匿名薬A',
              sourceDrugName: '匿名薬A',
              masterDrugName: '匿名薬A',
              drugNameVerificationStatus: 'matched',
              amount: '1',
              unitText: '錠',
              usage: '1日1回 朝食後',
              days: '7'
            }]
          })
        }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some((issue) => issue.code === 'unit_conversion_missing'));
});

test('electronic prescription connector contract blocks placeholder-only scenario coverage', () => {
  const contract = completeContract();
  contract.samples = [
    ...(contract.samples || []).filter((sample) => sample.scenarioId !== 'duplicate_check_alert'),
    {
      id: 'duplicate-placeholder',
      kind: 'scenario',
      scenarioId: 'duplicate_check_alert',
      response: { status: 'success' }
    },
    {
      id: 'duplicate-operation-without-scenario',
      kind: 'operation',
      operation: 'duplicate_check',
      response: { status: 'success', duplicateCheck: { status: 'warning', messages: ['匿名化済み警告'] } }
    }
  ];
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.coverage.missingScenarioIds.length, 0);
  assert.deepStrictEqual(report.coverage.missingOperations, []);
  assert.ok(report.issues.some((issue) => (
    issue.code === 'scenario_operation_sample_missing'
    && issue.message.includes('duplicate_check')
  )));
});

test('electronic prescription connector contract requires duplicate check review messages', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.scenarioId === 'duplicate_check_alert'
    ? {
        ...sample,
        response: {
          status: 'success',
          duplicateCheck: { status: 'blocked', messages: [] },
          prescriptionIds: ['EP-TEST-001']
        }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some((issue) => (
    issue.code === 'duplicate_check_message_missing'
    && issue.path.includes('duplicateCheck.messages')
  )));
});

test('electronic prescription connector contract requires duplicate check prescription IDs', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.scenarioId === 'duplicate_check_alert'
    ? {
        ...sample,
        response: {
          status: 'success',
          duplicateCheck: { status: 'warning', messages: ['匿名化済み警告'] }
        }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some((issue) => issue.code === 'duplicate_check_prescription_ids_missing'));
});

test('electronic prescription connector contract requires explicit lifecycle scenario evidence', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.scenarioId === 'dispensed_reception_cancel_block'
    ? {
        ...sample,
        response: { status: 'success' }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some((issue) => issue.code === 'dispensed_reception_cancel_block_missing'));
});

test('electronic prescription connector contract requires dispensing result timestamps and prescription IDs', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.id === 'register'
    ? {
        ...sample,
        response: {
          status: 'success',
          dispensingResultId: 'DR-001',
          dispensingInformationFile: dispensingInformationFile()
        }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some((issue) => issue.code === 'dispensing_result_registered_at_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'dispensing_result_prescription_ids_missing'));
});

test('electronic prescription connector contract requires reception cancel timestamps and prescription IDs', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => sample.id === 'reception-cancel'
    ? {
        ...sample,
        response: {
          status: 'success',
          operationId: 'op-001'
        }
      }
    : sample);
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.ok(report.issues.some((issue) => issue.code === 'reception_cancelled_at_missing'));
  assert.ok(report.issues.some((issue) => issue.code === 'reception_cancel_prescription_ids_missing'));
});

test('electronic prescription connector contract blocks invalid HPKI policy OIDs', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => {
    if (sample.id === 'signature') {
      return {
        ...sample,
        response: {
          status: 'success',
          prescription: prescription({
            signatureVerification: {
              status: 'valid',
              verifiedAt: '2026-07-01T08:55:00.000Z',
              hpkiVerification: {
                ...hpki('doctor'),
                policyOid: '1..2'
              }
            }
          })
        }
      };
    }
    if (sample.id === 'register') {
      return {
        ...sample,
        response: {
          status: 'success',
          dispensingResultId: 'DR-001',
          registeredAt: '2026-07-01T10:00:00.000Z',
          prescriptionIds: ['EP-TEST-001', 'EP-TEST-002'],
          dispensingInformationFile: {
            ...dispensingInformationFile(),
            hpkiVerification: {
              ...hpki('pharmacist'),
              policyOid: '1.02.3'
            }
          }
        }
      };
    }
    return sample;
  });
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.issues.filter((issue) => issue.code === 'hpki_policy_oid_invalid').length, 2);
});

test('electronic prescription connector contract blocks stale HPKI revocation checks', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => {
    if (sample.id === 'signature') {
      return {
        ...sample,
        response: {
          status: 'success',
          prescription: prescription({
            signatureVerification: {
              status: 'valid',
              verifiedAt: '2026-07-01T08:55:00.000Z',
              hpkiVerification: {
                ...hpki('doctor'),
                revocationCheckedAt: '2026-07-01T08:54:59.000Z'
              }
            }
          })
        }
      };
    }
    if (sample.id === 'register') {
      return {
        ...sample,
        response: {
          status: 'success',
          dispensingResultId: 'DR-001',
          registeredAt: '2026-07-01T10:00:00.000Z',
          prescriptionIds: ['EP-TEST-001', 'EP-TEST-002'],
          dispensingInformationFile: {
            ...dispensingInformationFile(),
            hpkiVerification: {
              ...hpki('pharmacist'),
              revocationCheckedAt: '2026-07-01T09:59:59.000Z'
            }
          }
        }
      };
    }
    return sample;
  });
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.strictEqual(report.issues.filter((issue) => issue.code === 'hpki_revocation_checked_at_stale').length, 2);
});

test('electronic prescription connector contract rejects reused sample IDs', () => {
  const contract = completeContract();
  contract.samples = contract.samples?.map((sample) => (
    sample.scenarioId === 'exchange_number_fetch' || sample.scenarioId === 'prescription_id_fetch'
      ? { ...sample, id: 'fetch-sample-reused' }
      : sample
  ));
  const report = buildElectronicPrescriptionConnectorContractReport({ generatedAt, contract });

  assert.strictEqual(report.status, 'blocked');
  assert.deepStrictEqual(report.coverage.duplicateSampleIds, ['fetch-sample-reused']);
  assert.ok(report.coverage.missingScenarioIds.includes('exchange_number_fetch'));
  assert.ok(report.coverage.missingScenarioIds.includes('prescription_id_fetch'));
  assert.ok(report.issues.some((issue) => (
    issue.code === 'sample_id_duplicate'
    && issue.message.includes('サンプルごとに一意')
  )));
});

test('electronic prescription connector contract exposes a CLI template contract', () => {
  const template = buildElectronicPrescriptionConnectorContractTemplate();
  const script = readFileSync(new URL('../../scripts/runElectronicPrescriptionConnectorContract.ts', import.meta.url), 'utf8');

  assert.strictEqual(template.schemaVersion, 3);
  assert.strictEqual(template.connectorArtifactSha256, '');
  assert.strictEqual(template.noRawOnsPayloadConfirmed, false);
  assert.strictEqual(template.noProductionPatientDataConfirmed, false);
  assert.strictEqual(template.samples.length, ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length + 6);
  assert.match(template.guidance, /ONS/);
  assert.match(template.guidance, /匿名/);
  assert.match(template.guidance, /一意な匿名サンプルID/);
  assert.match(template.guidance, /TEST/);
  assert.strictEqual(
    packageJson.scripts['electronic-prescription:connector-contract'],
    'tsx scripts/runElectronicPrescriptionConnectorContract.ts'
  );
  assert.match(script, /YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT/);
});
