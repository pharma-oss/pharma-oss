import type { ExternalConnectorReadinessReport } from './external_connector_readiness.ts';
import type { ElectronicPrescriptionConnectorContractReport } from './electronic_prescription_connector_contract.ts';
import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';

export type ElectronicPrescriptionFieldStatus = 'pass' | 'attention' | 'blocked';

export type ElectronicPrescriptionFieldScenarioId =
  | 'exchange_number_fetch'
  | 'prescription_id_fetch'
  | 'same_day_multiple_prescriptions'
  | 'signature_hpki_validation'
  | 'unit_conversion_usage_supplement'
  | 'supplementary_records'
  | 'narcotic_administration'
  | 'duplicate_check_alert'
  | 'dispensing_result_register_search_change_cancel'
  | 'paper_original_unsigned_dispensing'
  | 'dispensed_reception_cancel_block'
  | 'abandoned_reception_cleanup';

export type ElectronicPrescriptionFieldScenarioOutcome = 'pass' | 'attention' | 'blocked' | 'not_checked';

export interface ElectronicPrescriptionFieldScenarioReviewInput {
  scenarioId?: ElectronicPrescriptionFieldScenarioId | string;
  outcome?: ElectronicPrescriptionFieldScenarioOutcome | string;
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  checkedItems?: string[];
}

export interface ElectronicPrescriptionFieldEvidenceInput {
  capturedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  officialProcedureConfirmed?: boolean;
  operationalOwnerAssigned?: boolean;
  outageProcedureConfirmed?: boolean;
  productionConnectorConfirmed?: boolean;
  csvMaxBytesConfirmed?: boolean;
  requiredDisplayItemsConfirmed?: boolean;
  sharedFolderPollingPerformanceConfirmed?: boolean;
  acceptedPrescriptionFetched?: boolean;
  patientAndFetchKeyMatched?: boolean;
  electronicSignatureVerified?: boolean;
  hpkiCertificateVerificationConfirmed?: boolean;
  hpkiPinIssuerCompatibilityConfirmed?: boolean;
  validityPeriodConfirmed?: boolean;
  fetchedContentMatchedSource?: boolean;
  drugNameMasterMatchedConfirmed?: boolean;
  drugCodeUnitUsageConfirmed?: boolean;
  drugCodeLifecycleConfirmed?: boolean;
  unitConversionConfirmed?: boolean;
  usageTextFallbackConfirmed?: boolean;
  supplementaryRecordsDisplayedAndPrintedConfirmed?: boolean;
  narcoticAdministrationRecordConfirmed?: boolean;
  insuranceAndRequiredPharmacyFieldsConfirmed?: boolean;
  sameDayMultiplePrescriptionsConfirmed?: boolean;
  exchangeNumberIntakeConfirmed?: boolean;
  copyNotUsedAsPrescriptionConfirmed?: boolean;
  paperPrescriptionOriginalConfirmed?: boolean;
  duplicateCheckExecuted?: boolean;
  duplicateAlertHandlingConfirmed?: boolean;
  cancelledPrescriptionBlocked?: boolean;
  changedPrescriptionReacquired?: boolean;
  abandonedReceptionCleanupConfirmed?: boolean;
  dispensedReceptionCancellationBlockedConfirmed?: boolean;
  dispensingResultRegistered?: boolean;
  dispensingResultSearchRecoveryConfirmed?: boolean;
  dispensingInformationFileSignatureDisplayedAndPrintedConfirmed?: boolean;
  dispensingInformationFileHpkiVerificationConfirmed?: boolean;
  paperOriginalUnsignedDispensingConfirmed?: boolean;
  allDispensingResultsPolicyConfirmed?: boolean;
  scenarioReviews?: ElectronicPrescriptionFieldScenarioReviewInput[];
}

export interface ElectronicPrescriptionFieldEvidenceTemplate
  extends Required<ElectronicPrescriptionFieldEvidenceInput> {
  type: 'yakureki-electronic-prescription-field-evidence-template';
  schemaVersion: 5;
  guidance: string;
}

export interface ElectronicPrescriptionFieldScenarioDefinition {
  id: ElectronicPrescriptionFieldScenarioId;
  title: string;
  requiredCheckedItems: string[];
}

export interface ElectronicPrescriptionFieldScenarioCoverage {
  requiredCount: number;
  passedCount: number;
  missingScenarioIds: ElectronicPrescriptionFieldScenarioId[];
  incompleteScenarioIds: ElectronicPrescriptionFieldScenarioId[];
  duplicateOperatorReviewIds: string[];
}

export interface ElectronicPrescriptionFieldGate {
  id:
    | 'official_operation'
    | 'production_connector'
    | 'connector_contract'
    | 'accepted_prescription'
    | 'official_scenario_coverage'
    | 'exchange_number_copy'
    | 'duplicate_check'
    | 'cancelled_changed'
    | 'dispensing_result'
    | 'privacy_safety'
    | 'evidence_integrity';
  status: ElectronicPrescriptionFieldStatus;
  statusLabel: string;
  title: string;
  evidence: string[];
  nextAction: string;
}

export interface ElectronicPrescriptionFieldReadinessReport {
  type: 'yakureki-electronic-prescription-field-readiness';
  schemaVersion: 7;
  generatedAt: string;
  status: ElectronicPrescriptionFieldStatus;
  statusLabel: string;
  gateCount: number;
  passedGateCount: number;
  attentionGateCount: number;
  blockedGateCount: number;
  canStartOfficialFieldTrial: boolean;
  canDeclareOperationalReadiness: boolean;
  privacy: {
    containsPatientData: boolean;
    containsEndpointUrl: boolean;
    containsBearerToken: boolean;
    containsRequestBody: boolean;
    containsResponseBody: boolean;
    containsRawCertificateIdentifier: boolean;
    containsProductionPrescriptionIdentifier: boolean;
    containsNamedDrugOrMedicalInstitution: boolean;
  };
  evidenceIntegrity: EvidenceIntegrityReview;
  scenarioCoverage: ElectronicPrescriptionFieldScenarioCoverage;
  connectorContract?: {
    status: ElectronicPrescriptionFieldStatus;
    statusLabel: string;
    issueCount: number;
    coveredScenarioCount: number;
    requiredScenarioCount: number;
    missingOperationCount: number;
  };
  gates: ElectronicPrescriptionFieldGate[];
}

const STATUS_LABELS: Record<ElectronicPrescriptionFieldStatus, string> = {
  pass: 'OK',
  attention: '要確認',
  blocked: '未完了'
};

function gateStatusLabel(status: ElectronicPrescriptionFieldStatus): string {
  return STATUS_LABELS[status];
}

export const ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS: ElectronicPrescriptionFieldScenarioDefinition[] = [
  {
    id: 'exchange_number_fetch',
    title: '6桁引換番号で電子処方箋を取得する',
    requiredCheckedItems: ['6桁引換番号取得', '取得内容SHA-256照合']
  },
  {
    id: 'prescription_id_fetch',
    title: '処方箋IDで電子処方箋を取得する',
    requiredCheckedItems: ['処方箋ID取得', '取得キー照合']
  },
  {
    id: 'same_day_multiple_prescriptions',
    title: '同日複数処方箋を1受付へ束ねる',
    requiredCheckedItems: ['同日複数処方箋の受付追加', '全処方箋IDの調剤結果紐付け']
  },
  {
    id: 'signature_hpki_validation',
    title: '医師HPKI署名・証明書失効を検証する',
    requiredCheckedItems: ['医師HPKI資格種別', '医師HPKI失効確認日時']
  },
  {
    id: 'unit_conversion_usage_supplement',
    title: '単位変換と用法補足を保存・送信する',
    requiredCheckedItems: ['単位変換レコード', '用法補足または用法テキストフォールバック']
  },
  {
    id: 'supplementary_records',
    title: '提供診療情報・検査値を表示・印刷する',
    requiredCheckedItems: ['提供診療情報レコード', '検査値データ等レコード']
  },
  {
    id: 'narcotic_administration',
    title: '麻薬施用情報の必須表示と欠落停止を確認する',
    requiredCheckedItems: ['麻薬施用レコード表示', '麻薬施用レコード欠落時停止']
  },
  {
    id: 'duplicate_check_alert',
    title: '重複投薬等チェックと注意時対応を記録する',
    requiredCheckedItems: ['重複投薬等チェック実行', '注意・停止時の薬剤師確認メッセージ']
  },
  {
    id: 'dispensing_result_register_search_change_cancel',
    title: '調剤結果の登録・検索復旧・変更・取消を通す',
    requiredCheckedItems: ['調剤結果登録', '調剤結果ID検索復旧', '調剤結果変更', '調剤結果取消']
  },
  {
    id: 'paper_original_unsigned_dispensing',
    title: '紙原本のみの未署名調剤情報を署名対象外として扱う',
    requiredCheckedItems: ['紙処方箋原本照合', '未署名を署名対象外として表示']
  },
  {
    id: 'dispensed_reception_cancel_block',
    title: '調剤済み後は調剤結果取消後も受付取消しない',
    requiredCheckedItems: ['調剤済み後の受付取消禁止', '調剤結果取消後も受付取消不可']
  },
  {
    id: 'abandoned_reception_cleanup',
    title: '中断受付の残存確認と解消を行う',
    requiredCheckedItems: ['中断受付の残存確認', '中断受付の解消記録']
  }
];

