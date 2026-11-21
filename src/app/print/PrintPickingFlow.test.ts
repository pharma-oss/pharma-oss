import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { FacilitySettings, Patient, PharmacyDatabase, Visit } from '@/db/types';
import type { CalculationResultItem } from '@/lib/calculator';
import type { DispensingUkeItem } from '@/lib/receipt/dispensing_uke';
import { buildPrescriptionInputAudit } from '@/lib/prescription_input_audit';
import {
  buildAiSuggestionsFromPrescriptionAudit,
  formatAiSuggestionConfidence,
  summarizeAiSuggestions
} from '@/lib/ai_suggestion';
import { filterAiAssistItemsByMode } from '@/lib/ai_assist_policy';
import {
  OFFICIAL_CLAIM_RETURN_REASONS,
  buildReturnCorrectionSummary,
  formatClaimReturnReasonLabel,
  getClaimReturnReasonByCode
} from '@/lib/claim_return_manager';
import {
  markClaimClosed,
  markClaimExported,
  markClaimRebilling,
  markClaimReturned,
  isClaimLifecycleLocked,
  getClaimLifecycleStatus
} from '@/lib/claim_lifecycle';
import {
  buildClaimExportSnapshot,
  buildClaimReturnCorrectionAction,
  buildClaimReturnCorrectionHandoffMemo,
  buildClaimReturnCorrectionSuggestions,
  buildClaimSnapshotDifferenceCsv,
  compareClaimExportSnapshotToCurrent,
  makeClaimSnapshotDifferenceCsvFileName
} from '@/lib/claim_snapshot';
import {
  requiresElectronicPrescriptionDispensingHpkiSignature,
  validateElectronicPrescriptionLifecycleOperation
} from '@/lib/electronic_prescription';
import { buildElectronicPrescriptionDispensingResultPayload } from '@/hooks/usePrintElectronicPrescription';
import {
  evaluateActiveVisitEditability,
  parseEmrLocationSearch
} from '../emr/emr_route_guards';
import {
  CLAIM_ACTION_MESSAGES,
  applyClaimOptionsWithAudit,
  applyDrugPriceOverrideWithAudit,
  applyItemClaimFlagWithAudit,
  buildReceiptReissueAuditDetail,
  changeClaimConditions,
  persistClaimLifecycleWithAudit,
  persistClaimOptions,
  printDocumentsWithAuditLog
} from './claim_actions';
import {
  buildPrintInterventionUrl,
  buildPrintPickingSupportUrl,
  buildPrintReceiptBarcodeState,
  calculatePatientAge,
  formatPrescriptionAuditIssues,
  getClaimItemFlagValue,
  getPatientIdentityMark,
  runPrintWithBodyClass,
  stableHashText
} from './helpers';
import { PATIENT_IDENTITY_MARKS, type PharmacyInfo, type PrintPrescriptionItem } from './types';
import { PrintHeaderActions } from './components/PrintHeaderActions';
import { ClaimLifecyclePanel } from './components/ClaimLifecyclePanel';
import { PharmacistCheckPanel } from './components/PharmacistCheckPanel';
import { ClaimCheckPanel } from './components/ClaimCheckPanel';
import { DispensingRecordPrint } from './components/DispensingRecordPrint';
import { ElectronicPrescriptionPrintPanel } from './components/ElectronicPrescriptionPrintPanel';
import { SingleOfficialUkeModal } from './components/SingleOfficialUkeModal';
import { ReceiptStatementPrint } from './components/ReceiptStatementPrint';
import { DrugInfoPrint } from './components/DrugInfoPrint';
import { MedicineBagPrint } from './components/MedicineBagPrint';
import { ReceiptPrint } from './components/ReceiptPrint';
import { MedicineNotebookStickerPrint } from './components/MedicineNotebookStickerPrint';
import { LiquidLabelSheetPrint } from './components/LiquidLabelSheetPrint';
import { OintmentLabelSheetPrint } from './components/OintmentLabelSheetPrint';
import { EmergencyRecoveryKeySheetPrint } from './components/EmergencyRecoveryKeySheetPrint';
import { PharmacyDeviceHandoffPanel } from './components/PharmacyDeviceHandoffPanel';
import { findOpeningTag } from '@/lib/test_support/html_disabled_tags';

const MOCK_PHARMACY_INFO: PharmacyInfo = {
  name: 'テスト調剤薬局',
  code: '1312345',
  postalCode: '100-0001',
  address: '東京都千代田区',
  phone: '03-1234-5678',
  registrationNumber: 'T1234567890123',
  pharmacistName: 'テスト 薬剤師'
};

function makeFakeVisitDb(initialVisit: Partial<Visit>) {
  let state: Record<string, unknown> = structuredClone(initialVisit);
  const visitDoc = {
    toJSON: () => structuredClone(state),
    patch: async (patch: Record<string, unknown>) => {
      state = { ...state, ...patch };
    }
  };
  const db = {
    visits: {
      findOne: () => ({
        exec: async () => visitDoc
      })
    }
  } as unknown as PharmacyDatabase;
  return { db, getState: () => state };
}

test('print page exposes a direct route to picking support for the current visit', () => {
  const url = buildPrintPickingSupportUrl('visit/2026 01');
  assert.equal(url, '/emr?visitId=visit%2F2026%2001&openPicking=1');

  const parsed = parseEmrLocationSearch(url.slice(url.indexOf('?')));
  assert.equal(parsed.visitId, 'visit/2026 01');
  assert.equal(parsed.openPicking, true);
  assert.equal(parsed.openIntervention, false);

  const headerHtml = renderToStaticMarkup(
    React.createElement(PrintHeaderActions, {
      canExportUke: true,
      canPrintDocuments: true,
      hasClaimErrors: false,
      isSelfPayClaimExcluded: false,
      onOpenPicking: () => {},
      onOpenOfficialUke: () => {},
      onDownloadLegacyUke: () => {},
      onPrint: () => {}
    })
  );
  assert.ok(headerHtml.includes('>ピッキングへ<'), 'ヘッダーに「ピッキングへ」ボタンが描画されること');
});

