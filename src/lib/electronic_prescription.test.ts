import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  buildElectronicPrescriptionApplyDecision,
  buildElectronicPrescriptionIntegrityHash,
  buildElectronicPrescriptionOperationIdempotencyKey,
  canonicalizeElectronicPrescriptionInsuredNumber,
  getRequiredElectronicPrescriptionCapabilitiesForOperation,
  inferElectronicPrescriptionFetchKeyKind,
  normalizeElectronicPrescriptionDispensingResultPayload,
  normalizeElectronicPrescriptionFetchKey,
  requiresElectronicPrescriptionDispensingHpkiSignature,
  validateElectronicPrescriptionFetchMatch,
  validateElectronicPrescriptionLifecycleOperation,
  validateElectronicPrescriptionPayload,
  validateElectronicPrescriptionFetchInput,
  validateElectronicPrescriptionOperationInput
} from './electronic_prescription.ts';
import {
  buildElectronicPrescriptionConnectorAuthSha256,
  fetchElectronicPrescription,
  runElectronicPrescriptionConnectorPreflight,
  submitElectronicPrescriptionOperation
} from './electronic_prescription_client.ts';

const validPrescription = {
  prescriptionId: 'EP-2026-001',
  exchangeNumber: '123456',
  prescriptionDate: '2026-06-29',
  validUntil: '2026-07-03',
  documentKind: 'electronic_prescription' as const,
  signatureVerification: {
    status: 'valid' as const,
    verifiedAt: '2026-06-29T09:00:00.000Z',
    hpkiVerification: {
      status: 'valid' as const,
      signerRole: 'doctor' as const,
      certificateSerialHash: 'd'.repeat(64),
      certificateIssuerHash: 'e'.repeat(64),
      certificateNotAfter: '2027-06-29',
      revocationCheckedAt: '2026-06-29T09:00:00.000Z'
    }
  },
  patient: {
    name: '山田 太郎',
    birthDate: '1980-01-01',
    insuranceNumber: 'INSURED-001'
  },
  provider: { institutionName: '青空クリニック', doctorName: '佐藤 医師' },
  items: [{
    drugCode: '123456789',
    receiptCode: '620000001',
    yjCode: '1234567F1010',
    drugName: '薬A',
    sourceDrugName: '薬A',
    masterDrugName: '薬A',
    drugNameVerificationStatus: 'matched' as const,
    drugNameVerificationCheckedAt: '2026-06-29T09:01:00.000Z',
    amount: '1錠',
    usage: '1日1回 朝食後',
    days: '7'
  }]
};
const connectorCapabilities = [
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
const connectorArtifactSha256 = 'a'.repeat(64);
const preflightAttemptAtMinutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
function endpointSha256(endpoint = 'https://connector.example.test/e-prescription') {
  return createHash('sha256').update(new URL(endpoint).href).digest('hex');
}
function successfulPreflightEnv(
  connectorKind: 'qualification_terminal' | 'web_api' = 'qualification_terminal',
  endpoint = 'https://connector.example.test/e-prescription',
  token = 'secret-token'
) {
  return {
    ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME: 'success',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT: preflightAttemptAtMinutesAgo(5),
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE: '200',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE: 'json_object',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256: endpointSha256(endpoint),
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256: buildElectronicPrescriptionConnectorAuthSha256(token),
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND: connectorKind,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES: connectorCapabilities
  };
}
const verifiedDispensingDrugName = {
  sourceDrugName: '薬A',
  masterDrugName: '薬A',
  drugNameVerificationStatus: 'matched' as const,
  drugNameVerificationCheckedAt: '2026-06-30T09:01:00.000Z'
};

test('electronic prescription fetch keys are normalized and validated', () => {
  assert.strictEqual(normalizeElectronicPrescriptionFetchKey(' ab １２-34 '), 'AB12-34');
  assert.strictEqual(inferElectronicPrescriptionFetchKeyKind('123456'), 'exchange_number');
  assert.strictEqual(inferElectronicPrescriptionFetchKeyKind('EP-2026-ABC'), 'prescription_id');
  assert.strictEqual(canonicalizeElectronicPrescriptionInsuredNumber(' AB・１２－３４ '), 'AB1234');
  assert.deepStrictEqual(validateElectronicPrescriptionFetchInput({ fetchKey: 'EP***' }), {
    ok: false,
    message: '電子処方箋IDは英数字とハイフンで入力してください。'
  });
  assert.deepStrictEqual(validateElectronicPrescriptionFetchInput({ fetchKey: '123456' }), {
    ok: false,
    message: '引換番号で取得する場合は被保険者番号を入力してください。'
  });
  assert.deepStrictEqual(validateElectronicPrescriptionFetchInput({
    fetchKey: '123456',
    insuredNumber: ' insured-001 '
  }), {
    ok: true,
    fetchKey: '123456',
    keyKind: 'exchange_number',
    insuredNumber: 'INSURED-001'
  });
  assert.deepStrictEqual(validateElectronicPrescriptionFetchInput({
    fetchKey: '123456',
    keyKind: 'prescription_id'
  }), {
    ok: true,
    fetchKey: '123456',
    keyKind: 'prescription_id'
  });
  assert.deepStrictEqual(validateElectronicPrescriptionFetchInput({
    fetchKey: 'EP-2026-001',
    keyKind: 'prescription_id',
    insuredNumber: ' insured-001 '
  }), {
    ok: true,
    fetchKey: 'EP-2026-001',
    keyKind: 'prescription_id',
    insuredNumber: 'INSURED-001'
  });
  assert.deepStrictEqual(validateElectronicPrescriptionFetchInput({
    fetchKey: '123456',
    insuredNumber: 'AB・12－34'
  }), {
    ok: true,
    fetchKey: '123456',
    keyKind: 'exchange_number',
    insuredNumber: 'AB・12-34'
  });
});

test('electronic prescription integrity hash uses real sha-256', async () => {
  const hash = await buildElectronicPrescriptionIntegrityHash({
    prescriptionId: 'EP-1',
    patient: { name: '山田 太郎' },
    provider: { institutionName: '青空クリニック' },
    items: [{ drugName: '薬A', amount: '1錠', usage: '1日1回', days: '7' }]
  });
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.strictEqual(hash.length, 64);
});

test('electronic prescription operation idempotency key is stable for the same logical payload', async () => {
  const first = validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_register',
    prescriptionId: 'EP-2026-001',
    integrityHash: 'b'.repeat(64),
    payload: {
      dispensingDate: '2026/06/30',
      items: [{
        rpNumber: 1,
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  });
  const second = validateElectronicPrescriptionOperationInput({
    payload: {
      items: [{
        days: '7',
        usage: '1日1回 朝食後',
        amount: '1錠',
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        rpNumber: 1
      }],
      dispensingDate: '2026-06-30'
    },
    integrityHash: 'b'.repeat(64),
    prescriptionId: 'EP-2026-001',
    operation: 'dispensing_result_register'
  });

  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(
    first.ok && second.ok
      ? await buildElectronicPrescriptionOperationIdempotencyKey(first.input)
      : '',
    first.ok && second.ok
      ? await buildElectronicPrescriptionOperationIdempotencyKey(second.input)
      : 'mismatch'
  );
  assert.match(first.ok ? await buildElectronicPrescriptionOperationIdempotencyKey(first.input) : '', /^[a-f0-9]{64}$/);
});

test('electronic prescription client is explicit when connector is unconfigured', async () => {
  const result = await fetchElectronicPrescription(
    { fetchKey: '123456', insuredNumber: 'INSURED-001' },
    { env: { ELECTRONIC_PRESCRIPTION_MODE: 'off' } }
  );
  assert.strictEqual(result.status, 'unconfigured');
  assert.strictEqual(result.mode, 'off');
  assert.match(result.message, /未設定/);
});

test('electronic prescription client marks demo responses as demo only', async () => {
  const result = await fetchElectronicPrescription(
    { fetchKey: '123456', insuredNumber: 'INSURED-001' },
    { env: { ELECTRONIC_PRESCRIPTION_MODE: 'demo' } }
  );
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.mode, 'demo');
  assert.match(result.message, /デモ用/);
  assert.match(result.warnings.join(' '), /本番受付として扱わない/);
  assert.strictEqual(result.prescription?.items.length, 1);
  assert.match(result.integrityHash || '', /^[a-f0-9]{64}$/);
  assert.strictEqual(buildElectronicPrescriptionApplyDecision(result).canApply, false);
});

test('electronic prescription payload validation requires identifiers, patient, provider, dates, codes, and directions', () => {
  const issues = validateElectronicPrescriptionPayload({
    patient: {},
    provider: {},
    items: [{ drugName: '薬A', amount: '', usage: '', days: '' }]
  });

  assert.ok(issues.some((issue) => issue.field === 'prescriptionId'));
  assert.ok(issues.some((issue) => issue.field === 'patient.birthDate'));
  assert.ok(issues.some((issue) => issue.field === 'provider.institutionName'));
  assert.ok(issues.some((issue) => issue.field === 'items.0.drugCode'));
  assert.ok(issues.some((issue) => issue.field === 'items.0.usage'));

  const impossibleDateIssues = validateElectronicPrescriptionPayload({
    ...validPrescription,
    patient: { ...validPrescription.patient, birthDate: '1980-02-30' },
    prescriptionDate: '2026-02-30'
  });
  assert.ok(impossibleDateIssues.some((issue) => issue.field === 'patient.birthDate'));
  assert.ok(impossibleDateIssues.some((issue) => issue.field === 'prescriptionDate'));
});

test('electronic prescription payload validation checks drug code lifecycle, units, and usage fallback', () => {
  const unitless = validateElectronicPrescriptionPayload({
    ...validPrescription,
    items: [{
      ...validPrescription.items[0],
      amount: '1'
    }]
  });
  const abolished = validateElectronicPrescriptionPayload({
    ...validPrescription,
    prescriptionDate: '2026-06-29',
    items: [{
      ...validPrescription.items[0],
      drugCodeStatus: 'abolished',
      drugCodeAbolishedAt: '2026-06-01'
    }]
  });
  const fallbackOnly = validateElectronicPrescriptionPayload({
    ...validPrescription,
    items: [{
      ...validPrescription.items[0],
      amount: '1',
      unitText: '錠',
      usage: '',
      usageFallbackText: '1日1回 朝食後'
    }]
  });

  assert.ok(unitless.some((issue) => issue.field === 'items.0.unit'));
  assert.ok(abolished.some((issue) => issue.field === 'items.0.drugCodeStatus'));
  assert.ok(!fallbackOnly.some((issue) => issue.field === 'items.0.usage'));
});

test('electronic prescription payload validation blocks unchecked or mismatched drug master names', () => {
  const unchecked = validateElectronicPrescriptionPayload({
    ...validPrescription,
    items: [{
      ...validPrescription.items[0],
      drugNameVerificationStatus: 'not_checked' as const
    }]
  });
  const displayMismatch = validateElectronicPrescriptionPayload({
    ...validPrescription,
    items: [{
      ...validPrescription.items[0],
      drugName: '別薬B',
      sourceDrugName: '薬A',
      masterDrugName: '薬A',
      drugNameVerificationStatus: 'matched' as const
    }]
  });
  const masterMismatch = validateElectronicPrescriptionPayload({
    ...validPrescription,
    items: [{
      ...validPrescription.items[0],
      sourceDrugName: '薬A',
      masterDrugName: '別薬B',
      drugNameVerificationStatus: 'matched' as const
    }]
  });
  const missingEvidence = validateElectronicPrescriptionPayload({
    ...validPrescription,
    items: [{
      ...validPrescription.items[0],
      sourceDrugName: '',
      masterDrugName: '',
      drugNameVerificationStatus: 'matched' as const
    }]
  });

  assert.ok(unchecked.some((issue) => issue.field === 'items.0.drugNameVerificationStatus'));
  assert.ok(displayMismatch.some((issue) => issue.field === 'items.0.drugName'));
  assert.ok(masterMismatch.some((issue) => issue.field === 'items.0.masterDrugName'));
  assert.ok(missingEvidence.some((issue) => issue.field === 'items.0.drugNameVerificationStatus'));
});

test('electronic prescription payload validates supplementary clinical and narcotic records', () => {
  const issues = validateElectronicPrescriptionPayload({
    ...validPrescription,
    items: [{
      ...validPrescription.items[0],
      unitConversion: {
        conversionFactor: '0',
        prescribedAmount: '',
        prescribedUnitText: ''
      }
    }],
    supplementaryInformation: {
      prescriptionComments: ['重複処方を確認済み'],
      laboratoryResults: [{ testName: '', value: '', measuredAt: 'invalid-date' }],
      narcoticAdministration: {
        isNarcoticPrescription: true,
        recordPresent: false
      }
    }
  });

  assert.ok(issues.some((issue) => issue.field.endsWith('unitConversion.conversionFactor')));
  assert.ok(issues.some((issue) => issue.field === 'items.0.unitConversion'));
  assert.ok(issues.some((issue) => issue.field.startsWith('supplementaryInformation.laboratoryResults.0')));
  assert.ok(issues.some((issue) => issue.field === 'supplementaryInformation.narcoticAdministration'));
});

test('electronic prescription payload validation requires valid doctor HPKI verification', () => {
  const missingHpki = validateElectronicPrescriptionPayload({
    ...validPrescription,
    signatureVerification: { status: 'valid' as const }
  });
  const wrongRole = validateElectronicPrescriptionPayload({
    ...validPrescription,
    signatureVerification: {
      status: 'valid' as const,
      hpkiVerification: {
        status: 'valid' as const,
        signerRole: 'pharmacist' as const
      }
    }
  });
  const missingDetails = validateElectronicPrescriptionPayload({
    ...validPrescription,
    signatureVerification: {
      status: 'valid' as const,
      hpkiVerification: {
        status: 'valid' as const,
        signerRole: 'doctor' as const
      }
    }
  });
  const expiredAtSigning = validateElectronicPrescriptionPayload({
    ...validPrescription,
    signatureVerification: {
      ...validPrescription.signatureVerification,
      hpkiVerification: {
        ...validPrescription.signatureVerification.hpkiVerification,
        certificateNotAfter: '2026-06-28'
      }
    }
  });
  const dateOnlyRevocationCheck = validateElectronicPrescriptionPayload({
    ...validPrescription,
    signatureVerification: {
      ...validPrescription.signatureVerification,
      hpkiVerification: {
        ...validPrescription.signatureVerification.hpkiVerification,
        revocationCheckedAt: '2026-06-29'
      }
    }
  });
  const staleRevocationCheck = validateElectronicPrescriptionPayload({
    ...validPrescription,
    signatureVerification: {
      ...validPrescription.signatureVerification,
      verifiedAt: '2026-06-29T09:00:00.000Z',
      hpkiVerification: {
        ...validPrescription.signatureVerification.hpkiVerification,
        revocationCheckedAt: '2026-06-29T08:59:59.000Z'
      }
    }
  });
  const invalidPolicyOid = validateElectronicPrescriptionPayload({
    ...validPrescription,
    signatureVerification: {
      ...validPrescription.signatureVerification,
      hpkiVerification: {
        ...validPrescription.signatureVerification.hpkiVerification,
        policyOid: '1..2'
      }
    }
  });

  assert.ok(missingHpki.some((issue) => issue.field === 'signatureVerification.hpkiVerification'));
  assert.ok(wrongRole.some((issue) => issue.field === 'signatureVerification.hpkiVerification.signerRole'));
  assert.ok(missingDetails.some((issue) => issue.field.endsWith('certificateSerialHash')));
  assert.ok(missingDetails.some((issue) => issue.field.endsWith('certificateIssuerHash')));
  assert.ok(missingDetails.some((issue) => issue.field.endsWith('certificateNotAfter')));
  assert.ok(missingDetails.some((issue) => issue.field.endsWith('revocationCheckedAt')));
  assert.ok(expiredAtSigning.some((issue) => issue.message.includes('有効期限切れ')));
  assert.ok(dateOnlyRevocationCheck.some((issue) => issue.message.includes('ISO日時')));
  assert.ok(staleRevocationCheck.some((issue) => issue.message.includes('署名検証日時より前')));
  assert.ok(invalidPolicyOid.some((issue) => issue.field.endsWith('policyOid')));
});

test('electronic prescription fetch match blocks a different patient or fetch key', () => {
  const payload = {
    prescriptionId: 'EP-2026-001',
    patient: { birthDate: '1980-01-01' },
    provider: {},
    items: []
  };
  const patientMismatch = validateElectronicPrescriptionFetchMatch({
    fetchKey: 'EP-2026-001',
    keyKind: 'prescription_id',
    patientBirthDate: '1981-01-01'
  }, payload);
  const keyMismatch = validateElectronicPrescriptionFetchMatch({
    fetchKey: 'EP-2026-999',
    keyKind: 'prescription_id'
  }, payload);

  assert.deepStrictEqual(patientMismatch.ok ? null : patientMismatch.status, 'patient_mismatch');
  assert.deepStrictEqual(keyMismatch.ok ? null : keyMismatch.status, 'invalid_payload');
});

test('electronic prescription fetch match tolerates insured-number separator variations only', () => {
  const payload = {
    prescriptionId: 'EP-2026-001',
    patient: { birthDate: '1980-01-01', insuranceNumber: 'AB12-34' },
    provider: {},
    items: []
  };
  const separatorVariation = validateElectronicPrescriptionFetchMatch({
    fetchKey: 'EP-2026-001',
    keyKind: 'prescription_id',
    insuredNumber: 'AB・12－34'
  }, payload);
  const differentNumber = validateElectronicPrescriptionFetchMatch({
    fetchKey: 'EP-2026-001',
    keyKind: 'prescription_id',
    insuredNumber: 'AB・12－35'
  }, payload);

  assert.strictEqual(separatorVariation.ok, true);
  assert.strictEqual(differentNumber.ok, false);
  assert.strictEqual(differentNumber.ok ? '' : differentNumber.status, 'patient_mismatch');
});

test('electronic prescription apply decision blocks unchecked and blocked duplicate checks', () => {
  const unchecked = buildElectronicPrescriptionApplyDecision({
    status: 'success',
    mode: 'connector',
    message: '取得',
    prescription: validPrescription,
    duplicateCheck: { status: 'not_checked', messages: [] },
    warnings: [],
    integrityHash: 'a'.repeat(64)
  }, { now: new Date('2026-06-30T09:00:00.000Z') });
  const blocked = buildElectronicPrescriptionApplyDecision({
    status: 'success',
    mode: 'connector',
    message: '取得',
    prescription: validPrescription,
    duplicateCheck: { status: 'blocked', messages: ['併用禁忌を確認'] },
    warnings: [],
    integrityHash: 'a'.repeat(64)
  }, { now: new Date('2026-06-30T09:00:00.000Z') });

  assert.strictEqual(unchecked.canApply, false);
  assert.strictEqual(blocked.canApply, false);
  assert.match(blocked.message, /反映を止め/);
});

test('electronic prescription connector responses are normalized without leaking endpoint details', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      prescription: {
        prescriptionId: 'EP-2026-001',
        prescriptionDate: '2026-06-29',
        validUntil: '2026-07-03',
        documentKind: 'electronic_prescription',
        signatureVerification: {
          status: 'valid',
          verifiedAt: '2026-06-29T09:00:00.000Z',
          hpkiVerification: {
            status: 'valid',
            signerRole: 'doctor',
            certificateSerialHash: 'd'.repeat(64),
            certificateIssuerHash: 'e'.repeat(64),
            certificateNotAfter: '2027-06-29',
            revocationCheckedAt: '2026-06-29T09:00:00.000Z'
          }
        },
        patient: { name: '山田 太郎', birthDate: '1980-01-01' },
        provider: { institutionName: '青空クリニック', departmentName: '内科', doctorName: '佐藤 医師' },
        items: [{
          rpNumber: 1,
          drugCode: '123456789',
          drugCodeStatus: 'active',
          drugName: '薬A',
          sourceDrugName: '薬A',
          masterDrugName: '薬A',
          drugNameVerificationStatus: 'matched',
          drugNameVerificationCheckedAt: '2026-06-29T09:01:00.000Z',
          amount: '1',
          unitCode: 'TAB',
          unitText: '錠',
          unitConversion: {
            conversionFactor: '250',
            masterUnitText: 'mL',
            prescribedAmount: '3',
            prescribedUnitText: '缶'
          },
          usageFallbackText: '1日1回 朝食後',
          usageSupplementText: '腰部に貼付',
          days: '7'
        }],
        supplementaryInformation: {
          prescriptionComments: ['年末年始で前倒し受診のため。'],
          laboratoryResults: [{
            testName: 'eGFR',
            value: '58.2',
            unit: 'mL/min/1.73m2',
            measuredAt: '2026-06-28T09:00:00.000Z'
          }],
          narcoticAdministration: {
            isNarcoticPrescription: true,
            recordPresent: true,
            displayText: '麻薬施用者情報確認済み'
          }
        }
      },
      duplicateCheck: {
        status: 'passed',
        messages: ['確認済み https://connector.example.test/check Bearer secret-token Basic basic-secret X-API-Key: api-secret 電子処方箋ID EP-2026-001 引換番号 123456 患者名 山田 太郎']
      },
      warnings: [
        `診断 ${'c'.repeat(64)}`,
        'https://connector.example.test/debug',
        'fetchKey=123456 patientId pat-secret-001 調剤結果ID DR-001 client_secret=client-secret password=pw-secret'
      ]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await fetchElectronicPrescription(
    { fetchKey: 'ep-2026-001', patientBirthDate: '1980-01-01' },
    {
      env: {
        ELECTRONIC_PRESCRIPTION_MODE: 'connector',
        ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
        ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
        ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
        ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
        ...successfulPreflightEnv()
      },
      fetchImpl: fetchImpl as typeof fetch
    }
  );
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.mode, 'connector');
  assert.strictEqual(result.prescription?.prescriptionId, 'EP-2026-001');
  assert.strictEqual(result.prescription?.items[0].unitText, '錠');
  assert.strictEqual(result.prescription?.items[0].usage, '1日1回 朝食後');
  assert.strictEqual(result.prescription?.items[0].usageFallbackText, '1日1回 朝食後');
  assert.strictEqual(result.prescription?.items[0].usageSupplementText, '腰部に貼付');
  assert.strictEqual(result.prescription?.items[0].unitConversion?.prescribedUnitText, '缶');
  assert.strictEqual(result.prescription?.items[0].drugCodeStatus, 'active');
  assert.strictEqual(result.prescription?.items[0].sourceDrugName, '薬A');
  assert.strictEqual(result.prescription?.items[0].masterDrugName, '薬A');
  assert.strictEqual(result.prescription?.items[0].drugNameVerificationStatus, 'matched');
  assert.strictEqual(result.prescription?.supplementaryInformation?.prescriptionComments[0], '年末年始で前倒し受診のため。');
  assert.strictEqual(result.prescription?.supplementaryInformation?.laboratoryResults[0].testName, 'eGFR');
  assert.strictEqual(result.prescription?.supplementaryInformation?.narcoticAdministration?.recordPresent, true);
  assert.strictEqual(result.prescription?.signatureVerification?.hpkiVerification?.signerRole, 'doctor');
  assert.strictEqual(result.prescription?.signatureVerification?.hpkiVerification?.certificateSerialHash, 'd'.repeat(64));
  assert.strictEqual(result.duplicateCheck?.status, 'passed');
  assert.strictEqual(calls[0].input, 'https://connector.example.test/e-prescription');
  assert.match(String(calls[0].init?.body), /EP-2026-001/);
  assert.doesNotMatch(result.message, /connector\.example/);
  assert.match(result.duplicateCheck?.messages.join(' ') || '', /redacted-api-key/);
  assert.match(result.duplicateCheck?.messages.join(' ') || '', /redacted-prescription-id/);
  assert.match(result.duplicateCheck?.messages.join(' ') || '', /redacted-fetch-key/);
  assert.match(result.duplicateCheck?.messages.join(' ') || '', /redacted-patient-name/);
  assert.match(result.warnings.join(' '), /redacted-secret/);
  assert.match(result.warnings.join(' '), /redacted-patient-id/);
  assert.match(result.warnings.join(' '), /redacted-dispensing-result-id/);
  assert.doesNotMatch(result.duplicateCheck?.messages.join(' ') || '', /EP-2026-001|123456|山田 太郎|basic-secret|api-secret/);
  assert.doesNotMatch(result.warnings.join(' '), /pat-secret-001|DR-001|client-secret|pw-secret/);
  assert.doesNotMatch(JSON.stringify(result), /connector\.example/);
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp('c'.repeat(64)));
});

