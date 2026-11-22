import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildUkeRetirementChecklist,
  categorizeUkeExportAuditType,
  evaluateUkeRetirementFromAuditLogs,
  formatMonthlyLegacyUkeExportAuditMessage,
  formatMonthlyOfficialUkeExportAuditMessage,
  formatSingleLegacyUkeExportAuditMessage,
  formatSingleOfficialUkeExportAuditMessage,
  formatUkeRetirementStatusBadge,
  parseUkeAuditLogInput,
  summarizeUkeExportsFromAuditLogs
} from './uke_migration_policy';
import { ClaimWorkbenchSection } from '@/components/dashboard/ClaimWorkbenchSection';
import type { DashboardClaimWorkItem, DashboardCounts } from '@/hooks/useDashboardTasks';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const tsxBin = join(repoRoot, 'node_modules', '.bin', 'tsx');
const cliScript = join(repoRoot, 'scripts', 'runUkeRetirementReadiness.ts');

const SAMPLE_COUNTS: DashboardCounts = {
  todayReceptionCount: 1,
  waitingCount: 0,
  processingCount: 0,
  reviewCount: 0,
  completedCount: 1,
  pickingPendingCount: 0,
  inventoryShortageCount: 0,
  claimRiskCount: 0,
  urgentClaimRiskCount: 0,
  claimWorkbenchCount: 1,
  returnedClaimCount: 0,
  rebillingClaimCount: 1,
  followUpDueCount: 0,
  urgentFollowUpCount: 0
};

const SAMPLE_ITEM: DashboardClaimWorkItem = {
  visitId: 'v-step5b-1',
  patientId: 'p-step5b-1',
  name: '廃止確認 テスト',
  issueDateLabel: '11/1',
  monthLabel: '11月',
  status: 'rebilling',
  statusLabel: '再請求準備',
  priority: 'normal',
  priorityLabel: '通常',
  totalPoints: 1200,
  prescriptionCount: 1,
  latestEventLabel: '再請求準備 11/1',
  actionLabel: '月遅れ/UKE再出力'
};

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(tsxBin, [cliScript, ...args], { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'number'
        ? error.code
        : error
          ? 1
          : 0;
      resolve({ code, stdout, stderr });
    });
  });
}

test('categorizeUkeExportAuditType ignores stopped preflight logs even when official keywords appear', () => {
  assert.equal(
    categorizeUkeExportAuditType('月次公式UKE作成停止: 算定ルールの要確認 1項目を患者情報なしCSVへ書き出しました。'),
    'unknown'
  );
  assert.equal(
    categorizeUkeExportAuditType('月次公式UKE出力停止: 公式提出準備の要対応 2件を書き出しました。'),
    'unknown'
  );
  assert.equal(
    categorizeUkeExportAuditType('月次公式提出準備確認停止: 算定ルールの要確認 1項目を書き出しました。'),
    'unknown'
  );
});

test('summarizeUkeExportsFromAuditLogs counts only uke_export entries inside the rolling 90-day window', () => {
  const now = new Date('2026-11-22T00:00:00.000Z');
  const officialMsg = formatMonthlyOfficialUkeExportAuditMessage({
    officialFileName: 'RECEIPTY.CYO',
    claimCount: 10,
    totalPoints: 12000,
    totalSupplementalRecordCount: 2,
    totalPrescriptionRecordCount: 10,
    totalSplitRecordCount: 12,
    goTotalPoints: 12000
  });
  const legacyMsg = formatSingleLegacyUkeExportAuditMessage({
    patientName: '秘密患者 太郎',
    totalPoints: 900,
    fileName: 'RECEIPT_1.uke'
  });

  const summary = summarizeUkeExportsFromAuditLogs([
    // 91日前の旧形式は集計窓外なので除外される
    { timestamp: '2026-08-22T23:59:59.000Z', actionType: 'uke_export', details: legacyMsg },
    // 窓内の旧形式1件
    { timestamp: '2026-10-10T09:00:00.000Z', actionType: 'uke_export', details: legacyMsg },
    // 窓内の公式2件
    { timestamp: '2026-10-01T09:00:00.000Z', actionType: 'uke_export', details: officialMsg },
    {
      timestamp: '2026-11-01T09:00:00.000Z',
      actionType: 'uke_export',
      details: formatSingleOfficialUkeExportAuditMessage({ patientName: '秘密患者 次郎', totalPoints: 800, recordCount: 8 })
    },
    // 停止ログは official に数えない
    { timestamp: '2026-11-05T09:00:00.000Z', actionType: 'uke_export', details: '月次公式UKE出力停止: 要対応 1件' },
    // 他 actionType は除外
    { timestamp: '2026-11-10T09:00:00.000Z', actionType: 'print', details: legacyMsg },
    // 未来の破損タイムスタンプは除外
    { timestamp: '2026-12-01T00:00:00.000Z', actionType: 'uke_export', details: legacyMsg }
  ], { now, windowDays: 90 });

  assert.equal(summary.legacyExportCountInWindow, 1);
  assert.equal(summary.officialExportCountInWindow, 2);
  assert.equal(summary.unknownUkeExportCountInWindow, 1);
  assert.equal(summary.totalUkeExportLogsInWindow, 4);
  assert.equal(summary.lastLegacyExportAt, '2026-10-10T09:00:00.000Z');
  assert.equal(summary.lastOfficialExportAt, '2026-11-01T09:00:00.000Z');
});

