let schedulerPromise: Promise<any> | null = null;

async function initScheduler() {
  try {
    const { createWorker, createScheduler } = await import('tesseract.js');
    const scheduler = createScheduler();
    const worker = await createWorker('jpn');
    scheduler.addWorker(worker);
    return scheduler;
  } catch (error) {
    schedulerPromise = null;
    throw error;
  }
}

async function getScheduler() {
  if (!schedulerPromise) {
    schedulerPromise = initScheduler();
  }
  return schedulerPromise.catch((err) => {
    schedulerPromise = null;
    throw err;
  });
}

export function preloadOcr(options: { logErrors?: boolean } = {}): void {
  // Pre-initialize the Tesseract scheduler in the background
  getScheduler().catch((error) => {
    if (options.logErrors) {
      console.warn('Failed to preload OCR engine:', error);
    }
  });
}

export async function processPrescription(imageFile: File, schedulerOverride?: any) {
  const scheduler = schedulerOverride || await getScheduler();
  
  try {
    const { data: { text } } = await scheduler.addJob('recognize', imageFile);
    return text;
  } catch (error) {
    console.error('OCR Error: An error occurred during processing', error);
    throw error;
  }
}

export interface PatientInfo {
  name?: string;
  kana?: string;
  gender?: string;
  birthDate?: string;
}

export interface DrugItem {
  rpNumber?: number;
  drugName: string;
  drugCode?: string;
  drugCodeType?: string;
  amount: string;
  unit: string;
  usage: string;
  days: string;
  usageCode?: string;
  usageCodeType?: string;
  rpComment?: string;
}

export interface PrescriptionProviderInfo {
  prescriptionDate?: string;
  institutionName?: string;
  institutionCode?: string;
  departmentName?: string;
  doctorName?: string;
}

export interface JahisQrResult {
  version: string;
  patient: PatientInfo;
  provider: PrescriptionProviderInfo;
  items: DrugItem[];
  warnings: string[];
  rawRecordCount: number;
}

const MAX_QR_DATA_LENGTH = 10000;
const MAX_LINES = 200;
const MAX_ITEMS = 100;
const MAX_FIELD_LENGTH = 500;

const emptyJahisQrResult = (): JahisQrResult => ({
  version: '',
  patient: {},
  provider: {},
  items: [],
  warnings: [],
  rawRecordCount: 0
});

function limitField(value: string | undefined): string {
  return String(value || '').trim().substring(0, MAX_FIELD_LENGTH);
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields.map(limitField);
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function looksLikeDate(value: string | undefined): boolean {
  return /^(\d{8}|[A-Z]\d{6})$/i.test(String(value || '').trim());
}

function appendItemComment(item: DrugItem, comment: string) {
  const nextComment = limitField(comment);
  if (!nextComment) return;
  item.rpComment = item.rpComment ? `${item.rpComment} / ${nextComment}` : nextComment;
}

function findItemByRp(items: DrugItem[], rpNumber: number | undefined): DrugItem | undefined {
  if (!rpNumber) return items[items.length - 1];
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].rpNumber === rpNumber) return items[i];
  }
  return undefined;
}

function findItemsByRp(items: DrugItem[], rpNumber: number | undefined): DrugItem[] {
  if (!rpNumber) return items.length > 0 ? [items[items.length - 1]] : [];
  return items.filter((item) => item.rpNumber === rpNumber);
}

