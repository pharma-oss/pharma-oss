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
  assert.equal(
    inventoryShortageData.get('drug-reorder-only')?.shortageAmount,
    0,
    '処方不足量 shortageAmount は 0（発注点補充量20と混同しない）'
  );

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
  assert.equal(risk.shortageAmount, 0, '処方不足量は 0');
  assert.equal(risk.recommendedOrderAmount, 50, '処方分を差し引いた残在庫50に基づく発注点補充量は 50 (100 - (80 - 30))');
  assert.equal(risk.priority, 'medium', '処方不足なし・在庫ありなので priority は medium');
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
  assert.equal(prediction.severity, 'warning', '処方不足がない発注点割れは warning 判定（critical ではない）');
  assert.ok(prediction.score < 85, `スコアは 85 未満 (実測: ${prediction.score})`);

  const shortageEvidence = prediction.evidence.find((e) => e.label === '不足見込み');
  assert.ok(shortageEvidence, '不足見込みエビデンスが存在すること');
  assert.ok(
    shortageEvidence.detail.includes('不足 0'),
    `不足見込み詳細は「不足 0」と正確に表示されること (実測: ${shortageEvidence.detail})`
  );

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

test('calculateDashboardStockShortages treats expired stock as unavailable and detects prescription shortage (required 30, stock 100 all expired in 2020)', async () => {
  const { calculateDashboardStockShortages } = await import('./dashboard_tasks.ts');
  const { buildEnhancedInventoryOrderRisk } = await import('./inventory_reorder_support.ts');

  const drugCode = 'drug-expired-target';
  const drugMap = new Map<string, any>([
    [
      drugCode,
      {
        code: drugCode,
        name: 'アムロジピン錠5mg',
        yjCode: '2171022F2010',
        reorderPoint: 50,
        stockQuantity: 100, // 帳簿上は 100
        location: 'A-01'
      }
    ]
  ]);

  const stockLots = [
    // 全量が2020年に期限切れとなったロット
    { lotNumber: 'LOT-2020-OLD', quantity: 100, expirationDate: '2020-05-01' }
  ];
  const stocksByDrugId = new Map<string, any[]>([
    [drugCode, stockLots]
  ]);

  const requiredByStockDrugId = new Map<string, number>([
    [drugCode, 30] // 必要量 30
  ]);
  const pickingShortageByStockDrugId = new Map<string, number>();

  // 1. ダッシュボード側の在庫計算
  const result = calculateDashboardStockShortages({
    requiredByStockDrugId,
    pickingShortageByStockDrugId,
    drugMap,
    stocksByDrugId
  });

  // 全量期限切れのため有効在庫は 0、処方不足 30 として検知されること
  assert.equal(result.inventoryShortageCount, 1, '全量期限切れ時は処方不足件数としてカウントされること');
  assert.ok(result.shortageDrugIds.has(drugCode), 'shortageDrugIds に含まれること');

  const shortageInfo = result.inventoryShortageData.get(drugCode);
  assert.ok(shortageInfo, 'inventoryShortageData に含まれること');
  assert.equal(shortageInfo?.availableAmount, 0, '有効在庫は 0 であること（2020年期限切れ除外）');
  assert.equal(shortageInfo?.shortageAmount, 30, '不足数量は 30 であること');

  // 2. 発注ワークベンチ側の計算との完全整合を確認
  const orderRisk = buildEnhancedInventoryOrderRisk({
    drug: {
      code: drugCode,
      name: 'アムロジピン錠5mg',
      yjCode: '2171022F2010',
      stockQuantity: 100,
      reorderPoint: 50
    },
    lots: stockLots,
    requiredAmount: 30
  });

  assert.ok(orderRisk, '発注ワークベンチ側でもリスクとして検出されること');
  assert.equal(orderRisk?.effectiveAvailableAmount, 0, '発注ワークベンチの有効在庫も 0 であること');
  assert.equal(orderRisk?.shortageAmount, 30, '発注ワークベンチの処方不足も 30 であること');
  assert.equal(orderRisk?.riskReason, 'combined', '処方不足かつ発注点割れとして判定されること');
});

