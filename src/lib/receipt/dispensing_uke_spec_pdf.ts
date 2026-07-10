import {
  DISPENSING_UKE_KNOWN_RECORD_SPEC,
  DISPENSING_UKE_RECORD_SPEC_SOURCE,
  getDispensingUkeRecordDefinedFields,
  type DispensingUkeRecordFieldSpec,
  type DispensingUkeRecordSpec,
  type DispensingUkeRecordSpecSource
} from './dispensing_uke_validation';

export type DispensingUkeSpecificationPdfFieldMode =
  | '数字'
  | '英数'
  | '英数カナ'
  | '漢字'
  | 'カナ'
  | '年月'
  | '日付'
  | '時刻'
  | 'その他';

export interface DispensingUkeSpecificationPdfField {
  recordType: string;
  itemNumber: number;
  index: number;
  label: string;
  mode: DispensingUkeSpecificationPdfFieldMode;
  digits?: number;
  bytes?: number;
  required: boolean;
  sourceLine: string;
}

export interface DispensingUkeSpecificationPdfParseResult {
  source: DispensingUkeRecordSpecSource;
  recordTypes: string[];
  fields: DispensingUkeSpecificationPdfField[];
  issues: string[];
}

export type DispensingUkeSpecificationPdfFieldDefinitionStatus =
  | 'defined_key_field'
  | 'needs_definition';

export interface DispensingUkeSpecificationPdfFieldDefinitionItem {
  id: string;
  recordType: string;
  itemNumber: number;
  label: string;
  mode: DispensingUkeSpecificationPdfFieldMode;
  digits?: number;
  bytes?: number;
  required: boolean;
  status: DispensingUkeSpecificationPdfFieldDefinitionStatus;
  statusLabel: string;
  action: string;
  doneCriteria: string[];
  sourceLine: string;
}

export interface DispensingUkeSpecificationPdfFieldDefinitionReview {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  parsedFieldCount: number;
  definedFieldCount: number;
  needsDefinitionFieldCount: number;
  needsDefinitionRecordTypes: string[];
  items: DispensingUkeSpecificationPdfFieldDefinitionItem[];
  parseIssues: string[];
}

export type DispensingUkeSpecificationPdfAllFieldCompletionBlockerCode =
  | 'pdf_parse_issue'
  | 'missing_record_type'
  | 'remaining_field_definition'
  | 'review_count_mismatch';

export interface DispensingUkeSpecificationPdfAllFieldCompletionBlocker {
  code: DispensingUkeSpecificationPdfAllFieldCompletionBlockerCode;
  title: string;
  recordTypes: string[];
  message: string;
  nextAction: string;
}

export interface DispensingUkeSpecificationPdfAllFieldCompletionGate {
  ok: boolean;
  statusLabel: string;
  source: DispensingUkeRecordSpecSource;
  expectedRecordTypeCount: number;
  parsedRecordTypeCount: number;
  expectedRecordTypes: string[];
  parsedRecordTypes: string[];
  missingRecordTypes: string[];
  parsedFieldCount: number;
  definedFieldCount: number;
  remainingFieldCount: number;
  remainingRecordTypes: string[];
  parseIssueCount: number;
  blockerCount: number;
  blockers: DispensingUkeSpecificationPdfAllFieldCompletionBlocker[];
}

export type DispensingUkeSpecificationPdfFieldDefinitionImplementationPriority =
  | 'critical'
  | 'high'
  | 'medium';

export interface DispensingUkeSpecificationPdfFieldDefinitionImplementationTask {
  id: string;
  recordType: string;
  recordLabel: string;
  priority: DispensingUkeSpecificationPdfFieldDefinitionImplementationPriority;
  priorityLabel: string;
  implementationScope: DispensingUkeRecordSpec['implementationScope'] | 'unknown';
  fieldNumbers: number[];
  fieldLabel: string;
  requiredFieldCount: number;
  sourceItemIds: string[];
  evidenceLabel: string;
  title: string;
  implementationScopeText: string;
  acceptanceCriteria: string[];
  testFocus: string[];
}

export interface DispensingUkeSpecificationPdfFieldDefinitionImplementationPlan {
  readyForImplementation: boolean;
  source: DispensingUkeRecordSpecSource;
  taskCount: number;
  criticalTaskCount: number;
  highTaskCount: number;
  mediumTaskCount: number;
  taskRecordTypes: string[];
  criticalRecordTypes: string[];
  highRecordTypes: string[];
  mediumRecordTypes: string[];
  parseIssues: string[];
  tasks: DispensingUkeSpecificationPdfFieldDefinitionImplementationTask[];
}

export type DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressStatus =
  | 'unreviewed'
  | 'checking'
  | 'ready_to_define'
  | 'implemented'
  | 'blocked';

export interface DispensingUkeSpecificationPdfFieldDefinitionImplementationConfirmation {
  taskId: string;
  status: Exclude<DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressStatus, 'unreviewed'>;
  evidenceLabel: string;
  owner?: string;
  reviewedAt?: string;
  note?: string;
}

export interface DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressItem {
  id: string;
  recordType: string;
  recordLabel: string;
  priority: DispensingUkeSpecificationPdfFieldDefinitionImplementationPriority;
  priorityLabel: string;
  status: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressStatus;
  statusLabel: string;
  fieldLabel: string;
  evidenceLabel: string;
  owner: string;
  reviewedAt: string;
  note: string;
  blocksCriticalPath: boolean;
  readyForDefinition: boolean;
  implemented: boolean;
  nextAction: string;
}

export interface DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  totalCount: number;
  decidedCount: number;
  unreviewedCount: number;
  checkingCount: number;
  readyToDefineCount: number;
  implementedCount: number;
  blockedCount: number;
  criticalPathRecordTypes: string[];
  blockedCriticalPathRecordTypes: string[];
  readyToDefineRecordTypes: string[];
  implementedRecordTypes: string[];
  confirmationIssues: string[];
  items: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressItem[];
}

export interface DispensingUkeSpecificationPdfAllFieldDefinitionCandidate {
  id: string;
  taskId: string;
  recordType: string;
  itemNumber: number;
  label: string;
  required: boolean;
  sourceMode: DispensingUkeSpecificationPdfFieldMode;
  sourceDigits?: number;
  sourceBytes?: number;
  evidenceLabel: string;
  sourceLine: string;
  suggestedFieldSpec: DispensingUkeRecordFieldSpec;
}

export interface DispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  candidateCount: number;
  recordTypes: string[];
  candidates: DispensingUkeSpecificationPdfAllFieldDefinitionCandidate[];
  issues: string[];
}

export type DispensingUkeSpecificationPdfAllFieldDefinitionApplyItemStatus =
  | 'applied'
  | 'skipped_existing_definition'
  | 'skipped_unknown_record_type';

export interface DispensingUkeSpecificationPdfAllFieldDefinitionApplyItem {
  candidateId: string;
  taskId: string;
  recordType: string;
  itemNumber: number;
  label: string;
  status: DispensingUkeSpecificationPdfAllFieldDefinitionApplyItemStatus;
  statusLabel: string;
  reason: string;
  evidenceLabel: string;
  sourceLine: string;
  suggestedFieldSpec: DispensingUkeRecordFieldSpec;
}

export interface DispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  candidateCount: number;
  appliedCandidateCount: number;
  skippedCandidateCount: number;
  beforeNeedsDefinitionFieldCount: number;
  afterNeedsDefinitionFieldCount: number;
  resolvedFieldCount: number;
  resolvedRecordTypes: string[];
  remainingRecordTypes: string[];
  issues: string[];
  items: DispensingUkeSpecificationPdfAllFieldDefinitionApplyItem[];
  updatedSpecs: DispensingUkeRecordSpec[];
  afterReview: DispensingUkeSpecificationPdfFieldDefinitionReview;
}

export interface DispensingUkeSpecificationPdfAllFieldDefinitionPatchItem {
  recordType: string;
  recordLabel: string;
  appliedCandidateCount: number;
  itemNumbers: number[];
  candidateIds: string[];
  evidenceLabels: string[];
  addedFieldSpecs: DispensingUkeRecordFieldSpec[];
  fullAllFields: DispensingUkeRecordFieldSpec[];
}

export interface DispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  itemCount: number;
  appliedCandidateCount: number;
  skippedCandidateCount: number;
  recordTypes: string[];
  issues: string[];
  items: DispensingUkeSpecificationPdfAllFieldDefinitionPatchItem[];
}

export interface DispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionItem {
  id: string;
  recordType: string;
  recordLabel: string;
  priority: DispensingUkeSpecificationPdfFieldDefinitionImplementationPriority;
  priorityLabel: string;
  itemNumbers: number[];
  fieldLabel: string;
  remainingFieldCount: number;
  requiredFieldCount: number;
  nextAction: string;
  doneCriteria: string[];
  sourceLines: string[];
}

export interface DispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  remainingFieldCount: number;
  recordTypes: string[];
  criticalRecordTypes: string[];
  highRecordTypes: string[];
  mediumRecordTypes: string[];
  issues: string[];
  items: DispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionItem[];
}

export interface DispensingUkeSpecificationPdfKeyFieldIssue {
  recordType: string;
  itemNumber: number;
  label: string;
  field: 'missing' | 'label' | 'format' | 'length' | 'required';
  expected: string | number | boolean;
  observed: string | number | boolean;
}