test('print page surfaces prescription audit, claim check, lifecycle, and header controls with stable testids', () => {
  const audit = buildPrescriptionInputAudit([
    {
      id: 'i1',
      rpId: 'rp1',
      rpNumber: 1,
      drugCode: '',
      drugName: 'テスト錠',
      amount: '1',
      usage: '',
      days: '14'
    }
  ]);
  assert.ok(audit.errorCount > 0, '不備のある処方で監査エラーが検知されること');
  const formatted = formatPrescriptionAuditIssues(audit.issues);
  assert.ok(formatted.includes('・'), '処方監査サマリーが箇条書き整形されること');

  const headerHtml = renderToStaticMarkup(
    React.createElement(PrintHeaderActions, {
      canExportUke: true,
      canPrintDocuments: true,
      hasClaimErrors: true,
      isSelfPayClaimExcluded: false,
      onOpenPicking: () => {},
      onOpenOfficialUke: () => {},
      onDownloadLegacyUke: () => {},
      onPrint: () => {}
    })
  );
  assert.ok(headerHtml.includes('data-testid="print-uke-export-button"'));
  assert.ok(headerHtml.includes('data-testid="print-official-uke-button"'));
  assert.ok(headerHtml.includes('data-testid="print-execute-button"'));
  const legacyBtn = findOpeningTag(headerHtml, 'data-testid="print-uke-export-button"', 'button');
  assert.ok(legacyBtn.includes('disabled=""'), '請求前エラー時は旧形式UKE出力ボタンが無効化されること');

  const pharmacistHtml = renderToStaticMarkup(
    React.createElement(PharmacistCheckPanel, {
      pharmacistCheckStatus: 'error',
      prescriptionItemCount: 1,
      auditErrorCount: audit.errorCount,
      auditWarningCount: audit.warningCount,
      auditInfoCount: audit.infoCount,
      visibleAuditIssues: audit.issues,
      hiddenAuditIssueCount: 0,
      aiAssistMode: 'enabled',
      aiAssistSummary: summarizeAiSuggestions([]),
      allAiAssistSuggestionCount: 0,
      aiAssistSuggestions: [],
      canReviewAiSuggestions: true,
      onOpenIntervention: () => {},
      onRecordAiSuggestionDecision: () => {}
    })
  );
  assert.ok(pharmacistHtml.includes('data-testid="pharmacist-check-panel"'));
  assert.ok(pharmacistHtml.includes('薬剤師確認'));
  assert.ok(pharmacistHtml.includes('修正あり'));

  const claimCheckHtml = renderToStaticMarkup(
    React.createElement(ClaimCheckPanel, {
      claimCheckStatus: 'error',
      isSelfPayClaimExcluded: false,
      hasClaimErrors: true,
      errorCount: 1,
      warningCount: 0,
      infoCount: 0,
      issues: [{ severity: 'error', code: 'missing_insurer', title: '保険者番号未入力', message: '8桁を入力してください' }]
    })
  );
  assert.ok(claimCheckHtml.includes('data-testid="claim-check-panel"'));
  assert.ok(claimCheckHtml.includes('要修正'));
});

test('print page offers official UKE modal alongside collapsed legacy UKE disclosure', () => {
  const headerHtml = renderToStaticMarkup(
    React.createElement(PrintHeaderActions, {
      canExportUke: true,
      canPrintDocuments: true,
      hasClaimErrors: false,
      isSelfPayClaimExcluded: false,
      onOpenPicking: () => {},
      onOpenOfficialUke: () => {},
      onDownloadLegacyUke: () => {},
      onPrint: () => {}
    })
  );
  assert.ok(headerHtml.includes('data-testid="print-official-uke-button"'));
  assert.ok(headerHtml.includes('>公式UKE<'));
  assert.ok(headerHtml.includes('data-testid="print-legacy-uke-disclosure"'));
  assert.ok(headerHtml.includes('data-testid="print-uke-export-button"'));
  assert.ok(headerHtml.includes('>UKE出力<'));

  const mockPatient: Patient = {
    patientId: 'pat_test',
    name: '公式 花子',
    kana: 'コウシキ ハナコ',
    birthDate: '1980-01-01',
    gender: 'female',
    insuranceInfo: { provider: '06130012', number: '123456', burdenRatio: 30, relationship: '本人' }
  };
  const mockVisit: Visit = {
    visitId: 'visit_test',
    patientId: 'pat_test',
    prescriptionDate: '2026-06-10',
    dispensingDate: '2026-06-10',
    issueDate: '2026-06-10T10:00:00.000Z',
    status: 'completed',
    institutionId: '1312345',
    doctorId: 'doc_1',
    claimLifecycle: {
      status: 'rebilling',
      rebillingReason: '通常月次請求準備'
    }
  };
  const mockSettings: FacilitySettings = {
    id: 'default',
    pharmacyName: 'テスト調剤薬局',
    pharmacyCode: '1312345',
    pharmacyPostalCode: '100-0001',
    pharmacyAddress: '東京都千代田区',
    pharmacyPhone: '03-1234-5678',
    registrationNumber: 'T1234567890123',
    baseFeeCategory: '1',
    regionalSupportAddition: 'none',
    medicalDxAddition: false
  };
  const mockItems: DispensingUkeItem[] = [
    {
      itemId: 'item_1',
      visitId: 'visit_test',
      drugId: '620000001',
      dispensedDrugCode: '620000001',
      drugName: 'アムロジピンOD錠5mg',
      amount: 1,
      days: 14,
      usage: '１日１回朝食前　服用',
      rpNumber: 1,
      dosageCategory: 'internal',
      drugPrice: 10.1,
      claimDrugFee: true
    }
  ];
  const mockCalculatedFees: CalculationResultItem[] = [
    {
      code: 'base_fee',
      receiptFeeCode: '410004110',
      name: '調剤基本料1',
      points: 45,
      rationale: '調剤基本料1 (45点)'
    },
    {
      code: 'drug_preparation',
      receiptFeeCode: '420001810',
      name: '薬剤調製料 (内服薬)',
      points: 24,
      rationale: '薬剤調製料 内服薬 (14日分: 24点)'
    },
    {
      code: 'drug_fee',
      name: '薬剤料',
      points: 14,
      rationale: '薬剤料 (14点)'
    }
  ];

  const modalHtml = renderToStaticMarkup(
    React.createElement(SingleOfficialUkeModal, {
      isOpen: true,
      onClose: () => {},
      visitData: mockVisit,
      patientData: mockPatient,
      settingsData: mockSettings,
      prescriptionItems: mockItems,
      calculatedFees: mockCalculatedFees
    })
  );

  assert.ok(modalHtml.includes('data-testid="single-official-uke-modal"'));
  assert.ok(modalHtml.includes('data-testid="download-official-cyo-button"'));
  assert.ok(modalHtml.includes('RECEIPTY.CYO'));
  assert.ok(modalHtml.includes('公式提出仕様 適合確認済み'));
  assert.ok(modalHtml.includes('YK'));
  assert.ok(modalHtml.includes('RE'));
  assert.ok(modalHtml.includes('GO'));
});

