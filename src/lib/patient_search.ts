import { parseFlexibleDateInput } from '@/lib/date_input';

// 処方箋受付で既存患者を探すための検索。
//
// 検索欄に打った文字を空白で区切り、区切りごとに「何を探しているか」を判定して、全部に当てはまる患者に絞る。
//   - 生年月日 … 半角8桁(19850315)、1985-03-15、1985/3/15、1985年3月15日 のどれでも同じ日付として探す
//   - 数字4桁以上 … 生年月日の先頭(1985 や 198503)、または保険者番号の先頭
//   - それ以外 … 氏名・フリガナの一部(ひらがな/カタカナ、全角/半角、空白の有無は区別しない)
// 例) 「山田 19850315」は、氏名に山田を含み、生年月日が1985-03-15の患者。
//
// 全部に当てはまる患者がいないときは、一部だけ当てはまる患者を返す(matchKind: 'partial')。
// 処方箋の誤読(氏名の一文字違いなど)で既存患者が見つからず、二重に登録されるのを防ぐための安全網。

export interface SearchablePatient {
  patientId: string;
  name: string;
  kana?: string;
  birthDate: string;
  insuranceInfo?: {
    provider?: string;
    number?: string;
  };
}

export type PatientSearchRisk = 'low' | 'medium' | 'high';

export interface PatientSearchMatch<T extends SearchablePatient = SearchablePatient> {
  patient: T;
  score: number;
  /** all = 入力した条件すべてに一致。partial = 一部だけ一致(別人の可能性があるので選ぶ前に確認が要る)。 */
  matchKind: 'all' | 'partial';
  risk: PatientSearchRisk;
  reasonLabels: string[];
  warning?: string;
}

type SearchToken =
  | { kind: 'birthDate'; date: string }
  | { kind: 'digits'; digits: string }
  | { kind: 'text'; text: string };

/** 数字が3桁以下の区切り。入力の途中(19 など)なので、絞り込みの条件にしない。 */
const INCOMPLETE_DIGITS_MAX_LENGTH = 3;

