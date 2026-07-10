import type { Drug } from '../db/types.ts';

export const DRUG_MASTER_ROLLBACK_APP = 'yakureki';
export const DRUG_MASTER_ROLLBACK_TYPE = 'drug-master-rollback';
export const DRUG_MASTER_ROLLBACK_VERSION = 1;

export type DrugMasterChangeType = 'new' | 'updated' | 'abolished';

export interface DrugMasterChangeRecord {
  code: string;
  name: string;
  changeType: DrugMasterChangeType;
  before?: Drug;
  after: Drug;
}

export interface DrugMasterUpdateSummary {
  newCount: number;
  updatedCount: number;
  abolishedCount: number;
  changedCount: number;
}

export interface DrugMasterSourceEvidence {
  sourceFileName: string;
  sourceFileType?: 'csv' | 'zip';
  extractedCsvFileName?: string;
  archiveEntryCount?: number;
  csvEntryCount?: number;
  sourceUrl?: string;
  fileSizeBytes: number;
  sha256: string;
  capturedAt: string;
  layoutLabel?: string;
  rowCount?: number;
  skippedRowCount?: number;
  sourceUrlReviewLabel?: string;
  specificationRevisionLabel?: string;
  specificationSourceUrl?: string;
}

export interface DrugMasterRollbackPayload {
  app: typeof DRUG_MASTER_ROLLBACK_APP;
  type: typeof DRUG_MASTER_ROLLBACK_TYPE;
  version: typeof DRUG_MASTER_ROLLBACK_VERSION;
  versionId: string;
  sourceFileName: string;
  createdAt: string;
  summary: DrugMasterUpdateSummary;
  sourceEvidence?: DrugMasterSourceEvidence;
  restoreRows: Drug[];
  deleteCodes: string[];
}

export interface DrugMasterUpdateArtifacts {
  versionId: string;
  sourceFileName: string;
  createdAt: string;
  summary: DrugMasterUpdateSummary;
  sourceEvidence?: DrugMasterSourceEvidence;
  changes: DrugMasterChangeRecord[];
  rollback: DrugMasterRollbackPayload;
}

export type DrugMasterRollbackValidationResult =
  | { ok: true; payload: DrugMasterRollbackPayload }
  | { ok: false; reason: string };

const DRUG_FIELDS: Array<keyof Drug> = [
  'code',
  'name',
  'yjCode',
  'isGeneric',
  'genericName',
  'isAbolished',
  'price',
  'stockQuantity',
  'location',
  'isNarcotic',
  'isPsychotropic',
  'isPoisonous',
  'isHighRisk',
  'documentUrl'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatVersionId(date: Date): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join('') + '_' + [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds())
  ].join('');
}

export function normalizeDrugSnapshot(value: Partial<Drug>): Drug {
  const snapshot: Drug = {
    code: String(value.code || ''),
    name: String(value.name || ''),
    isGeneric: Boolean(value.isGeneric)
  };

  for (const field of DRUG_FIELDS) {
    const fieldValue = value[field];
    if (field === 'code' || field === 'name' || field === 'isGeneric') continue;
    if (fieldValue !== undefined) {
      (snapshot as any)[field] = fieldValue;
    }
  }

  return snapshot;
}

function areDrugSnapshotsEqual(a: Drug, b: Drug): boolean {
  for (const field of DRUG_FIELDS) {
    if (a[field] !== b[field]) return false;
  }
  return true;
}

function classifyChange(before: Drug | undefined, after: Drug): DrugMasterChangeType {
  if (after.isAbolished && !before?.isAbolished) return 'abolished';
  if (!before) return 'new';
  return 'updated';
}

function summarizeChanges(changes: DrugMasterChangeRecord[]): DrugMasterUpdateSummary {
  return {
    newCount: changes.filter((change) => change.changeType === 'new').length,
    updatedCount: changes.filter((change) => change.changeType === 'updated').length,
    abolishedCount: changes.filter((change) => change.changeType === 'abolished').length,
    changedCount: changes.length
  };
}