// JAHIS electronic medicine notebook / prescription QR parser (CSV based).
export function parseJahisQr(qrData: string): JahisQrResult {
  if (!qrData || typeof qrData !== 'string' || qrData.length > MAX_QR_DATA_LENGTH) {
    return emptyJahisQrResult();
  }

  const lines = qrData.replace(/\r\n?/g, '\n').split('\n').slice(0, MAX_LINES);
  const result = emptyJahisQrResult();

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (trimmedLine.startsWith('JAHIS')) {
      result.version = result.version || trimmedLine.substring(0, MAX_FIELD_LENGTH);
      continue;
    }

    if (trimmedLine[0] < '0' || trimmedLine[0] > '9') continue;

    const fields = parseCsvLine(trimmedLine);
    const recordType = fields[0];
    result.rawRecordCount++;

    switch (recordType) {
      case '1': // Patient Info
        if (fields.length >= 4) {
          const officialBirthDate = fields[3];
          const legacyBirthDate = fields[4];
          const isOfficialOrder = looksLikeDate(officialBirthDate);
          result.patient = {
            name: fields[1],
            gender: isOfficialOrder ? fields[2] : fields[3],
            birthDate: isOfficialOrder ? officialBirthDate : legacyBirthDate,
            kana: isOfficialOrder ? fields[10] : fields[2]
          };
        }
        break;
      case '5': // Date record
        if (fields[1]) {
          result.provider.prescriptionDate = fields[1];
        }
        break;
      case '51': // Prescribing medical institution
        result.provider.institutionName = fields[1] || result.provider.institutionName;
        result.provider.institutionCode = fields[4] || result.provider.institutionCode;
        break;
      case '55': // Prescribing physician
        result.provider.doctorName = fields[1] || result.provider.doctorName;
        result.provider.departmentName = fields[2] || result.provider.departmentName;
        break;
      case '201': // Drug record
        if (fields.length >= 5 && result.items.length < MAX_ITEMS) {
          const officialRpNumber = parsePositiveInteger(fields[1]);
          const isOfficialOrder = !!officialRpNumber || fields.length >= 8;
          const fallbackRpNumber = result.items.length + 1;
          result.items.push({
            rpNumber: isOfficialOrder ? (officialRpNumber || fallbackRpNumber) : fallbackRpNumber,
            drugName: fields[2],
            amount: fields[3],
            unit: fields[4],
            drugCodeType: isOfficialOrder ? fields[5] : '',
            drugCode: isOfficialOrder ? fields[6] : '',
            usage: isOfficialOrder ? '' : fields[5],
            days: isOfficialOrder ? '' : fields[6]
          });
        }
        break;
      case '281':
      case '291': {
        const rpNumber = parsePositiveInteger(fields[1]);
        const target = findItemByRp(result.items, rpNumber);
        if (target) appendItemComment(target, fields[2]);
        break;
      }
      case '301': { // Usage record
        const rpNumber = parsePositiveInteger(fields[1]);
        const targets = findItemsByRp(result.items, rpNumber);
        if (targets.length === 0) {
          result.warnings.push(`用法レコードに対応する薬品がありません: Rp${fields[1] || '?'}`);
          break;
        }
        for (const target of targets) {
          target.usage = fields[2] || target.usage;
          target.days = fields[3] || target.days;
          target.usageCodeType = fields[6] || target.usageCodeType;
          target.usageCode = fields[7] || target.usageCode;
        }
        break;
      }
      case '311':
      case '391': {
        const rpNumber = parsePositiveInteger(fields[1]);
        const target = findItemByRp(result.items, rpNumber);
        if (target) appendItemComment(target, fields[2]);
        break;
      }
      default:
        break;
    }
  }

  if (!result.version && lines.length > 0) {
    result.version = lines[0].substring(0, MAX_FIELD_LENGTH);
  }

  return result;
}

export interface DeliveryItem {
  code: string;
  name: string;
  quantity: number;
  expirationDate: string;
  arrivalDate: string;
  supplier: string;
}

