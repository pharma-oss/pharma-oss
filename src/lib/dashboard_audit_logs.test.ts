import { test } from 'node:test';
import assert from 'node:assert';
import type { AuditLog } from '../db/types.ts';
import { buildBackupContinuityReport, buildBackupScheduleReview } from './backup.ts';
import { countInventoryReceivingLogs, countSupportLoadLogs } from './dashboard_helpers.ts';
import { loadDashboardAuditLogs, type DashboardAuditLogSource } from './dashboard_audit_logs.ts';

// $gte / $in だけを解釈する最小の audit_logs。selector と sort を守り、読んだ件数を数える。
function fakeAuditSource(logs: AuditLog[]) {
  const stats = { docsRead: 0 };
  const source: DashboardAuditLogSource = {
    audit_logs: {
      find: ({ selector }) => ({
        exec: async () => {
          const ts = selector.timestamp as { $gte?: string } | undefined;
          const types = (selector.actionType as { $in?: string[] } | undefined)?.$in;
          const rows = logs
            .filter((log) => (ts?.$gte === undefined || log.timestamp >= ts.$gte) && (types === undefined || types.includes(log.actionType)))
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          stats.docsRead += rows.length;
          return rows.map((row) => ({ toJSON: () => row }));
        }
      })
    }
  };
  return { source, stats };
}

const NOW = new Date(2026, 9, 8, 15, 0, 0);
let seq = 0;
function log(daysAgo: number, hour: number, actionType: AuditLog['actionType'], details: string): AuditLog {
  seq += 1;
  return {
    logId: `log_${seq}`,
    timestamp: new Date(2026, 9, 8 - daysAgo, hour, 0, 0).toISOString(),
    userId: 'admin_1', userName: '管理者', userRole: 'admin', actionType, details
  };
}

function shopHistory(options: { recentBackup: boolean }): AuditLog[] {
  const logs: AuditLog[] = [];
  // 3年分の通常の操作(印刷・ログイン・請求・在庫)。ダッシュボードには要らない
  for (let day = 1; day <= 400; day += 1) {
    logs.push(log(day, 9, 'login', 'ログイン'), log(day, 11, 'print', '薬袋印刷'), log(day, 14, 'billing_toggle', '算定変更'));
  }
  logs.push(
    log(40, 10, 'backup_export', 'バックアップ書き出し: backup_old.json に 900件のローカルデータ（暗号化）を書き出しました。'),
    log(20, 18, 'backup_drill', '復旧テスト: 合格'),
    log(10, 18, 'backup_external_storage', 'バックアップ外部保存確認: backup_old.json / 保存先 NAS / 判定 外部保存OK / 読取 確認済み / 上書き削除不可 確認済み / 確認者 管理者')
  );
  if (options.recentBackup) {
    logs.push(
      log(3, 18, 'backup_export', 'バックアップ書き出し: backup_b.json に 1000件のローカルデータ（暗号化）を書き出しました。'),
      log(3, 19, 'backup_external_storage', 'バックアップ外部保存確認: backup_b.json / 保存先 NAS / 判定 外部保存OK / 読取 確認済み / 上書き削除不可 確認済み / 確認者 管理者'),
      log(0, 8, 'backup_export', 'バックアップ書き出し: backup_c.json に 1010件のローカルデータ（暗号化）を書き出しました。'),
      log(0, 9, 'backup_external_storage', 'バックアップ外部保存確認: backup_c.json / 保存先 NAS / 判定 保存未確認 / 確認者 管理者')
    );
  }
  logs.push(
    // 今日: 日次締めが数えるもの
    log(0, 8, 'stock_update', '発注ワークベンチ入庫登録: アムロジピン 10'),
    log(0, 10, 'stock_update', '発注ワークベンチ入庫登録: ロキソニン 5'),
    log(0, 11, 'stock_update', '麻薬・向精神薬の在庫更新: ジアゼパム'),
    log(0, 12, 'session_lock', '個人情報なし診断JSONエクスポート: サポート対応'),
    log(0, 13, 'print', '薬袋印刷'),
    // 昨日の入庫登録は今日の件数に入らない
    log(1, 16, 'stock_update', '発注ワークベンチ入庫登録: 昨日の分')
  );
  return logs;
}

for (const recentBackup of [true, false]) {
  test(`loadDashboardAuditLogs gives the daily closing the same numbers as the full log list (${recentBackup ? 'recent backups' : 'only an old backup'})`, async () => {
    const all = shopHistory({ recentBackup });
    const { source, stats } = fakeAuditSource(all);

    const loaded = await loadDashboardAuditLogs(source, NOW);

    const policy = { enabled: true, scheduledTime: '18:00', requireEncrypted: true, requireExternalStorage: true };
    assert.deepStrictEqual(
      buildBackupContinuityReport(loaded, NOW, { schedulePolicy: policy }),
      buildBackupContinuityReport(all, NOW, { schedulePolicy: policy })
    );
    assert.deepStrictEqual(buildBackupScheduleReview(loaded, policy, NOW), buildBackupScheduleReview(all, policy, NOW));
    assert.deepStrictEqual(buildBackupContinuityReport(loaded, NOW), buildBackupContinuityReport(all, NOW));

    const todayOf = (logs: AuditLog[]) => logs.filter((l) => new Date(l.timestamp).toDateString() === NOW.toDateString());
    for (const logs of [loaded, all]) {
      assert.strictEqual(countInventoryReceivingLogs(todayOf(logs), NOW), 2);
      assert.strictEqual(countSupportLoadLogs(todayOf(logs), NOW), 1);
      assert.strictEqual(todayOf(logs).filter((l) => l.actionType === 'stock_update' && l.details.includes('麻薬・向精神薬')).length, 1);
    }

    assert.ok(all.length > 1200, 'the shop has a long history');
    assert.ok(loaded.length < 20, `only today's logs and the backup logs are loaded (${loaded.length})`);
    assert.ok(stats.docsRead < 40, 'and the database was not asked for more than that');
  });
}

test('loadDashboardAuditLogs returns newest first and lists a log that is both from today and a backup once', async () => {
  const all = shopHistory({ recentBackup: true });
  const { source } = fakeAuditSource(all);

  const loaded = await loadDashboardAuditLogs(source, NOW);

  const ids = loaded.map((l) => l.logId);
  assert.strictEqual(new Set(ids).size, ids.length, 'no log twice');
  const timestamps = loaded.map((l) => l.timestamp);
  assert.deepStrictEqual(timestamps, [...timestamps].sort((a, b) => b.localeCompare(a)), 'newest first, like the full read');
  assert.strictEqual(loaded.filter((l) => l.details.includes('backup_c.json') && l.actionType === 'backup_export').length, 1);
});

test('loadDashboardAuditLogs includes a log written at the first second of today and excludes the last second of yesterday', async () => {
  const midnight = { ...log(0, 0, 'stock_update', '発注ワークベンチ入庫登録: 0時ちょうど'), timestamp: new Date(2026, 9, 8, 0, 0, 0).toISOString() };
  const beforeMidnight = { ...log(1, 23, 'stock_update', '発注ワークベンチ入庫登録: 昨日の最後'), timestamp: new Date(2026, 9, 7, 23, 59, 59).toISOString() };
  const { source } = fakeAuditSource([midnight, beforeMidnight]);

  const loaded = await loadDashboardAuditLogs(source, NOW);

  assert.deepStrictEqual(loaded.map((l) => l.logId), [midnight.logId]);
});
