import type { PharmacyDatabase, PrescriptionItem } from '@/db/types';
import { findElectronicUsageOptionByLabel } from '@/lib/master-data/usage_master';
import { logAuditAction } from '@/lib/audit';

/**
 * トラック A-2: PR-G2 以前の「3桁コード + 空白 + 用法名称」（例: "001 1日3回食後服用"）形式で
 * 保存された処方明細の用法を、スキーマ移行を伴わず監査付き・冪等に正規化するデータ移行モジュール。
 *
 * 金科玉条 第三条・第四条の遵守:
 * - 先頭3桁のレセプトコード接頭辞のみを除去する。
 * - 公式用法マスタの用法名称と完全一致した場合のみ 16桁電子処方箋用法コードを補完し、
 *   未一致の自由記載に対してコードを推定・捏造しない。
 */

const LEGACY_CODED_USAGE_PATTERN = /^(\d{3})[\s\u3000]+(.+)$/;

export interface ParsedLegacyCodedUsage {
  legacyCode: string;
  strippedUsage: string;
}

export interface LegacyUsageNormalizationPlan {
  itemId: string;
  legacyCode: string;
  beforeUsage: string;
  afterUsage: string;
  beforeElectronicUsageCode: string;
  afterElectronicUsageCode: string;
  matchedOfficialMaster: boolean;
}

export interface LegacyUsageMigrationResult {
  dryRun: boolean;
  scannedCount: number;
  matchedCount: number;
  updatedCount: number;
  changes: LegacyUsageNormalizationPlan[];
}

export function parseLegacyCodedUsage(rawUsage?: string): ParsedLegacyCodedUsage | null {
  if (!rawUsage) return null;
  const trimmed = rawUsage.trim();
  const match = LEGACY_CODED_USAGE_PATTERN.exec(trimmed);
  if (!match) return null;
  const strippedUsage = match[2].trim();
  if (!strippedUsage) return null;
  return {
    legacyCode: match[1],
    strippedUsage
  };
}

export function planLegacyUsageNormalization(
  item: Pick<PrescriptionItem, 'itemId' | 'usage' | 'electronicUsageCode'>
): LegacyUsageNormalizationPlan | null {
  const parsed = parseLegacyCodedUsage(item.usage);
  if (!parsed) return null;

  const existingCode = (item.electronicUsageCode || '').trim();
  const official = findElectronicUsageOptionByLabel(parsed.strippedUsage);
  const nextCode = existingCode || official?.prescriptionCode || '';

  return {
    itemId: item.itemId,
    legacyCode: parsed.legacyCode,
    beforeUsage: item.usage || '',
    afterUsage: parsed.strippedUsage,
    beforeElectronicUsageCode: existingCode,
    afterElectronicUsageCode: nextCode,
    matchedOfficialMaster: Boolean(official)
  };
}

export interface LegacyUsageMigrationOptions {
  dryRun?: boolean;
  logAudit?: (detail: string) => Promise<boolean>;
}

interface PatchablePrescriptionItemDoc {
  toJSON: () => PrescriptionItem;
  incrementalPatch: (patch: Partial<PrescriptionItem>) => Promise<unknown>;
}

export async function migrateLegacyCodedUsages(
  db: Pick<PharmacyDatabase, 'prescription_items'> & Partial<Pick<PharmacyDatabase, 'audit_logs'>>,
  options: LegacyUsageMigrationOptions = {}
): Promise<LegacyUsageMigrationResult> {
  const dryRun = options.dryRun === true;
  const docs = (await db.prescription_items.find().exec()) as unknown as PatchablePrescriptionItemDoc[];
  const matchedPairs: Array<{ doc: PatchablePrescriptionItemDoc; plan: LegacyUsageNormalizationPlan }> = [];

  for (const doc of docs) {
    const json = doc.toJSON();
    const plan = planLegacyUsageNormalization(json);
    if (plan) {
      matchedPairs.push({ doc, plan });
    }
  }

  if (dryRun || matchedPairs.length === 0) {
    return {
      dryRun,
      scannedCount: docs.length,
      matchedCount: matchedPairs.length,
      updatedCount: 0,
      changes: matchedPairs.map((pair) => pair.plan)
    };
  }

  const applied: Array<{ doc: PatchablePrescriptionItemDoc; plan: LegacyUsageNormalizationPlan }> = [];
  try {
    for (const pair of matchedPairs) {
      const patch: Partial<PrescriptionItem> = {
        usage: pair.plan.afterUsage
      };
      if (pair.plan.afterElectronicUsageCode !== pair.plan.beforeElectronicUsageCode) {
        patch.electronicUsageCode = pair.plan.afterElectronicUsageCode;
      }
      await pair.doc.incrementalPatch(patch);
      applied.push(pair);
    }

    const detail = `旧コード付き用法データ移行(A-2): 検査 ${docs.length}件 / 正規化 ${applied.length}件（公式コード補完 ${applied.filter((a) => a.plan.matchedOfficialMaster).length}件）`;
    const auditOk = options.logAudit
      ? await options.logAudit(detail)
      : db.audit_logs
        ? await logAuditAction(db as PharmacyDatabase, 'prescription_edit', detail)
        : true;

    if (!auditOk) {
      throw new Error('旧コード付き用法データ移行の監査ログ記録に失敗したため、変更を元に戻しました。');
    }

    return {
      dryRun: false,
      scannedCount: docs.length,
      matchedCount: matchedPairs.length,
      updatedCount: applied.length,
      changes: applied.map((pair) => pair.plan)
    };
  } catch (error) {
    for (const pair of applied) {
      try {
        await pair.doc.incrementalPatch({
          usage: pair.plan.beforeUsage,
          electronicUsageCode: pair.plan.beforeElectronicUsageCode
        });
      } catch (rollbackError) {
        console.error(`Failed to roll back legacy usage migration for ${pair.plan.itemId}:`, rollbackError);
      }
    }
    throw error;
  }
}
