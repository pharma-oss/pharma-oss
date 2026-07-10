import type { DrugInfo } from '../db/types.ts';

type IndexedDrugInfo = {
  normalizedDrugName: string;
  value: DrugInfo;
};

let referenceDataPromise: Promise<DrugInfo[]> | null = null;
let referenceIndexPromise: Promise<{ byName: Map<string, DrugInfo[]>; rows: IndexedDrugInfo[] }> | null = null;

const normalizeDrugName = (value: string): string => value
  .normalize('NFKC')
  .replace(/\s+/g, '')
  .toLowerCase();

export async function loadDrugInfoReferenceData(): Promise<DrugInfo[]> {
  if (!referenceDataPromise) {
    referenceDataPromise = import('./data/drug_infos.json').then(({ default: data }) => (
      data as DrugInfo[]
    ));
  }
  return referenceDataPromise;
}

async function loadDrugInfoReferenceIndex() {
  if (!referenceIndexPromise) {
    referenceIndexPromise = loadDrugInfoReferenceData().then((data) => {
      const byName = new Map<string, DrugInfo[]>();
      const rows = data.map((value) => ({
        normalizedDrugName: normalizeDrugName(value.drugName),
        value
      }));
      for (const row of rows) {
        const matches = byName.get(row.normalizedDrugName) || [];
        matches.push(row.value);
        byName.set(row.normalizedDrugName, matches);
      }
      return { byName, rows };
    });
  }
  return referenceIndexPromise;
}

export async function getDrugInfoReferenceCount(): Promise<number> {
  return (await loadDrugInfoReferenceData()).length;
}

export async function findDrugInfosByDrugNames(drugNames: string[]): Promise<Map<string, DrugInfo[]>> {
  const index = await loadDrugInfoReferenceIndex();
  const result = new Map<string, DrugInfo[]>();
  for (const drugName of new Set(drugNames)) {
    const normalizedDrugName = normalizeDrugName(drugName);
    if (!normalizedDrugName) {
      result.set(drugName, []);
      continue;
    }
    const exactMatches = index.byName.get(normalizedDrugName);
    result.set(
      drugName,
      exactMatches || index.rows
        .filter((row) => row.normalizedDrugName.includes(normalizedDrugName))
        .map((row) => row.value)
    );
  }
  return result;
}