test('print page renders DrugInfoPrint component with true DOM structure', () => {
  const mockPatient: Patient = {
    patientId: 'pat_test',
    name: '印刷 花子',
    kana: 'インサツ ハナコ',
    birthDate: '1985-04-12',
    gender: 'female'
  };
  const mockVisit: Visit = {
    visitId: 'visit_di',
    patientId: 'pat_test',
    issueDate: '2026-10-06T09:00:00.000Z',
    status: 'completed',
    institutionName: 'テストクリニック',
    prescriptionDate: '2026-10-06',
    dispensingDate: '2026-10-06'
  };
  const mockItems: PrintPrescriptionItem[] = [
    {
      itemId: 'item_di_1',
      visitId: 'visit_di',
      drugId: '620000001',
      dispensedDrugCode: '620000001',
      drugName: 'アムロジピンOD錠5mg',
      genericName: 'アムロジピンベシル酸塩',
      dispensedGenericName: 'アムロジピンベシル酸塩',
      amount: 1,
      days: 14,
      usage: '1日1回朝食後',
      rpNumber: 1,
      dosageCategory: 'internal',
      price: 10.1,
      drugPrice: 10.1,
      drugPriceResolution: { price: 10.1, source: 'current' },
      yjCode: '2171022F1020',
      isHighRisk: false,
      claimDrugFee: true
    }
  ];
  const noopAsync = async () => {};

  const html = renderToStaticMarkup(
    React.createElement(DrugInfoPrint, {
      patientData: mockPatient,
      visitData: mockVisit,
      prescriptionItems: mockItems,
      pharmacyInfo: MOCK_PHARMACY_INFO,
      pharmacyAddressLine: MOCK_PHARMACY_INFO.address,
      receiptRunId: 'REC-TEST-001',
      patientBirthDateStr: '1985-04-12 (41歳)',
      dispensingDateStr: '2026-10-06',
      prescriptionDateStr: '2026-10-06',
      medicationInfoFallbackCount: 0,
      getMedicationInfoContent: () => ({
        drugName: 'アムロジピンOD錠5mg',
        source: 'approved_template' as const,
        sourceRevisionDate: '2026-04-01',
        sideEffectText: 'めまい等',
        usageCautionText: '定期的に服用',
        officialSearchUrl: 'https://www.pmda.go.jp'
      }),
      canEditBilling: true,
      remarks: {},
      renderIdentityMark: () => null,
      handleToggleIppoka: noopAsync,
      handleToggleCrushed: noopAsync,
      handleItemClaimToggle: noopAsync,
      dispensingDateForPrice: '2026-10-06',
      drugPriceChoicesByItemId: {},
      drugPriceWarningByItemId: {},
      handleDrugPriceOverrideChange: noopAsync,
      handleTokkanChange: noopAsync,
      handleReceiptRemarkChange: () => {},
      handleBillingAgentOverrideLocalChange: () => {},
      persistBillingAgentOverride: noopAsync
    })
  );

  assert.ok(html.includes('data-testid="drug-info-doc"'));
  assert.ok(html.includes('薬剤情報提供文書'));
  assert.ok(html.includes('印刷 花子 様'));
  assert.ok(html.includes('アムロジピンOD錠5mg'));
  assert.ok(html.includes('薬局確認済み情報（参照版日 2026-04-01）'));
  assert.ok(html.includes('drug-info-claim-tools'));
});

test('audited document printing enforces audit-before-print, records medicationInfo counts, and cleans up print-receipt-only on throw', async () => {
  const { db } = makeFakeVisitDb({ visitId: 'v_print' });
  const events: string[] = [];

  // 1. 監査ログ失敗時は print() を一切呼ばず中止する
  const blocked = await printDocumentsWithAuditLog({
    db,
    visitId: 'v_print',
    patientId: 'pt_1',
    patientName: '印刷 太郎',
    medicationInfo: { approvedCount: 2, fallbackCount: 1 },
    print: () => { events.push('print_called'); },
    logAudit: async () => {
      events.push('audit_failed');
      return false;
    }
  });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.message, CLAIM_ACTION_MESSAGES.printAuditFailed);
  assert.deepEqual(events, ['audit_failed']);

  // 2. 監査ログ成功時は監査の後ろで print() を実行し、薬情件数を監査文言へ残す
  const auditDetails: string[] = [];
  const printed = await printDocumentsWithAuditLog({
    db,
    visitId: 'v_print',
    patientId: 'pt_1',
    patientName: '印刷 太郎',
    medicationInfo: { approvedCount: 2, fallbackCount: 1 },
    print: () => { events.push('print_ok'); },
    logAudit: async (_db, _type, detail) => {
      auditDetails.push(detail);
      events.push('audit_ok');
      return true;
    }
  });
  assert.equal(printed.status, 'printed');
  assert.deepEqual(events, ['audit_failed', 'audit_ok', 'print_ok']);
  assert.match(auditDetails[0], /薬情 承認版 2件 \/ 定型文 1件/);

  // 3. 領収証のみの再発行: 監査文言へ金額・バーコードを含め、例外時も print-receipt-only を必ず外す
  const reissueDetail = buildReceiptReissueAuditDetail('v_print', '印刷 太郎', {
    totalPoints: 97,
    copayYen: 290,
    barcode: { label: '社保', payload: '100002904' }
  });
  assert.match(reissueDetail, /97点/);
  assert.match(reissueDetail, /¥290/);
  assert.match(reissueDetail, /100002904/);

  const activeClasses = new Set<string>();
  const fakeClassList = {
    add: (token: string) => { activeClasses.add(token); },
    remove: (token: string) => { activeClasses.delete(token); }
  };
  const failedPrint = await printDocumentsWithAuditLog({
    db,
    visitId: 'v_print',
    patientId: 'pt_1',
    patientName: '印刷 太郎',
    auditDetail: reissueDetail,
    print: () => {
      runPrintWithBodyClass('print-receipt-only', fakeClassList, () => {
        assert.equal(activeClasses.has('print-receipt-only'), true);
        throw new Error('printer offline');
      });
    },
    logAudit: async () => true
  });
  assert.equal(failedPrint.status, 'failed');
  assert.equal(activeClasses.has('print-receipt-only'), false, '印刷失敗後も print-receipt-only クラスが確実に解除されること');
  assert.ok(CLAIM_ACTION_MESSAGES.printBlockedUnsetPoints.includes('点数が未設定'));
});

