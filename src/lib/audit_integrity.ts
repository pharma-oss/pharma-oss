import type { AuditLog } from '../db/types.ts';

export interface AuditIntegrityReport {
  total: number;
  signed: number;
  unsigned: number;
  invalid: number;
  isValid: boolean;
  latestHash?: string;
  firstSignedAt?: string;
  lastSignedAt?: string;
  /** 端末別チェーンの内訳。terminalId 未設定の既存ログは 'legacy' として1つのチェーン扱い。 */
  chains?: AuditChainReport[];
}

export interface AuditChainReport {
  /** 'hub-local' | サテライト端末ID | 'legacy'(terminalId未設定の既存ログ) */
  terminalId: string;
  total: number;
  signed: number;
  invalid: number;
  /**
   * previousHash が空のログで始まるチェーン断片の数。サテライトは起動のたびに
   * メモリDBから新しい断片を始めるため、複数断片は正常。断片内の改ざん・欠落は
   * invalid として検出される。
   */
  segments: number;
  latestHash?: string;
}

export const LEGACY_AUDIT_CHAIN_ID = 'legacy';

export interface AuditLogCustodyChecklist {
  label: string;
  latestHash?: string;
  requiredActions: string[];
  wormRetention: {
    label: string;
    requiredControls: string[];
    confirmation: {
      storageName: string;
      retentionPeriod: string;
      fileName: string;
      retentionLockVerified: boolean;
      readbackVerified: boolean;
      latestHashMatched: boolean;
      note: string;
    };
  };
  managerConfirmation: {
    confirmedBy: string;
    confirmedAt: string;
    storageLocation: string;
    latestHashCopied: boolean;
    externalStorageVerified: boolean;
    note: string;
  };
}

export interface AuditRetentionExportRecord {
  logId: string;
  timestamp: string;
  dateLabel: string;
  fileName: string;
  latestHash?: string;
  kind: 'audit_json' | 'retention_ledger';
}

export interface AuditLogRetentionMonthlyReview {
  monthKey: string;
  monthLabel: string;
  generatedAt: string;
  status: 'complete' | 'needs_review' | 'rejected';
  statusLabel: string;
  actionLabel: string;
  auditJsonExportCount: number;
  retentionLedgerExportCount: number;
  latestAuditJsonExport?: AuditRetentionExportRecord;
  latestRetentionLedgerExport?: AuditRetentionExportRecord;
  latestHash?: string;
  returnReasons: string[];
  requiredActions: string[];
  latestManagerReview?: AuditRetentionManagerReviewRecord;
  managerReviewStatus: 'approved' | 'returned' | 'pending';
  managerReviewLabel: string;
  managerReviewRequiredActions: string[];
}

export interface AuditRetentionManagerReviewRecord {
  logId: string;
  timestamp: string;
  dateLabel: string;
  monthLabel: string;
  decision: 'approved' | 'returned';
  statusLabel: string;
  reviewerName: string;
  latestHash?: string;
  returnReasonCount: number;
}

function canonicalAuditLogPayload(log: AuditLog, previousHash = '') {
  return {
    logId: log.logId,
    timestamp: log.timestamp,
    userId: log.userId,
    userName: log.userName,
    userRole: log.userRole,
    actionType: log.actionType,
    patientId: log.patientId || '',
    patientName: log.patientName || '',
    details: log.details,
    // terminalId未設定の既存ログはペイロードを従来と完全に一致させる必要がある
    // (キーを常に含めると過去の署名がすべて検証不能になる)。
    ...(log.terminalId ? { terminalId: log.terminalId } : {}),
    previousHash
  };
}

function toHex(bytes: Uint8Array): string {
  let value = '';
  for (let i = 0; i < bytes.length; i++) {
    value += bytes[i].toString(16).padStart(2, '0');
  }
  return value;
}

function fallbackHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fallback-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function sortAuditLogsChronologically(logs: AuditLog[]): AuditLog[] {
  return [...logs].sort((a, b) => {
    const timestampDiff = a.timestamp.localeCompare(b.timestamp);
    if (timestampDiff !== 0) return timestampDiff;
    return a.logId.localeCompare(b.logId);
  });
}

export async function sha256Hex(input: string): Promise<string> {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) return fallbackHash(input);

  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

