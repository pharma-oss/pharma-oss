// 服薬指導補助（薬ごとの S/O/A/P 文例）の表示用の純粋関数。
// 文例は medication_guidances コレクションに薬ごとに登録し、EMR の「添付文書・服薬指導補助」カードから
// 編集中のプロブレムへ追記する。

export const GUIDANCE_ENTRY_TYPES = ['S', 'O', 'A', 'P'] as const;
export type GuidanceEntryType = typeof GUIDANCE_ENTRY_TYPES[number];

export interface GuidanceEntryLike {
  readonly id?: string;
  readonly type: string;
  readonly text: string;
}

export interface GuidanceDocumentLike {
  readonly id: string;
  readonly drugCode: string;
  readonly drugName?: string;
  readonly entries: ReadonlyArray<GuidanceEntryLike>;
  readonly updatedAt?: string;
}

export function isGuidanceEntryType(value: unknown): value is GuidanceEntryType {
  return typeof value === 'string' && (GUIDANCE_ENTRY_TYPES as readonly string[]).includes(value);
}

// 同じ薬が複数の明細にあっても1つにする（薬品コードで一意にする）。コードの無いものは名前で一意にする。
export function getUniquePrescribedDrugs<T extends { code?: string; name?: string }>(
  drugs: T[] | undefined | null
): T[] {
  const byKey = new Map<string, T>();
  for (const drug of drugs || []) {
    const key = drug.code || drug.name;
    if (!key || byKey.has(key)) continue;
    byKey.set(key, drug);
  }
  return Array.from(byKey.values());
}

// 保存されている文例のうち、追記できるもの（種別が S/O/A/P で、本文が空でないもの）だけを返す。
// 同期やバックアップから来た値が壊れていても、EMR の SOAP 欄を壊さない。
export function getUsableGuidanceEntries(
  entries: ReadonlyArray<GuidanceEntryLike> | undefined | null
): Array<{ type: GuidanceEntryType; text: string }> {
  const usable: Array<{ type: GuidanceEntryType; text: string }> = [];
  for (const entry of entries || []) {
    if (!entry || !isGuidanceEntryType(entry.type)) continue;
    if (typeof entry.text !== 'string' || entry.text.trim() === '') continue;
    usable.push({ type: entry.type, text: entry.text });
  }
  return usable;
}

// 同じ薬の文書が複数ある場合（2台の端末がオフラインで同じ薬の文例を作って同期したときなど）に、
// 表示・編集する1件を決める。更新日時が最新のもの、同時刻なら id が小さいもの。入力の並びに依らない。
// 選ばれなかった文書は消さず、表示しないだけにする。
export function pickGuidanceDocument<T extends { id: string; updatedAt?: string }>(
  docs: ReadonlyArray<T>
): T | null {
  const time = (doc: T) => {
    const parsed = doc.updatedAt ? Date.parse(doc.updatedAt) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
  };
  let picked: T | null = null;
  for (const doc of docs) {
    if (!picked) {
      picked = doc;
      continue;
    }
    // 日付の無いもの同士は -Infinity どうしになり、引き算は NaN になるので、大小を直接比べる
    const docTime = time(doc);
    const pickedTime = time(picked);
    if (docTime > pickedTime || (docTime === pickedTime && doc.id < picked.id)) {
      picked = doc;
    }
  }
  return picked;
}

export function getGuidanceDuplicateNotice(documentCount: number): string | null {
  if (documentCount <= 1) return null;
  return `同じ薬の文例が${documentCount}件登録されています。更新日時が最新のものを表示・編集しています。`;
}

// 薬品コードごとの文例。同じ薬の文書が複数あるときは pickGuidanceDocument で選んだ1件の文例を使う。
export function buildGuidanceEntriesByDrugCode(
  docs: ReadonlyArray<GuidanceDocumentLike>
): Record<string, Array<{ type: GuidanceEntryType; text: string }>> {
  const docsByDrugCode = new Map<string, GuidanceDocumentLike[]>();
  for (const doc of docs) {
    const group = docsByDrugCode.get(doc.drugCode);
    if (group) group.push(doc);
    else docsByDrugCode.set(doc.drugCode, [doc]);
  }
  const byDrugCode: Record<string, Array<{ type: GuidanceEntryType; text: string }>> = {};
  for (const [drugCode, group] of docsByDrugCode) {
    const picked = pickGuidanceDocument(group);
    byDrugCode[drugCode] = picked ? getUsableGuidanceEntries(picked.entries) : [];
  }
  return byDrugCode;
}

export type GuidanceLoadStatus = 'loading' | 'ready' | 'error';

export const GUIDANCE_LOADING_MESSAGE = '読み込み中...';
export const GUIDANCE_EMPTY_MESSAGE = 'マニュアル未登録';
export const GUIDANCE_LOAD_ERROR_MESSAGE =
  '服薬指導マニュアルの読み込みに失敗したため、登録済みの文例を確認できません。再読み込みして確認してください。';
export const GUIDANCE_LOAD_ERROR_TOAST = '服薬指導マニュアルの読み込みに失敗しました。';

export type GuidanceDropdownState =
  | { status: 'loading'; message: string }
  | { status: 'error'; message: string }
  | { status: 'empty'; message: string }
  | { status: 'list'; message: null };

// ドロップダウンの中身の判定。読み込みの失敗は「マニュアル未登録」と区別する。
export function getGuidanceDropdownState(params: {
  loadStatus: GuidanceLoadStatus;
  entryCount: number;
}): GuidanceDropdownState {
  if (params.loadStatus === 'error') {
    return { status: 'error', message: GUIDANCE_LOAD_ERROR_MESSAGE };
  }
  if (params.loadStatus === 'loading') {
    return { status: 'loading', message: GUIDANCE_LOADING_MESSAGE };
  }
  if (params.entryCount === 0) {
    return { status: 'empty', message: GUIDANCE_EMPTY_MESSAGE };
  }
  return { status: 'list', message: null };
}

// 添付文書のリンクとして開いてよい URL（http / https のみ）。マスタの値が壊れていても javascript: などは開かない。
export function getSafeDocumentUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  return /^https?:\/\//i.test(url) ? url : null;
}