test('audited claim condition, option, item flag, drug price override, and lifecycle actions enforce lock & rollback', async () => {
  // 1. 算定条件変更は UKE 出力済みロック時はブロックし、変更可能時は監査失敗で元へ戻す
  const locked = makeFakeVisitDb({
    visitId: 'v_lock',
    claimLifecycle: { status: 'exported', exportedFileName: 'RECEIPTY.CYO' },
    claimOptions: { medicationNotebook: 'carried' }
  });
  const blockedCondition = await changeClaimConditions({
    db: locked.db,
    visitId: 'v_lock',
    patientId: 'pt_1',
    patientName: '患者 太郎',
    claimLifecycle: { status: 'exported', exportedFileName: 'RECEIPTY.CYO' },
    currentOptions: { medicationNotebook: 'carried' },
    patch: { medicationNotebook: 'not_carried' },
    applyOptions: () => {},
    logAudit: async () => true
  });
  assert.equal(blockedCondition.status, 'blocked');

  const draft = makeFakeVisitDb({
    visitId: 'v_draft',
    claimOptions: { drugFeeOnly: false }
  });
  await persistClaimOptions({
    db: draft.db,
    visitId: 'v_draft',
    options: { drugFeeOnly: false }
  });
  const rolledBackOption = await applyClaimOptionsWithAudit({
    db: draft.db,
    visitId: 'v_draft',
    patientId: 'pt_1',
    patientName: '患者 太郎',
    previousOptions: { drugFeeOnly: false },
    nextOptions: { drugFeeOnly: true },
    auditDetail: '薬剤料のみ切替',
    rollbackMessage: CLAIM_ACTION_MESSAGES.drugFeeOnlyAuditRolledBack,
    applyOptions: () => {},
    logAudit: async () => false
  });
  assert.equal(rolledBackOption.status, 'rolled_back');
  assert.equal(rolledBackOption.message, CLAIM_ACTION_MESSAGES.drugFeeOnlyAuditRolledBack);
  assert.equal((draft.getState().claimOptions as { drugFeeOnly?: boolean })?.drugFeeOnly, false);

  // 2. 処方明細別算定フラグの取得・監査失敗ロールバック
  assert.equal(getClaimItemFlagValue({ claimPreparation: false }, 'claimPreparation'), false);
  assert.equal(getClaimItemFlagValue({}, 'claimDrugFee'), true);

  const itemPatchHistory: Record<string, unknown>[] = [];
  const fakeItemDoc = {
    patch: async (values: Record<string, unknown>) => {
      itemPatchHistory.push(values);
    }
  };
  await assert.rejects(
    () => applyItemClaimFlagWithAudit({
      db: draft.db,
      itemDoc: fakeItemDoc,
      item: { itemId: 'i_1', drugName: 'テスト錠', claimDrugFee: true },
      field: 'claimDrugFee',
      value: false,
      patientId: 'pt_1',
      patientName: '患者 太郎',
      logAudit: async () => false
    }),
    new RegExp(CLAIM_ACTION_MESSAGES.itemClaimToggleAuditRolledBack)
  );
  assert.equal(itemPatchHistory.length, 2, 'patch 実行後に監査失敗で元値へ書き戻すこと');
  assert.equal(itemPatchHistory[1].claimDrugFee, true);

  // 3. 薬価の版変更は監査失敗で元の drugPriceOverride を復元する
  let overrideState: { drugPriceOverride?: { price: number; effectiveFrom?: string } } = {
    drugPriceOverride: undefined
  };
  const fakePriceDoc = {
    toJSON: () => structuredClone(overrideState),
    patch: async (values: Record<string, unknown>) => {
      overrideState = { ...overrideState, ...values };
    },
    modify: async (modifier: (data: typeof overrideState) => typeof overrideState) => {
      overrideState = modifier(structuredClone(overrideState));
    }
  };
  await assert.rejects(
    () => applyDrugPriceOverrideWithAudit({
      db: draft.db,
      itemDoc: fakePriceDoc,
      item: { drugName: 'テスト錠' },
      dispensingDate: '2026-06-10',
      drug: { price: 10.1, priceHistory: [{ effectiveFrom: '2026-04-01', price: 10.1 }, { effectiveFrom: '2025-04-01', price: 11.2 }] },
      override: { price: 11.2, effectiveFrom: '2025-04-01' },
      patientId: 'pt_1',
      patientName: '患者 太郎',
      logAudit: async () => false
    }),
    new RegExp(CLAIM_ACTION_MESSAGES.drugPriceOverrideAuditRolledBack)
  );
  assert.equal(overrideState.drugPriceOverride, undefined);

  // 4. 請求ライフサイクル遷移と監査失敗ロールバック
  const exportedState = markClaimExported({
    at: '2026-06-10T10:00:00Z',
    by: '薬剤師A',
    fileName: 'RECEIPTY.CYO',
    totalPoints: 120
  });
  assert.equal(isClaimLifecycleLocked(exportedState), true);
  let lastAppliedLifecycle: unknown = null;
  await assert.rejects(
    () => persistClaimLifecycleWithAudit({
      db: draft.db,
      visitId: 'v_draft',
      patientId: 'pt_1',
      patientName: '患者 太郎',
      nextLifecycle: exportedState,
      detail: '請求ロック',
      applyLifecycle: (lifecycle) => { lastAppliedLifecycle = lifecycle; },
      logAudit: async () => false
    }),
    new RegExp(CLAIM_ACTION_MESSAGES.claimLifecycleAuditRolledBack)
  );
  assert.equal((lastAppliedLifecycle as { status?: string })?.status, 'draft');
});

test('claim lifecycle panel, return reason code, snapshot diff CSV, handoff memo, and return correction actions execute end-to-end', () => {
  const defaultReason = OFFICIAL_CLAIM_RETURN_REASONS[0];
  const summary = buildReturnCorrectionSummary({
    reasonCode: defaultReason.code,
    customNote: '保険者番号再確認',
    operatorName: '薬剤師A'
  });
  assert.equal(summary.reason.code, defaultReason.code);
  assert.ok(summary.auditDetails.includes(defaultReason.code));

  const baseVisit: Visit = {
    visitId: 'v_snap',
    patientId: 'pt_snap',
    issueDate: '2026-06-10T10:00:00Z',
    prescriptionDate: '2026-06-10',
    dispensingDate: '2026-06-10',
    status: 'completed'
  };
  const basePatient: Patient = {
    patientId: 'pt_snap',
    name: 'スナップ 太郎',
    kana: 'スナップ タロウ',
    birthDate: '1980-01-01',
    gender: 'male',
    insuranceInfo: { provider: '06130012', number: '123456', burdenRatio: 30, insuranceType: '社保' }
  };
  const baseItems: DispensingUkeItem[] = [
    {
      itemId: 'i_snap_1',
      visitId: 'v_snap',
      drugId: '620000001',
      dispensedDrugCode: '620000001',
      drugName: 'アムロジピン錠5mg',
      amount: 1,
      days: 14,
      usage: '１日１回朝食前　服用',
      rpNumber: 1,
      drugPrice: 10.1
    }
  ];

  const snapshot = buildClaimExportSnapshot({
    visit: baseVisit,
    patient: basePatient,
    items: baseItems,
    totalPoints: 59,
    createdAt: '2026-06-10T10:00:00Z',
    exportedFileName: 'RECEIPTY.CYO'
  });
  const exportedLifecycle = markClaimExported({
    at: '2026-06-10T10:00:00Z',
    by: '薬剤師A',
    fileName: 'RECEIPTY.CYO',
    totalPoints: 59,
    exportSnapshot: snapshot
  });
  const returnedLifecycle = markClaimReturned({
    current: exportedLifecycle,
    at: '2026-06-15T10:00:00Z',
    by: '薬剤師A',
    reason: summary.formattedMemo,
    reasonCode: summary.reason.code
  });
  assert.equal(getClaimLifecycleStatus(returnedLifecycle), 'returned');
  assert.equal(returnedLifecycle.returnReasonCode, defaultReason.code);

  const rebillingLifecycle = markClaimRebilling({
    current: returnedLifecycle,
    at: '2026-06-16T10:00:00Z',
    by: '薬剤師A',
    reason: '保険者修正済み'
  });
  assert.equal(getClaimLifecycleStatus(rebillingLifecycle), 'rebilling');
  const closedLifecycle = markClaimClosed({
    current: rebillingLifecycle,
    at: '2026-06-20T10:00:00Z',
    by: '薬剤師A'
  });
  assert.equal(getClaimLifecycleStatus(closedLifecycle), 'closed');

  const changedPatient: Patient = {
    ...basePatient,
    insuranceInfo: { ...basePatient.insuranceInfo!, provider: '06139999' }
  };
  const diffs = compareClaimExportSnapshotToCurrent({
    snapshot,
    patient: changedPatient,
    items: baseItems,
    totalPoints: 59
  });
  assert.ok(diffs.length > 0, '請求時点との保険者番号差分が検出されること');

  const suggestions = buildClaimReturnCorrectionSuggestions(diffs);
  assert.ok(suggestions.length > 0, '返戻修正候補が生成されること');
  const insuranceSuggestion = suggestions.find((s) => s.actionTarget === 'patient-insurance-editor') || suggestions[0];
  const routeAction = buildClaimReturnCorrectionAction(insuranceSuggestion, 'v_snap');
  assert.equal(routeAction.type, 'route');
  if (routeAction.type === 'route') {
    assert.equal(routeAction.searchParams.openInsurance, '1');
    assert.equal(routeAction.searchParams.returnCorrection, insuranceSuggestion.id);
  }
  const interventionRoute = buildClaimReturnCorrectionAction({
    id: 'prescription-items',
    title: '処方内容を確認',
    message: '処方修正',
    actionLabel: '処方内容を修正',
    actionTarget: 'prescription-intervention-record',
    severity: 'error',
    fields: ['prescriptionItems'],
    differenceSummary: '処方差分'
  }, 'v_snap');
  assert.equal(interventionRoute.type, 'route');
  if (interventionRoute.type === 'route') {
    assert.equal(interventionRoute.searchParams.openIntervention, '1');
  }
  const adjustAction = buildClaimReturnCorrectionAction({
    id: 'claim-points',
    title: '点数を再計算',
    message: '点数確認',
    actionLabel: '点数内訳を確認',
    actionTarget: 'claim-adjust-panel',
    severity: 'error',
    fields: ['totalPoints'],
    differenceSummary: '点数差分'
  }, 'v_snap');
  assert.deepEqual(adjustAction, { type: 'anchor', elementId: 'claim-adjust-panel' });

  const csv = buildClaimSnapshotDifferenceCsv({
    snapshot,
    differences: diffs,
    suggestions
  });
  assert.ok(csv.includes('06130012'));
  assert.match(makeClaimSnapshotDifferenceCsvFileName(snapshot), /^CLAIM_SNAPSHOT_DIFF_v_snap_/);

  const memo = buildClaimReturnCorrectionHandoffMemo({
    snapshot,
    differences: diffs,
    suggestions
  });
  assert.ok(memo.includes('スナップ 太郎'));

  // ClaimLifecyclePanel の実描画検証（返戻理由選択・記録済み返戻理由・ロック状態）
  const lifecycleHtml = renderToStaticMarkup(
    React.createElement(ClaimLifecyclePanel, {
      claimLifecycle: returnedLifecycle,
      claimLifecycleStatus: 'returned',
      claimLifecycleLocked: false,
      latestClaimLifecycleEvent: returnedLifecycle.history?.[returnedLifecycle.history.length - 1],
      returnReasonCode: defaultReason.code,
      returnReasonNote: '確認中',
      selectedReturnReason: getClaimReturnReasonByCode(defaultReason.code),
      canChangeBilling: true,
      onReturnReasonCodeChange: () => {},
      onReturnReasonNoteChange: () => {},
      onRegisterReturn: () => {},
      onPrepareRebilling: () => {},
      onCloseClaim: () => {}
    })
  );
  assert.ok(lifecycleHtml.includes('data-testid="claim-lifecycle-panel"'));
  assert.ok(lifecycleHtml.includes('請求ライフサイクル'));
  assert.ok(lifecycleHtml.includes('data-testid="claim-return-reason-picker"'));
  assert.ok(lifecycleHtml.includes('data-testid="claim-return-reason-code"'));
  assert.ok(lifecycleHtml.includes('data-testid="claim-return-reason-note"'));
  assert.ok(lifecycleHtml.includes('data-testid="claim-registered-return-reason"'));
  assert.ok(lifecycleHtml.includes(formatClaimReturnReasonLabel(defaultReason.code)));
  assert.ok(lifecycleHtml.includes('>返戻登録<'));
  assert.ok(lifecycleHtml.includes('>再請求/月遅れ<'));
  assert.ok(lifecycleHtml.includes('>請求完了<'));
});