test('electronic prescription connector free-text status messages redact identifiers', async () => {
  const result = await fetchElectronicPrescription(
    { fetchKey: 'EP-2026-001' },
    {
      env: {
        ELECTRONIC_PRESCRIPTION_MODE: 'connector',
        ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
        ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
        ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
        ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
        ...successfulPreflightEnv()
      },
      fetchImpl: (async () => new Response(JSON.stringify({
        status: 'changed',
        message: '処方箋ID EP-2026-001 引換番号 123456 患者名 山田 太郎 は変更済みです https://connector.example.test Bearer secret-token Basic basic-secret api_key=api-secret',
        warnings: ['電子処方箋ID EP-2026-001 の再取得が必要です']
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch
    }
  );

  assert.strictEqual(result.status, 'changed');
  assert.match(result.message, /redacted-prescription-id/);
  assert.match(result.message, /redacted-fetch-key/);
  assert.match(result.message, /redacted-patient-name/);
  assert.doesNotMatch(result.message, /EP-2026-001|123456|山田 太郎|connector\.example|secret-token|basic-secret|api-secret/);
  assert.doesNotMatch(result.warnings.join(' '), /EP-2026-001/);
});

test('electronic prescription fetch reports malformed connector JSON without a false network error', async () => {
  const result = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv()
    },
    fetchImpl: (async () => new Response('<html>bad gateway</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    })) as typeof fetch
  });

  assert.strictEqual(result.status, 'error');
  assert.match(result.message, /JSONオブジェクト/);
  assert.doesNotMatch(result.message, /接続できません/);
});

test('electronic prescription client refuses patient mismatches and keeps unchecked results for review', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    prescription: {
      prescriptionId: 'EP-2026-001',
      prescriptionDate: '2026-06-29',
      validUntil: '2026-07-03',
      documentKind: 'electronic_prescription',
      signatureVerification: { status: 'valid' },
      patient: { name: '山田 太郎', birthDate: '1980-01-01' },
      provider: { institutionName: '青空クリニック', doctorName: '佐藤 医師' },
      items: [{ drugCode: '123456789', drugName: '薬A', amount: '1錠', usage: '1日1回', days: '7' }]
    }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv()
    },
    fetchImpl: fetchImpl as typeof fetch
  };

  const mismatch = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001',
    patientBirthDate: '1981-01-01'
  }, options);
  const unchecked = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001',
    patientBirthDate: '1980-01-01'
  }, options);

  assert.strictEqual(mismatch.status, 'patient_mismatch');
  assert.strictEqual(mismatch.prescription, undefined);
  assert.strictEqual(unchecked.status, 'success');
  assert.ok(unchecked.prescription);
  assert.strictEqual(buildElectronicPrescriptionApplyDecision(
    unchecked,
    { now: new Date('2026-06-30T09:00:00.000Z') }
  ).canApply, false);
});

