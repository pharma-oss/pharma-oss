import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BackupSettingsTab from '@/components/settings/BackupSettingsTab';
import type { User } from '@/db/types';
import {
  DEFAULT_BACKUP_SCHEDULE_POLICY,
  buildBackupGenerationReview,
  buildBackupScheduleReview
} from '@/lib/backup';
import { buildAiSuggestionFeedbackMonthlyReview } from '@/lib/ai_suggestion_feedback';
import type { PatientDuplicateScanReport } from '@/lib/patient_duplicate_review';
import {
  findOpeningTag,
  listDisabledOpeningTags,
  stripStyleBlocks
} from '@/lib/test_support/html_disabled_tags';

type BackupSettingsTabProps = React.ComponentProps<typeof BackupSettingsTab>;

const DISABLED_ATTR_PATTERN = /\sdisabled=""(?=[\s/>]|$)/;
const TITLE_ATTR_PATTERN = /\stitle="([^"]*)"/;
const BUTTON_BLOCK_PATTERN = /<button\b[^>]*>[\s\S]*?<\/button>/gi;
const BUTTON_OPENING_TAG_PATTERN = /^<button\b[^>]*>/i;

const MOCK_ADMIN_USER: User = {
  userId: 'admin-1',
  name: '管理者 太郎',
  role: 'admin',
  passwordHash: 'hash-admin',
  salt: 'salt-admin'
};

const FIXED_BASIS_DATE = new Date('2026-10-26T12:00:00+09:00');

const MOCK_DUPLICATE_REPORT: PatientDuplicateScanReport = {
  scannedPatientCount: 2,
  duplicatePatientCount: 2,
  groups: [
    {
      groupId: 'dup-group-1',
      matchType: 'name_birthdate',
      matchLabel: '氏名と生年月日が一致',
      displayName: '山田 花子',
      birthDate: '1980-04-01',
      suggestedTargetPatientId: 'pt-keep-1',
      members: [
        {
          patientId: 'pt-keep-1',
          name: '山田 花子',
          kana: 'ヤマダ ハナコ',
          birthDate: '1980-04-01',
          insuranceNumber: '06130012',
          visitCount: 5,
          latestVisitDate: '2026-10-20'
        },
        {
          patientId: 'pt-merge-2',
          name: '山田 花子',
          kana: 'ヤマダ ハナコ',
          birthDate: '1980-04-01',
          insuranceNumber: '06130012',
          visitCount: 1,
          latestVisitDate: '2026-09-10'
        }
      ]
    }
  ]
};

