export type PrescriptionHistoryChangeKind = 'added' | 'stopped' | 'changed' | 'unchanged';

export interface PrescriptionHistoryItem {
  id?: string;
  drugCode?: string;
  drugName?: string;
  dispensedDrug?: string;
  amount?: string | number;
  usage?: string;
  days?: string | number;
  yjCode?: string;
  genericName?: string;
}

export interface PrescriptionHistoryFieldChange {
  field: 'amount' | 'usage' | 'days';
  label: string;
  before: string;
  after: string;
}

export interface PrescriptionHistoryChange {
  kind: PrescriptionHistoryChangeKind;
  label: string;
  current?: PrescriptionHistoryItem;
  previous?: PrescriptionHistoryItem;
  fieldChanges: PrescriptionHistoryFieldChange[];
}

export interface PrescriptionHistoryComparison {
  changes: PrescriptionHistoryChange[];
  addedCount: number;
  stoppedCount: number;
  changedCount: number;
  unchangedCount: number;
}

export interface PrescriptionHistorySnapshot {
  visitId: string;
  dateLabel: string;
  institutionName?: string;
  items: PrescriptionHistoryItem[];
}

export interface PrescriptionHistoryTimelineEntry {
  snapshot: PrescriptionHistorySnapshot;
  comparison: PrescriptionHistoryComparison;
}

const normalizeText = (value: unknown) => String(value ?? '').trim();
const NO_SUBSTITUTION_LABELS = new Set(['変更なし', '変更調剤なし']);

const normalizeDrugKey = (value: string) => (
  value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[「」"']/g, '')
);

const formatNumber = (value: number) => (
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '')
);

const normalizeComparableNumber = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return '';
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return text;
  return formatNumber(number);
};

const getDrugKey = (item: PrescriptionHistoryItem) => {
  const drugCode = normalizeText(item.drugCode);
  if (drugCode) return `code:${drugCode}`;
  const yjCode = normalizeText(item.yjCode);
  if (yjCode) return `yj:${yjCode}`;
  const genericName = normalizeText(item.genericName);
  if (genericName) return `generic:${normalizeDrugKey(genericName)}`;
  const drugName = normalizeText(item.drugName || item.dispensedDrug);
  if (drugName) return `name:${normalizeDrugKey(drugName)}`;
  return '';
};

const getDrugLabel = (item: PrescriptionHistoryItem, fallback: string) => {
  const dispensedDrug = normalizeText(item.dispensedDrug);
  if (dispensedDrug && !NO_SUBSTITUTION_LABELS.has(dispensedDrug)) return dispensedDrug;
  return normalizeText(item.drugName) || fallback;
};

const getFieldChanges = (current: PrescriptionHistoryItem, previous: PrescriptionHistoryItem) => {
  const fields: PrescriptionHistoryFieldChange[] = [];
  const amountBefore = normalizeComparableNumber(previous.amount);
  const amountAfter = normalizeComparableNumber(current.amount);
  const daysBefore = normalizeComparableNumber(previous.days);
  const daysAfter = normalizeComparableNumber(current.days);
  const usageBefore = normalizeText(previous.usage);
  const usageAfter = normalizeText(current.usage);

  if (amountBefore !== amountAfter) {
    fields.push({ field: 'amount', label: '1日量', before: amountBefore || '-', after: amountAfter || '-' });
  }
  if (usageBefore !== usageAfter) {
    fields.push({ field: 'usage', label: '用法', before: usageBefore || '-', after: usageAfter || '-' });
  }
  if (daysBefore !== daysAfter) {
    fields.push({ field: 'days', label: '日数', before: daysBefore ? `${daysBefore}日` : '-', after: daysAfter ? `${daysAfter}日` : '-' });
  }

  return fields;
};

export function comparePrescriptionHistory(
  currentItems: PrescriptionHistoryItem[],
  previousItems: PrescriptionHistoryItem[]
): PrescriptionHistoryComparison {
  const previousByKey = new Map<string, PrescriptionHistoryItem[]>();
  const matchedPrevious = new Set<PrescriptionHistoryItem>();
  const changes: PrescriptionHistoryChange[] = [];

  for (const previous of previousItems) {
    const key = getDrugKey(previous);
    if (!key) continue;
    const bucket = previousByKey.get(key) || [];
    bucket.push(previous);
    previousByKey.set(key, bucket);
  }

  for (let index = 0; index < currentItems.length; index++) {
    const current = currentItems[index];
    const key = getDrugKey(current);
    const label = getDrugLabel(current, `今回薬品${index + 1}`);
    const previous = key
      ? (previousByKey.get(key) || []).find((candidate) => !matchedPrevious.has(candidate))
      : undefined;

    if (!previous) {
      changes.push({
        kind: 'added',
        label,
        current,
        fieldChanges: []
      });
      continue;
    }

    matchedPrevious.add(previous);
    const fieldChanges = getFieldChanges(current, previous);
    changes.push({
      kind: fieldChanges.length > 0 ? 'changed' : 'unchanged',
      label,
      current,
      previous,
      fieldChanges
    });
  }

  for (let index = 0; index < previousItems.length; index++) {
    const previous = previousItems[index];
    if (matchedPrevious.has(previous)) continue;
    changes.push({
      kind: 'stopped',
      label: getDrugLabel(previous, `前回薬品${index + 1}`),
      previous,
      fieldChanges: []
    });
  }

  const sortedChanges = changes.sort((a, b) => {
    const rank: Record<PrescriptionHistoryChangeKind, number> = {
      changed: 0,
      added: 1,
      stopped: 2,
      unchanged: 3
    };
    const rankDiff = rank[a.kind] - rank[b.kind];
    if (rankDiff !== 0) return rankDiff;
    return a.label.localeCompare(b.label, 'ja');
  });

  return {
    changes: sortedChanges,
    addedCount: sortedChanges.filter((change) => change.kind === 'added').length,
    stoppedCount: sortedChanges.filter((change) => change.kind === 'stopped').length,
    changedCount: sortedChanges.filter((change) => change.kind === 'changed').length,
    unchangedCount: sortedChanges.filter((change) => change.kind === 'unchanged').length
  };
}

export function comparePrescriptionHistoryTimeline(
  currentItems: PrescriptionHistoryItem[],
  snapshots: PrescriptionHistorySnapshot[],
  limit = 2
): PrescriptionHistoryTimelineEntry[] {
  return snapshots.slice(0, limit).map((snapshot) => ({
    snapshot,
    comparison: comparePrescriptionHistory(currentItems, snapshot.items)
  }));
}
