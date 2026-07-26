import type { DrugMasterRecord } from '@/lib/master-data/types';

export type { DrugMasterRecord };

export type WorkerInitMessage = {
  type: 'INIT';
  payload: DrugMasterRecord[];
};

export type WorkerSearchMessage = {
  type: 'SEARCH';
  payload: {
    id: string;
    query: string;
    limit?: number;
  };
};

export type WorkerIncomingMessage = WorkerInitMessage | WorkerSearchMessage;

export type WorkerInitDoneResponse = {
  type: 'INIT_DONE';
  payload: {
    count: number;
  };
};

export type WorkerSearchResultsResponse = {
  type: 'SEARCH_RESULTS';
  payload: {
    id: string;
    results: DrugMasterRecord[];
  };
};

export type WorkerOutgoingMessage = WorkerInitDoneResponse | WorkerSearchResultsResponse;

export function normalizeKatakanaToHiragana(str: string): string {
  return str.replace(/[\u30a1-\u30f6]/g, (match) =>
    String.fromCharCode(match.charCodeAt(0) - 0x60)
  );
}

export function normalizeSearchString(str?: string): string {
  if (!str) return '';
  const halfWidth = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
    String.fromCharCode(s.charCodeAt(0) - 0xfee0)
  );
  return normalizeKatakanaToHiragana(halfWidth.toLowerCase().trim());
}

export interface IndexedDrugRecord {
  record: DrugMasterRecord;
  normName: string;
  normGeneric: string;
  normYj: string;
  normJan: string;
  normCode: string;
}

let indexedRecords: IndexedDrugRecord[] = [];

export function indexDrugRecords(records: DrugMasterRecord[]): IndexedDrugRecord[] {
  return records.map((record) => ({
    record,
    normName: normalizeSearchString(record.name),
    normGeneric: normalizeSearchString(record.genericName),
    normYj: normalizeSearchString(record.yjCode),
    normJan: normalizeSearchString(record.janCode),
    normCode: normalizeSearchString(record.code)
  }));
}

export function searchIndexedDrugs(
  indexed: IndexedDrugRecord[],
  query: string,
  limit = 50
): DrugMasterRecord[] {
  const normQuery = normalizeSearchString(query);
  if (!normQuery) return [];

  const scoredResults: { record: DrugMasterRecord; score: number }[] = [];

  for (let i = 0; i < indexed.length; i++) {
    const item = indexed[i];
    let score = 0;

    if (item.normName === normQuery) {
      score += 100;
    } else if (item.normName.startsWith(normQuery)) {
      score += 70;
    } else if (item.normName.includes(normQuery)) {
      score += 40;
    }

    if (item.normGeneric === normQuery) {
      score += 80;
    } else if (item.normGeneric.startsWith(normQuery)) {
      score += 50;
    } else if (item.normGeneric.includes(normQuery)) {
      score += 30;
    }

    if (item.normYj.startsWith(normQuery) || item.normJan.startsWith(normQuery) || item.normCode.startsWith(normQuery)) {
      score += 90;
    }

    if (score > 0) {
      scoredResults.push({ record: item.record, score });
    }
  }

  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults.slice(0, limit).map((r) => r.record);
}

const isWorkerEnvironment = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
if (isWorkerEnvironment && typeof self.postMessage === 'function') {
  self.addEventListener('message', (event: MessageEvent<WorkerIncomingMessage>) => {
    const message = event.data;
    if (!message || !message.type) return;

    if (message.type === 'INIT') {
      indexedRecords = indexDrugRecords(message.payload || []);
      const response: WorkerInitDoneResponse = {
        type: 'INIT_DONE',
        payload: { count: indexedRecords.length }
      };
      self.postMessage(response);
    } else if (message.type === 'SEARCH') {
      const { id, query, limit } = message.payload;
      const results = searchIndexedDrugs(indexedRecords, query, limit || 50);
      const response: WorkerSearchResultsResponse = {
        type: 'SEARCH_RESULTS',
        payload: { id, results }
      };
      self.postMessage(response);
    }
  });
}
