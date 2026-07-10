import {
  buildEvidenceIntegrityReview,
  type EvidenceIntegrityReview
} from './evidence_integrity.ts';

export type PrintMediaVerificationStatus = 'pass' | 'attention' | 'blocked';

export type PrintMediaType =
  | 'a4'
  | 'pdf'
  | 'medicine_bag'
  | 'notebook_sticker'
  | 'liquid_label'
  | 'ointment_label';

export type PrintDocumentId =
  | 'dispensing_record'
  | 'receipt_statement'
  | 'receipt'
  | 'drug_info'
  | 'medicine_bag'
  | 'medicine_notebook_sticker'
  | 'liquid_label_sheet'
  | 'ointment_label_sheet';

export interface PrintLayoutCaptureInput {
  label?: string;
  selector?: string;
  index?: number;
  fileName?: string;
  width?: number;
  height?: number;
  bytes?: number;
}

export interface PrintLayoutRegressionManifestInput {
  ok?: boolean;
  captureCount?: number;
  captures?: PrintLayoutCaptureInput[];
}

export interface PrintMediaFieldEvidenceInput {
  documentId: PrintDocumentId;
  checkedAt?: string;
  operatorReviewId?: string;
  sourceArtifactSha256?: string;
  noPatientDataConfirmed?: boolean;
  mediaType: PrintMediaType;
  printerChecked?: boolean;
  paperMatched?: boolean;
  noClipping?: boolean;
  textReadable?: boolean;
  marginWithinTolerance?: boolean;
  expectedWidthMm?: number;
  expectedHeightMm?: number;
  measuredWidthMm?: number;
  measuredHeightMm?: number;
  operatorRecorded?: boolean;
}

export interface PrintMediaFieldEvidenceTemplateDocument {
  documentId: PrintDocumentId;
  title: string;
  mediaType: PrintMediaType;
  checkedAt: string;
  operatorReviewId: string;
  sourceArtifactSha256: string;
  noPatientDataConfirmed: false;
  printerChecked: false;
  paperMatched: false;
  noClipping: false;
  textReadable: false;
  marginWithinTolerance: false;
  operatorRecorded: false;
  expectedWidthMm: number;
  expectedHeightMm: number;
  guidance: string;
}

export interface PrintMediaFieldEvidenceTemplate {
  type: 'yakureki-print-media-field-evidence-template';
  schemaVersion: 1;
  generatedAt: string;
  privacy: {
    containsPatientData: false;
    containsLocalPath: false;
    containsScreenshotFileName: false;
    containsOperatorName: false;
    containsPrinterName: false;
    containsRawNotes: false;
  };
  documents: PrintMediaFieldEvidenceTemplateDocument[];
}

export interface PrintMediaFieldCheckRequestDocument {
  documentId: PrintDocumentId;
  title: string;
  mediaType: PrintMediaType;
  required: true;
  expectedWidthMm: number;
  expectedHeightMm: number;
  requiredChecks: string[];
  storeOnly: string;
  supportShare: string;
}

export interface PrintMediaFieldCheckRequest {
  type: 'yakureki-print-media-field-check-request';
  schemaVersion: 1;
  generatedAt: string;
  guidance: string;
  dimensionToleranceMm: number;
  documents: PrintMediaFieldCheckRequestDocument[];
  operatorChecks: string[];
  privacyRules: string[];
  commandEnvironment: {
    layoutManifest: 'YAKUREKI_PRINT_LAYOUT_MANIFEST';
    fieldEvidence: 'YAKUREKI_PRINT_FIELD_EVIDENCE';
    outputDir: 'YAKUREKI_PRINT_FIELD_OUTPUT_DIR';
    requiredDocuments: 'YAKUREKI_PRINT_REQUIRED_DOCUMENTS';
    dimensionTolerance: 'YAKUREKI_PRINT_DIMENSION_TOLERANCE_MM';
  };
}

export interface BuildPrintMediaFieldVerificationReviewInput {
  generatedAt?: Date;
  layoutManifest?: PrintLayoutRegressionManifestInput;
  fieldEvidence?: PrintMediaFieldEvidenceInput[];
  requiredDocumentIds?: PrintDocumentId[];
  dimensionToleranceMm?: number;
}

