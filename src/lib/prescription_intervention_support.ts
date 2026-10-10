/**
 * 疑義照会・処方変更履歴の構造化純粋モジュール (トラック F-2)
 *
 * 薬剤師法第24条・第28条第2項・同法施行規則第16条第1項第10号（同令第15条第2号・第3号準用）に基づく調剤録への法定記載義務、
 * および保険請求・レセプト摘要欄（UKE・帳票）への適切な転記を担保する。
 *
 * 金科玉条遵守:
 * - 第四条: 金額や判断の自動推計・勝手な算出は厳禁。記録済み・入力済みの値を忠実に反映する。
 * - 第一条: AI下書き・自動生成テキストは人間確認を通す。
 * - 第八条: 画面・帳票・算定・UKEの間の整合性を保持する。
 */

import type { Intervention, Visit } from '@/db/types';
import { inquiryMethodLabel, inquiryStatusLabel } from '@/lib/emr_helpers';
import { plainCopy, restoreFields } from './rxdb_restore.ts';

export type InterventionCategory =
  | 'generic_change'      // 後発医薬品への変更
  | 'leftover_adjustment'  // 残薬調整（日数・数量削減）
  | 'dosage_change'        // 用法・用量変更
  | 'interaction_inquiry'  // 重複投薬・相互作用・禁忌照会
  | 'discontinuation'      // 処方削除・中止
  | 'other';               // その他

export const INTERVENTION_CATEGORY_LABELS: Record<InterventionCategory, string> = {
  generic_change: '後発医薬品変更',
  leftover_adjustment: '残薬調整（日数/数量）',
  dosage_change: '用法・用量変更',
  interaction_inquiry: '重複投薬・相互作用・禁忌',
  discontinuation: '処方削除・中止',
  other: 'その他'
};

export const INQUIRY_METHOD_LABELS: Record<'phone' | 'fax' | 'in_person' | 'other', string> = {
  phone: '電話',
  fax: 'FAX',
  in_person: '対面',
  other: 'その他'
};

export interface VisitInterventionEvent {
  eventId: string;
  category: InterventionCategory;
  reason: string;
  beforeDrugName?: string;
  afterDrugName?: string;
  inquiryStatus: 'pending' | 'completed' | 'cancelled';
  inquiryMethod: 'phone' | 'fax' | 'in_person' | 'other';
  inquiryDoctor?: string;
  inquiryResult?: string;
  patientConsented: boolean;
  contactedAt: string;
  respondedAt?: string;
  handledBy: string;
  note?: string;
}

// 疑義照会モーダルの入力(登録時点の状態は 照会中 / 回答済 のみ)
export interface InterventionInput {
  category?: InterventionCategory;
  reason: string;
  beforeSnapshot: string;
  afterSnapshot: string;
  inquiryStatus: 'pending' | 'completed';
  inquiryMethod: 'phone' | 'fax' | 'in_person' | 'other';
  inquiryDoctor: string;
  inquiryResult: string;
  responseDueDate: string;
  note: string;
  patientConsented: boolean;
}

// 区分は薬剤師の選択を優先し、未選択のときだけ理由・変更前後の文言から推定する
export function resolveInterventionCategory(input: InterventionInput): InterventionCategory {
  return input.category || suggestInterventionCategory(input.reason, input.beforeSnapshot, input.afterSnapshot);
}

// interventions コレクションへ保存するレコード。回答済のときだけ回答日時を入れる。
export function buildInterventionRecord(
  input: InterventionInput,
  context: { interventionId: string; visitId: string; handledBy: string; now: string }
): Intervention {
  return {
    interventionId: context.interventionId,
    visitId: context.visitId,
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    reason: input.reason,
    inquiryStatus: input.inquiryStatus,
    inquiryMethod: input.inquiryMethod,
    inquiryDoctor: input.inquiryDoctor,
    inquiryResult: input.inquiryResult,
    responseDueDate: input.responseDueDate || undefined,
    contactedAt: context.now,
    respondedAt: input.inquiryStatus === 'completed' ? context.now : undefined,
    handledBy: context.handledBy,
    note: input.note,
    patientConsented: input.patientConsented,
    createdAt: context.now,
    updatedAt: context.now
  };
}

// visit.interventionEvents へ入れる構造化イベント(調剤録・レセプト摘要の元)。空文字は未記録として落とす。
export function buildInterventionEvent(
  input: InterventionInput,
  category: InterventionCategory,
  context: { eventId: string; handledBy: string; now: string }
): VisitInterventionEvent {
  return {
    eventId: context.eventId,
    category,
    reason: input.reason,
    beforeDrugName: input.beforeSnapshot || undefined,
    afterDrugName: input.afterSnapshot || undefined,
    inquiryStatus: input.inquiryStatus,
    inquiryMethod: input.inquiryMethod,
    inquiryDoctor: input.inquiryDoctor || undefined,
    inquiryResult: input.inquiryResult || undefined,
    patientConsented: input.patientConsented,
    contactedAt: context.now,
    respondedAt: input.inquiryStatus === 'completed' ? context.now : undefined,
    handledBy: context.handledBy,
    note: input.note || undefined
  };
}