test('calculateDashboardStockShortages comprehensively evaluates inventory risks for drugs not in active prescriptions', async () => {
  const {
    calculateDashboardStockShortages,
    calculateDashboardInventoryRisks
  } = await import('./dashboard_tasks.ts');

  const now = new Date();
  const expiringDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 30日後

  const nonPrescribedDrugCode = 'drug-unprescribed-reorder';
  const drugMap = new Map<string, any>([
    [
      nonPrescribedDrugCode,
      {
        code: nonPrescribedDrugCode,
        name: 'ロスバスタチン錠2.5mg',
        yjCode: '2189015F1010',
        reorderPoint: 100, // 発注点 100
        stockQuantity: 80, // 在庫 80（発注点割れ）
        location: 'D-12'
      }
    ]
  ]);

  const stocksByDrugId = new Map<string, any[]>([
    [
      nonPrescribedDrugCode,
      [{ lotNumber: 'LOT-ROSU-1', quantity: 80, expirationDate: expiringDate }]
    ]
  ]);

  // 処方必要量は完全に空（処方に一切登場しない！）
  const requiredByStockDrugId = new Map<string, number>();
  const pickingShortageByStockDrugId = new Map<string, number>();

  const result = calculateDashboardStockShortages({
    requiredByStockDrugId,
    pickingShortageByStockDrugId,
    drugMap,
    stocksByDrugId
  });

  // 処方不足件数は 0（処方されていないため）
  assert.equal(result.inventoryShortageCount, 0, '処方不足件数は 0');
  // しかし在庫リスクデータには抽出されること
  assert.ok(
    result.inventoryShortageData.has(nonPrescribedDrugCode),
    '処方に登場しない薬剤でも発注点割れ・期限切迫があれば在庫データに抽出されること'
  );

  const data = result.inventoryShortageData.get(nonPrescribedDrugCode);
  assert.equal(data?.requiredAmount, 0, '必要量は 0');
  assert.equal(data?.availableAmount, 80, '有効在庫は 80');
  assert.equal(data?.shortageAmount, 0, '処方不足量は 0');

  // リスク計算と AI 予測への流し込み
  const inventoryRisks = calculateDashboardInventoryRisks({
    inventoryShortageData: result.inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map(),
    activeVisitById: new Map(),
    patientMap: new Map()
  });

  assert.equal(inventoryRisks.length, 1);
  const risk = inventoryRisks[0];
  assert.equal(risk.drugName, 'ロスバスタチン錠2.5mg');
  assert.equal(risk.shortageAmount, 0, '処方不足は 0');
  assert.equal(risk.recommendedOrderAmount, 20, '発注点補充量は 20 (100 - 80)');
  assert.equal(risk.isBelowReorderPoint, true);
  assert.equal(risk.hasExpiringSoonLots, true);

  const predictions = buildOperationalAiPredictions({
    claimRisks: [],
    inventoryRisks,
    followUpCandidates: []
  });

  assert.equal(predictions.length, 1);
  assert.equal(predictions[0].domain, 'inventory_shortage');
  assert.equal(predictions[0].severity, 'warning', '処方にない発注点割れは warning 判定');
  const labels = predictions[0].evidence.map((e) => e.label);
  assert.ok(labels.includes('発注点設定'));
  assert.ok(labels.includes('使用期限リスク'));
});

test('issue 1: same-day expiry evaluates as expired in both dashboard and workbench (expiry 2026-10-02, now 2026-10-02, required 30, stock 100)', async () => {
  const { getEffectiveAvailableStock, calculateDashboardStockShortages } = await import('./dashboard_tasks.ts');
  const { evaluateStockLotExpiry, calculateReorderAmounts } = await import('./inventory_reorder_support.ts');

  const basisDate = new Date('2026-10-02T10:00:00Z');
  const lots = [{ lotNumber: 'SAME-DAY-LOT', quantity: 100, expirationDate: '2026-10-02' }];

  // 1. getEffectiveAvailableStock: 当日期限ロットは期限切れとして除外されること
  const { effectiveAvailable, expiredQuantity } = getEffectiveAvailableStock(lots, undefined, basisDate);
  assert.equal(effectiveAvailable, 0, '当日期限ロットは有効在庫から除外される (0)');
  assert.equal(expiredQuantity, 100, '当日期限ロットは期限切れとしてカウントされる (100)');

  // 2. ワークベンチ側の evaluateStockLotExpiry と完全一致すること
  const workbenchExpiry = evaluateStockLotExpiry(lots, basisDate);
  assert.equal(workbenchExpiry.expiredQuantity, 100, 'ワークベンチ側も期限切れ100と判定');
  assert.equal(workbenchExpiry.hasExpired, true);

  // 3. calculateDashboardStockShortages: 必要30、有効在庫0で処方不足30、件数1
  const drugMap = new Map([
    ['drug-same-day', { code: 'drug-same-day', name: '当日期限薬', stockQuantity: 100 }]
  ]);
  const stocksByDrugId = new Map([['drug-same-day', lots]]);
  const requiredByStockDrugId = new Map([['drug-same-day', 30]]);
  const pickingShortageByStockDrugId = new Map();

  const shortages = calculateDashboardStockShortages({
    requiredByStockDrugId,
    pickingShortageByStockDrugId,
    drugMap,
    stocksByDrugId,
    now: basisDate
  });

  assert.equal(shortages.inventoryShortageCount, 1, 'ダッシュボードの不足件数は 1');
  assert.ok(shortages.shortageDrugIds.has('drug-same-day'), '不足IDセットに含まれる');
  const data = shortages.inventoryShortageData.get('drug-same-day');
  assert.equal(data?.availableAmount, 0, 'ダッシュボードの有効在庫は 0');
  assert.equal(data?.shortageAmount, 30, 'ダッシュボードの処方不足は 30');

  // 4. ワークベンチ側の calculateReorderAmounts との比較
  const workbenchReorder = calculateReorderAmounts({
    effectiveAvailableAmount: effectiveAvailable,
    requiredAmount: 30
  });
  assert.equal(workbenchReorder.shortageAmount, 30, 'ワークベンチ側も不足30と判定');
  assert.equal(workbenchReorder.isShortage, true);
});

