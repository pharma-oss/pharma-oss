import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settingsSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('settings page exposes medication info template approval workflow', () => {
  assert.match(settingsSource, /type SettingsTab = 'facility' \| 'external' \| 'master' \| 'medicationInfo'/);
  assert.match(settingsSource, /data-testid="settings-tab-medication-info"/);
  assert.match(settingsSource, /data-testid="medication-info-template-section"/);
  assert.match(settingsSource, /薬情テンプレ承認/);
  assert.match(settingsSource, /data-testid="medication-info-template-approve"/);
  assert.match(settingsSource, /承認して保存/);
});

test('medication info template approval records audited approved templates only', () => {
  assert.match(settingsSource, /db\.patient_medication_info_templates/);
  assert.match(settingsSource, /bulkUpsert\(approvalWriteSet\.writes\)/);
  assert.match(settingsSource, /patient_medication_info_template/);
  assert.match(settingsSource, /status === 'approved'/);
  assert.match(settingsSource, /payload\.reviewerId = currentUser\.userId/);
  assert.match(settingsSource, /payload\.approvedAt = now/);
  assert.match(settingsSource, /validateMedicationInfoTemplateForStatus/);
  assert.match(settingsSource, /getPatientMedicationInfoApprovalIssues/);
  assert.match(settingsSource, /currentMedicationInfoApprovalIssues\.map/);
  assert.match(settingsSource, /shouldForkPatientMedicationInfoTemplate/);
  assert.match(settingsSource, /buildPatientMedicationInfoApprovalWriteSet/);
  assert.match(settingsSource, /旧承認版廃止/);
  assert.match(settingsSource, /data-testid="medication-info-invalid-approved-alert"/);
  assert.match(settingsSource, /data-testid="medication-info-template-approval-readiness"/);
  assert.match(settingsSource, /承認前に必要な項目があります/);
  assert.match(settingsSource, /承認条件を満たしています/);
  assert.match(settingsSource, /disabled=\{isSavingMedicationInfoTemplate \|\| currentMedicationInfoApprovalIssues\.length > 0\}/);
  assert.match(settingsSource, /aria-describedby="medication-info-template-approval-readiness"/);
  assert.match(settingsSource, /承認不備/);
});

test('medication info template list can filter statuses and reports the 80 item display limit', () => {
  assert.match(settingsSource, /type MedicationInfoTemplateStatusFilter = 'all' \| PatientMedicationInfoTemplateStatus/);
  assert.match(settingsSource, /data-testid=\{`medication-info-template-status-filter-\$\{status\}`\}/);
  assert.match(settingsSource, /aria-pressed=\{isActive\}/);
  assert.match(settingsSource, /MEDICATION_INFO_TEMPLATE_STATUS_LABELS\[template\.status\]/);
  assert.match(settingsSource, /data-testid="medication-info-template-result-count"/);
  assert.match(settingsSource, /先頭80件を表示/);
  assert.match(settingsSource, /条件に一致するテンプレはありません/);
});

test('medication info template list can filter approval readiness', () => {
  assert.match(settingsSource, /type MedicationInfoTemplateReadinessFilter = 'all' \| 'ready' \| 'missing'/);
  assert.match(settingsSource, /getPatientMedicationInfoApprovalReadinessIssues/);
  assert.match(settingsSource, /medicationInfoTemplateReadinessFilter === 'ready'/);
  assert.match(settingsSource, /data-testid=\{`medication-info-template-readiness-filter-\$\{readiness\}`\}/);
  assert.match(settingsSource, /承認準備OK/);
  assert.match(settingsSource, /不足 \$\{readinessIssues\.length\}/);
});

test('editing an immutable medication info revision starts a protected draft revision', () => {
  assert.match(settingsSource, /hasPatientMedicationInfoTemplateContentChanges/);
  assert.match(settingsSource, /startsNewRevision/);
  assert.match(settingsSource, /status: 'draft' as const/);
  assert.match(settingsSource, /data-testid="medication-info-template-revision-notice"/);
  assert.match(settingsSource, /新しいテンプレIDへ分岐/);
  assert.match(settingsSource, /data-testid="medication-info-template-current-status"/);
  assert.match(settingsSource, /value=\{MEDICATION_INFO_TEMPLATE_STATUS_LABELS\[medicationInfoTemplateForm\.status\]\}/);
  assert.match(settingsSource, /disabled=\{isSavingMedicationInfoTemplate \|\| isEditingImmutableMedicationInfoRevision\}/);
  assert.match(settingsSource, /本文や参照元を変更したまま状態だけを更新できません/);
});

test('medication info template editor links to official PMDA search instead of scraped text', () => {
  assert.match(settingsSource, /buildPmdaMedicationSearchUrl/);
  assert.match(settingsSource, /副作用・使用上の注意案は下書き/);
  assert.doesNotMatch(settingsSource, /薬のしおりから取得/);
});

test('medication info templates support audited CSV bulk drafts without importing approvals', () => {
  assert.match(settingsSource, /buildPatientMedicationInfoTemplateCsv/);
  assert.match(settingsSource, /parsePatientMedicationInfoTemplateCsv/);
  assert.match(settingsSource, /data-testid="medication-info-template-csv-export"/);
  assert.match(settingsSource, /data-testid="medication-info-template-csv-input"/);
  assert.match(settingsSource, /data-testid="medication-info-template-csv-import-summary"/);
  assert.match(settingsSource, /setMedicationInfoCsvImportSummary/);
  assert.match(settingsSource, /status: 'draft'/);
  assert.match(settingsSource, /承認済み版は変更しません/);
  assert.match(settingsSource, /承認情報なし/);
});

test('medication info templates can create side effect and usage caution drafts only', () => {
  assert.match(settingsSource, /buildPatientMedicationInfoSafetyDraft/);
  assert.match(settingsSource, /buildPatientMedicationInfoSafetyDraftTemplate/);
  assert.match(settingsSource, /data-testid="medication-info-template-safety-draft"/);
  assert.match(settingsSource, /data-testid="medication-info-template-safety-draft-csv-export"/);
  assert.match(settingsSource, /data-testid="medication-info-template-side-effect"/);
  assert.match(settingsSource, /data-testid="medication-info-template-usage-caution"/);
  assert.match(settingsSource, /副作用・使用上の注意/);
  assert.match(settingsSource, /counselingText: draft\.usageCautionText/);
  assert.match(settingsSource, /status: prev\.status === 'approved' \? 'draft' : prev\.status/);
  assert.doesNotMatch(settingsSource, /data-testid="medication-info-template-effect"/);
  assert.doesNotMatch(settingsSource, /data-testid="medication-info-template-interaction"/);
  assert.doesNotMatch(settingsSource, /data-testid="medication-info-template-storage"/);
});
