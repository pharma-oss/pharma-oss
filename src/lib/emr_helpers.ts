import type { TracingReportStatus } from '@/db/types';

export function toDateInputValue(value?: string): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export function todayDateInputValue(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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

export async function rollbackAppliedPatches(appliedPatches: ReversiblePatch[]) {
  for (let i = appliedPatches.length - 1; i >= 0; i--) {
    const operation = appliedPatches[i];
    try {
      await operation.doc.patch(operation.rollbackPatch);
    } catch (error) {
      console.error(`Failed to rollback ${operation.label}:`, error);
    }
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
  pickedGtin?: string;
  pickedLotNumber?: string;
  pickedExpirationDate?: string;
}