test('issue 2: recommended order amount matches workbench using projected remaining stock (required 30, stock 80, reorder 100 -> recommended 50)', async () => {
  const { calculateDashboardInventoryRisks } = await import('./dashboard_tasks.ts');
  const { calculateReorderAmounts } = await import('./inventory_reorder_support.ts');

  const requiredAmount = 30;
  const availableAmount = 80;
  const reorderPoint = 100;

  // 1. 发注ワークベンチ側の基準値計算
  const workbenchReorder = calculateReorderAmounts({
    effectiveAvailableAmount: availableAmount,
    requiredAmount,
    reorderPoint
  });
  assert.equal(workbenchReorder.shortageAmount, 0, '処方不足量は 0 (80 >= 30)');
  assert.equal(workbenchReorder.reorderPointShortage, 50, '残在庫50に対する補充量は 50 (100 - (80 - 30))');
  assert.equal(workbenchReorder.recommendedOrderAmount, 50, 'ワークベンチの推奨発注量は 50');

  // 2. ダッシュボード側の calculateDashboardInventoryRisks
  const inventoryShortageData = new Map([
    ['drug-reorder-sync', {
      requiredAmount,
      availableAmount,
      shortageAmount: 0
    }]
  ]);
  const drugMap = new Map([
    ['drug-reorder-sync', {
      id: 'drug-reorder-sync',
      name: '残在庫判定薬',
      reorderPoint
    }]
  ]);
  const stocksByDrugId = new Map([
    ['drug-reorder-sync', [{ quantity: 80, expirationDate: '2028-12-31' }]]
  ]);

  const risks = calculateDashboardInventoryRisks({
    inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map([['drug-reorder-sync', new Set(['v-1'])]]),
    activeVisitById: new Map([['v-1', { visitId: 'v-1', patientId: 'p-1' }]]),
    patientMap: new Map([['p-1', { name: 'テスト患者' }]])
  });

  assert.equal(risks.length, 1);
  const risk = risks[0];
  assert.equal(risk.shortageAmount, 0, '処方不足量は 0');
  assert.equal(risk.recommendedOrderAmount, 50, 'ダッシュボードの推奨発注量もワークベンチと一致して 50');
  assert.equal(risk.isBelowReorderPoint, true);
});

