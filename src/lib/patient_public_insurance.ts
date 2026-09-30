import type { Patient, PublicInsurance } from '@/db/types';
import type { InsuranceEligibilityIssue } from '@/lib/insurance_eligibility';

/**
 * 日本の公費負担者番号の先頭2桁（法別番号）に対応する代表的な公費制度名
 */
export const PUBLIC_INSURANCE_LEGAL_CATEGORIES: Record<string, string> = {
  '10': '結核（適正医療）',
  '11': '結核（命令入所）',
  '12': '生活保護',
  '15': '更生医療',
  '16': '育成医療',
  '18': '原爆（一般疾病）',
  '19': '原爆（認定医療）',
  '20': '精神措置入院',
  '21': '精神通院医療',
  '24': '麻薬中毒',
  '28': '新感染症',
  '29': '感染症患者医療',
  '51': '特定疾患（指定難病等）',
  '52': '小児慢性特定疾病',
  '53': '児童福祉',
  '54': '指定難病',
  '66': '先天性血液凝固因子障害',
  '79': '肝炎治療促進事業'
};

/**
 * 公費負担者番号から公費の制度名（法別名称）を取得する
 */
export function getPublicInsuranceCategoryName(provider?: string): string | undefined {
  if (!provider) return undefined;
  const cleaned = sanitizeDigits(provider);
  if (cleaned.length < 2) return undefined;
  const prefix = cleaned.slice(0, 2);
  if (PUBLIC_INSURANCE_LEGAL_CATEGORIES[prefix]) {
    return PUBLIC_INSURANCE_LEGAL_CATEGORIES[prefix];
  }
  const prefixNum = Number(prefix);
  if (prefixNum >= 80 && prefixNum <= 89) {
    return '地方単独公費';
  }
  return undefined;
}

/**
 * 日本の調剤レセプト（KOレコード）で登録可能な公費の最大数（第1〜第4公費）
 */
export const MAX_PUBLIC_INSURANCES = 4;

/**
 * 画面入力フォーム用の公費ステート構造体
 */
export interface EditablePublicInsurance {
  id: string;
  provider: string;
  recipient: string;
  burdenRatio: number;
  startDate: string;
  endDate: string;
  monthlyLimitYen: string;
}

/**
 * 全角数字を半角数字に変換し、空白を除去する
 */
export function sanitizeDigits(val: string): string {
  if (!val) return '';
  return val
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, '')
    .trim();
}

/**
 * 日付入力フォーム用フォーマット（YYYY-MM-DD）
 */
