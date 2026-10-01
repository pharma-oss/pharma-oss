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

test('builds inventory prediction with reorder point, expiry, and substitute evidences', () => {
  const predictions = buildOperationalAiPredictions({
    inventoryRisks: [
      {
        drugId: 'drug-test-1',
        drugName: 'アムロジピン錠5mg「サワイ」',
        location: 'A-01',
        supplierName: 'スズケン',
        requiredAmount: 20,
        availableAmount: 30,
        shortageAmount: 0,
        affectedVisitCount: 1,
        priority: 'medium',
        actionLabel: '発注点割れ・計画発注',
        reorderPoint: 50,
        isBelowReorderPoint: true,
        expiringSoonAmount: 15,
        hasExpiringSoonLots: true,
        substituteCandidatesCount: 2,
        topSubstituteName: 'アムロジピンOD錠5mg「日医工」'
      }
    ]
  });

  assert.equal(predictions.length, 1);
  const prediction = predictions[0];
  assert.equal(prediction.domain, 'inventory_shortage');

  const evidenceLabels = prediction.evidence.map((e) => e.label);
  assert.ok(evidenceLabels.includes('発注点設定'));
  assert.ok(evidenceLabels.includes('使用期限リスク'));
  assert.ok(evidenceLabels.includes('代替薬候補'));

  const reorderEvidence = prediction.evidence.find((e) => e.label === '発注点設定');
  assert.match(reorderEvidence?.detail || '', /安全在庫点: 50/);
  assert.match(reorderEvidence?.detail || '', /発注点割れ/);

  const expiryEvidence = prediction.evidence.find((e) => e.label === '使用期限リスク');
  assert.match(expiryEvidence?.detail || '', /期限切迫ロット: 15/);

  const substituteEvidence = prediction.evidence.find((e) => e.label === '代替薬候補');
  assert.match(substituteEvidence?.detail || '', /院内代替候補 2件/);
  assert.match(substituteEvidence?.detail || '', /アムロジピンOD錠5mg「日医工」/);
});

test('calculateDashboardInventoryRisks correctly populates reorder, expiry and substitute metrics into operational AI predictions', async () => {
  const { calculateDashboardInventoryRisks } = await import('./dashboard_tasks.ts');

  const drugMap = new Map<string, any>([
    [
      'drug-1',
      {
        id: 'drug-1',
        name: 'アムロジピン錠5mg「トーワ」',
        yjCode: '2171022F1020',
        reorderPoint: 100,
        location: 'A-12'
      }
    ],
    [
      'drug-2',
      {
        id: 'drug-2',
        name: 'アムロジピン錠5mg「サワイ」',
        yjCode: '2171022F1021', // 上7桁 2171022 が一致
        reorderPoint: 50,
        location: 'A-13'
      }
    ]
  ]);

  const now = new Date();
  const expiringDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 30日後（切迫）

  const stocksByDrugId = new Map<string, any[]>([
    [
      'drug-1',
      [
        { lotNumber: 'L1', quantity: 20, expirationDate: expiringDate }
      ]
    ],
    [
      'drug-2',
      [
        { lotNumber: 'L2', quantity: 50, expirationDate: '2028-12-31' }
      ]
    ]
  ]);

  const inventoryShortageData = new Map<string, any>([
    [
      'drug-1',
      {
        requiredAmount: 30,
        availableAmount: 20,
        shortageAmount: 10
      }
    ]
  ]);

  const inventoryRisks = calculateDashboardInventoryRisks({
    inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map([['drug-1', new Set(['v-1'])]]),
    activeVisitById: new Map([['v-1', { visitId: 'v-1', patientId: 'p-1' }]]),
    patientMap: new Map([['p-1', { name: 'テスト患者' }]])
  });

  assert.equal(inventoryRisks.length, 1);
  const risk = inventoryRisks[0];
  assert.equal(risk.reorderPoint, 100);
  assert.equal(risk.isBelowReorderPoint, true);
  assert.equal(risk.hasExpiringSoonLots, true);
  assert.equal(risk.expiringSoonAmount, 20);
  assert.equal(risk.substituteCandidatesCount, 1);
  assert.equal(risk.topSubstituteName, 'アムロジピン錠5mg「サワイ」');

  // Operational AI Predictions へ接続
  const predictions = buildOperationalAiPredictions({
    claimRisks: [],
    inventoryRisks,
    followUpCandidates: []
  });

  assert.equal(predictions.length, 1);
  const prediction = predictions[0];
  assert.equal(prediction.domain, 'inventory_shortage');

  const evidenceLabels = prediction.evidence.map((e) => e.label);
  assert.ok(evidenceLabels.includes('発注点設定'));
  assert.ok(evidenceLabels.includes('使用期限リスク'));
  assert.ok(evidenceLabels.includes('代替薬候補'));
});