function createMockBackupSettingsProps(
  overrides: Partial<BackupSettingsTabProps> = {}
): BackupSettingsTabProps {
  return {
    currentUser: MOCK_ADMIN_USER,
    canManageBackups: true,
    downloadTextFile: () => {},
    formatDateTimeStamp: () => '20261026_120000',
    backupScheduleReview: buildBackupScheduleReview(
      [],
      DEFAULT_BACKUP_SCHEDULE_POLICY,
      FIXED_BASIS_DATE
    ),
    backupScheduleReviewColor: '#166534',
    backupScheduleReviewBackground: '#dcfce7',
    backupSchedulePolicy: { ...DEFAULT_BACKUP_SCHEDULE_POLICY },
    handleBackupSchedulePolicyChange: () => {},
    isSavingBackupSchedule: false,
    handleSaveBackupSchedulePolicy: async () => {},
    handleScanPatientDuplicates: async () => {},
    isScanningPatientDuplicates: false,
    patientDuplicateMessage: '',
    patientDuplicateReport: MOCK_DUPLICATE_REPORT,
    duplicateMergeTargets: { 'dup-group-1': 'pt-keep-1' },
    setDuplicateMergeTargets: () => {},
    setDuplicateMergeReview: () => {},
    openDuplicateMergeReview: async () => {},
    isApplyingDuplicateMerge: false,
    duplicateMergeReview: null,
    handleApplyDuplicateMerge: async () => {},
    backupGenerationReview: buildBackupGenerationReview([], FIXED_BASIS_DATE),
    backupGenerationReviewColor: '#166534',
    backupGenerationReviewBackground: '#dcfce7',
    handleExportBackupGenerationReviewCsv: async () => {},
    isExportingBackupGenerationReview: false,
    soapDraftFeedbackBackground: '#dcfce7',
    soapDraftFeedbackColor: '#166534',
    aiSuggestionFeedbackReview: buildAiSuggestionFeedbackMonthlyReview([], FIXED_BASIS_DATE),
    storeFeedbackBackground: '#dcfce7',
    storeFeedbackColor: '#166534',
    latestBackupGenerationLabel: '2026-10-26 10:00',
    latestBackupDrillLabel: '2026-10-25 18:00',
    latestBackupExternalStorageLabel: '2026-10-26 10:05',
    useEncryption: true,
    setUseEncryption: () => {},
    showExportPassword: false,
    setShowExportPassword: () => {},
    exportPassword: 'export-password-123',
    setExportPassword: () => {},
    exportBackupExternalTransferManifest: false,
    setExportBackupExternalTransferManifest: () => {},
    externalBackupRetentionDays: 30,
    setExternalBackupRetentionDays: () => {},
    handleExportBackup: async () => {},
    isExportingBackup: false,
    handleRecordBackupExternalStorage: async () => {},
    isRecordingExternalBackupStorage: false,
    externalBackupFileName: 'yakureki_backup_20261026.json',
    setExternalBackupFileName: () => {},
    externalBackupDestinationName: '店舗NAS',
    setExternalBackupDestinationName: () => {},
    externalBackupDestinationPath: '/mnt/nas/backups',
    setExternalBackupDestinationPath: () => {},
    externalBackupVerifierName: '管理者 太郎',
    setExternalBackupVerifierName: () => {},
    externalBackupReadBackVerified: true,
    setExternalBackupReadBackVerified: () => {},
    externalBackupImmutableVerified: true,
    setExternalBackupImmutableVerified: () => {},
    externalBackupNotes: '',
    setExternalBackupNotes: () => {},
    handleExternalBackupReceiptFileChange: () => {},
    externalBackupReceiptFile: new File(['{}'], 'external_receipt.json', {
      type: 'application/json'
    }),
    isRecordingExternalBackupReceipt: false,
    handleRecordBackupExternalTransferReceipt: async () => {},
    migrationCsvKind: 'patients',
    handleMigrationCsvKindChange: () => {},
    isAnalyzingMigrationCsv: false,
    isAnalyzingDiff: false,
    handleMigrationCsvFileChange: () => {},
    migrationCsvFile: new File(['id,name\n1,テスト'], 'patients.csv', { type: 'text/csv' }),
    handleAnalyzeMigrationCsv: async () => {},
    migrationCsvPreview: null,
    pendingBackupPayload: null,
    handleBackupFileChange: () => {},
    showImportPasswordInput: false,
    backupFile: new File(['{}'], 'backup.json', { type: 'application/json' }),
    handleImportBackup: async () => {},
    isImportingBackup: false,
    importPassword: '',
    setImportPassword: () => {},
    handleDecryptAndAnalyze: () => {},
    handleCancelRestore: () => {},
    backupDiffs: null,
    backupDrillReport: null,
    handleRecordBackupDrill: async () => {},
    handleConfirmRestore: async () => {},
    ...overrides
  };
}

function renderWithEscrowInputsFilled(
  props: BackupSettingsTabProps,
  additionalStateOverrides: Readonly<Record<number, unknown>> = {}
): string {
  const originalUseState = React.useState;
  const escrowStateOverrides: Readonly<Record<number, unknown>> = {
    1: 'admin-password-123',
    5: 'escrow-payload-text',
    6: 'restore-password-123',
    ...additionalStateOverrides
  };
  let callIndex = 0;
  const useStateMock = mock.method(
    React,
    'useState',
    ((initialState?: unknown) => {
      const currentIndex = callIndex++;
      if (currentIndex in escrowStateOverrides) {
        if (currentIndex === 1 || currentIndex === 5 || currentIndex === 6) {
          assert.equal(
            initialState,
            '',
            `Expected BackupSettingsTab React.useState call #${currentIndex} initial value to be '', got ${String(initialState)}`
          );
        } else if (currentIndex === 2 || currentIndex === 7) {
          assert.equal(
            initialState,
            false,
            `Expected BackupSettingsTab React.useState call #${currentIndex} initial value to be false, got ${String(initialState)}`
          );
        }
        return [escrowStateOverrides[currentIndex], () => {}];
      }
      return (originalUseState as (init?: unknown) => [unknown, (v: unknown) => void])(
        initialState
      );
    }) as typeof React.useState
  );
  try {
    const html = renderToStaticMarkup(React.createElement(BackupSettingsTab, props));
    assert.equal(
      callIndex,
      9,
      `Expected BackupSettingsTab to call React.useState exactly 9 times, got ${callIndex}`
    );
    return html;
  } finally {
    useStateMock.mock.restore();
  }
}

