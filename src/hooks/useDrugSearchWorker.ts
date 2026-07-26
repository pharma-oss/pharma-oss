'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  indexDrugRecords,
  searchIndexedDrugs,
  type DrugMasterRecord,
  type IndexedDrugRecord,
  type WorkerOutgoingMessage
} from '@/workers/drug_search.worker';

export interface UseDrugSearchWorkerReturn {
  isInitialized: boolean;
  isSearching: boolean;
  results: DrugMasterRecord[];
  initialize: (records: DrugMasterRecord[]) => void;
  search: (query: string, limit?: number) => void;
  searchSyncFallback: (query: string, limit?: number) => DrugMasterRecord[];
}

export function useDrugSearchWorker(
  initialRecords?: DrugMasterRecord[],
  debounceMs = 120
): UseDrugSearchWorkerReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<DrugMasterRecord[]>([]);

  const workerRef = useRef<Worker | null>(null);
  const indexedFallbackRef = useRef<IndexedDrugRecord[]>([]);
  const pendingQueryRef = useRef<{ query: string; limit?: number } | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentRequestIdRef = useRef<number>(0);

  const syncInitialize = useCallback((records: DrugMasterRecord[]) => {
    indexedFallbackRef.current = indexDrugRecords(records);
    setIsInitialized(true);
  }, []);

  const initialize = useCallback((records: DrugMasterRecord[]) => {
    if (!records || records.length === 0) return;

    syncInitialize(records);

    if (typeof window !== 'undefined' && typeof window.Worker !== 'undefined') {
      try {
        if (workerRef.current) {
          workerRef.current.terminate();
        }

        const worker = new Worker(
          new URL('../workers/drug_search.worker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
          const msg = event.data;
          if (!msg || !msg.type) return;

          if (msg.type === 'INIT_DONE') {
            setIsInitialized(true);
          } else if (msg.type === 'SEARCH_RESULTS') {
            if (Number(msg.payload.id) === currentRequestIdRef.current) {
              setResults(msg.payload.results);
              setIsSearching(false);
            }
          }
        };

        worker.onerror = (err) => {
          console.warn('[useDrugSearchWorker] Worker error, falling back to sync search:', err);
          workerRef.current = null;
        };

        worker.postMessage({ type: 'INIT', payload: records });
        workerRef.current = worker;
      } catch (err) {
        console.warn('[useDrugSearchWorker] Failed to create Worker, using sync fallback:', err);
        workerRef.current = null;
      }
    }
  }, [syncInitialize]);

  useEffect(() => {
    if (initialRecords && initialRecords.length > 0) {
      initialize(initialRecords);
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [initialRecords, initialize]);

  const searchSyncFallback = useCallback(
    (query: string, limit = 50): DrugMasterRecord[] => {
      return searchIndexedDrugs(indexedFallbackRef.current, query, limit);
    },
    []
  );

  const executeSearch = useCallback((query: string, limit = 50) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    if (workerRef.current) {
      const requestId = Date.now();
      currentRequestIdRef.current = requestId;
      workerRef.current.postMessage({
        type: 'SEARCH',
        payload: { id: String(requestId), query: trimmed, limit }
      });
    } else {
      const res = searchSyncFallback(trimmed, limit);
      setResults(res);
      setIsSearching(false);
    }
  }, [searchSyncFallback]);

  const search = useCallback(
    (query: string, limit = 50) => {
      pendingQueryRef.current = { query, limit };
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        if (pendingQueryRef.current) {
          executeSearch(pendingQueryRef.current.query, pendingQueryRef.current.limit);
        }
      }, debounceMs);
    },
    [debounceMs, executeSearch]
  );

  return {
    isInitialized,
    isSearching,
    results,
    initialize,
    search,
    searchSyncFallback
  };
}
