import { createHash } from 'node:crypto';

import {
  findMissingElectronicPrescriptionConnectorCapabilities,
  normalizeElectronicPrescriptionConnectorCapabilities,
  normalizeElectronicPrescriptionConnectorKind,
  validateElectronicPrescriptionPayload,
  type ElectronicPrescriptionConnectorCapability,
  type ElectronicPrescriptionFetchStatus,
  type ElectronicPrescriptionOperationKind,
  type ElectronicPrescriptionPayload
} from './electronic_prescription.ts';
import {
  ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS,
  type ElectronicPrescriptionFieldScenarioId
} from './electronic_prescription_field_readiness.ts';

export type ElectronicPrescriptionConnectorContractStatus = 'pass' | 'blocked';

export type ElectronicPrescriptionConnectorContractSampleKind =
  | 'fetch'
  | 'operation'
  | 'scenario';

export interface ElectronicPrescriptionConnectorContractSampleInput {
  id?: string;
  kind?: ElectronicPrescriptionConnectorContractSampleKind | string;
  scenarioId?: ElectronicPrescriptionFieldScenarioId | string;
  operation?: ElectronicPrescriptionOperationKind | string;
  expectedStatus?: string;
  requestShape?: unknown;
  response?: unknown;
}

export interface ElectronicPrescriptionConnectorContractInput {
  connectorKind?: string;
  capabilities?: string[] | string;
  onsExternalInterfaceSpecVersion?: string;
  onsRecordConditionSpecVersion?: string;
  onsStandardTestScenarioVersion?: string;
  onsArtifactSha256?: string;
  connectorArtifactSha256?: string;
  noRawOnsPayloadConfirmed?: boolean;
  noProductionPatientDataConfirmed?: boolean;
  samples?: ElectronicPrescriptionConnectorContractSampleInput[];
}

export interface ElectronicPrescriptionConnectorContractIssue {
  severity: 'error';
  code: string;
  path: string;
  message: string;
}

export interface ElectronicPrescriptionConnectorContractCoverage {
  requiredScenarioCount: number;
  coveredScenarioCount: number;
  missingScenarioIds: ElectronicPrescriptionFieldScenarioId[];
  requiredOperations: ElectronicPrescriptionOperationKind[];
  coveredOperations: ElectronicPrescriptionOperationKind[];
  missingOperations: ElectronicPrescriptionOperationKind[];
  missingSampleIdCount: number;
  duplicateSampleIds: string[];
}

export interface ElectronicPrescriptionConnectorContractReport {
  type: 'yakureki-electronic-prescription-connector-contract';
  schemaVersion: 3;
  generatedAt: string;
  status: ElectronicPrescriptionConnectorContractStatus;
  statusLabel: string;
  connectorKind?: string;
  connectorArtifactVerificationId?: string;
  configuredCapabilities: ElectronicPrescriptionConnectorCapability[];
  missingCapabilities: ElectronicPrescriptionConnectorCapability[];
  specVersions: {
    onsExternalInterfaceSpecVersion?: string;
    onsRecordConditionSpecVersion?: string;
    onsStandardTestScenarioVersion?: string;
    onsArtifactSha256Present: boolean;
    connectorArtifactSha256Present: boolean;
  };
  privacy: {
    containsEndpointUrl: boolean;
    containsBearerToken: boolean;
    containsRawRequestOrResponse: boolean;
    containsRawCertificateIdentifier: boolean;
    containsRawOnsPayload: boolean;
    containsProductionPatientData: boolean;
    containsProductionPrescriptionIdentifier: boolean;
  };
  coverage: ElectronicPrescriptionConnectorContractCoverage;
  issueCount: number;
  issues: ElectronicPrescriptionConnectorContractIssue[];
  requiredActions: string[];
}

export interface ElectronicPrescriptionConnectorContractTemplate
  extends Required<ElectronicPrescriptionConnectorContractInput> {
  type: 'yakureki-electronic-prescription-connector-contract-template';
  schemaVersion: 3;
  guidance: string;
}

const REQUIRED_OPERATIONS: ElectronicPrescriptionOperationKind[] = [
  'duplicate_check',
  'reception_cancel',
  'dispensing_result_register',
  'dispensing_result_search',
  'dispensing_result_cancel',
  'dispensing_result_change'
];

const FETCH_STATUSES: ElectronicPrescriptionFetchStatus[] = [
  'success',
  'not_found',
  'cancelled',
  'changed',
  'patient_mismatch',
  'invalid_payload',
  'error'
];

const FETCH_RESPONSE_SCENARIOS = new Set<ElectronicPrescriptionFieldScenarioId>([
  'exchange_number_fetch',
  'prescription_id_fetch',
  'same_day_multiple_prescriptions',
  'signature_hpki_validation',
  'unit_conversion_usage_supplement',
  'supplementary_records',
  'narcotic_administration'
]);

const DUPLICATE_CHECK_SCENARIOS = new Set<ElectronicPrescriptionFieldScenarioId>([
  'duplicate_check_alert'
]);

const DISPENSING_RESULT_SCENARIO_OPERATIONS: ElectronicPrescriptionOperationKind[] = [
  'dispensing_result_register',
  'dispensing_result_search',
  'dispensing_result_change',
  'dispensing_result_cancel'
];

const DISPENSING_RESULT_SUCCESS_OPERATIONS = new Set<ElectronicPrescriptionOperationKind>([
  'dispensing_result_register',
  'dispensing_result_search',
  'dispensing_result_cancel',
  'dispensing_result_change'
]);

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

const RAW_REQUEST_RESPONSE_KEYS = new Set([
  'requestbody',
  'responsebody',
  'rawrequest',
  'rawresponse',
  'httpbody',
  'body',
  'payloadbody'
]);

const RAW_ONS_PAYLOAD_KEYS = new Set([
  'rawons',
  'rawonsfile',
  'rawcsv',
  'rawxml',
  'csvbody',
  'xmlbody',
  'sharedfolderfilebody'
]);

