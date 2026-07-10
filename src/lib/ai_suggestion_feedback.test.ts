import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildAiSuggestionFeedbackBiExport,
  buildAiSuggestionFeedbackMonthlyReviewCsv,
  buildAiSuggestionFeedbackMonthlyReview,
  parseAiSuggestionFeedbackRecord
} from './ai_suggestion_feedback.ts';
import type { AuditLog } from '@/db/types';

const baseLog = {
  userId: 'pharmacist_1',
  userName: '薬剤師 一郎',
  userRole: 'pharmacist',
  patientId: 'patient_1',
  patientName: '山田 太郎'
} satisfies Partial<AuditLog>;

test('parseAiSuggestionFeedbackRecord extracts decision, confidence, and feedback from audit details', () => {
  const record = parseAiSuggestionFeedbackRecord({
    ...baseLog,
    logId: 'log_ai_1',
    timestamp: '2026-06-16T02:00:00.000Z',
    actionType: 'ai_suggestion_review',
    details: 'AI提案採否: 修正 / 確認者: 薬剤師 一郎 / 提案ID: prescription-audit-high-risk-without-comment-1 / 提案: ワルファリン錠1mg はハイリスク薬です / 信頼度: 82% / 根拠: 監査項目: ハイリスク薬 / 修正後対応: 薬歴へ確認事項を記録 / フィードバック: 検査値確認も追記'
  } as AuditLog);

  assert.ok(record);
  assert.strictEqual(record.decision, 'modified');
  assert.strictEqual(record.decisionLabel, '修正');
  assert.strictEqual(record.confidence, 82);
  assert.strictEqual(record.reviewerName, '薬剤師 一郎');
  assert.strictEqual(record.domain, 'prescription_audit');
  assert.strictEqual(record.domainLabel, '処方監査');
  assert.strictEqual(record.storeName, '自店');
  assert.strictEqual(record.modifiedAction, '薬歴へ確認事項を記録');
  assert.strictEqual(record.feedback, '検査値確認も追記');
});

test('parseAiSuggestionFeedbackRecord classifies SOAP draft suggestions and SOAP type', () => {
  const record = parseAiSuggestionFeedbackRecord({
    ...baseLog,
    logId: 'log_soap_a',
    timestamp: '2026-06-16T02:00:00.000Z',
    actionType: 'ai_suggestion_review',
    details: 'AI提案採否: 修正 / 確認者: 薬剤師 一郎 / 提案ID: soap-a-high-risk-1 / 提案: SOAP A 下書き: ハイリスク薬の評価 / 信頼度: 82% / 根拠: ハイリスク薬 / 修正後対応: 腎機能確認を追記'
  } as AuditLog);

  assert.ok(record);
  assert.strictEqual(record.domain, 'soap_draft');
  assert.strictEqual(record.domainLabel, 'SOAP下書き');
  assert.strictEqual(record.soapType, 'A');
});

test('parseAiSuggestionFeedbackRecord extracts store labels for multi-store comparison', () => {
  const record = parseAiSuggestionFeedbackRecord({
    ...baseLog,
    logId: 'log_store',
    timestamp: '2026-06-16T02:00:00.000Z',
    actionType: 'ai_suggestion_review',
    details: 'AI提案採否: 採用 / 確認者: 薬剤師 一郎 / 店舗名: 青空薬局 渋谷店 / 店舗コード: 1312345 / 提案ID: s1 / 提案: 患者アラート一致 / 信頼度: 96%'
  } as AuditLog);

  assert.ok(record);
  assert.strictEqual(record.storeName, '青空薬局 渋谷店');
  assert.strictEqual(record.storeCode, '1312345');
});

