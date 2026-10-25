import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  listDisabledOpeningTags,
  listDataDisabledOpeningTags,
  findOpeningTag
} from '@/lib/test_support/html_disabled_tags';
import DrugMasterSettingsTab from '@/components/settings/DrugMasterSettingsTab';
import type { User } from '@/db/types';
import type {
  DrugDuplicateScanReport,
  DrugDuplicateGroup
} from '@/lib/drug_duplicate_review';
import type {
  DrugPriceHistoryDraftRow,
  DrugPriceHistoryEditPlan
} from '@/lib/drug_price_history_edit';

function createMockDrugMasterSettingsProps(overrides: Record<string, unknown> = {}) {
  const dummyUser: User = {
    userId: 'user-pharmacist-1',
    name: 'テスト薬剤師',
    role: 'pharmacist'
  };

  return {
    currentUser: dummyUser,
    canUpdateDrugMaster: true,
    isMedicalInstSyncOpen: false,
    setIsMedicalInstSyncOpen: () => {},
    handleFileChange: () => {},
    isUploading: false,
    isImportingDrugMasterFromUrl: false,
    file: null,
    drugMasterSourceUrl: '',
    setDrugMasterSourceUrl: () => {},
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
    drugMergeReview: null,
    handleApplyDrugMerge: async () => {},
    ...overrides
  };
}