export async function hashAuditLog(log: AuditLog, previousHash = log.previousHash || ''): Promise<string> {
  return sha256Hex(JSON.stringify(canonicalAuditLogPayload(log, previousHash)));
}

export async function buildAuditLogSignature(log: AuditLog, previousHash = ''): Promise<Pick<AuditLog, 'previousHash' | 'integrityHash'>> {
  return {
    previousHash,
    integrityHash: await hashAuditLog(log, previousHash)
  };
}

// 複数端末のログを集約すると、時系列順に並べても各端末のチェーンが交互に現れるため、
// 「直前の署名ログのハッシュと一致するか」という単一チェーン前提の検証は成立しない。
// 端末ID(未設定は'legacy')でグループ化し、各チェーンを独立に検証する:
//   - 各署名ログのintegrityHashを再計算して内容改ざんを検出する
//   - previousHashは空(断片の開始)か、同一チェーン内かつ時系列で先行する署名ログの
//     ハッシュに解決しなければならない(途中のログの削除・差し替えを検出する)
// チェーン末尾の削除はハッシュチェーン単体では検出できない。従来どおり最新ハッシュの
// 保全台帳への転記(外部アンカー)で担保する。
export async function verifyAuditLogIntegrity(logs: AuditLog[]): Promise<AuditIntegrityReport> {
  const sortedLogs = sortAuditLogsChronologically(logs);
  let signed = 0;
  let unsigned = 0;
  let invalid = 0;
  let latestHash = '';
  let firstSignedAt: string | undefined;
  let lastSignedAt: string | undefined;

  const chainLogs = new Map<string, AuditLog[]>();
  for (const log of sortedLogs) {
    if (!log.integrityHash) {
      unsigned++;
      continue;
    }
    signed++;
    firstSignedAt = firstSignedAt || log.timestamp;
    lastSignedAt = log.timestamp;
    latestHash = log.integrityHash;

    const chainId = log.terminalId || LEGACY_AUDIT_CHAIN_ID;
    const chain = chainLogs.get(chainId);
    if (chain) {
      chain.push(log);
    } else {
      chainLogs.set(chainId, [log]);
    }
  }

  const chains: AuditChainReport[] = [];
  for (const [terminalId, chain] of chainLogs) {
    let chainInvalid = 0;
    let segments = 0;
    const seenHashes = new Set<string>();
    for (const log of chain) {
      const previousHash = log.previousHash || '';
      if (previousHash === '') {
        segments++;
      } else if (!seenHashes.has(previousHash)) {
        chainInvalid++;
      }

      const expectedHash = await hashAuditLog(log, previousHash);
      if (expectedHash !== log.integrityHash) {
        chainInvalid++;
      }
      seenHashes.add(log.integrityHash as string);
    }
    invalid += chainInvalid;
    chains.push({
      terminalId,
      total: chain.length,
      signed: chain.length,
      invalid: chainInvalid,
      segments,
      latestHash: chain[chain.length - 1]?.integrityHash
    });
  }

  return {
    total: logs.length,
    signed,
    unsigned,
    invalid,
    isValid: invalid === 0,
    latestHash: latestHash || undefined,
    firstSignedAt,
    lastSignedAt,
    chains
  };
}