test('electronic prescription apply decision blocks invalid signatures, expired prescriptions, and paper copies without originals', () => {
  const baseResult = {
    status: 'success' as const,
    mode: 'connector' as const,
    message: '取得',
    prescription: validPrescription,
    duplicateCheck: { status: 'passed' as const, messages: [] },
    warnings: [],
    integrityHash: 'a'.repeat(64)
  };
  const invalidSignature = buildElectronicPrescriptionApplyDecision({
    ...baseResult,
    prescription: {
      ...validPrescription,
      signatureVerification: { status: 'invalid' as const }
    }
  }, { now: new Date('2026-06-30T09:00:00.000Z') });
  const expired = buildElectronicPrescriptionApplyDecision({
    ...baseResult,
    prescription: {
      ...validPrescription,
      validUntil: '2026-06-29'
    }
  }, { now: new Date('2026-06-30T09:00:00.000Z') });
  const paper = {
    ...baseResult,
    prescription: {
      ...validPrescription,
      documentKind: 'prescription_information' as const,
      signatureVerification: { status: 'not_applicable' as const }
    }
  };

  assert.strictEqual(invalidSignature.canApply, false);
  assert.strictEqual(expired.canApply, false);
  assert.strictEqual(buildElectronicPrescriptionApplyDecision(
    paper,
    { now: new Date('2026-06-30T09:00:00.000Z') }
  ).canApply, false);
  assert.strictEqual(buildElectronicPrescriptionApplyDecision(
    paper,
    { paperOriginalConfirmed: true, now: new Date('2026-06-30T09:00:00.000Z') }
  ).canApply, true);
});