export type DispensingUkeSpecificationPdfRecordCoverageStatus =
  | 'covered'
  | 'definition_narrower'
  | 'pdf_missing';

export interface DispensingUkeSpecificationPdfRecordCoverage {
  recordType: string;
  label: string;
  status: DispensingUkeSpecificationPdfRecordCoverageStatus;
  parsedFieldCount: number;
  maxPdfItemNumber: number;
  currentMinFieldCount: number;
  missingItemNumbers: number[];
  extraPdfItemNumbers: number[];
}

export interface DispensingUkeSpecificationPdfFieldReview {
  ok: boolean;
  source: DispensingUkeRecordSpecSource;
  expectedRecordTypes: string[];
  parsedRecordTypes: string[];
  parsedFieldCount: number;
  expectedKeyFieldCount: number;
  matchedKeyFieldCount: number;
  missingRecordTypes: string[];
  recordCoverages: DispensingUkeSpecificationPdfRecordCoverage[];
  definitionNarrowerRecordTypes: string[];
  keyFieldIssues: DispensingUkeSpecificationPdfKeyFieldIssue[];
  parseIssues: string[];
}

export interface DispensingUkeSpecificationPdfAllFieldImplementationPack {
  source: DispensingUkeRecordSpecSource;
  parseResult: DispensingUkeSpecificationPdfParseResult;
  definitionReview: DispensingUkeSpecificationPdfFieldDefinitionReview;
  completionGate: DispensingUkeSpecificationPdfAllFieldCompletionGate;
  implementationPlan: DispensingUkeSpecificationPdfFieldDefinitionImplementationPlan;
  progressReview: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview;
  candidateReport: DispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport;
  applyPreview: DispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview;
  patchPlan: DispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan;
  remainingActionReport: DispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport;
}

const MODE_PATTERN = '(英数カナ|数字|英数|漢字|カナ|年月|日付|時刻|その他)';
const REQUIRED_PATTERN = '(必須|任意|省略可|省略|○|△|×)';
const FIELD_DEFINITION_IMPLEMENTATION_PRIORITY_LABELS: Record<DispensingUkeSpecificationPdfFieldDefinitionImplementationPriority, string> = {
  critical: '最優先',
  high: '高',
  medium: '中'
};
const FIELD_DEFINITION_IMPLEMENTATION_PROGRESS_STATUS_LABELS: Record<DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressStatus, string> = {
  unreviewed: '未確認',
  checking: '確認中',
  ready_to_define: '定義追加準備',
  implemented: '実装済み',
  blocked: '保留'
};

function normalizePdfLine(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/英数カナ/g, '英数カナ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function compactLabel(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/英数カナ/g, '英数カナ');
}

function findRecordTypeInHeader(line: string, specs: DispensingUkeRecordSpec[]): string | null {
  if (!line.includes('レコード')) return null;
  return specs.find((spec) => (
    new RegExp(`(?:^|[^A-Z])${spec.type}(?:[^A-Z]|$)`).test(line)
    || line.includes(spec.label)
  ))?.type ?? null;
}

function parseRequired(value: string | undefined): boolean {
  if (!value) return false;
  return value === '必須' || value === '○';
}

function parseFieldLine(
  line: string,
  recordType: string
): DispensingUkeSpecificationPdfField | null {
  const match = line.match(new RegExp(`^(\\d{1,3})\\s*(.*?)\\s*${MODE_PATTERN}\\s*([\\d０-９]+)?(?:\\s+([\\d０-９]+))?(?:\\s*${REQUIRED_PATTERN})?`));
  if (!match) return null;

  const itemNumber = Number.parseInt(match[1], 10);
  const label = compactLabel(match[2]);
  if (!Number.isInteger(itemNumber) || itemNumber <= 0 || !label) return null;

  const digits = match[4] ? Number.parseInt(match[4].normalize('NFKC'), 10) : undefined;
  const bytes = match[5] ? Number.parseInt(match[5].normalize('NFKC'), 10) : undefined;

  return {
    recordType,
    itemNumber,
    index: itemNumber - 1,
    label,
    mode: match[3] as DispensingUkeSpecificationPdfFieldMode,
    digits: Number.isFinite(digits) ? digits : undefined,
    bytes: Number.isFinite(bytes) ? bytes : undefined,
    required: parseRequired(match[6]),
    sourceLine: line
  };
}

function pdfModeToFieldFormat(
  mode: DispensingUkeSpecificationPdfFieldMode
): DispensingUkeRecordFieldSpec['format'] {
  if (mode === '数字') return 'digits';
  if (mode === '年月') return 'month';
  if (mode === '日付') return 'date';
  if (mode === '時刻') return 'timestamp';
  return 'text';
}

function sameLabel(expected: string, observed: string): boolean {
  const expectedLabel = compactLabel(expected);
  const observedLabel = compactLabel(observed);
  return expectedLabel === observedLabel
    || expectedLabel.includes(observedLabel)
    || observedLabel.includes(expectedLabel);
}

function sameFormat(
  expected: DispensingUkeRecordFieldSpec['format'],
  observedMode: DispensingUkeSpecificationPdfFieldMode
): boolean {
  const observed = pdfModeToFieldFormat(observedMode);
  if (expected === observed) return true;
  if (expected === 'flag' || expected === 'percent' || expected === 'number') {
    return observed === 'digits';
  }
  return false;
}

function rangeInclusive(start: number, end: number): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value++) {
    values.push(value);
  }
  return values;
}