function findButtonOpeningTagBySpanText(html: string, spanText: string): string {
  const stripped = stripStyleBlocks(html);
  const buttonBlocks = stripped.match(BUTTON_BLOCK_PATTERN) || [];
  const targetSpan = `<span>${spanText}</span>`;
  const matchingBlocks = buttonBlocks.filter((block) => block.includes(targetSpan));
  assert.equal(
    matchingBlocks.length,
    1,
    `Expected exactly 1 <button> containing ${targetSpan}, got ${matchingBlocks.length}`
  );
  const openingMatch = matchingBlocks[0].match(BUTTON_OPENING_TAG_PATTERN);
  assert.ok(openingMatch, `Failed to extract opening <button> tag for ${targetSpan}`);
  return openingMatch[0];
}

function extractTitleAttribute(tag: string): string | null {
  const match = tag.match(TITLE_ATTR_PATTERN);
  return match ? match[1] : null;
}

interface BackupControlSpec {
  name: string;
  getOpeningTag: (html: string) => string;
}

const BACKUP_MANAGEMENT_CONTROL_SPECS: readonly BackupControlSpec[] = [
  {
    name: '予定を保存ボタン (L378)',
    getOpeningTag: (html) => findButtonOpeningTagBySpanText(html, '予定を保存')
  },
  {
    name: '重複候補を確認ボタン (L403, patient-duplicate-scan-button)',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="patient-duplicate-scan-button"', 'button')
  },
  {
    name: '統合確認ボタン (L446, btn-duplicate-review)',
    getOpeningTag: (html) => findOpeningTag(html, 'btn-duplicate-review', 'button')
  },
  {
    name: '世代管理CSVボタン (L513, btn-generation-csv)',
    getOpeningTag: (html) => findOpeningTag(html, 'btn-generation-csv', 'button')
  },
  {
    name: 'エスクロー発行パスワード入力欄 (L680, escrow-issue-password-input)',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="escrow-issue-password-input"', 'input')
  },
  {
    name: 'エスクロー控えを出力ボタン (L688, escrow-issue-button)',
    getOpeningTag: (html) => findOpeningTag(html, 'data-testid="escrow-issue-button"', 'button')
  },
  {
    name: 'エスクロー復元パスワード入力欄 (L726, escrow-restore-password-input)',
    getOpeningTag: (html) =>
      findOpeningTag(html, 'data-testid="escrow-restore-password-input"', 'input')
  },
  {
    name: '暗号鍵を復元して適用ボタン (L734, escrow-restore-button)',
    getOpeningTag: (html) => findOpeningTag(html, 'data-testid="escrow-restore-button"', 'button')
  },
  {
    name: 'バックアップを書き出すボタン (L822, backup-export-button)',
    getOpeningTag: (html) => findOpeningTag(html, 'data-testid="backup-export-button"', 'button')
  },
  {
    name: '外部保存を記録ボタン (L839)',
    getOpeningTag: (html) => findButtonOpeningTagBySpanText(html, '外部保存を記録')
  },
  {
    name: '受領書を監査ログへ記録ボタン (L939)',
    getOpeningTag: (html) => findButtonOpeningTagBySpanText(html, '受領書を監査ログへ記録')
  },
  {
    name: 'CSVを変換してプレビューボタン (L993)',
    getOpeningTag: (html) => findButtonOpeningTagBySpanText(html, 'CSVを変換してプレビュー')
  },
  {
    name: 'バックアップを復旧するボタン (L1103)',
    getOpeningTag: (html) => findButtonOpeningTagBySpanText(html, 'バックアップを復旧する')
  }
];