test('electronic prescription operation input validates official operation requirements', () => {
  assert.deepStrictEqual(validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_cancel',
    prescriptionId: 'EP-2026-001'
  }), {
    ok: false,
    message: '調剤結果IDがありません。'
  });
  assert.deepStrictEqual(validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_register',
    prescriptionId: 'EP-2026-001',
    signatureRequirement: {
      hpkiSignatureRequired: false,
      expectedSignerRole: 'pharmacist'
    },
    payload: {
      dispensingDate: '2026-06-30',
      signatureRequirement: {
        hpkiSignatureRequired: true,
        expectedSignerRole: 'pharmacist'
      },
      items: [{
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  }), {
    ok: false,
    message: '調剤情報提供ファイルの署名要否が操作情報と送信内容で一致していません。'
  });
  assert.deepStrictEqual(validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_register',
    prescriptionId: 'EP-2026-001',
    payload: {
      dispensingDate: '2026-06-30',
      signatureRequirement: {
        hpkiSignatureRequired: false,
        expectedSignerRole: 'pharmacist'
      },
      items: [{
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  }), {
    ok: false,
    message: '調剤情報提供ファイルの署名要否が操作情報と送信内容で一致していません。'
  });
  assert.deepStrictEqual(validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_register',
    prescriptionId: 'EP-2026-001',
    payload: {
      visitId: 'visit_001',
      prescriptionDate: '2026-06-29',
      dispensingDate: '2026-06-30',
      totalPoints: 123,
      signatureRequirement: {
        hpkiSignatureRequired: true,
        expectedSignerRole: 'pharmacist'
      },
      items: [{
        itemId: 'item-1',
        rpNumber: 1,
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    },
    integrityHash: 'a'.repeat(64)
  }), {
    ok: true,
    input: {
      operation: 'dispensing_result_register',
      prescriptionId: 'EP-2026-001',
      integrityHash: 'a'.repeat(64),
      signatureRequirement: {
        hpkiSignatureRequired: true,
        expectedSignerRole: 'pharmacist'
      },
      payload: {
        type: 'yakureki-electronic-prescription-dispensing-result',
        schemaVersion: 1,
        prescriptionDate: '2026-06-29',
        dispensingDate: '2026-06-30',
        totalPoints: 123,
        signatureRequirement: {
          hpkiSignatureRequired: true,
          expectedSignerRole: 'pharmacist'
        },
        items: [{
          itemId: 'item-1',
          rpNumber: 1,
          prescribedDrugCode: '123456789',
          ...verifiedDispensingDrugName,
          amount: '1錠',
          usage: '1日1回 朝食後',
          days: '7'
        }]
      }
    }
  });
});

test('electronic prescription operation input supports dispensing result ID recovery', () => {
  const result = validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_search',
    prescriptionId: 'EP-2026-001',
    integrityHash: 'a'.repeat(64)
  });

  assert.deepStrictEqual(result, {
    ok: true,
    input: {
      operation: 'dispensing_result_search',
      prescriptionId: 'EP-2026-001',
      integrityHash: 'a'.repeat(64)
    }
  });
  assert.deepStrictEqual(
    getRequiredElectronicPrescriptionCapabilitiesForOperation('dispensing_result_search'),
    ['dispensing_result_search']
  );
});

test('electronic prescription lifecycle never allows reception cancellation after dispensing registration', () => {
  const beforeDispensing = {
    receptionStatus: 'accepted' as const,
    dispensingResultStatus: 'pending' as const,
    dispensingResultEverRegistered: false
  };
  const registered = {
    receptionStatus: 'accepted' as const,
    dispensingResultStatus: 'registered' as const,
    dispensingResultEverRegistered: true,
    dispensingResultId: 'DR-001'
  };
  const resultCancelled = {
    ...registered,
    dispensingResultStatus: 'cancelled' as const
  };

  assert.strictEqual(validateElectronicPrescriptionLifecycleOperation('reception_cancel', beforeDispensing).allowed, true);
  assert.strictEqual(validateElectronicPrescriptionLifecycleOperation('reception_cancel', registered).allowed, false);
  const afterCancellation = validateElectronicPrescriptionLifecycleOperation('reception_cancel', resultCancelled);
  assert.strictEqual(afterCancellation.allowed, false);
  assert.match(afterCancellation.message || '', /調剤結果取消後も受付取消できません/);
  assert.strictEqual(validateElectronicPrescriptionLifecycleOperation('dispensing_result_register', resultCancelled).allowed, true);
});

test('electronic prescription dispensing requires HPKI only when an electronic original is included', () => {
  assert.strictEqual(requiresElectronicPrescriptionDispensingHpkiSignature(['electronic_prescription']), true);
  assert.strictEqual(requiresElectronicPrescriptionDispensingHpkiSignature(['prescription_information']), false);
  assert.strictEqual(requiresElectronicPrescriptionDispensingHpkiSignature([
    'prescription_information',
    'electronic_prescription'
  ]), true);

  const paperSearch = validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_search',
    prescriptionId: 'EP-2026-001',
    signatureRequirement: {
      hpkiSignatureRequired: false,
      expectedSignerRole: 'pharmacist'
    }
  });
  assert.strictEqual(paperSearch.ok, true);
  assert.deepStrictEqual(paperSearch.ok ? paperSearch.input.signatureRequirement : undefined, {
    hpkiSignatureRequired: false,
    expectedSignerRole: 'pharmacist'
  });
});

test('electronic prescription operation input preserves unique linked prescription IDs', () => {
  const result = validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_search',
    prescriptionId: 'EP-2026-001',
    prescriptionIds: ['ep-2026-002', 'EP-2026-001', ' EP-2026-003 ']
  });

  assert.deepStrictEqual(result, {
    ok: true,
    input: {
      operation: 'dispensing_result_search',
      prescriptionId: 'EP-2026-001',
      prescriptionIds: ['EP-2026-001', 'EP-2026-002', 'EP-2026-003']
    }
  });
});

test('electronic prescription operation input counts unique linked prescriptions for the 20 item limit', () => {
  const twentyIds = Array.from({ length: 20 }, (_, index) => `EP-2026-${String(index + 1).padStart(3, '0')}`);
  const accepted = validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_search',
    prescriptionId: twentyIds[0],
    prescriptionIds: twentyIds
  });
  assert.strictEqual(accepted.ok, true);
  assert.strictEqual(accepted.ok ? accepted.input.prescriptionIds?.length : 0, 20);

  const rejected = validateElectronicPrescriptionOperationInput({
    operation: 'dispensing_result_search',
    prescriptionId: twentyIds[0],
    prescriptionIds: [...twentyIds, 'EP-2026-021']
  });
  assert.deepStrictEqual(rejected, {
    ok: false,
    message: '一度に連携できる電子処方箋IDは20件までです。'
  });
});

test('electronic prescription dispensing result payload is minimal and rejects patient data', () => {
  const normalized = normalizeElectronicPrescriptionDispensingResultPayload({
    type: 'ignored',
    schemaVersion: 99,
    visitId: 'visit_001',
    prescriptionDate: '2026/06/29',
    dispensingDate: '2026/06/30',
    totalPoints: 321,
    items: [{
      itemId: 'item-1',
      rpNumber: 1,
      prescribedDrugCode: '123456789',
      dispensedDrugCode: '987654321',
      prescribedDrugCodeStatus: 'active',
      ...verifiedDispensingDrugName,
      amount: '1錠',
      unitCode: 'TAB',
      unitText: '錠',
      usageCode: 'U001',
      usage: '1日1回 朝食後',
      days: '7',
      unused: 'drop-me'
    }]
  });
  const rejected = normalizeElectronicPrescriptionDispensingResultPayload({
    dispensingDate: '2026-06-30',
    patient: { name: '山田 太郎' },
    items: [{ prescribedDrugCode: '123456789', amount: '1錠', usage: '1日1回', days: '7' }]
  });
  const mismatchedDrugName = normalizeElectronicPrescriptionDispensingResultPayload({
    dispensingDate: '2026-06-30',
    items: [{
      prescribedDrugCode: '123456789',
      sourceDrugName: '薬A',
      masterDrugName: '別薬B',
      drugNameVerificationStatus: 'matched',
      amount: '1錠',
      usage: '1日1回',
      days: '7'
    }]
  });

  assert.strictEqual(normalized.ok, true);
  assert.deepStrictEqual(normalized.ok ? normalized.payload : null, {
    type: 'yakureki-electronic-prescription-dispensing-result',
    schemaVersion: 1,
    prescriptionDate: '2026-06-29',
    dispensingDate: '2026-06-30',
    totalPoints: 321,
    items: [{
      itemId: 'item-1',
      rpNumber: 1,
      prescribedDrugCode: '123456789',
      dispensedDrugCode: '987654321',
      prescribedDrugCodeStatus: 'active',
      ...verifiedDispensingDrugName,
      amount: '1錠',
      unitCode: 'TAB',
      unitText: '錠',
      usageCode: 'U001',
      usage: '1日1回 朝食後',
      days: '7'
    }]
  });
  assert.strictEqual(rejected.ok, false);
  assert.match(rejected.ok ? '' : rejected.message, /患者情報/);
  assert.strictEqual(mismatchedDrugName.ok, false);
  assert.match(mismatchedDrugName.ok ? '' : mismatchedDrugName.message, /薬局マスタ薬品名/);
});