// 監査ログ(prescription_edit)に残す疑義照会登録の文言
export function buildInterventionAuditDetail(input: InterventionInput, category: InterventionCategory): string {
  const categoryLabel = INTERVENTION_CATEGORY_LABELS[category] || category;
  return `疑義照会登録 [${categoryLabel}]: 状態 ${inquiryStatusLabel[input.inquiryStatus]} / 方法 ${inquiryMethodLabel[input.inquiryMethod]} / 照会先「${input.inquiryDoctor || '未指定'}」 / 理由: ${input.reason} / 結果: ${input.inquiryResult || '未回答'}${input.responseDueDate ? ` / 回答期限: ${input.responseDueDate}` : ''}。`;
}

// ---- 登録・削除の書き込み手順(監査ログが残らなければ、書いたものを全部元に戻す) ----

export interface InterventionVisitHandle {
  patientId: string;
  interventionEvents?: VisitInterventionEvent[];
  patch?: (patch: { interventionEvents: VisitInterventionEvent[] }) => Promise<unknown>;
}

export interface InterventionStoreDb {
  interventions: {
    insert: (record: Intervention) => Promise<{ remove: () => Promise<unknown> }>;
    findOne: (query: { selector: { interventionId: string } }) => {
      exec: () => Promise<{ toJSON: () => Intervention; remove: () => Promise<unknown> } | null>;
    };
  };
  patients: {
    find: (query: { selector: { patientId: string } }) => { exec: () => Promise<Array<{ name?: string }>> };
  };
}

export type InterventionAuditFn = (patientId: string, patientName: string, detail: string) => Promise<boolean>;

async function bestEffort(label: string, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    // 取り消し自体の失敗は、元のエラーを隠さないよう記録だけ残す
    console.error(`Failed to roll back intervention change (${label}):`, error);
  }
}

// 疑義照会の登録: interventions への保存 -> visit.interventionEvents への追記 -> 監査ログ。
// 途中で失敗したら、保存したレコードと追記したイベントの両方を元に戻して失敗を投げる。
export async function recordInterventionWithAudit(params: {
  db: InterventionStoreDb;
  visit: InterventionVisitHandle;
  record: Intervention;
  event: VisitInterventionEvent;
  auditDetail: string;
  logAudit: InterventionAuditFn;
}): Promise<void> {
  const { db, visit, record, event, auditDetail, logAudit } = params;
  const previousEvents = Array.isArray(visit.interventionEvents) ? plainCopy(visit.interventionEvents) : [];
  const insertedDoc = await db.interventions.insert(record);
  let eventAppended = false;
  try {
    if (typeof visit.patch === 'function') {
      await visit.patch({ interventionEvents: [...previousEvents, event] });
      eventAppended = true;
    }
    const patients = await db.patients.find({ selector: { patientId: visit.patientId } }).exec();
    const patientName = patients[0]?.name || '不明';
    const auditOk = await logAudit(visit.patientId, patientName, auditDetail);
    if (!auditOk) {
      throw new Error('疑義照会記録の監査ログ記録に失敗したため、記録を元に戻しました。');
    }
  } catch (error) {
    await bestEffort('remove record', () => insertedDoc.remove());
    if (eventAppended && typeof visit.patch === 'function') {
      // RxDocument のメソッドなので this を保ったまま visit.patch(...) で呼ぶ
      await bestEffort('restore events', () => restoreFields(visit as any, { interventionEvents: previousEvents }));
    }
    throw error;
  }
}