describe('DrugMasterSettingsTab contracts and renderToStaticMarkup', () => {
  it('exports DrugMasterSettingsTab as a callable React component function', () => {
    assert.equal(typeof DrugMasterSettingsTab, 'function');
  });

  it('renders sections and buttons when user has update_drug_master permission', () => {
    const props = createMockDrugMasterSettingsProps({ canUpdateDrugMaster: true });
    const html = renderToStaticMarkup(React.createElement(DrugMasterSettingsTab, props as any));

    assert.ok(html.includes('公式医療機関マスタ同期'), 'Should render medical inst sync section');
    assert.ok(html.includes('医薬品マスタ更新'), 'Should render drug master upload section');
    assert.ok(html.includes('薬品重複点検（マスタ統合）'), 'Should render drug duplicate scan section');
    assert.ok(html.includes('薬価の版の訂正'), 'Should render price revision section');
    assert.ok(html.includes('重複候補を確認'), 'Scan duplicate button should be present');
    assert.ok(html.includes('data-testid="drug-duplicate-scan-button"'), 'Scan button should have data-testid');
  });

  it('disables mutation controls with permission denied tooltips when canUpdateDrugMaster is false', () => {
    const clerkUser: User = {
      userId: 'user-clerk-1',
      name: '事務 太郎',
      role: 'clerk'
    };
    const props = createMockDrugMasterSettingsProps({
      currentUser: clerkUser,
      canUpdateDrugMaster: false
    });
    const html = renderToStaticMarkup(React.createElement(DrugMasterSettingsTab, props as any));

    // canUpdateDrugMaster: false 時は 6 個（true 時は未選択・状態起因の 3 個）が無効化（マスタ取込・URL取込・ロールバック・重複点検・薬価改定など）
    const disabledTags = listDisabledOpeningTags(html);
    assert.equal(
      disabledTags.length,
      6,
      `Action controls must be disabled when canUpdateDrugMaster is false:\n${disabledTags.join('\n')}`
    );
    const htmlPermitted = renderToStaticMarkup(
      React.createElement(
        DrugMasterSettingsTab,
        createMockDrugMasterSettingsProps({ currentUser: clerkUser, canUpdateDrugMaster: true }) as any
      )
    );
    const permittedDisabledTags = listDisabledOpeningTags(htmlPermitted);
    assert.equal(
      permittedDisabledTags.length,
      3,
      `Action controls must have 3 disabled elements when canUpdateDrugMaster is true:\n${permittedDisabledTags.join('\n')}`
    );

    // data-disabled="true": false 時は 3 個（権限不足ツールチップラッパー）、true 時も未選択・状態起因の 3 個
    const dataDisabledTags = listDataDisabledOpeningTags(html);
    assert.equal(
      dataDisabledTags.length,
      3,
      `Tooltip wrappers must have 3 data-disabled="true" when canUpdateDrugMaster is false:\n${dataDisabledTags.join('\n')}`
    );
    assert.ok(
      dataDisabledTags.every((tag) => tag.includes('「医薬品マスタ更新」の権限がありません')),
      'All 3 data-disabled wrappers must explain permission denied'
    );
    const permittedDataDisabledTags = listDataDisabledOpeningTags(htmlPermitted);
    assert.equal(
      permittedDataDisabledTags.length,
      3,
      `Tooltip wrappers must have 3 state-disabled data-disabled="true" when canUpdateDrugMaster is true:\n${permittedDataDisabledTags.join('\n')}`
    );
    assert.ok(html.includes('事務 太郎（事務）には「医薬品マスタ更新」の権限がありません'), 'Permission denied notice should be rendered');
  });

  it('keeps action controls and tooltip wrappers disabled only when permission is denied once file conditions are met', () => {
    const clerkUser: User = {
      userId: 'user-clerk-1',
      name: '事務 太郎',
      role: 'clerk'
    };
    const readyProps = {
      currentUser: clerkUser,
      canImportDrugMasterFromSourceUrl: true,
      file: { name: 'master.csv' },
      rollbackFile: { name: 'rollback.json' }
    };

    const deniedProps = createMockDrugMasterSettingsProps({
      ...readyProps,
      canUpdateDrugMaster: false
    });
    const htmlDenied = renderToStaticMarkup(React.createElement(DrugMasterSettingsTab, deniedProps as any));

    // 権限なしの 6 個はアップロード・URL取込・ロールバック・重複点検・薬価の版を直す薬品を検索（drug-price-history-query）・検索ボタン、data-disabled の 3 個は取込・アップロード・ロールバックのラッパー
    const disabledTagsDenied = listDisabledOpeningTags(htmlDenied);
    assert.equal(
      disabledTagsDenied.length,
      6,
      `Action controls must have 6 disabled elements when canUpdateDrugMaster is false:\n${disabledTagsDenied.join('\n')}`
    );

    const dataDisabledTagsDenied = listDataDisabledOpeningTags(htmlDenied);
    assert.equal(
      dataDisabledTagsDenied.length,
      3,
      `Tooltip wrappers must have 3 data-disabled="true" elements when canUpdateDrugMaster is false:\n${dataDisabledTagsDenied.join('\n')}`
    );

    const permittedProps = createMockDrugMasterSettingsProps({
      ...readyProps,
      canUpdateDrugMaster: true
    });
    const htmlPermitted = renderToStaticMarkup(React.createElement(DrugMasterSettingsTab, permittedProps as any));

    // 状態条件を満たしているため、権限あり時は disabled なコントロールと data-disabled なラッパーが 0 個になる
    const disabledTagsPermitted = listDisabledOpeningTags(htmlPermitted);
    assert.equal(
      disabledTagsPermitted.length,
      0,
      `Action controls must have 0 disabled elements when canUpdateDrugMaster is true:\n${disabledTagsPermitted.join('\n')}`
    );

    const dataDisabledTagsPermitted = listDataDisabledOpeningTags(htmlPermitted);
    assert.equal(
      dataDisabledTagsPermitted.length,
      0,
      `Tooltip wrappers must have 0 data-disabled="true" elements when canUpdateDrugMaster is true:\n${dataDisabledTagsPermitted.join('\n')}`
    );
  });

  it('renders duplicate groups, merge candidate selectors, and conflict warnings when report is present', () => {
    const mockGroup: DrugDuplicateGroup = {
      groupId: 'dup-group-amlo',
      matchType: 'name',
      matchLabel: '薬品名が一致',
      displayName: 'アムロジピン錠5mg',
      hasYjConflict: false,
      members: [
        {
          code: '612340001',
          name: 'アムロジピン錠5mg「タカタ」',
          yjCode: '2171022F1020',
          price: 10.1,
          location: 'A-1',
          isAbolished: false,
          stockQuantity: 100,
          stockLotCount: 2,
          prescriptionItemCount: 15
        },
        {
          code: '612340002',
          name: 'アムロジピン錠5mg「タカタ」旧規格',
          yjCode: '2171022F1020',
          price: 10.1,
          location: 'A-2',
          isAbolished: true,
          stockQuantity: 0,
          stockLotCount: 0,
          prescriptionItemCount: 2
        }
      ],
      suggestedTargetCode: '612340001'
    };

    const mockReport: DrugDuplicateScanReport = {
      scannedDrugCount: 2500,
      duplicateDrugCount: 2,
      inactiveGroupCount: 0,
      groups: [mockGroup]
    };

    const props = createMockDrugMasterSettingsProps({
      canUpdateDrugMaster: true,
      drugDuplicateReport: mockReport,
      drugMergeTargets: { 'dup-group-amlo': '612340001' }
    });

    const html = renderToStaticMarkup(React.createElement(DrugMasterSettingsTab, props as any));

    assert.ok(html.includes('class="duplicate-groups-grid"'), 'Duplicate grid container should be rendered');
    assert.ok(html.includes('アムロジピン錠5mg'), 'Display name should be displayed');
    assert.ok(html.includes('薬品名が一致'), 'Match label should be displayed');
    assert.ok(html.includes('アムロジピン錠5mg「タカタ」'), 'Drug record name should be displayed');
    assert.ok(html.includes('統合確認'), 'Merge review button should be rendered');
  });

  it('renders drug price revision history draft editor when priceHistoryDrug and plan are selected', () => {
    const mockDrug = {
      code: '612340001',
      name: 'アムロジピン錠5mg',
      price: 10.1
    };

    const mockDraft: DrugPriceHistoryDraftRow[] = [
      {
        effectiveFrom: '2024-04-01',
        price: '10.5'
      },
      {
        effectiveFrom: '2026-04-01',
        price: '10.1'
      }
    ];

    const mockPlan: DrugPriceHistoryEditPlan = {
      drugCode: '612340001',
      drugName: 'アムロジピン錠5mg',
      before: [],
      after: [
        { price: 10.5, effectiveFrom: '2024-04-01' },
        { price: 10.1, effectiveFrom: '2026-04-01' }
      ],
      beforeCurrentPrice: 10.5,
      afterCurrentPrice: 10.1,
      issues: [],
      changed: true,
      canApply: true,
      impact: [],
      submittedCount: 0,
      summary: '価格改定履歴が 2 件設定されています。'
    };

    const props = createMockDrugMasterSettingsProps({
      canUpdateDrugMaster: true,
      priceHistoryDrug: mockDrug,
      priceHistoryDraft: mockDraft,
      drugPriceHistoryPlan: mockPlan
    });

    const html = renderToStaticMarkup(React.createElement(DrugMasterSettingsTab, props as any));

    assert.ok(html.includes('data-testid="drug-price-history-editor"'), 'Editor container should be rendered');
    assert.ok(html.includes('アムロジピン錠5mg'), 'Drug name should be rendered in history editor');
    assert.ok(html.includes('612340001'), 'Drug code should be rendered in history editor');
    assert.ok(html.includes('2024-04-01'), 'Draft effectiveFrom date should be rendered');
    assert.ok(html.includes('10.5'), 'Draft price value should be rendered');
    assert.ok(html.includes('版を追加'), 'Add history row button should be rendered');
    assert.ok(html.includes('data-testid="drug-price-history-add-row"'), 'Add row button should have data-testid');
    assert.ok(html.includes('薬価の版を訂正'), 'Apply revision button should be rendered');
  });

  it('keeps conditionally rendered controls disabled only when permission is denied', () => {
    const clerkUser: User = {
      userId: 'user-clerk-1',
      name: '事務 太郎',
      role: 'clerk'
    };
    const readyProps = {
      currentUser: clerkUser,
      canImportDrugMasterFromSourceUrl: true,
      file: { name: 'master.csv' },
      rollbackFile: { name: 'rollback.json' }
    };

    const mockGroup: DrugDuplicateGroup = {
      groupId: 'dup-group-amlo',
      matchType: 'name',
      matchLabel: '薬品名が一致',
      displayName: 'アムロジピン錠5mg',
      hasYjConflict: false,
      members: [
        {
          code: '612340001',
          name: 'アムロジピン錠5mg「タカタ」',
          yjCode: '2171022F1020',
          price: 10.1,
          location: 'A-1',
          isAbolished: false,
          stockQuantity: 100,
          stockLotCount: 2,
          prescriptionItemCount: 15
        },
        {
          code: '612340002',
          name: 'アムロジピン錠5mg「タカタ」旧規格',
          yjCode: '2171022F1020',
          price: 10.1,
          location: 'A-2',
          isAbolished: true,
          stockQuantity: 0,
          stockLotCount: 0,
          prescriptionItemCount: 2
        }
      ],
      suggestedTargetCode: '612340001'
    };

    const mockReport: DrugDuplicateScanReport = {
      scannedDrugCount: 2500,
      duplicateDrugCount: 2,
      inactiveGroupCount: 0,
      groups: [mockGroup]
    };

    const mockDrug = {
      code: '612340001',
      name: 'アムロジピン錠5mg',
      price: 10.1
    };

    const mockDraft: DrugPriceHistoryDraftRow[] = [
      {
        effectiveFrom: '2024-04-01',
        price: '10.5'
      },
      {
        effectiveFrom: '2026-04-01',
        price: '10.1'
      }
    ];

    const mockPlan: DrugPriceHistoryEditPlan = {
      drugCode: '612340001',
      drugName: 'アムロジピン錠5mg',
      before: [],
      after: [
        { price: 10.5, effectiveFrom: '2024-04-01' },
        { price: 10.1, effectiveFrom: '2026-04-01' }
      ],
      beforeCurrentPrice: 10.5,
      afterCurrentPrice: 10.1,
      issues: [],
      changed: true,
      canApply: true,
      impact: [],
      submittedCount: 0,
      summary: '価格改定履歴が 2 件設定されています。'
    };

    const conditionalProps = {
      ...readyProps,
      drugDuplicateReport: mockReport,
      drugMergeTargets: { 'dup-group-amlo': '612340001' },
      priceHistoryDrug: mockDrug,
      priceHistoryDraft: mockDraft,
      drugPriceHistoryPlan: mockPlan
    };

    const deniedProps = createMockDrugMasterSettingsProps({
      ...conditionalProps,
      canUpdateDrugMaster: false
    });
    const htmlDenied = renderToStaticMarkup(React.createElement(DrugMasterSettingsTab, deniedProps as any));

    // 権限なし時の disabled="" 16個の根拠（DrugMasterSettingsTab.tsx の該当行から）:
    // 1. URL取込ボタン（372行目）
    // 2. アップロード実行ボタン（391行目）
    // 3. ロールバック実行ボタン（444行目）
    // 4. 重複点検ボタン（469行目、重複候補を確認）
    // 5. 統合確認ボタン（519行目、btn-merge-review）
    // 6. 価格履歴の検索入力（593行目、薬価の版を直す薬品を検索、drug-price-history-query）
    // 7. 価格履歴の検索ボタン（599行目、検索、drug-price-history-search）
    // 8. 1行目の薬価（666行目、drug-price-history-price-0）
    // 9. 2行目の薬価（666行目、drug-price-history-price-1）
    // 10. 1行目の適用開始日（677行目、drug-price-history-date-0）
    // 11. 2行目の適用開始日（677行目、drug-price-history-date-1）
    // 12. 1行目の版を削除（687行目、drug-price-history-remove-0）
    // 13. 2行目の版を削除（687行目、drug-price-history-remove-1）
    // 14. 版を追加（702行目、drug-price-history-add-row）
    // 15. 編集前に戻す（711行目、button）
    // 16. 薬価の版を訂正（765行目、drug-price-history-apply）
    // data-disabled="true" 3個の根拠:
    // 1. URL取込ツールチップラッパー（358行目、span）
    // 2. アップロードツールチップラッパー（385行目、span）
    // 3. ロールバックツールチップラッパー（438行目、span）
    const disabledTagsDenied = listDisabledOpeningTags(htmlDenied);
    assert.equal(
      disabledTagsDenied.length,
      16,
      `Action controls must have 16 disabled elements when canUpdateDrugMaster is false:\n${disabledTagsDenied.join('\n')}`
    );

    const dataDisabledTagsDenied = listDataDisabledOpeningTags(htmlDenied);
    assert.equal(
      dataDisabledTagsDenied.length,
      3,
      `Tooltip wrappers must have 3 data-disabled="true" elements when canUpdateDrugMaster is false:\n${dataDisabledTagsDenied.join('\n')}`
    );

    const permittedProps = createMockDrugMasterSettingsProps({
      ...conditionalProps,
      canUpdateDrugMaster: true
    });
    const htmlPermitted = renderToStaticMarkup(React.createElement(DrugMasterSettingsTab, permittedProps as any));

    // 状態条件を満たしているため、権限あり時は disabled なコントロールと data-disabled なラッパーが 0 個になる
    const disabledTagsPermitted = listDisabledOpeningTags(htmlPermitted);
    assert.equal(
      disabledTagsPermitted.length,
      0,
      `Action controls must have 0 disabled elements when canUpdateDrugMaster is true:\n${disabledTagsPermitted.join('\n')}`
    );

    const dataDisabledTagsPermitted = listDataDisabledOpeningTags(htmlPermitted);
    assert.equal(
      dataDisabledTagsPermitted.length,
      0,
      `Tooltip wrappers must have 0 data-disabled="true" elements when canUpdateDrugMaster is true:\n${dataDisabledTagsPermitted.join('\n')}`
    );

    // 権限あり側で 9 個の要素が実際に描画され、disabled="" を持たないことを検証
    const btnMergeReviewPermitted = findOpeningTag(htmlPermitted, 'btn-merge-review', 'button');
    assert.ok(!btnMergeReviewPermitted.includes('disabled=""'), 'Merge review button must be enabled when permitted');

    const price0Permitted = findOpeningTag(htmlPermitted, 'data-testid="drug-price-history-price-0"', 'input');
    assert.ok(!price0Permitted.includes('disabled=""'), 'Price row 0 input must be enabled when permitted');

    const price1Permitted = findOpeningTag(htmlPermitted, 'data-testid="drug-price-history-price-1"', 'input');
    assert.ok(!price1Permitted.includes('disabled=""'), 'Price row 1 input must be enabled when permitted');

    const date0Permitted = findOpeningTag(htmlPermitted, 'data-testid="drug-price-history-date-0"', 'input');
    assert.ok(!date0Permitted.includes('disabled=""'), 'Date row 0 input must be enabled when permitted');

    const date1Permitted = findOpeningTag(htmlPermitted, 'data-testid="drug-price-history-date-1"', 'input');
    assert.ok(!date1Permitted.includes('disabled=""'), 'Date row 1 input must be enabled when permitted');

    const remove0Permitted = findOpeningTag(htmlPermitted, 'data-testid="drug-price-history-remove-0"', 'button');
    assert.ok(!remove0Permitted.includes('disabled=""'), 'Remove row 0 button must be enabled when permitted');

    const remove1Permitted = findOpeningTag(htmlPermitted, 'data-testid="drug-price-history-remove-1"', 'button');
    assert.ok(!remove1Permitted.includes('disabled=""'), 'Remove row 1 button must be enabled when permitted');

    const addRowPermitted = findOpeningTag(htmlPermitted, 'data-testid="drug-price-history-add-row"', 'button');
    assert.ok(!addRowPermitted.includes('disabled=""'), 'Add row button must be enabled when permitted');

    const applyPermitted = findOpeningTag(htmlPermitted, 'data-testid="drug-price-history-apply"', 'button');
    assert.ok(!applyPermitted.includes('disabled=""'), 'Apply price history button must be enabled when permitted');

    // 権限なし側でも同じ 9 個の開始タグが disabled="" を持つことを検証
    const btnMergeReviewDenied = findOpeningTag(htmlDenied, 'btn-merge-review', 'button');
    assert.ok(btnMergeReviewDenied.includes('disabled=""'), 'Merge review button must be disabled when denied');

    const price0Denied = findOpeningTag(htmlDenied, 'data-testid="drug-price-history-price-0"', 'input');
    assert.ok(price0Denied.includes('disabled=""'), 'Price row 0 input must be disabled when denied');

    const price1Denied = findOpeningTag(htmlDenied, 'data-testid="drug-price-history-price-1"', 'input');
    assert.ok(price1Denied.includes('disabled=""'), 'Price row 1 input must be disabled when denied');

    const date0Denied = findOpeningTag(htmlDenied, 'data-testid="drug-price-history-date-0"', 'input');
    assert.ok(date0Denied.includes('disabled=""'), 'Date row 0 input must be disabled when denied');

    const date1Denied = findOpeningTag(htmlDenied, 'data-testid="drug-price-history-date-1"', 'input');
    assert.ok(date1Denied.includes('disabled=""'), 'Date row 1 input must be disabled when denied');

    const remove0Denied = findOpeningTag(htmlDenied, 'data-testid="drug-price-history-remove-0"', 'button');
    assert.ok(remove0Denied.includes('disabled=""'), 'Remove row 0 button must be disabled when denied');

    const remove1Denied = findOpeningTag(htmlDenied, 'data-testid="drug-price-history-remove-1"', 'button');
    assert.ok(remove1Denied.includes('disabled=""'), 'Remove row 1 button must be disabled when denied');

    const addRowDenied = findOpeningTag(htmlDenied, 'data-testid="drug-price-history-add-row"', 'button');
    assert.ok(addRowDenied.includes('disabled=""'), 'Add row button must be disabled when denied');

    const applyDenied = findOpeningTag(htmlDenied, 'data-testid="drug-price-history-apply"', 'button');
    assert.ok(applyDenied.includes('disabled=""'), 'Apply price history button must be disabled when denied');
  });
});