test('electronic prescription client blocks connector calls without official kind and full capabilities', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };

  const missingKind = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });
  const missingCapabilities = await submitElectronicPrescriptionOperation({
    operation: 'dispensing_result_register',
    prescriptionId: 'EP-2026-001',
    payload: {
      dispensingDate: '2026-06-30',
      items: [{
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: 'prescription_fetch,signature_verification'
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(missingKind.status, 'unconfigured');
  assert.match(missingKind.message, /接続方式/);
  assert.strictEqual(missingCapabilities.status, 'unconfigured');
  assert.match(missingCapabilities.warnings.join(' '), /dispensing_result/);
  assert.strictEqual(called, false);
});

test('electronic prescription client blocks connector calls without bearer token', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };

  const result = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(result.status, 'unconfigured');
  assert.match(result.message, /認証トークン/);
  assert.strictEqual(called, false);
});

test('electronic prescription client blocks connector calls without connector artifact hash', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };

  const result = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(result.status, 'unconfigured');
  assert.match(result.message, /成果物SHA-256/);
  assert.strictEqual(called, false);
});

test('electronic prescription client blocks plaintext non-loopback connector endpoints', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };

  const result = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'http://192.168.1.10/electronic-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv()
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(result.status, 'unconfigured');
  assert.match(result.message, /HTTPS/);
  assert.strictEqual(called, false);
});

test('electronic prescription client blocks patient-data calls before successful preflight is recorded', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };

  const fetchResult = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });
  const operationResult = await submitElectronicPrescriptionOperation({
    operation: 'duplicate_check',
    prescriptionId: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME: 'timeout',
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE: 'unknown'
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(fetchResult.status, 'unconfigured');
  assert.match(fetchResult.message, /preflight成功記録/);
  assert.strictEqual(operationResult.status, 'unconfigured');
  assert.match(operationResult.warnings.join(' '), /connector-preflight/);
  assert.strictEqual(called, false);
});

test('electronic prescription client requires a 2xx preflight status before patient-data calls', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };

  const result = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME: 'success',
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE: 'json_object',
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE: '500'
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(result.status, 'unconfigured');
  assert.match(result.message, /HTTPステータス/);
  assert.strictEqual(called, false);
});

test('electronic prescription client requires a timestamped successful preflight before patient-data calls', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };
  const envWithoutAttemptedAt = {
    ELECTRONIC_PRESCRIPTION_MODE: 'connector',
    ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
    ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
    ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
    ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
    ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME: 'success',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE: 'json_object',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE: '200'
  };

  const fetchResult = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: envWithoutAttemptedAt,
    fetchImpl: fetchImpl as typeof fetch
  });
  const operationResult = await submitElectronicPrescriptionOperation({
    operation: 'duplicate_check',
    prescriptionId: 'EP-2026-001'
  }, {
    env: envWithoutAttemptedAt,
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(fetchResult.status, 'unconfigured');
  assert.match(fetchResult.message, /preflight実行日時/);
  assert.strictEqual(operationResult.status, 'unconfigured');
  assert.match(operationResult.warnings.join(' '), /LAST_ATTEMPT_AT/);
  assert.strictEqual(called, false);
});

test('electronic prescription client rejects stale or future preflight records before patient-data calls', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };
  const baseEnv = {
    ELECTRONIC_PRESCRIPTION_MODE: 'connector',
    ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
    ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
    ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
    ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
    ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME: 'success',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE: 'json_object',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE: '200'
  };

  const staleResult = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ...baseEnv,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT: preflightAttemptAtMinutesAgo(25 * 60)
    },
    fetchImpl: fetchImpl as typeof fetch
  });
  const futureResult = await submitElectronicPrescriptionOperation({
    operation: 'duplicate_check',
    prescriptionId: 'EP-2026-001'
  }, {
    env: {
      ...baseEnv,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(staleResult.status, 'unconfigured');
  assert.match(staleResult.message, /古く/);
  assert.strictEqual(futureResult.status, 'unconfigured');
  assert.match(futureResult.message, /未来/);
  assert.strictEqual(called, false);
});

test('electronic prescription client requires preflight metadata to match the current connector configuration', async () => {
  let called = false;
  const fetchImpl = async () => {
    called = true;
    return new Response('{}', { status: 200 });
  };
  const baseEnv = {
    ELECTRONIC_PRESCRIPTION_MODE: 'connector',
    ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
    ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
    ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
    ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
    ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME: 'success',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AT: preflightAttemptAtMinutesAgo(5),
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_RESPONSE_SHAPE: 'json_object',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_STATUS_CODE: '200',
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256: endpointSha256(),
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256: buildElectronicPrescriptionConnectorAuthSha256('secret-token'),
    ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256
  };

  const endpointMismatch = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ...baseEnv,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256: endpointSha256('https://other-connector.example.test/e-prescription'),
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });
  const authMismatch = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ...baseEnv,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256: buildElectronicPrescriptionConnectorAuthSha256('old-secret-token'),
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });
  const kindMismatch = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ...baseEnv,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });
  const artifactMismatch = await fetchElectronicPrescription({
    fetchKey: 'EP-2026-001'
  }, {
    env: {
      ...baseEnv,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256: 'b'.repeat(64),
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });
  const missingCapability = await submitElectronicPrescriptionOperation({
    operation: 'duplicate_check',
    prescriptionId: 'EP-2026-001'
  }, {
    env: {
      ...baseEnv,
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES: 'prescription_fetch,signature_verification'
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(endpointMismatch.status, 'unconfigured');
  assert.match(endpointMismatch.message, /接続先が現在設定と一致しません/);
  assert.strictEqual(authMismatch.status, 'unconfigured');
  assert.match(authMismatch.message, /認証情報が現在設定と一致しません/);
  assert.strictEqual(kindMismatch.status, 'unconfigured');
  assert.match(kindMismatch.message, /接続方式が現在設定と一致しません/);
  assert.strictEqual(artifactMismatch.status, 'unconfigured');
  assert.match(artifactMismatch.message, /成果物が現在設定と一致しません/);
  assert.strictEqual(missingCapability.status, 'unconfigured');
  assert.match(missingCapability.message, /preflight必須機能/);
  assert.strictEqual(called, false);
});

test('electronic prescription connector preflight verifies official metadata without exposing secrets', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      status: 'ready',
      connectorKind: 'qualification_terminal',
      capabilities: connectorCapabilities.split(',')
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await runElectronicPrescriptionConnectorPreflight({
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });
  const requestBody = JSON.parse(String(calls[0].init?.body || '{}'));
  const json = JSON.stringify(result);

  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.lastAttempt.outcome, 'success');
  assert.strictEqual(result.responseShape, 'json_object');
  assert.strictEqual(result.connectorEndpointSha256, endpointSha256());
  assert.strictEqual(result.connectorArtifactSha256, connectorArtifactSha256);
  assert.deepStrictEqual(result.missingCapabilities, []);
  assert.strictEqual(requestBody.type, 'yakureki-electronic-prescription-preflight');
  assert.deepStrictEqual(requestBody.requiredCapabilities, connectorCapabilities.split(','));
  assert.doesNotMatch(JSON.stringify(requestBody), /山田|INSURED|EP-2026|123456/);
  assert.doesNotMatch(json, /connector\.example|secret-token/);
});