export interface PrintMediaDocumentReview {
  documentId: PrintDocumentId;
  title: string;
  status: PrintMediaVerificationStatus;
  statusLabel: string;
  screenshotCaptured: boolean;
  screenshotCaptureCount: number;
  fieldEvidenceRecorded: boolean;
  mediaType?: PrintMediaType;
  printerChecked: boolean;
  paperMatched: boolean;
  noClipping: boolean;
  textReadable: boolean;
  marginWithinTolerance: boolean;
  sizeWithinTolerance?: boolean;
  nextAction: string;
}

export interface PrintMediaFieldVerificationReview {
  type: 'yakureki-print-media-field-verification-review';
  schemaVersion: 1;
  generatedAt: string;
  status: PrintMediaVerificationStatus;
  statusLabel: string;
  requiredDocumentCount: number;
  screenshotDocumentCount: number;
  fieldEvidenceDocumentCount: number;
  passedDocumentCount: number;
  attentionDocumentCount: number;
  blockedDocumentCount: number;
  dimensionToleranceMm: number;
  privacy: {
    containsPatientData: false;
    containsLocalPath: false;
    containsScreenshotFileName: false;
    containsOperatorName: false;
    containsPrinterName: false;
    containsRawNotes: false;
  };
  evidenceIntegrity?: EvidenceIntegrityReview;
  documents: PrintMediaDocumentReview[];
}

const DEFAULT_REQUIRED_DOCUMENT_IDS: PrintDocumentId[] = [
  'dispensing_record',
  'receipt_statement',
  'receipt',
  'drug_info',
  'medicine_bag',
  'medicine_notebook_sticker',
  'liquid_label_sheet',
  'ointment_label_sheet'
];

const DOCUMENT_TITLES: Record<PrintDocumentId, string> = {
  dispensing_record: '調剤録',
  receipt_statement: '明細書',
  receipt: '領収証',
  drug_info: '薬剤情報',
  medicine_bag: '薬袋',
  medicine_notebook_sticker: 'お薬手帳シール',
  liquid_label_sheet: '水剤ラベル',
  ointment_label_sheet: '軟膏ラベル'
};

const LABEL_TO_DOCUMENT_ID: Record<string, PrintDocumentId> = {
  'dispensing-record': 'dispensing_record',
  'receipt-statement': 'receipt_statement',
  receipt: 'receipt',
  'drug-info': 'drug_info',
  'medicine-bag': 'medicine_bag',
  'medicine-notebook-sticker': 'medicine_notebook_sticker',
  'liquid-label-sheet': 'liquid_label_sheet',
  'ointment-label-sheet': 'ointment_label_sheet'
};

const DEFAULT_MEDIA_TYPE_BY_DOCUMENT: Record<PrintDocumentId, PrintMediaType> = {
  dispensing_record: 'a4',
  receipt_statement: 'a4',
  receipt: 'pdf',
  drug_info: 'a4',
  medicine_bag: 'medicine_bag',
  medicine_notebook_sticker: 'notebook_sticker',
  liquid_label_sheet: 'liquid_label',
  ointment_label_sheet: 'ointment_label'
};

const DEFAULT_DIMENSIONS_BY_DOCUMENT: Record<PrintDocumentId, { widthMm: number; heightMm: number }> = {
  dispensing_record: { widthMm: 210, heightMm: 297 },
  receipt_statement: { widthMm: 210, heightMm: 297 },
  receipt: { widthMm: 148, heightMm: 210 },
  drug_info: { widthMm: 210, heightMm: 297 },
  medicine_bag: { widthMm: 148, heightMm: 210 },
  medicine_notebook_sticker: { widthMm: 210, heightMm: 297 },
  liquid_label_sheet: { widthMm: 210, heightMm: 297 },
  ointment_label_sheet: { widthMm: 210, heightMm: 297 }
};

const STATUS_LABELS: Record<PrintMediaVerificationStatus, string> = {
  pass: 'OK',
  attention: '要確認',
  blocked: '未完了'
};

function statusLabel(status: PrintMediaVerificationStatus): string {
  return STATUS_LABELS[status];
}

