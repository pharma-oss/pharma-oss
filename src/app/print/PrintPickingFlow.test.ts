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
  assert.match(printSource, /data-testid="print-execute-button"/);
  assert.match(printSource, /data-testid="pharmacist-check-panel"/);
  assert.match(printSource, /data-testid="claim-check-panel"/);
  assert.match(printSource, /data-testid="claim-lifecycle-panel"/);
  assert.match(printSource, /data-testid="dispensing-record-doc"/);
  assert.match(printSource, /data-testid="receipt-statement-doc"/);
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
  assert.match(body, /outcome\.status === 'blocked'/);
  assert.match(body, /alert\(outcome\.message\)/);

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

test('print page registers returns with a reason code, not free text', () => {
  const body = section(printSource, 'const handleRegisterReturn = async', 'const selectedReturnReason =');

  // 返戻理由は集計・突合できるコードで残す。自由記述の prompt へ戻さないこと。
  assert.doesNotMatch(body, /window\.prompt\(/);
  assert.match(body, /buildReturnCorrectionSummary\(/);
  assert.match(body, /reasonCode: summary\.reason\.code/);
  assert.match(body, /persistClaimLifecycle\(nextLifecycle, summary\.auditDetails\)/);

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
    toDateOnly,
    calculatePatientAge,
    getPatientIdentityMark,
    formatPrescriptionAuditIssues
  } = await import('./helpers');
  const { PATIENT_IDENTITY_MARKS } = await import('./types');

  assert.equal(stableHashText('a'), stableHashText('a'));
  assert.equal(toDateOnly('2026-08-23T10:00:00Z'), '2026-08-23');
  assert.ok(typeof calculatePatientAge('1990-01-01') === 'number');
  assert.ok(PATIENT_IDENTITY_MARKS.includes(getPatientIdentityMark('p1', 'v1')));
  assert.ok(formatPrescriptionAuditIssues([{ title: 't', message: 'm' } as any]).includes('・t: m'));
});