export function parseDeliverySlip(text: string): DeliveryItem[] {
  // Simple regex matching for Suzuken-like formats or generic layouts
  // Assuming each line might look like: "Code  Name   Quantity   Lot   ExpirationDate"
  const lines = text.split('\n');
  const items: DeliveryItem[] = [];
  const today = new Date().toISOString().split('T')[0];
  const dateRegex = /20\d{2}[-/.]\d{1,2}(?:[-/.]\d{1,2})?/;

  for (const line of lines) {
    if (line.trim() === '') continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length >= 3) {
      const maybeCode = parts[0];
      const maybeQuantity = parseInt(parts[parts.length - 1], 10);
      const expirationMatch = line.match(dateRegex);
      const expirationDate = expirationMatch ? expirationMatch[0].replace(/[/.]/g, '-') : '';

      if (!isNaN(maybeQuantity) && /^[a-zA-Z0-9]+$/.test(maybeCode)) {
        items.push({
          code: maybeCode,
          name: parts.slice(1, -1).join(' '), // Everything in between
          quantity: maybeQuantity,
          expirationDate,
          arrivalDate: today,
          supplier: ''
        });
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Prescription OCR text parser (best effort).
// Tesseract output of paper prescriptions is noisy, so this extracts whatever
// it can into the same DrugItem shape as the JAHIS QR parser. The reception
// form stays fully editable, and the raw text remains visible for reference.

export interface OcrPrescriptionParseResult {
  patient: PatientInfo;
  provider: PrescriptionProviderInfo;
  items: DrugItem[];
  warnings: string[];
  matchedFieldCount: number;
}

const ERA_BASE_YEARS: Record<string, number> = {
  M: 1867, 明: 1867,
  T: 1911, 大: 1911,
  S: 1925, 昭: 1925,
  H: 1988, 平: 1988,
  R: 2018, 令: 2018
};

const toHalfWidth = (value: string): string => (
  value.replace(/[０-９Ａ-Ｚａ-ｚ．－／：％（）]/g, (char) => {
    if (char === '．') return '.';
    if (char === '－') return '-';
    if (char === '／') return '/';
    if (char === '：') return ':';
    if (char === '％') return '%';
    if (char === '（') return '(';
    if (char === '）') return ')';
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  })
);

const padDatePart = (value: string): string => value.padStart(2, '0');

// 「令和6年5月1日」「R6.5.1」「2026/07/05」「20260705」などを YYYY-MM-DD へ
const parseJapaneseDate = (rawValue: string): string => {
  const value = toHalfWidth(rawValue);

  const eraMatch = value.match(/(明治|大正|昭和|平成|令和|[MTSHR])\s*(\d{1,2})[年.\-/](\d{1,2})[月.\-/](\d{1,2})/i);
  if (eraMatch) {
    const eraKey = eraMatch[1].charAt(0).toUpperCase();
    const base = ERA_BASE_YEARS[eraKey] ?? ERA_BASE_YEARS[eraMatch[1].charAt(0)];
    if (base) {
      const year = base + parseInt(eraMatch[2], 10);
      return `${year}-${padDatePart(eraMatch[3])}-${padDatePart(eraMatch[4])}`;
    }
  }

  const westernMatch = value.match(/(19\d{2}|20\d{2})[年.\-/](\d{1,2})[月.\-/](\d{1,2})/);
  if (westernMatch) {
    return `${westernMatch[1]}-${padDatePart(westernMatch[2])}-${padDatePart(westernMatch[3])}`;
  }

  const compactMatch = value.match(/\b(19\d{2}|20\d{2})(\d{2})(\d{2})\b/);
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  }

  return '';
};

const DOSAGE_FORM_KEYWORD = '錠|カプセル|ＯＤ錠|OD錠|散|細粒|顆粒|シロップ|ドライシロップ|ＤＳ|DS|内用液|軟膏|クリーム|ローション|ゲル|テープ|パップ|貼付|点眼|点鼻|点耳|吸入|坐剤|坐薬|座薬|液|パッチ|スプレー|うがい|含嗽|注射|注入|エアゾール';
const STRENGTH_PATTERN = /\d+(?:\.\d+)?\s*(?:mg|g|mcg|ug|μg|mL|mI|ml|%)/i;
const QUANTITY_PATTERN = /(\d+(?:\.\d+)?)\s*(錠|カプセル|包|枚|本|個|吹|滴|瓶|管|キット|g|mL|ml|回分)(?:\s*[/／]?\s*(?:日|1日))?\s*$/;
// キーワード付き(Rp1 / 処方2.)は区切り記号なしでも許可し、
// 数字だけの行頭は括弧・記号付き((1) / 1) / 2.)のときだけRpマーカー扱いにする
const RP_MARKER_PATTERN = /^(?:[\[【(]?\s*(?:Rp\.?|ＲＰ|処方)\s*(\d{1,2})\s*[)\].】、.:]?|[\[【(]\s*(\d{1,2})\s*[)\].】]|(\d{1,2})\s*[)\].】、.:])\s*/i;
const USAGE_PATTERN = /1日\d+回|毎食後|毎食前|朝食後|昼食後|夕食後|朝食前|昼食前|夕食前|食直後|食直前|食間|就寝前|寝る前|眠前|起床時|頓服|頓用|疼痛時|発熱時|発作時|便秘時|不眠時|必要時|\d+時間ごと|\d+時間毎|点眼|点鼻|塗布|貼付|吸入|うがい/;
const DAYS_PATTERN = /(\d{1,3})\s*(日分|回分)/;
const NOISE_LINE_PATTERN = /^[\s\d\-_=~･・。、.,:;|]*$/;

const isDrugLine = (line: string): boolean => {
  if (!new RegExp(DOSAGE_FORM_KEYWORD).test(line)) return false;
  if (STRENGTH_PATTERN.test(toHalfWidth(line))) return true;
  return QUANTITY_PATTERN.test(toHalfWidth(line));
};

const DEPARTMENT_PATTERN = /(総合内科|循環器内科|消化器内科|呼吸器内科|糖尿病内科|腎臓内科|神経内科|脳神経内科|血液内科|内科|外科|整形外科|脳神経外科|形成外科|心臓血管外科|小児科|皮膚科|眼科|耳鼻咽喉科|泌尿器科|産婦人科|婦人科|精神科|心療内科|放射線科|麻酔科|歯科口腔外科|歯科|リハビリテーション科)/;