test('electronic prescription connector preflight rejects incomplete connector metadata', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    status: 'ready',
    connectorKind: 'web_api',
    capabilities: ['prescription_fetch']
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const result = await runElectronicPrescriptionConnectorPreflight({
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_ARTIFACT_SHA256: connectorArtifactSha256,
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(result.status, 'invalid_response');
  assert.strictEqual(result.lastAttempt.outcome, 'invalid_response');
  assert.match(result.message, /接続方式/);
  assert.ok(result.missingCapabilities.includes('signature_verification'));
});

test('electronic prescription operations use connector without leaking secrets', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify({
      status: 'success',
      message: '調剤結果を登録しました。',
      operationId: 'OP-001',
      dispensingResultId: 'DR-001',
      registeredAt: '2026-06-30T10:00:00.000Z',
      prescriptionIds: ['EP-2026-001'],
      dispensingInformationFile: {
        signatureStatus: 'signed',
        signedAt: '2026-06-30T10:01:00.000Z',
        fileHash: 'c'.repeat(64),
        hpkiVerification: {
          status: 'valid',
          signerRole: 'pharmacist',
          certificateSerialHash: '1'.repeat(64),
          certificateIssuerHash: '2'.repeat(64),
          certificateNotAfter: '2027-06-30',
          revocationCheckedAt: '2026-06-30T10:01:30.000Z',
          policyOid: '1.2.392.100495'
        }
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await submitElectronicPrescriptionOperation({
    operation: 'dispensing_result_register',
    prescriptionId: 'EP-2026-001',
    integrityHash: 'b'.repeat(64),
    payload: {
      visitId: 'visit_001',
      prescriptionDate: '2026-06-29',
      dispensingDate: '2026-06-30',
      totalPoints: 123,
      signatureRequirement: {
        hpkiSignatureRequired: true,
        expectedSignerRole: 'pharmacist'
      },
      items: [{
        itemId: 'item-1',
        rpNumber: 1,
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.mode, 'connector');
  assert.strictEqual(result.operation, 'dispensing_result_register');
  assert.strictEqual(result.dispensingResultId, 'DR-001');
  assert.strictEqual(result.registeredAt, '2026-06-30T10:00:00.000Z');
  assert.deepStrictEqual(result.dispensingInformationFile, {
    signatureStatus: 'present',
    signedAt: '2026-06-30T10:01:00.000Z',
    fileHash: 'c'.repeat(64),
    hpkiVerification: {
      status: 'valid',
      signerRole: 'pharmacist',
      certificateSerialHash: '1'.repeat(64),
      certificateIssuerHash: '2'.repeat(64),
      certificateNotAfter: '2027-06-30',
      revocationCheckedAt: '2026-06-30T10:01:30.000Z',
      policyOid: '1.2.392.100495'
    }
  });
  const body = JSON.parse(String(calls[0].init?.body || '{}'));
  const headers = new Headers(calls[0].init?.headers);
  const idempotencyKey = headers.get('X-Yakureki-Idempotency-Key') || '';
  assert.match(idempotencyKey, /^[a-f0-9]{64}$/);
  assert.strictEqual(body.idempotencyKey, idempotencyKey);
  assert.strictEqual(body.operation, 'dispensing_result_register');
  assert.strictEqual(body.prescriptionId, 'EP-2026-001');
  assert.deepStrictEqual(body.signatureRequirement, {
    hpkiSignatureRequired: true,
    expectedSignerRole: 'pharmacist'
  });
  assert.strictEqual(body.payload.type, 'yakureki-electronic-prescription-dispensing-result');
  assert.deepStrictEqual(body.payload.signatureRequirement, {
    hpkiSignatureRequired: true,
    expectedSignerRole: 'pharmacist'
  });
  assert.deepStrictEqual(body.payload.items[0].sourceDrugName, '薬A');
  assert.deepStrictEqual(body.payload.items[0].masterDrugName, '薬A');
  assert.deepStrictEqual(body.payload.items[0].drugNameVerificationStatus, 'matched');
  assert.doesNotMatch(JSON.stringify(body), /visit_001/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(idempotencyKey));
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
  assert.doesNotMatch(JSON.stringify(result), /connector\.example/);
});

test('electronic prescription reception cancel verifies timestamp and prescription IDs', async () => {
  const responses = [
    new Response(JSON.stringify({
      status: 'success',
      prescriptionIds: ['EP-2026-001']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      cancelledAt: '2026-06-30T10:20:00.000Z'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      cancelledAt: '2026-06-30T10:20:00.000Z',
      prescriptionIds: ['EP-OTHER']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      cancelledAt: '2026-06-30T10:20:00.000Z',
      prescriptionIds: ['EP-2026-001']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  ];
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: (async () => responses.shift()!) as typeof fetch
  };
  const input = {
    operation: 'reception_cancel' as const,
    prescriptionId: 'EP-2026-001',
    reason: '受付取消確認'
  };

  const missingTimestamp = await submitElectronicPrescriptionOperation(input, options);
  const missingPrescriptionIds = await submitElectronicPrescriptionOperation(input, options);
  const mismatchedPrescriptionIds = await submitElectronicPrescriptionOperation(input, options);
  const cancelled = await submitElectronicPrescriptionOperation(input, options);

  assert.strictEqual(missingTimestamp.status, 'error');
  assert.match(missingTimestamp.message, /取消日時/);
  assert.strictEqual(missingPrescriptionIds.status, 'error');
  assert.match(missingPrescriptionIds.message, /対象処方箋ID/);
  assert.strictEqual(mismatchedPrescriptionIds.status, 'error');
  assert.match(mismatchedPrescriptionIds.message, /一致しません/);
  assert.strictEqual(cancelled.status, 'success');
  assert.strictEqual(cancelled.registeredAt, '2026-06-30T10:20:00.000Z');
});

test('electronic prescription operations require registeredAt for successful dispensing result updates', async () => {
  const validFile = {
    signatureStatus: 'valid',
    signedAt: '2026-06-30T10:01:00.000Z',
    hpkiVerification: {
      status: 'valid',
      signerRole: 'pharmacist',
      certificateSerialHash: '1'.repeat(64),
      certificateIssuerHash: '2'.repeat(64),
      certificateNotAfter: '2027-06-30',
      revocationCheckedAt: '2026-06-30T10:01:30.000Z'
    }
  };
  const responses = [
    new Response(JSON.stringify({
      status: 'success',
      dispensingResultId: 'DR-MISSING-REGISTERED-AT',
      prescriptionIds: ['EP-2026-001'],
      dispensingInformationFile: validFile
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      dispensingResultId: 'DR-001',
      registeredAt: '2026-06-30',
      prescriptionIds: ['EP-2026-001'],
      dispensingInformationFile: validFile
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  ];
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: (async () => responses.shift()!) as typeof fetch
  };
  const input = {
    prescriptionId: 'EP-2026-001',
    integrityHash: 'b'.repeat(64),
    payload: {
      dispensingDate: '2026-06-30',
      items: [{
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  };

  const missingRegisteredAt = await submitElectronicPrescriptionOperation({
    ...input,
    operation: 'dispensing_result_register'
  }, options);
  const invalidRegisteredAt = await submitElectronicPrescriptionOperation({
    ...input,
    operation: 'dispensing_result_change',
    dispensingResultId: 'DR-001'
  }, options);

  assert.strictEqual(missingRegisteredAt.status, 'error');
  assert.match(missingRegisteredAt.message, /有効な登録日時/);
  assert.strictEqual(missingRegisteredAt.dispensingResultId, undefined);
  assert.strictEqual(invalidRegisteredAt.status, 'error');
  assert.match(invalidRegisteredAt.warnings.join(' '), /ISO日時/);
  assert.strictEqual(invalidRegisteredAt.registeredAt, undefined);
});

test('electronic prescription cancel verifies dispensing result ID and cancellation timestamp', async () => {
  const responses = [
    new Response(JSON.stringify({
      status: 'success',
      registeredAt: '2026-06-30T10:10:00.000Z',
      prescriptionIds: ['EP-2026-001']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      dispensingResultId: 'DR-OTHER',
      registeredAt: '2026-06-30T10:10:00.000Z',
      prescriptionIds: ['EP-2026-001']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      dispensingResultId: 'DR-001',
      prescriptionIds: ['EP-2026-001']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      dispensingId: 'DR-001',
      updatedAt: '2026-06-30T10:10:00.000Z',
      prescriptionIds: ['EP-2026-001']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  ];
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: (async () => responses.shift()!) as typeof fetch
  };
  const input = {
    operation: 'dispensing_result_cancel' as const,
    prescriptionId: 'EP-2026-001',
    dispensingResultId: 'DR-001',
    reason: '取消確認'
  };

  const missingId = await submitElectronicPrescriptionOperation(input, options);
  const mismatchedId = await submitElectronicPrescriptionOperation(input, options);
  const missingRegisteredAt = await submitElectronicPrescriptionOperation(input, options);
  const cancelled = await submitElectronicPrescriptionOperation(input, options);

  assert.strictEqual(missingId.status, 'error');
  assert.match(missingId.message, /有効な調剤結果ID/);
  assert.strictEqual(mismatchedId.status, 'error');
  assert.match(mismatchedId.message, /一致しません/);
  assert.strictEqual(missingRegisteredAt.status, 'error');
  assert.match(missingRegisteredAt.message, /有効な登録日時/);
  assert.strictEqual(cancelled.status, 'success');
  assert.strictEqual(cancelled.dispensingResultId, 'DR-001');
  assert.strictEqual(cancelled.registeredAt, '2026-06-30T10:10:00.000Z');
});

test('electronic prescription operations verify returned prescription IDs for bundled dispensing results', async () => {
  const validFile = {
    signatureStatus: 'valid',
    signedAt: '2026-06-30T10:01:00.000Z',
    hpkiVerification: {
      status: 'valid',
      signerRole: 'pharmacist',
      certificateSerialHash: '1'.repeat(64),
      certificateIssuerHash: '2'.repeat(64),
      certificateNotAfter: '2027-06-30',
      revocationCheckedAt: '2026-06-30T10:01:30.000Z'
    }
  };
  const successBase = {
    status: 'success',
    dispensingResultId: 'DR-BUNDLED-001',
    registeredAt: '2026-06-30T10:00:00.000Z',
    dispensingInformationFile: validFile
  };
  const responses = [
    new Response(JSON.stringify(successBase), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      ...successBase,
      prescriptionIds: ['EP-2026-001']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      ...successBase,
      prescriptions: [{ prescriptionId: 'EP-2026-001' }, { prescriptionId: 'EP-2026-002' }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify(successBase), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      ...successBase,
      prescriptionIds: ['EP-2026-999']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  ];
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: (async () => responses.shift()!) as typeof fetch
  };
  const bundledInput = {
    operation: 'dispensing_result_register' as const,
    prescriptionId: 'EP-2026-001',
    prescriptionIds: ['EP-2026-001', 'EP-2026-002'],
    integrityHash: 'b'.repeat(64),
    payload: {
      dispensingDate: '2026-06-30',
      items: [{
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  };

  const missingEcho = await submitElectronicPrescriptionOperation(bundledInput, options);
  const incompleteEcho = await submitElectronicPrescriptionOperation(bundledInput, options);
  const matchedEcho = await submitElectronicPrescriptionOperation(bundledInput, options);
  const singleMissingEcho = await submitElectronicPrescriptionOperation({
    ...bundledInput,
    prescriptionIds: undefined
  }, options);
  const singleMismatchedEcho = await submitElectronicPrescriptionOperation({
    ...bundledInput,
    prescriptionIds: undefined
  }, options);

  assert.strictEqual(missingEcho.status, 'error');
  assert.match(missingEcho.message, /対象処方箋ID/);
  assert.strictEqual(incompleteEcho.status, 'error');
  assert.match(incompleteEcho.message, /一致しません/);
  assert.strictEqual(matchedEcho.status, 'success');
  assert.strictEqual(matchedEcho.dispensingResultId, 'DR-BUNDLED-001');
  assert.strictEqual(singleMissingEcho.status, 'error');
  assert.match(singleMissingEcho.message, /対象処方箋ID/);
  assert.strictEqual(singleMismatchedEcho.status, 'error');
  assert.match(singleMismatchedEcho.warnings.join(' '), /prescriptionIds/);
});

test('electronic prescription operations reject unsafe dispensing information signatures', async () => {
  const responses = [
    undefined,
    { signatureStatus: 'unsigned' },
    {
      signatureStatus: 'invalid',
      hpkiVerification: {
        status: 'invalid',
        signerRole: 'pharmacist'
      }
    },
    {
      signatureStatus: 'valid',
      hpkiVerification: {
        status: 'valid',
        signerRole: 'doctor',
        certificateSerialHash: '1'.repeat(64),
        certificateIssuerHash: '2'.repeat(64),
        certificateNotAfter: '2027-06-30',
        revocationCheckedAt: '2026-06-30T10:01:30.000Z'
      }
    },
    {
      signatureStatus: 'valid',
      hpkiVerification: {
        status: 'valid',
        signerRole: 'pharmacist'
      }
    },
    {
      signatureStatus: 'valid',
      signedAt: '2026-06-30T10:01:00.000Z',
      hpkiVerification: {
        status: 'valid',
        signerRole: 'pharmacist',
        certificateSerialHash: '1'.repeat(64),
        certificateIssuerHash: '2'.repeat(64),
        certificateNotAfter: '2027-06-30',
        revocationCheckedAt: '2026-06-30T10:01:30.000Z',
        policyOid: '1..2'
      }
    },
    {
      signatureStatus: 'valid',
      signedAt: '2026-06-30T10:01:00.000Z',
      hpkiVerification: {
        status: 'valid',
        signerRole: 'pharmacist',
        certificateSerialHash: '1'.repeat(64),
        certificateIssuerHash: '2'.repeat(64),
        certificateNotAfter: '2027-06-30',
        revocationCheckedAt: '2026-06-30T10:00:59.000Z'
      }
    },
    {
      signatureStatus: 'valid',
      signedAt: '2026-06-30T10:01:00.000Z',
      hpkiVerification: {
        status: 'valid',
        signerRole: 'pharmacist',
        certificateSerialHash: '1'.repeat(64),
        certificateIssuerHash: '2'.repeat(64),
        certificateNotAfter: '2026-06-29',
        revocationCheckedAt: '2026-06-30T10:01:30.000Z'
      }
    }
  ];
  const fetchImpl = async () => new Response(JSON.stringify({
    status: 'success',
    dispensingResultId: 'DR-UNSAFE',
    dispensingInformationFile: responses.shift()
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const input = {
    operation: 'dispensing_result_register' as const,
    prescriptionId: 'EP-2026-001',
    payload: {
      dispensingDate: '2026-06-30',
      items: [{
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  };
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: fetchImpl as typeof fetch
  };

  const missingFile = await submitElectronicPrescriptionOperation(input, options);
  const missingPharmacistSignature = await submitElectronicPrescriptionOperation(input, options);
  const invalid = await submitElectronicPrescriptionOperation(input, options);
  const wrongRole = await submitElectronicPrescriptionOperation(input, options);
  const missingDetails = await submitElectronicPrescriptionOperation(input, options);
  const invalidPolicyOid = await submitElectronicPrescriptionOperation(input, options);
  const staleRevocationCheck = await submitElectronicPrescriptionOperation(input, options);
  const expiredAtSigning = await submitElectronicPrescriptionOperation(input, options);

  assert.strictEqual(missingFile.status, 'error');
  assert.match(missingFile.message, /署名検証結果がありません/);
  assert.strictEqual(missingPharmacistSignature.status, 'error');
  assert.match(missingPharmacistSignature.message, /薬剤師の電子署名がありません/);
  assert.strictEqual(invalid.status, 'error');
  assert.match(invalid.message, /署名検証に失敗/);
  assert.strictEqual(wrongRole.status, 'error');
  assert.match(wrongRole.message, /薬剤師ではありません/);
  assert.strictEqual(missingDetails.status, 'error');
  assert.match(missingDetails.message, /詳細検証結果が不足/);
  assert.strictEqual(invalidPolicyOid.status, 'error');
  assert.match(invalidPolicyOid.message, /ポリシーOID形式が不正/);
  assert.strictEqual(staleRevocationCheck.status, 'error');
  assert.match(staleRevocationCheck.message, /失効確認日時が署名日時より前/);
  assert.strictEqual(expiredAtSigning.status, 'error');
  assert.match(expiredAtSigning.message, /有効期限切れ/);
  assert.strictEqual(invalid.dispensingResultId, undefined);
});

test('paper-original dispensing accepts an explicitly unsigned information file', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    status: 'success',
    dispensingResultId: 'DR-PAPER-001',
    registeredAt: '2026-06-30T10:00:00.000Z',
    prescriptionIds: ['EP-PAPER-001'],
    dispensingInformationFile: {
      signatureStatus: 'unsigned',
      fileHash: '3'.repeat(64)
    }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const result = await submitElectronicPrescriptionOperation({
    operation: 'dispensing_result_register',
    prescriptionId: 'EP-PAPER-001',
    signatureRequirement: {
      hpkiSignatureRequired: false,
      expectedSignerRole: 'pharmacist'
    },
    payload: {
      dispensingDate: '2026-06-30',
      signatureRequirement: {
        hpkiSignatureRequired: false,
        expectedSignerRole: 'pharmacist'
      },
      items: [{
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.dispensingInformationFile?.signatureStatus, 'unsigned');
  assert.strictEqual(result.dispensingInformationFile?.hpkiVerification, undefined);
});

test('electronic prescription operations treat idempotent duplicate replies as completed', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    const headers = new Headers(init?.headers);
    const idempotencyKey = headers.get('X-Yakureki-Idempotency-Key') || '';
    return new Response(JSON.stringify({
      status: 'duplicate',
      message: `同じ操作は処理済みです ${idempotencyKey} https://connector.example.test/internal Bearer secret-token Basic basic-secret 電子処方箋ID EP-2026-001 患者ID pat-secret-001`,
      warnings: [
        `再送を処理済みとして扱いました ${idempotencyKey} 引換番号 123456 調剤結果ID DR-001 apiKey=api-secret`,
        'https://connector.example.test/debug',
        'Bearer secret-token'
      ],
      operationId: 'OP-001',
      dispensingResultId: 'DR-001',
      registeredAt: '2026-06-30T10:00:00.000Z',
      prescriptionIds: ['EP-2026-001']
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const result = await submitElectronicPrescriptionOperation({
    operation: 'dispensing_result_register',
    prescriptionId: 'EP-2026-001',
    integrityHash: 'b'.repeat(64),
    payload: {
      dispensingDate: '2026-06-30',
      items: [{
        itemId: 'item-1',
        rpNumber: 1,
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  const headers = new Headers(calls[0].init?.headers);
  const idempotencyKey = headers.get('X-Yakureki-Idempotency-Key') || '';
  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.operationId, 'OP-001');
  assert.strictEqual(result.dispensingResultId, 'DR-001');
  assert.match(result.message, /redacted-prescription-id/);
  assert.match(result.message, /redacted-patient-id/);
  assert.match(result.warnings.join(' '), /redacted-api-key/);
  assert.match(result.warnings.join(' '), /redacted-fetch-key/);
  assert.match(result.warnings.join(' '), /redacted-dispensing-result-id/);
  assert.match(result.warnings.join(' '), /処理済み/);
  assert.doesNotMatch(result.message, /EP-2026-001|pat-secret-001|basic-secret/);
  assert.doesNotMatch(result.warnings.join(' '), /123456|api-secret/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(idempotencyKey));
  assert.doesNotMatch(JSON.stringify(result), /connector\.example/);
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test('electronic prescription operations accept only explicit idempotent HTTP 409 replies', async () => {
  const responses = [
    new Response(JSON.stringify({
      status: 'already_processed',
      message: '同じ操作は処理済みです。',
      operationId: 'OP-409',
      dispensingResultId: 'DR-409',
      registeredAt: '2026-06-30T10:00:00.000Z',
      prescriptionIds: ['EP-2026-001']
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'conflict',
      message: '別の競合です。'
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })
  ];
  const fetchImpl = async () => responses.shift()!;
  const input = {
    operation: 'dispensing_result_register' as const,
    prescriptionId: 'EP-2026-001',
    integrityHash: 'b'.repeat(64),
    payload: {
      dispensingDate: '2026-06-30',
      items: [{
        prescribedDrugCode: '123456789',
        ...verifiedDispensingDrugName,
        amount: '1錠',
        usage: '1日1回 朝食後',
        days: '7'
      }]
    }
  };
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'web_api',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv('web_api')
    },
    fetchImpl: fetchImpl as typeof fetch
  };

  const duplicateResult = await submitElectronicPrescriptionOperation(input, options);
  const conflictResult = await submitElectronicPrescriptionOperation(input, options);

  assert.strictEqual(duplicateResult.status, 'success');
  assert.strictEqual(duplicateResult.operationId, 'OP-409');
  assert.strictEqual(duplicateResult.dispensingResultId, 'DR-409');
  assert.match(duplicateResult.warnings.join(' '), /処理済み/);
  assert.strictEqual(conflictResult.status, 'rejected');
  assert.doesNotMatch(conflictResult.message, /別の競合/);
});

test('electronic prescription dispensing result search recovers IDs without false positives', async () => {
  const responses = [
    new Response(JSON.stringify({
      status: 'success',
      message: '調剤結果IDを確認しました。',
      operationId: 'OP-SEARCH-001',
      dispensingResultId: 'DR-RECOVERED-001',
      registeredAt: '2026-06-30T10:00:00.000Z',
      prescriptionIds: ['EP-2026-001'],
      dispensingInformationFile: {
        signatureStatus: 'valid',
        signedAt: '2026-06-30T09:59:00.000Z',
        hpkiVerification: {
          status: 'valid',
          signerRole: 'pharmacist',
          certificateSerialHash: '1'.repeat(64),
          certificateIssuerHash: '2'.repeat(64),
          certificateNotAfter: '2027-06-30',
          revocationCheckedAt: '2026-06-30T10:00:00.000Z'
        }
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      dispensingResultId: 'DR-MISSING-FILE'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({
      status: 'success',
      operationId: 'OP-UNSAFE',
      dispensingResultId: 'https://connector.example.test/DR-SECRET Bearer secret-token'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    new Response(JSON.stringify({ status: 'not_found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    }),
    new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  ];
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv()
    },
    fetchImpl: (async () => responses.shift()!) as typeof fetch
  };
  const input = {
    operation: 'dispensing_result_search' as const,
    prescriptionId: 'EP-2026-001',
    integrityHash: 'b'.repeat(64)
  };

  const recovered = await submitElectronicPrescriptionOperation(input, options);
  const missingFile = await submitElectronicPrescriptionOperation(input, options);
  const unsafeId = await submitElectronicPrescriptionOperation(input, options);
  const notFound = await submitElectronicPrescriptionOperation(input, options);
  const missingId = await submitElectronicPrescriptionOperation(input, options);

  assert.strictEqual(recovered.status, 'success');
  assert.strictEqual(recovered.dispensingResultId, 'DR-RECOVERED-001');
  assert.strictEqual(missingFile.status, 'error');
  assert.match(missingFile.message, /署名検証結果がありません/);
  assert.strictEqual(unsafeId.status, 'error');
  assert.match(unsafeId.message, /有効な調剤結果IDがありません/);
  assert.strictEqual(unsafeId.dispensingResultId, undefined);
  assert.strictEqual(notFound.status, 'not_found');
  assert.strictEqual(notFound.dispensingResultId, undefined);
  assert.strictEqual(missingId.status, 'error');
  assert.match(missingId.message, /有効な調剤結果IDがありません/);
});

test('electronic prescription duplicate check operation returns normalized review result', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    status: 'success',
    operationId: 'https://connector.example.test/op Bearer secret-token',
    registeredAt: 'not-a-date',
    duplicateCheck: { status: 'warning', messages: ['同効薬の重複を確認'] },
    prescriptionIds: ['EP-2026-001']
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const result = await submitElectronicPrescriptionOperation({
    operation: 'duplicate_check',
    prescriptionId: 'EP-2026-001'
  }, {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv()
    },
    fetchImpl: fetchImpl as typeof fetch
  });

  assert.strictEqual(result.status, 'success');
  assert.strictEqual(result.operationId, undefined);
  assert.strictEqual(result.registeredAt, undefined);
  assert.strictEqual(result.duplicateCheck?.status, 'warning');
  assert.deepStrictEqual(result.duplicateCheck?.messages, ['同効薬の重複を確認']);
});

test('electronic prescription duplicate check operation requires checked success results', async () => {
  const responses = [
    new Response(JSON.stringify({ status: 'success', prescriptionIds: ['EP-2026-001'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }),
    new Response(JSON.stringify({
      status: 'success',
      duplicateCheck: { status: 'unknown', messages: ['確認結果が不明です'] },
      prescriptionIds: ['EP-2026-001']
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }),
    new Response(JSON.stringify({
      status: 'success',
      duplicateCheck: { status: 'blocked', messages: [] },
      prescriptionIds: ['EP-2026-001']
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  ];
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv()
    },
    fetchImpl: (async () => responses.shift()!) as typeof fetch
  };
  const input = {
    operation: 'duplicate_check' as const,
    prescriptionId: 'EP-2026-001'
  };

  const missingResult = await submitElectronicPrescriptionOperation(input, options);
  const unknownResult = await submitElectronicPrescriptionOperation(input, options);
  const blockedWithoutMessage = await submitElectronicPrescriptionOperation(input, options);

  assert.strictEqual(missingResult.status, 'error');
  assert.match(missingResult.message, /確認結果/);
  assert.strictEqual(missingResult.duplicateCheck, undefined);
  assert.strictEqual(unknownResult.status, 'error');
  assert.match(unknownResult.message, /確認結果/);
  assert.strictEqual(blockedWithoutMessage.status, 'error');
  assert.match(blockedWithoutMessage.message, /確認メッセージ/);
});

test('electronic prescription duplicate check operation verifies prescription IDs', async () => {
  const responses = [
    new Response(JSON.stringify({
      status: 'success',
      duplicateCheck: { status: 'passed', messages: [] }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }),
    new Response(JSON.stringify({
      status: 'success',
      duplicateCheck: { status: 'passed', messages: [] },
      prescriptionIds: ['EP-OTHER']
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }),
    new Response(JSON.stringify({
      status: 'success',
      duplicateCheck: { status: 'passed', messages: [] },
      prescriptionIds: ['EP-2026-001']
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  ];
  const options = {
    env: {
      ELECTRONIC_PRESCRIPTION_MODE: 'connector',
      ELECTRONIC_PRESCRIPTION_ENDPOINT: 'https://connector.example.test/e-prescription',
      ELECTRONIC_PRESCRIPTION_BEARER_TOKEN: 'secret-token',
      ELECTRONIC_PRESCRIPTION_CONNECTOR_KIND: 'qualification_terminal',
      ELECTRONIC_PRESCRIPTION_CAPABILITIES: connectorCapabilities,
      ...successfulPreflightEnv()
    },
    fetchImpl: (async () => responses.shift()!) as typeof fetch
  };
  const input = {
    operation: 'duplicate_check' as const,
    prescriptionId: 'EP-2026-001'
  };

  const missingIds = await submitElectronicPrescriptionOperation(input, options);
  const mismatchedIds = await submitElectronicPrescriptionOperation(input, options);
  const checked = await submitElectronicPrescriptionOperation(input, options);

  assert.strictEqual(missingIds.status, 'error');
  assert.match(missingIds.message, /対象処方箋ID/);
  assert.strictEqual(mismatchedIds.status, 'error');
  assert.match(mismatchedIds.message, /一致しません/);
  assert.strictEqual(checked.status, 'success');
  assert.strictEqual(checked.duplicateCheck?.status, 'passed');
});

test('electronic prescription connector preflight CLI is registered', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const scriptSource = readFileSync(new URL('../../scripts/runElectronicPrescriptionConnectorPreflight.ts', import.meta.url), 'utf8');

  assert.strictEqual(
    packageJson.scripts['electronic-prescription:connector-preflight'],
    'tsx scripts/runElectronicPrescriptionConnectorPreflight.ts'
  );
  assert.match(scriptSource, /electronic-prescription-connector-preflight/);
  assert.match(scriptSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_OUTCOME/);
  assert.match(scriptSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_ENDPOINT_SHA256/);
  assert.match(scriptSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_AUTH_SHA256/);
  assert.match(scriptSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_KIND/);
  assert.match(scriptSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CONNECTOR_ARTIFACT_SHA256/);
  assert.match(scriptSource, /ELECTRONIC_PRESCRIPTION_LAST_ATTEMPT_CAPABILITIES/);
});