// 疑義照会の削除: 削除 -> visit.interventionEvents から除外 -> 監査ログ。
// 監査ログが残らなければ、削除したレコードとイベントを戻して失敗を投げる。
export async function deleteInterventionWithAudit(params: {
  db: InterventionStoreDb;
  visit: InterventionVisitHandle;
  interventionId: string;
  logAudit: InterventionAuditFn;
}): Promise<{ deleted: boolean }> {
  const { db, visit, interventionId, logAudit } = params;
  const doc = await db.interventions.findOne({ selector: { interventionId } }).exec();
  if (!doc) return { deleted: false };

  const snapshot = doc.toJSON();
  const previousEvents = Array.isArray(visit.interventionEvents) ? plainCopy(visit.interventionEvents) : null;
  let removed = false;
  let eventsPatched = false;
  try {
    await doc.remove();
    removed = true;
    if (typeof visit.patch === 'function' && previousEvents) {
      await visit.patch({ interventionEvents: previousEvents.filter((ev) => ev.eventId !== interventionId) });
      eventsPatched = true;
    }
    const patients = await db.patients.find({ selector: { patientId: visit.patientId } }).exec();
    const patientName = patients[0]?.name || '不明';
    const auditOk = await logAudit(visit.patientId, patientName, `疑義照会削除: ID ${interventionId}`);
    if (!auditOk) {
      throw new Error('疑義照会削除の監査ログ記録に失敗したため、削除を取り消しました。');
    }
  } catch (error) {
    if (eventsPatched && typeof visit.patch === 'function' && previousEvents) {
      await bestEffort('restore events', () => restoreFields(visit as any, { interventionEvents: previousEvents }));
    }
    if (removed) {
      await bestEffort('re-insert record', () => db.interventions.insert(snapshot));
    }
    throw error;
  }
  return { deleted: true };
}

export interface DispensingRecordInterventionRow {
  eventId: string;
  contactedAtStr: string;
  targetDoctor: string;
  categoryLabel: string;
  inquiryContent: string;
  resultContent: string;
  consentText: string;
  pharmacist: string;
  statusLabel: string;
}

export interface InterventionReadinessIssue {
  severity: 'error' | 'warning';
  code: string;
  title: string;
  message: string;
  eventId?: string;
}

/**
 * 照会理由や変更前後の薬品名から、既定のカテゴリを自動サジェストする
 * （※第四条遵守: 自動推計ではなく、フォーム初期値のサジェストに限定し、人間がUI上で選択・修正する）
 */
export function suggestInterventionCategory(
  reason: string,
  beforeDrug?: string,
  afterDrug?: string
): InterventionCategory {
  const text = `${reason} ${beforeDrug ?? ''} ${afterDrug ?? ''}`.toLowerCase();

  if (text.includes('残薬') || text.includes('日数調整') || text.includes('数量調整')) {
    return 'leftover_adjustment';
  }
  if (text.includes('後発') || text.includes('ジェネリック') || text.includes('ge変更') || text.includes('銘柄変更')) {
    return 'generic_change';
  }
  if (text.includes('用法') || text.includes('用量') || text.includes('1日') || text.includes('分服') || text.includes('服用')) {
    return 'dosage_change';
  }
  if (text.includes('重複') || text.includes('相互作用') || text.includes('併用') || text.includes('禁忌') || text.includes('アレルギー')) {
    return 'interaction_inquiry';
  }
  if (text.includes('中止') || text.includes('削除') || text.includes('取りやめ') || text.includes('キャンセル')) {
    return 'discontinuation';
  }
  return 'other';
}

/**
 * Visit 内の interventionEvents と、互換用 legacyInterventions を正規化・統合する
 * （コレクションを増やさず visit の入れ子プロパティを最優先とし、未移行データはフォールバック変換）
 */
export function normalizeVisitInterventionEvents(
  visit: Partial<Visit>,
  legacyInterventions?: any[]
): VisitInterventionEvent[] {
  // 1. visit.interventionEvents が明示的に定義されていればそれを最優先
  if (visit.interventionEvents && Array.isArray(visit.interventionEvents) && visit.interventionEvents.length > 0) {
    return visit.interventionEvents;
  }

  // 2. legacyInterventions からの安全なフォールバック変換
  if (!legacyInterventions || !Array.isArray(legacyInterventions) || legacyInterventions.length === 0) {
    return [];
  }

  const currentVisitId = visit.visitId;
  const filtered = currentVisitId
    ? legacyInterventions.filter((inv) => inv.visitId === currentVisitId)
    : legacyInterventions;

  return filtered.map((legacy): VisitInterventionEvent => {
    const reason = legacy.reason || '';
    const beforeDrug = legacy.beforeSnapshot || undefined;
    const afterDrug = legacy.afterSnapshot || undefined;
    const category: InterventionCategory = legacy.category || suggestInterventionCategory(reason, beforeDrug, afterDrug);

    return {
      eventId: legacy.interventionId || legacy.id || `vie_${Math.random().toString(36).slice(2, 9)}`,
      category,
      reason,
      beforeDrugName: beforeDrug,
      afterDrugName: afterDrug,
      inquiryStatus: legacy.inquiryStatus === 'pending' ? 'pending' : legacy.inquiryStatus === 'cancelled' ? 'cancelled' : 'completed',
      inquiryMethod: legacy.inquiryMethod || 'phone',
      inquiryDoctor: legacy.inquiryDoctor || undefined,
      inquiryResult: legacy.inquiryResult || undefined,
      patientConsented: legacy.patientConsented !== false,
      contactedAt: legacy.contactedAt || legacy.createdAt || new Date().toISOString(),
      respondedAt: legacy.respondedAt || undefined,
      handledBy: legacy.handledBy || '薬剤師',
      note: legacy.note || undefined
    };
  });
}