test('PharmacistCheckPanel renders AI assist suggestions, mode notice, and intervention trigger cleanly', () => {
  const audit = buildPrescriptionInputAudit([
    {
      id: 'ai_1',
      rpId: 'rp_ai',
      rpNumber: 1,
      drugCode: '',
      drugName: 'テスト薬',
      amount: '1',
      usage: '',
      days: '14'
    }
  ]);
  const allSuggestions = buildAiSuggestionsFromPrescriptionAudit(audit);
  assert.ok(allSuggestions.length > 0, '監査指摘から根拠付きAI補助提案が生成されること');

  const enabledSuggestions = filterAiAssistItemsByMode(allSuggestions, 'enabled');
  const enabledHtml = renderToStaticMarkup(
    React.createElement(PharmacistCheckPanel, {
      pharmacistCheckStatus: 'error',
      prescriptionItemCount: 1,
      auditErrorCount: audit.errorCount,
      auditWarningCount: audit.warningCount,
      auditInfoCount: audit.infoCount,
      visibleAuditIssues: audit.issues,
      hiddenAuditIssueCount: 0,
      aiAssistMode: 'enabled',
      aiAssistSummary: summarizeAiSuggestions(enabledSuggestions),
      allAiAssistSuggestionCount: allSuggestions.length,
      aiAssistSuggestions: enabledSuggestions,
      canReviewAiSuggestions: true,
      onOpenIntervention: () => {},
      onRecordAiSuggestionDecision: () => {}
    })
  );
  assert.ok(enabledHtml.includes('AI補助'));
  assert.ok(enabledHtml.includes('data-testid="ai-assist-suggestion"'));
  assert.ok(enabledHtml.includes(`信頼度 ${formatAiSuggestionConfidence(enabledSuggestions[0])}`));
  assert.ok(enabledHtml.includes('>採用<'));
  assert.ok(enabledHtml.includes('>修正<'));
  assert.ok(enabledHtml.includes('>却下<'));
  assert.ok(enabledHtml.includes('>疑義照会を記録<'));

  // disabled モード時は AI 候補を停止しつつ通常の処方監査を継続する通知が出る
  const disabledSuggestions = filterAiAssistItemsByMode(allSuggestions, 'disabled');
  assert.equal(disabledSuggestions.length, 0);
  const disabledHtml = renderToStaticMarkup(
    React.createElement(PharmacistCheckPanel, {
      pharmacistCheckStatus: 'error',
      prescriptionItemCount: 1,
      auditErrorCount: audit.errorCount,
      auditWarningCount: audit.warningCount,
      auditInfoCount: audit.infoCount,
      visibleAuditIssues: audit.issues,
      hiddenAuditIssueCount: 0,
      aiAssistMode: 'disabled',
      aiAssistSummary: summarizeAiSuggestions(disabledSuggestions),
      allAiAssistSuggestionCount: allSuggestions.length,
      aiAssistSuggestions: disabledSuggestions,
      canReviewAiSuggestions: false,
      onOpenIntervention: () => {},
      onRecordAiSuggestionDecision: () => {}
    })
  );
  assert.ok(disabledHtml.includes('data-testid="ai-assist-mode-notice"'));
  assert.ok(disabledHtml.includes('通常の処方監査は継続します'));
  assert.equal(disabledHtml.includes('data-testid="ai-assist-suggestion"'), false);

  // 疑義照会導線 URL が EMR 側のクエリ解釈と往復一致する
  const interventionUrl = buildPrintInterventionUrl('v_int_1', audit.issues);
  const parsed = parseEmrLocationSearch(interventionUrl.slice(interventionUrl.indexOf('?')));
  assert.equal(parsed.visitId, 'v_int_1');
  assert.equal(parsed.openIntervention, true);
  assert.ok(parsed.reason && parsed.reason.length > 0);
});