test('buildAiSuggestionFeedbackMonthlyReview summarizes current month decisions', () => {
  const logs = [
    {
      ...baseLog,
      logId: 'log_ai_accepted',
      timestamp: '2026-06-01T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 採用 / 確認者: 薬剤師 一郎 / 提案ID: s1 / 提案: 患者アラート一致 / 信頼度: 96% / 根拠: アレルギー一致'
    },
    {
      ...baseLog,
      logId: 'log_ai_modified',
      timestamp: '2026-06-12T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 修正 / 確認者: 薬剤師 二郎 / 提案ID: soap-a-high-risk-1 / 提案: SOAP A 下書き: ハイリスク薬 / 信頼度: 82% / 根拠: ハイリスク / 修正後対応: 薬歴へ検査値確認を追記'
    },
    {
      ...baseLog,
      logId: 'log_ai_rejected_old',
      timestamp: '2026-05-30T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 却下 / 確認者: 薬剤師 一郎 / 提案ID: s3 / 提案: 過去月 / 信頼度: 70% / フィードバック: 対象外'
    },
    {
      ...baseLog,
      logId: 'log_print',
      timestamp: '2026-06-12T03:00:00.000Z',
      actionType: 'print',
      details: '印刷実行'
    }
  ] as AuditLog[];

  const review = buildAiSuggestionFeedbackMonthlyReview(logs, new Date('2026-06-16T00:00:00.000Z'));

  assert.strictEqual(review.monthKey, '2026-06');
  assert.strictEqual(review.totalCount, 2);
  assert.strictEqual(review.acceptedCount, 1);
  assert.strictEqual(review.modifiedCount, 1);
  assert.strictEqual(review.rejectedCount, 0);
  assert.strictEqual(review.feedbackCount, 1);
  assert.strictEqual(review.averageConfidence, 89);
  assert.strictEqual(review.acceptanceRate, 50);
  assert.strictEqual(review.correctionRate, 50);
  assert.strictEqual(review.status, 'ready');
  assert.strictEqual(review.actionLabel, '月次レビュー可');
  assert.strictEqual(review.soapDraftSummary.totalCount, 1);
  assert.strictEqual(review.soapDraftSummary.typeCounts.A, 1);
  assert.strictEqual(review.soapDraftSummary.status, 'needs_review');
  assert.ok(review.soapDraftSummary.requiredActions.some((action) => action.includes('修正・却下率')));
  assert.ok(review.domainSummaries.some((summary) => summary.domain === 'soap_draft' && summary.totalCount === 1));
  assert.strictEqual(review.latestRecord?.logId, 'log_ai_modified');
});

test('buildAiSuggestionFeedbackMonthlyReview asks for records when the month is empty', () => {
  const review = buildAiSuggestionFeedbackMonthlyReview([], new Date('2026-06-16T00:00:00.000Z'));

  assert.strictEqual(review.status, 'empty');
  assert.strictEqual(review.statusLabel, '未記録');
  assert.strictEqual(review.totalCount, 0);
  assert.strictEqual(review.soapDraftSummary.status, 'empty');
  assert.strictEqual(review.storeComparison.status, 'single_store');
  assert.strictEqual(review.qualityGate.status, 'insufficient_data');
  assert.strictEqual(review.qualityGate.recommendedMode, 'limited');
  assert.strictEqual(review.qualityGate.modeAlignment, 'change_required');
  assert.ok(review.requiredActions.some((action) => action.includes('採否ログ')));
});

test('quality gate stops AI assist after repeated high-confidence rejections', () => {
  const logs = [
    {
      ...baseLog,
      logId: 'log_high_confidence_rejected_1',
      timestamp: '2026-06-01T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 却下 / 確認者: 薬剤師 一郎 / 提案ID: prescription-audit-1 / 提案: 処方監査候補1 / 信頼度: 92% / フィードバック: 処方意図と異なる'
    },
    {
      ...baseLog,
      logId: 'log_high_confidence_rejected_2',
      timestamp: '2026-06-02T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 却下 / 確認者: 薬剤師 二郎 / 提案ID: soap-a-2 / 提案: SOAP A 下書き / 信頼度: 84% / フィードバック: 評価根拠が不足'
    }
  ] as AuditLog[];

  const review = buildAiSuggestionFeedbackMonthlyReview(logs, new Date('2026-06-16T00:00:00.000Z'), {
    currentAiAssistMode: 'enabled'
  });

  assert.strictEqual(review.qualityGate.status, 'stop');
  assert.strictEqual(review.qualityGate.highConfidenceRejectedCount, 2);
  assert.strictEqual(review.qualityGate.recommendedMode, 'disabled');
  assert.strictEqual(review.qualityGate.modeAlignment, 'change_required');
  assert.ok(review.qualityGate.reasons.some((reason) => reason.includes('信頼度80%以上')));
});

test('quality gate continues standard mode after enough clean reviews', () => {
  const logs = Array.from({ length: 20 }, (_, index) => ({
    ...baseLog,
    logId: `log_clean_${index + 1}`,
    timestamp: `2026-06-${String(index + 1).padStart(2, '0')}T02:00:00.000Z`,
    actionType: 'ai_suggestion_review',
    details: `AI提案採否: 採用 / 確認者: 薬剤師 一郎 / 提案ID: prescription-audit-${index + 1} / 提案: 処方監査候補${index + 1} / 信頼度: 88%`
  })) as AuditLog[];

  const review = buildAiSuggestionFeedbackMonthlyReview(logs, new Date('2026-06-25T00:00:00.000Z'), {
    currentAiAssistMode: 'enabled'
  });

  assert.strictEqual(review.qualityGate.status, 'continue');
  assert.strictEqual(review.qualityGate.sampleCount, 20);
  assert.strictEqual(review.qualityGate.rejectionRate, 0);
  assert.strictEqual(review.qualityGate.recommendedMode, 'enabled');
  assert.strictEqual(review.qualityGate.modeAlignment, 'aligned');
});

