import type { Patient, VisitMynaMedicationHistoryItem, VisitMynaSpecificHealthCheckup } from '@/db/types';

export type MynaCardReaderSource = 'bridge' | 'mock';
export type MynaCardReaderMode = 'auto' | 'bridge' | 'mock';

export interface MynaCardReaderPatientData {
  name: string;
  kana?: string;
  birthDate: string;
  gender?: Patient['gender'];
  insuranceInfo?: {
    provider?: string;
    number?: string;
    burdenRatio?: number;
  };
}

export interface MynaCardReaderResult extends MynaCardReaderPatientData {
  readerSource: MynaCardReaderSource;
  readerCheckedAt: string;
  readerMessage: string;
  specificHealthCheckups?: VisitMynaSpecificHealthCheckup[];
  medicationHistory?: VisitMynaMedicationHistoryItem[];
}

export interface MynaCardReaderConfig {
  endpoint?: string;
  mode?: MynaCardReaderMode;
  allowMockFallback?: boolean;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

type UnknownRecord = Record<string, unknown>;

export class MynaCardReaderError extends Error {
  readonly code: string;
  readonly status: number;
  readonly cause?: unknown;

  constructor(code: string, message: string, status = 502, cause?: unknown) {
    super(message);
    this.name = 'MynaCardReaderError';
    this.code = code;
    this.status = status;
    this.cause = cause;
    Object.setPrototypeOf(this, MynaCardReaderError.prototype);
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPath(source: unknown, path: string): unknown {
  if (!isRecord(source)) return undefined;
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function firstText(source: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined || value === null) continue;
    const text = String(value).normalize('NFKC').trim();
    if (text) return text;
  }
  return undefined;
}

function firstNumber(source: unknown, paths: string[]): number | undefined {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value === undefined || value === null || value === '') continue;
    const text = String(value).normalize('NFKC');
    const numberValue = Number(text.replace(/[,\s％%割]/g, '').trim());
    if (Number.isFinite(numberValue)) return text.includes('割') && numberValue <= 10 ? numberValue * 10 : numberValue;
  }
  return undefined;
}

function firstArray(source: unknown, paths: string[]): unknown[] {
  for (const path of paths) {
    const value = readPath(source, path);
    if (Array.isArray(value)) return value;
    if (isRecord(value)) return Object.values(value);
  }
  return [];
}

function normalizeGender(value?: string): Patient['gender'] | undefined {
  const text = value?.normalize('NFKC').toLowerCase();
  if (!text) return undefined;
  if (['male', 'm', '男', '男性'].includes(text)) return 'male';
  if (['female', 'f', '女', '女性'].includes(text)) return 'female';
  return 'other';
}