const RAW_CERTIFICATE_KEYS = new Set([
  'certificate',
  'certificatepem',
  'x509certificate',
  'rawcertificate',
  'certificateserial',
  'certificateserialnumber',
  'serialnumber',
  'certificateissuer',
  'issuername',
  'certificatesubject',
  'subjectname'
]);

const PATIENT_IDENTIFIER_KEYS = new Set([
  'patientid',
  'patientnumber',
  'patientcode',
  'karteid',
  'karteinumber',
  'insurance',
  'insurancenumber',
  'insurednumber',
  'insuredcardnumber',
  'insuranceprovidernumber',
  'insurernumber',
  'publicexpensebeneficiarynumber'
]);

const JAPANESE_PATIENT_IDENTIFIER_KEY_TERMS = [
  '患者ID',
  '患者番号',
  'カルテ番号',
  '保険番号',
  '保険者番号',
  '被保険者',
  '公費受給者番号'
];

const PRESCRIPTION_IDENTIFIER_KEYS = new Set([
  'prescriptionid',
  'prescriptionids',
  'electronicprescriptionid',
  'electronicprescriptionids',
  'eprescriptionid',
  'eprescriptionids',
  'eprxid',
  'eprxids',
  'exchangenumber',
  'exchangenumbers',
  'fetchkey',
  'fetchkeys',
  'prescriptionfetchkey',
  'prescriptionfetchkeys',
  'vouchernumber',
  'vouchernumbers'
]);

const JAPANESE_PRESCRIPTION_IDENTIFIER_KEY_TERMS = [
  '電子処方箋ID',
  '処方箋ID',
  '引換番号',
  '引換No',
  '引換NO',
  '取得キー',
  '処方箋取得キー'
];

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSha256(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

function isValidObjectIdentifier(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!/^\d+(?:\.\d+)+$/.test(text)) return false;
  const arcs = text.split('.');
  if (arcs.some((arc) => arc.length > 1 && arc.startsWith('0'))) return false;
  const first = Number(arcs[0]);
  const second = Number(arcs[1]);
  if (!Number.isInteger(first) || first < 0 || first > 2) return false;
  if (!Number.isInteger(second) || second < 0) return false;
  if ((first === 0 || first === 1) && second > 39) return false;
  return true;
}

function normalizeSampleId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!/^[a-z0-9][a-z0-9._:-]{2,159}$/i.test(text)) return undefined;
  return text.toLowerCase();
}

function normalizeSha256(value: unknown): string | undefined {
  return isSha256(value) ? String(value).trim().toLowerCase() : undefined;
}

function buildConnectorArtifactVerificationId(sha256: string | undefined): string | undefined {
  if (!sha256) return undefined;
  return createHash('sha256')
    .update(`yakureki-electronic-prescription-connector-artifact\0${sha256}`)
    .digest('hex');
}

function shortText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 120) : fallback;
}

function isIsoTimestamp(value: unknown): boolean {
  const text = shortText(value);
  return !!text && ISO_TIMESTAMP_PATTERN.test(text) && !Number.isNaN(new Date(text).getTime());
}

function parseIsoTimestamp(value: unknown): Date | undefined {
  return isIsoTimestamp(value) ? new Date(shortText(value)) : undefined;
}

function parseIsoOrDateReference(value: unknown): Date | undefined {
  const iso = parseIsoTimestamp(value);
  if (iso) return iso;
  const text = shortText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? date : undefined;
}

function readOperationPrescriptionIds(response: Record<string, unknown>): string[] {
  const values: unknown[] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item)) {
          values.push(item.prescriptionId, item.electronicPrescriptionId, item.id);
        } else {
          values.push(item);
        }
      }
    } else if (typeof value === 'string') {
      values.push(...value.split(/[,\s、]+/).filter(Boolean));
    } else {
      values.push(value);
    }
  };
  collect(response.prescriptionIds);
  collect(response.linkedPrescriptionIds);
  collect(response.electronicPrescriptionIds);
  collect(response.prescriptions);
  collect(response.prescriptionId);
  collect(response.electronicPrescriptionId);
  return Array.from(new Set(values
    .map((value) => shortText(value))
    .filter((value) => value.length > 0)));
}

function isAnonymousPatientName(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const text = value.normalize('NFKC').trim().toLowerCase();
  return text.includes('匿名')
    || text.includes('仮名')
    || text.includes('架空')
    || text.includes('anon')
    || text.includes('anonymous');
}

function isSyntheticPrescriptionIdentifier(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const text = String(value).normalize('NFKC').trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  return lower.includes('test')
    || lower.includes('sample')
    || lower.includes('dummy')
    || lower.includes('anon')
    || lower.includes('anonymous')
    || text.includes('匿名')
    || text.includes('架空')
    || text.includes('テスト')
    || text.includes('サンプル')
    || text.includes('ダミー');
}

function containsProductionPrescriptionIdentifier(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsProductionPrescriptionIdentifier(item));
  }
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  return !isSyntheticPrescriptionIdentifier(value);
}

function addIssue(
  issues: ElectronicPrescriptionConnectorContractIssue[],
  code: string,
  path: string,
  message: string
) {
  issues.push({ severity: 'error', code, path, message });
}