test('quality gate restricts AI assist when rejection rate remains elevated', () => {
  const logs = Array.from({ length: 20 }, (_, index) => {
    const rejected = index < 3;
    return {
      ...baseLog,
      logId: `log_restrict_${index + 1}`,
      timestamp: `2026-06-${String(index + 1).padStart(2, '0')}T02:00:00.000Z`,
      actionType: 'ai_suggestion_review',
      details: rejected
        ? `AI提案採否: 却下 / 確認者: 薬剤師 一郎 / 提案ID: prescription-audit-${index + 1} / 提案: 処方監査候補${index + 1} / 信頼度: 70% / フィードバック: 対象外`
        : `AI提案採否: 採用 / 確認者: 薬剤師 一郎 / 提案ID: prescription-audit-${index + 1} / 提案: 処方監査候補${index + 1} / 信頼度: 70%`
    };
  }) as AuditLog[];

  const review = buildAiSuggestionFeedbackMonthlyReview(logs, new Date('2026-06-25T00:00:00.000Z'), {
    currentAiAssistMode: 'limited'
  });

  assert.strictEqual(review.qualityGate.status, 'restrict');
  assert.strictEqual(review.qualityGate.rejectionRate, 15);
  assert.strictEqual(review.qualityGate.recommendedMode, 'limited');
  assert.strictEqual(review.qualityGate.modeAlignment, 'aligned');
});

test('buildAiSuggestionFeedbackMonthlyReview asks SOAP draft feedback when rejection reason is missing', () => {
  const logs = [
    {
      ...baseLog,
      logId: 'log_soap_rejected',
      timestamp: '2026-06-12T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 却下 / 確認者: 薬剤師 二郎 / 提案ID: soap-p-follow-up-1 / 提案: SOAP P 下書き: 次回確認 / 信頼度: 76% / 根拠: フォロー候補'
    }
  ] as AuditLog[];

  const review = buildAiSuggestionFeedbackMonthlyReview(logs, new Date('2026-06-16T00:00:00.000Z'));

  assert.strictEqual(review.soapDraftSummary.totalCount, 1);
  assert.strictEqual(review.soapDraftSummary.typeCounts.P, 1);
  assert.strictEqual(review.soapDraftSummary.status, 'needs_review');
  assert.strictEqual(review.soapDraftSummary.actionLabel, '文面見直し');
  assert.ok(review.soapDraftSummary.requiredActions.some((action) => action.includes('根拠リンクと下書き文面')));
});

