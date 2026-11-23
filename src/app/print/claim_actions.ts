import { logAuditAction } from '@/lib/audit';
import { DEMO_OFFICIAL_UKE_BLOCKED_MESSAGE, getClaimItemFlagValue } from './helpers';
import {
  formatDrugPriceOverrideWarning,
  resolveDrugPriceWithOverride,
  type DrugPriceOverride,
  type DrugPriceSource
} from '@/lib/drug_price_history';
import type { FeeCalculationOptions } from '@/lib/calculator';
import { buildClaimConditionAuditDetail, type ClaimConditionOptions } from '@/lib/claim_conditions';
import { getClaimEditBlockedMessage, isClaimEditBlocked } from '@/lib/claim_edit_guard';
import {
  getClaimLifecycleStatus,
  markClaimExported,
  type ClaimLifecycleState
} from '@/lib/claim_lifecycle';
import { buildClaimExportSnapshot } from '@/lib/claim_snapshot';
import type { SingleDispensingUkeOfficialResult } from '@/lib/receipt/dispensing_uke_official_single';
import {
  formatSingleOfficialUkeExportAuditMessage,
  formatUkeExportClaimLockVoidedAuditMessage
} from '@/lib/receipt/uke_migration_policy';
import { appendVoidingAuditOrNote, ROLLBACK_ALSO_FAILED_NOTE } from '@/lib/audit_guard';
import { SELF_PAY_UKE_BLOCKED_MESSAGE } from '@/lib/self_pay_claim';
import type { AuditActionType, Patient, PharmacyDatabase, PrescriptionItem, Visit } from '@/db/types';
import { restoreFields, restoreWith } from '@/lib/rxdb_restore';

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
  claimLifecycleVisitNotFound: '対象の受付が見つかりません。',
  claimLifecycleAuditRolledBack: '請求状態変更の監査ログ記録に失敗したため、変更を取り消しました。',
  claimConditionAuditRolledBack: '算定条件の変更の監査ログ記録に失敗したため、変更を元に戻しました。',
  printBlockedUnsetPoints: '点数が未設定の算定項目があり、領収金額が確定していません。点数表に値を入れるまで、帳票は印刷できません。'
} as const;

type MaybeDatabase = PharmacyDatabase | null | undefined;

// 患者に渡す薬情が、承認済みの文面か、承認が無いための定型文かを、印刷の記録に残す。
export interface PrintMedicationInfoCounts {
  approvedCount: number;
  fallbackCount: number;
}

export function buildPrintAuditDetail(
  visitId: string,
  patientName?: string,
  medicationInfo?: PrintMedicationInfoCounts
): string {
  const base = `帳票印刷実行: 受付ID ${visitId} / 患者 ${patientName || '未設定'}`;
  return medicationInfo
    ? `${base} / 薬情 承認版 ${medicationInfo.approvedCount}件 / 定型文 ${medicationInfo.fallbackCount}件`
    : base;
}

// 監査ログを残して印刷を始めたあと、ブラウザの印刷が例外で失敗したときの記録。
export function buildPrintFailureAuditDetail(visitId: string, patientName?: string): string {
  return `帳票印刷失敗: 受付ID ${visitId} / 患者 ${patientName || '未設定'} / 監査ログ記録後にブラウザ印刷で失敗しました。`;
}

export interface PrintDocumentsWithAuditLogParams {
  db: MaybeDatabase;
  visitId: string;
  patientId?: string;
  patientName?: string;
  print: () => void;
  medicationInfo?: PrintMedicationInfoCounts;
  /** 監査ログの文言を差し替える (領収証だけの再発行など)。省略時は帳票印刷の定型文 */
  auditDetail?: string;
  logAudit?: LogAuditActionFn;
}

export type PrintDocumentsOutcome =
  | { status: 'printed' }
  | { status: 'blocked'; message: string }
  | { status: 'failed'; message: string };

/**
 * 監査ログの記録に成功したときだけ印刷を実行する。
 * 記録が失敗した状態で印刷されると「誰が何を刷ったか」が追えなくなるため、
 * print() の呼び出しは必ず監査ログの後ろに置く。
 */