function normalizeBirthDate(value?: string): string | undefined {
  const text = value?.normalize('NFKC').trim();
  if (!text) return undefined;
  const compact = text.replace(/[年月./]/g, '-').replace(/日/g, '');
  const match = compact.match(/^(\d{4})-?(\d{1,2})-?(\d{1,2})$/);
  if (!match) return text;
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeSpecificHealthCheckup(value: unknown): VisitMynaSpecificHealthCheckup | null {
  if (!isRecord(value)) {
    const rawSummary = String(value || '').normalize('NFKC').trim();
    return rawSummary ? { rawSummary } : null;
  }

  const findings = firstArray(value, ['findings', '判定', '所見'])
    .map((item) => String(item || '').normalize('NFKC').trim())
    .filter(Boolean)
    .slice(0, 50);

  const record: VisitMynaSpecificHealthCheckup = {
    checkedAt: firstText(value, ['checkedAt', 'examinedAt', 'date', '健診日', '実施日']),
    heightCm: firstNumber(value, ['heightCm', 'height', '身長']),
    weightKg: firstNumber(value, ['weightKg', 'weight', '体重']),
    bmi: firstNumber(value, ['bmi', 'BMI']),
    systolicBloodPressure: firstNumber(value, ['systolicBloodPressure', 'bp.systolic', '収縮期血圧', '最高血圧']),
    diastolicBloodPressure: firstNumber(value, ['diastolicBloodPressure', 'bp.diastolic', '拡張期血圧', '最低血圧']),
    hba1c: firstText(value, ['hba1c', 'HbA1c']),
    ldlCholesterol: firstText(value, ['ldlCholesterol', 'LDL', 'LDLコレステロール']),
    egfr: firstText(value, ['egfr', 'eGFR']),
    ...(findings.length > 0 ? { findings } : {}),
    rawSummary: firstText(value, ['rawSummary', 'summary', '概要', 'メモ'])
  };

  return Object.values(record).some((field) => field !== undefined && (!Array.isArray(field) || field.length > 0))
    ? record
    : null;
}

function normalizeMedicationHistoryItem(value: unknown): VisitMynaMedicationHistoryItem | null {
  if (!isRecord(value)) {
    const rawSummary = String(value || '').normalize('NFKC').trim();
    return rawSummary ? { drugName: rawSummary, rawSummary } : null;
  }

  const drugName = firstText(value, ['drugName', 'medicineName', 'name', '薬品名', '医薬品名']);
  const rawSummary = firstText(value, ['rawSummary', 'summary', '概要', 'メモ']);
  if (!drugName && !rawSummary) return null;

  return {
    drugName: drugName || rawSummary || '薬剤名未取得',
    dispensedAt: firstText(value, ['dispensedAt', 'date', '調剤日', '交付日']),
    dosage: firstText(value, ['dosage', 'amount', '用量', '数量']),
    usage: firstText(value, ['usage', '用法']),
    days: firstNumber(value, ['days', '日数']),
    institutionName: firstText(value, ['institutionName', 'medicalInstitution', '医療機関名']),
    pharmacyName: firstText(value, ['pharmacyName', '薬局名']),
    rawSummary
  };
}

export function normalizeMynaCardReaderPayload(
  payload: unknown,
  options: { source: MynaCardReaderSource; checkedAt?: string } = { source: 'bridge' }
): MynaCardReaderResult {
  const source = isRecord(payload) && isRecord(payload.patient) ? payload.patient : payload;
  const checkedAt = options.checkedAt || new Date().toISOString();
  const name = firstText(source, ['name', 'patient.name', '氏名', '患者氏名']) || '';
  const birthDate = normalizeBirthDate(firstText(source, ['birthDate', 'patient.birthDate', '生年月日', '患者生年月日'])) || '';
  const kana = firstText(source, ['kana', 'patient.kana', 'カナ', '氏名カナ']);
  const gender = normalizeGender(firstText(source, ['gender', 'patient.gender', '性別']));
  const provider = firstText(source, [
    'insuranceInfo.provider',
    'insurance.provider',
    'qualification.insurance.provider',
    '保険者番号',
    '保険情報.保険者番号'
  ]);
  const number = firstText(source, [
    'insuranceInfo.number',
    'insurance.number',
    'qualification.insurance.number',
    '記号番号',
    '保険情報.記号番号'
  ]);
  const burdenRatio = firstNumber(source, [
    'insuranceInfo.burdenRatio',
    'insurance.burdenRatio',
    'qualification.insurance.burdenRatio',
    '負担割合',
    '保険情報.負担割合'
  ]);
  const specificHealthCheckups = firstArray(payload, [
    'specificHealthCheckups',
    'specificHealthCheckup',
    'healthCheckups',
    'clinical.specificHealthCheckups',
    'patient.specificHealthCheckups',
    'patient.clinical.specificHealthCheckups',
    '特定健診情報',
    '特定健診'
  ]).map(normalizeSpecificHealthCheckup).filter((item): item is VisitMynaSpecificHealthCheckup => !!item);
  const medicationHistory = firstArray(payload, [
    'medicationHistory',
    'medicationHistories',
    'drugHistory',
    'clinical.medicationHistory',
    'patient.medicationHistory',
    'patient.clinical.medicationHistory',
    '薬剤履歴',
    '薬剤情報'
  ]).map(normalizeMedicationHistoryItem).filter((item): item is VisitMynaMedicationHistoryItem => !!item);

  return {
    name,
    ...(kana ? { kana } : {}),
    birthDate,
    ...(gender ? { gender } : {}),
    insuranceInfo: {
      ...(provider ? { provider } : {}),
      ...(number ? { number } : {}),
      ...(burdenRatio !== undefined ? { burdenRatio } : {})
    },
    readerSource: options.source,
    readerCheckedAt: checkedAt,
    readerMessage: options.source === 'bridge'
      ? 'カードリーダー連携サービスから読取内容を取得しました。'
      : 'デモ用のマイナ読取データを反映しました。',
    ...(specificHealthCheckups.length > 0 ? { specificHealthCheckups } : {}),
    ...(medicationHistory.length > 0 ? { medicationHistory } : {})
  };
}

export function assertMynaCardReaderResult(result: MynaCardReaderResult) {
  if (!result.name || !result.birthDate) {
    throw new MynaCardReaderError(
      'myna_reader_payload_invalid',
      'カードリーダーの読取結果に氏名または生年月日がありません。'
    );
  }
}

export function buildMockMynaCardReaderResult(now: () => Date = () => new Date()): MynaCardReaderResult {
  return normalizeMynaCardReaderPayload({
    name: 'マイナ 太郎',
    kana: 'マイナ タロウ',
    birthDate: '1980-01-01',
    gender: 'male',
    insuranceInfo: {
      provider: '社保',
      number: '12345678',
      burdenRatio: 30
    },
    specificHealthCheckups: [{
      checkedAt: '2026-04-10',
      heightCm: 170.2,
      weightKg: 68.4,
      bmi: 23.6,
      systolicBloodPressure: 128,
      diastolicBloodPressure: 78,
      hba1c: '5.8',
      egfr: '72.4',
      findings: ['服薬指導時に腎機能を確認']
    }],
    medicationHistory: [{
      dispensedAt: '2026-06-01',
      drugName: 'アムロジピン錠5mg',
      usage: '1日1回 朝食後',
      days: 28,
      institutionName: 'デモ内科'
    }]
  }, {
    source: 'mock',
    checkedAt: now().toISOString()
  });
}

export async function readMynaCardFromBridge(config: MynaCardReaderConfig): Promise<MynaCardReaderResult> {
  const endpoint = config.endpoint?.trim();
  if (!endpoint) {
    throw new MynaCardReaderError(
      'myna_reader_bridge_unconfigured',
      'カードリーダー連携サービスの接続先が未設定です。',
      503
    );
  }

  const timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 8000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetchImpl = config.fetchImpl || fetch;

  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new MynaCardReaderError(
        'myna_reader_bridge_http_error',
        `カードリーダー連携サービスがエラーを返しました（HTTP ${response.status}）。`,
        502
      );
    }

    const payload = await response.json();
    const result = normalizeMynaCardReaderPayload(payload, {
      source: 'bridge',
      checkedAt: (config.now || (() => new Date()))().toISOString()
    });
    assertMynaCardReaderResult(result);
    return result;
  } catch (error) {
    if (error instanceof MynaCardReaderError) throw error;
    throw new MynaCardReaderError(
      'myna_reader_bridge_unavailable',
      'カードリーダー連携サービスへ接続できませんでした。',
      502,
      error
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function readMynaCard(config: MynaCardReaderConfig = {}): Promise<MynaCardReaderResult> {
  const mode = config.mode || 'auto';
  const allowMockFallback = config.allowMockFallback !== false;
  if (mode === 'mock') {
    if (!allowMockFallback) {
      throw new MynaCardReaderError(
        'myna_reader_mock_disabled',
        'デモ用のマイナ読取は本番モードで無効です。カードリーダー連携サービスを設定してください。',
        503
      );
    }
    return buildMockMynaCardReaderResult(config.now);
  }
  if (mode === 'bridge' || config.endpoint) {
    return readMynaCardFromBridge(config);
  }
  if (!allowMockFallback) {
    throw new MynaCardReaderError(
      'myna_reader_bridge_unconfigured',
      'カードリーダー連携サービスの接続先が未設定です。デモ用読取に切り替える場合は明示的に許可してください。',
      503
    );
  }
  return buildMockMynaCardReaderResult(config.now);
}