test('issue 2 extension: warning retained and reorder 10 calculated when stock exceeds reorder point but projected stock is below (stock 120, required 30, reorder 100 -> recommended 10)', async () => {
  const { calculateDashboardStockShortages, calculateDashboardInventoryRisks } = await import('./dashboard_tasks.ts');
  const { calculateReorderAmounts } = await import('./inventory_reorder_support.ts');

  const requiredAmount = 30;
  const availableAmount = 120;
  const reorderPoint = 100;

  // 1. ワークベンチ側
  const workbenchReorder = calculateReorderAmounts({
    effectiveAvailableAmount: availableAmount,
    requiredAmount,
    reorderPoint
  });
  assert.equal(workbenchReorder.isBelowReorderPoint, true, '残在庫90は発注点100以下');
  assert.equal(workbenchReorder.reorderPointShortage, 10, '発注点補充量は 10 (100 - (120 - 30))');
  assert.equal(workbenchReorder.recommendedOrderAmount, 10, '推奨発注量は 10');

  // 2. ダッシュボードの calculateDashboardStockShortages: 警告が消えずにリスク品目として抽出されること
  const drugMap = new Map([
    ['drug-stock-120', {
      id: 'drug-stock-120',
      code: 'drug-stock-120',
      name: '在庫120薬',
      reorderPoint,
      stockQuantity: 120
    }]
  ]);
  const stocksByDrugId = new Map([
    ['drug-stock-120', [{ quantity: 120, expirationDate: '2028-12-31' }]]
  ]);
  const requiredByStockDrugId = new Map([['drug-stock-120', requiredAmount]]);
  const pickingShortageByStockDrugId = new Map();

  const shortages = calculateDashboardStockShortages({
    requiredByStockDrugId,
    pickingShortageByStockDrugId,
    drugMap,
    stocksByDrugId
  });

  assert.ok(
    shortages.inventoryShortageData.has('drug-stock-120'),
    '現在庫120が発注点100を超えていても、処方後残在庫90が発注点を下回るため警告として保持されること'
  );
  assert.equal(shortages.inventoryShortageCount, 0, '処方不足ではないので処方不足件数は 0');

  // 3. calculateDashboardInventoryRisks: 推奨発注量 10 と判定されること
  const risks = calculateDashboardInventoryRisks({
    inventoryShortageData: shortages.inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map([['drug-stock-120', new Set(['v-1'])]]),
    activeVisitById: new Map([['v-1', { visitId: 'v-1', patientId: 'p-1' }]]),
    patientMap: new Map([['p-1', { name: 'テスト患者' }]])
  });

  assert.equal(risks.length, 1);
  const risk = risks[0];
  assert.equal(risk.isBelowReorderPoint, true, '発注点割れフラグが true');
  assert.equal(risk.shortageAmount, 0, '処方不足量は 0');
  assert.equal(risk.recommendedOrderAmount, 10, 'ダッシュボードの推奨発注量もワークベンチと一致して 10');
});

test('issue 3: picking shortage updates inventoryShortageCount and shortageDrugIds when added to existing risk (required 30, stock 80, reorder 100, picking shortage 5)', async () => {
  const { calculateDashboardStockShortages, calculateDashboardInventoryRisks } = await import('./dashboard_tasks.ts');

  const drugMap = new Map([
    ['drug-picking-sync', {
      id: 'drug-picking-sync',
      code: 'drug-picking-sync',
      name: '棚不足同期薬',
      reorderPoint: 100,
      stockQuantity: 80
    }]
  ]);
  const stocksByDrugId = new Map([
    ['drug-picking-sync', [{ quantity: 80, expirationDate: '2028-12-31' }]]
  ]);
  const requiredByStockDrugId = new Map([['drug-picking-sync', 30]]);
  const pickingShortageByStockDrugId = new Map([['drug-picking-sync', 5]]);

  const shortages = calculateDashboardStockShortages({
    requiredByStockDrugId,
    pickingShortageByStockDrugId,
    drugMap,
    stocksByDrugId
  });

  // 棚不足があるため、既存リスクへの追記後も不足件数・IDが確実に反映されること
  assert.equal(shortages.inventoryShortageCount, 1, '棚不足により inventoryShortageCount が 1 となること');
  assert.ok(shortages.shortageDrugIds.has('drug-picking-sync'), 'shortageDrugIds に含まれること');

  const data = shortages.inventoryShortageData.get('drug-picking-sync');
  assert.equal(data?.pickingShortageAmount, 5, '棚不足量が 5');
  assert.equal(data?.shortageAmount, 5, '不足量が 5');

  // リスク計算での検証
  const risks = calculateDashboardInventoryRisks({
    inventoryShortageData: shortages.inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map([['drug-picking-sync', new Set(['v-1'])]]),
    activeVisitById: new Map([['v-1', { visitId: 'v-1', patientId: 'p-1' }]]),
    patientMap: new Map([['p-1', { name: 'テスト患者' }]])
  });

  assert.equal(risks.length, 1);
  const risk = risks[0];
  assert.equal(risk.shortageAmount, 5, 'リスク行の不足量は 5');
  assert.equal(risk.pickingShortageAmount, 5, '棚不足量は 5');
  assert.equal(risk.priority, 'high', '棚不足があるため priority は high (至急)');
  assert.equal(risk.actionLabel, '棚不足の報告あり・現物確認と至急手配');
  assert.equal(risk.recommendedOrderAmount, 50, '推奨発注量は棚不足5と残在庫補充量50を満たす 50');
});

