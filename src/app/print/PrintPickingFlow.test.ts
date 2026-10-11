import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';

const pageSource = readFileSync(new URL('./[visitId]/page.tsx', import.meta.url), 'utf8');
const typesSource = readFileSync(new URL('./types.ts', import.meta.url), 'utf8');
const helpersSource = readFileSync(new URL('./helpers.ts', import.meta.url), 'utf8');
const componentsDir = new URL('./components/', import.meta.url);
const componentsSources = readdirSync(componentsDir)
  .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
  .map((f) => readFileSync(new URL(f, componentsDir), 'utf8'))
  .join('\n');
const hooksDir = new URL('../../hooks/', import.meta.url);
const printHooksSources = readdirSync(hooksDir)
  .filter((f) => f.startsWith('usePrint') && (f.endsWith('.ts') || f.endsWith('.tsx')))
  .map((f) => readFileSync(new URL(f, hooksDir), 'utf8'))
  .join('\n');

const printSource = [pageSource, typesSource, helpersSource, componentsSources, printHooksSources].join('\n');
const emrSource = readFileSync(new URL('../emr/page.tsx', import.meta.url), 'utf8');
const claimSnapshotSource = readFileSync(new URL('../../lib/claim_snapshot.ts', import.meta.url), 'utf8');

function section(source: string, start: string, end?: string): string {
  const startIndex = source.indexOf(start);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  if (end) {
    const endIndex = source.indexOf(end, startIndex + start.length);
    if (endIndex > startIndex) {
      return source.slice(startIndex, endIndex);
    }
  }
  return source.slice(startIndex, startIndex + 5000);
}

test('print page exposes a direct route to picking support for the current visit', () => {
  assert.ok(printSource.includes('router.push(`/emr?visitId=${encodeURIComponent(visitId)}&openPicking=1`);'));
  assert.match(printSource, />ピッキングへ</);
});

test('print page surfaces prescription audit before printing and UKE export', () => {
  assert.match(printSource, /buildPrescriptionInputAudit/);
  assert.match(printSource, /薬剤師確認/);
  assert.match(printSource, /formatPrescriptionAuditIssues/);
  assert.match(printSource, /prescriptionAudit\.errorCount > 0/);
  assert.match(printSource, /data-testid="print-page"/);
  assert.match(printSource, /data-testid="print-uke-export-button"/);
  assert.match(printSource, /data-testid="print-official-uke-button"/);
  assert.match(printSource, /data-testid="print-execute-button"/);
  assert.match(printSource, /data-testid="pharmacist-check-panel"/);
  assert.match(printSource, /data-testid="claim-check-panel"/);
  assert.match(printSource, /data-testid="claim-lifecycle-panel"/);
  assert.match(printSource, /data-testid="dispensing-record-doc"/);
  assert.match(printSource, /data-testid="receipt-statement-doc"/);
});

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
import type { FacilitySettings, Patient, Visit } from '@/db/types';
import type { DispensingUkeItem } from '@/lib/receipt/dispensing_uke';

