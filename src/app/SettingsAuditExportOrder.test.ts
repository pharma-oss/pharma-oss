import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const auditHookSource = readFileSync(new URL('../hooks/useAuditSettings.ts', import.meta.url), 'utf8');
const staffHookSource = readFileSync(new URL('../hooks/useStaffSettings.ts', import.meta.url), 'utf8');

function sectionFrom(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertAuditBeforeDownload(body: string, downloadNeedle: string) {
  const auditIndex = body.indexOf('const auditOk = await logAuditAction(');
  const guardIndex = body.indexOf('if (!auditOk)', auditIndex);
  const downloadIndex = body.indexOf(downloadNeedle);
  assert.ok(auditIndex >= 0, 'audit logging result is not checked');
  assert.ok(guardIndex > auditIndex, 'audit failure guard is missing');
  assert.ok(downloadIndex > guardIndex, 'download starts before audit logging succeeds');
}

test('audit log JSON export writes audit log before downloading the file', () => {
  const body = sectionFrom(auditHookSource, 'const handleExportAuditLogs = async', 'const handleExportAnonymousDiagnostic = async');
  assertAuditBeforeDownload(body, 'URL.createObjectURL(blob)');
});

test('anonymous diagnostic export writes audit log before downloading the file', () => {
  const body = sectionFrom(auditHookSource, 'const handleExportAnonymousDiagnostic = async', 'const handleExportAuditRetentionLedgerCsv = async');
  assertAuditBeforeDownload(body, 'downloadTextFile(fileName, content');
});

test('audit retention ledger export writes audit log before downloading the file', () => {
  const body = sectionFrom(auditHookSource, 'const handleExportAuditRetentionLedgerCsv = async', 'const handleExportAuditRetentionMonthlyReviewCsv = async');
  assertAuditBeforeDownload(body, 'URL.createObjectURL(blob)');
});

test('audit retention monthly review export writes audit log before downloading the file', () => {
  const body = sectionFrom(auditHookSource, 'const handleExportAuditRetentionMonthlyReviewCsv = async', 'const handleRecordAuditRetentionManagerReview = async');
  assertAuditBeforeDownload(body, 'URL.createObjectURL(blob)');
});

test('staff access recovery monthly review export writes audit log before downloading the file', () => {
  const body = sectionFrom(staffHookSource, 'const handleExportStaffAccessRecoveryMonthlyReviewCsv = async', 'const handleSaveRolePermissionPolicy = async');
  assertAuditBeforeDownload(body, 'URL.createObjectURL(blob)');
});