test('issue targetStock 1: recommended order amount reflects targetStock in dashboard matching workbench (required 30, stock 80, reorder 100, targetStock 200 -> recommended 150)', async () => {
  const { calculateDashboardInventoryRisks } = await import('./dashboard_tasks.ts');
  const { calculateReorderAmounts } = await import('./inventory_reorder_support.ts');

  const requiredAmount = 30;
  const availableAmount = 80;
  const reorderPoint = 100;
  const targetStock = 200;

  // 1. ワークベンチ側の計算
  const workbenchReorder = calculateReorderAmounts({
    effectiveAvailableAmount: availableAmount,
    requiredAmount,
    reorderPoint,
    targetStock
  });
  // projectedRemaining = 80 - 30 = 50. targetStock = 200 => 200 - 50 = 150.
  assert.equal(workbenchReorder.recommendedOrderAmount, 150, 'ワークベンチの推奨量は 150');

  // 2. ダッシュボード側の calculateDashboardInventoryRisks
  const inventoryShortageData = new Map([
    ['drug-target-1', {
      requiredAmount,
      availableAmount,
      shortageAmount: 0
    }]
  ]);
  const drugMap = new Map([
    ['drug-target-1', {
      id: 'drug-target-1',
      name: '目標在庫判定薬1',
      reorderPoint,
      targetStock
    }]
  ]);
  const stocksByDrugId = new Map([
    ['drug-target-1', [{ quantity: 80, expirationDate: '2028-12-31' }]]
  ]);

  const risks = calculateDashboardInventoryRisks({
    inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map([['drug-target-1', new Set(['v-1'])]]),
    activeVisitById: new Map([['v-1', { visitId: 'v-1', patientId: 'p-1' }]]),
    patientMap: new Map([['p-1', { name: 'テスト患者' }]])
  });

  assert.equal(risks.length, 1);
  const risk = risks[0];
  assert.equal(risk.targetStock, 200);
  assert.equal(risk.recommendedOrderAmount, 150, 'ダッシュボードの推奨量も targetStock 200 が反映され 150');
});

test('issue targetStock 2: risk extracted and recommended order amount 110 calculated when reorderPoint is unset but targetStock is set (required 30, stock 120, reorder unset, targetStock 200 -> recommended 110)', async () => {
  const { calculateDashboardStockShortages, calculateDashboardInventoryRisks } = await import('./dashboard_tasks.ts');
  const { calculateReorderAmounts } = await import('./inventory_reorder_support.ts');

  const requiredAmount = 30;
  const availableAmount = 120;
  const targetStock = 200;

  // 1. ワークベンチ側
  const workbenchReorder = calculateReorderAmounts({
    effectiveAvailableAmount: availableAmount,
    requiredAmount,
    targetStock
  });
  // projectedRemaining = 120 - 30 = 90. targetStock = 200 => 200 - 90 = 110.
  assert.equal(workbenchReorder.recommendedOrderAmount, 110, 'ワークベンチの推奨量は 110');

  // 2. ダッシュボードの calculateDashboardStockShortages: 発注点未設定でも targetStock 割れによりリスク抽出されること
  const drugMap = new Map([
    ['drug-target-2', {
      id: 'drug-target-2',
      code: 'drug-target-2',
      name: '目標在庫判定薬2',
      stockQuantity: 120,
      targetStock // 発注点 reorderPoint は未設定
    }]
  ]);
  const stocksByDrugId = new Map([
    ['drug-target-2', [{ quantity: 120, expirationDate: '2028-12-31' }]]
  ]);
  const requiredByStockDrugId = new Map([['drug-target-2', requiredAmount]]);
  const pickingShortageByStockDrugId = new Map();

  const shortages = calculateDashboardStockShortages({
    requiredByStockDrugId,
    pickingShortageByStockDrugId,
    drugMap,
    stocksByDrugId
  });

  assert.ok(
    shortages.inventoryShortageData.has('drug-target-2'),
    '発注点未設定でも残在庫90が目標在庫200を下回るためリスク品目として抽出されること'
  );
  assert.equal(shortages.inventoryShortageCount, 0, '処方不足ではないので処方不足件数は 0');

  // 3. calculateDashboardInventoryRisks: 推奨発注量 110 と判定されること
  const risks = calculateDashboardInventoryRisks({
    inventoryShortageData: shortages.inventoryShortageData,
    drugMap,
    stocksByDrugId,
    requiredVisitIdsByStockDrugId: new Map([['drug-target-2', new Set(['v-1'])]]),
    activeVisitById: new Map([['v-1', { visitId: 'v-1', patientId: 'p-1' }]]),
    patientMap: new Map([['p-1', { name: 'テスト患者' }]])
  });

  assert.equal(risks.length, 1);
  const risk = risks[0];
  assert.equal(risk.targetStock, 200);
  assert.equal(risk.shortageAmount, 0, '処方不足量は 0');
  assert.equal(risk.recommendedOrderAmount, 110, 'ダッシュボードの推奨発注量もワークベンチと一致して 110');
});


