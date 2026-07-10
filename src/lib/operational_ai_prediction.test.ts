import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildOperationalAiPredictions,
  summarizeOperationalAiPredictions
} from './operational_ai_prediction.ts';

test('builds cross-queue operational AI predictions with evidence and guardrails', () => {
  const predictions = buildOperationalAiPredictions({
    claimRisks: [
      {
        visitId: 'visit-claim-1',
        name: '山田太郎',
        prescriptionCount: 3,
        totalPoints: 1240,
        errorCount: 1,
        warningCount: 2,
        priority: 'high',
        riskScore: 92,
        topIssueTitles: ['保険有効期限切れ', '薬価未設定'],
        actionLabel: '保険情報と薬品マスターを確認'
      }
    ],
    inventoryRisks: [
      {
        drugId: 'drug-001',
        drugName: 'アムロジピン錠5mg',
        location: 'A-1',
        supplierName: '第一仕入',
        requiredAmount: 42,
        availableAmount: 8,
        shortageAmount: 34,
        affectedVisitCount: 4,
        priority: 'high',
        actionLabel: '至急発注または近隣店舗へ確認'
      }
    ],
    followUpCandidates: [
      {
        visitId: 'visit-follow-1',
        name: '佐藤花子',
        prescriptionCount: 2,
        priority: 'high',
        reasonFlags: ['重点フォロー薬', '長期処方'],
        dueLabel: '本日',
        suggestedAction: '電話で副作用と服薬状況を確認',
        riskScore: 72,
        attemptCount: 1,
        lastContactLabel: '昨日 不在',
        isOverdue: true
      }
    ]
  });

  assert.equal(predictions.length, 3);
  assert.deepEqual(new Set(predictions.map((prediction) => prediction.domain)), new Set([
    'claim_return',
    'inventory_shortage',
    'follow_up'
  ]));
  assert.ok(predictions.every((prediction) => prediction.requiresHumanReview));
  assert.ok(predictions.every((prediction) => prediction.guardrail.includes('薬剤師')));
  assert.ok(predictions.every((prediction) => prediction.evidence.length >= 3));
  assert.ok(predictions.some((prediction) => prediction.title.includes('返戻リスク予測')));
  assert.ok(predictions.some((prediction) => prediction.title.includes('在庫欠品予測')));
  assert.ok(predictions.some((prediction) => prediction.title.includes('服薬フォロー予測')));
  assert.ok(predictions.every((prediction) => prediction.score >= 0 && prediction.score <= 100));
  assert.ok(predictions.every((prediction) => prediction.confidence >= 0 && prediction.confidence <= 100));
});

test('summarizes operational AI prediction counts and top score', () => {
  const predictions = buildOperationalAiPredictions({
    claimRisks: [
      {
        visitId: 'visit-claim-1',
        name: '山田太郎',
        prescriptionCount: 1,
        totalPoints: 500,
        errorCount: 2,
        warningCount: 0,
        priority: 'high',
        riskScore: 88,
        topIssueTitles: ['保険情報不足'],
        actionLabel: '請求前チェックを修正'
      }
    ],
    followUpCandidates: [
      {
        visitId: 'visit-follow-1',
        name: '佐藤花子',
        prescriptionCount: 2,
        priority: 'medium',
        reasonFlags: ['疑義照会あり'],
        dueLabel: '明日',
        suggestedAction: '来局時に変更内容を確認',
        riskScore: 58,
        attemptCount: 0,
        isOverdue: false
      }
    ]
  });
  const summary = summarizeOperationalAiPredictions(predictions);

  assert.equal(summary.totalCount, 2);
  assert.equal(summary.criticalCount, 1);
  assert.equal(summary.warningCount, 1);
  assert.equal(summary.maxScore, predictions[0].score);
  assert.equal(summary.topPrediction?.predictionId, predictions[0].predictionId);
  assert.ok(summary.averageConfidence > 0);
});

test('summarizes an empty operational AI prediction list', () => {
  const summary = summarizeOperationalAiPredictions([]);

  assert.deepEqual(summary, {
    totalCount: 0,
    criticalCount: 0,
    warningCount: 0,
    maxScore: 0,
    averageConfidence: 0
  });
});
