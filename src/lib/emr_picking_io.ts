import type { PrescriptionItem, Visit } from '@/db/types';
import { logAuditAction, type AuditLogDatabaseLike } from './audit';
import { ExportAuditFailedError, exportWithAuditFirst, recordAuditOrNotify } from './audit_guard';
import { downloadTextFile } from './blob_download';
import type { EmrPickingItem } from './emr_helpers';
import type { PickingReceiptInput } from './picking_receipt';
import type { PickingResultApplyPlan, PickingResultParseIssue } from './picking_system';

export interface EmrPickingIoNotify {
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

export type EmrPickingVisitDocLike =
  | Visit
  | { toJSON?: () => Visit };

export interface EmrPickingIoDbLike extends AuditLogDatabaseLike {
  patients: {
    findOne: (patientId: string) => {
      exec: () => Promise<{ name?: string; kana?: string } | null>;
    };
  };
  facility_settings: {
    findOne: (id: string) => {
      exec: () => Promise<{ pharmacyName?: string } | null>;
    };
  };
  prescription_items: {
    findOne: (itemId: string) => {
      exec: () => Promise<{
        modify: (fn: (data: PrescriptionItem) => PrescriptionItem) => Promise<unknown>;
      } | null>;
    };
  };
}

function unwrapVisitDoc(visitDoc: EmrPickingVisitDocLike): Visit {
  if ('toJSON' in visitDoc && typeof visitDoc.toJSON === 'function') {
    return visitDoc.toJSON();
  }
  return visitDoc as Visit;
}

export function buildPickingResultConfirmMessage(
  plan: PickingResultApplyPlan,
  allIssues: readonly PickingResultParseIssue[]
): string {
  const detailLines = [
    ...plan.updates.slice(0, 8).map((update) => (
      update.action === 'picked'
        ? `照合: ${update.drugName}${update.lotNumber ? ` (Lot ${update.lotNumber})` : ''}${update.warnings.length > 0 ? ` ※${update.warnings.join(' ')}` : ''}`
        : `不足: ${update.drugName} (${update.shortageQuantity})`
    )),
    ...(plan.updates.length > 8 ? [`ほか${plan.updates.length - 8}件`] : []),
    ...allIssues.slice(0, 3).map((issue) => `取込不可 ${issue.lineNumber}行目: ${issue.message}`)
  ];
  return `外部ピッキング結果を反映します（${plan.summary}）。\n\n${detailLines.join('\n')}\n\nよろしいですか？`;
}

// ピッキング結果をレジロール紙(80mm)向けの専用ウィンドウで印刷する
export async function executePrintPickingReceipt(params: {
  db: EmrPickingIoDbLike | null | undefined;
  pickingItems: readonly EmrPickingItem[];
  findActiveVisit: () => Promise<EmrPickingVisitDocLike | null>;
  operatorName: string;
  notify: EmrPickingIoNotify;
  openPrintWindow?: (input: PickingReceiptInput) => boolean;
  logAudit?: typeof logAuditAction;
}): Promise<{ ok: true } | { ok: false; reason: 'empty' | 'no_db' | 'popup_blocked' | 'error' }> {
  const { db, pickingItems, findActiveVisit, operatorName, notify } = params;
  if (pickingItems.length === 0) {
    notify.info('印刷するピッキング項目がありません。');
    return { ok: false, reason: 'empty' };
  }
  if (!db) {
    notify.error('データベースの準備ができていません。しばらく待ってから再実行してください。');
    return { ok: false, reason: 'no_db' };
  }
  try {
    let patientName = '患者未選択';
    let dispensingDate = '';
    let patientId = '';
    const visitDoc = await findActiveVisit();
    if (visitDoc) {
      const visit = unwrapVisitDoc(visitDoc);
      dispensingDate = visit.dispensingDate || visit.prescriptionDate || '';
      patientId = visit.patientId;
      const patientDoc = await db.patients.findOne(visit.patientId).exec();
      if (patientDoc?.name) patientName = patientDoc.name;
    }

    let pharmacyName = '';
    try {
      const settings = await db.facility_settings.findOne('default').exec();
      pharmacyName = settings?.pharmacyName || '';
    } catch {
      // 施設名が取れなくても印刷は続行する
    }

    const openWindow = params.openPrintWindow
      ?? (await import('./picking_receipt')).openPickingReceiptPrintWindow;
    const opened = openWindow({
      pharmacyName,
      patientName,
      dispensingDate,
      operatorName,
      items: pickingItems.map((item) => ({
        location: item.location,
        drugName: item.drugName,
        totalQuantity: item.totalQuantity,
        usage: item.usage,
        days: item.days,
        isPicked: !!item.isPicked,
        pickedLotNumber: item.pickedLotNumber,
        pickedExpirationDate: item.pickedExpirationDate,
        shortageQuantity: item.shortageQuantity,
        shortageNote: item.shortageNote
      }))
    });
    if (!opened) {
      notify.error('印刷ウィンドウを開けませんでした。ポップアップを許可してください。');
      return { ok: false, reason: 'popup_blocked' };
    }
    const writeAudit = params.logAudit ?? logAuditAction;
    await recordAuditOrNotify(
      () => writeAudit(
        db,
        'print',
        `ピッキングリスト印刷: 「${patientName}」のピッキングリストをレジロール用に印刷しました（${pickingItems.length}品目）。`,
        patientId,
        patientName
      ),
      (message) => notify.warning(message)
    );
    return { ok: true };
  } catch (e) {
    console.error('Failed to print picking receipt:', e);
    notify.error('ピッキングリストの印刷に失敗しました');
    return { ok: false, reason: 'error' };
  }
}

// 既存(外部)ピッキングシステムへ渡す指示CSV(棚番地・JAN・必要数量・ロット候補入り)を書き出す
export async function executeExportPickingInstruction(params: {
  db: EmrPickingIoDbLike | null | undefined;
  pickingItems: readonly EmrPickingItem[];
  findActiveVisit: () => Promise<EmrPickingVisitDocLike | null>;
  notify: EmrPickingIoNotify;
  downloadFile?: (fileName: string, content: string, mimeType: string) => void;
  logAudit?: typeof logAuditAction;
}): Promise<
  | { ok: true; itemCount: number; fileName: string }
  | { ok: false; reason: 'empty' | 'no_db' | 'no_visit' | 'audit_failed' | 'error' }
> {
  const { db, pickingItems, findActiveVisit, notify } = params;
  if (pickingItems.length === 0) {
    notify.info('書き出すピッキング項目がありません。');
    return { ok: false, reason: 'empty' };
  }
  if (!db) {
    notify.error('データベースの準備ができていません。しばらく待ってから再実行してください。');
    return { ok: false, reason: 'no_db' };
  }
  try {
    const visitDoc = await findActiveVisit();
    if (!visitDoc) {
      notify.error('対象の受付が見つかりません。');
      return { ok: false, reason: 'no_visit' };
    }
    const visit = unwrapVisitDoc(visitDoc);
    const patientDoc = await db.patients.findOne(visit.patientId).exec();
    const settings = await db.facility_settings.findOne('default').exec();

    const {
      buildPickingInstruction,
      buildPickingInstructionCsv,
      buildPickingInstructionFileName
    } = await import('./picking_system');
    const instruction = buildPickingInstruction({
      visitId: visit.visitId,
      patientName: patientDoc?.name || '患者名未登録',
      patientKana: patientDoc?.kana || '',
      dispensingDate: visit.dispensingDate || visit.prescriptionDate || '',
      pharmacyName: settings?.pharmacyName || '',
      items: pickingItems.map((item) => ({
        itemId: item.itemId,
        rpNumber: item.rpNumber,
        drugCode: item.stockDrugId || item.drugId,
        yjCode: item.yjCode,
        janCodes: item.janCodes,
        drugName: item.drugName,
        totalQuantity: item.totalQuantity,
        usage: item.usage,
        days: item.days,
        location: item.location,
        isPicked: item.isPicked,
        stockLots: (item.stockLots || []).map((lot) => ({
          lotNumber: lot.lotNumber,
          expirationDate: lot.expirationDate,
          quantity: lot.quantity
        }))
      }))
    });
    const fileName = buildPickingInstructionFileName(visit.visitId);
    const csv = buildPickingInstructionCsv(instruction);
    const writeAudit = params.logAudit ?? logAuditAction;
    const download = params.downloadFile ?? downloadTextFile;
    // 患者名と処方内容を持ち出す書き出し。監査ログを先に残し、残らなければ書き出さない。
    await exportWithAuditFirst({
      logAudit: () => writeAudit(
        db,
        'stock_update',
        `ピッキング指示CSV書き出し: 「${fileName}」に${instruction.items.length}品目を出力しました（外部ピッキングシステム連携用・店舗内利用限定）。`,
        visit.patientId,
        patientDoc?.name
      ),
      download: () => download(fileName, `\ufeff${csv}`, 'text/csv;charset=utf-8')
    });
    notify.success(`ピッキング指示CSVを書き出しました（${instruction.items.length}品目）。`);
    return { ok: true, itemCount: instruction.items.length, fileName };
  } catch (e) {
    console.error('Failed to export picking instruction:', e);
    if (e instanceof ExportAuditFailedError) {
      notify.error(e.message);
      return { ok: false, reason: 'audit_failed' };
    }
    notify.error('ピッキング指示CSVの書き出しに失敗しました');
    return { ok: false, reason: 'error' };
  }
}

// 外部ピッキングシステムが出力した結果CSV/TSVを読み取り、GS1照合と同じ形へ反映する
export async function executeImportPickingResultFile(params: {
  db: EmrPickingIoDbLike | null | undefined;
  pickingItems: readonly EmrPickingItem[];
  file: { name: string; text: () => Promise<string> };
  ensureActiveVisitEditable: (stage: 'picking') => Promise<{ ok: true } | { ok: false; message: string }>;
  findActiveVisit: () => Promise<EmrPickingVisitDocLike | null>;
  notify: EmrPickingIoNotify;
  confirmApply?: (message: string) => boolean;
  now?: () => Date;
  logAudit?: typeof logAuditAction;
}): Promise<
  | { ok: true; appliedCount: number; summary: string }
  | { ok: false; reason: 'no_db' | 'not_editable' | 'no_visit' | 'parse_failed' | 'nothing_to_apply' | 'cancelled' | 'error' }
> {
  const { db, pickingItems, file, ensureActiveVisitEditable, findActiveVisit, notify } = params;
  if (!db) {
    notify.error('データベースの準備ができていません。しばらく待ってから再実行してください。');
    return { ok: false, reason: 'no_db' };
  }
  try {
    const editable = await ensureActiveVisitEditable('picking');
    if (!editable.ok) {
      notify.error(editable.message);
      return { ok: false, reason: 'not_editable' };
    }
    const visitDoc = await findActiveVisit();
    if (!visitDoc) {
      notify.error('対象の受付が見つかりません。');
      return { ok: false, reason: 'no_visit' };
    }
    const visit = unwrapVisitDoc(visitDoc);

    const text = await file.text();
    const {
      parsePickingSystemResult,
      buildPickingResultApplyPlan,
      buildPickingResultAuditDetail
    } = await import('./picking_system');
    const parsed = parsePickingSystemResult(text);
    if (!parsed.ok) {
      notify.error(parsed.message || 'ピッキング結果を読み取れませんでした。');
      return { ok: false, reason: 'parse_failed' };
    }
    const plan = buildPickingResultApplyPlan({
      visitId: visit.visitId,
      items: pickingItems.map((item) => ({
        itemId: item.itemId,
        drugId: item.drugId,
        stockDrugId: item.stockDrugId,
        yjCode: item.yjCode,
        janCodes: item.janCodes,
        drugName: item.drugName,
        totalQuantity: item.totalQuantity,
        isPicked: item.isPicked
      })),
      rows: [...parsed.rows]
    });
    const allIssues = [...parsed.issues, ...plan.issues];
    if (!plan.canApply) {
      const issueText = allIssues.slice(0, 5).map((issue) => `${issue.lineNumber}行目: ${issue.message}`).join('\n');
      notify.error(`反映できる結果がありません。\n${issueText}`.trim());
      return { ok: false, reason: 'nothing_to_apply' };
    }

    const confirmFn = params.confirmApply ?? ((message: string) => window.confirm(message));
    const shouldApply = confirmFn(buildPickingResultConfirmMessage(plan, allIssues));
    if (!shouldApply) {
      return { ok: false, reason: 'cancelled' };
    }

    const appliedAt = (params.now ? params.now() : new Date()).toISOString();
    for (const update of plan.updates) {
      const doc = await db.prescription_items.findOne(update.itemId).exec();
      if (!doc) continue;
      if (update.action === 'picked') {
        await doc.modify((data: PrescriptionItem) => {
          data.isPicked = true;
          data.pickedAt = appliedAt;
          delete data.pickedGs1Code;
          delete data.pickedGtin;
          delete data.pickedStockId;
          delete data.pickedLotNumber;
          delete data.pickedExpirationDate;
          if (update.lotNumber) data.pickedLotNumber = update.lotNumber;
          if (update.expirationDate) data.pickedExpirationDate = update.expirationDate;
          return data;
        });
      } else {
        await doc.modify((data: PrescriptionItem) => {
          data.shortageQuantity = update.shortageQuantity as number;
          if (update.note) {
            data.shortageNote = update.note;
          }
          data.shortageRecordedAt = appliedAt;
          return data;
        });
      }
    }

    const patientDoc = await db.patients.findOne(visit.patientId).exec();
    const writeAudit = params.logAudit ?? logAuditAction;
    await recordAuditOrNotify(
      () => writeAudit(
        db,
        'stock_update',
        `${buildPickingResultAuditDetail(plan)}（結果ファイル: ${file.name}）。反映後は現物とロット・期限の一致を確認してください。`,
        visit.patientId,
        patientDoc?.name
      ),
      (message) => notify.warning(message)
    );
    notify.success(`外部ピッキング結果を反映しました（${plan.summary}）。`);
    return { ok: true, appliedCount: plan.updates.length, summary: plan.summary };
  } catch (e) {
    console.error('Failed to import picking system result:', e);
    notify.error('ピッキング結果の取込に失敗しました');
    return { ok: false, reason: 'error' };
  }
}
