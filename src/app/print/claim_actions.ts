import { logAuditAction } from '@/lib/audit';
import { getClaimItemFlagValue } from './helpers';
import type { FeeCalculationOptions } from '@/lib/calculator';
import type { ClaimLifecycleState } from '@/lib/claim_lifecycle';
import type { AuditActionType, PharmacyDatabase } from '@/db/types';

// 印刷画面の「監査ログが残らなければ操作を確定させない」契約をまとめた層。
//
// これらは元々 page.tsx のクロージャ内にあり、PrintPickingFlow.test.ts が
// ソース文字列の正規表現でしか守れていなかった。ロールバックの取りこぼしは
// 画面上は成功に見えるため (実際に AI 下書き承認で監査ログ未記録を見逃した)、
// モック DB による実動テストで守れる形へ切り出している。

export type LogAuditActionFn = (
  db: PharmacyDatabase,
  actionType: AuditActionType,
  details: string,
  patientId?: string,
  patientName?: string
) => Promise<boolean>;

export const CLAIM_ACTION_MESSAGES = {
  databaseNotReady: 'データベースの初期化が完了していません。',
  visitNotFound: '対象の受付が見つかりません。',
  printAuditFailed: '印刷の監査ログ記録に失敗したため、印刷を中止しました。',
  drugFeeOnlyAuditRolledBack: '点数請求切替の監査ログ記録に失敗したため、変更を元に戻しました。',
  feeToggleAuditRolledBack: '算定切替の監査ログ記録に失敗したため、変更を元に戻しました。',
  itemClaimToggleAuditRolledBack: '処方薬別算定切替の監査ログ記録に失敗したため、変更を元に戻しました。',
  claimLifecycleVisitNotFound: 'Visit was not found.',
  claimLifecycleAuditRolledBack: '請求状態変更の監査ログ記録に失敗したため、変更を取り消しました。'
} as const;

type MaybeDatabase = PharmacyDatabase | null | undefined;

export function buildPrintAuditDetail(visitId: string, patientName?: string): string {
  return `帳票印刷実行: 受付ID ${visitId} / 患者 ${patientName || '未設定'}`;
}

export interface PrintDocumentsWithAuditLogParams {
  db: MaybeDatabase;
  visitId: string;
  patientId?: string;
  patientName?: string;
  print: () => void;
  logAudit?: LogAuditActionFn;
}

export type PrintDocumentsOutcome =
  | { status: 'printed' }
  | { status: 'blocked'; message: string };

/**
 * 監査ログの記録に成功したときだけ印刷を実行する。
 * 記録が失敗した状態で印刷されると「誰が何を刷ったか」が追えなくなるため、
 * print() の呼び出しは必ず監査ログの後ろに置く。
 */
export async function printDocumentsWithAuditLog(
  params: PrintDocumentsWithAuditLogParams
): Promise<PrintDocumentsOutcome> {
  const { db, visitId, patientId, patientName, print, logAudit = logAuditAction } = params;
  if (!db) {
    return { status: 'blocked', message: CLAIM_ACTION_MESSAGES.databaseNotReady };
  }
  const auditOk = await logAudit(
    db,
    'print',
    buildPrintAuditDetail(visitId, patientName),
    patientId,
    patientName
  );
  if (!auditOk) {
    return { status: 'blocked', message: CLAIM_ACTION_MESSAGES.printAuditFailed };
  }
  print();
  return { status: 'printed' };
}

export interface PersistClaimOptionsParams {
  db: MaybeDatabase;
  visitId: string;
  options: FeeCalculationOptions;
  onPersisted?: (options: FeeCalculationOptions) => void;
}

export async function persistClaimOptions(params: PersistClaimOptionsParams): Promise<void> {
  const { db, visitId, options, onPersisted } = params;
  if (!db) throw new Error(CLAIM_ACTION_MESSAGES.databaseNotReady);
  const visitDoc = await db.visits.findOne(visitId).exec();
  if (!visitDoc) throw new Error(CLAIM_ACTION_MESSAGES.visitNotFound);
  await visitDoc.patch({ claimOptions: options } as any);
  onPersisted?.(options);
}

export interface ApplyClaimOptionsWithAuditParams {
  db: MaybeDatabase;
  visitId: string;
  previousOptions: FeeCalculationOptions;
  nextOptions: FeeCalculationOptions;
  auditDetail: string;
  rollbackMessage: string;
  patientId?: string;
  patientName?: string;
  /** 画面側の claimOptions state を切り替える (楽観更新と巻き戻しの両方で呼ばれる) */
  applyOptions: (options: FeeCalculationOptions) => void;
  /** 保存が成功したあとに visitData 側へ反映する */
  onPersisted?: (options: FeeCalculationOptions) => void;
  logAudit?: LogAuditActionFn;
}

export type ClaimOptionsAuditOutcome =
  | { status: 'applied' }
  | { status: 'rolled_back'; message: string };

/**
 * 点数請求オプションを保存し、監査ログが残らなければ元の値へ戻す。
 * 保存自体の失敗 (DB 未初期化・受付なし) は呼び出し元へ投げ返す。
 */