test('parseUkeAuditLogInput supports JSON arrays, backup JSON objects, and JSONL archives', () => {
  const entry = {
    timestamp: '2026-11-01T00:00:00.000Z',
    actionType: 'uke_export',
    details: formatMonthlyLegacyUkeExportAuditMessage({ ukeFileName: 'RECEIPT_2026-11.uke', claimCount: 3, totalPoints: 3000 })
  };

  assert.equal(parseUkeAuditLogInput(JSON.stringify([entry])).length, 1);
  assert.equal(parseUkeAuditLogInput(JSON.stringify({ collections: { audit_logs: [entry] } })).length, 1);
  assert.equal(parseUkeAuditLogInput(`${JSON.stringify(entry)}\n${JSON.stringify(entry)}\n`).length, 2);
  assert.throws(() => parseUkeAuditLogInput('not-valid-json-at-all'));
});

test('evaluateUkeRetirementFromAuditLogs enforces Condition A/B/C and builds patient-free checklist', () => {
  const now = new Date('2026-11-22T00:00:00.000Z');
  const legacyLog = {
    timestamp: '2026-11-01T00:00:00.000Z',
    actionType: 'uke_export',
    details: formatSingleLegacyUkeExportAuditMessage({ patientName: '極秘患者 花子', totalPoints: 1000, fileName: 'RECEIPT_9.uke' })
  };
  const officialLog = {
    timestamp: '2026-11-15T00:00:00.000Z',
    actionType: 'uke_export',
    details: formatSingleOfficialUkeExportAuditMessage({ patientName: '極秘患者 花子', totalPoints: 1000, recordCount: 10 })
  };

  const blocked = evaluateUkeRetirementFromAuditLogs({
    logs: [legacyLog, officialLog],
    pilotMonthsConfirmed: 2,
    stakeholderConsentObtained: true,
    now
  });
  assert.equal(blocked.opsStatus, 'blocked');
  assert.equal(blocked.evaluation.canRetireLegacy, false);
  assert.equal(blocked.criteria.legacyExportCountLast3Months, 1);
  const blockedChecklist = buildUkeRetirementChecklist(blocked);
  assert.doesNotMatch(blockedChecklist, /極秘患者/);
  assert.match(blockedChecklist, /未達ブロッカー/);

  const attention = evaluateUkeRetirementFromAuditLogs({
    logs: [officialLog],
    pilotMonthsConfirmed: 2,
    stakeholderConsentObtained: false,
    now
  });
  assert.equal(attention.opsStatus, 'attention');
  assert.equal(attention.evaluation.canRetireLegacy, false);

  const ready = evaluateUkeRetirementFromAuditLogs({
    logs: [officialLog],
    pilotMonthsConfirmed: 2,
    stakeholderConsentObtained: true,
    now
  });
  assert.equal(ready.opsStatus, 'pass');
  assert.equal(ready.evaluation.canRetireLegacy, true);
  assert.equal(ready.evaluation.blockers.length, 0);
});

test('ClaimWorkbenchSection renders legacy UKE retirement status readout inside closed details', () => {
  const blockedSummary = summarizeUkeExportsFromAuditLogs([
    {
      timestamp: '2026-11-15T00:00:00.000Z',
      actionType: 'uke_export',
      details: formatMonthlyLegacyUkeExportAuditMessage({ ukeFileName: 'RECEIPT_2026-11.uke', claimCount: 2, totalPoints: 2000 })
    }
  ], { now: new Date('2026-11-22T00:00:00.000Z') });

  const html = renderToStaticMarkup(
    React.createElement(ClaimWorkbenchSection, {
      db: null,
      claimWorkItems: [SAMPLE_ITEM],
      counts: SAMPLE_COUNTS,
      isLoading: false,
      onOpenTask: () => {},
      onRefresh: () => {},
      legacyUkeAuditSummary: blockedSummary
    })
  );

  assert.match(html, /data-testid="legacy-uke-retirement-status"/);
  assert.ok(html.includes(formatUkeRetirementStatusBadge(blockedSummary)));
  assert.match(html, /legacy-uke-retirement-status blocked/);
  assert.equal(html.includes('data-testid="monthly-claim-legacy-uke-disclosure" open'), false);
});