test('electronic prescription dispensing payload omits visitId, includes HPKI/code metadata, and ElectronicPrescriptionPrintPanel renders controls', () => {
  const payload = buildElectronicPrescriptionDispensingResultPayload({
    visitData: {
      prescriptionDate: '2026-06-10',
      dispensingDate: '2026-06-10',
      issueDate: '2026-06-10T10:00:00Z',
      electronicPrescription: {
        prescriptionId: 'EP-2026-001',
        documentKind: 'electronic_prescription',
        sourceMode: 'connector',
        receivedAt: '2026-06-10T10:00:00Z',
        appliedAt: '2026-06-10T10:00:00Z',
        validUntil: '2026-06-14',
        integrityHash: 'sha256-abc',
        receptionStatus: 'accepted',
        dispensingResultStatus: 'pending',
        dispensingResultEverRegistered: false,
        signatureStatus: 'valid',
        duplicateCheckStatus: 'passed'
      }
    },
    prescriptionItems: [
      {
        itemId: 'ep_item_1',
        visitId: 'v_secret_id',
        rpNumber: 1,
        drugId: '620000001',
        dispensedDrugCode: '620000001',
        drugName: 'アムロジピン錠5mg',
        genericName: 'アムロジピンベシル酸塩',
        dispensedGenericName: 'アムロジピンベシル酸塩',
        prescribedDrugCodeStatus: 'active',
        electronicSourceDrugName: 'アムロジピン錠5mg',
        electronicMasterDrugName: 'アムロジピン錠5mg',
        electronicDrugNameVerificationStatus: 'matched',
        amount: 1,
        unitCode: '01',
        unitText: '錠',
        price: 10.1,
        drugPrice: 10.1,
        drugPriceResolution: { price: 10.1, source: 'current' },
        yjCode: '2171022F1020',
        isHighRisk: false,
        electronicUsageCode: '1011000100000000',
        electronicUsageFallbackText: '1日1回朝食前',
        usage: '１日１回朝食前　服用',
        days: 14
      }
    ],
    totalPoints: 120
  });

  assert.equal(payload.type, 'yakureki-electronic-prescription-dispensing-result');
  assert.equal('visitId' in payload, false, '送信ペイロードトップレベルに院内 visitId を露出しないこと');
  assert.equal(payload.signatureRequirement.hpkiSignatureRequired, requiresElectronicPrescriptionDispensingHpkiSignature(['electronic_prescription']));
  assert.equal(payload.items[0].prescribedDrugCodeStatus, 'active');
  assert.equal(payload.items[0].sourceDrugName, 'アムロジピン錠5mg');
  assert.equal(payload.items[0].masterDrugName, 'アムロジピン錠5mg');
  assert.equal(payload.items[0].drugNameVerificationStatus, 'matched');
  assert.equal(payload.items[0].unitCode, '01');
  assert.equal(payload.items[0].usageCode, '1011000100000000');
  assert.equal(payload.items[0].usageFallbackText, '1日1回朝食前');

  const decision = validateElectronicPrescriptionLifecycleOperation('reception_cancel', {
    receptionStatus: 'accepted',
    dispensingResultStatus: 'registered',
    dispensingResultEverRegistered: true
  });
  assert.equal(decision.allowed, false, '調剤結果登録済みの受付取消はライフサイクル検証で拒否されること');

  const panelHtml = renderToStaticMarkup(
    React.createElement(ElectronicPrescriptionPrintPanel, {
      electronicPrescription: {
        prescriptionId: 'EP-2026-001',
        documentKind: 'electronic_prescription',
        sourceMode: 'connector',
        receivedAt: '2026-06-10T10:00:00Z',
        appliedAt: '2026-06-10T10:00:00Z',
        validUntil: '2026-06-14',
        integrityHash: 'sha256-abc',
        receptionStatus: 'accepted',
        dispensingResultStatus: 'registered',
        dispensingResultEverRegistered: true,
        signatureStatus: 'valid',
        duplicateCheckStatus: 'passed'
      },
      electronicPrescriptionIds: ['EP-2026-001'],
      electronicPrescriptionDispensingResultStatus: 'registered',
      electronicPrescriptionReceptionStatus: 'accepted',
      electronicPrescriptionSignatureStatus: 'valid',
      electronicPrescriptionDuplicateCheckStatus: 'passed',
      electronicPrescriptionRegistered: true,
      electronicPrescriptionOperationBusy: false,
      electronicPrescriptionOperationInFlight: null,
      canRunElectronicPrescriptionDuplicateCheck: true,
      canRegisterElectronicPrescriptionDispensingResult: true,
      canSearchElectronicPrescriptionDispensingResult: true,
      canChangeElectronicPrescriptionDispensingResult: true,
      canCancelElectronicPrescriptionDispensingResult: true,
      canCancelElectronicPrescriptionReception: true,
      electronicPrescriptionDispensingInformationSignatureText: '電子署名済 (HPKI検証成功)',
      electronicPrescriptionDispensingInformationHpkiText: '医師/薬剤師 HPKI 認証済',
      electronicPrescriptionDispensingInformationHashText: 'sha256-abcdef123456',
      electronicPrescriptionComments: ['疑義照会確認済み'],
      electronicPrescriptionLaboratoryResults: [],
      prescriptionAuditErrorCount: 0,
      electronicPrescriptionLifecycleDecision: () => ({ allowed: true }),
      handleElectronicPrescriptionOperation: () => {}
    })
  );

  assert.ok(panelHtml.includes('data-testid="electronic-prescription-lifecycle-panel"'));
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-duplicate-check-button"'));
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-register-dispensing-result-button"'));
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-search-dispensing-result-button"'));
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-change-dispensing-result-button"'));
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-cancel-dispensing-result-button"'));
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-cancel-reception-button"'));
  assert.ok(panelHtml.includes('電子署名済 (HPKI検証成功)'));
  assert.ok(panelHtml.includes('sha256-abcdef123456'));
});

test('emr route guard blocks locked claims across prescription, picking, soap, and stock scopes', () => {
  const lockedVisit: Pick<Visit, 'claimLifecycle'> = {
    claimLifecycle: { status: 'exported', exportedFileName: 'RECEIPTY.CYO' }
  };
  for (const scope of ['prescription', 'soap', 'picking', 'stock'] as const) {
    const res = evaluateActiveVisitEditability(lockedVisit, scope);
    assert.equal(res.ok, false, `ロック済み受付の ${scope} 編集はブロックされること`);
    assert.ok(res.message.length > 0);
  }

  const editableVisit: Pick<Visit, 'claimLifecycle'> = {
    claimLifecycle: { status: 'returned', returnReason: '要修正' }
  };
  assert.equal(evaluateActiveVisitEditability(editableVisit, 'picking').ok, true);
  assert.equal(evaluateActiveVisitEditability(null, 'soap').ok, false);
});

test('print helper pure functions execute deterministically', () => {
  assert.equal(stableHashText('a'), stableHashText('a'));
  assert.ok(typeof calculatePatientAge('1990-01-01') === 'number');
  assert.ok(PATIENT_IDENTITY_MARKS.includes(getPatientIdentityMark('p1', 'v1')));
  assert.ok(
    formatPrescriptionAuditIssues([{ severity: 'error', code: 'test', title: 't', message: 'm' }]).includes('・t: m')
  );
});

