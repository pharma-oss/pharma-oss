import type { PrescriptionItem, TracingReportStatus } from '@/db/types';
import { logAuditAction, type AuditLogDatabaseLike } from './audit';
import { recordAuditOrNotify } from './audit_guard';
import { toLocalDateKey } from './local_date';

export function toDateInputValue(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function todayDateInputValue(): string {
  return toLocalDateKey();
}

export const inquiryStatusLabel = {
  none: '未照会',
  pending: '照会中',
  completed: '回答済',
  cancelled: '中止'
} as const;

export const inquiryMethodLabel = {
  phone: '電話',
  fax: 'FAX',
  in_person: '対面',
  other: 'その他'
} as const;

export const tracingStatusLabel: Record<TracingReportStatus, string> = {
  draft: '下書き',
  ready: '送付準備',
  sent: '送付済',
  closed: '完了'
};

export const MAX_QUESTIONNAIRE_IMAGE_DATA_URL_LENGTH = 240000;

export function dataUrlByteSize(dataUrl: string): number {
  const payload = dataUrl.split(',')[1] || '';
  return Math.ceil((payload.length * 3) / 4);
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('画像を読み込めませんでした。'));
    };
    image.src = objectUrl;
  });
}

export async function compressQuestionnaireImage(
  file: File
): Promise<{ dataUrl: string; byteSize: number }> {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像圧縮を実行できませんでした。');

  const candidates = [
    { maxSize: 1100, quality: 0.5 },
    { maxSize: 900, quality: 0.42 },
    { maxSize: 720, quality: 0.34 },
    { maxSize: 560, quality: 0.28 }
  ];

  let fallback = '';
  for (const candidate of candidates) {
    const scale = Math.min(
      1,
      candidate.maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
    );
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', candidate.quality);
    fallback = dataUrl;
    if (dataUrl.length <= MAX_QUESTIONNAIRE_IMAGE_DATA_URL_LENGTH) {
      return { dataUrl, byteSize: dataUrlByteSize(dataUrl) };
    }
  }

  return { dataUrl: fallback, byteSize: dataUrlByteSize(fallback) };
}

export {
  applyReversiblePatches,
  PatchRollbackError,
  rollbackAppliedPatches,
  type ReversiblePatch
} from './rxdb_restore.ts';

export function safeStockQuantity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function consumeFromStockLot(
  stock: { id?: string; quantity?: unknown } | null | undefined,
  requestedAmount: number,
  workingQuantities: Map<string, number>
): number {
  if (!stock?.id || requestedAmount <= 0) return 0;
  const available = safeStockQuantity(
    workingQuantities.has(stock.id) ? workingQuantities.get(stock.id) : stock.quantity
  );
  const deducted = Math.min(available, requestedAmount);
  if (deducted > 0) {
    workingQuantities.set(stock.id, available - deducted);
  }
  return deducted;
}

export const MANUAL_PICKING_VERIFICATION_PREFIX = 'MANUAL_VISUAL_CHECK:';

export const MANUAL_PICKING_VERIFICATION_REASONS = [
  { code: 'no_scanner', label: 'バーコードスキャナ未導入' },
  { code: 'unregistered_barcode', label: 'GS1・JAN未登録品目' },
  { code: 'unreadable_barcode', label: 'バーコード汚損・読取不可' },
  { code: 'other', label: 'その他（目視確認済み）' }
] as const;

export function isValidManualPickingReason(reason: string): boolean {
  const trimmed = reason.trim();
  return MANUAL_PICKING_VERIFICATION_REASONS.some((item) => item.label === trimmed);
}

export function formatManualPickingMarker(reason: string): string {
  return `${MANUAL_PICKING_VERIFICATION_PREFIX}${reason.trim()}`.slice(0, 200);
}

export function parseManualPickingReason(pickedGs1Code?: string): string | null {
  if (!pickedGs1Code || !pickedGs1Code.startsWith(MANUAL_PICKING_VERIFICATION_PREFIX)) {
    return null;
  }
  const reason = pickedGs1Code.slice(MANUAL_PICKING_VERIFICATION_PREFIX.length).trim();
  return reason || null;
}