export function buildDrugMasterUpdateArtifacts(input: {
  sourceFileName: string;
  beforeRows: Partial<Drug>[];
  afterRows: Partial<Drug>[];
  createdAt?: Date;
  sourceEvidence?: DrugMasterSourceEvidence;
}): DrugMasterUpdateArtifacts {
  const createdAt = input.createdAt || new Date();
  const beforeByCode = new Map<string, Drug>();
  for (const row of input.beforeRows) {
    if (!row.code) continue;
    const snapshot = normalizeDrugSnapshot(row);
    beforeByCode.set(snapshot.code, snapshot);
  }

  const changes: DrugMasterChangeRecord[] = [];
  for (const row of input.afterRows) {
    if (!row.code) continue;
    const after = normalizeDrugSnapshot(row);
    const before = beforeByCode.get(after.code);
    if (before && areDrugSnapshotsEqual(before, after)) continue;

    changes.push({
      code: after.code,
      name: after.name,
      changeType: classifyChange(before, after),
      before,
      after
    });
  }

  const summary = summarizeChanges(changes);
  const versionId = formatVersionId(createdAt);
  const rollback: DrugMasterRollbackPayload = {
    app: DRUG_MASTER_ROLLBACK_APP,
    type: DRUG_MASTER_ROLLBACK_TYPE,
    version: DRUG_MASTER_ROLLBACK_VERSION,
    versionId,
    sourceFileName: input.sourceFileName,
    createdAt: createdAt.toISOString(),
    summary,
    sourceEvidence: input.sourceEvidence,
    restoreRows: changes
      .filter((change) => Boolean(change.before))
      .map((change) => change.before as Drug),
    deleteCodes: changes
      .filter((change) => !change.before)
      .map((change) => change.code)
  };

  return {
    versionId,
    sourceFileName: input.sourceFileName,
    createdAt: createdAt.toISOString(),
    summary,
    sourceEvidence: input.sourceEvidence,
    changes,
    rollback
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildDrugMasterDiffCsv(artifacts: DrugMasterUpdateArtifacts): string {
  const rows = [
    ['区分', '医薬品コード', '医薬品名', '変更前薬価', '変更後薬価', '変更前YJ', '変更後YJ', '補足'],
    ...artifacts.changes.map((change) => [
      change.changeType === 'new' ? '新規' : change.changeType === 'abolished' ? '廃止' : '更新',
      change.code,
      change.name,
      change.before?.price ?? '',
      change.after.price ?? '',
      change.before?.yjCode || '',
      change.after.yjCode || '',
      [
        change.after.isAbolished ? '廃止フラグあり' : '',
        change.before ? 'ロールバック復元対象' : 'ロールバック時は削除対象'
      ].filter(Boolean).join(' / ')
    ])
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function toDrugFromRecord(value: unknown): Drug | null {
  if (!isRecord(value)) return null;
  if (typeof value.code !== 'string' || typeof value.name !== 'string') return null;
  return normalizeDrugSnapshot(value as Partial<Drug>);
}

function toSourceEvidenceFromRecord(value: unknown): DrugMasterSourceEvidence | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.sourceFileName !== 'string' ||
    typeof value.fileSizeBytes !== 'number' ||
    typeof value.sha256 !== 'string' ||
    typeof value.capturedAt !== 'string'
  ) {
    return undefined;
  }

  return {
    sourceFileName: value.sourceFileName,
    sourceFileType: value.sourceFileType === 'csv' || value.sourceFileType === 'zip' ? value.sourceFileType : undefined,
    extractedCsvFileName: typeof value.extractedCsvFileName === 'string' ? value.extractedCsvFileName : undefined,
    archiveEntryCount: typeof value.archiveEntryCount === 'number' ? value.archiveEntryCount : undefined,
    csvEntryCount: typeof value.csvEntryCount === 'number' ? value.csvEntryCount : undefined,
    sourceUrl: typeof value.sourceUrl === 'string' ? value.sourceUrl : undefined,
    fileSizeBytes: value.fileSizeBytes,
    sha256: value.sha256,
    capturedAt: value.capturedAt,
    layoutLabel: typeof value.layoutLabel === 'string' ? value.layoutLabel : undefined,
    rowCount: typeof value.rowCount === 'number' ? value.rowCount : undefined,
    skippedRowCount: typeof value.skippedRowCount === 'number' ? value.skippedRowCount : undefined,
    sourceUrlReviewLabel: typeof value.sourceUrlReviewLabel === 'string' ? value.sourceUrlReviewLabel : undefined,
    specificationRevisionLabel: typeof value.specificationRevisionLabel === 'string' ? value.specificationRevisionLabel : undefined,
    specificationSourceUrl: typeof value.specificationSourceUrl === 'string' ? value.specificationSourceUrl : undefined
  };
}

export function validateDrugMasterRollbackPayload(value: unknown): DrugMasterRollbackValidationResult {
  if (!isRecord(value)) {
    return { ok: false, reason: 'ロールバックJSONの形式が不正です。' };
  }
  if (value.app !== DRUG_MASTER_ROLLBACK_APP || value.type !== DRUG_MASTER_ROLLBACK_TYPE) {
    return { ok: false, reason: 'pharma-ossの医薬品マスターロールバックJSONではありません。' };
  }
  if (value.version !== DRUG_MASTER_ROLLBACK_VERSION) {
    return { ok: false, reason: '対応していないロールバック形式です。' };
  }
  if (typeof value.versionId !== 'string' || typeof value.sourceFileName !== 'string' || typeof value.createdAt !== 'string') {
    return { ok: false, reason: 'ロールバックJSONの版情報を確認できません。' };
  }
  if (!Array.isArray(value.restoreRows) || !Array.isArray(value.deleteCodes)) {
    return { ok: false, reason: 'ロールバック対象データを確認できません。' };
  }

  const restoreRows: Drug[] = [];
  for (const row of value.restoreRows) {
    const drug = toDrugFromRecord(row);
    if (!drug) {
      return { ok: false, reason: '復元対象の医薬品データが不正です。' };
    }
    restoreRows.push(drug);
  }

  const deleteCodes: string[] = [];
  for (const code of value.deleteCodes) {
    if (typeof code !== 'string' || !code) {
      return { ok: false, reason: '削除対象の医薬品コードが不正です。' };
    }
    deleteCodes.push(code);
  }

  const summary = isRecord(value.summary)
    ? {
      newCount: Number(value.summary.newCount || 0),
      updatedCount: Number(value.summary.updatedCount || 0),
      abolishedCount: Number(value.summary.abolishedCount || 0),
      changedCount: Number(value.summary.changedCount || restoreRows.length + deleteCodes.length)
    }
    : {
      newCount: deleteCodes.length,
      updatedCount: restoreRows.length,
      abolishedCount: 0,
      changedCount: restoreRows.length + deleteCodes.length
    };
  const sourceEvidence = toSourceEvidenceFromRecord(value.sourceEvidence);

  return {
    ok: true,
    payload: {
      app: DRUG_MASTER_ROLLBACK_APP,
      type: DRUG_MASTER_ROLLBACK_TYPE,
      version: DRUG_MASTER_ROLLBACK_VERSION,
      versionId: value.versionId,
      sourceFileName: value.sourceFileName,
      createdAt: value.createdAt,
      summary,
      sourceEvidence,
      restoreRows,
      deleteCodes
    }
  };
}

export function makeDrugMasterDiffCsvFileName(versionId: string): string {
  return `yakureki_drug_master_diff_${versionId}.csv`;
}

export function makeDrugMasterRollbackFileName(versionId: string): string {
  return `yakureki_drug_master_rollback_${versionId}.json`;
}