test('calculateDashboardStockShortages and risks capture reorder/expiry risk without prescription shortage (stock 80, reorder 100, required 30, expiry 30 days)', async () => {
  const {
    calculateDashboardStockShortages,
    calculateDashboardInventoryRisks
  } = await import('./dashboard_tasks.ts');

  const now = new Date();
  const expiringDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 30日後

  const drugMap = new Map<string, any>([
    [
      'drug-reorder-only',
      {
        code: 'drug-reorder-only',
        name: 'エナラプリル錠5mg',
        yjCode: '2144001F1012',
        reorderPoint: 100, // 発注点 100
        stockQuantity: 80, // 在庫 80（発注点割れ）
        location: 'B-04'
      }
    ],
    [
      'drug-substitute',
      {
        code: 'drug-substitute',
        name: 'エナラプリルマレイン酸塩錠5mg「サワイ」',
        yjCode: '2144001F1020', // 同一 YJ 上7桁
        stockQuantity: 50,
        location: 'B-05'
      }
    ]
  ]);

  const stocksByDrugId = new Map<string, any[]>([
    [
      'drug-reorder-only',
      [
        { lotNumber: 'LOT-EN-1', quantity: 80, expirationDate: expiringDate } // 在庫80、30日後切迫
      ]
    ],
    [
      'drug-substitute',
      [
        { lotNumber: 'LOT-EN-2', quantity: 50, expirationDate: '2028-12-31' }
      ]
    ]
  ]);

  const requiredByStockDrugId = new Map<string, number>([
    ['drug-reorder-only', 30] // 必要量30 <= 在庫80（処方不足なし！）
  ]);
  const pickingShortageByStockDrugId = new Map<string, number>();

  // 1. calculateDashboardStockShortages を通す
  const { inventoryShortageData, inventoryShortageCount } = calculateDashboardStockShortages({
    requiredByStockDrugId,
    pickingShortageByStockDrugId,
    drugMap,
    stocksByDrugId
  });

  // 処方不足カウントは 0 であるが、リスクデータには追加されていること
  assert.equal(inventoryShortageCount, 0, '処方不足カウントは0');
  assert.ok(inventoryShortageData.has('drug-reorder-only'), '発注点割れ・期限切迫により在庫データに含まれること');

  // 2. calculateDashboardInventoryRisks へ流す
  const inventoryRisks = calculateDashboardInventoryRisks({
    inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map([['drug-reorder-only', new Set(['visit-1'])]]),
    activeVisitById: new Map([['visit-1', { visitId: 'visit-1', patientId: 'patient-1' }]]),
    patientMap: new Map([['patient-1', { name: '山田花子' }]])
  });

  assert.equal(inventoryRisks.length, 1);
  const risk = inventoryRisks[0];
  assert.equal(risk.availableAmount, 80);
  assert.equal(risk.reorderPoint, 100);
  assert.equal(risk.isBelowReorderPoint, true);
  assert.equal(risk.hasExpiringSoonLots, true);
  assert.equal(risk.expiringSoonAmount, 80);
  assert.equal(risk.substituteCandidatesCount, 1);
  assert.equal(risk.topSubstituteName, 'エナラプリルマレイン酸塩錠5mg「サワイ」');

  // 3. AI 予測エンジンへ流す
  const predictions = buildOperationalAiPredictions({
    claimRisks: [],
    inventoryRisks,
    followUpCandidates: []
  });

  assert.equal(predictions.length, 1);
  const prediction = predictions[0];
  const labels = prediction.evidence.map((e) => e.label);
  assert.ok(labels.includes('発注点設定'));
  assert.ok(labels.includes('使用期限リスク'));
  assert.ok(labels.includes('代替薬候補'));
});

test('calculateDashboardInventoryRisks excludes expired stock (e.g. year 2020) from substitution candidates', async () => {
  const { calculateDashboardInventoryRisks } = await import('./dashboard_tasks.ts');

  const drugMap = new Map<string, any>([
    [
      'target-drug',
      {
        code: 'target-drug',
        name: 'ニフェジピンCR錠20mg',
        yjCode: '2171014G2010',
        reorderPoint: 50,
        location: 'C-01'
      }
    ],
    [
      'expired-substitute-drug',
      {
        code: 'expired-substitute-drug',
        name: 'ニフェジピンCR錠20mg「JG」',
        yjCode: '2171014G2020', // 同一 YJ 上7桁
        location: 'C-02'
      }
    ]
  ]);

  const stocksByDrugId = new Map<string, any[]>([
    [
      'target-drug',
      [{ lotNumber: 'LOT-A', quantity: 10, expirationDate: '2027-10-01' }]
    ],
    [
      'expired-substitute-drug',
      [
        // 2020年に使用期限切れとなったロットのみ
        { lotNumber: 'LOT-OLD-2020', quantity: 100, expirationDate: '2020-03-31' }
      ]
    ]
  ]);

  const inventoryShortageData = new Map<string, any>([
    [
      'target-drug',
      {
        requiredAmount: 20,
        availableAmount: 10,
        shortageAmount: 10
      }
    ]
  ]);

  const inventoryRisks = calculateDashboardInventoryRisks({
    inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map([['target-drug', new Set(['v-1'])]]),
    activeVisitById: new Map([['v-1', { visitId: 'v-1', patientId: 'p-1' }]]),
    patientMap: new Map([['p-1', { name: '患者A' }]])
  });

  assert.equal(inventoryRisks.length, 1);
  const risk = inventoryRisks[0];
  // 2020年期限切れロットしかない代替薬は有効在庫なしとして除外されること
  assert.ok(!risk.substituteCandidatesCount, '期限切れロットしかない代替薬は候補数0(falsy)であること');
  assert.equal(risk.topSubstituteName, undefined, '候補名も未設定であること');

  // AI 予測に「代替薬候補」が含まれないこと
  const predictions = buildOperationalAiPredictions({
    claimRisks: [],
    inventoryRisks,
    followUpCandidates: []
  });
  const labels = predictions[0].evidence.map((e) => e.label);
  assert.ok(!labels.includes('代替薬候補'), '期限切れのみの代替薬はAIエビデンスに含まれないこと');
});