export function buildManualPickingAuditMessage(params: {
  drugName: string;
  reason: string;
  pharmacistName?: string;
}): string {
  const actor = params.pharmacistName?.trim() || '担当薬剤師';
  return `[目視照合] 「${params.drugName}」を薬剤師の目視確認で照合しました（理由: ${params.reason.trim()} / 確認者: ${actor}）。`;
}

export interface ManualPickingDbLike extends AuditLogDatabaseLike {
  prescription_items: {
    findOne: (itemId: string) => {
      exec: () => Promise<{
        dispensedDrug?: string;
        drugId: string;
        modify: (fn: (data: PrescriptionItem) => PrescriptionItem) => Promise<unknown>;
      } | null>;
    };
  };
}

export async function executeManualVisualPicking(params: {
  db: ManualPickingDbLike | null | undefined;
  ensureActiveVisitEditable: (stage: 'picking') => Promise<{ ok: true } | { ok: false; message: string }>;
  itemId: string;
  reason: string;
  pharmacistName?: string;
  notify: { success: (msg: string) => void; error: (msg: string) => void; warning: (msg: string) => void };
}): Promise<{ success: boolean; message: string }> {
  if (!params.db) {
    return { success: false, message: 'データベースが未接続です。' };
  }
  const trimmedReason = params.reason.trim();
  if (!isValidManualPickingReason(trimmedReason)) {
    return { success: false, message: '目視照合の理由を選択してください。' };
  }
  try {
    const editable = await params.ensureActiveVisitEditable('picking');
    if (!editable.ok) {
      params.notify.error(editable.message);
      return { success: false, message: editable.message };
    }
    const doc = await params.db.prescription_items.findOne(params.itemId).exec();
    if (!doc) {
      const message = 'ピッキング対象の処方明細が見つかりません。';
      params.notify.error(message);
      return { success: false, message };
    }
    const drugName = doc.dispensedDrug || doc.drugId;
    const marker = formatManualPickingMarker(trimmedReason);
    await doc.modify((data: PrescriptionItem) => {
      data.isPicked = true;
      data.pickedAt = new Date().toISOString();
      data.pickedGs1Code = marker;
      delete data.pickedGtin;
      delete data.pickedLotNumber;
      delete data.pickedExpirationDate;
      delete data.pickedStockId;
      return data;
    });
    const activeDb = params.db;
    await recordAuditOrNotify(
      () => logAuditAction(
        activeDb,
        'stock_update',
        buildManualPickingAuditMessage({
          drugName,
          reason: trimmedReason,
          pharmacistName: params.pharmacistName
        })
      ),
      (message) => params.notify.warning(message)
    );
    const successMessage = `${drugName} を目視確認で照合しました（理由: ${trimmedReason}）。`;
    params.notify.success(successMessage);
    return { success: true, message: successMessage };
  } catch (e) {
    console.error('Failed to record manual visual picking:', e);
    const message = '目視照合の保存に失敗しました。';
    params.notify.error(message);
    return { success: false, message };
  }
}

export interface PickingItem {
  itemId: string;
  drugName: string;
  totalQuantity: number;
  location?: string;
  isPicked: boolean;
  shortageQuantity: number;
  shortageNote?: string;
  pickedGs1Code?: string;
  pickedGtin?: string;
  pickedLotNumber?: string;
  pickedExpirationDate?: string;
}

export interface EmrPickingStockLot {
  id: string;
  janCode?: string;
  lotNumber?: string;
  expirationDate?: string;
  arrivalDate?: string;
  quantity: number;
}

export interface EmrPickingItem extends PickingItem {
  visitId: string;
  rpNumber?: number;
  drugId: string;
  stockDrugId: string;
  prescribedDrugName: string;
  yjCode?: string;
  janCodes: string[];
  amount: number;
  usage: string;
  days: number;
  pickedAt?: string;
  pickedGs1Code?: string;
  pickedStockId?: string;
  stockLots: EmrPickingStockLot[];
}

export interface EmrPrescribedDrugItem {
  code?: string;
  name?: string;
  documentUrl?: string;
  genericName?: string;
  isGeneric?: boolean;
  isHighRisk?: boolean;
}

