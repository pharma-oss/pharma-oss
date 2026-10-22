// 処方入力で「最近選んだ薬品」を端末に覚えておく。薬局は同じ薬を繰り返し入力するため、
// 薬品欄を開いた瞬間に出せば、3文字打って候補から探す手間が省ける。
// 保存するのはコードと表示名だけ。選んだときにマスタから引き直すので、薬価や在庫が古くなることはない。

export const DRUG_RECENTS_STORAGE_KEY = 'yakureki:drug-recents:v1';
export const DRUG_RECENTS_LIMIT = 12;

export interface RecentDrug {
  code: string;
  name: string;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isRecentDrug(value: unknown): value is RecentDrug {
  return !!value
    && typeof (value as RecentDrug).code === 'string'
    && typeof (value as RecentDrug).name === 'string'
    && (value as RecentDrug).code !== ''
    && (value as RecentDrug).name !== '';
}

export function readDrugRecents(storage?: StorageLike | null): RecentDrug[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(DRUG_RECENTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecentDrug).slice(0, DRUG_RECENTS_LIMIT) : [];
  } catch {
    return [];
  }
}

export function pushDrugRecent(drug: RecentDrug, storage?: StorageLike | null): RecentDrug[] {
  const entry = { code: drug.code.trim(), name: drug.name.trim() };
  const current = readDrugRecents(storage);
  if (!isRecentDrug(entry)) return current;
  const next = [entry, ...current.filter((item) => item.code !== entry.code)].slice(0, DRUG_RECENTS_LIMIT);
  const store = resolveStorage(storage);
  if (!store) return next;
  try {
    store.setItem(DRUG_RECENTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても入力は続けられる(最近の薬品が残らないだけ)
  }
  return next;
}