export function buildAuditLogCustodyChecklist(report: AuditIntegrityReport): AuditLogCustodyChecklist {
  return {
    label: '責任者保全欄',
    latestHash: report.latestHash,
    requiredActions: [
      '監査ログJSONを店舗で定めた外部保管場所へ保存する',
      '最新ハッシュを保全台帳または責任者メモへ転記する',
      '保存後に確認者、確認日時、保存場所を記録する'
    ],
    wormRetention: {
      label: '外部WORM保存確認',
      requiredControls: [
        'pharma-ossとは別の外部保管先に保存する',
        '保存後の上書き・削除が制限される設定を確認する',
        '保存先から監査ログJSONを読み戻せることを確認する',
        'JSON内の最新ハッシュと保全台帳の最新ハッシュを照合する'
      ],
      confirmation: {
        storageName: '',
        retentionPeriod: '',
        fileName: '',
        retentionLockVerified: false,
        readbackVerified: false,
        latestHashMatched: false,
        note: ''
      }
    },
    managerConfirmation: {
      confirmedBy: '',
      confirmedAt: '',
      storageLocation: '',
      latestHashCopied: false,
      externalStorageVerified: false,
      note: ''
    }
  };
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function formatAuditIntegrityStatus(report: AuditIntegrityReport): string {
  if (report.invalid > 0) return '異常あり';
  if (report.unsigned > 0) return '未署名あり';
  return '正常';
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function toMonthLabel(date: Date): string {
  return `${date.getFullYear()}年${pad2(date.getMonth() + 1)}月`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseAuditExportFileName(details: string, prefix: string): string {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = details.match(new RegExp(`${escapedPrefix}:\\s*([^\\s]+)\\s+に`));
  return match?.[1] || '';
}

function parseLatestHashFromRetentionLedger(details: string): string | undefined {
  const match = details.match(/最新ハッシュ\s+(.+?)\s+の外部WORM保存確認欄/);
  const value = match?.[1];
  return value && value !== '未署名' ? value : undefined;
}

function parseAuditRetentionManagerReview(log: AuditLog): AuditRetentionManagerReviewRecord | null {
  if (log.actionType !== 'audit_retention_approval') return null;
  const timestamp = new Date(log.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;
  const heading = log.details.match(/^監査ログ保全責任者(承認|差し戻し):\s*([^/]+?)\s*\//);
  if (!heading) return null;
  const statusLabel = log.details.match(/判定\s+(.+?)(?:\s+\/|$)/)?.[1] || '';
  const reviewerName = log.details.match(/確認者\s+(.+?)(?:\s+\/|$)/)?.[1] || log.userName;
  const latestHash = log.details.match(/最新ハッシュ\s+(.+?)(?:\s+\/|$)/)?.[1];
  const returnReasonCount = Number(log.details.match(/差し戻し\s+(\d+)件/)?.[1] || 0);

  return {
    logId: log.logId,
    timestamp: log.timestamp,
    dateLabel: formatDateLabel(timestamp),
    monthLabel: heading[2].trim(),
    decision: heading[1] === '承認' ? 'approved' : 'returned',
    statusLabel,
    reviewerName,
    latestHash: latestHash && latestHash !== '未署名' ? latestHash : undefined,
    returnReasonCount
  };
}

function toRetentionExportRecord(log: AuditLog): AuditRetentionExportRecord | null {
  const timestamp = new Date(log.timestamp);
  if (Number.isNaN(timestamp.getTime())) return null;

  if (log.actionType !== 'audit_export') return null;
  if (log.details.includes('監査ログ保全台帳CSVエクスポート')) {
    return {
      logId: log.logId,
      timestamp: log.timestamp,
      dateLabel: formatDateLabel(timestamp),
      fileName: parseAuditExportFileName(log.details, '監査ログ保全台帳CSVエクスポート'),
      latestHash: parseLatestHashFromRetentionLedger(log.details),
      kind: 'retention_ledger'
    };
  }
  if (log.details.includes('監査ログJSONエクスポート')) {
    return {
      logId: log.logId,
      timestamp: log.timestamp,
      dateLabel: formatDateLabel(timestamp),
      fileName: parseAuditExportFileName(log.details, '監査ログJSONエクスポート'),
      latestHash: log.integrityHash,
      kind: 'audit_json'
    };
  }
  return null;
}

function requiredActionForReturnReason(reason: string): string {
  if (reason.includes('整合性')) return '監査ログ整合性を確認し、異常ログの原因を調査する';
  if (reason.includes('未署名')) return '未署名ログを確認し、必要に応じて監査ログJSONを再出力する';
  if (reason.includes('保全台帳CSV')) return '最新JSONに対応する保全台帳CSVを出力し、責任者確認へ回す';
  if (reason.includes('監査ログJSON')) return '監査ログJSONを出力し、外部保管先へ保存する';
  return '責任者が保全状態を確認し、月次棚卸を完了する';
}

export function buildAuditLogRetentionLedgerCsv(
  report: AuditIntegrityReport,
  auditLogFileName = '',
  exportedAt = new Date()
): string {
  const rows = [
    ['区分', '項目', '値', '補足'],
    ['監査ログJSON', '想定ファイル名', auditLogFileName, 'JSONを書き出したファイル名を記録'],
    ['監査ログJSON', '台帳作成日時', exportedAt.toISOString(), '保全台帳CSVの作成日時'],
    [
      '整合性',
      '判定',
      formatAuditIntegrityStatus(report),
      `総数 ${report.total}件 / 署名済み ${report.signed}件 / 未署名 ${report.unsigned}件 / 異常 ${report.invalid}件`
    ],
    ['整合性', '最新ハッシュ', report.latestHash || '未署名', '外部保管先にも転記し、後日の照合に使う'],
    ['外部WORM保存', '保存先名', '', 'クラウドWORMバケット、改変不可NAS、保管媒体名など'],
    ['外部WORM保存', '保存先パスまたはURL', '', '監査ログJSONの保存先'],
    ['外部WORM保存', '保持期間', '', '店舗規程に従う保持期間。削除ロックの期限も記録'],
    ['外部WORM保存', '上書き・削除不可確認', '未確認', 'WORM、オブジェクトロック、読み取り専用媒体などの設定確認'],
    ['外部WORM保存', '保存後の読み取り確認', '未確認', '保存先からJSONを開けることを確認'],
    ['責任者確認', '確認者', '', '薬局で定めた確認者名'],
    ['責任者確認', '確認日時', '', 'YYYY-MM-DD HH:mm'],
    ['責任者確認', '最新ハッシュ照合', '未確認', '台帳の最新ハッシュとJSON内のintegrity.latestHashが一致すること'],
    ['責任者確認', '備考', '', '障害、差し戻し、再出力など']
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildAuditLogRetentionMonthlyReview(
  logs: AuditLog[],
  report: AuditIntegrityReport,
  generatedAt = new Date()
): AuditLogRetentionMonthlyReview {
  const monthKey = toMonthKey(generatedAt);
  const monthLabel = toMonthLabel(generatedAt);
  const records = sortAuditLogsChronologically(logs)
    .map(toRetentionExportRecord)
    .filter((record): record is AuditRetentionExportRecord => Boolean(record))
    .filter((record) => toMonthKey(new Date(record.timestamp)) === monthKey);
  const managerReviews = sortAuditLogsChronologically(logs)
    .map(parseAuditRetentionManagerReview)
    .filter((record): record is AuditRetentionManagerReviewRecord => Boolean(record))
    .filter((record) => toMonthKey(new Date(record.timestamp)) === monthKey && record.monthLabel === monthLabel);
  const auditJsonExports = records.filter((record) => record.kind === 'audit_json');
  const retentionLedgerExports = records.filter((record) => record.kind === 'retention_ledger');
  const latestAuditJsonExport = auditJsonExports.at(-1);
  const latestRetentionLedgerExport = retentionLedgerExports.at(-1);
  const latestManagerReview = managerReviews.at(-1);
  const hasLedgerAfterLatestJson = latestAuditJsonExport
    ? retentionLedgerExports.some((record) => record.timestamp >= latestAuditJsonExport.timestamp)
    : retentionLedgerExports.length > 0;

  const returnReasons: string[] = [];
  if (report.invalid > 0) returnReasons.push('監査ログ整合性に異常があります');
  if (report.unsigned > 0) returnReasons.push('未署名の監査ログがあります');
  if (auditJsonExports.length === 0) returnReasons.push('今月の監査ログJSONが未出力です');
  if (retentionLedgerExports.length === 0) {
    returnReasons.push('今月の保全台帳CSVが未出力です');
  } else if (!hasLedgerAfterLatestJson) {
    returnReasons.push('最新の監査ログJSON後に保全台帳CSVが出力されていません');
  }

  const status = returnReasons.length === 0
    ? 'complete'
    : report.invalid > 0 || auditJsonExports.length === 0
      ? 'rejected'
      : 'needs_review';
  const statusLabel = status === 'complete'
    ? '棚卸完了'
    : status === 'rejected'
      ? '差し戻し'
      : '責任者確認待ち';
  const latestEvidenceTimestamp = [latestAuditJsonExport?.timestamp, latestRetentionLedgerExport?.timestamp]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const managerReviewIsCurrent = Boolean(
    latestManagerReview &&
    (!latestEvidenceTimestamp || latestManagerReview.timestamp >= latestEvidenceTimestamp)
  );
  const managerReviewStatus = managerReviewIsCurrent && latestManagerReview?.decision === 'approved' && status === 'complete'
    ? 'approved'
    : managerReviewIsCurrent && latestManagerReview?.decision === 'returned'
      ? 'returned'
      : 'pending';
  const managerReviewLabel = managerReviewStatus === 'approved'
    ? '責任者承認済み'
    : managerReviewStatus === 'returned'
      ? '差し戻し記録済み'
      : '責任者未確認';
  const managerReviewRequiredActions = managerReviewStatus === 'approved'
    ? ['責任者承認済みです']
    : status === 'complete'
      ? ['責任者が棚卸結果を承認する']
      : ['責任者が差し戻し内容を確認し、対応記録を残す'];

  return {
    monthKey,
    monthLabel,
    generatedAt: generatedAt.toISOString(),
    status,
    statusLabel,
    actionLabel: status === 'complete' ? '外部保全を維持' : '責任者へ差し戻し',
    auditJsonExportCount: auditJsonExports.length,
    retentionLedgerExportCount: retentionLedgerExports.length,
    latestAuditJsonExport,
    latestRetentionLedgerExport,
    latestHash: report.latestHash,
    returnReasons,
    requiredActions: returnReasons.length > 0
      ? returnReasons.map(requiredActionForReturnReason)
      : ['監査ログJSONと保全台帳CSVを外部保管先で保持する'],
    latestManagerReview,
    managerReviewStatus,
    managerReviewLabel,
    managerReviewRequiredActions
  };
}

export function buildAuditLogRetentionMonthlyReviewCsv(review: AuditLogRetentionMonthlyReview): string {
  const rows = [
    ['区分', '項目', '値', '補足'],
    ['月次棚卸', '対象月', review.monthLabel, review.monthKey],
    ['月次棚卸', '作成日時', review.generatedAt, '棚卸CSVの作成日時'],
    ['月次棚卸', '判定', review.statusLabel, review.actionLabel],
    ['出力状況', '監査ログJSON', `${review.auditJsonExportCount}回`, review.latestAuditJsonExport?.fileName || '未出力'],
    ['出力状況', '保全台帳CSV', `${review.retentionLedgerExportCount}回`, review.latestRetentionLedgerExport?.fileName || '未出力'],
    ['整合性', '最新ハッシュ', review.latestHash || '未署名', '外部保管先との照合値'],
    ['責任者確認', '状態', review.managerReviewLabel, review.latestManagerReview ? `${review.latestManagerReview.dateLabel} ${review.latestManagerReview.reviewerName}` : '未記録'],
    ['差し戻し', '理由', review.returnReasons.length > 0 ? review.returnReasons.join(' / ') : 'なし', '責任者確認で解消する項目'],
    ['差し戻し', '対応', review.requiredActions.join(' / '), '棚卸完了までの対応']
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildAuditLogRetentionManagerReviewAuditDetail(
  review: AuditLogRetentionMonthlyReview,
  reviewerName: string
): string {
  const decisionLabel = review.status === 'complete' && review.returnReasons.length === 0 ? '承認' : '差し戻し';
  const safeReviewerName = reviewerName.trim() || '責任者';
  const latestHash = review.latestHash || '未署名';
  const actionLabel = review.managerReviewRequiredActions[0] || review.actionLabel;
  return [
    `監査ログ保全責任者${decisionLabel}: ${review.monthLabel}`,
    `判定 ${review.statusLabel}`,
    `確認者 ${safeReviewerName}`,
    `最新ハッシュ ${latestHash}`,
    `差し戻し ${review.returnReasons.length}件`,
    `対応 ${actionLabel}`
  ].join(' / ');
}

export function buildAuditLogExportJson(logs: AuditLog[], report: AuditIntegrityReport, exportedAt = new Date()): string {
  return JSON.stringify({
    app: 'yakureki',
    type: 'audit-log-export',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    integrity: report,
    custody: buildAuditLogCustodyChecklist(report),
    logs: sortAuditLogsChronologically(logs)
  }, null, 2);
}