describe('BackupSettingsTab contracts', () => {
  it('exports BackupSettingsTab as a callable React component function', () => {
    assert.equal(typeof BackupSettingsTab, 'function');
  });

  it('keeps backup management controls disabled only when canManageBackups is false', () => {
    const deniedHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({ canManageBackups: false })
    );
    const disabledDenied = listDisabledOpeningTags(deniedHtml);
    assert.equal(
      disabledDenied.length,
      13,
      `When canManageBackups is false, exactly 13 disabled opening tags must be present:\n${disabledDenied.join('\n')}`
    );

    const permittedHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({ canManageBackups: true })
    );
    const disabledPermitted = listDisabledOpeningTags(permittedHtml);
    assert.equal(
      disabledPermitted.length,
      0,
      `When canManageBackups is true and escrow inputs are filled, 0 disabled opening tags must be present:\n${disabledPermitted.join('\n')}`
    );

    const deniedExtractedTags = BACKUP_MANAGEMENT_CONTROL_SPECS.map((spec) => ({
      name: spec.name,
      tag: spec.getOpeningTag(deniedHtml)
    }));
    const permittedExtractedTags = BACKUP_MANAGEMENT_CONTROL_SPECS.map((spec) => ({
      name: spec.name,
      tag: spec.getOpeningTag(permittedHtml)
    }));

    assert.equal(deniedExtractedTags.length, 13);
    assert.equal(permittedExtractedTags.length, 13);

    const deniedTagsDiagnostic = deniedExtractedTags.map((item) => item.tag).join('\n');
    for (const item of deniedExtractedTags) {
      assert.ok(
        DISABLED_ATTR_PATTERN.test(item.tag),
        `Expected "${item.name}" to have disabled="" when canManageBackups is false:\n${item.tag}\nAll extracted tags:\n${deniedTagsDiagnostic}`
      );
    }

    const permittedTagsDiagnostic = permittedExtractedTags.map((item) => item.tag).join('\n');
    for (const item of permittedExtractedTags) {
      assert.ok(
        !DISABLED_ATTR_PATTERN.test(item.tag),
        `Expected "${item.name}" not to have disabled="" when canManageBackups is true:\n${item.tag}\nAll extracted tags:\n${permittedTagsDiagnostic}`
      );
    }
  });

  it('keeps the escrow buttons disabled while their inputs are empty even when permitted', () => {
    const permittedDefaultHtml = renderToStaticMarkup(
      React.createElement(
        BackupSettingsTab,
        createMockBackupSettingsProps({ canManageBackups: true })
      )
    );
    const disabledDefault = listDisabledOpeningTags(permittedDefaultHtml);
    assert.equal(
      disabledDefault.length,
      2,
      `When canManageBackups is true and escrow internal state is empty, exactly 2 disabled tags must remain:\n${disabledDefault.join('\n')}`
    );

    const issueButtonTag = findOpeningTag(
      permittedDefaultHtml,
      'data-testid="escrow-issue-button"',
      'button'
    );
    const restoreButtonTag = findOpeningTag(
      permittedDefaultHtml,
      'data-testid="escrow-restore-button"',
      'button'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(issueButtonTag),
      `Expected escrow-issue-button to be disabled when password input is empty:\n${issueButtonTag}\nAll disabled tags:\n${disabledDefault.join('\n')}`
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(restoreButtonTag),
      `Expected escrow-restore-button to be disabled when restore inputs are empty:\n${restoreButtonTag}\nAll disabled tags:\n${disabledDefault.join('\n')}`
    );
    assert.deepEqual(
      disabledDefault,
      [issueButtonTag, restoreButtonTag],
      `Disabled tags in permitted default render must be only escrow-issue-button and escrow-restore-button:\n${disabledDefault.join('\n')}`
    );
  });

  it('keeps file action buttons disabled with guidance titles when files are missing even when permitted', () => {
    // 1) externalBackupReceiptFile が未選択のとき: 受領書記録ボタンのみ無効かつ案内 title
    const missingReceiptHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        externalBackupReceiptFile: null
      })
    );
    const receiptTag = findButtonOpeningTagBySpanText(
      missingReceiptHtml,
      '受領書を監査ログへ記録'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(receiptTag),
      `Expected receipt button to be disabled when externalBackupReceiptFile is null:\n${receiptTag}`
    );
    assert.equal(
      extractTitleAttribute(receiptTag),
      '外部保存ジョブ受領書JSONを選択してください',
      `Expected receipt button to display selection guide title:\n${receiptTag}`
    );
    assert.deepEqual(
      listDisabledOpeningTags(missingReceiptHtml),
      [receiptTag],
      'Only receipt button should be disabled when externalBackupReceiptFile is null'
    );

    // 2) migrationCsvFile が未選択のとき: 移行CSVプレビューボタンのみ無効かつ案内 title
    const missingMigrationHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        migrationCsvFile: null
      })
    );
    const migrationTag = findButtonOpeningTagBySpanText(
      missingMigrationHtml,
      'CSVを変換してプレビュー'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(migrationTag),
      `Expected migration button to be disabled when migrationCsvFile is null:\n${migrationTag}`
    );
    assert.equal(
      extractTitleAttribute(migrationTag),
      'CSV/TSVを選択してください',
      `Expected migration button to display selection guide title:\n${migrationTag}`
    );
    assert.deepEqual(
      listDisabledOpeningTags(missingMigrationHtml),
      [migrationTag],
      'Only migration button should be disabled when migrationCsvFile is null'
    );

    // 3) backupFile が未選択のとき: 復旧ボタンのみ無効かつ案内 title
    const missingBackupHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        backupFile: null
      })
    );
    const restoreTag = findButtonOpeningTagBySpanText(
      missingBackupHtml,
      'バックアップを復旧する'
    );
    assert.ok(
      DISABLED_ATTR_PATTERN.test(restoreTag),
      `Expected restore button to be disabled when backupFile is null:\n${restoreTag}`
    );
    assert.equal(
      extractTitleAttribute(restoreTag),
      '復旧するJSONファイルを選択してください',
      `Expected restore button to display selection guide title:\n${restoreTag}`
    );
    assert.deepEqual(
      listDisabledOpeningTags(missingBackupHtml),
      [restoreTag],
      'Only restore button should be disabled when backupFile is null'
    );

    // 4) 3 つ全て未選択のとき: 3 つのボタンのみ無効
    const allFilesMissingHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        externalBackupReceiptFile: null,
        migrationCsvFile: null,
        backupFile: null
      })
    );
    const allMissingDisabled = listDisabledOpeningTags(allFilesMissingHtml);
    assert.equal(allMissingDisabled.length, 3);
    assert.ok(
      allMissingDisabled.some((t) => t.includes('外部保存ジョブ受領書JSONを選択してください')),
      `Expected disabled receipt button in allMissingDisabled:\n${allMissingDisabled.join('\n')}`
    );
    assert.ok(
      allMissingDisabled.some((t) => t.includes('CSV/TSVを選択してください')),
      `Expected disabled migration button in allMissingDisabled:\n${allMissingDisabled.join('\n')}`
    );
    assert.ok(
      allMissingDisabled.some((t) => t.includes('復旧するJSONファイルを選択してください')),
      `Expected disabled restore button in allMissingDisabled:\n${allMissingDisabled.join('\n')}`
    );
  });

  it('keeps controls disabled during in-flight operations even when permitted', () => {
    // 1) isSavingBackupSchedule
    const savingScheduleHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isSavingBackupSchedule: true
      })
    );
    const savingScheduleTag = findButtonOpeningTagBySpanText(savingScheduleHtml, '保存中...');
    assert.ok(DISABLED_ATTR_PATTERN.test(savingScheduleTag));
    assert.deepEqual(listDisabledOpeningTags(savingScheduleHtml), [savingScheduleTag]);

    // 2) isScanningPatientDuplicates
    const scanningDuplicatesHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isScanningPatientDuplicates: true
      })
    );
    const scanningTag = findOpeningTag(
      scanningDuplicatesHtml,
      'data-testid="patient-duplicate-scan-button"',
      'button'
    );
    assert.ok(DISABLED_ATTR_PATTERN.test(scanningTag));
    assert.deepEqual(listDisabledOpeningTags(scanningDuplicatesHtml), [scanningTag]);

    // 3) isApplyingDuplicateMerge
    const applyingMergeHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isApplyingDuplicateMerge: true
      })
    );
    const mergeTag = findOpeningTag(applyingMergeHtml, 'btn-duplicate-review', 'button');
    assert.ok(DISABLED_ATTR_PATTERN.test(mergeTag));

    // 4) isExportingBackupGenerationReview
    const exportingGenHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isExportingBackupGenerationReview: true
      })
    );
    const genTag = findOpeningTag(exportingGenHtml, 'btn-generation-csv', 'button');
    assert.ok(DISABLED_ATTR_PATTERN.test(genTag));
    assert.deepEqual(listDisabledOpeningTags(exportingGenHtml), [genTag]);

    // 5) isGeneratingEscrow (React.useState call #2)
    const generatingEscrowHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({ canManageBackups: true }),
      { 2: true }
    );
    const issueInput = findOpeningTag(
      generatingEscrowHtml,
      'data-testid="escrow-issue-password-input"',
      'input'
    );
    const issueBtn = findOpeningTag(
      generatingEscrowHtml,
      'data-testid="escrow-issue-button"',
      'button'
    );
    assert.ok(DISABLED_ATTR_PATTERN.test(issueInput));
    assert.ok(DISABLED_ATTR_PATTERN.test(issueBtn));
    assert.deepEqual(listDisabledOpeningTags(generatingEscrowHtml), [issueInput, issueBtn]);

    // 6) isRestoringEscrow (React.useState call #7)
    const restoringEscrowHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({ canManageBackups: true }),
      { 7: true }
    );
    const restoreInput = findOpeningTag(
      restoringEscrowHtml,
      'data-testid="escrow-restore-password-input"',
      'input'
    );
    const restoreEscrowBtn = findOpeningTag(
      restoringEscrowHtml,
      'data-testid="escrow-restore-button"',
      'button'
    );
    assert.ok(DISABLED_ATTR_PATTERN.test(restoreInput));
    assert.ok(DISABLED_ATTR_PATTERN.test(restoreEscrowBtn));
    assert.deepEqual(listDisabledOpeningTags(restoringEscrowHtml), [restoreInput, restoreEscrowBtn]);

    // 7) isExportingBackup
    const exportingBackupHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isExportingBackup: true
      })
    );
    const exportBtn = findOpeningTag(
      exportingBackupHtml,
      'data-testid="backup-export-button"',
      'button'
    );
    assert.ok(DISABLED_ATTR_PATTERN.test(exportBtn));
    assert.deepEqual(listDisabledOpeningTags(exportingBackupHtml), [exportBtn]);

    // 8) isRecordingExternalBackupStorage
    const recordingStorageHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isRecordingExternalBackupStorage: true
      })
    );
    const storageTag = findButtonOpeningTagBySpanText(recordingStorageHtml, '記録中...');
    assert.ok(DISABLED_ATTR_PATTERN.test(storageTag));
    assert.deepEqual(listDisabledOpeningTags(recordingStorageHtml), [storageTag]);

    // 9) isRecordingExternalBackupReceipt
    const recordingReceiptHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isRecordingExternalBackupReceipt: true
      })
    );
    const receiptInput = findOpeningTag(
      recordingReceiptHtml,
      'aria-label="外部保存ジョブ受領書JSONを選択"',
      'input'
    );
    const receiptTag = findButtonOpeningTagBySpanText(recordingReceiptHtml, '受領書を記録中...');
    assert.ok(DISABLED_ATTR_PATTERN.test(receiptInput));
    assert.ok(DISABLED_ATTR_PATTERN.test(receiptTag));
    assert.deepEqual(listDisabledOpeningTags(recordingReceiptHtml), [receiptInput, receiptTag]);

    // 10) isAnalyzingMigrationCsv
    const analyzingMigrationHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isAnalyzingMigrationCsv: true
      })
    );
    const migrationBtn = findButtonOpeningTagBySpanText(analyzingMigrationHtml, '解析中...');
    assert.ok(DISABLED_ATTR_PATTERN.test(migrationBtn));

    // 11) isImportingBackup
    const importingBackupHtml = renderWithEscrowInputsFilled(
      createMockBackupSettingsProps({
        canManageBackups: true,
        isImportingBackup: true
      })
    );
    const restoreBackupBtn = findButtonOpeningTagBySpanText(importingBackupHtml, 'バックアップを復旧する');
    assert.ok(DISABLED_ATTR_PATTERN.test(restoreBackupBtn));
    assert.deepEqual(listDisabledOpeningTags(importingBackupHtml), [restoreBackupBtn]);
  });
});
