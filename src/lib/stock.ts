export interface StockCalculationItem {
  drugId: string;
  dispensedDrugCode?: string;
  amount: number;
  days?: number;
}

export interface StockLotLike {
  quantity: number;
}

export interface StockLotGs1MatchCandidate extends StockLotLike {
  id?: string;
  janCode?: string;
  lotNumber?: string;
  expirationDate?: string;
  arrivalDate?: string;
}

export interface ParsedGs1Barcode {
  raw: string;
  gtin?: string;
  expirationDate?: string;
  lotNumber?: string;
  serialNumber?: string;
  candidates: string[];
}

export interface Gs1MatchTarget {
  stockDrugId: string;
  yjCode?: string;
  janCodes?: string[];
}

export interface Gs1MatchResult {
  matched: boolean;
  parsed: ParsedGs1Barcode;
  expectedCodes: string[];
  matchedCode?: string;
}

export interface StockShortage {
  drugId: string;
  requiredAmount: number;
  availableAmount: number;
  shortageAmount: number;
}

function toSafeAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

export function calculateRequiredStockAmount(item: StockCalculationItem): number {
  const amount = toSafeAmount(item.amount);
  if (amount === 0) return 0;

  const days = toSafeAmount(item.days);
  if (days === 0) {
    return amount;
  }

  return amount * days;
}

export function getStockDrugId(item: StockCalculationItem): string {
  return item.dispensedDrugCode || item.drugId;
}

function toHalfWidth(value: string): string {
  return value.replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
}

export function normalizeGs1ComparableCode(value: unknown): string {
  if (value === undefined || value === null) return '';
  return toHalfWidth(String(value))
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')
    .replace(/[^0-9A-Z]/g, '');
}

function formatGs1Date(value: string): string | undefined {
  if (!/^\d{6}$/.test(value)) return undefined;
  const yy = Number(value.slice(0, 2));
  const mm = value.slice(2, 4);
  const dd = value.slice(4, 6);
  const yyyy = yy >= 80 ? 1900 + yy : 2000 + yy;
  if (dd === '00') return `${yyyy}-${mm}`;
  return `${yyyy}-${mm}-${dd}`;
}

function addCodeVariant(set: Set<string>, code: unknown) {
  const normalized = normalizeGs1ComparableCode(code);
  if (!normalized) return;

  set.add(normalized);

  if (normalized.length === 13) {
    set.add(`0${normalized}`);
  }

  if (normalized.length === 14 && normalized.startsWith('0')) {
    set.add(normalized.slice(1));
  }

  if (normalized.startsWith('01') && normalized.length >= 16) {
    const gtin = normalized.slice(2, 16);
    set.add(gtin);
    if (gtin.startsWith('0')) set.add(gtin.slice(1));
  }
}

function normalizeLotComparable(value: unknown): string {
  return normalizeGs1ComparableCode(value);
}

function expirationDateMatches(scanDate: string | undefined, stockDate: string | undefined): boolean {
  if (!scanDate || !stockDate) return false;
  if (scanDate === stockDate) return true;
  if (/^\d{4}-\d{2}$/.test(scanDate)) return stockDate.startsWith(`${scanDate}-`);
  if (/^\d{4}-\d{2}$/.test(stockDate)) return scanDate.startsWith(`${stockDate}-`);
  return false;
}

