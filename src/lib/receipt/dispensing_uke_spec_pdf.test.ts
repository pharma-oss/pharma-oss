import { test } from 'node:test';
import assert from 'node:assert';
import {
  DISPENSING_UKE_KNOWN_RECORD_SPEC,
  type DispensingUkeRecordSpec,
  DISPENSING_UKE_RECORD_SPEC_SOURCE
} from './dispensing_uke_validation.ts';
import {
  buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreviewCsv,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyDetailCsv,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionCandidateCsv,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlanCsv,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlanTypeScript,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionCsv,
  buildDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport,
  buildDispensingUkeSpecificationPdfAllFieldImplementationPack,
  buildDispensingUkeSpecificationPdfAllFieldImplementationPackText,
  buildDispensingUkeSpecificationPdfAllFieldCompletionGate,
  buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv,
  buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan,
  buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlanCsv,
  buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressCsv,
  buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview,
  buildDispensingUkeSpecificationPdfFieldDefinitionReview,
  buildDispensingUkeSpecificationPdfFieldDefinitionReviewCsv,
  buildDispensingUkeSpecificationPdfFieldCatalogCsv,
  buildDispensingUkeSpecificationPdfFieldReview,
  buildDispensingUkeSpecificationPdfRecordCoverageCsv,
  formatDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview,
  formatDispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport,
  formatDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan,
  formatDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport,
  formatDispensingUkeSpecificationPdfAllFieldCompletionGate,
  formatDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan,
  formatDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview,
  formatDispensingUkeSpecificationPdfFieldDefinitionReview,
  formatDispensingUkeSpecificationPdfFieldReview,
  parseDispensingUkeSpecificationPdfText
} from './dispensing_uke_spec_pdf.ts';

const EXPECTED_SPECS = DISPENSING_UKE_KNOWN_RECORD_SPEC.filter((spec) => ['YK', 'SN'].includes(spec.type));

function withAdditionalAllField(
  specs: DispensingUkeRecordSpec[],
  recordType: string,
  itemNumber: number,
  label: string
): DispensingUkeRecordSpec[] {
  return specs.map((spec) => spec.type === recordType
    ? {
      ...spec,
      allFields: [
        ...(spec.allFields ?? []),
        { index: itemNumber - 1, label, required: false, format: 'text' }
      ]
    }
    : spec);
}

const UKE_PDF_TEXT_EXCERPT = `
レセ電コード情報ファイル記録条件仕様 調剤
YK 薬局情報レコード
項番 項目名 モード 桁数 バイト数 必須
1 保険薬局コード 数字 7 7 必須
2 薬局名 漢字 40 80 必須
5 薬局所在地 漢字 80 160 任意
6 薬局電話番号 英数 15 15 任意

SN 公式サンプルSN情報レコード
項番 項目名 モード 桁数 バイト数 必須
1 SN区分 数字 1 1 必須
2 SN枝番 数字 2 2 必須
`;

test('parseDispensingUkeSpecificationPdfText extracts record field rows from searchable PDF text', () => {
  const result = parseDispensingUkeSpecificationPdfText(UKE_PDF_TEXT_EXCERPT, EXPECTED_SPECS);

  assert.deepStrictEqual(result.issues, []);
  assert.deepStrictEqual(result.recordTypes, ['SN', 'YK']);
  assert.strictEqual(result.fields.length, 6);
  assert.strictEqual(result.fields[0].recordType, 'YK');
  assert.strictEqual(result.fields[0].itemNumber, 1);
  assert.strictEqual(result.fields[0].label, '保険薬局コード');
  assert.strictEqual(result.fields[0].digits, 7);
  assert.strictEqual(result.fields[0].bytes, 7);
  assert.strictEqual(result.fields[0].required, true);
  assert.strictEqual(result.fields.find((field) => field.recordType === 'SN' && field.itemNumber === 2)?.label, 'SN枝番');
});

