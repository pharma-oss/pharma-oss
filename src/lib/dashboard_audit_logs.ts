// ダッシュボード(日次締めの欄)が使う監査ログだけを読む。
//
// 以前は監査ログを全件読んでいた。使うのは次の2つだけなので、この2つを読む。
// - 今日のログ全部: 日次締めの件数(入庫登録・サポート対応・麻薬/向精神薬の在庫更新)
// - バックアップ関連の3種: 最新のバックアップ・復旧テスト・外部保存の日付
//   (buildBackupContinuityReport / buildBackupScheduleReview が読む種別。いつのものでも最新が必要)
// 監査ログが数万件になった店舗で、ダッシュボードを開くたびに全件を読み込むのを避ける。
import type { AuditLog } from '@/db/types';

export const DASHBOARD_BACKUP_AUDIT_ACTION_TYPES = [
  'backup_export',
  'backup_drill',
  'backup_external_storage'
] as const;

interface AuditLogQueryResult {
  exec: () => Promise<Array<{ toJSON: () => AuditLog }>>;
}

export interface DashboardAuditLogSource {
  audit_logs: {
    find: (query: {
      selector: Record<string, unknown>;
      sort: Array<Record<string, 'asc' | 'desc'>>;
    }) => AuditLogQueryResult;
  };
}

export async function loadDashboardAuditLogs(
  db: DashboardAuditLogSource,
  now: Date = new Date()
): Promise<AuditLog[]> {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sort: Array<Record<string, 'asc' | 'desc'>> = [{ timestamp: 'desc' }];
  const [todayDocs, backupDocs] = await Promise.all([
    db.audit_logs.find({ selector: { timestamp: { $gte: startOfToday } }, sort }).exec(),
    db.audit_logs.find({
      selector: { actionType: { $in: [...DASHBOARD_BACKUP_AUDIT_ACTION_TYPES] } },
      sort
    }).exec()
  ]);

  // 今日のバックアップは両方に入る。logId で重ね、新しい順に並べる(全件を読んでいたときと同じ並び)。
  const byId = new Map<string, AuditLog>();
  for (const doc of [...todayDocs, ...backupDocs]) {
    const log = doc.toJSON();
    byId.set(log.logId, log);
  }
  return [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