function scanPrivacySignals(value: unknown, path: string, signals: ElectronicPrescriptionConnectorContractReport['privacy']) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanPrivacySignals(item, `${path}[${index}]`, signals));
    return;
  }
  if (!isRecord(value)) {
    if (typeof value === 'string') {
      if (/https?:\/\/[^\s"'<>]+/i.test(value)) signals.containsEndpointUrl = true;
      if (/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/i.test(value)) signals.containsBearerToken = true;
      if (/\b(?:X-API-Key|Api-Key|api_key|apiKey)\s*[:=]\s*[A-Za-z0-9._~+/-]+=*/i.test(value)) signals.containsBearerToken = true;
      if (/\b(?:client_secret|clientSecret|secret|password)\s*[:=]\s*[^\s,、。;；]+/i.test(value)) signals.containsBearerToken = true;
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeKey(key);
    const normalizedDisplayKey = key.normalize('NFKC');
    if (['endpoint', 'url', 'uri', 'baseurl'].includes(normalizedKey)) {
      signals.containsEndpointUrl = true;
    }
    if ([
      'authorization',
      'bearertoken',
      'token',
      'accesstoken',
      'apikey',
      'xapikey',
      'clientsecret',
      'secret',
      'password',
      'credential',
      'credentials',
      'privatekey'
    ].includes(normalizedKey)) {
      signals.containsBearerToken = true;
    }
    if (RAW_REQUEST_RESPONSE_KEYS.has(normalizedKey)) {
      signals.containsRawRequestOrResponse = true;
    }
    if (RAW_ONS_PAYLOAD_KEYS.has(normalizedKey)) {
      signals.containsRawOnsPayload = true;
    }
    if (RAW_CERTIFICATE_KEYS.has(normalizedKey)) {
      signals.containsRawCertificateIdentifier = true;
    }
    if (PATIENT_IDENTIFIER_KEYS.has(normalizedKey) || JAPANESE_PATIENT_IDENTIFIER_KEY_TERMS.some((term) => normalizedDisplayKey.includes(term))) {
      signals.containsProductionPatientData = true;
    }
    if ((normalizedKey === 'name' || normalizedKey === 'patientname') && path.toLowerCase().includes('patient')) {
      if (!isAnonymousPatientName(child)) signals.containsProductionPatientData = true;
    }
    if (
      PRESCRIPTION_IDENTIFIER_KEYS.has(normalizedKey)
      || JAPANESE_PRESCRIPTION_IDENTIFIER_KEY_TERMS.some((term) => normalizedDisplayKey.includes(term))
    ) {
      if (containsProductionPrescriptionIdentifier(child)) {
        signals.containsProductionPrescriptionIdentifier = true;
      }
    }
    scanPrivacySignals(child, path ? `${path}.${key}` : key, signals);
  }
}

function buildSampleIdQuality(samples: ElectronicPrescriptionConnectorContractSampleInput[]): {
  missingSampleIdCount: number;
  duplicateSampleIds: string[];
  duplicateSampleIdSet: Set<string>;
} {
  const counts = new Map<string, number>();
  let missingSampleIdCount = 0;
  for (const sample of samples) {
    const sampleId = normalizeSampleId(sample.id);
    if (!sampleId) {
      missingSampleIdCount += 1;
      continue;
    }
    counts.set(sampleId, (counts.get(sampleId) || 0) + 1);
  }
  const duplicateSampleIds = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([sampleId]) => sampleId)
    .sort();
  return {
    missingSampleIdCount,
    duplicateSampleIds,
    duplicateSampleIdSet: new Set(duplicateSampleIds)
  };
}

function sampleHasUniqueId(
  sample: ElectronicPrescriptionConnectorContractSampleInput,
  duplicateSampleIdSet: Set<string>
): boolean {
  const sampleId = normalizeSampleId(sample.id);
  return !!sampleId && !duplicateSampleIdSet.has(sampleId);
}

function knownScenarioIds(
  samples: ElectronicPrescriptionConnectorContractSampleInput[],
  duplicateSampleIdSet: Set<string>
): Set<ElectronicPrescriptionFieldScenarioId> {
  const requiredIds = new Set(ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.map((scenario) => scenario.id));
  return new Set(samples
    .filter((sample) => sampleHasUniqueId(sample, duplicateSampleIdSet))
    .map((sample) => sample.scenarioId)
    .filter((id): id is ElectronicPrescriptionFieldScenarioId => typeof id === 'string' && requiredIds.has(id as ElectronicPrescriptionFieldScenarioId)));
}

function knownOperations(
  samples: ElectronicPrescriptionConnectorContractSampleInput[],
  duplicateSampleIdSet: Set<string>
): Set<ElectronicPrescriptionOperationKind> {
  return new Set(samples
    .filter((sample) => sampleHasUniqueId(sample, duplicateSampleIdSet))
    .map((sample) => sample.operation)
    .filter((operation): operation is ElectronicPrescriptionOperationKind => (
      typeof operation === 'string' && REQUIRED_OPERATIONS.includes(operation as ElectronicPrescriptionOperationKind)
    )));
}

function hasScenarioOperationSample(
  samples: ElectronicPrescriptionConnectorContractSampleInput[],
  scenarioId: ElectronicPrescriptionFieldScenarioId,
  operation: ElectronicPrescriptionOperationKind,
  duplicateSampleIdSet: Set<string>
): boolean {
  return samples.some((sample) => sampleHasUniqueId(sample, duplicateSampleIdSet)
    && sample.scenarioId === scenarioId
    && sample.operation === operation);
}

function validateFetchResponse(
  sample: ElectronicPrescriptionConnectorContractSampleInput,
  index: number,
  issues: ElectronicPrescriptionConnectorContractIssue[]
) {
  const response = isRecord(sample.response) ? sample.response : undefined;
  if (!response) {
    addIssue(issues, 'sample_response_missing', `samples.${index}.response`, '取得応答サンプルがJSONオブジェクトではありません。');
    return;
  }
  const status = shortText(response.status, 'success');
  if (status && !FETCH_STATUSES.includes(status as ElectronicPrescriptionFetchStatus)) {
    addIssue(issues, 'fetch_status_unknown', `samples.${index}.response.status`, '取得応答のstatusがyakurekiの正規化状態ではありません。');
  }
  const expectsSuccess = !sample.expectedStatus || sample.expectedStatus === 'success' || status === 'success';
  if (!expectsSuccess) return;
  const prescription = isRecord(response.prescription)
    ? response.prescription as unknown as ElectronicPrescriptionPayload
    : isRecord(sample.response)
      ? sample.response as unknown as ElectronicPrescriptionPayload
      : undefined;
  if (!prescription) {
    addIssue(issues, 'fetch_prescription_missing', `samples.${index}.response.prescription`, '成功取得サンプルに正規化済み処方箋がありません。');
    return;
  }
  const payloadIssues = validateElectronicPrescriptionPayload(prescription);
  for (const issue of payloadIssues) {
    addIssue(issues, 'fetch_payload_invalid', `samples.${index}.response.prescription.${issue.field}`, issue.message);
  }
  if (sample.scenarioId === 'exchange_number_fetch' && !shortText(prescription.exchangeNumber)) {
    addIssue(issues, 'exchange_number_missing', `samples.${index}.response.prescription.exchangeNumber`, '6桁引換番号取得シナリオの応答に引換番号がありません。');
  }
  if (sample.scenarioId === 'prescription_id_fetch' && !shortText(prescription.prescriptionId)) {
    addIssue(issues, 'prescription_id_missing', `samples.${index}.response.prescription.prescriptionId`, '処方箋ID取得シナリオの応答に処方箋IDがありません。');
  }
  if (sample.scenarioId === 'signature_hpki_validation') {
    const hpki = prescription.signatureVerification?.hpkiVerification;
    if (
      hpki?.status !== 'valid'
      || hpki.signerRole !== 'doctor'
      || !hpki.certificateSerialHash
      || !hpki.certificateIssuerHash
      || !hpki.certificateNotAfter
      || !hpki.revocationCheckedAt
    ) {
      addIssue(issues, 'doctor_hpki_missing', `samples.${index}.response.prescription.signatureVerification.hpkiVerification`, '医師HPKIの資格種別、有効期限、失効確認、証明書照合値が揃っていません。');
    }
    const revocationCheckedAt = parseIsoTimestamp(hpki?.revocationCheckedAt);
    if (hpki?.revocationCheckedAt && !revocationCheckedAt) {
      addIssue(issues, 'hpki_revocation_checked_at_invalid', `samples.${index}.response.prescription.signatureVerification.hpkiVerification.revocationCheckedAt`, '医師HPKIの失効確認日時はISO日時で記録してください。');
    }
    const hpkiReference = parseIsoOrDateReference(
      prescription.signatureVerification?.verifiedAt || prescription.issuedAt || prescription.prescriptionDate
    );
    if (revocationCheckedAt && hpkiReference && revocationCheckedAt.getTime() < hpkiReference.getTime()) {
      addIssue(issues, 'hpki_revocation_checked_at_stale', `samples.${index}.response.prescription.signatureVerification.hpkiVerification.revocationCheckedAt`, '医師HPKIの失効確認日時が署名検証日時より前です。');
    }
    if (hpki?.policyOid && !isValidObjectIdentifier(hpki.policyOid)) {
      addIssue(issues, 'hpki_policy_oid_invalid', `samples.${index}.response.prescription.signatureVerification.hpkiVerification.policyOid`, '医師HPKIのポリシーOID形式が不正です。');
    }
  }
  if (sample.scenarioId === 'unit_conversion_usage_supplement') {
    const hasUnitConversion = prescription.items.some((item) => item.unitConversion && item.usageSupplementText?.trim());
    if (!hasUnitConversion) {
      addIssue(issues, 'unit_conversion_missing', `samples.${index}.response.prescription.items`, '単位変換と用法補足を含む薬剤行がありません。');
    }
  }
  if (sample.scenarioId === 'supplementary_records') {
    const supplementary = prescription.supplementaryInformation;
    if (!supplementary || supplementary.prescriptionComments.length === 0 || supplementary.laboratoryResults.length === 0) {
      addIssue(issues, 'supplementary_records_missing', `samples.${index}.response.prescription.supplementaryInformation`, '提供診療情報コメントと検査値データの両方がありません。');
    }
  }
  if (sample.scenarioId === 'narcotic_administration') {
    const narcotic = prescription.supplementaryInformation?.narcoticAdministration;
    if (!narcotic?.isNarcoticPrescription || !narcotic.recordPresent || !narcotic.displayText?.trim()) {
      addIssue(issues, 'narcotic_record_missing', `samples.${index}.response.prescription.supplementaryInformation.narcoticAdministration`, '麻薬処方箋シナリオに麻薬施用レコードの表示情報がありません。');
    }
  }
}

function responseHasTrueFlag(
  response: Record<string, unknown>,
  keys: string[]
): boolean {
  return keys.some((key) => response[key] === true);
}

function responseHasFalseFlag(
  response: Record<string, unknown>,
  keys: string[]
): boolean {
  return keys.some((key) => response[key] === false);
}

function validateScenarioSample(
  sample: ElectronicPrescriptionConnectorContractSampleInput,
  index: number,
  issues: ElectronicPrescriptionConnectorContractIssue[]
) {
  if (sample.scenarioId === undefined) return;
  const scenarioId = sample.scenarioId as ElectronicPrescriptionFieldScenarioId;
  if (!ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.some((scenario) => scenario.id === scenarioId)) {
    addIssue(issues, 'scenario_unknown', `samples.${index}.scenarioId`, '公式試験シナリオIDが不正です。');
    return;
  }
  const response = isRecord(sample.response) ? sample.response : undefined;
  if (!response) {
    addIssue(issues, 'scenario_response_missing', `samples.${index}.response`, '公式試験シナリオの確認サンプルがJSONオブジェクトではありません。');
    return;
  }
  if (
    DUPLICATE_CHECK_SCENARIOS.has(scenarioId)
    && sample.operation !== 'duplicate_check'
  ) {
    addIssue(issues, 'scenario_operation_sample_missing', `samples.${index}.operation`, '重複投薬等チェックシナリオは duplicate_check 操作サンプルとして記録してください。');
  }
  if (
    scenarioId === 'paper_original_unsigned_dispensing'
    && sample.operation !== 'dispensing_result_register'
  ) {
    addIssue(issues, 'scenario_operation_sample_missing', `samples.${index}.operation`, '紙原本のみ未署名シナリオは dispensing_result_register 操作サンプルとして記録してください。');
  }
  if (scenarioId === 'dispensed_reception_cancel_block') {
    const lifecycleDecision = isRecord(response.lifecycleDecision) ? response.lifecycleDecision : {};
    const blocked = responseHasTrueFlag(response, ['receptionCancelBlockedAfterDispensing', 'dispensedReceptionCancelBlocked'])
      || responseHasFalseFlag(response, ['receptionCancelAllowed'])
      || lifecycleDecision.allowed === false;
    if (!blocked) {
      addIssue(issues, 'dispensed_reception_cancel_block_missing', `samples.${index}.response`, '調剤済み後に受付取消できない確認結果がありません。');
    }
  }
  if (scenarioId === 'abandoned_reception_cleanup') {
    const cleanupConfirmed = responseHasTrueFlag(response, ['abandonedReceptionCleanupConfirmed', 'cleanupConfirmed'])
      || shortText(response.cleanupStatus) === 'confirmed';
    if (!cleanupConfirmed) {
      addIssue(issues, 'abandoned_reception_cleanup_missing', `samples.${index}.response`, '中断受付の残存確認と解消の確認結果がありません。');
    }
  }
}

function validateScenarioOperationCoverage(
  samples: ElectronicPrescriptionConnectorContractSampleInput[],
  duplicateSampleIdSet: Set<string>,
  issues: ElectronicPrescriptionConnectorContractIssue[]
) {
  if (!hasScenarioOperationSample(samples, 'duplicate_check_alert', 'duplicate_check', duplicateSampleIdSet)) {
    addIssue(issues, 'scenario_operation_sample_missing', 'samples', '重複投薬等チェックシナリオに duplicate_check 操作サンプルがありません。');
  }
  for (const operation of DISPENSING_RESULT_SCENARIO_OPERATIONS) {
    if (!hasScenarioOperationSample(samples, 'dispensing_result_register_search_change_cancel', operation, duplicateSampleIdSet)) {
      addIssue(issues, 'scenario_operation_sample_missing', 'samples', `調剤結果登録・検索復旧・変更・取消シナリオに ${operation} 操作サンプルがありません。`);
    }
  }
  if (!hasScenarioOperationSample(samples, 'paper_original_unsigned_dispensing', 'dispensing_result_register', duplicateSampleIdSet)) {
    addIssue(issues, 'scenario_operation_sample_missing', 'samples', '紙原本のみ未署名調剤情報シナリオに dispensing_result_register 操作サンプルがありません。');
  }
}

function validateDispensingInformationFile(
  value: unknown,
  index: number,
  issues: ElectronicPrescriptionConnectorContractIssue[],
  options: { requireHpkiSignature: boolean }
) {
  if (!isRecord(value)) {
    addIssue(issues, 'dispensing_information_file_missing', `samples.${index}.response.dispensingInformationFile`, '調剤情報提供ファイルの署名検証結果がありません。');
    return;
  }
  const signatureStatus = shortText(value.signatureStatus || value.electronicSignatureStatus);
  if (options.requireHpkiSignature) {
    if (signatureStatus !== 'valid' && signatureStatus !== 'present') {
      addIssue(issues, 'dispensing_signature_invalid', `samples.${index}.response.dispensingInformationFile.signatureStatus`, '電子処方箋由来の調剤情報提供ファイルは薬剤師署名付きである必要があります。');
    }
    const hpki = isRecord(value.hpkiVerification) ? value.hpkiVerification : {};
    if (
      hpki.status !== 'valid'
      || hpki.signerRole !== 'pharmacist'
      || !isSha256(hpki.certificateSerialHash)
      || !isSha256(hpki.certificateIssuerHash)
      || !shortText(hpki.certificateNotAfter)
      || !shortText(hpki.revocationCheckedAt)
    ) {
      addIssue(issues, 'pharmacist_hpki_missing', `samples.${index}.response.dispensingInformationFile.hpkiVerification`, '薬剤師HPKIの資格種別、有効期限、失効確認、証明書照合値が揃っていません。');
    }
    const revocationCheckedAt = parseIsoTimestamp(hpki.revocationCheckedAt);
    if (hpki.revocationCheckedAt && !revocationCheckedAt) {
      addIssue(issues, 'hpki_revocation_checked_at_invalid', `samples.${index}.response.dispensingInformationFile.hpkiVerification.revocationCheckedAt`, '薬剤師HPKIの失効確認日時はISO日時で記録してください。');
    }
    const signedAt = parseIsoTimestamp(value.signedAt);
    if (revocationCheckedAt && signedAt && revocationCheckedAt.getTime() < signedAt.getTime()) {
      addIssue(issues, 'hpki_revocation_checked_at_stale', `samples.${index}.response.dispensingInformationFile.hpkiVerification.revocationCheckedAt`, '薬剤師HPKIの失効確認日時が調剤情報提供ファイルの署名日時より前です。');
    }
    if (hpki.policyOid && !isValidObjectIdentifier(hpki.policyOid)) {
      addIssue(issues, 'hpki_policy_oid_invalid', `samples.${index}.response.dispensingInformationFile.hpkiVerification.policyOid`, '薬剤師HPKIのポリシーOID形式が不正です。');
    }
  } else if (signatureStatus !== 'unsigned' && signatureStatus !== 'not_applicable') {
    addIssue(issues, 'paper_unsigned_missing', `samples.${index}.response.dispensingInformationFile.signatureStatus`, '紙原本のみのサンプルは未署名を署名対象外として返してください。');
  }
}

function validateOperationResponse(
  sample: ElectronicPrescriptionConnectorContractSampleInput,
  index: number,
  issues: ElectronicPrescriptionConnectorContractIssue[]
) {
  const operation = sample.operation as ElectronicPrescriptionOperationKind | undefined;
  const response = isRecord(sample.response) ? sample.response : undefined;
  if (!operation || !REQUIRED_OPERATIONS.includes(operation)) {
    addIssue(issues, 'operation_unknown', `samples.${index}.operation`, '操作応答サンプルのoperationが不正です。');
    return;
  }
  if (!response) {
    addIssue(issues, 'sample_response_missing', `samples.${index}.response`, '操作応答サンプルがJSONオブジェクトではありません。');
    return;
  }
  const status = shortText(response.status || response.outcome || response.result, 'success');
  if (!['success', 'duplicate', 'already_processed', 'idempotent_replay', 'replayed', 'not_found'].includes(status)) {
    addIssue(issues, 'operation_status_unknown', `samples.${index}.response.status`, '操作応答のstatusがyakurekiの正規化状態ではありません。');
  }
  if (operation === 'duplicate_check') {
    const duplicateCheck = isRecord(response.duplicateCheck) ? response.duplicateCheck : {};
    const duplicateCheckStatus = shortText(duplicateCheck.status);
    if (!['passed', 'warning', 'blocked'].includes(duplicateCheckStatus)) {
      addIssue(issues, 'duplicate_check_missing', `samples.${index}.response.duplicateCheck.status`, '重複投薬等チェック結果がありません。');
    }
    const duplicateCheckMessages = Array.isArray(duplicateCheck.messages)
      ? duplicateCheck.messages
      : [];
    const hasDuplicateCheckMessage = duplicateCheckMessages.some((message) => !!shortText(message));
    if ((duplicateCheckStatus === 'warning' || duplicateCheckStatus === 'blocked') && !hasDuplicateCheckMessage) {
      addIssue(issues, 'duplicate_check_message_missing', `samples.${index}.response.duplicateCheck.messages`, '重複投薬等チェックの注意・停止結果には匿名化済み確認メッセージが必要です。');
    }
    if (readOperationPrescriptionIds(response).length === 0) {
      addIssue(issues, 'duplicate_check_prescription_ids_missing', `samples.${index}.response.prescriptionIds`, '重複投薬等チェックの対象処方箋IDが記録されていません。');
    }
  }
  if (operation === 'reception_cancel') {
    if (!isIsoTimestamp(response.cancelledAt || response.canceledAt || response.registeredAt || response.updatedAt)) {
      addIssue(issues, 'reception_cancelled_at_missing', `samples.${index}.response.cancelledAt`, '受付取消の取消・更新日時がISO日時で記録されていません。');
    }
    if (readOperationPrescriptionIds(response).length === 0) {
      addIssue(issues, 'reception_cancel_prescription_ids_missing', `samples.${index}.response.prescriptionIds`, '受付取消の対象処方箋IDが記録されていません。');
    }
  }
  if (DISPENSING_RESULT_SUCCESS_OPERATIONS.has(operation)) {
    if (!shortText(response.dispensingResultId || response.dispensingId || response.resultId)) {
      addIssue(issues, 'dispensing_result_id_missing', `samples.${index}.response.dispensingResultId`, '調剤結果IDがありません。');
    }
    if (!isIsoTimestamp(response.registeredAt || response.updatedAt)) {
      addIssue(issues, 'dispensing_result_registered_at_missing', `samples.${index}.response.registeredAt`, '調剤結果の登録・更新日時がISO日時で記録されていません。');
    }
    if (readOperationPrescriptionIds(response).length === 0) {
      addIssue(issues, 'dispensing_result_prescription_ids_missing', `samples.${index}.response.prescriptionIds`, '調剤結果の対象処方箋IDが記録されていません。');
    }
  }
  if (operation === 'dispensing_result_register' || operation === 'dispensing_result_change') {
    validateDispensingInformationFile(response.dispensingInformationFile, index, issues, {
      requireHpkiSignature: sample.scenarioId !== 'paper_original_unsigned_dispensing'
    });
  }
}

export function buildElectronicPrescriptionConnectorContractReport(input: {
  generatedAt?: Date;
  contract?: ElectronicPrescriptionConnectorContractInput;
}): ElectronicPrescriptionConnectorContractReport {
  const generatedAt = input.generatedAt ?? new Date();
  const contract = input.contract || {};
  const issues: ElectronicPrescriptionConnectorContractIssue[] = [];
  const samples = Array.isArray(contract.samples) ? contract.samples : [];
  const sampleIdQuality = buildSampleIdQuality(samples);
  const connectorKind = normalizeElectronicPrescriptionConnectorKind(contract.connectorKind);
  const connectorArtifactSha256 = normalizeSha256(contract.connectorArtifactSha256);
  const configuredCapabilities = normalizeElectronicPrescriptionConnectorCapabilities(contract.capabilities);
  const missingCapabilities = findMissingElectronicPrescriptionConnectorCapabilities(contract.capabilities);
  const privacy: ElectronicPrescriptionConnectorContractReport['privacy'] = {
    containsEndpointUrl: false,
    containsBearerToken: false,
    containsRawRequestOrResponse: false,
    containsRawCertificateIdentifier: false,
    containsRawOnsPayload: false,
    containsProductionPatientData: false,
    containsProductionPrescriptionIdentifier: false
  };
  scanPrivacySignals(contract, '', privacy);

  if (!connectorKind) {
    addIssue(issues, 'connector_kind_missing', 'connectorKind', '接続方式は qualification_terminal または web_api を指定してください。');
  }
  for (const capability of missingCapabilities) {
    addIssue(issues, 'capability_missing', 'capabilities', `必須機能 ${capability} の契約サンプルが未確認です。`);
  }
  if (!shortText(contract.onsExternalInterfaceSpecVersion)) {
    addIssue(issues, 'ons_external_interface_spec_missing', 'onsExternalInterfaceSpecVersion', 'ONS外部インターフェイス仕様書の版を記録してください。');
  }
  if (!shortText(contract.onsRecordConditionSpecVersion)) {
    addIssue(issues, 'ons_record_condition_spec_missing', 'onsRecordConditionSpecVersion', '電子処方箋管理サービス記録条件仕様の版を記録してください。');
  }
  if (!shortText(contract.onsStandardTestScenarioVersion)) {
    addIssue(issues, 'ons_standard_scenario_missing', 'onsStandardTestScenarioVersion', 'ONS標準テストシナリオの版を記録してください。');
  }
  if (!isSha256(contract.onsArtifactSha256)) {
    addIssue(issues, 'ons_artifact_hash_missing', 'onsArtifactSha256', 'ONS仕様資料一式のSHA-256を記録してください。');
  }
  if (!connectorArtifactSha256) {
    addIssue(issues, 'connector_artifact_hash_missing', 'connectorArtifactSha256', '接続モジュール配布物・設定パッケージのSHA-256を記録してください。');
  }
  if (contract.noRawOnsPayloadConfirmed !== true) {
    addIssue(issues, 'raw_ons_payload_confirmation_missing', 'noRawOnsPayloadConfirmed', 'pharma-ossへCSV/XML等の生データを返さないことを確認してください。');
  }
  if (contract.noProductionPatientDataConfirmed !== true) {
    addIssue(issues, 'production_patient_data_confirmation_missing', 'noProductionPatientDataConfirmed', '契約サンプルに本番患者情報がないことを確認してください。');
  }

  samples.forEach((sample, index) => {
    if (!normalizeSampleId(sample.id)) {
      addIssue(issues, 'sample_id_missing', `samples.${index}.id`, '契約サンプルごとに一意な匿名サンプルIDを記録してください。');
    }
    validateScenarioSample(sample, index, issues);
    if (
      sample.kind === 'fetch'
      || (typeof sample.scenarioId === 'string' && FETCH_RESPONSE_SCENARIOS.has(sample.scenarioId as ElectronicPrescriptionFieldScenarioId))
    ) {
      validateFetchResponse(sample, index, issues);
    }
    if (sample.kind === 'operation' || sample.operation) {
      validateOperationResponse(sample, index, issues);
    }
  });
  sampleIdQuality.duplicateSampleIds.forEach((sampleId) => {
    addIssue(issues, 'sample_id_duplicate', 'samples', `契約サンプルID ${sampleId} が複数サンプルで使われています。サンプルごとに一意な匿名IDへ分けてください。`);
  });
  validateScenarioOperationCoverage(samples, sampleIdQuality.duplicateSampleIdSet, issues);

  const coveredScenarioIds = knownScenarioIds(samples, sampleIdQuality.duplicateSampleIdSet);
  const coveredOperations = knownOperations(samples, sampleIdQuality.duplicateSampleIdSet);
  const missingScenarioIds = ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS
    .map((scenario) => scenario.id)
    .filter((id) => !coveredScenarioIds.has(id));
  const missingOperations = REQUIRED_OPERATIONS.filter((operation) => !coveredOperations.has(operation));
  missingScenarioIds.forEach((id) => {
    addIssue(issues, 'scenario_sample_missing', 'samples', `公式試験シナリオ ${id} の契約サンプルがありません。`);
  });
  missingOperations.forEach((operation) => {
    addIssue(issues, 'operation_sample_missing', 'samples', `操作 ${operation} の契約サンプルがありません。`);
  });
  if (privacy.containsEndpointUrl) {
    addIssue(issues, 'endpoint_leak', 'contract', '契約サンプルに接続URLらしい値が含まれています。');
  }
  if (privacy.containsBearerToken) {
    addIssue(issues, 'bearer_token_leak', 'contract', '契約サンプルにBearerトークンまたは認証情報らしい値が含まれています。');
  }
  if (privacy.containsRawRequestOrResponse) {
    addIssue(issues, 'raw_http_payload_leak', 'contract', '契約サンプルにHTTP通信本文らしい項目が含まれています。');
  }
  if (privacy.containsRawCertificateIdentifier) {
    addIssue(issues, 'raw_certificate_identifier_leak', 'contract', '契約サンプルに生の証明書、シリアル、発行者名らしい項目が含まれています。SHA-256照合値だけにしてください。');
  }
  if (privacy.containsRawOnsPayload) {
    addIssue(issues, 'raw_ons_payload_leak', 'contract', '契約サンプルにONS CSV/XML等の生データらしい項目が含まれています。正規化JSONだけにしてください。');
  }
  if (privacy.containsProductionPatientData) {
    addIssue(issues, 'production_patient_data_leak', 'contract', '契約サンプルに本番患者情報または非匿名の患者名らしい項目が含まれています。匿名患者名と識別子なしのサンプルへ差し替えてください。');
  }
  if (privacy.containsProductionPrescriptionIdentifier) {
    addIssue(issues, 'production_prescription_identifier_leak', 'contract', '契約サンプルに本番の電子処方箋ID、引換番号、取得キーらしい値が含まれています。TEST/匿名などの合成識別子へ差し替えてください。');
  }

  const status: ElectronicPrescriptionConnectorContractStatus = issues.length === 0 ? 'pass' : 'blocked';
  return {
    type: 'yakureki-electronic-prescription-connector-contract',
    schemaVersion: 3,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: status === 'pass' ? '接続契約OK' : '接続契約未完了',
    ...(connectorKind ? { connectorKind } : {}),
    ...(connectorArtifactSha256 ? {
      connectorArtifactVerificationId: buildConnectorArtifactVerificationId(connectorArtifactSha256)
    } : {}),
    configuredCapabilities,
    missingCapabilities,
    specVersions: {
      ...(shortText(contract.onsExternalInterfaceSpecVersion) ? { onsExternalInterfaceSpecVersion: shortText(contract.onsExternalInterfaceSpecVersion) } : {}),
      ...(shortText(contract.onsRecordConditionSpecVersion) ? { onsRecordConditionSpecVersion: shortText(contract.onsRecordConditionSpecVersion) } : {}),
      ...(shortText(contract.onsStandardTestScenarioVersion) ? { onsStandardTestScenarioVersion: shortText(contract.onsStandardTestScenarioVersion) } : {}),
      onsArtifactSha256Present: isSha256(contract.onsArtifactSha256),
      connectorArtifactSha256Present: !!connectorArtifactSha256
    },
    privacy,
    coverage: {
      requiredScenarioCount: ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.length,
      coveredScenarioCount: coveredScenarioIds.size,
      missingScenarioIds,
      requiredOperations: REQUIRED_OPERATIONS,
      coveredOperations: REQUIRED_OPERATIONS.filter((operation) => coveredOperations.has(operation)),
      missingOperations,
      missingSampleIdCount: sampleIdQuality.missingSampleIdCount,
      duplicateSampleIds: sampleIdQuality.duplicateSampleIds
    },
    issueCount: issues.length,
    issues,
    requiredActions: issues.map((issue) => issue.message)
  };
}

export function buildElectronicPrescriptionConnectorContractTemplate(): ElectronicPrescriptionConnectorContractTemplate {
  const operationResponseTemplate = (operation: ElectronicPrescriptionOperationKind): Record<string, unknown> => {
    if (operation === 'duplicate_check') {
      return { status: 'success', duplicateCheck: { status: 'warning', messages: ['匿名化済み警告'] }, prescriptionIds: [''] };
    }
    if (operation === 'dispensing_result_register' || operation === 'dispensing_result_change') {
      return {
        status: 'success',
        dispensingResultId: '',
        registeredAt: '',
        prescriptionIds: [''],
        dispensingInformationFile: {
          signatureStatus: 'valid',
          signedAt: '',
          fileHash: '',
          hpkiVerification: {
            status: 'valid',
            signerRole: 'pharmacist',
            certificateSerialHash: '',
            certificateIssuerHash: '',
            certificateNotAfter: '',
            revocationCheckedAt: ''
          }
        }
      };
    }
    if (operation === 'dispensing_result_search') {
      return { status: 'success', dispensingResultId: '', registeredAt: '', prescriptionIds: [''] };
    }
    if (operation === 'dispensing_result_cancel') {
      return { status: 'success', dispensingResultId: '', registeredAt: '', prescriptionIds: [''] };
    }
    if (operation === 'reception_cancel') {
      return { status: 'success', cancelledAt: '', prescriptionIds: [''] };
    }
    return { status: 'success' };
  };

  return {
    type: 'yakureki-electronic-prescription-connector-contract-template',
    schemaVersion: 3,
    guidance: 'ONSの外部インターフェイス仕様書、記録条件仕様、標準テストシナリオに基づく接続モジュールの正規化JSON契約だけを記録します。connectorArtifactSha256 には契約サンプルを確認した接続モジュール配布物・設定パッケージのSHA-256を入れ、preflight/接続準備診断と同じ成果物であることを照合してください。各サンプルには一意な匿名サンプルIDを付け、同じIDを複数シナリオや複数操作で使い回さないでください。処方箋サンプルの患者名は「匿名」等の架空名にし、電子処方箋ID、引換番号、取得キーはTEST/匿名等の合成識別子にしてください。受付取消サンプルにはISO形式のcancelledAtまたはupdatedAt、処理対象prescriptionIdsを残してください。調剤結果登録・変更・取消・ID検索のサンプルには調剤結果ID、ISO形式のregisteredAtまたはupdatedAt、処理対象prescriptionIdsを残してください。薬剤行は匿名薬名で取得薬品名、yakureki表示薬品名、薬局マスタ薬品名の照合結果を matched として残してください。実患者氏名、保険番号、接続URL、認証情報、通信本文、CSV/XML生データ、生のHPKI証明書・シリアル・発行者名は入れないでください。',
    connectorKind: '',
    capabilities: [],
    onsExternalInterfaceSpecVersion: '',
    onsRecordConditionSpecVersion: '',
    onsStandardTestScenarioVersion: '',
    onsArtifactSha256: '',
    connectorArtifactSha256: '',
    noRawOnsPayloadConfirmed: false,
    noProductionPatientDataConfirmed: false,
    samples: [
      ...ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.map((scenario) => ({
        id: `${scenario.id}-sample`,
        kind: 'scenario',
        scenarioId: scenario.id,
        operation: '',
        expectedStatus: '',
        requestShape: {},
        response: {}
      })),
      ...REQUIRED_OPERATIONS.map((operation) => ({
        id: `${operation}-sample`,
        kind: 'operation',
        scenarioId: '',
        operation,
        expectedStatus: 'success',
        requestShape: {},
        response: operationResponseTemplate(operation)
      }))
    ]
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildElectronicPrescriptionConnectorContractCsv(
  report: ElectronicPrescriptionConnectorContractReport
): string {
  const rows = [
    ['区分', '判定', '項目', '内容'],
    ['総括', report.statusLabel, '接続契約', `${report.coverage.coveredScenarioCount}/${report.coverage.requiredScenarioCount}シナリオ / 操作 ${report.coverage.coveredOperations.length}/${report.coverage.requiredOperations.length}`],
    ['仕様', report.statusLabel, 'ONS仕様', [
      report.specVersions.onsExternalInterfaceSpecVersion || '外部IF未記録',
      report.specVersions.onsRecordConditionSpecVersion || '記録条件未記録',
      report.specVersions.onsStandardTestScenarioVersion || '標準シナリオ未記録'
    ].join(' / ')],
    ['仕様', report.statusLabel, '接続モジュール成果物', report.specVersions.connectorArtifactSha256Present ? 'SHA-256記録あり' : 'SHA-256未記録'],
    ...report.issues.map((issue) => ['指摘', '未完了', issue.path, issue.message])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