test('buildAiSuggestionFeedbackMonthlyReview compares feedback quality across stores', () => {
  const logs = [
    {
      ...baseLog,
      logId: 'log_current_accepted',
      timestamp: '2026-06-01T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 採用 / 確認者: 薬剤師 一郎 / 店舗名: 青空薬局 渋谷店 / 店舗コード: 1312345 / 提案ID: s1 / 提案: 患者アラート一致 / 信頼度: 96%'
    },
    {
      ...baseLog,
      logId: 'log_current_modified',
      timestamp: '2026-06-02T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 修正 / 確認者: 薬剤師 一郎 / 店舗名: 青空薬局 渋谷店 / 店舗コード: 1312345 / 提案ID: s2 / 提案: 処方監査 / 信頼度: 82% / 修正後対応: 確認事項を追記'
    },
    {
      ...baseLog,
      logId: 'log_peer_accepted_1',
      timestamp: '2026-06-03T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 採用 / 確認者: 薬剤師 二郎 / 店舗名: 青空薬局 新宿店 / 店舗コード: 1399999 / 提案ID: s3 / 提案: SOAP S 下書き / 信頼度: 90%'
    },
    {
      ...baseLog,
      logId: 'log_peer_accepted_2',
      timestamp: '2026-06-04T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 採用 / 確認者: 薬剤師 二郎 / 店舗名: 青空薬局 新宿店 / 店舗コード: 1399999 / 提案ID: s4 / 提案: SOAP P 下書き / 信頼度: 88%'
    }
  ] as AuditLog[];

  const review = buildAiSuggestionFeedbackMonthlyReview(logs, new Date('2026-06-16T00:00:00.000Z'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  assert.strictEqual(review.storeComparison.storeCount, 2);
  assert.strictEqual(review.storeComparison.currentStore?.storeName, '青空薬局 渋谷店');
  assert.strictEqual(review.storeComparison.currentStore?.acceptanceRate, 50);
  assert.strictEqual(review.storeComparison.allStoreAverageAcceptanceRate, 75);
  assert.strictEqual(review.storeComparison.peerAverageAcceptanceRate, 100);
  assert.strictEqual(review.storeComparison.status, 'needs_attention');
  assert.ok(review.storeComparison.requiredActions.some((action) => action.includes('平均との差')));
});

test('buildAiSuggestionFeedbackMonthlyReviewCsv exports store, domain, SOAP, and detail rows safely', () => {
  const logs = [
    {
      ...baseLog,
      logId: 'log_current_accepted',
      timestamp: '2026-06-01T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 採用 / 確認者: 薬剤師 一郎 / 店舗名: =危険薬局 / 店舗コード: 1312345 / 提案ID: soap-s-alert-1 / 提案: SOAP S 下書き: 患者訴え / 信頼度: 96% / フィードバック: 良好'
    },
    {
      ...baseLog,
      logId: 'log_peer_modified',
      timestamp: '2026-06-02T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 修正 / 確認者: 薬剤師 二郎 / 店舗名: 青空薬局 新宿店 / 店舗コード: 1399999 / 提案ID: prescription-audit-1 / 提案: 処方監査 / 信頼度: 80% / 修正後対応: 文面調整'
    }
  ] as AuditLog[];
  const review = buildAiSuggestionFeedbackMonthlyReview(logs, new Date('2026-06-16T00:00:00.000Z'), {
    currentStoreName: '=危険薬局',
    currentStoreCode: '1312345'
  });

  const csv = buildAiSuggestionFeedbackMonthlyReviewCsv(review);

  assert.match(csv, /^"区分","項目","値","補足"/);
  assert.match(csv, /"店舗別比較","自店採用率","100%","'=危険薬局"/);
  assert.match(csv, /"SOAP下書き","S\/O\/A\/P","1\/0\/0\/0"/);
  assert.match(csv, /"提案種別別","SOAP下書き"/);
  assert.match(csv, /"品質ゲート","現在\/推奨モード"/);
  assert.match(csv, /"明細","2026-06-01T02:00:00.000Z","'=危険薬局"/);
  assert.doesNotMatch(csv, /","=危険薬局"/);
});

test('buildAiSuggestionFeedbackBiExport exports store feedback comparison without patient identifiers', () => {
  const logs = [
    {
      ...baseLog,
      logId: 'log_current_modified',
      timestamp: '2026-06-01T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 修正 / 確認者: 薬剤師 一郎 / 店舗名: 青空薬局 渋谷店 / 店舗コード: 1312345 / 提案ID: soap-a-high-risk-1 / 提案: SOAP A 下書き: ハイリスク薬 / 信頼度: 82% / 修正後対応: 検査値確認を追記 / フィードバック: 腎機能も確認'
    },
    {
      ...baseLog,
      logId: 'log_peer_accepted',
      timestamp: '2026-06-02T02:00:00.000Z',
      actionType: 'ai_suggestion_review',
      details: 'AI提案採否: 採用 / 確認者: 薬剤師 二郎 / 店舗名: 青空薬局 新宿店 / 店舗コード: 1399999 / 提案ID: prescription-audit-1 / 提案: 処方監査 / 信頼度: 90%'
    }
  ] as AuditLog[];
  const review = buildAiSuggestionFeedbackMonthlyReview(logs, new Date('2026-06-16T00:00:00.000Z'), {
    currentStoreName: '青空薬局 渋谷店',
    currentStoreCode: '1312345'
  });

  const payload = JSON.parse(buildAiSuggestionFeedbackBiExport(review, new Date('2026-06-30T00:00:00.000Z')));

  assert.strictEqual(payload.type, 'ai-suggestion-feedback-monthly-review');
  assert.strictEqual(payload.schemaVersion, 2);
  assert.strictEqual(payload.generatedAt, '2026-06-30T00:00:00.000Z');
  assert.strictEqual(payload.monthKey, '2026-06');
  assert.strictEqual(payload.summary.totalCount, 2);
  assert.strictEqual(payload.summary.acceptanceRate, 50);
  assert.strictEqual(payload.storeComparison.storeCount, 2);
  assert.strictEqual(payload.storeComparison.currentStore.storeName, '青空薬局 渋谷店');
  assert.strictEqual(payload.storeComparison.peerAverageAcceptanceRate, 100);
  assert.strictEqual(payload.domainSummaries.length, 2);
  assert.strictEqual(payload.soapDraftSummary.typeCounts.A, 1);
  assert.strictEqual(payload.qualityGate.recommendedMode, 'limited');
  assert.strictEqual(payload.summary.rejectionRate, 0);
  assert.strictEqual(payload.records.length, 2);
  assert.strictEqual(payload.records[0].suggestionId, 'soap-a-high-risk-1');
  assert.deepStrictEqual(payload.privacy, {
    patientFieldsIncluded: false,
    containsPatientIdentifiers: false,
    sourceLogDetailsIncluded: false
  });
  assert.doesNotMatch(JSON.stringify(payload), /山田|patient_1|AI提案採否|確認者:/);
});
