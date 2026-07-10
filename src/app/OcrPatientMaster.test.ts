import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const ocrSource = readFileSync(new URL('./ocr/page.tsx', import.meta.url), 'utf8');

test('OCR受付は患者マスター更新差分とロック済み請求数を監査ログに残す', () => {
  assert.match(ocrSource, /describePatientMasterChanges/);
  assert.match(ocrSource, /isClaimEditBlocked/);
  assert.match(ocrSource, /lockedClaimCountForPatient/);
  assert.match(ocrSource, /toPatientEligibilityStatus/);
  assert.match(ocrSource, /normalizeOnlineEligibilityResponse/);
  assert.match(ocrSource, /formatOnlineEligibilityFieldMappingReport/);
  assert.match(ocrSource, /eligibilityResult/);
  assert.match(ocrSource, /fieldMapping/);
  assert.match(ocrSource, /insuranceInfoPatch/);
  assert.match(ocrSource, /publicInsurancesPayload/);
  assert.match(ocrSource, /eligibilityCheckedAt/);
  assert.match(ocrSource, /eligibilityStatus/);
  assert.match(ocrSource, /eligibilitySource === 'mock'/);
  assert.match(ocrSource, /デモ用の資格確認結果/);
  assert.match(ocrSource, /readerMessage/);
  assert.match(ocrSource, /readerSource === 'mock'/);
  assert.match(ocrSource, /デモ用のマイナ読取内容/);
  assert.match(ocrSource, /患者マスター更新/);
  assert.match(ocrSource, /請求時点スナップショット/);
  assert.match(ocrSource, /db\.visits\.find\(\{ selector: \{ patientId \} \}\)\.exec\(\)/);
});

test('OCR受付は信頼度と人手確認ポイントを表示する', () => {
  assert.match(ocrSource, /buildOcrConfidenceReport/);
  assert.match(ocrSource, /OcrConfidencePanel/);
  assert.match(ocrSource, /OCR信頼度/);
  assert.match(ocrSource, /人手確認ポイント/);
  assert.match(ocrSource, /ocrConfidenceReport/);
  assert.match(ocrSource, /report\.reviewPoints/);
  assert.match(ocrSource, /report\.evidence/);
});

test('OCR受付は患者候補の一致理由と要確認メッセージを表示する', () => {
  assert.match(ocrSource, /buildPatientCandidateMatches/);
  assert.match(ocrSource, /patientCandidateMatchById/);
  assert.match(ocrSource, /candidate-reasons/);
  assert.match(ocrSource, /candidate-warning/);
  assert.match(ocrSource, /match\.reasonLabels/);
  assert.match(ocrSource, /match\.warning/);
});

test('OCR受付は同姓同名患者の統合確認と実行導線を表示する', () => {
  assert.match(ocrSource, /buildPatientMergePlan/);
  assert.match(ocrSource, /buildPatientMergeExecutionPlan/);
  assert.match(ocrSource, /applyPatientMergeExecutionPlan/);
  assert.match(ocrSource, /PatientMergeExecutionError/);
  assert.match(ocrSource, /openPatientMergeReview/);
  assert.match(ocrSource, /handleApplyPatientMerge/);
  assert.match(ocrSource, /patient-merge-review/);
  assert.match(ocrSource, /同姓同名の統合確認/);
  assert.match(ocrSource, /患者統合を実行/);
  assert.match(ocrSource, /患者統合実行/);
  assert.match(ocrSource, /適用済みの操作を取り消しました/);
});
