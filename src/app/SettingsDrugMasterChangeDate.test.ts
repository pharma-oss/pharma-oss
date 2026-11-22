import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DrugMasterSettingsTab from '@/components/settings/DrugMasterSettingsTab';
import { DRUG_MASTER_SPECIFICATION_COLUMNS } from '@/lib/drug_master_csv';
import {
  formatDrugMasterVintageBanner,
  reviewDrugMasterVintage
} from '@/lib/drug_price_history';
import type { User } from '@/db/types';

const ADMIN_USER: User = {
  userId: 'u-admin-c2',
  name: '管理者 テスト',
  role: 'admin',
  passwordHash: 'hash'
};

function baseTabProps(overrides: Partial<React.ComponentProps<typeof DrugMasterSettingsTab>> = {}): React.ComponentProps<typeof DrugMasterSettingsTab> {
  return {
    currentUser: ADMIN_USER,
    canUpdateDrugMaster: true,
    isMedicalInstSyncOpen: false,
    setIsMedicalInstSyncOpen: () => {},
    handleFileChange: () => {},
    isUploading: false,
    isImportingDrugMasterFromUrl: false,
    file: null,
    drugMasterSourceUrl: '',
    setDrugMasterSourceUrl: () => {},
    priceRevisionEffectiveDateOverride: '',
    setPriceRevisionEffectiveDateOverride: () => {},
    lastMasterVintageWarning: '',
    handleFetchDrugMasterOfficialPage: async () => {},
    isFetchingDrugMasterOfficialPage: false,
    drugMasterOfficialPageHtml: '',
    setDrugMasterOfficialPageHtml: () => {},
    handleExtractDrugMasterCandidates: () => {},
    drugMasterCandidateMessage: '',
    drugMasterCandidates: [],
    handleSelectDrugMasterCandidate: () => {},
    drugMasterSpecPdfText: '',
    setDrugMasterSpecPdfText: () => {},
    setDrugMasterSpecPdfReview: () => {},
    setDrugMasterSpecPdfReviewLabel: () => {},
    isFetchingDrugMasterSpecPdf: false,
    handleFetchDrugMasterSpecPdf: async () => {},
    handleReviewDrugMasterSpecPdfText: () => {},
    drugMasterSpecPdfReviewLabel: '',
    drugMasterSpecPdfReview: null,
    canImportDrugMasterFromSourceUrl: false,
    handleImportDrugMasterFromSourceUrl: async () => {},
    handleUpload: async () => {},
    rollbackFile: null,
    handleDrugMasterRollbackFileChange: () => {},
    isRollingBackDrugMaster: false,
    handleApplyDrugMasterRollback: async () => {},
    handleScanDrugDuplicates: async () => {},
    isScanningDrugDuplicates: false,
    drugDuplicateMessage: '',
    drugDuplicateReport: null,
    drugMergeTargets: {},
    setDrugMergeTargets: () => {},
    setDrugMergeReview: () => {},
    openDrugMergeReview: async () => {},
    isApplyingDrugMerge: false,
    drugMergeReview: null,
    handleApplyDrugMerge: async () => {},
    priceHistoryQuery: '',
    setPriceHistoryQuery: () => {},
    handleSearchDrugForPriceHistory: async () => {},
    priceHistoryCandidates: [],
    handleSelectDrugForPriceHistory: async () => {},
    closeDrugPriceHistoryEditor: () => {},
    priceHistoryDrug: null,
    priceHistoryDraft: [],
    updateDrugPriceHistoryRow: () => {},
    addDrugPriceHistoryRow: () => {},
    removeDrugPriceHistoryRow: () => {},
    resetDrugPriceHistoryDraft: () => {},
    drugPriceHistoryPlan: null,
    priceHistoryMessage: '',
    isLoadingPriceHistory: false,
    isApplyingPriceHistory: false,
    handleApplyDrugPriceHistoryEdit: async () => {},
    ...overrides
  };
}

test('SSK drug master specification column #30 documents non-price update semantics', () => {
  const item30 = DRUG_MASTER_SPECIFICATION_COLUMNS.find((col) => col.itemNumber === 30);
  assert.ok(item30);
  assert.equal(item30.label, '変更年月日');
  assert.match(item30.note || '', /薬価適用開始日専用ではない/);
  assert.match(item30.note || '', /名称/);
});

test('DrugMasterSettingsTab renders explicit price revision effective-date override input and Field #30 guidance', () => {
  const html = renderToStaticMarkup(
    React.createElement(DrugMasterSettingsTab, baseTabProps({
      priceRevisionEffectiveDateOverride: '2026-06-01'
    }))
  );

  assert.match(html, /data-testid="drug-master-price-effective-override"/);
  assert.match(html, /value="2026-06-01"/);
  assert.match(html, /項番30「変更年月日」/);
  assert.doesNotMatch(html, /data-testid="drug-master-vintage-warning"/);
});

test('DrugMasterSettingsTab renders persistent warning banner when an older master was imported', () => {
  const vintage = reviewDrugMasterVintage({
    changeDates: ['2025-07-01'],
    storedRevisionDates: ['2026-04-01'],
    explicitOverrideDate: '2025-04-01'
  });
  const warning = formatDrugMasterVintageBanner({
    review: vintage,
    skippedCount: 12,
    attributesKeptStored: 5
  });
  assert.ok(warning);

  const html = renderToStaticMarkup(
    React.createElement(DrugMasterSettingsTab, baseTabProps({
      lastMasterVintageWarning: warning
    }))
  );

  assert.match(html, /data-testid="drug-master-vintage-warning"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /明示適用日 2025-04-01/);
  assert.match(html, /12件/);
});
