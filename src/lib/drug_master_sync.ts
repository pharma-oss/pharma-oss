import type { Drug } from '../db/types.ts';
import {
  buildDrugMasterUpdateArtifacts,
  validateDrugMasterRollbackPayload,
  type DrugMasterChangeRecord,
  type DrugMasterRollbackPayload,
  type DrugMasterSourceEvidence,
  type DrugMasterUpdateSummary
} from './drug_master_version.ts';

export interface DrugMasterSyncPreview {
  versionId: string;
  summary: DrugMasterUpdateSummary;
  changes: DrugMasterChangeRecord[];
  rollbackPayload: DrugMasterRollbackPayload;
  nextDrugList: Drug[];
}

export function buildDrugMasterSyncPreview({
  currentDrugs,
  incomingDrugs,
  sourceEvidence,
  createdAt = new Date()
}: {
  currentDrugs: Drug[];
  incomingDrugs: Drug[];
  sourceEvidence?: DrugMasterSourceEvidence;
  createdAt?: Date;
}): DrugMasterSyncPreview {
  const artifacts = buildDrugMasterUpdateArtifacts({
    sourceFileName: sourceEvidence?.sourceFileName || 'incoming_drug_master.csv',
    beforeRows: currentDrugs,
    afterRows: incomingDrugs,
    createdAt,
    sourceEvidence
  });

  const incomingMap = new Map<string, Drug>();
  for (const d of incomingDrugs) {
    incomingMap.set(d.code, d);
  }

  // Next drug list after sync
  const nextDrugMap = new Map<string, Drug>();
  for (const d of currentDrugs) {
    if (incomingMap.has(d.code)) {
      nextDrugMap.set(d.code, incomingMap.get(d.code)!);
    } else {
      // Retain or mark abolished
      nextDrugMap.set(d.code, { ...d, isAbolished: true });
    }
  }
  for (const d of incomingDrugs) {
    if (!nextDrugMap.has(d.code)) {
      nextDrugMap.set(d.code, d);
    }
  }

  return {
    versionId: artifacts.versionId,
    summary: artifacts.summary,
    changes: artifacts.changes,
    rollbackPayload: artifacts.rollback,
    nextDrugList: Array.from(nextDrugMap.values())
  };
}

export function applyDrugMasterRollback({
  currentDrugs,
  rollbackPayload
}: {
  currentDrugs: Drug[];
  rollbackPayload: DrugMasterRollbackPayload;
}): { ok: boolean; reason?: string; restoredDrugs?: Drug[] } {
  const val = validateDrugMasterRollbackPayload(rollbackPayload);
  if (!val.ok) {
    return { ok: false, reason: val.reason };
  }

  const map = new Map<string, Drug>();
  for (const d of currentDrugs) {
    map.set(d.code, d);
  }

  // 1. Delete codes that were newly added in that update
  for (const code of rollbackPayload.deleteCodes) {
    map.delete(code);
  }

  // 2. Restore rows that were modified or abolished
  for (const row of rollbackPayload.restoreRows) {
    map.set(row.code, row);
  }

  return {
    ok: true,
    restoredDrugs: Array.from(map.values())
  };
}