test('dispensing record renders statutory intervention records block with and without interventions', () => {
  const testInterventions = [
    {
      eventId: 'ev_1',
      category: 'generic_change' as const,
      reason: '患者希望による後発医薬品への銘柄変更の確認',
      inquiryDoctor: '山田 太郎',
      inquiryResult: '変更了承。処方通りの用量で調剤のこと。',
      patientConsented: true,
      contactedAt: '2026-06-10T10:30:00.000Z',
      handledBy: '鈴木 花子',
      inquiryStatus: 'completed' as const,
      inquiryMethod: 'phone' as const
    }
  ];

  const htmlWithInterventions = renderToStaticMarkup(
    React.createElement(DispensingRecordPrint, {
      patientData: { name: '患者 テスト', birthDate: '1980-01-01', patientId: 'p_1' },
      visitData: {
        prescriptionDate: '2026-06-10',
        dispensingDate: '2026-06-10',
        interventionEvents: testInterventions
      },
      prescriptionItems: [],
      pharmacyInfo: { ...MOCK_PHARMACY_INFO, pharmacistName: '鈴木 花子' },
      pharmacyAddressLine: '東京都千代田区',
      receiptRunId: 'REC-001',
      currentDateStr: '2026-06-10',
      patientBirthDateStr: '1980年1月1日',
      dispensingDateStr: '2026年6月10日',
      prescriptionDateStr: '2026年6月10日',
      patientAge: 46,
      electronicPrescriptionIds: [],
      electronicPrescriptionDispensingResultStatus: 'pending',
      electronicPrescriptionDispensingInformationSignatureText: '',
      electronicPrescriptionDispensingInformationHpkiText: '',
      electronicPrescriptionDispensingInformationHashText: '',
      electronicPrescriptionComments: [],
      electronicPrescriptionLaboratoryResults: [],
      renderIdentityMark: () => null,
      isFirstItemInRp: () => true
    })
  );

  assert.ok(htmlWithInterventions.includes('data-testid="dispensing-record-doc"'));
  assert.ok(htmlWithInterventions.includes('data-testid="record-intervention-box"'));
  assert.ok(htmlWithInterventions.includes('疑義照会・処方変更の記録（薬剤師法第24条・第28条・施行規則第16条第1項第10号）'));
  assert.ok(htmlWithInterventions.includes('record-intervention-table'));
  assert.ok(htmlWithInterventions.includes('山田 太郎 医師 (電話)'));
  assert.ok(htmlWithInterventions.includes('後発医薬品変更'));
  assert.ok(htmlWithInterventions.includes('患者希望による後発医薬品への銘柄変更の確認'));
  assert.ok(htmlWithInterventions.includes('変更了承。処方通りの用量で調剤のこと。'));
  assert.ok(htmlWithInterventions.includes('鈴木 花子'));

  const htmlWithoutInterventions = renderToStaticMarkup(
    React.createElement(DispensingRecordPrint, {
      patientData: { name: '患者 テスト' },
      visitData: {},
      prescriptionItems: [],
      pharmacyInfo: { ...MOCK_PHARMACY_INFO, pharmacistName: '鈴木 花子' },
      pharmacyAddressLine: '東京都千代田区',
      receiptRunId: 'REC-001',
      currentDateStr: '2026-06-10',
      patientBirthDateStr: '1980年1月1日',
      dispensingDateStr: '2026年6月10日',
      prescriptionDateStr: '2026年6月10日',
      electronicPrescriptionIds: [],
      electronicPrescriptionDispensingResultStatus: 'pending',
      electronicPrescriptionDispensingInformationSignatureText: '',
      electronicPrescriptionDispensingInformationHpkiText: '',
      electronicPrescriptionDispensingInformationHashText: '',
      electronicPrescriptionComments: [],
      electronicPrescriptionLaboratoryResults: [],
      renderIdentityMark: () => null,
      isFirstItemInRp: () => true,
      interventions: []
    })
  );
  assert.ok(htmlWithoutInterventions.includes('data-testid="record-intervention-box"'));
  assert.ok(htmlWithoutInterventions.includes('疑義照会・処方変更なし'));
});

