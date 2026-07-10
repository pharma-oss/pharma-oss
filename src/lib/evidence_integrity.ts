export type EvidenceIntegrityStatus = 'pass' | 'attention' | 'blocked';

export type EvidenceIntegritySeverity = 'warning' | 'error';

export interface EvidenceIntegritySignal {
  path: string;
  valuePreview: string;
  reason: string;
}

export interface EvidenceIntegrityIssue {
  severity: EvidenceIntegritySeverity;
  code: string;
  path: string;
  message: string;
}

export interface EvidenceIntegrityInput {
  evidenceId?: string;
  claimKind?: string;
  evidence: unknown;
  noPatientDataExpected?: boolean;
  realWorldEvidenceRequired?: boolean;
  allowSyntheticEvidence?: boolean;
  generatedAt?: Date;
}

export interface EvidenceIntegrityReview {
  type: 'yakureki-evidence-integrity-review';
  generatedAt: string;
  evidenceId: string;
  claimKind: string;
  status: EvidenceIntegrityStatus;
  statusLabel: string;
  realWorldEvidenceRequired: boolean;
  realWorldClaimed: boolean;
  realWorldProof: {
    capturedAtPresent: boolean;
    reviewRecordIdPresent: boolean;
    sourceArtifactSha256Present: boolean;
    noPatientDataConfirmedPresent: boolean;
    missing: string[];
  };
  noPatientDataExpected: boolean;
  privacy: {
    containsPatientDataSignals: boolean;
    signals: EvidenceIntegritySignal[];
  };
  synthetic: {
    containsSyntheticSignals: boolean;
    allowSyntheticEvidence: boolean;
    signals: EvidenceIntegritySignal[];
  };
  issues: EvidenceIntegrityIssue[];
  requiredActions: string[];
}

export interface EvidenceIntegrityTemplate {
  type: 'yakureki-evidence-integrity-input-template';
  guidance: string[];
  requiredForRealWorldEvidence: string[];
  forbiddenInNoPatientEvidence: string[];
  example: {
    evidenceId: string;
    claimKind: string;
    noPatientDataExpected: true;
    realWorldEvidenceRequired: true;
    evidence: Record<string, unknown>;
  };
}

const SYNTHETIC_TERMS = [
  'mock',
  'dummy',
  'sample',
  'synthetic',
  'fixture',
  'fake',
  'demo',
  'dry-run',
  'dryrun',
  'staging',
  'localhost',
  '127.0.0.1',
  'example',
  'testonly',
  'test-only',
  'ダミー',
  'モック',
  'サンプル',
  'テスト用',
  'テストデータ',
  'デモ',
  '検証用',
  '練習用'
];

const REAL_WORLD_LABEL_TERMS = [
  'field',
  'real',
  'onsite',
  'production',
  'official',
  'actual',
  '現物',
  '現地',
  '実紙',
  '実店舗',
  '実プリンタ',
  '実データ',
  '公式',
  '受付結果'
];

const REAL_WORLD_CONFIRMATION_KEYS = new Set([
  'printerchecked',
  'papermatched',
  'noclipping',
  'textreadable',
  'marginwithintolerance',
  'operatorrecorded',
  'realpilotevidenceconfirmed',
  'realdataequivalentconfirmed',
  'sourcesystemexportedbycustomerconfirmed',
  'officialprocedureconfirmed',
  'authenticationmethodrecorded',
  'credentialstorageconfirmed',
  'operationalownerassigned',
  'readbackverified',
  'immutablestorageverified',
  'endpointconfigured',
  'bearertokenconfigured'
]);

const CAPTURED_AT_KEYS = new Set([
  'capturedat',
  'checkedat',
  'observedat',
  'receivedat',
  'exportedat',
  'completedat'
]);

const REVIEW_RECORD_ID_KEYS = new Set([
  'operatorreviewid',
  'reviewrecordid',
  'acceptancerecordid',
  'acceptanceid',
  'receiptid'
]);

const SOURCE_ARTIFACT_SHA256_KEYS = new Set([
  'sourceartifactsha256',
  'artifactsha256',
  'sourcefilesha256',
  'evidencesha256'
]);

const PATIENT_DATA_KEYS = new Set([
  'patientid',
  'patientname',
  'patientbirthdate',
  'patientdob',
  'birthdate',
  'insuredcardnumber',
  'insurednumber',
  'insuranceprovidernumber',
  'insurernumber',
  'publicexpensebeneficiarynumber'
]);

const JAPANESE_PATIENT_KEY_TERMS = [
  '患者ID',
  '患者番号',
  '患者名',
  '氏名',
  '生年月日',
  '被保険者',
  '保険者番号',
  '公費受給者番号'
];