const REQUIRED_SCENARIO_BY_ID = new Map(
  ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.map((scenario) => [scenario.id, scenario])
);

function isKnownScenarioId(value: unknown): value is ElectronicPrescriptionFieldScenarioId {
  return typeof value === 'string' && REQUIRED_SCENARIO_BY_ID.has(value as ElectronicPrescriptionFieldScenarioId);
}

function isValidTimestamp(value: unknown): boolean {
  return typeof value === 'string'
    && value.trim().length > 0
    && Number.isFinite(Date.parse(value));
}

function isValidReviewRecordId(value: unknown): boolean {
  return typeof value === 'string'
    && /^[a-z0-9][a-z0-9._:-]{2,159}$/i.test(value.trim());
}

function isSha256(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value.trim());
}

function normalizeCheckedItem(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '')
    : '';
}

function scenarioReviewHasRequiredCheckedItems(review: ElectronicPrescriptionFieldScenarioReviewInput): boolean {
  if (!isKnownScenarioId(review.scenarioId)) return false;
  const scenario = REQUIRED_SCENARIO_BY_ID.get(review.scenarioId);
  const checkedItems = new Set((Array.isArray(review.checkedItems) ? review.checkedItems : [])
    .map((item) => normalizeCheckedItem(item))
    .filter(Boolean));
  return !!scenario && scenario.requiredCheckedItems.every((item) => checkedItems.has(normalizeCheckedItem(item)));
}

function scenarioReviewPasses(review: ElectronicPrescriptionFieldScenarioReviewInput): boolean {
  return review.outcome === 'pass'
    && isValidTimestamp(review.capturedAt)
    && isValidReviewRecordId(review.operatorReviewId)
    && isSha256(review.sourceArtifactSha256)
    && review.noPatientDataConfirmed === true
    && scenarioReviewHasRequiredCheckedItems(review);
}

function buildScenarioCoverage(
  reviews: ElectronicPrescriptionFieldScenarioReviewInput[] | undefined
): ElectronicPrescriptionFieldScenarioCoverage {
  const validReviewEntries: Array<{
    scenarioId: ElectronicPrescriptionFieldScenarioId;
    operatorReviewId: string;
  }> = [];
  const validScenarioIdsByReviewId = new Map<string, Set<ElectronicPrescriptionFieldScenarioId>>();
  const passedScenarioIds = new Set<ElectronicPrescriptionFieldScenarioId>();
  const seenScenarioIds = new Set<ElectronicPrescriptionFieldScenarioId>();
  for (const review of reviews || []) {
    if (!isKnownScenarioId(review.scenarioId)) continue;
    seenScenarioIds.add(review.scenarioId);
    if (scenarioReviewPasses(review)) {
      const operatorReviewId = review.operatorReviewId!.trim();
      validReviewEntries.push({ scenarioId: review.scenarioId, operatorReviewId });
      const scenarioIds = validScenarioIdsByReviewId.get(operatorReviewId) ?? new Set<ElectronicPrescriptionFieldScenarioId>();
      scenarioIds.add(review.scenarioId);
      validScenarioIdsByReviewId.set(operatorReviewId, scenarioIds);
    }
  }
  const duplicateOperatorReviewIds = Array.from(validScenarioIdsByReviewId.entries())
    .filter(([, scenarioIds]) => scenarioIds.size > 1)
    .map(([operatorReviewId]) => operatorReviewId)
    .sort();
  const duplicateOperatorReviewIdSet = new Set(duplicateOperatorReviewIds);
  for (const entry of validReviewEntries) {
    if (!duplicateOperatorReviewIdSet.has(entry.operatorReviewId)) {
      passedScenarioIds.add(entry.scenarioId);
    }
  }

  const requiredIds = ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.map((scenario) => scenario.id);
  return {
    requiredCount: requiredIds.length,
    passedCount: passedScenarioIds.size,
    missingScenarioIds: requiredIds.filter((id) => !seenScenarioIds.has(id)),
    incompleteScenarioIds: requiredIds.filter((id) => seenScenarioIds.has(id) && !passedScenarioIds.has(id)),
    duplicateOperatorReviewIds
  };
}

function scenarioTitle(id: ElectronicPrescriptionFieldScenarioId): string {
  return REQUIRED_SCENARIO_BY_ID.get(id)?.title || id;
}

function buildScenarioCoverageGate(
  coverage: ElectronicPrescriptionFieldScenarioCoverage
): ElectronicPrescriptionFieldGate {
  const missing = [
    ...coverage.missingScenarioIds.map((id) => `${scenarioTitle(id)}を確認する`),
    ...coverage.incompleteScenarioIds.map((id) => `${scenarioTitle(id)}の日時・匿名確認ID・元資料SHA-256・患者情報なし確認・シナリオ別確認項目を揃える`),
    ...coverage.duplicateOperatorReviewIds.map((id) => `匿名確認ID ${id} をシナリオごとに分ける`)
  ];
  const status: ElectronicPrescriptionFieldStatus = missing.length === 0 ? 'pass' : 'blocked';
  const passedTitles = ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS
    .filter((scenario) => !coverage.missingScenarioIds.includes(scenario.id)
      && !coverage.incompleteScenarioIds.includes(scenario.id))
    .map((scenario) => scenario.title);

  return {
    id: 'official_scenario_coverage',
    status,
    statusLabel: gateStatusLabel(status),
    title: '公式試験シナリオを匿名証跡付きで網羅する',
    evidence: [
      `確認済みシナリオ: ${coverage.passedCount}/${coverage.requiredCount}`,
      ...passedTitles
    ],
    nextAction: missing.join(' / ') || '対応不要'
  };
}

function buildBooleanGate(input: {
  id: ElectronicPrescriptionFieldGate['id'];
  title: string;
  checks: Array<{ passed: boolean; passedLabel: string; missingAction: string }>;
}): ElectronicPrescriptionFieldGate {
  const evidence = input.checks.filter((check) => check.passed).map((check) => check.passedLabel);
  const missingActions = input.checks.filter((check) => !check.passed).map((check) => check.missingAction);
  const status: ElectronicPrescriptionFieldStatus = missingActions.length === 0 ? 'pass' : 'blocked';
  return {
    id: input.id,
    status,
    statusLabel: gateStatusLabel(status),
    title: input.title,
    evidence,
    nextAction: missingActions.join(' / ') || '対応不要'
  };
}

