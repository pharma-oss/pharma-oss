import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  DEFAULT_UKE_RETIREMENT_WINDOW_DAYS,
  buildUkeRetirementChecklist,
  evaluateUkeRetirementFromAuditLogs,
  parseUkeAuditLogInput,
  type UkeExportAuditLogEntry,
  type UkeRetirementAuditReport
} from '../src/lib/receipt/uke_migration_policy.ts';
import { opsReviewStatusExitCode, type OpsReviewStatus } from '../src/lib/ops_review_status.ts';

interface CliOptions {
  auditLogPath: string;
  pilotMonthsConfirmed: number;
  stakeholderConsentObtained: boolean;
  windowDays: number;
  now?: Date;
  outputDir: string;
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseNonNegativeInt(raw: string | undefined, label: string, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
    throw new Error(`${label} は 0 以上の整数で指定してください: ${raw}`);
  }
  return parsed;
}

function parseCliArgs(argv: string[]): CliOptions {
  let auditLogPath = process.env.YAKUREKI_UKE_AUDIT_LOG_PATH || '';
  let pilotMonthsRaw = process.env.YAKUREKI_UKE_PILOT_MONTHS;
  let stakeholderConsentObtained = parseBooleanFlag(process.env.YAKUREKI_UKE_STAKEHOLDER_CONSENT);
  let windowDaysRaw = process.env.YAKUREKI_UKE_WINDOW_DAYS;
  let nowRaw = process.env.YAKUREKI_UKE_EVALUATED_AT;
  let outputDir = process.env.YAKUREKI_UKE_RETIREMENT_OUTPUT_DIR || 'artifacts/uke-retirement-readiness';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--audit-log' && argv[i + 1]) {
      auditLogPath = argv[++i];
    } else if (arg === '--pilot-months' && argv[i + 1]) {
      pilotMonthsRaw = argv[++i];
    } else if (arg === '--stakeholder-consent') {
      stakeholderConsentObtained = true;
    } else if (arg.startsWith('--stakeholder-consent=')) {
      stakeholderConsentObtained = parseBooleanFlag(arg.slice('--stakeholder-consent='.length));
    } else if (arg === '--window-days' && argv[i + 1]) {
      windowDaysRaw = argv[++i];
    } else if (arg === '--now' && argv[i + 1]) {
      nowRaw = argv[++i];
    } else if (arg === '--output-dir' && argv[i + 1]) {
      outputDir = argv[++i];
    }
  }

  let now: Date | undefined;
  if (nowRaw && nowRaw.trim() !== '') {
    const parsedNow = new Date(nowRaw);
    if (Number.isNaN(parsedNow.getTime())) {
      throw new Error(`--now に有効な日時（ISO 8601）を指定してください: ${nowRaw}`);
    }
    now = parsedNow;
  }

  const windowDays = parseNonNegativeInt(windowDaysRaw, '--window-days', DEFAULT_UKE_RETIREMENT_WINDOW_DAYS);
  if (windowDays < 1) {
    throw new Error('--window-days は 1 以上の整数で指定してください。');
  }

  return {
    auditLogPath: auditLogPath.trim(),
    pilotMonthsConfirmed: parseNonNegativeInt(pilotMonthsRaw, '--pilot-months', 0),
    stakeholderConsentObtained,
    windowDays,
    now,
    outputDir: outputDir.trim() || 'artifacts/uke-retirement-readiness'
  };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const evaluatedAt = options.now ?? new Date();
  let logs: UkeExportAuditLogEntry[] = [];
  let auditLogProvided = false;

  if (options.auditLogPath) {
    const resolvedAuditLogPath = resolve(options.auditLogPath);
    await stat(resolvedAuditLogPath);
    const raw = await readFile(resolvedAuditLogPath, 'utf8');
    logs = parseUkeAuditLogInput(raw);
    auditLogProvided = true;
  }

  const baseReport: UkeRetirementAuditReport = evaluateUkeRetirementFromAuditLogs({
    logs,
    pilotMonthsConfirmed: options.pilotMonthsConfirmed,
    stakeholderConsentObtained: options.stakeholderConsentObtained,
    now: evaluatedAt,
    windowDays: options.windowDays
  });

  // 監査ログファイル未指定時は「旧形式0回」とみなさず、条件B未実測として必ずブロックする
  const extraBlockers = auditLogProvided
    ? []
    : ['監査ログファイル（--audit-log または YAKUREKI_UKE_AUDIT_LOG_PATH）が未指定のため、条件B（直近90日の旧形式UKE出力0回）を実測確認できていません。'];
  const combinedBlockers = [...extraBlockers, ...baseReport.evaluation.blockers];
  const canRetireLegacy = auditLogProvided && baseReport.evaluation.canRetireLegacy;
  const opsStatus: OpsReviewStatus = canRetireLegacy
    ? 'pass'
    : !auditLogProvided
      ? 'blocked'
      : baseReport.opsStatus;

  const finalReport: UkeRetirementAuditReport = {
    ...baseReport,
    evaluation: {
      ...baseReport.evaluation,
      canRetireLegacy,
      blockers: combinedBlockers,
      currentStatus: canRetireLegacy
        ? 'ready_for_full_retirement'
        : !auditLogProvided
          ? 'active_parallel'
          : baseReport.evaluation.currentStatus
    },
    opsStatus,
    summaryLine: auditLogProvided
      ? baseReport.summaryLine
      : `廃止ブロック中（監査ログ未指定・未達 ${combinedBlockers.length}件） / 公式運用 ${baseReport.criteria.pilotMonthsConfirmed}ヶ月`
  };

  const resolvedOutputDir = resolve(options.outputDir);
  await mkdir(resolvedOutputDir, { recursive: true });
  const reviewJsonPath = join(resolvedOutputDir, 'uke-retirement-readiness.json');
  const checklistPath = join(resolvedOutputDir, 'uke-retirement-checklist.txt');

  // 患者個人情報は一切出力せず、集計値と条件判定結果のみを記録する
  const outputPayload = {
    status: finalReport.opsStatus,
    auditLogProvided,
    parsedAuditEntryCount: logs.length,
    auditSummary: finalReport.auditSummary,
    criteria: finalReport.criteria,
    evaluation: finalReport.evaluation,
    summaryLine: finalReport.summaryLine,
    outputs: {
      reviewJson: reviewJsonPath,
      checklist: checklistPath
    }
  };

  await writeFile(reviewJsonPath, `${JSON.stringify(outputPayload, null, 2)}\n`, 'utf8');
  await writeFile(checklistPath, buildUkeRetirementChecklist(finalReport), 'utf8');

  process.stdout.write(`${JSON.stringify(outputPayload, null, 2)}\n`);
  process.exitCode = opsReviewStatusExitCode(finalReport.opsStatus);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
