import type { TracingReportStatus } from '@/db/types';
import { ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard';
import { toLocalDateKey } from './local_date';
import { restoreFields } from './rxdb_restore.ts';

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

export type ReversiblePatch = {
  doc: { patch: (patch: Record<string, unknown>) => Promise<unknown> };
  patch: Record<string, unknown>;
  rollbackPatch: Record<string, unknown>;
  label: string;
};

export function safeStockQuantity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function consumeFromStockLot(
  stock: any,
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

// 元に戻せなかった書き込み(label)。呼び出し側は「データを確認してください」と利用者に伝える。
export class PatchRollbackError extends Error {
  readonly failedLabels: string[];
  constructor(failedLabels: string[]) {
    super(`元に戻せなかった書き込み: ${failedLabels.join(', ')}`);
    this.name = 'PatchRollbackError';
    this.failedLabels = failedLabels;
  }
}

// 適用済みの書き込みを逆順に戻す。1つ失敗しても残りは戻し、戻せなかったものがあれば最後に PatchRollbackError を投げる。
export async function rollbackAppliedPatches(appliedPatches: ReversiblePatch[]): Promise<void> {
  const failedLabels: string[] = [];
  for (let i = appliedPatches.length - 1; i >= 0; i--) {
    const operation = appliedPatches[i];
    try {
      await restoreFields(operation.doc, operation.rollbackPatch);
    } catch (error) {
      console.error(`Failed to rollback ${operation.label}:`, error);
      failedLabels.push(operation.label);
    }
  }
  if (failedLabels.length > 0) throw new PatchRollbackError(failedLabels);
}

// 書き込みを順に適用し、適用済みの一覧を返す。途中で失敗したらそこまでを戻して元のエラーを投げる。
// 戻す処理にも失敗したときは、その旨をメッセージに加える(在庫が中途半端に残っていることを利用者に伝える)。
export async function applyReversiblePatches(operations: ReversiblePatch[]): Promise<ReversiblePatch[]> {
  const applied: ReversiblePatch[] = [];
  try {
    for (const operation of operations) {
      await operation.doc.patch(operation.patch);
      applied.push(operation);
    }
  } catch (error) {
    try {
      await rollbackAppliedPatches(applied);
    } catch {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${reason}${ROLLBACK_ALSO_FAILED_NOTE}`);
    }
    throw error;
  }
  return applied;
}

export interface PickingItem {
  itemId: string;
  drugName: string;
  totalQuantity: number;
  location?: string;
  isPicked: boolean;
  shortageQuantity: number;
  shortageNote?: string;
  pickedGtin?: string;
  pickedLotNumber?: string;
  pickedExpirationDate?: string;
}