function buildProductionConnectorGate(
  connectorReadiness: ExternalConnectorReadinessReport,
  evidence: ElectronicPrescriptionFieldEvidenceInput
): ElectronicPrescriptionFieldGate {
  const connector = connectorReadiness.checks.find((check) => check.id === 'electronic_prescription');
  if (!connector) {
    return {
      id: 'production_connector',
      status: 'blocked',
      statusLabel: gateStatusLabel('blocked'),
      title: '本番接続モジュールで電子処方箋を取得する',
      evidence: [],
      nextAction: '接続準備診断に電子処方箋コネクタを含める'
    };
  }

  const attempt = connector.lastAttempt;
  const hasSuccessfulProductionAttempt = connector.config.mode === 'connector'
    && connector.status === 'ready'
    && attempt.outcome === 'success'
    && attempt.responseShape === 'json_object'
    && evidence.productionConnectorConfirmed === true;
  const status: ElectronicPrescriptionFieldStatus = hasSuccessfulProductionAttempt ? 'pass' : 'blocked';
  return {
    id: 'production_connector',
    status,
    statusLabel: gateStatusLabel(status),
    title: '本番接続モジュールで電子処方箋を取得する',
    evidence: [
      `接続設定: ${connector.statusLabel}`,
      `モード: ${connector.config.mode}`,
      `直近試行: ${attempt.outcomeLabel}`,
      `応答形状: ${attempt.responseShape}`,
      `現地確認: ${evidence.productionConnectorConfirmed ? 'あり' : 'なし'}`
    ],
    nextAction: hasSuccessfulProductionAttempt
      ? '対応不要'
      : connector.requiredActions.join(' / ') || '本番接続モジュールの現地取得を成功させ、確認記録を残す'
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

type ElectronicPrescriptionFieldPrivacy = ElectronicPrescriptionFieldReadinessReport['privacy'];

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

const DRUG_OR_MEDICAL_INSTITUTION_KEYS = new Set([
  'drugname',
  'drugnames',
  'sourcedrugname',
  'masterdrugname',
  'medicationname',
  'medicinename',
  'medicalinstitutionname',
  'institutionname',
  'hospitalname',
  'clinicname',
  'providername'
]);

const JAPANESE_DRUG_OR_MEDICAL_INSTITUTION_KEY_TERMS = [
  '薬品名',
  '医薬品名',
  '薬剤名',
  '医療機関名',
  '病院名',
  '診療所名'
];

const RAW_CERTIFICATE_IDENTIFIER_KEYS = new Set([
  'rawcertificate',
  'rawcertificatepem',
  'certificatepem',
  'certpem',
  'certificatechain',
  'certificatebase64',
  'x509certificate',
  'x509cert',
  'certificatebody',
  'certificateserial',
  'certificateserialnumber',
  'serialnumber',
  'certificateissuer',
  'issuer',
  'issuername',
  'certificatesubject',
  'subject',
  'subjectname',
  'distinguishedname',
  'dn'
]);

const JAPANESE_RAW_CERTIFICATE_IDENTIFIER_KEY_TERMS = [
  '生証明書',
  '証明書本文',
  '証明書シリアル',
  'シリアル番号',
  '証明書発行者',
  '発行者名',
  '証明書サブジェクト',
  'サブジェクト名'
];

const NON_ENTITY_CONFIRMATION_VALUES = new Set([
  'ok',
  'pass',
  'passed',
  'checked',
  'confirmed',
  'matched',
  '一致',
  '確認済み',
  '確認済',
  'あり',
  'なし',
  '有',
  '無'
]);

function normalizePrivacyKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isAnonymousOrSyntheticEvidenceValue(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const text = String(value).normalize('NFKC').trim();
  if (!text) return true;
  if (isSha256(text)) return true;
  const lower = text.toLowerCase();
  return lower.includes('test')
    || lower.includes('sample')
    || lower.includes('dummy')
    || lower.includes('anon')
    || lower.includes('anonymous')
    || lower.includes('hash')
    || text.includes('匿名')
    || text.includes('仮名')
    || text.includes('架空')
    || text.includes('テスト')
    || text.includes('サンプル')
    || text.includes('ダミー')
    || text.includes('ハッシュ');
}

function looksLikeProductionIdentifierValue(value: unknown): boolean {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const text = String(value).normalize('NFKC').trim();
  if (!text || isAnonymousOrSyntheticEvidenceValue(text)) return false;
  return /^\d{6,16}$/.test(text) || /^[A-Za-z0-9][A-Za-z0-9._:-]{3,159}$/.test(text);
}

function containsProductionPrescriptionIdentifier(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsProductionPrescriptionIdentifier(item));
  if (!isRecord(value)) return looksLikeProductionIdentifierValue(value);
  return Object.values(value).some((child) => containsProductionPrescriptionIdentifier(child));
}

function looksLikeNamedDrugOrMedicalInstitution(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => looksLikeNamedDrugOrMedicalInstitution(item));
  if (!isRecord(value)) {
    if (typeof value !== 'string' && typeof value !== 'number') return false;
    const text = String(value).normalize('NFKC').trim();
    if (!text || isAnonymousOrSyntheticEvidenceValue(text)) return false;
    if (NON_ENTITY_CONFIRMATION_VALUES.has(text.toLowerCase()) || NON_ENTITY_CONFIRMATION_VALUES.has(text)) return false;
    return text.length >= 2;
  }
  return Object.values(value).some((child) => looksLikeNamedDrugOrMedicalInstitution(child));
}

function looksLikeRawCertificateIdentifier(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => looksLikeRawCertificateIdentifier(item));
  if (isRecord(value)) return Object.values(value).some((child) => looksLikeRawCertificateIdentifier(child));
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const text = String(value).normalize('NFKC').trim();
  if (!text) return false;
  if (isSha256(text) || isAnonymousOrSyntheticEvidenceValue(text)) return false;
  if (NON_ENTITY_CONFIRMATION_VALUES.has(text.toLowerCase()) || NON_ENTITY_CONFIRMATION_VALUES.has(text)) return false;
  return true;
}

function containsLabeledProductionPrescriptionIdentifierText(value: string): boolean {
  const text = value.normalize('NFKC');
  const pattern = /(?:電子処方箋ID|処方箋ID|引換番号|引換No|引換NO|取得キー|処方箋取得キー|prescription id|exchange number|fetch key)\s*(?:[:：=]|は)?\s*([A-Za-z0-9][A-Za-z0-9._:-]{3,159})/gi;
  return Array.from(text.matchAll(pattern)).some((match) => looksLikeProductionIdentifierValue(match[1]));
}

function containsLabeledNamedDrugOrMedicalInstitutionText(value: string): boolean {
  const text = value.normalize('NFKC');
  const pattern = /(?:薬品名|医薬品名|薬剤名|医療機関名|病院名|診療所名)\s*[:：=]\s*([^,、。;；\n\r]+)/g;
  return Array.from(text.matchAll(pattern)).some((match) => looksLikeNamedDrugOrMedicalInstitution(match[1]));
}

function containsRawCertificateIdentifierText(value: string): boolean {
  const text = value.normalize('NFKC');
  if (/-----BEGIN\s+(?:CERTIFICATE|PRIVATE KEY)-----/i.test(text)) return true;
  const pattern = /(?:生証明書|証明書本文|証明書シリアル|シリアル番号|証明書発行者|発行者名|証明書サブジェクト|certificate serial|serial number|certificate issuer|issuer name|certificate subject)\s*(?:[:：=]|は)?\s*([^,、。;；\n\r]+)/gi;
  return Array.from(text.matchAll(pattern)).some((match) => looksLikeRawCertificateIdentifier(match[1]));
}

