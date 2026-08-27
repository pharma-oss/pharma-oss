import { logAuditAction } from '@/lib/audit';
import { getClaimItemFlagValue } from './helpers';
import {
  formatDrugPriceOverrideWarning,
  resolveDrugPriceWithOverride,
  type DrugPriceOverride,
  type DrugPriceSource
} from '@/lib/drug_price_history';
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
  prescriptionItemNotFound: '対象の処方明細が見つかりません。',
  drugPriceOverrideAuditRolledBack: '薬価の版変更の監査ログ記録に失敗したため、変更を元に戻しました。',
  officialCopaymentAuditRolledBack: '一部負担金額の監査ログ記録に失敗したため、記録を元に戻しました。',
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

/**
 * 保存済みの claimOptions を画面の state にする。
 *
 * 既知の3項目だけを組み直すと、公式レセプト専用の項目 (一部負担金額・特記事項など)
 * が画面に出てこないまま、次の保存で消える。持っているものはすべて持ち回す。
 */
export function readClaimOptionsState(stored: FeeCalculationOptions | undefined): FeeCalculationOptions {
  return {
    ...(stored || {}),
    drugFeeOnly: !!stored?.drugFeeOnly,
    disabledFeeCodes: Array.from(stored?.disabledFeeCodes || []),
    disabledFeeRationales: { ...(stored?.disabledFeeRationales || {}) }
  };
}

/** 値が undefined の項目は書き込まない (項目ごと消したいときに使う) */
function withoutUndefined(options: FeeCalculationOptions): FeeCalculationOptions {
  return Object.fromEntries(
    Object.entries(options as Record<string, unknown>).filter(([, value]) => value !== undefined)
  ) as FeeCalculationOptions;
}

export async function persistClaimOptions(params: PersistClaimOptionsParams): Promise<void> {
  const { db, visitId, onPersisted } = params;
  if (!db) throw new Error(CLAIM_ACTION_MESSAGES.databaseNotReady);
  const visitDoc = await db.visits.findOne(visitId).exec();
  if (!visitDoc) throw new Error(CLAIM_ACTION_MESSAGES.visitNotFound);
  // claimOptions は丸ごと置き換わる。呼び出し側は保存済みの全項目を持った
  // state を渡すこと (readClaimOptionsState)。渡し漏れた項目は消える。
  const options = withoutUndefined(params.options);
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
  /** 画面が持っている処方明細 (現在値の読み取りに使う) */
  item: any;
  /**
   * 保存先のRxDocument。画面の item は toJSON() 由来で doc を持たないため、
   * 呼び出し側が DB から引いて渡す。ここを item.doc に頼ると、
   * 画面では常に undefined になり保存が黙って行われなくなる。
   */
  itemDoc: any;
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
  const { db, item, itemDoc, field, value, patientId, patientName, logAudit = logAuditAction } = params;
  if (!itemDoc) {
    throw new Error(CLAIM_ACTION_MESSAGES.prescriptionItemNotFound);
  }
  const { patch, previousPatch } = buildItemClaimFlagPatches(item, field, value);
  await itemDoc.patch(patch);

  const auditOk = await logAudit(
    db,
    'billing_toggle',
    buildItemClaimFlagAuditDetail(item, field, value),
    patientId,
    patientName
  );
  if (!auditOk) {
    await itemDoc.patch(previousPatch);
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

export interface ApplyDrugPriceOverrideParams {
  db: PharmacyDatabase;
  /** 画面が持っている処方明細 */
  item: any;
  /** 保存先のRxDocument。呼び出し側が DB から引いて渡す */
  itemDoc: any;
  /** 算定に使う薬品マスター (調剤薬があればそちら) */
  drug: DrugPriceSource;
  dispensingDate: string;
  /** null を渡すと上書きを外して調剤日時点の版へ戻す */
  override: DrugPriceOverride | null;
  patientId?: string;
  patientName?: string;
  logAudit?: LogAuditActionFn;
}

export interface DrugPriceOverrideOutcome {
  /** 適用後に算定へ使われる薬価 */
  price?: number;
  /** 調剤日時点の版と違う版を適用したか */
  overridden: boolean;
  /** overridden のときの警告文。画面と監査ログで同じ文言を使う */
  warning: string;
}

export function buildDrugPriceOverrideAuditDetail(
  item: any,
  outcome: DrugPriceOverrideOutcome,
  dispensingDate: string
): string {
  const drugLabel = item?.dispensedDrug || item?.drugName || item?.drugId;
  if (!outcome.overridden) {
    return `薬価の版変更: 薬品「${drugLabel}」を調剤日 ${dispensingDate} 時点の薬価（${outcome.price ?? '不明'}円）へ戻しました。`;
  }
  return `薬価の版変更: 薬品「${drugLabel}」に調剤日時点と異なる薬価を適用しました。${outcome.warning}`;
}

/**
 * 処方薬の薬価の版を切り替える。監査ログが残らなければ元へ戻して投げる。
 *
 * 点数が変わる操作なので、調剤日時点と違う版を選んだことが監査ログに必ず残るようにする。
 */
export async function applyDrugPriceOverrideWithAudit(
  params: ApplyDrugPriceOverrideParams
): Promise<DrugPriceOverrideOutcome> {
  const {
    db,
    item,
    itemDoc,
    drug,
    dispensingDate,
    override,
    patientId,
    patientName,
    logAudit = logAuditAction
  } = params;

  if (!itemDoc) {
    throw new Error(CLAIM_ACTION_MESSAGES.prescriptionItemNotFound);
  }

  const previousOverride: DrugPriceOverride | undefined = item?.drugPriceOverride;
  const resolution = resolveDrugPriceWithOverride(drug, dispensingDate, override);
  const outcome: DrugPriceOverrideOutcome = {
    price: resolution.price,
    overridden: resolution.source === 'override',
    warning: formatDrugPriceOverrideWarning(resolution, dispensingDate)
  };

  // 上書きを外すときは項目ごと消す (undefined を書くと RxDB の任意項目に残る)
  // 上書きを外すときは項目ごと消す。null を書くとスキーマ検証で落ち (RxError VD2)、
  // undefined を書くと RxDB の任意項目に残る。
  // 開始日不明の版を選んだときは effectiveFrom を持たせない。
  const writeOverride = (data: any, next: DrugPriceOverride | null | undefined) => {
    const document = { ...data };
    if (!next) {
      delete document.drugPriceOverride;
    } else if (next.effectiveFrom === undefined) {
      document.drugPriceOverride = { price: next.price };
    } else {
      document.drugPriceOverride = { effectiveFrom: next.effectiveFrom, price: next.price };
    }
    return document;
  };
  await itemDoc.modify((data: any) => writeOverride(data, override));

  const auditOk = await logAudit(
    db,
    'billing_toggle',
    buildDrugPriceOverrideAuditDetail(item, outcome, dispensingDate),
    patientId,
    patientName
  );
  if (!auditOk) {
    await itemDoc.modify((data: any) => writeOverride(data, previousOverride));
    throw new Error(CLAIM_ACTION_MESSAGES.drugPriceOverrideAuditRolledBack);
  }

  return outcome;
}