function parseParenthesizedGs1(input: string, parsed: ParsedGs1Barcode) {
  const aiPattern = /\((\d{2,4})\)([^(]*)/g;
  let match: RegExpExecArray | null;

  while ((match = aiPattern.exec(input)) !== null) {
    const ai = match[1];
    const value = match[2].trim();
    if (!value) continue;

    if (ai === '01') {
      parsed.gtin = normalizeGs1ComparableCode(value).slice(0, 14);
    } else if (ai === '17') {
      parsed.expirationDate = formatGs1Date(normalizeGs1ComparableCode(value).slice(0, 6));
    } else if (ai === '10') {
      parsed.lotNumber = value;
    } else if (ai === '21') {
      parsed.serialNumber = value;
    }
  }
}

function parsePlainGs1(input: string, parsed: ParsedGs1Barcode) {
  const groupSeparator = '\u001d';
  const normalized = toHalfWidth(input).replace(/\s+/g, '');
  const compact = normalizeGs1ComparableCode(normalized);

  if (/^\d{14}$/.test(compact)) {
    parsed.gtin = compact;
    return;
  }

  let cursor = 0;
  if (compact.startsWith('01') && compact.length >= 16) {
    parsed.gtin = compact.slice(2, 16);
    cursor = 16;
  }

  while (cursor < normalized.length) {
    const ai = normalized.slice(cursor, cursor + 2);
    if (ai === '17') {
      const value = normalizeGs1ComparableCode(normalized.slice(cursor + 2, cursor + 8));
      parsed.expirationDate = formatGs1Date(value);
      cursor += 8;
      continue;
    }

    if (ai === '10' || ai === '21') {
      const start = cursor + 2;
      const separatorIndex = normalized.indexOf(groupSeparator, start);
      const value = separatorIndex === -1 ? normalized.slice(start) : normalized.slice(start, separatorIndex);
      if (ai === '10') parsed.lotNumber = value;
      if (ai === '21') parsed.serialNumber = value;
      cursor = separatorIndex === -1 ? normalized.length : separatorIndex + 1;
      continue;
    }

    cursor += 1;
  }
}

export function parseGs1Barcode(input: string): ParsedGs1Barcode {
  const raw = toHalfWidth(input || '').trim();
  const parsed: ParsedGs1Barcode = {
    raw,
    candidates: []
  };

  if (raw.includes('(')) {
    parseParenthesizedGs1(raw, parsed);
  } else {
    parsePlainGs1(raw, parsed);
  }

  const candidates = new Set<string>();
  addCodeVariant(candidates, raw);
  addCodeVariant(candidates, parsed.gtin);
  parsed.candidates = Array.from(candidates);

  return parsed;
}

export function getExpectedGs1Codes(target: Gs1MatchTarget): string[] {
  const expectedCodes = new Set<string>();
  addCodeVariant(expectedCodes, target.stockDrugId);
  addCodeVariant(expectedCodes, target.yjCode);

  if (target.janCodes) {
    for (let i = 0; i < target.janCodes.length; i++) {
      addCodeVariant(expectedCodes, target.janCodes[i]);
    }
  }

  return Array.from(expectedCodes);
}

export function matchGs1BarcodeToStockTarget(input: string, target: Gs1MatchTarget): Gs1MatchResult {
  const parsed = parseGs1Barcode(input);
  const expectedCodes = getExpectedGs1Codes(target);
  const expectedSet = new Set(expectedCodes);

  for (let i = 0; i < parsed.candidates.length; i++) {
    const candidate = parsed.candidates[i];
    if (expectedSet.has(candidate)) {
      return {
        matched: true,
        parsed,
        expectedCodes,
        matchedCode: candidate
      };
    }
  }

  return {
    matched: false,
    parsed,
    expectedCodes
  };
}

export function compareStockLotsByExpiration(
  left: Pick<StockLotGs1MatchCandidate, 'id' | 'expirationDate' | 'arrivalDate'>,
  right: Pick<StockLotGs1MatchCandidate, 'id' | 'expirationDate' | 'arrivalDate'>
): number {
  const leftExpiration = left.expirationDate || '9999-99-99';
  const rightExpiration = right.expirationDate || '9999-99-99';
  const expirationOrder = leftExpiration.localeCompare(rightExpiration);
  if (expirationOrder !== 0) return expirationOrder;

  const leftArrival = left.arrivalDate || '9999-99-99';
  const rightArrival = right.arrivalDate || '9999-99-99';
  const arrivalOrder = leftArrival.localeCompare(rightArrival);
  if (arrivalOrder !== 0) return arrivalOrder;

  return String(left.id || '').localeCompare(String(right.id || ''));
}

export function findMatchingStockLotForGs1Barcode(
  parsed: ParsedGs1Barcode,
  stockLots: StockLotGs1MatchCandidate[]
): StockLotGs1MatchCandidate | undefined {
  const scannedLot = normalizeLotComparable(parsed.lotNumber);
  const scannedExpiration = parsed.expirationDate;
  if (!scannedLot && !scannedExpiration) return undefined;

  const candidates = stockLots.filter((stockLot) => {
    if (toSafeAmount(stockLot.quantity) <= 0) return false;

    if (scannedLot) {
      if (!stockLot.lotNumber || normalizeLotComparable(stockLot.lotNumber) !== scannedLot) return false;
    }

    if (scannedExpiration) {
      if (!expirationDateMatches(scannedExpiration, stockLot.expirationDate)) return false;
    }

    if (stockLot.janCode) {
      const expectedCodes = new Set(getExpectedGs1Codes({
        stockDrugId: '',
        janCodes: [stockLot.janCode]
      }));
      if (!parsed.candidates.some((candidate) => expectedCodes.has(candidate))) return false;
    }

    return true;
  });

  if (candidates.length === 0) return undefined;

  const stockIdentities = new Set(candidates.map((stockLot) => [
    normalizeLotComparable(stockLot.lotNumber),
    stockLot.expirationDate || ''
  ].join('|')));
  if (stockIdentities.size > 1) return undefined;

  return [...candidates].sort(compareStockLotsByExpiration)[0];
}

export function aggregateStockRequirements(items: StockCalculationItem[]): Map<string, number> {
  const requirements = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const stockDrugId = getStockDrugId(item);
    const requiredAmount = calculateRequiredStockAmount(item);
    if (!stockDrugId || requiredAmount <= 0) continue;
    requirements.set(stockDrugId, (requirements.get(stockDrugId) || 0) + requiredAmount);
  }

  return requirements;
}

export function getTotalStock(lots: StockLotLike[]): number {
  let total = 0;

  for (let i = 0; i < lots.length; i++) {
    total += toSafeAmount(lots[i].quantity);
  }

  return total;
}

export function findStockShortages(
  requirements: Map<string, number>,
  availableStock: Map<string, number>
): StockShortage[] {
  const shortages: StockShortage[] = [];

  for (const [drugId, requiredAmount] of requirements.entries()) {
    const availableAmount = availableStock.get(drugId) || 0;
    if (availableAmount < requiredAmount) {
      shortages.push({
        drugId,
        requiredAmount,
        availableAmount,
        shortageAmount: requiredAmount - availableAmount
      });
    }
  }

  return shortages;
}