export function parsePrescriptionOcrText(text: string): OcrPrescriptionParseResult {
  const result: OcrPrescriptionParseResult = {
    patient: {},
    provider: {},
    items: [],
    warnings: [],
    matchedFieldCount: 0
  };

  if (!text || typeof text !== 'string') {
    result.warnings.push('OCRテキストが空です。');
    return result;
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && !NOISE_LINE_PATTERN.test(line))
    .slice(0, MAX_LINES);

  let currentRpNumber: number | undefined;

  const applyToRpGroup = (rpNumber: number | undefined, patch: (item: DrugItem) => void) => {
    const targets = findItemsByRp(result.items, rpNumber);
    for (const target of targets) patch(target);
  };

  for (const rawLine of lines) {
    let line = rawLine;

    // 患者名
    if (!result.patient.name) {
      const nameMatch = line.match(/(?:患者氏名|患者名|氏名)\s*[:：]?\s*([^\s].{0,30}?)\s*(?:様|殿)?$/);
      if (nameMatch && !/生年月日|保険|番号/.test(nameMatch[1])) {
        result.patient.name = limitField(nameMatch[1]);
        continue;
      }
      const honorificMatch = line.match(/^([^\s\d]{2,20})\s*(?:様|殿)$/);
      if (honorificMatch) {
        result.patient.name = limitField(honorificMatch[1]);
        continue;
      }
    }

    // 生年月日
    if (!result.patient.birthDate && /生年月日|生\s*年\s*月\s*日/.test(line)) {
      const parsedDate = parseJapaneseDate(line);
      if (parsedDate) {
        result.patient.birthDate = parsedDate.replace(/-/g, '');
        continue;
      }
    }

    // 処方元
    if (!result.provider.institutionName) {
      const institutionMatch = line.match(/([^\s]{1,30}(?:病院|クリニック|医院|診療所|医療センター))/);
      if (institutionMatch) {
        result.provider.institutionName = limitField(institutionMatch[1]);
      }
    }
    if (!result.provider.departmentName) {
      const departmentMatch = line.match(DEPARTMENT_PATTERN);
      if (departmentMatch) {
        result.provider.departmentName = limitField(departmentMatch[1]);
      }
    }
    if (!result.provider.doctorName) {
      const doctorMatch = line.match(/(?:医師氏名|医師名|処方医|担当医|医師)\s*[:：]?\s*([^\s].{0,20}?)\s*(?:印|㊞)?$/);
      if (doctorMatch && !/記載|欄|保険/.test(doctorMatch[1])) {
        result.provider.doctorName = limitField(doctorMatch[1]);
        continue;
      }
    }
    if (!result.provider.prescriptionDate && /交付年月日|処方年月日|交付日|処方日/.test(line)) {
      const parsedDate = parseJapaneseDate(line);
      if (parsedDate) {
        result.provider.prescriptionDate = parsedDate.replace(/-/g, '');
        continue;
      }
    }

    // Rp番号マーカー
    const rpMatch = line.match(RP_MARKER_PATTERN);
    if (rpMatch) {
      currentRpNumber = parseInt(rpMatch[1] || rpMatch[2] || rpMatch[3], 10);
      line = line.replace(RP_MARKER_PATTERN, '').trim();
      if (!line) continue;
    }

    // 薬品行
    if (isDrugLine(line) && result.items.length < MAX_ITEMS) {
      const normalized = toHalfWidth(line);
      const quantityMatch = normalized.match(QUANTITY_PATTERN);
      let drugName = line;
      let amount = '';
      let unit = '';
      if (quantityMatch) {
        amount = quantityMatch[1];
        unit = quantityMatch[2];
        const quantityIndex = normalized.lastIndexOf(quantityMatch[0]);
        drugName = line.slice(0, quantityIndex).replace(/[\s、,]+$/, '').trim() || line;
      }
      result.items.push({
        rpNumber: currentRpNumber ?? result.items.length + 1,
        drugName: limitField(drugName),
        amount: limitField(amount),
        unit: limitField(unit),
        usage: '',
        days: ''
      });
      continue;
    }

    // 用法行・日数行は直近のRpグループへ反映
    const targetRp = result.items.length > 0 ? result.items[result.items.length - 1].rpNumber : undefined;
    if (result.items.length > 0) {
      const daysMatch = toHalfWidth(line).match(DAYS_PATTERN);
      const isUsage = USAGE_PATTERN.test(line);
      if (isUsage || daysMatch) {
        const usageText = limitField(line.replace(DAYS_PATTERN, '').replace(/[\s、,]+$/, '').trim());
        applyToRpGroup(targetRp, (item) => {
          if (daysMatch && !item.days) item.days = daysMatch[1];
          if (isUsage && usageText && !item.usage) item.usage = usageText;
        });
        continue;
      }
    }
  }

  result.matchedFieldCount = [
    result.patient.name,
    result.patient.birthDate,
    result.provider.institutionName,
    result.provider.departmentName,
    result.provider.doctorName,
    result.provider.prescriptionDate
  ].filter(Boolean).length + result.items.length;

  if (!result.patient.name) result.warnings.push('患者氏名を読み取れませんでした。');
  if (result.items.length === 0) result.warnings.push('処方薬を読み取れませんでした。');

  return result;
}