function scanFieldEvidencePrivacySignals(value: unknown, privacy: ElectronicPrescriptionFieldPrivacy) {
  if (Array.isArray(value)) {
    value.forEach((item) => scanFieldEvidencePrivacySignals(item, privacy));
    return;
  }
  if (!isRecord(value)) {
    if (typeof value === 'string') {
      if (/https?:\/\/[^\s"'<>]+/i.test(value)) privacy.containsEndpointUrl = true;
      if (/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/i.test(value)) privacy.containsBearerToken = true;
      if (/\b(?:X-API-Key|Api-Key|api_key|apiKey)\s*[:=]\s*[A-Za-z0-9._~+/-]+=*/i.test(value)) privacy.containsBearerToken = true;
      if (/\b(?:client_secret|clientSecret|secret|password)\s*[:=]\s*[^\s,、。;；]+/i.test(value)) privacy.containsBearerToken = true;
      if (containsLabeledProductionPrescriptionIdentifierText(value)) privacy.containsProductionPrescriptionIdentifier = true;
      if (containsLabeledNamedDrugOrMedicalInstitutionText(value)) privacy.containsNamedDrugOrMedicalInstitution = true;
      if (containsRawCertificateIdentifierText(value)) privacy.containsRawCertificateIdentifier = true;
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizePrivacyKey(key);
    const normalizedDisplayKey = key.normalize('NFKC');
    if (['endpoint', 'url', 'uri', 'baseurl', 'connectorurl', 'connectorendpoint'].includes(normalizedKey)) {
      privacy.containsEndpointUrl = true;
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
      privacy.containsBearerToken = true;
    }
    if (['requestbody', 'rawrequest', 'httprequestbody', 'payloadbody', 'communicationbody'].includes(normalizedKey)) {
      privacy.containsRequestBody = true;
    }
    if (['responsebody', 'rawresponse', 'httpresponsebody'].includes(normalizedKey)) {
      privacy.containsResponseBody = true;
    }
    if (
      RAW_CERTIFICATE_IDENTIFIER_KEYS.has(normalizedKey)
      || JAPANESE_RAW_CERTIFICATE_IDENTIFIER_KEY_TERMS.some((term) => normalizedDisplayKey.includes(term))
    ) {
      if (looksLikeRawCertificateIdentifier(child)) {
        privacy.containsRawCertificateIdentifier = true;
      }
    }
    if (
      PRESCRIPTION_IDENTIFIER_KEYS.has(normalizedKey)
      || JAPANESE_PRESCRIPTION_IDENTIFIER_KEY_TERMS.some((term) => normalizedDisplayKey.includes(term))
    ) {
      if (containsProductionPrescriptionIdentifier(child)) {
        privacy.containsProductionPrescriptionIdentifier = true;
      }
    }
    if (
      DRUG_OR_MEDICAL_INSTITUTION_KEYS.has(normalizedKey)
      || JAPANESE_DRUG_OR_MEDICAL_INSTITUTION_KEY_TERMS.some((term) => normalizedDisplayKey.includes(term))
    ) {
      if (looksLikeNamedDrugOrMedicalInstitution(child)) {
        privacy.containsNamedDrugOrMedicalInstitution = true;
      }
    }
    scanFieldEvidencePrivacySignals(child, privacy);
  }
}

function buildFieldEvidencePrivacy(
  fieldEvidence: ElectronicPrescriptionFieldEvidenceInput,
  evidenceIntegrity: EvidenceIntegrityReview
): ElectronicPrescriptionFieldPrivacy {
  const privacy: ElectronicPrescriptionFieldPrivacy = {
    containsPatientData: evidenceIntegrity.privacy.containsPatientDataSignals,
    containsEndpointUrl: false,
    containsBearerToken: false,
    containsRequestBody: false,
    containsResponseBody: false,
    containsRawCertificateIdentifier: false,
    containsProductionPrescriptionIdentifier: false,
    containsNamedDrugOrMedicalInstitution: false
  };
  scanFieldEvidencePrivacySignals(fieldEvidence, privacy);
  return privacy;
}

function isConnectorContractReportLike(value: unknown): value is ElectronicPrescriptionConnectorContractReport {
  if (!isRecord(value)) return false;
  if (value.type !== 'yakureki-electronic-prescription-connector-contract') return false;
  if (value.schemaVersion !== 3) return false;
  if (value.status !== 'pass' && value.status !== 'blocked') return false;
  if (typeof value.statusLabel !== 'string') return false;
  if (
    value.connectorArtifactVerificationId !== undefined
    && typeof value.connectorArtifactVerificationId !== 'string'
  ) return false;
  if (!Array.isArray(value.configuredCapabilities) || !Array.isArray(value.missingCapabilities)) return false;
  if (!isRecord(value.specVersions) || typeof value.specVersions.onsArtifactSha256Present !== 'boolean') return false;
  if (typeof value.specVersions.connectorArtifactSha256Present !== 'boolean') return false;
  if (!isRecord(value.privacy)) return false;
  if (typeof value.privacy.containsEndpointUrl !== 'boolean') return false;
  if (typeof value.privacy.containsBearerToken !== 'boolean') return false;
  if (typeof value.privacy.containsRawRequestOrResponse !== 'boolean') return false;
  if (typeof value.privacy.containsRawCertificateIdentifier !== 'boolean') return false;
  if (typeof value.privacy.containsRawOnsPayload !== 'boolean') return false;
  if (typeof value.privacy.containsProductionPatientData !== 'boolean') return false;
  if (typeof value.privacy.containsProductionPrescriptionIdentifier !== 'boolean') return false;
  if (!isRecord(value.coverage)) return false;
  if (typeof value.coverage.requiredScenarioCount !== 'number') return false;
  if (typeof value.coverage.coveredScenarioCount !== 'number') return false;
  if (!isStringArray(value.coverage.missingOperations)) return false;
  if (!Array.isArray(value.coverage.missingScenarioIds)) return false;
  if (typeof value.coverage.missingSampleIdCount !== 'number') return false;
  if (!isStringArray(value.coverage.duplicateSampleIds)) return false;
  if (typeof value.issueCount !== 'number') return false;
  if (!Array.isArray(value.issues)) return false;
  if (!isStringArray(value.requiredActions)) return false;
  return true;
}

function buildConnectorContractGate(
  contract: unknown,
  connectorReadiness: ExternalConnectorReadinessReport
): ElectronicPrescriptionFieldGate {
  if (!contract) {
    return {
      id: 'connector_contract',
      status: 'blocked',
      statusLabel: gateStatusLabel('blocked'),
      title: '接続モジュールのONS正規化JSON契約を確認する',
      evidence: [],
      nextAction: 'npm run electronic-prescription:connector-contract の出力JSONを公式運用試験へ入力する'
    };
  }
  if (!isConnectorContractReportLike(contract)) {
    return {
      id: 'connector_contract',
      status: 'blocked',
      statusLabel: gateStatusLabel('blocked'),
      title: '接続モジュールのONS正規化JSON契約を確認する',
      evidence: ['契約判定: 入力レポート不正'],
      nextAction: 'electronic-prescription:connector-contract の最新レポートJSONを指定する'
    };
  }

  const missingActions: string[] = [];
  const connector = connectorReadiness.checks.find((check) => check.id === 'electronic_prescription');
  const readinessArtifactVerificationId = connector?.electronicPrescription?.connectorArtifactVerificationId;
  if (contract.status !== 'pass') {
    missingActions.push(contract.requiredActions[0] || '接続モジュール契約の未完了項目を解消する');
  }
  if (!readinessArtifactVerificationId) {
    missingActions.push('接続準備診断に現在の接続モジュール成果物照合IDを含める');
  } else if (!contract.connectorArtifactVerificationId) {
    missingActions.push('接続契約レポートに接続モジュール成果物照合IDを含める');
  } else if (contract.connectorArtifactVerificationId !== readinessArtifactVerificationId) {
    missingActions.push('接続契約レポートを現在の接続モジュール成果物で再作成する');
  }
  if (contract.coverage.coveredScenarioCount < contract.coverage.requiredScenarioCount) {
    missingActions.push('必須シナリオの接続契約サンプルをすべて揃える');
  }
  if (contract.coverage.missingOperations.length > 0) {
    missingActions.push(`未確認の操作サンプルを揃える: ${contract.coverage.missingOperations.join(', ')}`);
  }
  if (contract.coverage.missingSampleIdCount > 0) {
    missingActions.push('契約サンプルごとに一意な匿名サンプルIDを記録する');
  }
  if (contract.coverage.duplicateSampleIds.length > 0) {
    missingActions.push(`契約サンプルIDをサンプルごとに分ける: ${contract.coverage.duplicateSampleIds.join(', ')}`);
  }
  if (contract.missingCapabilities.length > 0) {
    missingActions.push(`接続モジュール必須機能を揃える: ${contract.missingCapabilities.join(', ')}`);
  }
  if (!contract.specVersions.onsArtifactSha256Present) {
    missingActions.push('ONS仕様資料一式のSHA-256を記録する');
  }
  if (!contract.specVersions.connectorArtifactSha256Present) {
    missingActions.push('接続モジュール配布物・設定パッケージのSHA-256を記録する');
  }
  if (
    contract.privacy.containsEndpointUrl
    || contract.privacy.containsBearerToken
    || contract.privacy.containsRawRequestOrResponse
    || contract.privacy.containsRawOnsPayload
    || contract.privacy.containsRawCertificateIdentifier
    || contract.privacy.containsProductionPatientData
    || contract.privacy.containsProductionPrescriptionIdentifier
  ) {
    missingActions.push('契約サンプルからURL、認証情報、通信本文、CSV/XML生データ、生証明書識別子、本番患者情報、本番電子処方箋ID・引換番号・取得キーを除く');
  }

  const status: ElectronicPrescriptionFieldStatus = missingActions.length === 0 ? 'pass' : 'blocked';
  return {
    id: 'connector_contract',
    status,
    statusLabel: gateStatusLabel(status),
    title: '接続モジュールのONS正規化JSON契約を確認する',
    evidence: [
      `契約判定: ${contract.statusLabel}`,
      `成果物照合: ${readinessArtifactVerificationId && contract.connectorArtifactVerificationId === readinessArtifactVerificationId ? '一致' : '未一致'}`,
      `シナリオ: ${contract.coverage.coveredScenarioCount}/${contract.coverage.requiredScenarioCount}`,
      `操作サンプル不足: ${contract.coverage.missingOperations.length}件`,
      `サンプルID不足: ${contract.coverage.missingSampleIdCount}件`,
      `重複サンプルID: ${contract.coverage.duplicateSampleIds.length}件`,
      `指摘: ${contract.issueCount}件`
    ],
    nextAction: missingActions.join(' / ') || '対応不要'
  };
}

function buildPrivacyGate(
  review: EvidenceIntegrityReview,
  privacy: ElectronicPrescriptionFieldPrivacy
): ElectronicPrescriptionFieldGate {
  const blocked = privacy.containsPatientData
    || privacy.containsEndpointUrl
    || privacy.containsBearerToken
    || privacy.containsRequestBody
    || privacy.containsResponseBody
    || privacy.containsRawCertificateIdentifier
    || privacy.containsProductionPrescriptionIdentifier
    || privacy.containsNamedDrugOrMedicalInstitution;
  const status: ElectronicPrescriptionFieldStatus = blocked ? 'blocked' : 'pass';
  const missingActions = [
    privacy.containsPatientData ? '患者情報を除いた匿名確認記録へ差し替える' : '',
    privacy.containsEndpointUrl || privacy.containsBearerToken ? '接続URL・認証情報を証跡から除く' : '',
    privacy.containsRequestBody || privacy.containsResponseBody ? '通信本文を証跡から除き、確認結果とSHA-256だけにする' : '',
    privacy.containsRawCertificateIdentifier ? 'HPKIの生証明書・生シリアル・発行者名を証跡から除き、資格種別・有効期限・失効確認・SHA-256照合値だけにする' : '',
    privacy.containsProductionPrescriptionIdentifier || privacy.containsNamedDrugOrMedicalInstitution
      ? '本番電子処方箋ID・引換番号・取得キー・薬品名・医療機関名は匿名IDまたはSHA-256へ差し替える'
      : ''
  ].filter(Boolean);
  return {
    id: 'privacy_safety',
    status,
    statusLabel: gateStatusLabel(status),
    title: '共有証跡に患者情報・接続秘密を含めない',
    evidence: [
      `患者情報らしい値: ${review.privacy.containsPatientDataSignals ? '検出' : 'なし'}`,
      `接続URL: ${privacy.containsEndpointUrl ? '検出' : 'なし'}`,
      `認証情報: ${privacy.containsBearerToken ? '検出' : 'なし'}`,
      `通信本文: ${privacy.containsRequestBody || privacy.containsResponseBody ? '検出' : 'なし'}`,
      `HPKI生証明書・生識別子: ${privacy.containsRawCertificateIdentifier ? '検出' : 'なし'}`,
      `本番処方箋識別子: ${privacy.containsProductionPrescriptionIdentifier ? '検出' : 'なし'}`,
      `薬品名・医療機関名: ${privacy.containsNamedDrugOrMedicalInstitution ? '検出' : 'なし'}`
    ],
    nextAction: missingActions.join(' / ') || '対応不要'
  };
}

function buildEvidenceIntegrityGate(review: EvidenceIntegrityReview): ElectronicPrescriptionFieldGate {
  return {
    id: 'evidence_integrity',
    status: review.status,
    statusLabel: gateStatusLabel(review.status),
    title: '現地試験証跡の出所と実在性を確認する',
    evidence: [`証跡品質: ${review.statusLabel}`, `指摘: ${review.issues.length}件`],
    nextAction: review.requiredActions.join(' / ') || '対応不要'
  };
}

function summarizeStatus(gates: ElectronicPrescriptionFieldGate[]): ElectronicPrescriptionFieldStatus {
  if (gates.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (gates.some((gate) => gate.status === 'attention')) return 'attention';
  return 'pass';
}

export function buildElectronicPrescriptionFieldReadinessReport(input: {
  generatedAt?: Date;
  connectorReadiness: ExternalConnectorReadinessReport;
  connectorContract?: unknown;
  fieldEvidence?: ElectronicPrescriptionFieldEvidenceInput;
}): ElectronicPrescriptionFieldReadinessReport {
  const generatedAt = input.generatedAt ?? new Date();
  const fieldEvidence = input.fieldEvidence ?? {};
  const evidenceIntegrity = buildEvidenceIntegrityReview({
    generatedAt,
    evidenceId: fieldEvidence.operatorReviewId || 'electronic-prescription-field-readiness',
    claimKind: 'electronic_prescription_field',
    evidence: fieldEvidence,
    noPatientDataExpected: true,
    realWorldEvidenceRequired: true
  });
  const scenarioCoverage = buildScenarioCoverage(fieldEvidence.scenarioReviews);
  const privacy = buildFieldEvidencePrivacy(fieldEvidence, evidenceIntegrity);
  const gates: ElectronicPrescriptionFieldGate[] = [
    buildBooleanGate({
      id: 'official_operation',
      title: '公式手順・担当・停止時の運用を決める',
      checks: [
        { passed: fieldEvidence.officialProcedureConfirmed === true, passedLabel: '公式運用手順を確認済み', missingAction: '厚生労働省等の公式運用手順を確認する' },
        { passed: fieldEvidence.operationalOwnerAssigned === true, passedLabel: '運用責任者を割当済み', missingAction: '現地試験と本番運用の責任者を割り当てる' },
        { passed: fieldEvidence.outageProcedureConfirmed === true, passedLabel: '障害時手順を確認済み', missingAction: '管理サービス停止時の受付・復旧手順を確認する' },
        { passed: fieldEvidence.csvMaxBytesConfirmed === true, passedLabel: 'CSV最大バイト上限を確認済み', missingAction: 'ONS仕様に沿ったCSV最大バイトと接続モジュール側の超過時停止を確認する' },
        { passed: fieldEvidence.requiredDisplayItemsConfirmed === true, passedLabel: '必須表示項目を確認済み', missingAction: '受付画面で処方箋ID、引換番号、患者生年月日、署名、重複確認、薬剤、単位、用法、単位変換、用法補足、処方コメント、検査値、麻薬施用情報の必須表示を確認する' },
        { passed: fieldEvidence.sharedFolderPollingPerformanceConfirmed === true, passedLabel: '共有フォルダ滞留・ポーリング性能を確認済み', missingAction: '共有フォルダ連携の滞留検知、再送、二重取込防止、P95処理時間を確認する' }
      ]
    }),
    buildProductionConnectorGate(input.connectorReadiness, fieldEvidence),
    buildConnectorContractGate(input.connectorContract, input.connectorReadiness),
    buildBooleanGate({
      id: 'accepted_prescription',
      title: '受付した電子処方箋の本人・内容・マスターを照合する',
      checks: [
        { passed: fieldEvidence.acceptedPrescriptionFetched === true, passedLabel: '受付対象の電子処方箋を取得済み', missingAction: '公式サービスから受付対象を取得する' },
        { passed: fieldEvidence.patientAndFetchKeyMatched === true, passedLabel: '患者と取得キーの一致を確認済み', missingAction: '患者生年月日と電子処方箋ID・引換番号の一致を確認する' },
        { passed: fieldEvidence.electronicSignatureVerified === true, passedLabel: '電子署名を検証済み', missingAction: '電子処方箋の電子署名検証結果を確認する' },
        { passed: fieldEvidence.hpkiCertificateVerificationConfirmed === true, passedLabel: 'HPKI証明書を検証済み', missingAction: '電子処方箋のHPKI証明書、資格種別、有効期限、失効確認を患者情報なし証跡で確認する' },
        { passed: fieldEvidence.hpkiPinIssuerCompatibilityConfirmed === true, passedLabel: 'HPKI発行元ごとのPIN仕様を確認済み', missingAction: '接続モジュールがHPKI発行元ごとのPIN文字種・桁数に対応し、PINをyakurekiへ保存しないことを確認する' },
        { passed: fieldEvidence.validityPeriodConfirmed === true, passedLabel: '処方箋の有効期限を確認済み', missingAction: '処方箋の有効期限内であることを確認する' },
        { passed: fieldEvidence.fetchedContentMatchedSource === true, passedLabel: '取得内容と原データを照合済み', missingAction: '薬品名、用量、用法、日数、処方元を原データと照合する' },
        { passed: fieldEvidence.drugNameMasterMatchedConfirmed === true, passedLabel: '取得薬品名と薬局マスタ表示名を照合済み', missingAction: '医師の処方薬品名、yakureki表示薬品名、薬局マスタ薬品名が一致し、mismatch/not_checkedを反映しないことを確認する' },
        { passed: fieldEvidence.drugCodeUnitUsageConfirmed === true, passedLabel: '医薬品コード・単位・用法を確認済み', missingAction: '医薬品コード、単位、用法マスターの変換を確認する' },
        { passed: fieldEvidence.drugCodeLifecycleConfirmed === true, passedLabel: '医薬品コード廃止日を確認済み', missingAction: '処方日時点で廃止済み医薬品コードを反映・送信しないことを確認する' },
        { passed: fieldEvidence.unitConversionConfirmed === true, passedLabel: '単位変換レコードの表示・保存を確認済み', missingAction: '単位変換係数、処方量、処方単位が受付・保存・調剤結果送信へ残り、変換前単位で誤表示しないことを確認する' },
        { passed: fieldEvidence.usageTextFallbackConfirmed === true, passedLabel: '用法コードなしのテキストフォールバックを確認済み', missingAction: '用法コードがない場合に用法テキストで受付・保存・調剤結果送信できることを確認する' },
        { passed: fieldEvidence.supplementaryRecordsDisplayedAndPrintedConfirmed === true, passedLabel: '処方コメント・用法補足・検査値の表示印刷を確認済み', missingAction: '提供診療情報レコード、用法補足、検査値データ等レコードを受付画面と調剤録印刷で確認する' },
        { passed: fieldEvidence.narcoticAdministrationRecordConfirmed === true, passedLabel: '麻薬施用情報の必須表示を確認済み', missingAction: '麻薬処方箋では麻薬施用レコードが欠ける場合に受付を止め、画面と印刷へ表示することを確認する' },
        { passed: fieldEvidence.insuranceAndRequiredPharmacyFieldsConfirmed === true, passedLabel: '保険制度差・薬局必須項目を確認済み', missingAction: '国保等の保険者番号桁数、公費併用、薬剤師名、都道府県コード先頭0、郵便番号形式を調剤結果で確認する' },
        { passed: fieldEvidence.sameDayMultiplePrescriptionsConfirmed === true, passedLabel: '同日複数処方箋の一括受付・登録を確認済み', missingAction: '同一患者・同一医療機関・同日発行の複数処方箋を1受付へ追加し、各処方箋への調剤結果紐付けを確認する' }
      ]
    }),
    buildScenarioCoverageGate(scenarioCoverage),
    buildBooleanGate({
      id: 'exchange_number_copy',
      title: '「処方内容（控え）」は原本にせず、6桁引換番号で取得する',
      checks: [
        { passed: fieldEvidence.exchangeNumberIntakeConfirmed === true, passedLabel: '6桁引換番号の受付を確認済み', missingAction: '資格確認書での6桁引換番号受付を確認する' },
        { passed: fieldEvidence.copyNotUsedAsPrescriptionConfirmed === true, passedLabel: '控えを処方箋原本として扱わないことを確認済み', missingAction: '処方内容（控え）だけを原本として調剤しない運用を確認する' },
        { passed: fieldEvidence.paperPrescriptionOriginalConfirmed === true, passedLabel: '処方箋情報提供ファイルでは紙原本を照合済み', missingAction: '紙処方箋の情報提供ファイルを使う場合に紙の処方箋原本を受領・照合する運用を確認する' }
      ]
    }),
    buildBooleanGate({
      id: 'duplicate_check',
      title: '重複投薬・併用禁忌を確認し、注意時の対応を残す',
      checks: [
        { passed: fieldEvidence.duplicateCheckExecuted === true, passedLabel: '重複投薬等チェックを実行済み', missingAction: '重複投薬・併用禁忌チェックを少なくとも1回実行する' },
        { passed: fieldEvidence.duplicateAlertHandlingConfirmed === true, passedLabel: '注意表示時の薬剤師対応を確認済み', missingAction: '注意表示、同意、疑義照会、薬歴記録の運用を確認する' }
      ]
    }),
    buildBooleanGate({
      id: 'cancelled_changed',
      title: '取消済み・変更済みを古い内容のまま受け付けない',
      checks: [
        { passed: fieldEvidence.cancelledPrescriptionBlocked === true, passedLabel: '取消済みの反映停止を確認済み', missingAction: '取消済み電子処方箋が入力へ反映されないことを確認する' },
        { passed: fieldEvidence.changedPrescriptionReacquired === true, passedLabel: '変更後の再取得を確認済み', missingAction: '変更済み表示から最新内容を再取得する手順を確認する' },
        { passed: fieldEvidence.abandonedReceptionCleanupConfirmed === true, passedLabel: '中断受付の残存確認・解消を確認済み', missingAction: '引換番号受付を中断して手入力へ切り替えた場合に、調剤中データを放置せず確認・解消できることを確認する' },
        { passed: fieldEvidence.dispensedReceptionCancellationBlockedConfirmed === true, passedLabel: '調剤済み後の受付取消禁止を確認済み', missingAction: '一度調剤済みとなった処方箋は、調剤結果取消後も受付取消できないことを確認する' }
      ]
    }),
    buildBooleanGate({
      id: 'dispensing_result',
      title: '調剤結果を電子処方箋管理サービスへ登録する',
      checks: [
        { passed: fieldEvidence.dispensingResultRegistered === true, passedLabel: '調剤結果の登録成功を確認済み', missingAction: '調剤結果を登録し、成功結果を確認する' },
        { passed: fieldEvidence.dispensingResultSearchRecoveryConfirmed === true, passedLabel: '調剤結果ID検索による復旧を確認済み', missingAction: 'タイムアウト後に調剤結果ID検索を行い、二重登録せずIDを復元する' },
        { passed: fieldEvidence.dispensingInformationFileSignatureDisplayedAndPrintedConfirmed === true, passedLabel: '調剤情報提供ファイルの電子署名有無表示・印刷を確認済み', missingAction: '調剤情報提供ファイルの電子署名有無が画面と調剤録へ出ることを確認する' },
        { passed: fieldEvidence.dispensingInformationFileHpkiVerificationConfirmed === true, passedLabel: '調剤情報提供ファイルのHPKI検証を確認済み', missingAction: '薬剤師HPKI署名、資格種別、有効期限、失効確認、証明書ハッシュを確認する' },
        { passed: fieldEvidence.paperOriginalUnsignedDispensingConfirmed === true, passedLabel: '紙原本のみの未署名調剤情報を確認済み', missingAction: '処方箋情報提供ファイルだけを基に調剤した場合は未署名を表示・印刷でき、電子処方箋を含む場合だけ薬剤師署名を必須にすることを確認する' },
        { passed: fieldEvidence.allDispensingResultsPolicyConfirmed === true, passedLabel: '原則すべての調剤結果を登録する運用を確認済み', missingAction: '紙処方箋を含む調剤結果の登録方針と再送手順を確認する' }
      ]
    }),
    buildPrivacyGate(evidenceIntegrity, privacy),
    buildEvidenceIntegrityGate(evidenceIntegrity)
  ];
  const status = summarizeStatus(gates);
  const passedGateCount = gates.filter((gate) => gate.status === 'pass').length;
  const attentionGateCount = gates.filter((gate) => gate.status === 'attention').length;
  const blockedGateCount = gates.filter((gate) => gate.status === 'blocked').length;
  const trialGateIds: ElectronicPrescriptionFieldGate['id'][] = [
    'official_operation',
    'production_connector',
    'connector_contract',
    'privacy_safety',
    'evidence_integrity'
  ];

  return {
    type: 'yakureki-electronic-prescription-field-readiness',
    schemaVersion: 7,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: status === 'pass'
      ? '公式運用試験OK'
      : status === 'attention'
        ? '公式運用前に確認'
        : '公式運用前に未完了',
    gateCount: gates.length,
    passedGateCount,
    attentionGateCount,
    blockedGateCount,
    canStartOfficialFieldTrial: gates
      .filter((gate) => trialGateIds.includes(gate.id))
      .every((gate) => gate.status === 'pass'),
    canDeclareOperationalReadiness: status === 'pass',
    privacy,
    evidenceIntegrity,
    scenarioCoverage,
    ...(isConnectorContractReportLike(input.connectorContract) ? {
      connectorContract: {
        status: input.connectorContract.status === 'pass' ? 'pass' : 'blocked',
        statusLabel: input.connectorContract.statusLabel,
        issueCount: input.connectorContract.issueCount,
        coveredScenarioCount: input.connectorContract.coverage.coveredScenarioCount,
        requiredScenarioCount: input.connectorContract.coverage.requiredScenarioCount,
        missingOperationCount: input.connectorContract.coverage.missingOperations.length
      }
    } : {}),
    gates
  };
}

export function buildElectronicPrescriptionFieldEvidenceTemplate(): ElectronicPrescriptionFieldEvidenceTemplate {
  return {
    type: 'yakureki-electronic-prescription-field-evidence-template',
    schemaVersion: 5,
    guidance: '患者氏名、生年月日、保険番号、電子処方箋ID、引換番号、薬品名、医療機関名、接続URL、認証情報、通信本文は入れず、実作業の確認結果だけを記録してください。薬品名マスタ照合は匿名薬名またはハッシュで、取得薬品名、yakureki表示薬品名、薬局マスタ薬品名が一致し、mismatch/not_checkedを反映しないことだけを残します。総括だけでなく scenarioReviews の各公式シナリオにも確認日時、シナリオごとに一意な匿名確認ID、元資料SHA-256、患者情報なし確認、checkedItemsの必須確認項目を残してください。事前に electronic-prescription:connector-contract の接続契約レポートがOKであることを確認してください。デモ・ダミー証跡は公式運用試験の合格根拠にしません。',
    capturedAt: '',
    operatorReviewId: '',
    sourceArtifactSha256: '',
    noPatientDataConfirmed: false,
    officialProcedureConfirmed: false,
    operationalOwnerAssigned: false,
    outageProcedureConfirmed: false,
    productionConnectorConfirmed: false,
    csvMaxBytesConfirmed: false,
    requiredDisplayItemsConfirmed: false,
    sharedFolderPollingPerformanceConfirmed: false,
    acceptedPrescriptionFetched: false,
    patientAndFetchKeyMatched: false,
    electronicSignatureVerified: false,
    hpkiCertificateVerificationConfirmed: false,
    hpkiPinIssuerCompatibilityConfirmed: false,
    validityPeriodConfirmed: false,
    fetchedContentMatchedSource: false,
    drugNameMasterMatchedConfirmed: false,
    drugCodeUnitUsageConfirmed: false,
    drugCodeLifecycleConfirmed: false,
    unitConversionConfirmed: false,
    usageTextFallbackConfirmed: false,
    supplementaryRecordsDisplayedAndPrintedConfirmed: false,
    narcoticAdministrationRecordConfirmed: false,
    insuranceAndRequiredPharmacyFieldsConfirmed: false,
    sameDayMultiplePrescriptionsConfirmed: false,
    exchangeNumberIntakeConfirmed: false,
    copyNotUsedAsPrescriptionConfirmed: false,
    paperPrescriptionOriginalConfirmed: false,
    duplicateCheckExecuted: false,
    duplicateAlertHandlingConfirmed: false,
    cancelledPrescriptionBlocked: false,
    changedPrescriptionReacquired: false,
    abandonedReceptionCleanupConfirmed: false,
    dispensedReceptionCancellationBlockedConfirmed: false,
    dispensingResultRegistered: false,
    dispensingResultSearchRecoveryConfirmed: false,
    dispensingInformationFileSignatureDisplayedAndPrintedConfirmed: false,
    dispensingInformationFileHpkiVerificationConfirmed: false,
    paperOriginalUnsignedDispensingConfirmed: false,
    allDispensingResultsPolicyConfirmed: false,
    scenarioReviews: ELECTRONIC_PRESCRIPTION_FIELD_REQUIRED_SCENARIOS.map((scenario) => ({
      scenarioId: scenario.id,
      outcome: 'not_checked',
      capturedAt: '',
      operatorReviewId: '',
      sourceArtifactSha256: '',
      noPatientDataConfirmed: false,
      checkedItems: scenario.requiredCheckedItems
    }))
  };
}

export interface ElectronicPrescriptionFieldCheckRequestItem {
  id: string;
  title: string;
  required: boolean;
  neededFields: string[];
  purpose: string;
  storeOnly: string;
  supportShare: string;
}

export interface ElectronicPrescriptionFieldCheckRequest {
  type: 'yakureki-electronic-prescription-field-check-request';
  schemaVersion: 1;
  generatedAt: string;
  guidance: string;
  items: ElectronicPrescriptionFieldCheckRequestItem[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    connectorReadinessJson: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_READINESS';
    connectorContractJson: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_REPORT';
    fieldEvidenceJson: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_EVIDENCE';
    outputDir: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_OUTPUT_DIR';
  };
}

export function buildElectronicPrescriptionFieldCheckRequest(
  input: { generatedAt?: Date } = {}
): ElectronicPrescriptionFieldCheckRequest {
  const generatedAt = input.generatedAt ?? new Date();
  return {
    type: 'yakureki-electronic-prescription-field-check-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    guidance: '電子処方箋の公式運用試験を提出する前に、以下を院内で準備してください。患者氏名、患者番号、生年月日、薬品名、医療機関名、本番の電子処方箋ID・引換番号・取得キー、HPKI生証明書、接続URL、認証情報、通信本文は含めないでください。',
    items: [
      {
        id: 'governance_and_connector',
        title: '公式手順・担当・本番接続の確認',
        required: true,
        neededFields: ['officialProcedureConfirmed', 'operationalOwnerAssigned', 'outageProcedureConfirmed', 'csvMaxBytesConfirmed', 'requiredDisplayItemsConfirmed', 'sharedFolderPollingPerformanceConfirmed', 'productionConnectorConfirmed'],
        purpose: '公式運用手順、運用責任者、障害時手順、CSV上限、必須表示項目、共有フォルダ性能、本番接続モジュールの現地取得成功が揃っているかを確認する',
        storeOnly: '接続URL、認証情報、共有フォルダの実パス',
        supportShare: '各項目の確認済み/未確認のみ'
      },
      {
        id: 'connector_contract',
        title: '接続モジュールのONS正規化JSON契約確認',
        required: true,
        neededFields: ['npm run electronic-prescription:connector-contract の出力レポート'],
        purpose: '接続モジュール成果物照合ID、必須シナリオ・操作サンプルの網羅、ONS仕様資料・接続モジュール配布物のSHA-256が揃っているかを確認する',
        storeOnly: '契約サンプルの原本、ONS仕様資料本体',
        supportShare: '契約判定、シナリオ充足数、指摘件数のみ'
      },
      {
        id: 'accepted_prescription_and_signature',
        title: '受付処方箋の本人・内容・マスター照合',
        required: true,
        neededFields: ['acceptedPrescriptionFetched', 'patientAndFetchKeyMatched', 'electronicSignatureVerified', 'hpkiCertificateVerificationConfirmed', 'hpkiPinIssuerCompatibilityConfirmed', 'validityPeriodConfirmed', 'fetchedContentMatchedSource', 'drugNameMasterMatchedConfirmed', 'drugCodeUnitUsageConfirmed', 'drugCodeLifecycleConfirmed', 'unitConversionConfirmed', 'usageTextFallbackConfirmed', 'supplementaryRecordsDisplayedAndPrintedConfirmed', 'narcoticAdministrationRecordConfirmed', 'insuranceAndRequiredPharmacyFieldsConfirmed'],
        purpose: '患者・取得キー一致、電子署名・HPKI検証、有効期限、原データ照合、薬品マスタ照合、単位変換、麻薬施用表示、保険・薬局必須項目を実地で確認する',
        storeOnly: '患者氏名、生年月日、薬品名、医療機関名、本番の電子処方箋ID・引換番号、HPKI生証明書',
        supportShare: '各確認項目の合否のみ'
      },
      {
        id: 'exchange_number_duplicate_and_changes',
        title: '引換番号・重複投薬確認・取消/変更の運用',
        required: true,
        neededFields: ['exchangeNumberIntakeConfirmed', 'copyNotUsedAsPrescriptionConfirmed', 'paperPrescriptionOriginalConfirmed', 'duplicateCheckExecuted', 'duplicateAlertHandlingConfirmed', 'cancelledPrescriptionBlocked', 'changedPrescriptionReacquired', 'abandonedReceptionCleanupConfirmed', 'dispensedReceptionCancellationBlockedConfirmed'],
        purpose: '6桁引換番号受付、控えを原本にしない運用、重複投薬等チェックと注意時対応、取消済み・変更済み・中断受付・調剤済み後の受付取消禁止を確認する',
        storeOnly: '実際の受付画面キャプチャ、患者・処方内容',
        supportShare: '各確認項目の合否のみ'
      },
      {
        id: 'dispensing_result',
        title: '調剤結果登録とHPKI署名確認',
        required: true,
        neededFields: ['dispensingResultRegistered', 'dispensingResultSearchRecoveryConfirmed', 'dispensingInformationFileSignatureDisplayedAndPrintedConfirmed', 'dispensingInformationFileHpkiVerificationConfirmed', 'paperOriginalUnsignedDispensingConfirmed', 'allDispensingResultsPolicyConfirmed'],
        purpose: '調剤結果登録、タイムアウト後のID検索復旧、署名有無表示、薬剤師HPKI検証、未署名表示、全件登録方針を確認する',
        storeOnly: '調剤結果の実登録内容、薬剤師HPKI証明書',
        supportShare: '各確認項目の合否のみ'
      },
      {
        id: 'official_scenario_coverage',
        title: '必須シナリオごとの現地確認記録',
        required: true,
        neededFields: ['scenarioReviews（シナリオID、判定、確認日時、匿名確認記録ID、元資料SHA-256、確認項目一覧）', 'sameDayMultiplePrescriptionsConfirmed'],
        purpose: '同日複数処方箋、署名・HPKI検証、単位変換・用法補足、麻薬施用、重複確認、調剤結果登録・検索・取消等、必須シナリオごとに現地確認が揃っているかを確認する',
        storeOnly: 'シナリオ確認時の患者・処方内容',
        supportShare: 'シナリオIDと判定結果のみ'
      }
    ],
    operatorChecks: [
      '接続URL、認証トークン、通信本文、HPKI生証明書をそのまま貼り付けない',
      '患者名、患者番号、生年月日、薬品名、医療機関名、本番の電子処方箋ID・引換番号を記録に残さない',
      '確認記録には取得日時、匿名の確認記録ID、元資料SHA-256を残す'
    ],
    privacyRules: [
      '店舗内だけで扱う: 接続設定、HPKI証明書原本、実際の処方内容、契約サンプル原本',
      'サポートへ共有してよい: 各ゲートの合否、シナリオ充足数、指摘件数などの集計値'
    ],
    commandEnvironment: {
      connectorReadinessJson: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_READINESS',
      connectorContractJson: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_CONNECTOR_CONTRACT_REPORT',
      fieldEvidenceJson: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_EVIDENCE',
      outputDir: 'YAKUREKI_ELECTRONIC_PRESCRIPTION_FIELD_OUTPUT_DIR'
    }
  };
}

export function buildElectronicPrescriptionFieldCheckRequestChecklist(
  request: ElectronicPrescriptionFieldCheckRequest
): string {
  const lines = [
    '電子処方箋 公式運用試験 証跡提出依頼',
    `作成日時: ${request.generatedAt}`,
    '',
    request.guidance,
    ''
  ];
  for (const item of request.items) {
    lines.push(`[${item.required ? '必須' : '任意'}] ${item.title}`);
    lines.push(`  目的: ${item.purpose}`);
    lines.push(`  必要項目: ${item.neededFields.join(', ')}`);
    lines.push(`  院内だけで扱う: ${item.storeOnly}`);
    lines.push(`  サポートへ共有してよい: ${item.supportShare}`);
    lines.push('');
  }
  lines.push('確認事項:');
  for (const check of request.operatorChecks) lines.push(`  - ${check}`);
  lines.push('');
  lines.push('取扱いルール:');
  for (const rule of request.privacyRules) lines.push(`  - ${rule}`);
  return lines.join('\n');
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function fieldPrivacySummary(privacy: ElectronicPrescriptionFieldPrivacy): string {
  return [
    `患者情報${privacy.containsPatientData ? '検出' : 'なし'}`,
    `接続URL${privacy.containsEndpointUrl ? '検出' : 'なし'}`,
    `認証情報${privacy.containsBearerToken ? '検出' : 'なし'}`,
    `通信本文${privacy.containsRequestBody || privacy.containsResponseBody ? '検出' : 'なし'}`,
    `HPKI生証明書・生識別子${privacy.containsRawCertificateIdentifier ? '検出' : 'なし'}`,
    `本番処方箋識別子${privacy.containsProductionPrescriptionIdentifier ? '検出' : 'なし'}`,
    `薬品名・医療機関名${privacy.containsNamedDrugOrMedicalInstitution ? '検出' : 'なし'}`
  ].join(' / ');
}

export function buildElectronicPrescriptionFieldReadinessCsv(
  report: ElectronicPrescriptionFieldReadinessReport
): string {
  const rows = [
    ['区分', '判定', '確認項目', '証跡', '次の対応'],
    [
      '総括',
      report.statusLabel,
      `${report.gateCount}項目中OK ${report.passedGateCount}項目 / シナリオ ${report.scenarioCoverage.passedCount}/${report.scenarioCoverage.requiredCount}`,
      fieldPrivacySummary(report.privacy),
      report.status === 'pass' ? '対応不要' : '未完了または要確認の項目を埋める'
    ],
    ...report.gates.map((gate) => [
      '確認項目',
      gate.statusLabel,
      gate.title,
      gate.evidence.join(' / '),
      gate.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildElectronicPrescriptionFieldChecklist(
  report: ElectronicPrescriptionFieldReadinessReport
): string {
  return [
    `電子処方箋 公式運用チェック: ${report.statusLabel}`,
    `確認: ${report.gateCount}項目 / OK ${report.passedGateCount} / 要確認 ${report.attentionGateCount} / 未完了 ${report.blockedGateCount}`,
    `公式試験シナリオ: ${report.scenarioCoverage.passedCount}/${report.scenarioCoverage.requiredCount}`,
    '',
    ...report.gates.map((gate) => (
      `[${gate.status === 'pass' ? 'x' : ' '}] ${gate.title}\n    判定: ${gate.statusLabel}\n    次: ${gate.nextAction}`
    )),
    '',
    '注意: 「処方内容（控え）」は処方箋原本ではありません。資格確認書での受付では、控え等に記載された6桁の引換番号から公式サービス上の電子処方箋を取得します。'
  ].join('\n');
}