const MAX_SIGNALS_PER_KIND = 40;

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pathJoin(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function addSignal(signals: EvidenceIntegritySignal[], signal: EvidenceIntegritySignal) {
  if (signals.length >= MAX_SIGNALS_PER_KIND) return;
  signals.push(signal);
}

function valueContainsAny(value: string, terms: string[]): string | undefined {
  const lower = value.toLowerCase();
  return terms.find((term) => lower.includes(term.toLowerCase()));
}

function valueContainsLabel(value: string, terms: string[]): string | undefined {
  const lower = value.toLowerCase();
  return terms.find((term) => {
    const normalizedTerm = term.toLowerCase();
    if (/^[a-z0-9-]+$/.test(normalizedTerm)) {
      const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i').test(lower);
    }
    return lower.includes(normalizedTerm);
  });
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

function looksLikePatientDataKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (PATIENT_DATA_KEYS.has(normalized)) return true;
  return JAPANESE_PATIENT_KEY_TERMS.some((term) => key.includes(term));
}

function looksLikePatientDataValue(value: string): string | undefined {
  if (/\b(patientId|patientName|patientBirthDate|insuredCardNumber)\b/i.test(value)) {
    return 'patient field name';
  }
  const japaneseTerm = JAPANESE_PATIENT_KEY_TERMS.find((term) => value.includes(term));
  if (japaneseTerm) return japaneseTerm;
  if (/\b(?:pt|pat|patient)[_-]?[0-9a-z]{2,}\b/i.test(value)) {
    return 'patient-like identifier';
  }
  return undefined;
}

function valueClaimsRealWorld(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  if ([
    'pass',
    'ok',
    'ready',
    'verified',
    'confirmed',
    'complete',
    'completed',
    'accepted',
    'accepted_with_warnings',
    'accepted-with-warnings',
    'received'
  ].includes(normalized)) {
    return true;
  }
  return valueContainsLabel(normalized, REAL_WORLD_LABEL_TERMS) !== undefined;
}

function collectSignals(value: unknown, path: string, signals: {
  patientData: EvidenceIntegritySignal[];
  synthetic: EvidenceIntegritySignal[];
  realWorldClaimed: { value: boolean };
  realWorldProof: {
    capturedAtPresent: boolean;
    reviewRecordIdPresent: boolean;
    sourceArtifactSha256Present: boolean;
    noPatientDataConfirmedPresent: boolean;
  };
}) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      collectSignals(value[index], `${path}[${index}]`, signals);
    }
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const childPath = pathJoin(path, key);
      if (looksLikePatientDataKey(key)) {
        addSignal(signals.patientData, {
          path: childPath,
          valuePreview: '[redacted patient-data value]',
          reason: 'patient-data field name'
        });
      }

      const normalizedKey = normalizeKey(key);
      if (REAL_WORLD_CONFIRMATION_KEYS.has(normalizedKey) && valueClaimsRealWorld(child)) {
        signals.realWorldClaimed.value = true;
      }

      if (CAPTURED_AT_KEYS.has(normalizedKey) && isValidTimestamp(child)) {
        signals.realWorldProof.capturedAtPresent = true;
      }
      if (REVIEW_RECORD_ID_KEYS.has(normalizedKey) && isValidReviewRecordId(child)) {
        signals.realWorldProof.reviewRecordIdPresent = true;
      }
      if (SOURCE_ARTIFACT_SHA256_KEYS.has(normalizedKey) && isSha256(child)) {
        signals.realWorldProof.sourceArtifactSha256Present = true;
      }
      if (normalizedKey === 'nopatientdataconfirmed' && child === true) {
        signals.realWorldProof.noPatientDataConfirmedPresent = true;
      }

      const syntheticTerm = valueContainsAny(key, SYNTHETIC_TERMS);
      if (syntheticTerm) {
        addSignal(signals.synthetic, {
          path: childPath,
          valuePreview: `[synthetic term: ${syntheticTerm}]`,
          reason: `synthetic term in key: ${syntheticTerm}`
        });
      }

      collectSignals(child, childPath, signals);
    }
    return;
  }

  if (typeof value === 'string') {
    const syntheticTerm = valueContainsLabel(value, SYNTHETIC_TERMS);
    if (syntheticTerm) {
      addSignal(signals.synthetic, {
        path,
        valuePreview: `[synthetic term: ${syntheticTerm}]`,
        reason: `synthetic term in value: ${syntheticTerm}`
      });
    }

    const patientTerm = looksLikePatientDataValue(value);
    if (patientTerm) {
      addSignal(signals.patientData, {
        path,
        valuePreview: '[redacted patient-data value]',
        reason: `patient-data signal in value: ${patientTerm}`
      });
    }

    if (valueClaimsRealWorld(value)) {
      signals.realWorldClaimed.value = true;
    }
  }
}

function statusFromIssues(issues: EvidenceIntegrityIssue[]): EvidenceIntegrityStatus {
  if (issues.some((issue) => issue.severity === 'error')) return 'blocked';
  if (issues.length > 0) return 'attention';
  return 'pass';
}

function labelFromStatus(status: EvidenceIntegrityStatus): string {
  if (status === 'blocked') return '証跡を保留';
  if (status === 'attention') return '証跡を確認';
  return '証跡OK';
}