test('print page renders MedicineBagPrint component with true DOM structure', () => {
  const html = renderToStaticMarkup(
    React.createElement(MedicineBagPrint, {
      patientData: { name: '薬袋 花子', patientId: 'pat_bag' },
      groupedForBags: {
        '1日1回朝食後': [
          {
            itemId: 'item_bag_1',
            drugName: 'アムロジピン錠5mg',
            dispensedDrug: 'アムロジピンOD錠5mg「トーワ」',
            amount: 1,
            days: 14,
            usage: '1日1回朝食後',
            usageSupplementText: '血圧測定後に服用',
            dosageCategory: 'internal' as const,
            unitText: '錠'
          }
        ]
      },
      pharmacyInfo: MOCK_PHARMACY_INFO,
      pharmacyAddressLine: '東京都千代田区',
      receiptRunId: 'RUN-BAG-001',
      dispensingDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(html.includes('data-testid="medicine-bag-doc"'));
  assert.ok(html.includes('yakutai-doc internal-bag'));
  assert.ok(html.includes('内服薬'));
  assert.ok(html.includes('薬袋 花子 様'));
  assert.ok(html.includes('アムロジピンOD錠5mg「トーワ」'));
  assert.ok(html.includes('1日1回朝食後'));
  assert.ok(html.includes('（血圧測定後に服用）'));
  assert.ok(html.includes('14日分'));
  assert.ok(html.includes('朝食後'));
});

test('print page renders ReceiptStatementPrint and ReceiptPrint components with true DOM structure', () => {
  const patientData = {
    name: '明細 太郎',
    patientId: 'pat_stmt',
    insuranceInfo: { provider: '06130012', number: '123456', burdenRatio: 30 }
  };
  const visitData = {
    institutionName: 'テスト医院',
    departmentName: '内科',
    doctorName: '医師 太郎'
  };
  const calculatedFees = [
    { code: 'base_fee' as const, name: '調剤基本料1', rationale: '基本料1 (45点)', points: 45, receiptFeeCode: '410004110' },
    { code: 'drug_fee' as const, name: '薬剤料', rationale: '薬剤料 (14点)', points: 14, receiptFeeCode: '620000001' }
  ];
  const insuranceAmounts = {
    burdenRatio: 30,
    totalCostYen: 590,
    insurerBurdenYen: 410,
    patientCopayYen: 180
  };

  const stmtHtml = renderToStaticMarkup(
    React.createElement(ReceiptStatementPrint, {
      patientData,
      visitData,
      calculatedFees,
      totalPoints: 59,
      insuranceAmounts,
      pharmacyInfo: MOCK_PHARMACY_INFO,
      pharmacyAddressLine: '東京都千代田区',
      receiptRunId: 'RUN-STMT-001',
      currentDateStr: '2026年10月6日',
      patientBirthDateStr: '1980年1月1日',
      dispensingDateStr: '2026年10月6日',
      prescriptionDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(stmtHtml.includes('data-testid="receipt-statement-doc"'));
  assert.ok(stmtHtml.includes('調剤明細書'));
  assert.ok(stmtHtml.includes('明細 太郎 様'));
  assert.ok(stmtHtml.includes('59 点'));
  assert.ok(stmtHtml.includes('¥180'));
  assert.ok(stmtHtml.includes('調剤基本料1'));

  const rcptHtml = renderToStaticMarkup(
    React.createElement(ReceiptPrint, {
      patientData,
      totalPoints: 59,
      insuranceAmounts,
      receiptBreakdownRows: [
        { label: '調剤基本料', points: 45, note: '45点' },
        { label: '薬剤料', points: 14, note: '14点' }
      ],
      pharmacyInfo: MOCK_PHARMACY_INFO,
      pharmacyAddressLine: '東京都千代田区',
      receiptRunId: 'RUN-RCPT-001',
      currentDateStr: '2026年10月6日',
      dispensingDateStr: '2026年10月6日',
      prescriptionDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(rcptHtml.includes('data-testid="receipt-doc"'));
  assert.ok(rcptHtml.includes('領収証'));
  assert.ok(rcptHtml.includes('患者様控'));
  assert.ok(rcptHtml.includes('¥180'));
  assert.ok(rcptHtml.includes('調剤基本料'));
});

test('print page renders MedicineNotebookStickerPrint, LiquidLabelSheetPrint, and OintmentLabelSheetPrint', () => {
  const stickerHtml = renderToStaticMarkup(
    React.createElement(MedicineNotebookStickerPrint, {
      patientData: { name: '手帳 太郎', patientId: 'pat_stk' },
      prescriptionItems: [
        {
          itemId: 'stk_1',
          drugName: 'アムロジピン錠5mg',
          dispensedDrug: 'アムロジピンOD錠5mg「トーワ」',
          amount: 1,
          days: 14,
          usage: '1日1回朝食後',
          rpNumber: 1,
          unitText: '錠'
        }
      ],
      pharmacyInfo: MOCK_PHARMACY_INFO,
      dispensingDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );
  assert.ok(stickerHtml.includes('data-testid="medicine-notebook-sticker-doc"'));
  assert.ok(stickerHtml.includes('handbook-sticker'));
  assert.ok(stickerHtml.includes('手帳 太郎 様'));

  const liquidHtml = renderToStaticMarkup(
    React.createElement(LiquidLabelSheetPrint, {
      patientData: { name: '外用 太郎', patientId: 'pat_ext' },
      liquidItems: [
        {
          itemId: 'liq_1',
          drugName: 'テストシロップ',
          amount: 10,
          days: 5,
          totalAmount: 50,
          usage: '1日3回毎食後',
          dosageCategory: 'internal',
          unit: 'mL'
        }
      ],
      pharmacyInfo: MOCK_PHARMACY_INFO,
      pharmacyAddressLine: '東京都千代田区',
      currentDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );
  assert.ok(liquidHtml.includes('data-testid="liquid-label-sheet-doc"'));
  assert.ok(liquidHtml.includes('テストシロップ'));

  const ointmentHtml = renderToStaticMarkup(
    React.createElement(OintmentLabelSheetPrint, {
      patientData: { name: '外用 太郎', patientId: 'pat_ext' },
      ointmentItems: [
        {
          itemId: 'oint_1',
          drugName: 'テスト軟膏',
          amount: 20,
          days: 0,
          totalAmount: 20,
          usage: '1日2回患部に塗布',
          dosageCategory: 'external',
          unit: 'g'
        }
      ],
      pharmacyInfo: MOCK_PHARMACY_INFO,
      pharmacyAddressLine: '東京都千代田区',
      currentDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );
  assert.ok(ointmentHtml.includes('data-testid="ointment-label-sheet-doc"'));
  assert.ok(ointmentHtml.includes('テスト軟膏'));
});

test('print page renders EmergencyRecoveryKeySheetPrint and PharmacyDeviceHandoffPanel components', () => {
  const escrowHtml = renderToStaticMarkup(
    React.createElement(EmergencyRecoveryKeySheetPrint, {
      escrow: null,
      facilityName: 'テスト薬局',
      facilityAddress: '東京都千代田区',
      facilityPhone: '03-1234-5678',
      renderIdentityMark: () => null
    })
  );
  assert.ok(escrowHtml.includes('data-testid="emergency-recovery-key-sheet-doc"'));
  assert.ok(escrowHtml.includes('【未発行・認証前】緊急復旧用 暗号鍵エスクローシート'));

  const deviceHtml = renderToStaticMarkup(
    React.createElement(PharmacyDeviceHandoffPanel, {
      pharmacyDeviceFlowStatus: 'ready',
      pharmacyDeviceReadiness: {
        status: 'ready',
        statusLabel: '準備完了',
        requiredActions: [],
        pharmacyDevice: {
          connectorKind: 'nsips_gateway',
          interfaceVersion: 'NSIPS-v2.1'
        }
      } as unknown as Parameters<typeof PharmacyDeviceHandoffPanel>[0]['pharmacyDeviceReadiness'],
      isLoadingPharmacyDeviceReadiness: false,
      pharmacyDeviceConnectorReady: true,
      pharmacyDeviceOperationBusy: false,
      pharmacyDeviceOperationInFlight: null,
      canSubmitPharmacyDevice: true,
      canReplacePharmacyDevice: false,
      canCancelPharmacyDevice: false,
      handlePharmacyDeviceOperation: () => {}
    })
  );
  assert.ok(deviceHtml.includes('data-testid="pharmacy-device-handoff-panel"'));
  assert.ok(deviceHtml.includes('外部調剤機器連携'));
  assert.ok(deviceHtml.includes('送信可能'));
  assert.ok(deviceHtml.includes('data-testid="pharmacy-device-submit-button"'));
});

test('buildPrintReceiptBarcodeState builds barcode for confirmed copay and explains omission when pending or out of range', () => {
  // 1. 点数未設定時はバーコードを作らず理由を返す
  const pending = buildPrintReceiptBarcodeState({
    receiptAmountsPending: true,
    insuranceType: '社保',
    provider: '06130012',
    hasPublicInsurance: false,
    copayYen: 1290
  });
  assert.equal(pending.result, null);
  assert.equal(pending.barcode, null);
  assert.equal(pending.status.kind, 'none');
  assert.match(pending.status.message, /点数が未設定/);

  // 2. 確定済み保険自己負担額ではペイロードと区分・根拠を返す
  const ok = buildPrintReceiptBarcodeState({
    receiptAmountsPending: false,
    insuranceType: '社保',
    provider: '06130012',
    hasPublicInsurance: false,
    copayYen: 1290
  });
  assert.ok(ok.result?.ok);
  assert.ok(ok.barcode?.payload);
  assert.equal(ok.status.kind, 'ok');
  if (ok.status.kind === 'ok') {
    assert.equal(ok.status.amountYen, 1290);
    assert.ok(ok.status.categoryText.length > 0);
    assert.equal(typeof ok.status.assumed, 'boolean');
  }

  // 3. 7桁超過などバーコード生成不可時は barcode: null かつ理由を返す
  const overflow = buildPrintReceiptBarcodeState({
    receiptAmountsPending: false,
    insuranceType: '社保',
    provider: '06130012',
    hasPublicInsurance: false,
    copayYen: 99_999_999
  });
  assert.equal(overflow.barcode, null);
  assert.equal(overflow.status.kind, 'none');
  assert.ok(overflow.status.message.length > 0);
});
