import { createContext, useContext } from 'react';
import type { PharmacyDatabase } from './types.ts';

export const DatabaseContext = createContext<PharmacyDatabase | null | undefined>(undefined);

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (context === undefined && typeof window !== 'undefined') {
    // This could happen if the provider is missing
    console.warn('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}