test('buildDispensingUkeSpecificationPdfFieldCatalogCsv exports all parsed PDF rows safely', () => {
  const result = parseDispensingUkeSpecificationPdfText(UKE_PDF_TEXT_EXCERPT, EXPECTED_SPECS);
  const csv = buildDispensingUkeSpecificationPdfFieldCatalogCsv(result);

  assert.match(csv, /^"出典","レコード種別","項番","項目名","モード","桁数","バイト数","必須","PDF本文行"/);
  assert.match(csv, /"YK","1","保険薬局コード","数字","7","7","必須","1 保険薬局コード 数字 7 7 必須"/);
  assert.match(csv, /"SN","2","SN枝番","数字","2","2","必須"/);

  const formulaSafeCsv = buildDispensingUkeSpecificationPdfFieldCatalogCsv(
    parseDispensingUkeSpecificationPdfText(
      `
      YK 薬局情報レコード
      3 =危険 英数 1 1 任意
      `,
      EXPECTED_SPECS
    )
  );

  assert.match(formulaSafeCsv, /"'=危険"/);
  assert.doesNotMatch(formulaSafeCsv, /","=危険"/);
});

test('buildDispensingUkeSpecificationPdfFieldDefinitionReview tracks full-field definition gaps', () => {
  const parseResult = parseDispensingUkeSpecificationPdfText(UKE_PDF_TEXT_EXCERPT, EXPECTED_SPECS);
  const review = buildDispensingUkeSpecificationPdfFieldDefinitionReview(parseResult, EXPECTED_SPECS);
  const completionGate = buildDispensingUkeSpecificationPdfAllFieldCompletionGate(parseResult, review, EXPECTED_SPECS);
  const completionGateCsv = buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv(completionGate);

  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.parsedFieldCount, 6);
  assert.strictEqual(review.definedFieldCount, 6);
  assert.strictEqual(review.needsDefinitionFieldCount, 0);
  assert.deepStrictEqual(review.needsDefinitionRecordTypes, []);
  assert.match(formatDispensingUkeSpecificationPdfFieldDefinitionReview(review), /PDF本文全項目定義: OK/);
  assert.strictEqual(completionGate.ok, true);
  assert.strictEqual(completionGate.statusLabel, '完了');
  assert.strictEqual(completionGate.parsedRecordTypeCount, 2);
  assert.strictEqual(completionGate.expectedRecordTypeCount, 2);
  assert.strictEqual(completionGate.remainingFieldCount, 0);
  assert.deepStrictEqual(completionGate.blockers, []);
  assert.match(formatDispensingUkeSpecificationPdfAllFieldCompletionGate(completionGate), /完了ゲート: 完了/);
  assert.match(completionGateCsv, /^"出典","判定","対象レコード数","抽出レコード数","抽出項目数","定義済み項目数","残項目数"/);
  assert.match(completionGateCsv, /"完了","2","2","6","6","0","complete"/);

  const gapPdfText = UKE_PDF_TEXT_EXCERPT.replace(
    '2 薬局名 漢字 40 80 必須',
    [
      '2 薬局名 漢字 40 80 必須',
      '3 =危険 英数 1 1 任意'
    ].join('\n')
  ).replace(
    '2 SN枝番 数字 2 2 必須',
    [
      '2 SN枝番 数字 2 2 必須',
      '3 SN追加項目 数字 1 1 必須'
    ].join('\n')
  );
  const gapParseResult = parseDispensingUkeSpecificationPdfText(gapPdfText, EXPECTED_SPECS);
  const gapReview = buildDispensingUkeSpecificationPdfFieldDefinitionReview(gapParseResult, EXPECTED_SPECS);
  const gapCompletionGate = buildDispensingUkeSpecificationPdfAllFieldCompletionGate(gapParseResult, gapReview, EXPECTED_SPECS);
  const gapCsv = buildDispensingUkeSpecificationPdfFieldDefinitionReviewCsv(gapReview);
  const implementationPlan = buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan(gapReview, EXPECTED_SPECS);
  const implementationPlanCsv = buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlanCsv(implementationPlan);
  const progressWithoutConfirmations = buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview(implementationPlan);
  const progressWithConfirmations = buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview(
    implementationPlan,
    [
      {
        taskId: 'YK-pdf-field-definition-implementation',
        status: 'ready_to_define',
        evidenceLabel: '仕様PDF YK 第3項目',
        owner: '請求担当',
        reviewedAt: '2026-06-19'
      },
      {
        taskId: 'SN-pdf-field-definition-implementation',
        status: 'implemented',
        evidenceLabel: '仕様PDF SN 第3項目',
        owner: '請求担当',
        reviewedAt: '2026-06-19',
        note: '=要再確認'
      }
    ]
  );
  const progressCsv = buildDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressCsv(progressWithConfirmations);
  const candidateReport = buildDispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport(
    gapReview,
    implementationPlan,
    progressWithConfirmations
  );
  const candidateCsv = buildDispensingUkeSpecificationPdfAllFieldDefinitionCandidateCsv(candidateReport);
  const applyPreviewFromGapText = buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview(
    gapPdfText,
    EXPECTED_SPECS,
    gapReview,
    candidateReport
  );
  const applyPreviewCsv = buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreviewCsv(applyPreviewFromGapText);
  const applyPreviewDetailCsv = buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyDetailCsv(applyPreviewFromGapText);
  const patchPlan = buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan(applyPreviewFromGapText);
  const patchPlanCsv = buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlanCsv(patchPlan);
  const patchPlanTypeScript = buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlanTypeScript(patchPlan);
  const remainingActionReport = buildDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport(applyPreviewFromGapText);
  const remainingActionCsv = buildDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionCsv(remainingActionReport);
  const duplicateApplyPreview = buildDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview(
    gapPdfText,
    withAdditionalAllField(EXPECTED_SPECS, 'YK', 3, '=危険'),
    gapReview,
    candidateReport
  );
  const duplicatePatchPlan = buildDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan(duplicateApplyPreview);
  const implementationPack = buildDispensingUkeSpecificationPdfAllFieldImplementationPack(
    gapPdfText,
    [
      {
        taskId: 'YK-pdf-field-definition-implementation',
        status: 'ready_to_define',
        evidenceLabel: '仕様PDF YK 第3項目',
        owner: '請求担当',
        reviewedAt: '2026-06-19'
      }
    ],
    EXPECTED_SPECS
  );
  const implementationPackText = buildDispensingUkeSpecificationPdfAllFieldImplementationPackText(implementationPack);

  assert.strictEqual(gapReview.ok, false);
  assert.strictEqual(gapReview.parsedFieldCount, 8);
  assert.strictEqual(gapReview.definedFieldCount, 6);
  assert.strictEqual(gapReview.needsDefinitionFieldCount, 2);
  assert.strictEqual(gapCompletionGate.ok, false);
  assert.strictEqual(gapCompletionGate.statusLabel, '未完了');
  assert.strictEqual(gapCompletionGate.remainingFieldCount, 2);
  assert.ok(gapCompletionGate.blockers.some((blocker) => blocker.code === 'remaining_field_definition'));
  assert.match(formatDispensingUkeSpecificationPdfAllFieldCompletionGate(gapCompletionGate), /未定義 SN・YK/);
  assert.deepStrictEqual(gapReview.needsDefinitionRecordTypes, ['SN', 'YK']);
  assert.ok(gapReview.items.some((item) => item.id === 'YK-3' && item.status === 'needs_definition'));
  assert.match(formatDispensingUkeSpecificationPdfFieldDefinitionReview(gapReview), /要定義 SN・YK/);
  assert.match(gapCsv, /^"出典","ID","レコード種別","項番","項目名","判定","モード","桁数","バイト数","必須","次の対応","完了条件","PDF本文行"/);
  assert.match(gapCsv, /"YK-3","YK","3","'=危険","全項目定義が必要"/);
  assert.doesNotMatch(gapCsv, /","=危険"/);
  assert.strictEqual(implementationPlan.readyForImplementation, true);
  assert.strictEqual(implementationPlan.taskCount, 2);
  assert.deepStrictEqual(implementationPlan.taskRecordTypes, ['YK', 'SN']);
  assert.deepStrictEqual(implementationPlan.criticalRecordTypes, ['YK']);
  assert.deepStrictEqual(implementationPlan.highRecordTypes, ['SN']);
  assert.strictEqual(implementationPlan.tasks[0].priorityLabel, '最優先');
  assert.strictEqual(implementationPlan.tasks[0].implementationScopeText, '常時生成');
  assert.match(implementationPlan.tasks[0].acceptanceCriteria.join(' / '), /要定義から消える/);
  assert.match(formatDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan(implementationPlan), /実装計画: 実装可能/);
  assert.match(formatDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan(implementationPlan), /優先 最優先 YK \/ 高 SN/);
  assert.match(implementationPlanCsv, /^"出典","ID","優先度","レコード種別","レコード名","実装範囲","対象項目","必須項目数","根拠","実装項目","完了条件","テスト観点"/);
  assert.match(implementationPlanCsv, /"YK-pdf-field-definition-implementation","最優先","YK","薬局情報","常時生成"/);
  assert.match(implementationPlanCsv, /"SN-pdf-field-definition-implementation","高","SN","公式サンプルSN情報","条件付き生成"/);
  assert.strictEqual(progressWithoutConfirmations.ok, false);
  assert.deepStrictEqual(progressWithoutConfirmations.blockedCriticalPathRecordTypes, ['SN', 'YK']);
  assert.match(formatDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview(progressWithoutConfirmations), /未確認の優先項目 SN・YK/);
  assert.strictEqual(progressWithConfirmations.ok, true);
  assert.strictEqual(progressWithConfirmations.decidedCount, 2);
  assert.strictEqual(progressWithConfirmations.readyToDefineCount, 1);
  assert.strictEqual(progressWithConfirmations.implementedCount, 1);
  assert.deepStrictEqual(progressWithConfirmations.readyToDefineRecordTypes, ['YK']);
  assert.deepStrictEqual(progressWithConfirmations.implementedRecordTypes, ['SN']);
  assert.match(formatDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview(progressWithConfirmations), /定義追加準備 YK/);
  assert.match(formatDispensingUkeSpecificationPdfFieldDefinitionImplementationProgressReview(progressWithConfirmations), /実装済み SN/);
  assert.match(progressCsv, /^"出典","ID","優先度","レコード種別","レコード名","項目","確認状態","根拠","担当","確認日時","次の対応","メモ"/);
  assert.match(progressCsv, /"YK-pdf-field-definition-implementation","最優先","YK","薬局情報".*"定義追加準備","仕様PDF YK 第3項目","請求担当","2026-06-19"/);
  assert.match(progressCsv, /"'=要再確認"/);
  assert.doesNotMatch(progressCsv, /","=要再確認"/);
  assert.strictEqual(candidateReport.ok, true);
  assert.strictEqual(candidateReport.candidateCount, 1);
  assert.deepStrictEqual(candidateReport.recordTypes, ['YK']);
  assert.deepStrictEqual(candidateReport.candidates[0].suggestedFieldSpec, {
    index: 2,
    label: '=危険',
    required: false,
    format: 'text'
  });
  assert.match(formatDispensingUkeSpecificationPdfAllFieldDefinitionCandidateReport(candidateReport), /allFields追加候補: OK/);
  assert.match(candidateCsv, /^"出典","ID","タスクID","レコード種別","項番","項目名","必須","PDFモード","PDF桁数","PDFバイト数","候補フォーマット","候補JSON","根拠","PDF本文行"/);
  assert.match(candidateCsv, /"YK-3-all-field-candidate","YK-pdf-field-definition-implementation","YK","3","'=危険","任意","英数","1","1","text"/);
  assert.doesNotMatch(candidateCsv, /SN-3-all-field-candidate/);
  assert.doesNotMatch(candidateCsv, /","=危険"/);
  assert.strictEqual(applyPreviewFromGapText.ok, true);
  assert.strictEqual(applyPreviewFromGapText.candidateCount, 1);
  assert.strictEqual(applyPreviewFromGapText.appliedCandidateCount, 1);
  assert.strictEqual(applyPreviewFromGapText.skippedCandidateCount, 0);
  assert.strictEqual(applyPreviewFromGapText.beforeNeedsDefinitionFieldCount, 2);
  assert.strictEqual(applyPreviewFromGapText.afterNeedsDefinitionFieldCount, 1);
  assert.strictEqual(applyPreviewFromGapText.resolvedFieldCount, 1);
  assert.deepStrictEqual(applyPreviewFromGapText.resolvedRecordTypes, ['YK']);
  assert.deepStrictEqual(applyPreviewFromGapText.remainingRecordTypes, ['SN']);
  assert.strictEqual(applyPreviewFromGapText.items.length, 1);
  assert.strictEqual(applyPreviewFromGapText.items[0].status, 'applied');
  assert.strictEqual(applyPreviewFromGapText.items[0].reason, 'YK第3項目を全項目定義へ追加します。');
  assert.strictEqual(applyPreviewFromGapText.updatedSpecs.find((spec) => spec.type === 'YK')?.allFields?.[0].label, '=危険');
  assert.match(formatDispensingUkeSpecificationPdfAllFieldDefinitionApplyPreview(applyPreviewFromGapText), /要定義 2->1/);
  assert.match(applyPreviewCsv, /^"出典","候補数","適用候補数","スキップ候補数","適用前要定義","適用後要定義","解消項目数","解消レコード","残レコード","判定","確認事項"/);
  assert.match(applyPreviewCsv, /"1","1","0","2","1","1","YK","SN","OK",""/);
  assert.match(applyPreviewDetailCsv, /^"出典","候補ID","タスクID","レコード種別","項番","項目名","判定","理由","候補JSON","根拠","PDF本文行"/);
  assert.match(applyPreviewDetailCsv, /"YK-3-all-field-candidate","YK-pdf-field-definition-implementation","YK","3","'=危険","適用予定","YK第3項目を全項目定義へ追加します。"/);
  assert.doesNotMatch(applyPreviewDetailCsv, /","=危険"/);
  assert.strictEqual(patchPlan.ok, true);
  assert.strictEqual(patchPlan.itemCount, 1);
  assert.strictEqual(patchPlan.appliedCandidateCount, 1);
  assert.deepStrictEqual(patchPlan.recordTypes, ['YK']);
  assert.deepStrictEqual(patchPlan.items[0].itemNumbers, [3]);
  assert.deepStrictEqual(patchPlan.items[0].addedFieldSpecs, [{
    index: 2,
    label: '=危険',
    required: false,
    format: 'text'
  }]);
  assert.strictEqual(patchPlan.items[0].fullAllFields[0].label, '=危険');
  assert.match(formatDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan(patchPlan), /allFields仕様反映案: OK/);
  assert.match(formatDispensingUkeSpecificationPdfAllFieldDefinitionPatchPlan(patchPlan), /対象 YK/);
  assert.match(patchPlanCsv, /^"出典","レコード種別","レコード名","追加候補数","追加項番","候補ID","根拠","追加する全項目定義JSON","反映後の全項目定義JSON"/);
  assert.match(patchPlanCsv, /"YK","薬局情報","1","3","YK-3-all-field-candidate","仕様PDF YK 第3項目"/);
  assert.match(patchPlanCsv, /\{""index"":2,""label"":""=危険"",""required"":false,""format"":""text""\}/);
  assert.match(patchPlanTypeScript, /^\/\/ 支払基金 令和8年6月版 レセプト電算処理システム記録条件仕様 調剤 PDF本文 allFields仕様反映案/);
  assert.match(patchPlanTypeScript, /\/\/ YK 薬局情報: 第3項目/);
  assert.match(patchPlanTypeScript, /\/\/ 根拠: 仕様PDF YK 第3項目/);
  assert.match(patchPlanTypeScript, /allFields: \[\n  \{ index: 2, label: "=危険", required: false, format: "text" \},\n\]/);
  assert.strictEqual(remainingActionReport.ok, false);
  assert.strictEqual(remainingActionReport.remainingFieldCount, 1);
  assert.deepStrictEqual(remainingActionReport.recordTypes, ['SN']);
  assert.deepStrictEqual(remainingActionReport.highRecordTypes, ['SN']);
  assert.strictEqual(remainingActionReport.items[0].fieldLabel, '第3項目: SN追加項目');
  assert.strictEqual(remainingActionReport.items[0].requiredFieldCount, 1);
  assert.match(formatDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport(remainingActionReport), /allFields残対応: 要対応/);
  assert.match(formatDispensingUkeSpecificationPdfAllFieldDefinitionRemainingActionReport(remainingActionReport), /優先 高 SN/);
  assert.match(remainingActionCsv, /^"出典","ID","優先度","レコード種別","レコード名","残項目数","残項番","残項目","必須項目数","次の対応","完了条件","PDF本文行"/);
  assert.match(remainingActionCsv, /"SN-pdf-field-definition-remaining-action","高","SN","公式サンプルSN情報","1","3","第3項目: SN追加項目","1"/);
  assert.strictEqual(duplicateApplyPreview.appliedCandidateCount, 0);
  assert.strictEqual(duplicateApplyPreview.skippedCandidateCount, 1);
  assert.strictEqual(duplicateApplyPreview.items[0].status, 'skipped_existing_definition');
  assert.match(duplicateApplyPreview.items[0].reason, /定義済み/);
  assert.strictEqual(duplicatePatchPlan.ok, false);
  assert.strictEqual(duplicatePatchPlan.itemCount, 0);
  assert.strictEqual(implementationPack.completionGate.remainingFieldCount, 2);
  assert.strictEqual(implementationPack.implementationPlan.taskCount, 2);
  assert.strictEqual(implementationPack.progressReview.readyToDefineCount, 1);
  assert.strictEqual(implementationPack.candidateReport.candidateCount, 1);
  assert.strictEqual(implementationPack.patchPlan.appliedCandidateCount, 1);
  assert.strictEqual(implementationPack.remainingActionReport.remainingFieldCount, 1);
  assert.match(implementationPackText, /^# 01_pdf_field_catalog\.csv/);
  assert.match(implementationPackText, /# 06_all_fields_candidates\.csv/);
  assert.match(implementationPackText, /# 11_all_fields_patch\.ts/);
  assert.match(implementationPackText, /allFields: \[/);
});

test('all-field completion gate rejects missing PDF record sections', () => {
  const ykOnlyPdfText = UKE_PDF_TEXT_EXCERPT.split('\nSN 公式サンプルSN情報レコード')[0];
  const parseResult = parseDispensingUkeSpecificationPdfText(ykOnlyPdfText, EXPECTED_SPECS);
  const review = buildDispensingUkeSpecificationPdfFieldDefinitionReview(parseResult, EXPECTED_SPECS);
  const gate = buildDispensingUkeSpecificationPdfAllFieldCompletionGate(parseResult, review, EXPECTED_SPECS);
  const csv = buildDispensingUkeSpecificationPdfAllFieldCompletionGateCsv(gate);

  assert.strictEqual(review.needsDefinitionFieldCount, 0);
  assert.strictEqual(gate.ok, false);
  assert.strictEqual(gate.statusLabel, '未完了');
  assert.deepStrictEqual(gate.missingRecordTypes, ['SN']);
  assert.ok(gate.blockers.some((blocker) => blocker.code === 'missing_record_type'));
  assert.match(formatDispensingUkeSpecificationPdfAllFieldCompletionGate(gate), /未抽出 SN/);
  assert.match(csv, /"missing_record_type","SN","PDF本文から抽出できていないレコードがあります"/);
});

test('buildDispensingUkeSpecificationPdfFieldDefinitionReview treats allFields as defined fields', () => {
  const specsWithYkThirdField = withAdditionalAllField(EXPECTED_SPECS, 'YK', 3, '都道府県');
  const gapParseResult = parseDispensingUkeSpecificationPdfText(
    UKE_PDF_TEXT_EXCERPT.replace(
      '2 薬局名 漢字 40 80 必須',
      [
        '2 薬局名 漢字 40 80 必須',
        '3 都道府県 英数 2 2 任意'
      ].join('\n')
    ),
    specsWithYkThirdField
  );
  const gapReview = buildDispensingUkeSpecificationPdfFieldDefinitionReview(gapParseResult, specsWithYkThirdField);
  const implementationPlan = buildDispensingUkeSpecificationPdfFieldDefinitionImplementationPlan(gapReview, specsWithYkThirdField);

  assert.strictEqual(gapReview.ok, true);
  assert.strictEqual(gapReview.definedFieldCount, 7);
  assert.strictEqual(gapReview.needsDefinitionFieldCount, 0);
  assert.deepStrictEqual(gapReview.needsDefinitionRecordTypes, []);
  assert.strictEqual(implementationPlan.taskCount, 0);
  assert.match(formatDispensingUkeSpecificationPdfFieldDefinitionReview(gapReview), /PDF本文全項目定義: OK/);
});

test('buildDispensingUkeSpecificationPdfFieldReview matches known key fields', () => {
  const review = buildDispensingUkeSpecificationPdfFieldReview(UKE_PDF_TEXT_EXCERPT, EXPECTED_SPECS);
  const coverageCsv = buildDispensingUkeSpecificationPdfRecordCoverageCsv(review);

  assert.strictEqual(review.ok, true);
  assert.strictEqual(review.source, DISPENSING_UKE_RECORD_SPEC_SOURCE);
  assert.deepStrictEqual(review.expectedRecordTypes, ['YK', 'SN']);
  assert.deepStrictEqual(review.parsedRecordTypes, ['SN', 'YK']);
  assert.strictEqual(review.parsedFieldCount, 6);
  assert.strictEqual(review.expectedKeyFieldCount, 6);
  assert.strictEqual(review.matchedKeyFieldCount, 6);
  assert.deepStrictEqual(review.missingRecordTypes, []);
  assert.deepStrictEqual(review.definitionNarrowerRecordTypes, []);
  assert.strictEqual(review.recordCoverages.find((coverage) => coverage.recordType === 'YK')?.currentMinFieldCount, 7);
  assert.strictEqual(review.recordCoverages.find((coverage) => coverage.recordType === 'YK')?.maxPdfItemNumber, 6);
  assert.deepStrictEqual(review.keyFieldIssues, []);
  assert.match(formatDispensingUkeSpecificationPdfFieldReview(review), /PDF本文項目: OK/);
  assert.match(formatDispensingUkeSpecificationPdfFieldReview(review), /主要項目一致 6\/6/);
  assert.match(coverageCsv, /^"出典","レコード種別","レコード名","判定","PDF抽出項目数","PDF最大項番","現行最小項目数","未抽出項番","現行定義外PDF項番"/);
  assert.match(coverageCsv, /"YK","薬局情報","確認済み","4","6","7","3 \/ 4 \/ 7",""/);
});

test('buildDispensingUkeSpecificationPdfFieldReview reports records with more PDF items than current definitions', () => {
  const review = buildDispensingUkeSpecificationPdfFieldReview(
    UKE_PDF_TEXT_EXCERPT.replace(
      '6 薬局電話番号 英数 15 15 任意',
      [
        '6 薬局電話番号 英数 15 15 任意',
        '8 予備 英数 1 1 任意'
      ].join('\n')
    ),
    EXPECTED_SPECS
  );
  const ykCoverage = review.recordCoverages.find((coverage) => coverage.recordType === 'YK');
  const coverageCsv = buildDispensingUkeSpecificationPdfRecordCoverageCsv(review);

  assert.strictEqual(review.ok, false);
  assert.deepStrictEqual(review.definitionNarrowerRecordTypes, ['YK']);
  assert.ok(ykCoverage);
  assert.strictEqual(ykCoverage.status, 'definition_narrower');
  assert.strictEqual(ykCoverage.maxPdfItemNumber, 8);
  assert.deepStrictEqual(ykCoverage.extraPdfItemNumbers, [8]);
  assert.match(formatDispensingUkeSpecificationPdfFieldReview(review), /PDF項目多め YK/);
  assert.match(coverageCsv, /"YK","薬局情報","PDF側の項目が多い","5","8","7","3 \/ 4 \/ 7","8"/);
});

test('buildDispensingUkeSpecificationPdfFieldReview reports length, required, and missing row differences', () => {
  const review = buildDispensingUkeSpecificationPdfFieldReview(
    UKE_PDF_TEXT_EXCERPT
      .replace('1 保険薬局コード 数字 7 7 必須', '1 保険薬局コード 数字 8 8 必須')
      .replace('2 薬局名 漢字 40 80 必須', '2 薬局名 漢字 40 80 任意')
      .replace('2 SN枝番 数字 2 2 必須', ''),
    EXPECTED_SPECS
  );

  assert.strictEqual(review.ok, false);
  assert.ok(review.keyFieldIssues.some((issue) => issue.recordType === 'YK' && issue.itemNumber === 1 && issue.field === 'length'));
  assert.ok(review.keyFieldIssues.some((issue) => issue.recordType === 'YK' && issue.itemNumber === 2 && issue.field === 'required'));
  assert.ok(review.keyFieldIssues.some((issue) => issue.recordType === 'SN' && issue.itemNumber === 2 && issue.field === 'missing'));
  assert.match(formatDispensingUkeSpecificationPdfFieldReview(review), /項目差分/);
});
