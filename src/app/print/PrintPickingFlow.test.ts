import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const printSource = readFileSync(new URL('./[visitId]/page.tsx', import.meta.url), 'utf8');
const emrSource = readFileSync(new URL('../emr/page.tsx', import.meta.url), 'utf8');
const claimSnapshotSource = readFileSync(new URL('../../lib/claim_snapshot.ts', import.meta.url), 'utf8');

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
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
  assert.match(printSource, /data-testid="print-execute-button"/);
  assert.match(printSource, /data-testid="pharmacist-check-panel"/);
  assert.match(printSource, /data-testid="claim-check-panel"/);
  assert.match(printSource, /data-testid="claim-lifecycle-panel"/);
  assert.match(printSource, /data-testid="dispensing-record-doc"/);
  assert.match(printSource, /data-testid="receipt-statement-doc"/);
});

test('print page requires audit logging before printing documents', () => {
  const body = section(printSource, 'const handlePrint = async', 'const persistClaimLifecycle = async');

  assert.match(body, /if \(!db\)/);
  assert.match(body, /const auditOk = await logAuditAction\(\s*db,\s*'print'/);
  assert.match(body, /印刷の監査ログ記録に失敗したため、印刷を中止しました。/);

  const auditIndex = body.indexOf("const auditOk = await logAuditAction(");
  const printIndex = body.indexOf('window.print()');
  assert.ok(auditIndex > -1);
  assert.ok(printIndex > auditIndex);
});

test('print page rolls back billing option changes when audit logging fails', () => {
  const persistBody = section(printSource, 'const persistClaimOptions = async', 'const ensurePermission =');
  assert.match(persistBody, /throw new Error\('データベースの初期化が完了していません。'\)/);
  assert.match(persistBody, /throw new Error\('対象の受付が見つかりません。'\)/);

  const drugFeeOnlyBody = section(printSource, 'const handleDrugFeeOnlyChange = async', 'const handleFeeToggle = async');
  assert.match(drugFeeOnlyBody, /const previousOptions = claimOptions/);
  assert.match(drugFeeOnlyBody, /const auditOk = await logAuditAction\(\s*db,\s*'billing_toggle'/);
  assert.match(drugFeeOnlyBody, /if \(!auditOk\)/);
  assert.match(drugFeeOnlyBody, /await persistClaimOptions\(previousOptions\)/);
  assert.match(drugFeeOnlyBody, /点数請求切替の監査ログ記録に失敗したため、変更を元に戻しました。/);

  const feeToggleBody = section(printSource, 'const handleFeeToggle = async', 'const handleItemClaimToggle = async');
  assert.match(feeToggleBody, /const previousOptions = claimOptions/);
  assert.match(feeToggleBody, /const auditOk = await logAuditAction\(\s*db,\s*'billing_toggle'/);
  assert.match(feeToggleBody, /if \(!auditOk\)/);
  assert.match(feeToggleBody, /await persistClaimOptions\(previousOptions\)/);
  assert.match(feeToggleBody, /算定切替の監査ログ記録に失敗したため、変更を元に戻しました。/);
});

test('print page rolls back item-level claim flags when audit logging fails', () => {
  const body = section(printSource, 'const handleItemClaimToggle = async', 'const handleReceiptRemarkChange =');

  assert.match(printSource, /function getClaimItemFlagValue/);
  assert.match(body, /const previousPatch: Record<string, boolean>/);
  assert.match(body, /const auditOk = await logAuditAction\(\s*db,\s*'billing_toggle'/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /await currentItem\.doc\.patch\(previousPatch\)/);
  assert.match(body, /処方薬別算定切替の監査ログ記録に失敗したため、変更を元に戻しました。/);
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
});

test('emr page opens picking support from query parameter and targets the requested visit', () => {
  assert.match(emrSource, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(emrSource, /const visitId = searchParams\.get\('visitId'\)/);
  assert.match(emrSource, /setTargetVisitId\(visitId\)/);
  assert.match(emrSource, /searchParams\.get\('openPicking'\) === '1'/);
  assert.match(emrSource, /setIsPickingModalOpen\(true\)/);
  assert.match(emrSource, /searchParams\.get\('openInsurance'\) !== '1'/);
  assert.match(emrSource, /setHasOpenedInsuranceFromQuery\(true\)/);
  assert.match(emrSource, /患者・保険・公費情報の構造化登録/);
  assert.match(emrSource, /m-patient-name/);
  assert.match(emrSource, /m-patient-birth-date/);
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