function normalizeSearchText(value: string | undefined): string {
  return (value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
    .toLowerCase();
}

function digitsOf(value: string | undefined): string {
  return (value || '').normalize('NFKC').replace(/\D/g, '');
}

function tokenize(query: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  for (const raw of query.normalize('NFKC').split(/\s+/)) {
    if (!raw) continue;
    const date = parseFlexibleDateInput(raw);
    if (date) {
      tokens.push({ kind: 'birthDate', date });
      continue;
    }
    if (/^[\d\-/.]+$/.test(raw)) {
      const digits = digitsOf(raw);
      if (digits.length > INCOMPLETE_DIGITS_MAX_LENGTH) tokens.push({ kind: 'digits', digits });
      continue;
    }
    const text = normalizeSearchText(raw);
    if (text) tokens.push({ kind: 'text', text });
  }
  return tokens;
}

interface TokenMatch {
  score: number;
  label: string;
}

function matchText(patient: SearchablePatient, text: string): TokenMatch | null {
  const name = normalizeSearchText(patient.name);
  const kana = normalizeSearchText(patient.kana);
  let best: TokenMatch | null = null;
  const consider = (candidate: TokenMatch) => {
    if (!best || candidate.score > best.score) best = candidate;
  };
  if (name === text) consider({ score: 50, label: '氏名一致' });
  else if (name.startsWith(text)) consider({ score: 40, label: '氏名一致' });
  else if (name.includes(text)) consider({ score: 30, label: '氏名一致' });
  if (kana) {
    if (kana === text) consider({ score: 45, label: 'フリガナ一致' });
    else if (kana.startsWith(text)) consider({ score: 35, label: 'フリガナ一致' });
    else if (kana.includes(text)) consider({ score: 25, label: 'フリガナ一致' });
  }
  return best;
}

function matchDigits(patient: SearchablePatient, digits: string): TokenMatch | null {
  if (digitsOf(patient.birthDate).startsWith(digits)) {
    return { score: 15 + digits.length, label: '生年月日一致' };
  }
  const insurerNumbers = [patient.insuranceInfo?.provider, patient.insuranceInfo?.number]
    .map(digitsOf)
    .filter(Boolean);
  if (insurerNumbers.some((number) => number.startsWith(digits))) {
    return { score: 30, label: '保険者番号一致' };
  }
  return null;
}

function matchToken(patient: SearchablePatient, token: SearchToken): TokenMatch | null {
  if (token.kind === 'birthDate') {
    return patient.birthDate === token.date ? { score: 40, label: '生年月日一致' } : null;
  }
  if (token.kind === 'digits') return matchDigits(patient, token.digits);
  return matchText(patient, token.text);
}

export function searchPatients<T extends SearchablePatient>(
  patients: T[],
  query: string,
  limit = 8
): PatientSearchMatch<T>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const hasBirthCondition = tokens.some((token) => token.kind === 'birthDate');
  const hasNameCondition = tokens.some((token) => token.kind === 'text');
  const hasInsurerCondition = tokens.some((token) => token.kind === 'digits');

  const sameNameCounts = new Map<string, number>();
  for (const patient of patients) {
    const name = normalizeSearchText(patient.name);
    if (name) sameNameCounts.set(name, (sameNameCounts.get(name) ?? 0) + 1);
  }

  const allMatches: PatientSearchMatch<T>[] = [];
  const partialMatches: PatientSearchMatch<T>[] = [];
  for (const patient of patients) {
    let score = 0;
    let matchedCount = 0;
    const reasonLabels: string[] = [];
    for (const token of tokens) {
      const matched = matchToken(patient, token);
      if (!matched) continue;
      matchedCount += 1;
      score += matched.score;
      if (!reasonLabels.includes(matched.label)) reasonLabels.push(matched.label);
    }
    if (matchedCount === 0) continue;

    const isAll = matchedCount === tokens.length;
    const sameNameCount = sameNameCounts.get(normalizeSearchText(patient.name)) ?? 0;
    let risk: PatientSearchRisk = 'medium';
    let warning: string | undefined;
    if (!isAll) {
      risk = 'high';
      warning = '入力した条件の一部だけが一致しています。別の方ではないか、生年月日と氏名を確認してから選んでください。';
    } else if (sameNameCount > 1 && hasNameCondition && !hasBirthCondition && !hasInsurerCondition) {
      risk = 'high';
      warning = '同姓同名の患者が複数います。生年月日で確認してください。';
    } else if (hasNameCondition && hasBirthCondition) {
      risk = 'low';
    }

    (isAll ? allMatches : partialMatches).push({
      patient,
      score,
      matchKind: isAll ? 'all' : 'partial',
      risk,
      reasonLabels,
      warning
    });
  }

  // 全部に当てはまる患者がいれば、一部だけの候補は出さない(ほかの人を選ばせる誘因になるため)。
  // 条件が1つしかないときは「一部」が存在しない。
  const matches = allMatches.length > 0 ? allMatches : partialMatches;
  return matches
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.patient.name.localeCompare(b.patient.name, 'ja');
    })
    .slice(0, limit);
}

/** 処方箋・QR・マイナから読み取った氏名と生年月日を、検索欄に入れる文字列にする。 */
export function buildPatientSearchQuery(parts: { name?: string; birthDate?: string }): string {
  return [parts.name?.trim(), parts.birthDate?.trim()].filter(Boolean).join(' ');
}

/**
 * 検索欄に打った文字から、氏名と生年月日を取り出す。探して見つからなかった人を新規登録するときの初期値にする。
 * 生年月日として読めた区切りは生年月日に、数字だけの区切りは捨て、残りを氏名とする。
 */
export function extractPatientHintsFromQuery(query: string): { name: string; birthDate: string } {
  let birthDate = '';
  const nameParts: string[] = [];
  for (const raw of query.normalize('NFKC').split(/\s+/)) {
    if (!raw) continue;
    const date = parseFlexibleDateInput(raw);
    if (date) {
      if (!birthDate) birthDate = date;
      continue;
    }
    if (/^[\d\-/.]+$/.test(raw)) continue;
    nameParts.push(raw);
  }
  return { name: nameParts.join(' '), birthDate };
}
