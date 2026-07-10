import type { DrugInfo } from '@/db/types';

export interface DrugInteractionPrescriptionItem {
  itemId?: string;
  drugId?: string;
  drugName: string;
  genericName?: string;
}

export interface DrugInteractionWarning {
  severity: 'danger' | 'warning';
  drug1: string;
  drug1ItemId?: string;
  drug2: string;
  clinicalEffect: string;
  mechanism?: string;
  sourceUrl: string;
}

export interface DrugInteractionCheckResult {
  warnings: DrugInteractionWarning[];
}

function normalizeForMatch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[\s　]/g, '');
}

function matchesTargetDrug(candidate: DrugInteractionPrescriptionItem, targetDrugName: string): boolean {
  const normalizedTarget = normalizeForMatch(targetDrugName);
  if (!normalizedTarget) return false;

  const normalizedGeneric = candidate.genericName ? normalizeForMatch(candidate.genericName) : '';
  if (normalizedGeneric && normalizedGeneric.includes(normalizedTarget)) return true;

  const normalizedName = normalizeForMatch(candidate.drugName);
  return normalizedName.includes(normalizedTarget);
}

export function findDrugInteractionWarnings(
  prescribedItems: DrugInteractionPrescriptionItem[],
  drugInfoByDrugName: Map<string, DrugInfo[]>
): DrugInteractionCheckResult {
  const warnings: DrugInteractionWarning[] = [];

  for (const item of prescribedItems) {
    const infos = drugInfoByDrugName.get(item.drugName);
    if (!infos || infos.length === 0) continue;
    const info = infos[0];

    for (const contra of info.contraindications || []) {
      const matched = prescribedItems.find(
        (other) => other !== item && contra.targetDrugs.some((targetDrug) => matchesTargetDrug(other, targetDrug))
      );
      if (matched) {
        warnings.push({
          severity: contra.severity,
          drug1: item.drugName,
          drug1ItemId: item.itemId,
          drug2: matched.drugName,
          clinicalEffect: contra.clinicalEffect,
          mechanism: contra.mechanism,
          sourceUrl: contra.sourceUrl
        });
      }
    }
  }

  return { warnings };
}