export function buildEvidenceIntegrityReview(input: EvidenceIntegrityInput): EvidenceIntegrityReview {
  const generatedAt = input.generatedAt ?? new Date();
  const noPatientDataExpected = input.noPatientDataExpected ?? true;
  const realWorldEvidenceRequired = input.realWorldEvidenceRequired ?? false;
  const allowSyntheticEvidence = input.allowSyntheticEvidence ?? false;
  const signals = {
    patientData: [] as EvidenceIntegritySignal[],
    synthetic: [] as EvidenceIntegritySignal[],
    realWorldClaimed: { value: false },
    realWorldProof: {
      capturedAtPresent: false,
      reviewRecordIdPresent: false,
      sourceArtifactSha256Present: false,
      noPatientDataConfirmedPresent: false
    }
  };

  collectSignals(input.evidence, 'evidence', signals);

  const issues: EvidenceIntegrityIssue[] = [];

  if (noPatientDataExpected && signals.patientData.length > 0) {
    for (const signal of signals.patientData.slice(0, 5)) {
      issues.push({
        severity: 'error',
        code: 'privacy_patient_data_signal',
        path: signal.path,
        message: '患者情報なし証跡に患者ID、患者名、生年月日などを示す項目が含まれています。'
      });
    }
  }

  if (
    signals.realWorldClaimed.value
    && signals.synthetic.length > 0
    && !allowSyntheticEvidence
  ) {
    for (const signal of signals.synthetic.slice(0, 5)) {
      issues.push({
        severity: 'error',
        code: 'synthetic_evidence_claims_real',
        path: signal.path,
        message: 'モック、ダミー、サンプル、ローカル疎通を現物証跡として扱っています。'
      });
    }
  }

  if (realWorldEvidenceRequired && !signals.realWorldClaimed.value) {
    issues.push({
      severity: 'warning',
      code: 'real_world_evidence_not_claimed',
      path: 'evidence',
      message: '現物証跡が必要なゲートですが、外部受領書、実機確認、責任者記録などの確認項目が見つかりません。'
    });
  }

  const missingRealWorldProof = realWorldEvidenceRequired
    ? [
      !signals.realWorldProof.capturedAtPresent ? '実作業の取得・確認日時' : '',
      !signals.realWorldProof.reviewRecordIdPresent ? '匿名の確認記録ID' : '',
      !signals.realWorldProof.sourceArtifactSha256Present ? '元資料のSHA-256' : '',
      noPatientDataExpected && !signals.realWorldProof.noPatientDataConfirmedPresent
        ? '患者情報を含まないことの明示確認'
        : ''
    ].filter(Boolean)
    : [];

  if (missingRealWorldProof.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'real_world_proof_incomplete',
      path: 'evidence',
      message: `現物証跡の出所情報が不足しています: ${missingRealWorldProof.join('、')}`
    });
  }

  const requiredActions = issues.map((issue) => issue.message);
  const status = statusFromIssues(issues);

  return {
    type: 'yakureki-evidence-integrity-review',
    generatedAt: generatedAt.toISOString(),
    evidenceId: input.evidenceId || 'evidence-integrity-review',
    claimKind: input.claimKind || 'general',
    status,
    statusLabel: labelFromStatus(status),
    realWorldEvidenceRequired,
    realWorldClaimed: signals.realWorldClaimed.value,
    realWorldProof: {
      ...signals.realWorldProof,
      noPatientDataConfirmedPresent: !noPatientDataExpected
        || signals.realWorldProof.noPatientDataConfirmedPresent,
      missing: missingRealWorldProof
    },
    noPatientDataExpected,
    privacy: {
      containsPatientDataSignals: signals.patientData.length > 0,
      signals: signals.patientData
    },
    synthetic: {
      containsSyntheticSignals: signals.synthetic.length > 0,
      allowSyntheticEvidence,
      signals: signals.synthetic
    },
    issues,
    requiredActions
  };
}

export function buildEvidenceIntegrityTemplate(): EvidenceIntegrityTemplate {
  return {
    type: 'yakureki-evidence-integrity-input-template',
    guidance: [
      'Use this gate before increasing roadmap progress from real-world evidence.',
      'Do not use generated dummy receipts to satisfy field, device, printer, official, or pilot evidence.',
      'If the evidence is a mock or fixture, keep the progress label as internal implementation only.'
    ],
    requiredForRealWorldEvidence: [
      'external receipt or operator review record',
      'capturedAt/checkedAt timestamp from the actual operation',
      'hash or non-sensitive identifier for the source artifact',
      'explicit no-patient-data confirmation'
    ],
    forbiddenInNoPatientEvidence: [
      'patientId, patientName, patientBirthDate',
      'Japanese headers such as 患者ID, 患者名, 生年月日',
      'raw request/response bodies, local paths, tokens, or free-text notes'
    ],
    example: {
      evidenceId: 'print-field-2026-06',
      claimKind: 'print_media_field',
      noPatientDataExpected: true,
      realWorldEvidenceRequired: true,
      evidence: {
        checkedAt: '2026-06-28T09:00:00.000Z',
        operatorReviewId: 'review-001',
        sourceArtifactSha256: 'a'.repeat(64),
        privacy: { noPatientDataConfirmed: true },
        result: 'actual printer check completed'
      }
    }
  };
}