test('runUkeRetirementReadiness CLI blocks when audit log is omitted, blocks on recent legacy export without leaking patient names, and passes when A/B/C are met', async () => {
  const workDir = await mkdtemp(join(tmpdir(), 'uke-retire-cli-'));
  try {
    // 1. 監査ログ未指定では条件B未確認として必ず exit 1 / blocked
    const noLogOut = join(workDir, 'out-nolog');
    const noLogRes = await runCli([
      '--pilot-months', '2',
      '--stakeholder-consent',
      '--now', '2026-11-22T00:00:00.000Z',
      '--output-dir', noLogOut
    ]);
    assert.equal(noLogRes.code, 1);
    const noLogJson = JSON.parse(noLogRes.stdout);
    assert.equal(noLogJson.status, 'blocked');
    assert.equal(noLogJson.auditLogProvided, false);
    assert.equal(noLogJson.evaluation.canRetireLegacy, false);

    // 2. 直近90日以内に旧形式出力があるJSONL -> exit 1 / blocked かつ患者名非漏洩
    const blockedLogPath = join(workDir, 'audit-blocked.jsonl');
    await writeFile(blockedLogPath, [
      JSON.stringify({
        timestamp: '2026-11-10T09:00:00.000Z',
        actionType: 'uke_export',
        details: formatSingleLegacyUkeExportAuditMessage({ patientName: '漏洩禁止 患者名', totalPoints: 1500, fileName: 'RECEIPT_1.uke' })
      }),
      JSON.stringify({
        timestamp: '2026-11-12T09:00:00.000Z',
        actionType: 'uke_export',
        details: formatSingleOfficialUkeExportAuditMessage({ patientName: '漏洩禁止 患者名', totalPoints: 1500, recordCount: 10 })
      })
    ].join('\n'), 'utf8');
    const blockedOut = join(workDir, 'out-blocked');
    const blockedRes = await runCli([
      '--audit-log', blockedLogPath,
      '--pilot-months', '2',
      '--stakeholder-consent',
      '--now', '2026-11-22T00:00:00.000Z',
      '--output-dir', blockedOut
    ]);
    assert.equal(blockedRes.code, 1);
    assert.doesNotMatch(blockedRes.stdout, /漏洩禁止/);
    const blockedChecklistText = await readFile(join(blockedOut, 'uke-retirement-checklist.txt'), 'utf8');
    assert.doesNotMatch(blockedChecklistText, /漏洩禁止/);
    const blockedJson = JSON.parse(blockedRes.stdout);
    assert.equal(blockedJson.status, 'blocked');
    assert.equal(blockedJson.auditSummary.legacyExportCountInWindow, 1);
    assert.equal(blockedJson.auditSummary.officialExportCountInWindow, 1);

    // 3. 条件 A/B/C すべて達成 -> exit 0 / pass
    const readyLogPath = join(workDir, 'audit-ready.jsonl');
    await writeFile(readyLogPath, [
      // 95日前の旧形式は期間外
      JSON.stringify({
        timestamp: '2026-08-19T00:00:00.000Z',
        actionType: 'uke_export',
        details: formatSingleLegacyUkeExportAuditMessage({ patientName: '過去患者', totalPoints: 500, fileName: 'RECEIPT_OLD.uke' })
      }),
      JSON.stringify({
        timestamp: '2026-11-18T09:00:00.000Z',
        actionType: 'uke_export',
        details: formatMonthlyOfficialUkeExportAuditMessage({
          officialFileName: 'RECEIPTY.CYO',
          claimCount: 5,
          totalPoints: 7500,
          totalSupplementalRecordCount: 1,
          totalPrescriptionRecordCount: 5,
          totalSplitRecordCount: 6,
          goTotalPoints: 7500
        })
      })
    ].join('\n'), 'utf8');
    const readyOut = join(workDir, 'out-ready');
    const readyRes = await runCli([
      '--audit-log', readyLogPath,
      '--pilot-months', '2',
      '--stakeholder-consent',
      '--now', '2026-11-22T00:00:00.000Z',
      '--output-dir', readyOut
    ]);
    assert.equal(readyRes.code, 0);
    const readyJson = JSON.parse(readyRes.stdout);
    assert.equal(readyJson.status, 'pass');
    assert.equal(readyJson.evaluation.canRetireLegacy, true);
    assert.equal(readyJson.auditSummary.legacyExportCountInWindow, 0);
    assert.equal(readyJson.auditSummary.officialExportCountInWindow, 1);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