function numberArrayDiff(left: number[], right: Set<number>): number[] {
  return left.filter((value) => !right.has(value));
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function formatNumberList(values: number[]): string {
  return values.join(' / ');
}

function formatRecordCoverageStatus(
  status: DispensingUkeSpecificationPdfRecordCoverageStatus
): string {
  switch (status) {
    case 'covered':
      return '確認済み';
    case 'definition_narrower':
      return 'PDF側の項目が多い';
    case 'pdf_missing':
      return 'PDF本文から未抽出';
  }
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function buildSpecMap(
  specs: DispensingUkeRecordSpec[]
): Map<string, DispensingUkeRecordSpec> {
  return new Map(specs.map((spec) => [spec.type, spec]));
}

function buildDefinedFieldMap(
  specs: DispensingUkeRecordSpec[]
): Map<string, DispensingUkeRecordFieldSpec> {
  const definedFields = new Map<string, DispensingUkeRecordFieldSpec>();
  for (const spec of specs) {
    for (const field of getDispensingUkeRecordDefinedFields(spec)) {
      definedFields.set(`${spec.type}:${field.index + 1}`, field);
    }
  }
  return definedFields;
}

function fieldDefinitionImplementationPriorityRank(
  priority: DispensingUkeSpecificationPdfFieldDefinitionImplementationPriority
): number {
  switch (priority) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
  }
}

function pickFieldDefinitionImplementationPriority(
  items: DispensingUkeSpecificationPdfFieldDefinitionItem[],
  spec: DispensingUkeRecordSpec | undefined
): DispensingUkeSpecificationPdfFieldDefinitionImplementationPriority {
  const hasRequiredField = items.some((item) => item.required);
  if (spec?.implementationScope === 'always' || (spec?.required && hasRequiredField)) {
    return 'critical';
  }
  if (hasRequiredField || spec?.implementationScope === 'conditional') {
    return 'high';
  }
  return 'medium';
}

function formatImplementationScopeText(
  scope: DispensingUkeRecordSpec['implementationScope'] | 'unknown'
): string {
  switch (scope) {
    case 'always':
      return '常時生成';
    case 'conditional':
      return '条件付き生成';
    case 'official_sample_validation':
      return '公式サンプル検証';
    case 'unknown':
      return '仕様点検表未定義';
  }
}

function formatFieldDefinitionFieldLabel(
  items: DispensingUkeSpecificationPdfFieldDefinitionItem[]
): string {
  const sortedItems = [...items].sort((left, right) => left.itemNumber - right.itemNumber);
  if (sortedItems.length <= 4) {
    return sortedItems.map((item) => `第${item.itemNumber}項目: ${item.label}`).join(' / ');
  }
  return `第${sortedItems[0].itemNumber}項目ほか${sortedItems.length - 1}項目`;
}

function buildFieldDefinitionImplementationTask(
  recordType: string,
  items: DispensingUkeSpecificationPdfFieldDefinitionItem[],
  spec: DispensingUkeRecordSpec | undefined
): DispensingUkeSpecificationPdfFieldDefinitionImplementationTask {
  const priority = pickFieldDefinitionImplementationPriority(items, spec);
  const fieldNumbers = items.map((item) => item.itemNumber).sort((left, right) => left - right);
  const implementationScope = spec?.implementationScope ?? 'unknown';
  const fieldLabel = formatFieldDefinitionFieldLabel(items);

  return {
    id: `${recordType}-pdf-field-definition-implementation`,
    recordType,
    recordLabel: spec?.label ?? recordType,
    priority,
    priorityLabel: FIELD_DEFINITION_IMPLEMENTATION_PRIORITY_LABELS[priority],
    implementationScope,
    fieldNumbers,
    fieldLabel,
    requiredFieldCount: items.filter((item) => item.required).length,
    sourceItemIds: sortedUnique(items.map((item) => item.id)),
    evidenceLabel: `${recordType} PDF本文 第${fieldNumbers.join('・')}項目`,
    title: `${recordType}全項目定義追加`,
    implementationScopeText: formatImplementationScopeText(implementationScope),
    acceptanceCriteria: [
      `${recordType}の${fieldLabel}を主要項目定義または全項目定義に追加する`,
      `${recordType}の項目順、桁数、必須条件、空欄許容をテストで確認する`,
      'PDF本文全項目定義レビューで対象項目が要定義から消える',
      '患者情報なしのUKE回帰テストで後退していない'
    ],
    testFocus: items.map((item) => (
      `${item.id}: ${item.label} ${item.mode}${item.digits ? ` ${item.digits}桁` : ''}${item.required ? ' 必須' : ' 任意'}`
    ))
  };
}

function isFieldDefinitionImplementationCriticalPathPriority(
  priority: DispensingUkeSpecificationPdfFieldDefinitionImplementationPriority
): boolean {
  return priority === 'critical' || priority === 'high';
}

function isFieldDefinitionImplementationPendingStatus(
  status: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressStatus
): boolean {
  return status === 'unreviewed' || status === 'checking' || status === 'blocked';
}

function buildFieldDefinitionImplementationNextAction(
  status: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressStatus
): string {
  switch (status) {
    case 'unreviewed':
      return 'PDF本文根拠、実装範囲、担当を確認してください。';
    case 'checking':
      return '根拠と実装方針を確認し、定義追加準備または保留に進めてください。';
    case 'ready_to_define':
      return '全項目定義、生成/検証処理、テストへ反映してください。';
    case 'implemented':
      return '回帰テストと監査証跡を維持してください。';
    case 'blocked':
      return '保留理由を解消し、再確認日を決めてください。';
  }
}

function shouldCarryPdfDigitsAsFieldLength(
  mode: DispensingUkeSpecificationPdfFieldMode
): boolean {
  return mode === '数字' || mode === '年月' || mode === '日付' || mode === '時刻';
}

function buildSuggestedFieldSpecFromPdfField(
  field: DispensingUkeSpecificationPdfFieldDefinitionItem
): DispensingUkeRecordFieldSpec {
  const lengths = field.digits && shouldCarryPdfDigitsAsFieldLength(field.mode)
    ? [field.digits]
    : undefined;

  return {
    index: field.itemNumber - 1,
    label: field.label,
    required: field.required,
    format: pdfModeToFieldFormat(field.mode),
    ...(lengths ? { lengths } : {})
  };
}

function tsStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function formatFieldSpecTypeScriptLiteral(field: DispensingUkeRecordFieldSpec): string {
  const parts = [
    `index: ${field.index}`,
    `label: ${tsStringLiteral(field.label)}`,
    `required: ${field.required}`,
    `format: ${tsStringLiteral(field.format)}`
  ];
  if (field.lengths && field.lengths.length > 0) {
    parts.push(`lengths: [${field.lengths.join(', ')}]`);
  }
  return `{ ${parts.join(', ')} }`;
}

function formatAllFieldDefinitionApplyItemStatus(
  status: DispensingUkeSpecificationPdfAllFieldDefinitionApplyItemStatus
): string {
  switch (status) {
    case 'applied':
      return '適用予定';
    case 'skipped_existing_definition':
      return '定義済みのためスキップ';
    case 'skipped_unknown_record_type':
      return '未登録レコードのためスキップ';
  }
}

function applyAllFieldDefinitionCandidatesToSpecs(
  specs: DispensingUkeRecordSpec[],
  candidates: DispensingUkeSpecificationPdfAllFieldDefinitionCandidate[]
): {
  specs: DispensingUkeRecordSpec[];
  appliedCount: number;
  skippedCount: number;
  issues: string[];
  items: DispensingUkeSpecificationPdfAllFieldDefinitionApplyItem[];
} {
  const specsByRecordType = buildSpecMap(specs);
  const definedIndexesByRecordType = new Map<string, Set<number>>();
  const additionsByRecordType = new Map<string, DispensingUkeRecordFieldSpec[]>();
  const issues: string[] = [];
  const items: DispensingUkeSpecificationPdfAllFieldDefinitionApplyItem[] = [];
  let appliedCount = 0;
  let skippedCount = 0;

  for (const candidate of candidates) {
    const spec = specsByRecordType.get(candidate.recordType);
    if (!spec) {
      const reason = `${candidate.recordType}は現在の仕様点検表にありません。`;
      issues.push(reason);
      skippedCount++;
      items.push({
        candidateId: candidate.id,
        taskId: candidate.taskId,
        recordType: candidate.recordType,
        itemNumber: candidate.itemNumber,
        label: candidate.label,
        status: 'skipped_unknown_record_type',
        statusLabel: formatAllFieldDefinitionApplyItemStatus('skipped_unknown_record_type'),
        reason,
        evidenceLabel: candidate.evidenceLabel,
        sourceLine: candidate.sourceLine,
        suggestedFieldSpec: candidate.suggestedFieldSpec
      });
      continue;
    }

    const definedIndexes = definedIndexesByRecordType.get(spec.type)
      ?? new Set(getDispensingUkeRecordDefinedFields(spec).map((field) => field.index));
    definedIndexesByRecordType.set(spec.type, definedIndexes);
    if (definedIndexes.has(candidate.suggestedFieldSpec.index)) {
      const reason = `${candidate.recordType}第${candidate.itemNumber}項目は仕様点検表に定義済みです。`;
      skippedCount++;
      items.push({
        candidateId: candidate.id,
        taskId: candidate.taskId,
        recordType: candidate.recordType,
        itemNumber: candidate.itemNumber,
        label: candidate.label,
        status: 'skipped_existing_definition',
        statusLabel: formatAllFieldDefinitionApplyItemStatus('skipped_existing_definition'),
        reason,
        evidenceLabel: candidate.evidenceLabel,
        sourceLine: candidate.sourceLine,
        suggestedFieldSpec: candidate.suggestedFieldSpec
      });
      continue;
    }

    const additions = additionsByRecordType.get(spec.type) ?? [];
    additions.push(candidate.suggestedFieldSpec);
    additionsByRecordType.set(spec.type, additions);
    definedIndexes.add(candidate.suggestedFieldSpec.index);
    appliedCount++;
    items.push({
      candidateId: candidate.id,
      taskId: candidate.taskId,
      recordType: candidate.recordType,
      itemNumber: candidate.itemNumber,
      label: candidate.label,
      status: 'applied',
      statusLabel: formatAllFieldDefinitionApplyItemStatus('applied'),
      reason: `${candidate.recordType}第${candidate.itemNumber}項目を全項目定義へ追加します。`,
      evidenceLabel: candidate.evidenceLabel,
      sourceLine: candidate.sourceLine,
      suggestedFieldSpec: candidate.suggestedFieldSpec
    });
  }

  const updatedSpecs = specs.map((spec) => {
    const additions = additionsByRecordType.get(spec.type) ?? [];
    if (additions.length === 0) return spec;

    return {
      ...spec,
      allFields: [
        ...(spec.allFields ?? []),
        ...additions
      ].sort((left, right) => left.index - right.index)
    };
  });

  return {
    specs: updatedSpecs,
    appliedCount,
    skippedCount,
    issues,
    items
  };
}

function formatFieldDefinitionStatus(
  status: DispensingUkeSpecificationPdfFieldDefinitionStatus
): string {
  switch (status) {
    case 'defined_key_field':
      return '主要項目定義済み';
    case 'needs_definition':
      return '全項目定義が必要';
  }
}

function buildFieldDefinitionItem(
  field: DispensingUkeSpecificationPdfField,
  hasKeyFieldDefinition: boolean
): DispensingUkeSpecificationPdfFieldDefinitionItem {
  const status: DispensingUkeSpecificationPdfFieldDefinitionStatus = hasKeyFieldDefinition
    ? 'defined_key_field'
    : 'needs_definition';

  return {
    id: `${field.recordType}-${field.itemNumber}`,
    recordType: field.recordType,
    itemNumber: field.itemNumber,
    label: field.label,
    mode: field.mode,
    digits: field.digits,
    bytes: field.bytes,
    required: field.required,
    status,
    statusLabel: formatFieldDefinitionStatus(status),
    action: hasKeyFieldDefinition
      ? `${field.recordType}第${field.itemNumber}項目は主要項目として定義済みです。PDF本文との突合を継続してください。`
      : `${field.recordType}第${field.itemNumber}項目の値の出し方、必須条件、桁数チェックを実装定義に追加してください。`,
    doneCriteria: hasKeyFieldDefinition
      ? [
        '主要項目レビューで位置、形式、桁数、必須条件が一致する',
        '生成UKEまたは公式サンプル検証で後退していない'
      ]
      : [
        `${field.recordType}第${field.itemNumber}項目の値の出し方を決めた`,
        `${field.recordType}第${field.itemNumber}項目の桁数、必須条件、空欄許容をテストに追加した`,
        'PDF本文全項目定義レビューから要定義が消えた'
      ],
    sourceLine: field.sourceLine
  };
}

function buildRecordCoverage(
  spec: DispensingUkeRecordSpec,
  fields: DispensingUkeSpecificationPdfField[]
): DispensingUkeSpecificationPdfRecordCoverage {
  if (fields.length === 0) {
    return {
      recordType: spec.type,
      label: spec.label,
      status: 'pdf_missing',
      parsedFieldCount: 0,
      maxPdfItemNumber: 0,
      currentMinFieldCount: spec.minFields,
      missingItemNumbers: rangeInclusive(1, spec.minFields),
      extraPdfItemNumbers: []
    };
  }

  const pdfItemNumbers = new Set(fields.map((field) => field.itemNumber));
  const maxPdfItemNumber = Math.max(...fields.map((field) => field.itemNumber));
  const currentItemNumbers = rangeInclusive(1, spec.minFields);
  const pdfItemNumberList = rangeInclusive(1, maxPdfItemNumber);

  return {
    recordType: spec.type,
    label: spec.label,
    status: maxPdfItemNumber > spec.minFields ? 'definition_narrower' : 'covered',
    parsedFieldCount: fields.length,
    maxPdfItemNumber,
    currentMinFieldCount: spec.minFields,
    missingItemNumbers: numberArrayDiff(currentItemNumbers, pdfItemNumbers),
    extraPdfItemNumbers: pdfItemNumberList.filter((itemNumber) => itemNumber > spec.minFields && pdfItemNumbers.has(itemNumber))
  };
}

export function buildDispensingUkeSpecificationPdfFieldDefinitionReview(
  parseResult: DispensingUkeSpecificationPdfParseResult,
  expectedSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_KNOWN_RECORD_SPEC
): DispensingUkeSpecificationPdfFieldDefinitionReview {
  const definedFields = buildDefinedFieldMap(expectedSpecs);
  const items = parseResult.fields.map((field) => (
    buildFieldDefinitionItem(field, definedFields.has(`${field.recordType}:${field.itemNumber}`))
  ));
  const needsDefinitionItems = items.filter((item) => item.status === 'needs_definition');

  return {
    ok: parseResult.issues.length === 0 && needsDefinitionItems.length === 0,
    source: parseResult.source,
    parsedFieldCount: parseResult.fields.length,
    definedFieldCount: items.filter((item) => item.status === 'defined_key_field').length,
    needsDefinitionFieldCount: needsDefinitionItems.length,
    needsDefinitionRecordTypes: sortedUnique(needsDefinitionItems.map((item) => item.recordType)),
    items,
    parseIssues: [...parseResult.issues]
  };
}

export function buildDispensingUkeSpecificationPdfAllFieldCompletionGate(
  parseResult: DispensingUkeSpecificationPdfParseResult,
  definitionReview: DispensingUkeSpecificationPdfFieldDefinitionReview,
  expectedSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_KNOWN_RECORD_SPEC
): DispensingUkeSpecificationPdfAllFieldCompletionGate {
  const expectedRecordTypes = expectedSpecs.map((spec) => spec.type);
  const parsedRecordTypeSet = new Set(parseResult.recordTypes);
  const parsedRecordTypes = expectedRecordTypes.filter((recordType) => parsedRecordTypeSet.has(recordType));
  const missingRecordTypes = expectedRecordTypes.filter((recordType) => !parsedRecordTypeSet.has(recordType));
  const blockers: DispensingUkeSpecificationPdfAllFieldCompletionBlocker[] = [];

  if (parseResult.issues.length > 0) {
    blockers.push({
      code: 'pdf_parse_issue',
      title: 'PDF本文の読取確認が残っています',
      recordTypes: [],
      message: `${parseResult.issues.length}件の読取確認があります。${parseResult.issues.slice(0, 2).join(' ')}`,
      nextAction: 'PDFから取り出した文字、またはOCRした文字を見直し、読取問題を解消してください。'
    });
  }

  if (missingRecordTypes.length > 0) {
    blockers.push({
      code: 'missing_record_type',
      title: 'PDF本文から抽出できていないレコードがあります',
      recordTypes: missingRecordTypes,
      message: `対象 ${expectedRecordTypes.length}種別のうち ${missingRecordTypes.join('・')} を抽出できていません。`,
      nextAction: '該当レコードの見出しと項目表がPDF本文抽出に含まれるか確認してください。'
    });
  }

  if (definitionReview.needsDefinitionFieldCount > 0) {
    blockers.push({
      code: 'remaining_field_definition',
      title: '全項目定義へ未反映の項目があります',
      recordTypes: [...definitionReview.needsDefinitionRecordTypes],
      message: `${definitionReview.needsDefinitionFieldCount}項目が全項目定義へ未反映です。`,
      nextAction: '残対応CSVに従い、項目順、形式、桁数、必須条件、空欄許容を確認して定義へ追加してください。'
    });
  }

  if (definitionReview.parsedFieldCount !== parseResult.fields.length
    || definitionReview.definedFieldCount + definitionReview.needsDefinitionFieldCount !== definitionReview.parsedFieldCount) {
    blockers.push({
      code: 'review_count_mismatch',
      title: '全項目レビューの集計が一致しません',
      recordTypes: [],
      message: `PDF抽出 ${parseResult.fields.length}項目、レビュー ${definitionReview.parsedFieldCount}項目、定義済みと残対応の合計 ${definitionReview.definedFieldCount + definitionReview.needsDefinitionFieldCount}項目です。`,
      nextAction: 'PDF抽出結果と全項目定義レビューを同じ入力・同じ仕様点検表で再作成してください。'
    });
  }

  return {
    ok: blockers.length === 0,
    statusLabel: blockers.length === 0 ? '完了' : '未完了',
    source: parseResult.source,
    expectedRecordTypeCount: expectedRecordTypes.length,
    parsedRecordTypeCount: parsedRecordTypes.length,
    expectedRecordTypes,
    parsedRecordTypes,
    missingRecordTypes,
    parsedFieldCount: parseResult.fields.length,
    definedFieldCount: definitionReview.definedFieldCount,
    remainingFieldCount: definitionReview.needsDefinitionFieldCount,
    remainingRecordTypes: [...definitionReview.needsDefinitionRecordTypes],
    parseIssueCount: parseResult.issues.length,
    blockerCount: blockers.length,
    blockers
  };
}

export function buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv(
  gate: DispensingUkeSpecificationPdfAllFieldCompletionGate
): string {
  const blockerRows = gate.blockers.length > 0
    ? gate.blockers.map((blocker) => [
      gate.source.label,
      gate.statusLabel,
      gate.expectedRecordTypeCount,
      gate.parsedRecordTypeCount,
      gate.parsedFieldCount,
      gate.definedFieldCount,
      gate.remainingFieldCount,
      blocker.code,
      blocker.recordTypes.join('・'),
      blocker.title,
      blocker.message,
      blocker.nextAction
    ])
    : [[
      gate.source.label,
      gate.statusLabel,
      gate.expectedRecordTypeCount,
      gate.parsedRecordTypeCount,
      gate.parsedFieldCount,
      gate.definedFieldCount,
      gate.remainingFieldCount,
      'complete',
      '',
      '全項目突合の完了条件を満たしています',
      '対象レコード、PDF読取、全項目定義の確認が完了しています。',
      '仕様改定時に同じゲートを再実行してください。'
    ]];
  const rows = [
    ['出典', '判定', '対象レコード数', '抽出レコード数', '抽出項目数', '定義済み項目数', '残項目数', 'コード', '対象レコード', '確認内容', '詳細', '次の対応'],
    ...blockerRows
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatDispensingUkeSpecificationPdfAllFieldCompletionGate(
  gate: DispensingUkeSpecificationPdfAllFieldCompletionGate
): string {
  const missingText = gate.missingRecordTypes.length > 0
    ? ` / 未抽出 ${gate.missingRecordTypes.join('・')}`
    : '';
  const remainingText = gate.remainingRecordTypes.length > 0
    ? ` / 未定義 ${gate.remainingRecordTypes.join('・')}`
    : '';
  const blockerText = gate.blockers.length > 0
    ? ` / 停止理由 ${gate.blockers.map((blocker) => blocker.title).join('・')}`
    : '';

  return `${gate.source.label} PDF本文全項目突合 完了ゲート: ${gate.statusLabel} / レコード ${gate.parsedRecordTypeCount}/${gate.expectedRecordTypeCount} / 項目 ${gate.definedFieldCount}/${gate.parsedFieldCount} / 残 ${gate.remainingFieldCount}${missingText}${remainingText}${blockerText}`;
}

export function buildDispensingUkeSpecificationPdfFieldDefinitionReviewCsv(
  review: DispensingUkeSpecificationPdfFieldDefinitionReview
): string {
  const rows = [
    ['出典', 'ID', 'レコード種別', '項番', '項目名', '判定', 'モード', '桁数', 'バイト数', '必須', '次の対応', '完了条件', 'PDF本文行'],
    ...review.items.map((item) => [
      review.source.label,
      item.id,
      item.recordType,
      item.itemNumber,
      item.label,
      item.statusLabel,
      item.mode,
      item.digits ?? '',
      item.bytes ?? '',
      item.required ? '必須' : '任意',
      item.action,
      item.doneCriteria.join(' / '),
      item.sourceLine
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan(
  review: DispensingUkeSpecificationPdfFieldDefinitionReview,
  expectedSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_KNOWN_RECORD_SPEC
): DispensingUkeSpecificationPdfFieldDefinitionImplementationPlan {
  const specsByRecordType = buildSpecMap(expectedSpecs);
  const itemsByRecordType = new Map<string, DispensingUkeSpecificationPdfFieldDefinitionItem[]>();

  for (const item of review.items.filter((reviewItem) => reviewItem.status === 'needs_definition')) {
    const items = itemsByRecordType.get(item.recordType) ?? [];
    items.push(item);
    itemsByRecordType.set(item.recordType, items);
  }

  const tasks = Array.from(itemsByRecordType.entries())
    .map(([recordType, items]) => buildFieldDefinitionImplementationTask(recordType, items, specsByRecordType.get(recordType)))
    .sort((left, right) => {
      const leftSpec = specsByRecordType.get(left.recordType);
      const rightSpec = specsByRecordType.get(right.recordType);
      return fieldDefinitionImplementationPriorityRank(left.priority) - fieldDefinitionImplementationPriorityRank(right.priority)
        || (leftSpec?.orderStage ?? 99) - (rightSpec?.orderStage ?? 99)
        || left.recordType.localeCompare(right.recordType);
    });

  return {
    readyForImplementation: tasks.length > 0 && review.parseIssues.length === 0,
    source: review.source,
    taskCount: tasks.length,
    criticalTaskCount: tasks.filter((task) => task.priority === 'critical').length,
    highTaskCount: tasks.filter((task) => task.priority === 'high').length,
    mediumTaskCount: tasks.filter((task) => task.priority === 'medium').length,
    taskRecordTypes: tasks.map((task) => task.recordType),
    criticalRecordTypes: tasks.filter((task) => task.priority === 'critical').map((task) => task.recordType),
    highRecordTypes: tasks.filter((task) => task.priority === 'high').map((task) => task.recordType),
    mediumRecordTypes: tasks.filter((task) => task.priority === 'medium').map((task) => task.recordType),
    parseIssues: [...review.parseIssues],
    tasks
  };
}

export function buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlanCsv(
  plan: DispensingUkeSpecificationPdfFieldDefinitionImplementationPlan
): string {
  const rows = [
    ['出典', 'ID', '優先度', 'レコード種別', 'レコード名', '実装範囲', '対象項目', '必須項目数', '根拠', '実装項目', '完了条件', 'テスト観点'],
    ...plan.tasks.map((task) => [
      plan.source.label,
      task.id,
      task.priorityLabel,
      task.recordType,
      task.recordLabel,
      task.implementationScopeText,
      task.fieldLabel,
      task.requiredFieldCount,
      task.evidenceLabel,
      task.title,
      task.acceptanceCriteria.join(' / '),
      task.testFocus.join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview(
  plan: DispensingUkeSpecificationPdfFieldDefinitionImplementationPlan,
  confirmations: DispensingUkeSpecificationPdfFieldDefinitionImplementationConfirmation[] = []
): DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview {
  const taskIds = new Set(plan.tasks.map((task) => task.id));
  const confirmationByTaskId = new Map<string, DispensingUkeSpecificationPdfFieldDefinitionImplementationConfirmation>();
  const confirmationIssues = plan.parseIssues.map((issue) => `PDF本文読取確認: ${issue}`);

  for (const confirmation of confirmations) {
    if (!taskIds.has(confirmation.taskId)) {
      confirmationIssues.push(`${confirmation.taskId}は現在の実装計画にありません。`);
      continue;
    }
    if (confirmationByTaskId.has(confirmation.taskId)) {
      confirmationIssues.push(`${confirmation.taskId}の確認結果が重複しています。`);
    }
    confirmationByTaskId.set(confirmation.taskId, confirmation);
  }

  const items = plan.tasks.map<DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressItem>((task) => {
    const confirmation = confirmationByTaskId.get(task.id);
    const evidenceLabel = confirmation?.evidenceLabel.trim() || '';
    const status: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressStatus = confirmation
      ? (evidenceLabel ? confirmation.status : 'checking')
      : 'unreviewed';
    if (confirmation && !evidenceLabel) {
      confirmationIssues.push(`${task.id}の根拠が未入力です。`);
    }
    const blocksCriticalPath = isFieldDefinitionImplementationCriticalPathPriority(task.priority)
      && isFieldDefinitionImplementationPendingStatus(status);

    return {
      id: task.id,
      recordType: task.recordType,
      recordLabel: task.recordLabel,
      priority: task.priority,
      priorityLabel: task.priorityLabel,
      status,
      statusLabel: FIELD_DEFINITION_IMPLEMENTATION_PROGRESS_STATUS_LABELS[status],
      fieldLabel: task.fieldLabel,
      evidenceLabel,
      owner: confirmation?.owner || '',
      reviewedAt: confirmation?.reviewedAt || '',
      note: confirmation?.note || '',
      blocksCriticalPath,
      readyForDefinition: status === 'ready_to_define',
      implemented: status === 'implemented',
      nextAction: buildFieldDefinitionImplementationNextAction(status)
    };
  });

  const blockedCriticalPathItems = items.filter((item) => item.blocksCriticalPath);

  return {
    ok: blockedCriticalPathItems.length === 0 && confirmationIssues.length === 0,
    source: plan.source,
    totalCount: items.length,
    decidedCount: items.filter((item) => !isFieldDefinitionImplementationPendingStatus(item.status)).length,
    unreviewedCount: items.filter((item) => item.status === 'unreviewed').length,
    checkingCount: items.filter((item) => item.status === 'checking').length,
    readyToDefineCount: items.filter((item) => item.status === 'ready_to_define').length,
    implementedCount: items.filter((item) => item.status === 'implemented').length,
    blockedCount: items.filter((item) => item.status === 'blocked').length,
    criticalPathRecordTypes: sortedUnique(items.filter((item) => isFieldDefinitionImplementationCriticalPathPriority(item.priority)).map((item) => item.recordType)),
    blockedCriticalPathRecordTypes: sortedUnique(blockedCriticalPathItems.map((item) => item.recordType)),
    readyToDefineRecordTypes: sortedUnique(items.filter((item) => item.readyForDefinition).map((item) => item.recordType)),
    implementedRecordTypes: sortedUnique(items.filter((item) => item.implemented).map((item) => item.recordType)),
    confirmationIssues,
    items
  };
}

export function buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressCsv(
  review: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview
): string {
  const rows = [
    ['出典', 'ID', '優先度', 'レコード種別', 'レコード名', '項目', '確認状態', '根拠', '担当', '確認日時', '次の対応', 'メモ'],
    ...review.items.map((item) => [
      review.source.label,
      item.id,
      item.priorityLabel,
      item.recordType,
      item.recordLabel,
      item.fieldLabel,
      item.statusLabel,
      item.evidenceLabel,
      item.owner,
      item.reviewedAt,
      item.nextAction,
      item.note
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport(
  definitionReview: DispensingUkeSpecificationPdfFieldDefinitionReview,
  plan: DispensingUkeSpecificationPdfFieldDefinitionImplementationPlan,
  progressReview: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview
): DispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport {
  const definitionItemById = new Map(definitionReview.items.map((item) => [item.id, item]));
  const taskById = new Map(plan.tasks.map((task) => [task.id, task]));
  const issues: string[] = [...progressReview.confirmationIssues];
  const candidates: DispensingUkeSpecificationPdfAllFieldDefinitionCandidate[] = [];

  for (const progressItem of progressReview.items.filter((item) => item.readyForDefinition)) {
    const task = taskById.get(progressItem.id);
    if (!task) {
      issues.push(`${progressItem.id}は現在の実装計画にありません。`);
      continue;
    }

    for (const sourceItemId of task.sourceItemIds) {
      const definitionItem = definitionItemById.get(sourceItemId);
      if (!definitionItem) {
        issues.push(`${sourceItemId}はPDF本文全項目定義レビューにありません。`);
        continue;
      }

      candidates.push({
        id: `${definitionItem.id}-all-field-candidate`,
        taskId: task.id,
        recordType: definitionItem.recordType,
        itemNumber: definitionItem.itemNumber,
        label: definitionItem.label,
        required: definitionItem.required,
        sourceMode: definitionItem.mode,
        sourceDigits: definitionItem.digits,
        sourceBytes: definitionItem.bytes,
        evidenceLabel: progressItem.evidenceLabel || task.evidenceLabel,
        sourceLine: definitionItem.sourceLine,
        suggestedFieldSpec: buildSuggestedFieldSpecFromPdfField(definitionItem)
      });
    }
  }

  return {
    ok: issues.length === 0,
    source: definitionReview.source,
    candidateCount: candidates.length,
    recordTypes: sortedUnique(candidates.map((candidate) => candidate.recordType)),
    candidates,
    issues
  };
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionCandidateCsv(
  report: DispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport
): string {
  const rows = [
    ['出典', 'ID', 'タスクID', 'レコード種別', '項番', '項目名', '必須', 'PDFモード', 'PDF桁数', 'PDFバイト数', '候補フォーマット', '候補JSON', '根拠', 'PDF本文行'],
    ...report.candidates.map((candidate) => [
      report.source.label,
      candidate.id,
      candidate.taskId,
      candidate.recordType,
      candidate.itemNumber,
      candidate.label,
      candidate.required ? '必須' : '任意',
      candidate.sourceMode,
      candidate.sourceDigits ?? '',
      candidate.sourceBytes ?? '',
      candidate.suggestedFieldSpec.format,
      JSON.stringify(candidate.suggestedFieldSpec),
      candidate.evidenceLabel,
      candidate.sourceLine
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview(
  pdfText: string,
  expectedSpecs: DispensingUkeRecordSpec[],
  definitionReview: DispensingUkeSpecificationPdfFieldDefinitionReview,
  candidateReport: DispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport,
  source: DispensingUkeRecordSpecSource = definitionReview.source
): DispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview {
  const applied = applyAllFieldDefinitionCandidatesToSpecs(expectedSpecs, candidateReport.candidates);
  const afterReview = buildDispensingUkeSpecificationPdfFieldDefinitionReview(
    parseDispensingUkeSpecificationPdfText(pdfText, applied.specs, source),
    applied.specs
  );
  const beforeRecordTypes = new Set(definitionReview.needsDefinitionRecordTypes);
  const afterRecordTypes = new Set(afterReview.needsDefinitionRecordTypes);
  const resolvedRecordTypes = Array.from(beforeRecordTypes)
    .filter((recordType) => !afterRecordTypes.has(recordType))
    .sort();
  const issues = sortedUnique([
    ...definitionReview.parseIssues,
    ...afterReview.parseIssues,
    ...candidateReport.issues,
    ...applied.issues
  ]);

  return {
    ok: issues.length === 0 && afterReview.needsDefinitionFieldCount < definitionReview.needsDefinitionFieldCount,
    source,
    candidateCount: candidateReport.candidateCount,
    appliedCandidateCount: applied.appliedCount,
    skippedCandidateCount: applied.skippedCount,
    beforeNeedsDefinitionFieldCount: definitionReview.needsDefinitionFieldCount,
    afterNeedsDefinitionFieldCount: afterReview.needsDefinitionFieldCount,
    resolvedFieldCount: Math.max(0, definitionReview.needsDefinitionFieldCount - afterReview.needsDefinitionFieldCount),
    resolvedRecordTypes,
    remainingRecordTypes: afterReview.needsDefinitionRecordTypes,
    issues,
    items: applied.items,
    updatedSpecs: applied.specs,
    afterReview
  };
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreviewCsv(
  preview: DispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview
): string {
  const rows = [
    ['出典', '候補数', '適用候補数', 'スキップ候補数', '適用前要定義', '適用後要定義', '解消項目数', '解消レコード', '残レコード', '判定', '確認事項'],
    [
      preview.source.label,
      preview.candidateCount,
      preview.appliedCandidateCount,
      preview.skippedCandidateCount,
      preview.beforeNeedsDefinitionFieldCount,
      preview.afterNeedsDefinitionFieldCount,
      preview.resolvedFieldCount,
      preview.resolvedRecordTypes.join(' / '),
      preview.remainingRecordTypes.join(' / '),
      preview.ok ? 'OK' : '要確認',
      preview.issues.join(' / ')
    ]
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyDetailCsv(
  preview: DispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview
): string {
  const rows = [
    ['出典', '候補ID', 'タスクID', 'レコード種別', '項番', '項目名', '判定', '理由', '候補JSON', '根拠', 'PDF本文行'],
    ...preview.items.map((item) => [
      preview.source.label,
      item.candidateId,
      item.taskId,
      item.recordType,
      item.itemNumber,
      item.label,
      item.statusLabel,
      item.reason,
      JSON.stringify(item.suggestedFieldSpec),
      item.evidenceLabel,
      item.sourceLine
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan(
  preview: DispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview
): DispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan {
  const specsByRecordType = buildSpecMap(preview.updatedSpecs);
  const appliedItemsByRecordType = new Map<string, DispensingUkeSpecificationPdfAllFieldDefinitionApplyItem[]>();
  const issues = [...preview.issues];

  for (const item of preview.items.filter((previewItem) => previewItem.status === 'applied')) {
    const grouped = appliedItemsByRecordType.get(item.recordType) ?? [];
    grouped.push(item);
    appliedItemsByRecordType.set(item.recordType, grouped);
  }

  const items = Array.from(appliedItemsByRecordType.entries())
    .map(([recordType, appliedItems]) => {
      const spec = specsByRecordType.get(recordType);
      if (!spec) {
        issues.push(`${recordType}は反映後の仕様点検表にありません。`);
      }

      return {
        recordType,
        recordLabel: spec?.label ?? recordType,
        appliedCandidateCount: appliedItems.length,
        itemNumbers: appliedItems.map((item) => item.itemNumber).sort((left, right) => left - right),
        candidateIds: appliedItems.map((item) => item.candidateId),
        evidenceLabels: sortedUnique(appliedItems.map((item) => item.evidenceLabel).filter(Boolean)),
        addedFieldSpecs: appliedItems
          .map((item) => item.suggestedFieldSpec)
          .sort((left, right) => left.index - right.index),
        fullAllFields: [...(spec?.allFields ?? [])].sort((left, right) => left.index - right.index)
      };
    })
    .sort((left, right) => {
      const leftSpec = specsByRecordType.get(left.recordType);
      const rightSpec = specsByRecordType.get(right.recordType);
      return (leftSpec?.orderStage ?? 99) - (rightSpec?.orderStage ?? 99)
        || left.recordType.localeCompare(right.recordType);
    });

  return {
    ok: issues.length === 0 && items.length > 0,
    source: preview.source,
    itemCount: items.length,
    appliedCandidateCount: items.reduce((sum, item) => sum + item.appliedCandidateCount, 0),
    skippedCandidateCount: preview.skippedCandidateCount,
    recordTypes: items.map((item) => item.recordType),
    issues: sortedUnique(issues),
    items
  };
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlanCsv(
  plan: DispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan
): string {
  const rows = [
    ['出典', 'レコード種別', 'レコード名', '追加候補数', '追加項番', '候補ID', '根拠', '追加する全項目定義JSON', '反映後の全項目定義JSON'],
    ...plan.items.map((item) => [
      plan.source.label,
      item.recordType,
      item.recordLabel,
      item.appliedCandidateCount,
      formatNumberList(item.itemNumbers),
      item.candidateIds.join(' / '),
      item.evidenceLabels.join(' / '),
      JSON.stringify(item.addedFieldSpecs),
      JSON.stringify(item.fullAllFields)
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlanTypeScript(
  plan: DispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan
): string {
  const lines = [
    `// ${plan.source.label} PDF本文 allFields仕様反映案`
  ];
  if (plan.issues.length > 0) {
    lines.push(`// 要確認: ${plan.issues.join(' / ')}`);
  }

  for (const item of plan.items) {
    lines.push('');
    lines.push(`// ${item.recordType} ${item.recordLabel}: 第${formatNumberList(item.itemNumbers)}項目`);
    if (item.evidenceLabels.length > 0) {
      lines.push(`// 根拠: ${item.evidenceLabels.join(' / ')}`);
    }
    lines.push('allFields: [');
    for (const field of item.fullAllFields) {
      lines.push(`  ${formatFieldSpecTypeScriptLiteral(field)},`);
    }
    lines.push(']');
  }

  return lines.join('\n');
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport(
  preview: DispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview
): DispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport {
  const specsByRecordType = buildSpecMap(preview.updatedSpecs);
  const itemsByRecordType = new Map<string, DispensingUkeSpecificationPdfFieldDefinitionItem[]>();

  for (const item of preview.afterReview.items.filter((reviewItem) => reviewItem.status === 'needs_definition')) {
    const grouped = itemsByRecordType.get(item.recordType) ?? [];
    grouped.push(item);
    itemsByRecordType.set(item.recordType, grouped);
  }

  const items = Array.from(itemsByRecordType.entries())
    .map(([recordType, itemsForRecord]) => {
      const spec = specsByRecordType.get(recordType);
      const priority = pickFieldDefinitionImplementationPriority(itemsForRecord, spec);
      const fieldNumbers = itemsForRecord.map((item) => item.itemNumber).sort((left, right) => left - right);
      const fieldLabel = formatFieldDefinitionFieldLabel(itemsForRecord);

      return {
        id: `${recordType}-pdf-field-definition-remaining-action`,
        recordType,
        recordLabel: spec?.label ?? recordType,
        priority,
        priorityLabel: FIELD_DEFINITION_IMPLEMENTATION_PRIORITY_LABELS[priority],
        itemNumbers: fieldNumbers,
        fieldLabel,
        remainingFieldCount: itemsForRecord.length,
        requiredFieldCount: itemsForRecord.filter((item) => item.required).length,
        nextAction: `${recordType}の${fieldLabel}について、PDF本文根拠と値の出し方を確認し、全項目定義へ追加してください。`,
        doneCriteria: [
          `${recordType}の第${fieldNumbers.join('・')}項目を全項目定義へ追加する`,
          `${recordType}の項目順、形式、桁数、必須条件、空欄許容をテストで確認する`,
          'allFields適用プレビューで対象レコードが残レコードから消える'
        ],
        sourceLines: itemsForRecord.map((item) => item.sourceLine)
      };
    })
    .sort((left, right) => {
      const leftSpec = specsByRecordType.get(left.recordType);
      const rightSpec = specsByRecordType.get(right.recordType);
      return fieldDefinitionImplementationPriorityRank(left.priority) - fieldDefinitionImplementationPriorityRank(right.priority)
        || (leftSpec?.orderStage ?? 99) - (rightSpec?.orderStage ?? 99)
        || left.recordType.localeCompare(right.recordType);
    });

  return {
    ok: preview.issues.length === 0 && items.length === 0,
    source: preview.source,
    remainingFieldCount: items.reduce((sum, item) => sum + item.remainingFieldCount, 0),
    recordTypes: items.map((item) => item.recordType),
    criticalRecordTypes: items.filter((item) => item.priority === 'critical').map((item) => item.recordType),
    highRecordTypes: items.filter((item) => item.priority === 'high').map((item) => item.recordType),
    mediumRecordTypes: items.filter((item) => item.priority === 'medium').map((item) => item.recordType),
    issues: [...preview.issues],
    items
  };
}

export function buildDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionCsv(
  report: DispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport
): string {
  const rows = [
    ['出典', 'ID', '優先度', 'レコード種別', 'レコード名', '残項目数', '残項番', '残項目', '必須項目数', '次の対応', '完了条件', 'PDF本文行'],
    ...report.items.map((item) => [
      report.source.label,
      item.id,
      item.priorityLabel,
      item.recordType,
      item.recordLabel,
      item.remainingFieldCount,
      formatNumberList(item.itemNumbers),
      item.fieldLabel,
      item.requiredFieldCount,
      item.nextAction,
      item.doneCriteria.join(' / '),
      item.sourceLines.join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildDispensingUkeSpecificationPdfAllFieldImplementationPack(
  pdfText: string,
  confirmations: DispensingUkeSpecificationPdfFieldDefinitionImplementationConfirmation[] = [],
  expectedSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_KNOWN_RECORD_SPEC,
  source: DispensingUkeRecordSpecSource = DISPENSING_UKE_RECORD_SPEC_SOURCE
): DispensingUkeSpecificationPdfAllFieldImplementationPack {
  const parseResult = parseDispensingUkeSpecificationPdfText(pdfText, expectedSpecs, source);
  const definitionReview = buildDispensingUkeSpecificationPdfFieldDefinitionReview(parseResult, expectedSpecs);
  const completionGate = buildDispensingUkeSpecificationPdfAllFieldCompletionGate(
    parseResult,
    definitionReview,
    expectedSpecs
  );
  const implementationPlan = buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan(
    definitionReview,
    expectedSpecs
  );
  const progressReview = buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview(
    implementationPlan,
    confirmations
  );
  const candidateReport = buildDispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport(
    definitionReview,
    implementationPlan,
    progressReview
  );
  const applyPreview = buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview(
    pdfText,
    expectedSpecs,
    definitionReview,
    candidateReport,
    source
  );
  const patchPlan = buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan(applyPreview);
  const remainingActionReport = buildDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport(applyPreview);

  return {
    source,
    parseResult,
    definitionReview,
    completionGate,
    implementationPlan,
    progressReview,
    candidateReport,
    applyPreview,
    patchPlan,
    remainingActionReport
  };
}

export function buildDispensingUkeSpecificationPdfAllFieldImplementationPackText(
  pack: DispensingUkeSpecificationPdfAllFieldImplementationPack
): string {
  const sections = [
    ['01_pdf_field_catalog.csv', buildDispensingUkeSpecificationPdfFieldCatalogCsv(pack.parseResult)],
    ['02_completion_gate.csv', buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv(pack.completionGate)],
    ['03_field_definition_review.csv', buildDispensingUkeSpecificationPdfFieldDefinitionReviewCsv(pack.definitionReview)],
    ['04_implementation_plan.csv', buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlanCsv(pack.implementationPlan)],
    ['05_implementation_progress.csv', buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressCsv(pack.progressReview)],
    ['06_all_fields_candidates.csv', buildDispensingUkeSpecificationPdfAllFieldDefinitionCandidateCsv(pack.candidateReport)],
    ['07_all_fields_apply_preview.csv', buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreviewCsv(pack.applyPreview)],
    ['08_all_fields_apply_detail.csv', buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyDetailCsv(pack.applyPreview)],
    ['09_all_fields_patch_plan.csv', buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlanCsv(pack.patchPlan)],
    ['10_remaining_actions.csv', buildDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionCsv(pack.remainingActionReport)],
    ['11_all_fields_patch.ts', buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlanTypeScript(pack.patchPlan)]
  ];

  return sections
    .map(([fileName, content]) => `# ${fileName}\n${content}`)
    .join('\n\n');
}

export function buildDispensingUkeSpecificationPdfFieldCatalogCsv(
  parseResult: DispensingUkeSpecificationPdfParseResult
): string {
  const rows = [
    ['出典', 'レコード種別', '項番', '項目名', 'モード', '桁数', 'バイト数', '必須', 'PDF本文行'],
    ...parseResult.fields.map((field) => [
      parseResult.source.label,
      field.recordType,
      field.itemNumber,
      field.label,
      field.mode,
      field.digits ?? '',
      field.bytes ?? '',
      field.required ? '必須' : '任意',
      field.sourceLine
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatDispensingUkeSpecificationPdfFieldDefinitionReview(
  review: DispensingUkeSpecificationPdfFieldDefinitionReview
): string {
  const status = review.ok ? 'OK' : '要定義';
  const recordText = review.needsDefinitionRecordTypes.length > 0
    ? ` / 要定義 ${review.needsDefinitionRecordTypes.join('・')}`
    : '';
  const issueText = review.parseIssues.length > 0
    ? ` / 読取確認 ${review.parseIssues.slice(0, 3).join(' ')}${review.parseIssues.length > 3 ? ` ほか${review.parseIssues.length - 3}件` : ''}`
    : '';

  return `${review.source.label} PDF本文全項目定義: ${status} / 抽出 ${review.parsedFieldCount} / 主要項目定義済み ${review.definedFieldCount} / 要定義 ${review.needsDefinitionFieldCount}${recordText}${issueText}`;
}

export function formatDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan(
  plan: DispensingUkeSpecificationPdfFieldDefinitionImplementationPlan
): string {
  const status = plan.taskCount === 0
    ? 'OK'
    : plan.readyForImplementation ? '実装可能' : '要読取確認';
  const taskText = plan.taskRecordTypes.length > 0
    ? ` / 実装候補 ${plan.taskRecordTypes.join('・')}`
    : '';
  const priorityText = plan.criticalRecordTypes.length > 0 || plan.highRecordTypes.length > 0
    ? ` / 優先 ${[
      plan.criticalRecordTypes.length > 0 ? `最優先 ${plan.criticalRecordTypes.join('・')}` : '',
      plan.highRecordTypes.length > 0 ? `高 ${plan.highRecordTypes.join('・')}` : ''
    ].filter(Boolean).join(' / ')}`
    : '';
  const issueText = plan.parseIssues.length > 0
    ? ` / 読取確認 ${plan.parseIssues.slice(0, 3).join(' ')}${plan.parseIssues.length > 3 ? ` ほか${plan.parseIssues.length - 3}件` : ''}`
    : '';

  return `${plan.source.label} PDF本文全項目定義 実装計画: ${status} / タスク ${plan.taskCount}${taskText}${priorityText}${issueText}`;
}

export function formatDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview(
  review: DispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview
): string {
  const status = review.ok ? 'OK' : '要確認';
  const blockedText = review.blockedCriticalPathRecordTypes.length > 0
    ? ` / 未確認の優先項目 ${review.blockedCriticalPathRecordTypes.join('・')}`
    : '';
  const readyText = review.readyToDefineRecordTypes.length > 0
    ? ` / 定義追加準備 ${review.readyToDefineRecordTypes.join('・')}`
    : '';
  const implementedText = review.implementedRecordTypes.length > 0
    ? ` / 実装済み ${review.implementedRecordTypes.join('・')}`
    : '';
  const issueText = review.confirmationIssues.length > 0
    ? ` / 入力確認 ${review.confirmationIssues.slice(0, 2).join('・')}${review.confirmationIssues.length > 2 ? `ほか${review.confirmationIssues.length - 2}件` : ''}`
    : '';

  return `${review.source.label} PDF本文全項目定義 進捗: ${status} / 判断済み ${review.decidedCount}/${review.totalCount} / 未確認 ${review.unreviewedCount} / 確認中 ${review.checkingCount}${blockedText}${readyText}${implementedText}${issueText}`;
}

export function formatDispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport(
  report: DispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport
): string {
  const status = report.ok ? 'OK' : '要確認';
  const recordText = report.recordTypes.length > 0
    ? ` / 候補 ${report.recordTypes.join('・')}`
    : '';
  const issueText = report.issues.length > 0
    ? ` / 入力確認 ${report.issues.slice(0, 2).join('・')}${report.issues.length > 2 ? `ほか${report.issues.length - 2}件` : ''}`
    : '';

  return `${report.source.label} PDF本文 allFields追加候補: ${status} / 候補 ${report.candidateCount}件${recordText}${issueText}`;
}

export function formatDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview(
  preview: DispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview
): string {
  const status = preview.ok ? 'OK' : '要確認';
  const resolvedText = preview.resolvedRecordTypes.length > 0
    ? ` / 解消 ${preview.resolvedRecordTypes.join('・')}`
    : '';
  const remainingText = preview.remainingRecordTypes.length > 0
    ? ` / 残 ${preview.remainingRecordTypes.join('・')}`
    : '';
  const issueText = preview.issues.length > 0
    ? ` / 入力確認 ${preview.issues.slice(0, 2).join('・')}${preview.issues.length > 2 ? `ほか${preview.issues.length - 2}件` : ''}`
    : '';

  return `${preview.source.label} PDF本文 allFields適用プレビュー: ${status} / 適用 ${preview.appliedCandidateCount}/${preview.candidateCount} / 要定義 ${preview.beforeNeedsDefinitionFieldCount}->${preview.afterNeedsDefinitionFieldCount}${resolvedText}${remainingText}${issueText}`;
}

export function formatDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan(
  plan: DispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan
): string {
  const status = plan.ok ? 'OK' : '要確認';
  const recordText = plan.recordTypes.length > 0
    ? ` / 対象 ${plan.recordTypes.join('・')}`
    : '';
  const skippedText = plan.skippedCandidateCount > 0
    ? ` / スキップ ${plan.skippedCandidateCount}`
    : '';
  const issueText = plan.issues.length > 0
    ? ` / 入力確認 ${plan.issues.slice(0, 2).join('・')}${plan.issues.length > 2 ? `ほか${plan.issues.length - 2}件` : ''}`
    : '';

  return `${plan.source.label} PDF本文 allFields仕様反映案: ${status} / レコード ${plan.itemCount} / 追加候補 ${plan.appliedCandidateCount}${skippedText}${recordText}${issueText}`;
}

export function formatDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport(
  report: DispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport
): string {
  const status = report.ok ? 'OK' : '要対応';
  const recordText = report.recordTypes.length > 0
    ? ` / 残 ${report.recordTypes.join('・')}`
    : '';
  const priorityText = report.criticalRecordTypes.length > 0 || report.highRecordTypes.length > 0
    ? ` / 優先 ${[
      report.criticalRecordTypes.length > 0 ? `最優先 ${report.criticalRecordTypes.join('・')}` : '',
      report.highRecordTypes.length > 0 ? `高 ${report.highRecordTypes.join('・')}` : ''
    ].filter(Boolean).join(' / ')}`
    : '';
  const issueText = report.issues.length > 0
    ? ` / 入力確認 ${report.issues.slice(0, 2).join('・')}${report.issues.length > 2 ? `ほか${report.issues.length - 2}件` : ''}`
    : '';

  return `${report.source.label} PDF本文 allFields残対応: ${status} / 残項目 ${report.remainingFieldCount}${recordText}${priorityText}${issueText}`;
}

export function parseDispensingUkeSpecificationPdfText(
  pdfText: string,
  expectedSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_KNOWN_RECORD_SPEC,
  source: DispensingUkeRecordSpecSource = DISPENSING_UKE_RECORD_SPEC_SOURCE
): DispensingUkeSpecificationPdfParseResult {
  const fields: DispensingUkeSpecificationPdfField[] = [];
  const issues: string[] = [];
  let currentRecordType = '';

  for (const rawLine of pdfText.split(/\r?\n/)) {
    const line = normalizePdfLine(rawLine);
    if (!line) continue;

    const headerRecordType = findRecordTypeInHeader(line, expectedSpecs);
    if (headerRecordType) {
      currentRecordType = headerRecordType;
      continue;
    }

    if (!currentRecordType) continue;
    const field = parseFieldLine(line, currentRecordType);
    if (field) {
      fields.push(field);
    }
  }

  const recordTypes = Array.from(new Set(fields.map((field) => field.recordType))).sort();
  for (const spec of expectedSpecs) {
    if (!recordTypes.includes(spec.type)) {
      issues.push(`${spec.type}レコードの項目をPDF本文から抽出できません。`);
    }
  }

  return {
    source,
    recordTypes,
    fields,
    issues
  };
}

export function buildDispensingUkeSpecificationPdfFieldReview(
  pdfText: string,
  expectedSpecs: DispensingUkeRecordSpec[] = DISPENSING_UKE_KNOWN_RECORD_SPEC,
  source: DispensingUkeRecordSpecSource = DISPENSING_UKE_RECORD_SPEC_SOURCE
): DispensingUkeSpecificationPdfFieldReview {
  const parseResult = parseDispensingUkeSpecificationPdfText(pdfText, expectedSpecs, source);
  const fieldsByRecordAndItem = new Map(
    parseResult.fields.map((field) => [`${field.recordType}:${field.itemNumber}`, field])
  );
  const fieldsByRecordType = new Map<string, DispensingUkeSpecificationPdfField[]>();
  const keyFieldIssues: DispensingUkeSpecificationPdfKeyFieldIssue[] = [];
  let expectedKeyFieldCount = 0;

  for (const field of parseResult.fields) {
    const fields = fieldsByRecordType.get(field.recordType) ?? [];
    fields.push(field);
    fieldsByRecordType.set(field.recordType, fields);
  }

  const recordCoverages = expectedSpecs.map((spec) => buildRecordCoverage(spec, fieldsByRecordType.get(spec.type) ?? []));

  for (const spec of expectedSpecs) {
    for (const expectedField of spec.keyFields) {
      expectedKeyFieldCount++;
      const itemNumber = expectedField.index + 1;
      const observed = fieldsByRecordAndItem.get(`${spec.type}:${itemNumber}`);
      if (!observed) {
        keyFieldIssues.push({
          recordType: spec.type,
          itemNumber,
          label: expectedField.label,
          field: 'missing',
          expected: expectedField.label,
          observed: ''
        });
        continue;
      }

      if (!sameLabel(expectedField.label, observed.label)) {
        keyFieldIssues.push({
          recordType: spec.type,
          itemNumber,
          label: expectedField.label,
          field: 'label',
          expected: expectedField.label,
          observed: observed.label
        });
      }

      if (!sameFormat(expectedField.format, observed.mode)) {
        keyFieldIssues.push({
          recordType: spec.type,
          itemNumber,
          label: expectedField.label,
          field: 'format',
          expected: expectedField.format,
          observed: observed.mode
        });
      }

      if (expectedField.lengths && observed.digits !== undefined && !expectedField.lengths.includes(observed.digits)) {
        keyFieldIssues.push({
          recordType: spec.type,
          itemNumber,
          label: expectedField.label,
          field: 'length',
          expected: expectedField.lengths.join('/'),
          observed: observed.digits
        });
      }

      if (expectedField.required && !observed.required) {
        keyFieldIssues.push({
          recordType: spec.type,
          itemNumber,
          label: expectedField.label,
          field: 'required',
          expected: true,
          observed: false
        });
      }
    }
  }

  return {
    ok: parseResult.issues.length === 0
      && keyFieldIssues.length === 0
      && recordCoverages.every((coverage) => coverage.status !== 'definition_narrower'),
    source,
    expectedRecordTypes: expectedSpecs.map((spec) => spec.type),
    parsedRecordTypes: parseResult.recordTypes,
    parsedFieldCount: parseResult.fields.length,
    expectedKeyFieldCount,
    matchedKeyFieldCount: expectedKeyFieldCount - new Set(keyFieldIssues.map((issue) => `${issue.recordType}:${issue.itemNumber}`)).size,
    missingRecordTypes: expectedSpecs
      .map((spec) => spec.type)
      .filter((type) => !parseResult.recordTypes.includes(type)),
    recordCoverages,
    definitionNarrowerRecordTypes: recordCoverages
      .filter((coverage) => coverage.status === 'definition_narrower')
      .map((coverage) => coverage.recordType),
    keyFieldIssues,
    parseIssues: parseResult.issues
  };
}

export function buildDispensingUkeSpecificationPdfRecordCoverageCsv(
  review: DispensingUkeSpecificationPdfFieldReview
): string {
  const rows = [
    ['出典', 'レコード種別', 'レコード名', '判定', 'PDF抽出項目数', 'PDF最大項番', '現行最小項目数', '未抽出項番', '現行定義外PDF項番'],
    ...review.recordCoverages.map((coverage) => [
      review.source.label,
      coverage.recordType,
      coverage.label,
      formatRecordCoverageStatus(coverage.status),
      coverage.parsedFieldCount,
      coverage.maxPdfItemNumber,
      coverage.currentMinFieldCount,
      formatNumberList(coverage.missingItemNumbers),
      formatNumberList(coverage.extraPdfItemNumbers)
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function formatDispensingUkeSpecificationPdfFieldReview(
  review: DispensingUkeSpecificationPdfFieldReview
): string {
  const issueText = review.keyFieldIssues.length > 0
    ? ` / 項目差分 ${review.keyFieldIssues.slice(0, 4).map((issue) => `${issue.recordType}${issue.itemNumber}.${issue.field}:${issue.expected}->${issue.observed}`).join('・')}${review.keyFieldIssues.length > 4 ? `ほか${review.keyFieldIssues.length - 4}件` : ''}`
    : '';
  const missingText = review.missingRecordTypes.length > 0
    ? ` / 未抽出 ${review.missingRecordTypes.join('・')}`
    : '';
  const narrowText = review.definitionNarrowerRecordTypes.length > 0
    ? ` / PDF項目多め ${review.definitionNarrowerRecordTypes.join('・')}`
    : '';

  return `${review.source.label} PDF本文項目: ${review.ok ? 'OK' : '要確認'} / 抽出レコード ${review.parsedRecordTypes.length}/${review.expectedRecordTypes.length} / 抽出項目 ${review.parsedFieldCount} / 主要項目一致 ${review.matchedKeyFieldCount}/${review.expectedKeyFieldCount}${missingText}${narrowText}${issueText}`;
}
