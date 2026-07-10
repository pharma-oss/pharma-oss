import type { PrescriptionItem, SoapRecord, Visit } from '@/db/types';

export interface PrescriptionTimelineEntry {
  id: string;
  visitId: string;
  dateLabel: string;
  drugLabel: string;
  detail: string;
  change: '今回' | '処方' | '変更';
  active: boolean;
}

export interface SoapHistoryProblemSummary {
  title: string;
  snippets: {
    type: 'S' | 'O' | 'A' | 'P';
    text: string;
  }[];
}

export interface SoapHistoryTimelineEntry {
  visitId: string;
  dateLabel: string;
  visitLabel: string;
  problems: SoapHistoryProblemSummary[];
}

type DrugNameLookup = Map<string, string> | Record<string, string>;

function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim();
}

function visitDateValue(visit?: Partial<Visit>): string {
  return visit?.prescriptionDate || visit?.dispensingDate || visit?.issueDate || '';
}

function dateSortValue(date: string): number {
  const parsed = new Date(date.replace(/\//g, '-')).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function formatEmrHistoryDate(date: string): string {
  const parsed = new Date(date.replace(/\//g, '-'));
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}/${parsed.getMonth() + 1}/${parsed.getDate()}`;
  }
  return normalizeText(date).replace(/-/g, '/').slice(0, 10) || '日付未設定';
}

function drugNameFromLookup(lookup: DrugNameLookup | undefined, drugId: string): string | undefined {
  if (!lookup || !drugId) return undefined;
  if (lookup instanceof Map) return lookup.get(drugId);
  return lookup[drugId];
}

function isSubstitutionLabel(value: string): boolean {
  return !!value && !['変更なし', '変更調剤なし'].includes(value);
}

export function normalizeSoapProblemTitle(title: string): string {
  return normalizeText(title)
    .replace(/^#\s*\d+\s*/u, '')
    .replace(/^＃\s*\d+\s*/u, '')
    .trim();
}

export function buildPastProblemSuggestions(
  soapRecords: Array<Pick<SoapRecord, 'problems'>>,
  options: { max?: number } = {}
): string[] {
  const max = options.max ?? 8;
  const counts = new Map<string, { count: number; firstIndex: number }>();
  let index = 0;

  for (const record of soapRecords) {
    for (const problem of record.problems || []) {
      const title = normalizeSoapProblemTitle(problem.title);
      if (!title) continue;
      const current = counts.get(title);
      if (current) {
        current.count += 1;
      } else {
        counts.set(title, { count: 1, firstIndex: index });
      }
      index += 1;
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count || a[1].firstIndex - b[1].firstIndex || a[0].localeCompare(b[0], 'ja'))
    .slice(0, max)
    .map(([title]) => title);
}

export function buildPrescriptionTimeline(params: {
  visits: Visit[];
  items: PrescriptionItem[];
  currentVisitId?: string;
  drugNamesById?: DrugNameLookup;
  maxEntries?: number;
}): PrescriptionTimelineEntry[] {
  const currentVisitId = normalizeText(params.currentVisitId);
  const maxEntries = params.maxEntries ?? 8;
  const itemsByVisit = new Map<string, PrescriptionItem[]>();

  for (const item of params.items) {
    const visitItems = itemsByVisit.get(item.visitId) || [];
    visitItems.push(item);
    itemsByVisit.set(item.visitId, visitItems);
  }

  const entries: PrescriptionTimelineEntry[] = [];
  const visits = [...params.visits]
    .filter((visit) => visit.status !== 'cancelled')
    .sort((a, b) => dateSortValue(visitDateValue(b)) - dateSortValue(visitDateValue(a)));

  for (const visit of visits) {
    const visitItems = [...(itemsByVisit.get(visit.visitId) || [])].sort((a, b) => (
      (a.rpNumber ?? 0) - (b.rpNumber ?? 0) || a.itemId.localeCompare(b.itemId)
    ));
    for (const item of visitItems) {
      const prescribedName = drugNameFromLookup(params.drugNamesById, item.drugId) || item.drugId || '薬品名未設定';
      const dispensedDrug = normalizeText(item.dispensedDrug);
      const substituted = isSubstitutionLabel(dispensedDrug);
      const drugLabel = substituted ? dispensedDrug : prescribedName;
      const usage = normalizeText(item.usage);
      const amount = Number.isFinite(item.amount) ? `${item.amount}` : '';
      const days = Number.isFinite(item.days) ? `${item.days}日分` : '';
      const detail = [usage, amount ? `1日量 ${amount}` : '', days].filter(Boolean).join(' / ');
      const active = !!currentVisitId && visit.visitId === currentVisitId;

      entries.push({
        id: `${visit.visitId}-${item.itemId}`,
        visitId: visit.visitId,
        dateLabel: formatEmrHistoryDate(visitDateValue(visit)),
        drugLabel,
        detail,
        change: active ? '今回' : substituted ? '変更' : '処方',
        active
      });
      if (entries.length >= maxEntries) return entries;
    }
  }

  return entries;
}

export function buildSoapHistoryTimeline(params: {
  visits: Visit[];
  soapRecords: SoapRecord[];
  currentVisitId?: string;
  maxEntries?: number;
}): SoapHistoryTimelineEntry[] {
  const currentVisitId = normalizeText(params.currentVisitId);
  const maxEntries = params.maxEntries ?? 6;
  const visitById = new Map(params.visits.map((visit) => [visit.visitId, visit]));

  const entries: SoapHistoryTimelineEntry[] = [];
  for (const record of params.soapRecords) {
    if (currentVisitId && record.visitId === currentVisitId) continue;
    const visit = visitById.get(record.visitId);
    if (!visit || visit.status === 'cancelled') continue;

    const problems = (record.problems || [])
      .map((problem) => ({
        title: normalizeSoapProblemTitle(problem.title) || 'プロブレム未設定',
        snippets: (problem.entries || [])
          .map((entry) => ({
            type: entry.type,
            text: normalizeText(entry.text)
          }))
          .filter((entry) => entry.text.length > 0)
          .slice(0, 4)
      }))
      .filter((problem) => problem.snippets.length > 0);

    if (problems.length === 0) continue;
    const date = visitDateValue(visit);
    const provider = [visit.institutionName, visit.departmentName, visit.doctorName ? `${visit.doctorName}医師` : '']
      .map(normalizeText)
      .filter(Boolean)
      .join(' / ');
    entries.push({
      visitId: record.visitId,
      dateLabel: formatEmrHistoryDate(date),
      visitLabel: provider || '医療機関未登録',
      problems
    });
  }

  return entries
    .sort((a, b) => {
      const visitA = visitById.get(a.visitId);
      const visitB = visitById.get(b.visitId);
      return dateSortValue(visitDateValue(visitB)) - dateSortValue(visitDateValue(visitA));
    })
    .slice(0, maxEntries);
}
