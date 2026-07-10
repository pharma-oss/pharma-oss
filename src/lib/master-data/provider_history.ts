import type { Visit } from '@/db/types';

export interface ProviderHistoryOption {
  key: string;
  institutionCode: string;
  institutionName: string;
  departments: string[];
  doctors: string[];
  lastSeen: string;
}

export function buildProviderHistory(visits: Visit[], limit = 20): ProviderHistoryOption[] {
  const historyMap = new Map<string, ProviderHistoryOption>();

  for (const visit of visits) {
    const visitInstitutionName = visit.institutionName?.trim() || '';
    const visitInstitutionCode = visit.institutionCode?.trim() || '';
    if (!visitInstitutionName && !visitInstitutionCode) continue;

    const key = visitInstitutionCode || visitInstitutionName;
    const existing = historyMap.get(key);
    const next = existing || {
      key,
      institutionCode: visitInstitutionCode,
      institutionName: visitInstitutionName,
      departments: [],
      doctors: [],
      lastSeen: visit.issueDate
    };

    if (visitInstitutionCode && !next.institutionCode) next.institutionCode = visitInstitutionCode;
    if (visitInstitutionName && !next.institutionName) next.institutionName = visitInstitutionName;
    if (visit.departmentName && !next.departments.includes(visit.departmentName)) next.departments.push(visit.departmentName);
    if (visit.doctorName && !next.doctors.includes(visit.doctorName)) next.doctors.push(visit.doctorName);
    if (visit.issueDate > next.lastSeen) next.lastSeen = visit.issueDate;
    historyMap.set(key, next);
  }

  return Array.from(historyMap.values())
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, limit);
}

export function matchProviderHistory(
  history: ProviderHistoryOption[],
  input: { institutionCode?: string; institutionName?: string },
  limit = 6
): ProviderHistoryOption[] {
  const code = input.institutionCode?.trim() || '';
  const name = input.institutionName?.trim().toLowerCase() || '';

  return history.filter((provider) => {
    if (code && provider.institutionCode.includes(code)) return true;
    if (name && provider.institutionName.toLowerCase().includes(name)) return true;
    return !code && !name;
  }).slice(0, limit);
}