/**
 * 調剤録（Dispensing Record）の法定義務項目テーブル向けに整形する
 * （薬剤師法第24条・第28条第2項・施行規則第16条第1項第10号: 照会日時、処方医、疑義内容、回答、患者同意、担当薬剤師）
 */
export function formatDispensingRecordInterventions(
  events: VisitInterventionEvent[]
): DispensingRecordInterventionRow[] {
  return events.map((event) => {
    const contactDate = new Date(event.contactedAt);
    const contactedAtStr = isNaN(contactDate.getTime())
      ? event.contactedAt
      : `${contactDate.toLocaleDateString('ja-JP')} ${contactDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;

    const methodLabel = INQUIRY_METHOD_LABELS[event.inquiryMethod] || event.inquiryMethod;
    const targetDoctor = event.inquiryDoctor
      ? `${event.inquiryDoctor} 医師 (${methodLabel})`
      : `処方医 (${methodLabel})`;

    let inquiryContent = event.reason;
    if (event.beforeDrugName) {
      inquiryContent += ` [変更前: ${event.beforeDrugName}]`;
    }

    let resultContent = event.inquiryResult || (event.inquiryStatus === 'pending' ? '照会中（未回答）' : '確認済');
    if (event.afterDrugName) {
      resultContent += ` [変更後: ${event.afterDrugName}]`;
    }

    return {
      eventId: event.eventId,
      contactedAtStr,
      targetDoctor,
      categoryLabel: INTERVENTION_CATEGORY_LABELS[event.category] || event.category,
      inquiryContent,
      resultContent,
      consentText: event.patientConsented ? '同意済' : '未確認',
      pharmacist: event.handledBy || '担当薬剤師',
      statusLabel: event.inquiryStatus === 'pending' ? '照会中' : event.inquiryStatus === 'cancelled' ? '取消' : '回答済'
    };
  });
}

/**
 * レセプト（UKE / 帳票）の摘要・コメント欄向けに標準的な要約テキストを生成する
 */
export function formatReceiptInterventionSummary(event: VisitInterventionEvent): string {
  const parts: string[] = ['【疑義照会・処方変更】'];

  if (event.contactedAt) {
    const dateObj = new Date(event.contactedAt);
    if (!isNaN(dateObj.getTime())) {
      parts.push(dateObj.toLocaleDateString('ja-JP'));
    }
  }

  const doctorPart = event.inquiryDoctor ? `${event.inquiryDoctor}医師` : '処方医';
  const methodPart = INQUIRY_METHOD_LABELS[event.inquiryMethod] || event.inquiryMethod;
  parts.push(`${doctorPart}(${methodPart})`);

  const categoryLabel = INTERVENTION_CATEGORY_LABELS[event.category] || event.category;
  parts.push(`[${categoryLabel}]`);

  if (event.reason) {
    parts.push(`理由:${event.reason}`);
  }

  if (event.beforeDrugName && event.afterDrugName) {
    parts.push(`(${event.beforeDrugName}→${event.afterDrugName})`);
  }

  if (event.inquiryResult) {
    parts.push(`結果:${event.inquiryResult}`);
  }

  if (event.patientConsented) {
    parts.push('患者同意済');
  }

  if (event.handledBy) {
    parts.push(`(担当:${event.handledBy})`);
  }

  return parts.join(' ');
}

/**
 * 疑義照会イベントの事前点検（Readiness Check）
 */
export function validateInterventionReadiness(
  events: VisitInterventionEvent[]
): InterventionReadinessIssue[] {
  const issues: InterventionReadinessIssue[] = [];

  for (const event of events) {
    if (event.inquiryStatus === 'pending') {
      issues.push({
        severity: 'warning',
        code: 'intervention_inquiry_pending',
        title: '未回答の疑義照会があります',
        message: `照会先「${event.inquiryDoctor || '処方医'}」への疑義照会（理由: ${event.reason || '未記載'}）が未回答のままです。医師の回答を確認してください。`,
        eventId: event.eventId
      });
    }

    if (!event.reason || !event.reason.trim()) {
      issues.push({
        severity: 'error',
        code: 'intervention_reason_missing',
        title: '疑義照会の理由が未入力です',
        message: '疑義照会・処方変更の理由が入力されていません。',
        eventId: event.eventId
      });
    }

    if (!event.inquiryDoctor || !event.inquiryDoctor.trim()) {
      issues.push({
        severity: 'warning',
        code: 'intervention_doctor_missing',
        title: '照会先医師名が未設定です',
        message: '疑義照会先の医師名が入力されていません。',
        eventId: event.eventId
      });
    }
  }

  return issues;
}