test('print page offers parallel official UKE preview/download alongside regular UKE and renders modal component', () => {
  // 1. 通常 UKE と公式 UKE ボタンの両方が併設されていること（通常出力を独断で塞がない契約）
  assert.match(printSource, /data-testid="print-uke-export-button"/);
  assert.match(printSource, /data-testid="print-official-uke-button"/);
  assert.match(printSource, />UKE出力</);
  assert.match(printSource, />公式UKE</);

  // 2. 公式 UKE モーダルコンポーネントが接続されていること
  assert.match(printSource, /<SingleOfficialUkeModal/);
  assert.match(printSource, /download-official-cyo-button/);
  assert.match(printSource, /RECEIPTY\.CYO/);

  // 3. SingleOfficialUkeModal の実描画テスト（renderToStaticMarkup による真正な DOM / data-testid 検証）
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
      usage: '１日１回朝食後',
      rpNumber: 1,
      dosageCategory: 'internal',
      drugPrice: 10.1,
      claimDrugFee: true
    }
  ];
  const mockCalculatedFees: any[] = [
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

  assert.ok(modalHtml.includes('data-testid="single-official-uke-modal"'), 'モーダルルート要素が存在すること');
  assert.ok(modalHtml.includes('data-testid="download-official-cyo-button"'), '公式 CYO ダウンロードボタンが存在すること');
  assert.ok(modalHtml.includes('RECEIPTY.CYO'), '公式提出用ファイル名が表示されること');
  assert.ok(modalHtml.includes('公式提出仕様 適合確認済み'), '公式仕様適合サマリーバッジが表示されること');
  assert.ok(modalHtml.includes('YK'), 'YKレコードチップが表示されること');
  assert.ok(modalHtml.includes('RE'), 'REレコードチップが表示されること');
  assert.ok(modalHtml.includes('GO'), 'GOレコードチップが表示されること');
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
  const mockPharmacyInfo = {
    name: 'テスト調剤薬局',
    pharmacistName: '担当 薬剤師',
    address: '東京都千代田区',
    postalCode: '100-0001',
    phone: '03-1234-5678'
  };
  const mockItems: DispensingUkeItem[] = [
    {
      itemId: 'item_di_1',
      visitId: 'visit_di',
      drugId: '620000001',
      dispensedDrugCode: '620000001',
      drugName: 'アムロジピンOD錠5mg',
      amount: 1,
      days: 14,
      usage: '1日1回朝食後',
      rpNumber: 1,
      dosageCategory: 'internal',
      drugPrice: 10.1,
      claimDrugFee: true
    }
  ];
  const noopAsync = async () => {};

  const html = renderToStaticMarkup(
    React.createElement(DrugInfoPrint, {
      patientData: mockPatient,
      visitData: mockVisit,
      prescriptionItems: mockItems as any,
      pharmacyInfo: mockPharmacyInfo as any,
      pharmacyAddressLine: mockPharmacyInfo.address,
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

  assert.ok(html.includes('data-testid="drug-info-doc"'), '薬情ドキュメントルート要素が存在すること');
  assert.ok(html.includes('薬剤情報提供文書'), '薬情タイトルが表示されること');
  assert.ok(html.includes('印刷 花子 様'), '患者名が描画されること');
  assert.ok(html.includes('アムロジピンOD錠5mg'), '薬品名が描画されること');
  assert.ok(html.includes('薬局確認済み情報（参照版日 2026-04-01）'), '承認版日が表示されること');
  assert.ok(html.includes('drug-info-claim-tools'), '算定調整ツールバーが含まれること');
});

// 以下 3 件は「監査ログが残らなければ操作を確定させない」契約。
// 実挙動 (何が DB に残り、何が巻き戻るか) は claim_actions.test.ts が
// モック DB で検証している。ここでは page.tsx がその層へ委譲したままであること
// — ガードを迂回する実装へ戻っていないこと — を見る。
test('print page delegates document printing to the audited claim action', () => {
  const body = section(printSource, 'const handlePrint = async', 'const applyClaimLifecycleToVisit =');

  assert.match(body, /if \(!db\)/);
  assert.match(body, /await printDocumentsWithAuditLog\(/);
  assert.match(body, /print: \(\) => window\.print\(\)/);
  // 印刷済み以外 (監査ログ失敗による中止・ブラウザ印刷の失敗) はどちらも利用者へ知らせる。
  assert.match(body, /outcome\.status !== 'printed'/);
  assert.match(body, /alert\(outcome\.message\)/);
  assert.match(body, /medicationInfo: \{/);

  // 監査ログを通さない印刷経路が増えていないこと。
  const directPrintCalls = printSource.match(/window\.print\(\)/g) || [];
  assert.equal(directPrintCalls.length, 1, 'window.print() は監査済みの1経路のみ');
});

test('print page delegates billing option changes to the audited claim action', () => {
  const persistBody = section(printSource, 'const persistClaimOptions = async', 'const handleDrugFeeOnlyChange = async');
  assert.match(persistBody, /await persistVisitClaimOptions\(/);
  assert.match(persistBody, /onPersisted: applyPersistedClaimOptions/);

  const drugFeeOnlyBody = section(printSource, 'const handleDrugFeeOnlyChange = async', 'const handleRecordAiSuggestionDecision = async');
  assert.match(drugFeeOnlyBody, /const previousOptions = claimOptions/);
  assert.match(drugFeeOnlyBody, /await applyClaimOptionsWithAudit\(/);
  assert.match(drugFeeOnlyBody, /rollbackMessage: CLAIM_ACTION_MESSAGES\.drugFeeOnlyAuditRolledBack/);
  assert.match(drugFeeOnlyBody, /outcome\.status === 'rolled_back'/);
  assert.match(drugFeeOnlyBody, /alert\(outcome\.message\)/);

  const feeToggleBody = section(printSource, 'const handleFeeToggle = async', 'const handleToggleIppoka = async');
  assert.match(feeToggleBody, /const previousOptions = claimOptions/);
  assert.match(feeToggleBody, /await applyClaimOptionsWithAudit\(/);
  assert.match(feeToggleBody, /rollbackMessage: CLAIM_ACTION_MESSAGES\.feeToggleAuditRolledBack/);
  assert.match(feeToggleBody, /outcome\.status === 'rolled_back'/);
  assert.match(feeToggleBody, /throw new Error\(outcome\.message\)/);

  // 算定切替が監査ログを通さない素の保存へ戻っていないこと。
  assert.doesNotMatch(feeToggleBody, /const auditOk = await logAuditAction\(/);
  assert.doesNotMatch(drugFeeOnlyBody, /const auditOk = await logAuditAction\(/);
});

test('print page delegates item-level claim flags to the audited claim action', () => {
  const body = section(printSource, 'const handleItemClaimToggle = async', 'const handleTokkanChange = async');

  assert.match(printSource, /function getClaimItemFlagValue/);
  assert.match(body, /currentItem && currentItem\.itemId === itemId/);
  assert.match(body, /await applyItemClaimFlagWithAudit\(/);
  assert.match(body, /item: currentItem/);
  assert.doesNotMatch(body, /const auditOk = await logAuditAction\(/);
});

test('print page tells the user why a claim lifecycle change did not go through', () => {
  const wrapper = section(printSource, 'const tryPersistClaimLifecycle = async', 'const itemsForUke = useMemo');
  // 失敗を投げるだけだと、画面は元に戻るのに何も表示されない(実ブラウザで確認)。理由を alert で見せる。
  assert.match(wrapper, /await persistClaimLifecycle\(nextLifecycle, detail\)/);
  assert.match(wrapper, /alert\(/);
  assert.match(wrapper, /return false/);

  // 返戻登録・再請求準備・請求完了は、素の persistClaimLifecycle ではなく、この包みを通す
  for (const [start, end] of [
    ['const handleRegisterReturn = async', 'const selectedReturnReason ='],
    ['const handlePrepareRebilling = async', 'const handleCloseClaim = async'],
    ['const handleCloseClaim = async', 'const claimExportSnapshot =']
  ]) {
    const body = section(printSource, start, end);
    assert.match(body, /tryPersistClaimLifecycle\(/, start);
    assert.doesNotMatch(body, /[^y]persistClaimLifecycle\(/, start);
  }
});

test('print page registers returns with a reason code, not free text', () => {
  const body = section(printSource, 'const handleRegisterReturn = async', 'const selectedReturnReason =');

  // 返戻理由は集計・突合できるコードで残す。自由記述の prompt へ戻さないこと。
  assert.doesNotMatch(body, /window\.prompt\(/);
  assert.match(body, /buildReturnCorrectionSummary\(/);
  assert.match(body, /reasonCode: summary\.reason\.code/);
  assert.match(body, /tryPersistClaimLifecycle\(nextLifecycle, summary\.auditDetails\)/);

  // 選択 UI が消えると、コードは既定値のまま固定されてしまう。
  assert.match(printSource, /data-testid="claim-return-reason-picker"/);
  assert.match(printSource, /data-testid="claim-return-reason-code"/);
  assert.match(printSource, /data-testid="claim-return-reason-note"/);
  assert.match(printSource, /OFFICIAL_CLAIM_RETURN_REASONS\.map\(/);

  // 記録済みのコードが画面に出ないと、どの理由で返戻登録したのかを
  // 監査ログを開くまで確認できない。
  assert.match(printSource, /data-testid="claim-registered-return-reason"/);
  assert.match(printSource, /formatClaimReturnReasonLabel\(claimLifecycle\.returnReasonCode\)/);
});

test('print page looks the prescription item document up before patching it', () => {
  const body = section(printSource, 'const handleItemClaimToggle = async', 'const handleTokkanChange = async');

  // 画面の明細は toJSON() 由来で RxDocument を持たない。
  // currentItem.doc に頼ると条件が常に false になり、チェックを操作しても
  // 何も保存されない状態に戻る (実際にそうなっていた)。
  assert.doesNotMatch(body, /currentItem\.doc/);
  assert.match(body, /await db\.prescription_items\.findOne\(itemId\)\.exec\(\)/);
  assert.match(body, /itemDoc,/);
});

test('print page lets the pharmacist pick a drug price revision with a warning', () => {
  const body = section(printSource, 'const handleDrugPriceOverrideChange = async', 'const handleTokkanChange = async');

  assert.match(body, /await applyDrugPriceOverrideWithAudit\(/);
  assert.match(body, /await db\.prescription_items\.findOne\(itemId\)\.exec\(\)/);
  assert.match(printSource, /data-testid=\{`drug-price-revision-\$\{item\.itemId\}`\}/);
  // 調剤日時点と違う版を選んだことが画面から消えないこと
  assert.match(printSource, /data-testid=\{`drug-price-override-warning-\$\{item\.itemId\}`\}/);
  assert.match(printSource, /drugPriceWarningByItemId\[item\.itemId\]/);
});

test('print page delegates claim lifecycle transitions to the audited claim action', () => {
  const body = section(printSource, 'const persistClaimLifecycle = async', 'const handleDownloadUke = async');

  assert.match(body, /await persistClaimLifecycleWithAudit\(/);
  assert.match(body, /applyLifecycle: applyClaimLifecycleToVisit/);
  assert.doesNotMatch(body, /const auditOk = await logAuditAction\(/);
});

test('print page surfaces AI assist suggestions with decision audit logging', () => {
  assert.match(printSource, /buildAiSuggestionsFromPrescriptionAudit/);
  assert.match(printSource, /AI補助/);
  assert.match(printSource, /data-testid="ai-assist-suggestion"/);
  assert.match(printSource, /信頼度 \{formatAiSuggestionConfidence\(suggestion\)\}/);
  assert.match(printSource, /handleRecordAiSuggestionDecision/);
  assert.match(printSource, /review_ai_suggestions/);
  assert.match(printSource, /ai_suggestion_review/);
  assert.match(printSource, />採用</);
  assert.match(printSource, />修正</);
  assert.match(printSource, />却下</);
  assert.match(printSource, /filterAiAssistItemsByMode/);
  assert.match(printSource, /data-testid="ai-assist-mode-notice"/);
  assert.match(printSource, /通常の処方監査は継続します/);
});

test('print page can open the intervention record flow from pharmacist confirmation', () => {
  assert.match(printSource, /handleOpenIntervention/);
  assert.match(printSource, /openIntervention: '1'/);
  assert.match(printSource, />疑義照会を記録</);
  assert.match(emrSource, /searchParams\.get\('openIntervention'\) === '1'/);
  assert.match(emrSource, /setIsInterventionModalOpen\(true\)/);
  assert.match(emrSource, /setIntReason\(reason\)/);
});

test('print page manages UKE export lock, returns, and rebilling lifecycle', () => {
  assert.match(printSource, /claimLifecycle/);
  assert.match(printSource, /markClaimExported/);
  assert.match(printSource, /markClaimReturned/);
  assert.match(printSource, /markClaimRebilling/);
  assert.match(printSource, /markClaimClosed/);
  assert.match(printSource, /buildClaimExportSnapshot/);
  assert.match(printSource, /buildClaimSnapshotDifferenceCsv/);
  assert.match(printSource, /buildClaimReturnCorrectionHandoffMemo/);
  assert.match(printSource, /makeClaimSnapshotDifferenceCsvFileName/);
  assert.match(printSource, /compareClaimExportSnapshotToCurrent/);
  assert.match(printSource, /buildClaimReturnCorrectionSuggestions/);
  assert.match(printSource, /buildClaimReturnCorrectionAction/);
  assert.match(printSource, /exportSnapshot/);
  assert.match(printSource, /claimSnapshotDifferences/);
  assert.match(printSource, /claimReturnCorrectionSuggestions/);
  assert.match(printSource, /handleReturnCorrectionAction/);
  assert.match(printSource, /handleDownloadClaimSnapshotDifferenceCsv/);
  assert.match(printSource, /handleCopyClaimReturnCorrectionMemo/);
  assert.match(printSource, /data-testid="claim-snapshot-diff-csv-button"/);
  assert.match(printSource, /data-testid="claim-return-correction-memo-button"/);
  assert.match(printSource, /請求時点差分CSVエクスポート/);
  assert.match(printSource, /返戻修正メモコピー/);
  assert.match(printSource, /data-testid=\{`return-correction-action-\$\{suggestion\.actionTarget\}`\}/);
  assert.match(printSource, /data-return-correction-id=\{suggestion\.id\}/);
  assert.match(printSource, /data-return-correction-target=\{suggestion\.actionTarget\}/);
  assert.match(printSource, /claim-adjust-panel/);
  assert.match(printSource, /data-testid="claim-adjust-panel"/);
  assert.match(claimSnapshotSource, /openInsurance: '1'/);
  assert.match(claimSnapshotSource, /openIntervention: '1'/);
  assert.match(claimSnapshotSource, /returnCorrection: suggestion\.id/);
  assert.match(claimSnapshotSource, /elementId: 'claim-adjust-panel'/);
  assert.match(printSource, /accepted/);
  assert.match(printSource, /canDownloadUke/);
  assert.match(printSource, /canCloseClaim/);
  assert.match(printSource, /isClaimLifecycleLocked/);
  assert.match(printSource, /getClaimEditBlockedMessage/);
  assert.match(printSource, /isClaimEditBlocked/);
  assert.match(printSource, /ensureClaimEditable/);
  assert.match(printSource, /claim_lifecycle/);
  assert.match(printSource, /請求ライフサイクル/);
  assert.match(printSource, /請求時点スナップショット/);
  assert.match(printSource, /返戻修正候補/);
  assert.match(printSource, /suggestion\.actionLabel/);
  assert.match(printSource, /現在の患者マスター、処方、点数との差分はありません/);
  assert.match(printSource, /請求時点: \{difference\.snapshotValue\}/);
  assert.match(printSource, /返戻登録/);
  assert.match(printSource, /再請求\/月遅れ/);
  assert.match(printSource, /請求完了/);
  assert.match(printSource, /UKE出力後の請求はロック中/);
  assert.match(printSource, /disabled=\{!canEditBilling/);
});

test('print page manages electronic prescription dispensing-result lifecycle operations', () => {
  assert.match(printSource, /VisitElectronicPrescription/);
  assert.match(printSource, /ElectronicPrescriptionOperationKind/);
  assert.match(printSource, /ElectronicPrescriptionOperationResult/);
  assert.match(printSource, /buildElectronicPrescriptionDispensingPayload/);
  const dispensingPayloadBody = section(printSource, 'const buildElectronicPrescriptionDispensingPayload = () => ({', '  const patchElectronicPrescriptionMetadata = async');
  assert.match(dispensingPayloadBody, /yakureki-electronic-prescription-dispensing-result/);
  assert.doesNotMatch(dispensingPayloadBody, /\bvisitId,/);
  assert.match(dispensingPayloadBody, /prescribedDrugCodeStatus/);
  assert.match(dispensingPayloadBody, /sourceDrugName/);
  assert.match(dispensingPayloadBody, /masterDrugName/);
  assert.match(dispensingPayloadBody, /drugNameVerificationStatus/);
  assert.match(dispensingPayloadBody, /unitCode/);
  assert.match(dispensingPayloadBody, /usageCode/);
  assert.match(dispensingPayloadBody, /usageFallbackText/);
  assert.match(dispensingPayloadBody, /signatureRequirement/);
  assert.match(dispensingPayloadBody, /hpkiSignatureRequired/);
  assert.match(printSource, /patchElectronicPrescriptionMetadata/);
  assert.match(printSource, /buildNextElectronicPrescriptionMetadata/);
  assert.match(printSource, /linkedPrescriptions/);
  assert.match(printSource, /prescriptionIds/);
  assert.match(printSource, /dispensingInformationFile/);
  assert.match(printSource, /handleElectronicPrescriptionOperation/);
  assert.match(printSource, /\/api\/electronic-prescription\/operation/);
  assert.match(printSource, /electronic_prescription/);
  assert.match(printSource, /電子処方箋操作送信/);
  assert.match(printSource, /電子処方箋操作完了/);
  assert.match(printSource, /data-testid="electronic-prescription-lifecycle-panel"/);
  assert.match(printSource, /data-testid="electronic-prescription-duplicate-check-button"/);
  assert.match(printSource, /data-testid="electronic-prescription-register-dispensing-result-button"/);
  assert.match(printSource, /data-testid="electronic-prescription-search-dispensing-result-button"/);
  assert.match(printSource, /data-testid="electronic-prescription-change-dispensing-result-button"/);
  assert.match(printSource, /data-testid="electronic-prescription-cancel-dispensing-result-button"/);
  assert.match(printSource, /data-testid="electronic-prescription-cancel-reception-button"/);
  assert.match(printSource, /duplicate_check/);
  assert.match(printSource, /dispensing_result_register/);
  assert.match(printSource, /dispensing_result_search/);
  assert.match(printSource, /dispensing_result_cancel/);
  assert.match(printSource, /dispensing_result_change/);
  assert.match(printSource, /reception_cancel/);
  assert.match(printSource, /調剤結果登録/);
  assert.match(printSource, /調剤結果ID検索/);
  assert.match(printSource, /調剤情報提供ファイル署名/);
  assert.match(printSource, /ELECTRONIC_PRESCRIPTION_FILE_SIGNATURE_STATUS_LABELS/);
  assert.match(printSource, /ELECTRONIC_PRESCRIPTION_HPKI_STATUS_LABELS/);
  assert.match(printSource, /HPKI/);
  assert.match(printSource, /受付取消/);
  assert.match(printSource, /validateElectronicPrescriptionLifecycleOperation/);
  assert.match(printSource, /electronicPrescriptionLifecycleDecision\('reception_cancel'\)/);
  assert.match(printSource, /requiresElectronicPrescriptionDispensingHpkiSignature/);
  assert.match(printSource, /data-testid="electronic-prescription-supplementary-display"/);
  assert.match(printSource, /data-testid="electronic-prescription-supplementary-print"/);
  assert.match(printSource, /electronicUnitConversion/);
  assert.match(printSource, /electronicUsageSupplementText/);

  // ElectronicPrescriptionPrintPanel の実描画検証（renderToStaticMarkup による真正な DOM / data-testid 検証）
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

  assert.ok(panelHtml.includes('data-testid="electronic-prescription-lifecycle-panel"'), '電子処方箋ライフサイクルパネルが存在すること');
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-duplicate-check-button"'), '重複投薬確認ボタンが存在すること');
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-register-dispensing-result-button"'), '調剤結果登録ボタンが存在すること');
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-search-dispensing-result-button"'), '調剤結果検索ボタンが存在すること');
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-change-dispensing-result-button"'), '調剤結果変更ボタンが存在すること');
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-cancel-dispensing-result-button"'), '調剤結果取消ボタンが存在すること');
  assert.ok(panelHtml.includes('data-testid="electronic-prescription-cancel-reception-button"'), '受付取消ボタンが存在すること');
  assert.ok(panelHtml.includes('電子署名済 (HPKI検証成功)'), 'HPKI署名テキストが表示されること');
  assert.ok(panelHtml.includes('sha256-abcdef123456'), 'ハッシュ値が表示されること');
});

test('emr page opens picking support from query parameter and targets the requested visit', () => {
  assert.match(emrSource, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(emrSource, /const visitId = searchParams\.get\('visitId'\)/);
  assert.match(emrSource, /setTargetVisitId\(visitId\)/);
  assert.match(emrSource, /searchParams\.get\('openPicking'\) === '1'/);
  assert.match(emrSource, /setIsPickingModalOpen\(true\)/);
  assert.match(emrSource, /db\.visits\.findOne\(targetVisitId\)\.exec\(\)/);
});

test('emr page blocks locked claims before prescription, picking, soap, and stock changes', () => {
  assert.match(emrSource, /getClaimEditBlockedMessage/);
  assert.match(emrSource, /isClaimEditBlocked/);
  assert.match(emrSource, /ensureActiveVisitEditable/);
  assert.match(emrSource, /ensureActiveVisitEditable\('picking'\)/);
  assert.match(emrSource, /ensureActiveVisitEditable\('soap'\)/);
  assert.match(emrSource, /getClaimEditBlockedMessage\(visit\.claimLifecycle, 'stock'\)/);
});

test('print helper pure functions execute deterministically', async () => {
  const {
    stableHashText,
    calculatePatientAge,
    getPatientIdentityMark,
    formatPrescriptionAuditIssues
  } = await import('./helpers');
  const { PATIENT_IDENTITY_MARKS } = await import('./types');

  assert.equal(stableHashText('a'), stableHashText('a'));
  assert.ok(typeof calculatePatientAge('1990-01-01') === 'number');
  assert.ok(PATIENT_IDENTITY_MARKS.includes(getPatientIdentityMark('p1', 'v1')));
  assert.ok(formatPrescriptionAuditIssues([{ title: 't', message: 'm' } as any]).includes('・t: m'));
});

test('dispensing record renders statutory intervention records block and connects with page data', () => {
  // 1. ページ側が <DispensingRecordPrint ... interventions={interventions} /> へ接続している契約
  assert.match(printSource, /<DispensingRecordPrint[\s\S]*interventions=\{interventions\}/);

  // 2. DispensingRecordPrint の真正な実描画テスト (renderToStaticMarkup)
  // 薬剤師法第24条・第28条第2項・施行規則第16条第1項第10号に基づく法定記載項目（照会日時、処方医、区分、内容、回答、同意、担当薬剤師）を検証
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
      pharmacyInfo: {
        name: 'テスト薬局',
        code: '1312345',
        postalCode: '100-0001',
        address: '千代田区',
        phone: '03-1234-5678',
        registrationNumber: 'T1234567890123',
        pharmacistName: '鈴木 花子'
      },
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

  assert.ok(htmlWithInterventions.includes('data-testid="record-intervention-box"'), '法定疑義照会ボックスが存在すること');
  assert.ok(htmlWithInterventions.includes('疑義照会・処方変更の記録（薬剤師法第24条・第28条・施行規則第16条第1項第10号）'), '法定タイトルが表示されること');
  assert.ok(htmlWithInterventions.includes('record-intervention-table'), 'テーブル構造が存在すること');
  assert.ok(htmlWithInterventions.includes('山田 太郎 医師 (電話)'), '処方医と照会方法が表示されること');
  assert.ok(htmlWithInterventions.includes('後発医薬品変更'), '区分日本語ラベルが表示されること');
  assert.ok(htmlWithInterventions.includes('患者希望による後発医薬品への銘柄変更の確認'), '疑義内容が表示されること');
  assert.ok(htmlWithInterventions.includes('変更了承。処方通りの用量で調剤のこと。'), '回答結果が表示されること');
  assert.ok(htmlWithInterventions.includes('鈴木 花子'), '担当薬剤師が表示されること');

  // 3. 疑義照会なし（0件）の場合の実描画検証
  const htmlWithoutInterventions = renderToStaticMarkup(
    React.createElement(DispensingRecordPrint, {
      patientData: { name: '患者 テスト' },
      visitData: {},
      prescriptionItems: [],
      pharmacyInfo: {
        name: 'テスト薬局',
        code: '1312345',
        postalCode: '100-0001',
        address: '千代田区',
        phone: '03-1234-5678',
        registrationNumber: 'T1234567890123',
        pharmacistName: '鈴木 花子'
      },
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
  assert.ok(htmlWithoutInterventions.includes('data-testid="record-intervention-box"'), '0件時も法定疑義照会ボックスが存在すること');
  assert.ok(htmlWithoutInterventions.includes('疑義照会・処方変更なし'), '疑義照会なしメッセージが表示されること');
});

test('print page renders MedicineBagPrint component with true DOM structure', () => {
  const patientData = { name: '薬袋 花子', patientId: 'pat_bag' };
  const mockPharmacyInfo = {
    name: 'テスト調剤薬局',
    code: '1312345',
    postalCode: '100-0001',
    address: '東京都千代田区',
    phone: '03-1234-5678',
    registrationNumber: 'T1234567890123',
    pharmacistName: 'テスト 薬剤師'
  };
  const groupedForBags = {
    '1日1回朝食後': [
      {
        itemId: 'item_bag_1',
        drugName: 'アムロジピン錠5mg',
        dispensedDrug: 'アムロジピンOD錠5mg「トーワ」',
        amount: 1,
        days: 14,
        usage: '1日1回朝食後',
        usageSupplementText: '血圧測定後に服用',
        dosageCategory: 'internal',
        unit: '錠'
      }
    ]
  };

  const html = renderToStaticMarkup(
    React.createElement(MedicineBagPrint, {
      patientData,
      groupedForBags,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区',
      receiptRunId: 'RUN-BAG-001',
      dispensingDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(html.includes('data-testid="medicine-bag-doc"'), '薬袋ドキュメント要素が存在すること');
  assert.ok(html.includes('yakutai-doc internal-bag'), '内服薬袋クラスが付与されていること');
  assert.ok(html.includes('内服薬'), '内服薬ラベルが表示されること');
  assert.ok(html.includes('薬袋 花子 様'), '患者名が表示されること');
  assert.ok(html.includes('アムロジピンOD錠5mg「トーワ」'), '調剤薬品名が表示されること');
  assert.ok(html.includes('1日1回朝食後'), '用法が表示されること');
  assert.ok(html.includes('（血圧測定後に服用）'), '用法補足が表示されること');
  assert.ok(html.includes('14日分'), '日数が表示されること');
  assert.ok(html.includes('朝食後'), '朝食後バッジが表示されること');
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
  const mockPharmacyInfo = {
    name: 'テスト調剤薬局',
    code: '1312345',
    postalCode: '100-0001',
    address: '東京都千代田区',
    phone: '03-1234-5678',
    registrationNumber: 'T1234567890123',
    pharmacistName: 'テスト 薬剤師'
  };
  const calculatedFees = [
    { code: 'base_fee', name: '調剤基本料1', rationale: '基本料1 (45点)', points: 45, receiptFeeCode: '410004110' },
    { code: 'drug_fee', name: '薬剤料', rationale: '薬剤料 (14点)', points: 14, receiptFeeCode: '620000001' }
  ];
  const insuranceAmounts = {
    burdenRatio: 30,
    totalCostYen: 590,
    insurerBurdenYen: 410,
    patientCopayYen: 180
  };

  // 1. ReceiptStatementPrint 実描画
  const stmtHtml = renderToStaticMarkup(
    React.createElement(ReceiptStatementPrint, {
      patientData,
      visitData,
      calculatedFees,
      totalPoints: 59,
      insuranceAmounts,
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区',
      receiptRunId: 'RUN-STMT-001',
      currentDateStr: '2026年10月6日',
      patientBirthDateStr: '1980年1月1日',
      dispensingDateStr: '2026年10月6日',
      prescriptionDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(stmtHtml.includes('data-testid="receipt-statement-doc"'), '調剤明細書ドキュメント要素が存在すること');
  assert.ok(stmtHtml.includes('調剤明細書'), '明細書タイトルが表示されること');
  assert.ok(stmtHtml.includes('明細 太郎 様'), '患者名が表示されること');
  assert.ok(stmtHtml.includes('59 点'), '合計点数が表示されること');
  assert.ok(stmtHtml.includes('¥180'), '患者負担金額が表示されること');
  assert.ok(stmtHtml.includes('調剤基本料1'), '算定項目名が表示されること');

  // 2. ReceiptPrint 実描画
  const rcptHtml = renderToStaticMarkup(
    React.createElement(ReceiptPrint, {
      patientData,
      totalPoints: 59,
      insuranceAmounts,
      receiptBreakdownRows: [
        { label: '調剤基本料', points: 45, note: '45点' },
        { label: '薬剤料', points: 14, note: '14点' }
      ],
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区',
      receiptRunId: 'RUN-RCPT-001',
      currentDateStr: '2026年10月6日',
      dispensingDateStr: '2026年10月6日',
      prescriptionDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(rcptHtml.includes('data-testid="receipt-doc"'), '領収証ドキュメント要素が存在すること');
  assert.ok(rcptHtml.includes('領収証'), '領収証タイトルが表示されること');
  assert.ok(rcptHtml.includes('患者様控'), '患者様控が表示されること');
  assert.ok(rcptHtml.includes('¥180'), '領収金額が表示されること');
  assert.ok(rcptHtml.includes('調剤基本料'), '費用区分が表示されること');
});

test('print page renders MedicineNotebookStickerPrint component with true DOM structure', () => {
  const patientData = { name: '手帳 太郎', patientId: 'pat_stk' };
  const mockPharmacyInfo = {
    name: 'テスト調剤薬局',
    code: '1312345',
    postalCode: '100-0001',
    address: '東京都千代田区',
    phone: '03-1234-5678',
    registrationNumber: 'T1234567890123',
    pharmacistName: 'テスト 薬剤師'
  };
  const prescriptionItems = [
    {
      itemId: 'stk_1',
      drugName: 'アムロジピン錠5mg',
      dispensedDrug: 'アムロジピンOD錠5mg「トーワ」',
      amount: 1,
      days: 14,
      usage: '1日1回朝食後',
      rpNumber: 1,
      unit: '錠'
    }
  ];

  const html = renderToStaticMarkup(
    React.createElement(MedicineNotebookStickerPrint, {
      patientData,
      prescriptionItems,
      pharmacyInfo: mockPharmacyInfo,
      dispensingDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(html.includes('data-testid="medicine-notebook-sticker-doc"'), 'お薬手帳シールドキュメント要素が存在すること');
  assert.ok(html.includes('handbook-sticker'), '手帳ステッカークラスが存在すること');
  assert.ok(html.includes('手帳 太郎 様'), '患者名が表示されること');
  assert.ok(html.includes('アムロジピンOD錠5mg「トーワ」'), '調剤薬名が表示されること');
  assert.ok(html.includes('14日分'), '日数が表示されること');
  assert.ok(html.includes('1日1回朝食後'), '用法が表示されること');
});

test('print page renders LiquidLabelSheetPrint and OintmentLabelSheetPrint components with true DOM structure', () => {
  const patientData = { name: '外用 太郎', patientId: 'pat_ext' };
  const mockPharmacyInfo = {
    name: 'テスト調剤薬局',
    code: '1312345',
    postalCode: '100-0001',
    address: '東京都千代田区',
    phone: '03-1234-5678',
    registrationNumber: 'T1234567890123',
    pharmacistName: 'テスト 薬剤師'
  };

  // 1. 水剤ラベル実描画
  const liquidHtml = renderToStaticMarkup(
    React.createElement(LiquidLabelSheetPrint, {
      patientData,
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
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区',
      currentDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(liquidHtml.includes('data-testid="liquid-label-sheet-doc"'), '水剤ラベルシート要素が存在すること');
  assert.ok(liquidHtml.includes('水剤'), '水剤タイトルが表示されること');
  assert.ok(liquidHtml.includes('外用 太郎 様'), '患者名が表示されること');
  assert.ok(liquidHtml.includes('テストシロップ'), 'シロップ薬品名が表示されること');

  // 2. 軟膏ラベル実描画
  const ointmentHtml = renderToStaticMarkup(
    React.createElement(OintmentLabelSheetPrint, {
      patientData,
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
      pharmacyInfo: mockPharmacyInfo,
      pharmacyAddressLine: '東京都千代田区',
      currentDateStr: '2026年10月6日',
      renderIdentityMark: () => null
    })
  );

  assert.ok(ointmentHtml.includes('data-testid="ointment-label-sheet-doc"'), '軟膏ラベルシート要素が存在すること');
  assert.ok(ointmentHtml.includes('外用'), '外用タイトルが表示されること');
  assert.ok(ointmentHtml.includes('テスト軟膏'), '軟膏薬品名が表示されること');
});

test('print page renders EmergencyRecoveryKeySheetPrint and PharmacyDeviceHandoffPanel components with true DOM structure', () => {
  // 1. 非常時復旧鍵シート実描画（未発行状態）
  const escrowHtml = renderToStaticMarkup(
    React.createElement(EmergencyRecoveryKeySheetPrint, {
      escrow: null,
      facilityName: 'テスト薬局',
      facilityAddress: '東京都千代田区',
      facilityPhone: '03-1234-5678',
      renderIdentityMark: () => null
    })
  );

  assert.ok(escrowHtml.includes('data-testid="emergency-recovery-key-sheet-doc"'), '復旧鍵シート要素が存在すること');
  assert.ok(escrowHtml.includes('【未発行・認証前】緊急復旧用 暗号鍵エスクローシート'), '未発行警告が表示されること');

  // 2. 外部調剤機器連携パネル実描画
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
      } as any,
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

  assert.ok(deviceHtml.includes('data-testid="pharmacy-device-handoff-panel"'), '機器連携パネル要素が存在すること');
  assert.ok(deviceHtml.includes('外部調剤機器連携'), '機器連携タイトルが表示されること');
  assert.ok(deviceHtml.includes('送信可能'), '送信可能ステータスが表示されること');
  assert.ok(deviceHtml.includes('data-testid="pharmacy-device-submit-button"'), '送信ボタンが存在すること');
});