export async function applyClaimOptionsWithAudit(
  params: ApplyClaimOptionsWithAuditParams
): Promise<ClaimOptionsAuditOutcome> {
  const {
    db,
    visitId,
    previousOptions,
    nextOptions,
    auditDetail,
    rollbackMessage,
    patientId,
    patientName,
    applyOptions,
    onPersisted,
    logAudit = logAuditAction
  } = params;

  applyOptions(nextOptions);
  await persistClaimOptions({ db, visitId, options: nextOptions, onPersisted });

  const auditOk = await logAudit(db as PharmacyDatabase, 'billing_toggle', auditDetail, patientId, patientName);
  if (!auditOk) {
    applyOptions(previousOptions);
    await persistClaimOptions({ db, visitId, options: previousOptions, onPersisted });
    return { status: 'rolled_back', message: rollbackMessage };
  }
  return { status: 'applied' };
}

export interface ItemClaimFlagPatches {
  patch: Record<string, boolean>;
  previousPatch: Record<string, boolean>;
}

/**
 * 処方薬別の算定フラグ変更と、その巻き戻し用パッチを組み立てる。
 * 検査扱い (isDiagnosticTest) を ON にしたときは調剤料・管理料の算定も落とすため、
 * 巻き戻しでは 3 つとも元へ戻す必要がある。
 */
export function buildItemClaimFlagPatches(
  item: any,
  field: string,
  value: boolean
): ItemClaimFlagPatches {
  const patch: Record<string, boolean> = { [field]: value };
  const previousPatch: Record<string, boolean> = { [field]: getClaimItemFlagValue(item, field) };
  if (field === 'isDiagnosticTest' && value) {
    patch.claimPreparation = false;
    patch.claimManagement = false;
    previousPatch.claimPreparation = getClaimItemFlagValue(item, 'claimPreparation');
    previousPatch.claimManagement = getClaimItemFlagValue(item, 'claimManagement');
  }
  return { patch, previousPatch };
}

export function buildItemClaimFlagAuditDetail(item: any, field: string, value: boolean): string {
  const drugLabel = item?.dispensedDrug || item?.drugName || item?.drugId;
  return `処方薬別算定切替: 薬品「${drugLabel}」の「${field}」を ${value ? 'ON' : 'OFF'} に変更しました。`;
}

export interface ApplyItemClaimFlagWithAuditParams {
  db: PharmacyDatabase;
  item: any;
  field: string;
  value: boolean;
  patientId?: string;
  patientName?: string;
  logAudit?: LogAuditActionFn;
}

/**
 * 処方薬別の算定フラグを保存し、監査ログが残らなければ元の値へ戻したうえで投げる。
 * 巻き戻し後に投げるのは、呼び出し元がまとめて画面へ通知するため。
 */
export async function applyItemClaimFlagWithAudit(
  params: ApplyItemClaimFlagWithAuditParams
): Promise<Record<string, boolean>> {
  const { db, item, field, value, patientId, patientName, logAudit = logAuditAction } = params;
  const { patch, previousPatch } = buildItemClaimFlagPatches(item, field, value);
  await item.doc.patch(patch);

  const auditOk = await logAudit(
    db,
    'billing_toggle',
    buildItemClaimFlagAuditDetail(item, field, value),
    patientId,
    patientName
  );
  if (!auditOk) {
    await item.doc.patch(previousPatch);
    throw new Error(CLAIM_ACTION_MESSAGES.itemClaimToggleAuditRolledBack);
  }
  return patch;
}

export interface PersistClaimLifecycleWithAuditParams {
  db: MaybeDatabase;
  visitId: string;
  nextLifecycle: ClaimLifecycleState;
  detail: string;
  patientId?: string;
  patientName?: string;
  applyLifecycle: (lifecycle: ClaimLifecycleState) => void;
  logAudit?: LogAuditActionFn;
}

/**
 * 返戻登録・再請求準備・請求完了の状態遷移を保存する。
 * 監査ログが残らなければ直前の状態 (無ければ draft) へ戻して投げる。
 * ここが素通りすると、返戻の記録が無いまま請求ロックだけが動く。
 */
export async function persistClaimLifecycleWithAudit(
  params: PersistClaimLifecycleWithAuditParams
): Promise<void> {
  const {
    db,
    visitId,
    nextLifecycle,
    detail,
    patientId,
    patientName,
    applyLifecycle,
    logAudit = logAuditAction
  } = params;
  if (!db) return;
  const visitDoc = await db.visits.findOne(visitId).exec();
  if (!visitDoc) {
    throw new Error(CLAIM_ACTION_MESSAGES.claimLifecycleVisitNotFound);
  }
  const previousLifecycle = (visitDoc.toJSON() as any).claimLifecycle as ClaimLifecycleState | undefined;
  await visitDoc.patch({ claimLifecycle: nextLifecycle } as any);
  applyLifecycle(nextLifecycle);

  const auditOk = await logAudit(db, 'claim_lifecycle', detail, patientId, patientName);
  if (!auditOk) {
    const rollbackLifecycle: ClaimLifecycleState = previousLifecycle || { status: 'draft' };
    await visitDoc.patch({ claimLifecycle: rollbackLifecycle } as any);
    applyLifecycle(rollbackLifecycle);
    throw new Error(CLAIM_ACTION_MESSAGES.claimLifecycleAuditRolledBack);
  }
}