export async function printDocumentsWithAuditLog(
  params: PrintDocumentsWithAuditLogParams
): Promise<PrintDocumentsOutcome> {
  const { db, visitId, patientId, patientName, print, medicationInfo, auditDetail, logAudit = logAuditAction } = params;
  if (!db) {
    return { status: 'blocked', message: CLAIM_ACTION_MESSAGES.databaseNotReady };
  }
  const auditOk = await logAudit(
    db,
    'print',
    auditDetail ?? buildPrintAuditDetail(visitId, patientName, medicationInfo),
    patientId,
    patientName
  );
  if (!auditOk) {
    return { status: 'blocked', message: CLAIM_ACTION_MESSAGES.printAuditFailed };
  }
  try {
    print();
  } catch (error) {
    console.error('Failed to print documents:', error);
    await logAudit(db, 'print', buildPrintFailureAuditDetail(visitId, patientName), patientId, patientName);
    return {
      status: 'failed',
      message: `印刷に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    };
  }
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
  await visitDoc.patch({ claimOptions: options as Visit['claimOptions'] });
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

export interface ReceiptReissueSummary {
  totalPoints: number;
  copayYen: number;
  /** 領収証に載せたバーコード。label は紙に印字した区分 (国保・社保・自費・自費扱い)、payload は数字9桁 */
  barcode?: { label: string; payload: string };
}

/**
 * 領収証だけを刷り直したときの監査ログの文言。どの金額で刷ったかを残す。
 * 金額を変える操作そのもの (算定条件変更) は、切り替えた時点の監査ログに別に残る。
 */
export function buildReceiptReissueAuditDetail(
  visitId: string,
  patientName: string | undefined,
  receipt: ReceiptReissueSummary
): string {
  const barcode = receipt.barcode ? ` / バーコード ${receipt.barcode.label} ${receipt.barcode.payload}` : '';
  return `領収証印刷(再発行): 受付ID ${visitId} / 患者 ${patientName || '未設定'} / ${receipt.totalPoints}点・窓口負担¥${receipt.copayYen.toLocaleString('ja-JP')}${barcode}`;
}

export interface ChangeClaimConditionsParams {
  db: MaybeDatabase;
  visitId: string;
  /** 画面に出ている保存済みの claimOptions (全項目) */
  currentOptions: FeeCalculationOptions;
  /** 変える条件だけ。undefined を渡した条件は「未設定(既定)」に戻す */
  patch: ClaimConditionOptions;
  claimLifecycle?: ClaimLifecycleState | null;
  /** 変更前後の点数と窓口負担額。監査ログに残す (点数未設定で確定しない側は渡さない) */
  amounts?: Parameters<typeof buildClaimConditionAuditDetail>[2];
  patientId?: string;
  patientName?: string;
  applyOptions: (options: FeeCalculationOptions) => void;
  onPersisted?: (options: FeeCalculationOptions) => void;
  logAudit?: LogAuditActionFn;
}

export type ChangeClaimConditionsOutcome =
  | { status: 'unchanged' }
  | { status: 'blocked'; message: string }
  | ClaimOptionsAuditOutcome;

/**
 * お薬手帳・時間外等・特管の条件を、その来局の請求内容 (claimOptions) として保存する。
 * 請求ロック後は変更しない。監査ログが残らなければ元に戻す。
 */
export async function changeClaimConditions(
  params: ChangeClaimConditionsParams
): Promise<ChangeClaimConditionsOutcome> {
  const { currentOptions, patch, claimLifecycle } = params;
  if (isClaimEditBlocked(claimLifecycle)) {
    return { status: 'blocked', message: getClaimEditBlockedMessage(claimLifecycle, 'billing') };
  }
  const nextOptions: FeeCalculationOptions = { ...currentOptions, ...patch };
  const auditDetail = buildClaimConditionAuditDetail(currentOptions, nextOptions, params.amounts);
  if (!auditDetail) return { status: 'unchanged' };

  return applyClaimOptionsWithAudit({
    db: params.db,
    visitId: params.visitId,
    previousOptions: currentOptions,
    nextOptions,
    auditDetail,
    rollbackMessage: CLAIM_ACTION_MESSAGES.claimConditionAuditRolledBack,
    patientId: params.patientId,
    patientName: params.patientName,
    applyOptions: params.applyOptions,
    onPersisted: params.onPersisted,
    logAudit: params.logAudit
  });
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
  item: object,
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

export function buildItemClaimFlagAuditDetail(item: object, field: string, value: boolean): string {
  const itemRecord = item as { dispensedDrug?: unknown; drugName?: unknown; drugId?: unknown };
  const drugLabel = itemRecord?.dispensedDrug || itemRecord?.drugName || itemRecord?.drugId;
  return `処方薬別算定切替: 薬品「${drugLabel}」の「${field}」を ${value ? 'ON' : 'OFF'} に変更しました。`;
}

export interface ClaimItemDocLike {
  patch: (patch: Record<string, boolean>) => Promise<unknown>;
}

export interface PrescriptionItemOverrideData {
  drugPriceOverride?: DrugPriceOverride;
}

export interface DrugPriceOverrideDocLike<
  T extends PrescriptionItemOverrideData = PrescriptionItemOverrideData
> {
  modify: (modifier: (data: T) => T) => Promise<unknown>;
  incrementalModify?: (modifier: (data: T) => T) => Promise<unknown>;
}

export interface PrescriptionItemIdentityLike {
  dispensedDrug?: unknown;
  drugName?: unknown;
  drugId?: unknown;
}

export interface ApplyItemClaimFlagWithAuditParams {
  db: PharmacyDatabase;
  /** 画面が持っている処方明細 (現在値の読み取りに使う) */
  item: object;
  /**
   * 保存先のRxDocument。画面の item は toJSON() 由来で doc を持たないため、
   * 呼び出し側が DB から引いて渡す。ここを item.doc に頼ると、
   * 画面では常に undefined になり保存が黙って行われなくなる。
   */
  itemDoc: ClaimItemDocLike | null | undefined;
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
    await restoreFields(itemDoc, previousPatch);
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
  const previousLifecycle = visitDoc.toJSON().claimLifecycle as ClaimLifecycleState | undefined;
  await visitDoc.patch({ claimLifecycle: nextLifecycle as Visit['claimLifecycle'] });
  applyLifecycle(nextLifecycle);

  const auditOk = await logAudit(db, 'claim_lifecycle', detail, patientId, patientName);
  if (!auditOk) {
    const rollbackLifecycle: ClaimLifecycleState = previousLifecycle || { status: 'draft' };
    await restoreFields(visitDoc, { claimLifecycle: rollbackLifecycle });
    applyLifecycle(rollbackLifecycle);
    throw new Error(CLAIM_ACTION_MESSAGES.claimLifecycleAuditRolledBack);
  }
}

export interface ApplyDrugPriceOverrideParams<
  T extends PrescriptionItemOverrideData = PrescriptionItemOverrideData
> {
  db: PharmacyDatabase;
  /** 画面が持っている処方明細 */
  item: PrescriptionItemIdentityLike & {
    drugPriceOverride?: DrugPriceOverride;
  };
  /** 保存先のRxDocument。呼び出し側が DB から引いて渡す */
  itemDoc: DrugPriceOverrideDocLike<T> | null | undefined;
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
  item: PrescriptionItemIdentityLike,
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
export async function applyDrugPriceOverrideWithAudit<
  T extends PrescriptionItemOverrideData
>(
  params: ApplyDrugPriceOverrideParams<T>
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
  const writeOverride = <T extends PrescriptionItemOverrideData>(
    data: T,
    next: DrugPriceOverride | null | undefined
  ): T => {
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
  await itemDoc.modify((data) => writeOverride(data, override));

  const auditOk = await logAudit(
    db,
    'billing_toggle',
    buildDrugPriceOverrideAuditDetail(item, outcome, dispensingDate),
    patientId,
    patientName
  );
  if (!auditOk) {
    await restoreWith(itemDoc, (data) => writeOverride(data, previousOverride));
    throw new Error(CLAIM_ACTION_MESSAGES.drugPriceOverrideAuditRolledBack);
  }

  return outcome;
}

export const SINGLE_OFFICIAL_UKE_EXPORT_MESSAGES = {
  locked: '公式UKEを再出力する場合は、返戻登録または再請求/月遅れ準備に切り替えてから出力してください。',
  auditRolledBack: '公式UKE出力の監査ログ記録に失敗したため、出力を中止しました。'
} as const;

export interface ExecuteSingleOfficialUkeExportParams {
  db: MaybeDatabase;
  visitData: Visit;
  patientData: Patient;
  prescriptionItems: PrescriptionItem[];
  result: SingleDispensingUkeOfficialResult;
  operatorName?: string;
  canExportUke: boolean;
  permissionDeniedMessage: string;
  isSelfPayClaimExcluded: boolean;
  isDemo: boolean;
  applyLifecycle: (lifecycle: ClaimLifecycleState) => void;
  exportedAt?: string;
  logAudit?: LogAuditActionFn;
}

/**
 * 単票公式 UKE（RECEIPTY.CYO）のダウンロード前処理。
 *
 * 権限・自費・デモ・請求状態（draft / rebilling のみ許可。画面の状態と保存済みの状態の両方）を検証したうえで、
 * 請求ロック（markClaimExported）と 2 種の監査ログ（claim_lifecycle / uke_export）を
 * ファイルダウンロードより先に確定させる。いずれかの監査ログ記録に失敗した場合は
 * claimLifecycle を直前の状態へ巻き戻して例外を投げ、ファイルを出力させない。
 */
export async function executeSingleOfficialUkeExport(
  params: ExecuteSingleOfficialUkeExportParams
): Promise<{ nextLifecycle: ClaimLifecycleState }> {
  const {
    db,
    visitData,
    patientData,
    prescriptionItems,
    result,
    operatorName,
    canExportUke,
    permissionDeniedMessage,
    isSelfPayClaimExcluded,
    isDemo,
    applyLifecycle,
    exportedAt = new Date().toISOString(),
    logAudit = logAuditAction
  } = params;

  if (!canExportUke) {
    throw new Error(permissionDeniedMessage);
  }
  if (isSelfPayClaimExcluded) {
    throw new Error(SELF_PAY_UKE_BLOCKED_MESSAGE);
  }
  if (isDemo) {
    throw new Error(DEMO_OFFICIAL_UKE_BLOCKED_MESSAGE);
  }

  const currentStatus = getClaimLifecycleStatus(visitData.claimLifecycle as ClaimLifecycleState | undefined);
  if (currentStatus !== 'draft' && currentStatus !== 'rebilling') {
    throw new Error(SINGLE_OFFICIAL_UKE_EXPORT_MESSAGES.locked);
  }

  if (!db) {
    throw new Error(CLAIM_ACTION_MESSAGES.databaseNotReady);
  }

  const visitDoc = await db.visits.findOne(visitData.visitId).exec();
  if (!visitDoc) {
    throw new Error(CLAIM_ACTION_MESSAGES.claimLifecycleVisitNotFound);
  }
  const previousLifecycle = visitDoc.toJSON().claimLifecycle as ClaimLifecycleState | undefined;
  // 画面の状態は古いことがある(他端末やこの端末の別タブが先に出力・返戻登録した直後など)。
  // 保存されている最新の請求状態でも判定し、同じ受付の公式UKEを二重に出さない。
  const storedStatus = getClaimLifecycleStatus(previousLifecycle);
  if (storedStatus !== 'draft' && storedStatus !== 'rebilling') {
    applyLifecycle(previousLifecycle as ClaimLifecycleState);
    throw new Error(SINGLE_OFFICIAL_UKE_EXPORT_MESSAGES.locked);
  }

  const exportSnapshot = buildClaimExportSnapshot({
    visit: visitData,
    patient: patientData,
    items: prescriptionItems,
    totalPoints: result.totalPoints,
    createdAt: exportedAt,
    exportedFileName: result.fileName
  });
  const nextLifecycle = markClaimExported({
    current: previousLifecycle ?? (visitData.claimLifecycle as ClaimLifecycleState | undefined),
    at: exportedAt,
    by: operatorName,
    fileName: result.fileName,
    totalPoints: result.totalPoints,
    exportSnapshot
  });

  await persistClaimLifecycleWithAudit({
    db,
    visitId: visitData.visitId,
    nextLifecycle,
    detail: `請求状態変更: 公式UKE「${result.fileName}」を出力し、請求をロックしました（点数: ${result.totalPoints}点）。`,
    patientId: visitData.patientId,
    patientName: patientData.name,
    applyLifecycle,
    logAudit
  });

  let ukeAuditOk = false;
  try {
    ukeAuditOk = await logAudit(
      db,
      'uke_export',
      formatSingleOfficialUkeExportAuditMessage({
        patientName: patientData.name,
        totalPoints: result.totalPoints,
        recordCount: result.records.length
      }),
      visitData.patientId,
      patientData.name
    );
  } catch (error) {
    // 例外でも「残らなかった」と同じに扱う(ロックだけが残ってファイルが出ない状態にしない)
    console.error('Failed to record official UKE export audit log:', error);
  }
  if (!ukeAuditOk) {
    const rollbackLifecycle: ClaimLifecycleState = previousLifecycle || { status: 'draft' };
    try {
      await restoreFields(visitDoc, { claimLifecycle: rollbackLifecycle });
    } catch (error) {
      // ロックは残ったままなので、先に残したロックの記録は事実。取り消しの記録は書かない
      console.error('Failed to roll back claim lock after official UKE audit failure:', error);
      throw new Error(`${SINGLE_OFFICIAL_UKE_EXPORT_MESSAGES.auditRolledBack}${ROLLBACK_ALSO_FAILED_NOTE}`);
    }
    applyLifecycle(rollbackLifecycle);
    // ロックの記録(claim_lifecycle)は先に残っていて消せないので、打ち消す記録を追記する
    const voidNote = await appendVoidingAuditOrNote(() => logAudit(
      db,
      'claim_lifecycle',
      formatUkeExportClaimLockVoidedAuditMessage({ fileName: result.fileName }),
      visitData.patientId,
      patientData.name
    ));
    throw new Error(`${SINGLE_OFFICIAL_UKE_EXPORT_MESSAGES.auditRolledBack}${voidNote}`);
  }

  return { nextLifecycle };
}