function toDateString(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

/**
 * 空の公費入力行を生成する
 */
export function createEmptyEditablePublicInsurance(index = 0): EditablePublicInsurance {
  return {
    id: `pub-slot-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    provider: '',
    recipient: '',
    burdenRatio: 10,
    startDate: '',
    endDate: '',
    monthlyLimitYen: ''
  };
}

/**
 * 保存データ（PublicInsurance[]）をフォーム編集用（EditablePublicInsurance[]）に変換する
 */
export function toEditablePublicInsurances(
  publicInsurances?: ReadonlyArray<PublicInsurance> | null
): EditablePublicInsurance[] {
  if (!publicInsurances || publicInsurances.length === 0) {
    return [createEmptyEditablePublicInsurance(0)];
  }
  return publicInsurances.slice(0, MAX_PUBLIC_INSURANCES).map((pub, index) => ({
    id: `pub-item-${index}-${pub.provider || 'none'}-${pub.recipient || 'none'}-${Math.random().toString(36).slice(2, 7)}`,
    provider: pub.provider || '',
    recipient: pub.recipient || '',
    burdenRatio: pub.burdenRatio ?? 10,
    startDate: toDateString(pub.startDate),
    endDate: toDateString(pub.endDate),
    monthlyLimitYen: pub.monthlyLimitYen !== undefined ? String(pub.monthlyLimitYen) : ''
  }));
}

/**
 * 個別の公費オブジェクトをサニタイズして検証する
 * 負担者番号・受給者番号が両方空の場合は null を返す（未入力行と判定）
 */
export function sanitizePublicInsurance(entry: Partial<PublicInsurance>): PublicInsurance | null {
  const provider = sanitizeDigits(entry.provider || '');
  const recipient = sanitizeDigits(entry.recipient || '');

  if (!provider && !recipient) {
    return null;
  }

  const result: PublicInsurance = {
    provider,
    recipient
  };

  if (entry.burdenRatio !== undefined && Number.isFinite(Number(entry.burdenRatio))) {
    const ratio = Math.round(Number(entry.burdenRatio));
    result.burdenRatio = Math.max(0, Math.min(100, ratio));
  }

  if (entry.startDate && entry.startDate.trim()) {
    result.startDate = entry.startDate.trim().slice(0, 10);
  }

  if (entry.endDate && entry.endDate.trim()) {
    result.endDate = entry.endDate.trim().slice(0, 10);
  }

  if (entry.monthlyLimitYen !== undefined && entry.monthlyLimitYen !== null) {
    const rawNum = typeof entry.monthlyLimitYen === 'number'
      ? entry.monthlyLimitYen
      : typeof entry.monthlyLimitYen === 'string' && (entry.monthlyLimitYen as string).trim() !== ''
        ? Number((entry.monthlyLimitYen as string).trim())
        : NaN;
    if (Number.isFinite(rawNum) && rawNum >= 0) {
      result.monthlyLimitYen = Math.floor(rawNum);
    }
  }

  return result;
}

/**
 * 編集用リスト（EditablePublicInsurance[]）からDB保存用のPublicInsurance[]を抽出・変換する
 * 空のエントリは除外され、最大4件までが順序を保って返される
 */
export function toPublicInsurances(
  items: ReadonlyArray<EditablePublicInsurance>
): PublicInsurance[] {
  const list: PublicInsurance[] = [];
  for (const item of items) {
    const sanitized = sanitizePublicInsurance({
      provider: item.provider,
      recipient: item.recipient,
      burdenRatio: item.burdenRatio,
      startDate: item.startDate,
      endDate: item.endDate,
      monthlyLimitYen: item.monthlyLimitYen.trim() ? Number(item.monthlyLimitYen) : undefined
    });
    if (sanitized) {
      list.push(sanitized);
    }
    if (list.length >= MAX_PUBLIC_INSURANCES) {
      break;
    }
  }
  return list;
}

/**
 * 単一公費更新時に、2件目以降の既存公費が意図せず失われるのを防ぐ安全保護マージ関数
 */
export function mergePreservingUneditedPublicInsurances({
  existingPublicInsurances,
  savedPublicInsurances,
  mode = 'full_replace'
}: {
  existingPublicInsurances?: ReadonlyArray<PublicInsurance> | null;
  savedPublicInsurances: ReadonlyArray<PublicInsurance>;
  mode?: 'full_replace' | 'single_slot_preserve_rest';
}): PublicInsurance[] {
  if (mode === 'full_replace') {
    return savedPublicInsurances.slice(0, MAX_PUBLIC_INSURANCES).map((item) => ({ ...item }));
  }

  const existingRest = (existingPublicInsurances || []).slice(1);
  const first = savedPublicInsurances[0];
  const result: PublicInsurance[] = [];
  if (first) {
    result.push({ ...first });
  }
  for (const rest of existingRest) {
    result.push({ ...rest });
  }
  return result.slice(0, MAX_PUBLIC_INSURANCES);
}

/**
 * バナー表示用の公費バッジ情報
 */
export interface PublicInsuranceBadgeItem {
  index: number;
  label: string;
  categoryName?: string;
  provider: string;
  recipient: string;
  burdenRatio?: number;
  hasWarning: boolean;
  hasError: boolean;
  warningMessage?: string;
}

/**
 * 患者の公費配列および適合性判定（InsuranceEligibilityIssue）からバナー用バッジ一覧を構築する
 */
export function buildPublicInsuranceBadgeList(
  publicInsurances?: ReadonlyArray<PublicInsurance> | null,
  issues?: ReadonlyArray<InsuranceEligibilityIssue> | null
): PublicInsuranceBadgeItem[] {
  if (!publicInsurances || publicInsurances.length === 0) return [];

  return publicInsurances.slice(0, MAX_PUBLIC_INSURANCES).map((pub, idx) => {
    const slotNumber = idx + 1;
    const categoryName = getPublicInsuranceCategoryName(pub.provider);
    const burdenText = pub.burdenRatio !== undefined ? `${pub.burdenRatio}%` : '';
    const prefix = categoryName || (pub.provider ? `公費${pub.provider.slice(0, 2)}` : `公費${slotNumber}`);
    const label = burdenText ? `${prefix} (${burdenText})` : prefix;

    const publicLabel = `公費${slotNumber}`;
    const publicIssues = (issues || []).filter((issue) => {
      return issue.title.includes(publicLabel) || issue.message.includes(publicLabel);
    });

    const hasError = publicIssues.some((i) => i.severity === 'error');
    const hasWarning = publicIssues.some((i) => i.severity === 'warning');
    const warningMessage = publicIssues.map((i) => i.title).join(' / ');

    return {
      index: slotNumber,
      label,
      categoryName,
      provider: pub.provider,
      recipient: pub.recipient,
      burdenRatio: pub.burdenRatio,
      hasWarning: hasWarning && !hasError,
      hasError,
      warningMessage: warningMessage || undefined
    };
  });
}