function finitePositive(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function normalizeRequiredDocumentIds(value?: PrintDocumentId[]): PrintDocumentId[] {
  const ids = Array.isArray(value) && value.length > 0 ? value : DEFAULT_REQUIRED_DOCUMENT_IDS;
  return [...new Set(ids)];
}

function captureDocumentId(capture: PrintLayoutCaptureInput): PrintDocumentId | undefined {
  if (capture.label && LABEL_TO_DOCUMENT_ID[capture.label]) {
    return LABEL_TO_DOCUMENT_ID[capture.label];
  }
  const selector = capture.selector || '';
  for (const [label, id] of Object.entries(LABEL_TO_DOCUMENT_ID)) {
    if (selector.includes(label)) return id;
  }
  return undefined;
}

function buildCaptureCounts(manifest?: PrintLayoutRegressionManifestInput): Map<PrintDocumentId, number> {
  const counts = new Map<PrintDocumentId, number>();
  if (manifest?.ok !== true || !Array.isArray(manifest.captures)) {
    return counts;
  }
  for (const capture of manifest.captures) {
    const id = captureDocumentId(capture);
    const width = finitePositive(capture.width);
    const height = finitePositive(capture.height);
    const bytes = finitePositive(capture.bytes);
    if (!id || !width || !height || !bytes || width < 120 || height < 120 || bytes < 1000) {
      continue;
    }
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function latestEvidenceByDocument(
  evidence: PrintMediaFieldEvidenceInput[] = []
): Map<PrintDocumentId, PrintMediaFieldEvidenceInput> {
  const byDocument = new Map<PrintDocumentId, PrintMediaFieldEvidenceInput>();
  for (const item of evidence) {
    const previous = byDocument.get(item.documentId);
    if (!previous) {
      byDocument.set(item.documentId, item);
      continue;
    }
    const previousTime = Date.parse(previous.checkedAt || '');
    const nextTime = Date.parse(item.checkedAt || '');
    if (!Number.isFinite(previousTime) || (Number.isFinite(nextTime) && nextTime >= previousTime)) {
      byDocument.set(item.documentId, item);
    }
  }
  return byDocument;
}

function sizeWithinTolerance(
  evidence: PrintMediaFieldEvidenceInput | undefined,
  toleranceMm: number
): boolean | undefined {
  if (!evidence) return undefined;
  const expectedWidth = finitePositive(evidence.expectedWidthMm);
  const expectedHeight = finitePositive(evidence.expectedHeightMm);
  const measuredWidth = finitePositive(evidence.measuredWidthMm);
  const measuredHeight = finitePositive(evidence.measuredHeightMm);
  if (!expectedWidth || !expectedHeight || !measuredWidth || !measuredHeight) {
    return undefined;
  }
  return Math.abs(expectedWidth - measuredWidth) <= toleranceMm
    && Math.abs(expectedHeight - measuredHeight) <= toleranceMm;
}

function summarizeDocumentStatus(options: {
  screenshotCaptured: boolean;
  evidence?: PrintMediaFieldEvidenceInput;
  sizeOk?: boolean;
}): PrintMediaVerificationStatus {
  if (!options.screenshotCaptured) return 'blocked';
  if (!options.evidence) return 'attention';
  if (
    options.evidence.printerChecked !== true
    || options.evidence.paperMatched !== true
    || options.evidence.noClipping !== true
    || options.evidence.textReadable !== true
    || options.evidence.marginWithinTolerance !== true
    || options.evidence.operatorRecorded !== true
  ) {
    return 'attention';
  }
  if (options.sizeOk === false) return 'attention';
  return 'pass';
}

function nextActionForDocument(status: PrintMediaVerificationStatus, evidence?: PrintMediaFieldEvidenceInput): string {
  if (status === 'pass') return '対応不要';
  if (!evidence) return '実プリンタまたは実紙で印字確認を記録する';
  const actions: string[] = [];
  if (evidence.printerChecked !== true) actions.push('実プリンタで出力する');
  if (evidence.paperMatched !== true) actions.push('紙種またはラベル紙を実運用のものへ合わせる');
  if (evidence.noClipping !== true) actions.push('はみ出しや切れを修正する');
  if (evidence.textReadable !== true) actions.push('文字サイズと濃度を確認する');
  if (evidence.marginWithinTolerance !== true) actions.push('余白設定を調整する');
  if (evidence.operatorRecorded !== true) actions.push('確認者を記録する');
  return actions.length > 0 ? actions.join(' / ') : 'スクリーンショット回帰または寸法差を確認する';
}

function summarizeStatus(documents: PrintMediaDocumentReview[]): PrintMediaVerificationStatus {
  if (documents.some((document) => document.status === 'blocked')) return 'blocked';
  if (documents.some((document) => document.status === 'attention')) return 'attention';
  return 'pass';
}

function combineStatusWithEvidenceIntegrity(
  documentStatus: PrintMediaVerificationStatus,
  evidenceIntegrity?: EvidenceIntegrityReview
): PrintMediaVerificationStatus {
  if (evidenceIntegrity?.status === 'blocked' || documentStatus === 'blocked') return 'blocked';
  if (evidenceIntegrity?.status === 'attention' || documentStatus === 'attention') return 'attention';
  return 'pass';
}

export function buildPrintMediaFieldVerificationReview(
  input: BuildPrintMediaFieldVerificationReviewInput
): PrintMediaFieldVerificationReview {
  const generatedAt = input.generatedAt ?? new Date();
  const requiredDocumentIds = normalizeRequiredDocumentIds(input.requiredDocumentIds);
  const toleranceMm = finitePositive(input.dimensionToleranceMm) ?? 2;
  const captureCounts = buildCaptureCounts(input.layoutManifest);
  const evidenceByDocument = latestEvidenceByDocument(input.fieldEvidence);

  const documents = requiredDocumentIds.map((documentId): PrintMediaDocumentReview => {
    const evidence = evidenceByDocument.get(documentId);
    const screenshotCaptureCount = captureCounts.get(documentId) ?? 0;
    const screenshotCaptured = screenshotCaptureCount > 0;
    const sizeOk = sizeWithinTolerance(evidence, toleranceMm);
    const status = summarizeDocumentStatus({ screenshotCaptured, evidence, sizeOk });
    return {
      documentId,
      title: DOCUMENT_TITLES[documentId],
      status,
      statusLabel: statusLabel(status),
      screenshotCaptured,
      screenshotCaptureCount,
      fieldEvidenceRecorded: Boolean(evidence),
      mediaType: evidence?.mediaType,
      printerChecked: evidence?.printerChecked === true,
      paperMatched: evidence?.paperMatched === true,
      noClipping: evidence?.noClipping === true,
      textReadable: evidence?.textReadable === true,
      marginWithinTolerance: evidence?.marginWithinTolerance === true,
      sizeWithinTolerance: sizeOk,
      nextAction: nextActionForDocument(status, evidence)
    };
  });
  const evidenceIntegrity = (input.fieldEvidence?.length ?? 0) > 0
      ? buildEvidenceIntegrityReview({
        generatedAt,
        evidenceId: 'print-media-field-evidence',
        claimKind: 'print_media_field',
        evidence: { fieldEvidence: input.fieldEvidence },
        noPatientDataExpected: true,
        realWorldEvidenceRequired: true
      })
    : undefined;
  const status = combineStatusWithEvidenceIntegrity(summarizeStatus(documents), evidenceIntegrity);

  return {
    type: 'yakureki-print-media-field-verification-review',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel: status === 'pass' ? '実紙検証OK' : status === 'attention' ? '実紙検証を確認' : '実紙検証が未完了',
    requiredDocumentCount: documents.length,
    screenshotDocumentCount: documents.filter((document) => document.screenshotCaptured).length,
    fieldEvidenceDocumentCount: documents.filter((document) => document.fieldEvidenceRecorded).length,
    passedDocumentCount: documents.filter((document) => document.status === 'pass').length,
    attentionDocumentCount: documents.filter((document) => document.status === 'attention').length,
    blockedDocumentCount: documents.filter((document) => document.status === 'blocked').length,
    dimensionToleranceMm: toleranceMm,
    privacy: {
      containsPatientData: false,
      containsLocalPath: false,
      containsScreenshotFileName: false,
      containsOperatorName: false,
      containsPrinterName: false,
      containsRawNotes: false
    },
    evidenceIntegrity,
    documents
  };
}

export function buildPrintMediaFieldEvidenceTemplate(input: {
  generatedAt?: Date;
  requiredDocumentIds?: PrintDocumentId[];
} = {}): PrintMediaFieldEvidenceTemplate {
  const generatedAt = input.generatedAt ?? new Date();
  const requiredDocumentIds = normalizeRequiredDocumentIds(input.requiredDocumentIds);

  return {
    type: 'yakureki-print-media-field-evidence-template',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    privacy: {
      containsPatientData: false,
      containsLocalPath: false,
      containsScreenshotFileName: false,
      containsOperatorName: false,
      containsPrinterName: false,
      containsRawNotes: false
    },
    documents: requiredDocumentIds.map((documentId) => {
      const dimensions = DEFAULT_DIMENSIONS_BY_DOCUMENT[documentId];
      return {
        documentId,
        title: DOCUMENT_TITLES[documentId],
        mediaType: DEFAULT_MEDIA_TYPE_BY_DOCUMENT[documentId],
        checkedAt: '',
        operatorReviewId: '',
        sourceArtifactSha256: '',
        noPatientDataConfirmed: false,
        printerChecked: false,
        paperMatched: false,
        noClipping: false,
        textReadable: false,
        marginWithinTolerance: false,
        operatorRecorded: false,
        expectedWidthMm: dimensions.widthMm,
        expectedHeightMm: dimensions.heightMm,
        guidance: '実プリンタ・実紙で確認し、確認者名やプリンタ名はこのJSONに書かず院内記録へ残す'
      };
    })
  };
}

export function buildPrintMediaFieldCheckRequest(input: {
  generatedAt?: Date;
  requiredDocumentIds?: PrintDocumentId[];
  dimensionToleranceMm?: number;
} = {}): PrintMediaFieldCheckRequest {
  const generatedAt = input.generatedAt ?? new Date();
  const requiredDocumentIds = normalizeRequiredDocumentIds(input.requiredDocumentIds);
  const toleranceMm = finitePositive(input.dimensionToleranceMm) ?? 2;

  return {
    type: 'yakureki-print-media-field-check-request',
    schemaVersion: 1,
    generatedAt: generatedAt.toISOString(),
    guidance: '実プリンタ、実紙、PDF、ラベル紙で確認し、患者名、スクリーンショットファイル名、プリンタ名、確認者名、ローカルパスは共有成果物に入れず、判定と集計値だけを残します。',
    dimensionToleranceMm: toleranceMm,
    documents: requiredDocumentIds.map((documentId) => {
      const dimensions = DEFAULT_DIMENSIONS_BY_DOCUMENT[documentId];
      return {
        documentId,
        title: DOCUMENT_TITLES[documentId],
        mediaType: DEFAULT_MEDIA_TYPE_BY_DOCUMENT[documentId],
        required: true,
        expectedWidthMm: dimensions.widthMm,
        expectedHeightMm: dimensions.heightMm,
        requiredChecks: [
          '実プリンタまたはPDF出力で確認した',
          '実運用の紙種またはラベル紙で確認した',
          '文字切れ、はみ出し、印字欠けがない',
          '文字サイズと濃度が読める',
          '余白と貼付位置が実務で使える',
          `実測寸法が想定値から${toleranceMm}mm以内`
        ],
        storeOnly: '患者名、薬品名入りの実紙、スクリーンショットファイル名、プリンタ名、確認者名、ローカルパスは店舗内だけで扱う',
        supportShare: '帳票種別、紙種、確認済みフラグ、寸法差、未完了の次対応だけを共有する'
      };
    }),
    operatorChecks: [
      '調剤録、明細書、領収証、薬剤情報、薬袋、手帳シール、水剤ラベル、軟膏ラベルを対象にした',
      '長い薬品名、長い用法、長い患者名相当の紙面で確認した',
      '実プリンタまたは実PDF出力で、ブラウザのスクリーンショットだけにしていない',
      'ラベル紙は実運用で使う台紙と余白で確認した',
      '確認者とプリンタ名は店舗内記録に残し、共有成果物には入れていない'
    ],
    privacyRules: [
      '患者名、患者ID、薬品名入り原本をサポート共有成果物へ入れない',
      'スクリーンショットファイル名、ローカルパス、プリンタ名、確認者名を共有成果物へ入れない',
      '自由記述メモではなく、確認済みフラグ、件数、寸法差、次対応で共有する',
      'ダミー、モック、練習用紙を実紙検証として扱わない'
    ],
    commandEnvironment: {
      layoutManifest: 'YAKUREKI_PRINT_LAYOUT_MANIFEST',
      fieldEvidence: 'YAKUREKI_PRINT_FIELD_EVIDENCE',
      outputDir: 'YAKUREKI_PRINT_FIELD_OUTPUT_DIR',
      requiredDocuments: 'YAKUREKI_PRINT_REQUIRED_DOCUMENTS',
      dimensionTolerance: 'YAKUREKI_PRINT_DIMENSION_TOLERANCE_MM'
    }
  };
}

export function buildPrintMediaFieldCheckRequestChecklist(request: PrintMediaFieldCheckRequest): string {
  return [
    '帳票・実紙検証依頼',
    '目的: 患者さんに渡す帳票と職員が使うラベルを、実プリンタ・実紙で安全に使える状態にする',
    `寸法許容差: ${request.dimensionToleranceMm}mm`,
    '',
    '確認する帳票:',
    ...request.documents.map((document) => [
      `- ${document.title}: ${document.mediaType}`,
      `  想定寸法: ${document.expectedWidthMm}mm x ${document.expectedHeightMm}mm`,
      `  確認項目: ${document.requiredChecks.join('、')}`,
      `  店舗内だけで扱うもの: ${document.storeOnly}`,
      `  共有成果物に残すもの: ${document.supportShare}`
    ].join('\n')),
    '',
    '担当者確認:',
    ...request.operatorChecks.map((check) => `- ${check}`),
    '',
    '共有時のルール:',
    ...request.privacyRules.map((rule) => `- ${rule}`),
    '',
    'CLI入力環境変数:',
    `- レイアウトmanifest: ${request.commandEnvironment.layoutManifest}`,
    `- 実紙確認JSON: ${request.commandEnvironment.fieldEvidence}`,
    `- 出力先: ${request.commandEnvironment.outputDir}`,
    `- 対象帳票の絞り込み: ${request.commandEnvironment.requiredDocuments}`,
    `- 寸法許容差: ${request.commandEnvironment.dimensionTolerance}`
  ].join('\n');
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function yesNo(value: boolean | undefined): string {
  if (value === undefined) return '未記録';
  return value ? 'OK' : '要確認';
}

export function buildPrintMediaFieldVerificationCsv(
  review: PrintMediaFieldVerificationReview
): string {
  const rows = [
    ['区分', '判定', '帳票', 'スクリーンショット', '実紙確認', '紙種', '切れなし', '文字', '余白', '寸法', '次の対応'],
    [
      '総括',
      review.statusLabel,
      `${review.requiredDocumentCount}帳票中OK ${review.passedDocumentCount}帳票`,
      `${review.screenshotDocumentCount}帳票`,
      `${review.fieldEvidenceDocumentCount}帳票`,
      '患者情報なし / パスなし / スクリーンショットファイル名なし / プリンタ名なし / 確認者名なし',
      '',
      '',
      '',
      `許容差 ${review.dimensionToleranceMm}mm`,
      review.status === 'pass' ? '対応不要' : '未完了または要確認の帳票を実紙で確認する'
    ],
    ...(review.evidenceIntegrity ? [[
      '証跡品質',
      review.evidenceIntegrity.statusLabel,
      '実紙確認JSON',
      '取得日時 / 匿名確認ID / 元資料SHA-256 / 患者情報なし確認',
      `${review.evidenceIntegrity.issues.length}件`,
      review.evidenceIntegrity.realWorldEvidenceRequired ? '現物証跡が必要' : '任意確認',
      '',
      '',
      '',
      '',
      review.evidenceIntegrity.requiredActions.length > 0
        ? review.evidenceIntegrity.requiredActions.join(' / ')
        : '対応不要'
    ]] : []),
    ...review.documents.map((document) => [
      '帳票',
      document.statusLabel,
      document.title,
      document.screenshotCaptured ? `${document.screenshotCaptureCount}件` : '未確認',
      document.fieldEvidenceRecorded ? 'あり' : 'なし',
      document.mediaType ?? '未記録',
      yesNo(document.noClipping),
      yesNo(document.textReadable),
      yesNo(document.marginWithinTolerance),
      document.sizeWithinTolerance === undefined ? '未記録' : yesNo(document.sizeWithinTolerance),
      document.nextAction
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}
