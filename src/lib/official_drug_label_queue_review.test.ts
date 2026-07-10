import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildOfficialDrugLabelQueueChecklist,
  buildOfficialDrugLabelQueueReview,
  buildOfficialDrugLabelQueueReviewCsv,
  collectOfficialDrugLabelDataMetrics,
  type OfficialDrugLabelQueueEntry
} from './official_drug_label_queue_review.ts';

const generatedAt = new Date('2026-07-07T09:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const queueReviewScript = readFileSync(new URL('../../scripts/runOfficialDrugLabelQueueReview.ts', import.meta.url), 'utf8');

function queueEntries(overrides: OfficialDrugLabelQueueEntry[] = []): OfficialDrugLabelQueueEntry[] {
  return [
    {
      ingredient: 'アムロジピン',
      productCount: 121,
      status: 'done',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/example-a'
    },
    {
      ingredient: 'メマンチン塩酸塩',
      productCount: 93,
      status: 'no_interactions_found',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/example-b'
    },
    ...overrides
  ];
}

function drugInfos() {
  return [
    {
      drugName: 'アムロジピン錠',
      contraindications: [{
        targetDrugs: ['イトラコナゾール'],
        severity: 'warning',
        clinicalEffect: '血中濃度上昇',
        sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/example-a'
      }],
      contraindicatedConditions: [{
        conditionText: '妊婦',
        reason: '投与しないこと',
        sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/example-a'
      }]
    }
  ];
}

test('buildOfficialDrugLabelQueueReview passes when queue and PMDA data are clean', () => {
  const review = buildOfficialDrugLabelQueueReview({
    generatedAt,
    queueEntries: queueEntries(),
    dataMetrics: collectOfficialDrugLabelDataMetrics(drugInfos())
  });

  assert.strictEqual(review.type, 'yakureki-official-drug-label-queue-review');
  assert.strictEqual(review.schemaVersion, 1);
  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.canCloseP401InternalGate, true);
  assert.strictEqual(review.totalIngredientCount, 2);
  assert.strictEqual(review.doneCount, 1);
  assert.strictEqual(review.noInteractionsFoundCount, 1);
  assert.strictEqual(review.pendingCount, 0);
  assert.strictEqual(review.dataMetrics.interactionRowCount, 1);
  assert.strictEqual(review.dataMetrics.conditionRowCount, 1);
  assert.strictEqual(review.dataMetrics.uniqueSourceUrlCount, 1);
  assert.ok(review.gates.every((gate) => gate.status === 'pass'));
});

test('buildOfficialDrugLabelQueueReview blocks unresolved queue statuses', () => {
  const review = buildOfficialDrugLabelQueueReview({
    generatedAt,
    queueEntries: queueEntries([
      { ingredient: '未処理成分', status: 'pending' },
      { ingredient: '通信失敗成分', status: 'fetch_error', error: 'timeout' },
      {
        ingredient: '候補なし成分',
        status: 'fetch_error',
        error: 'GeneralListページに添付文書候補が見つかりません: https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example'
      },
      { ingredient: '要確認成分', status: 'needs_review', flags: ['表ゆれ'] },
      { ingredient: '謎成分', status: 'unexpected_status' }
    ]),
    dataMetrics: collectOfficialDrugLabelDataMetrics(drugInfos())
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.canCloseP401InternalGate, false);
  assert.strictEqual(review.pendingCount, 1);
  assert.strictEqual(review.fetchErrorCount, 2);
  assert.strictEqual(review.retryCandidateCount, 1);
  assert.strictEqual(review.fetchErrorSummary.transientFetchFailureCount, 1);
  assert.strictEqual(review.fetchErrorSummary.noOfficialCandidateCount, 1);
  assert.strictEqual(review.fetchErrorSummary.otherFetchErrorCount, 0);
  assert.strictEqual(review.needsReviewCount, 1);
  assert.strictEqual(review.needsReviewSummary.topFlags[0]?.label, '表ゆれ');
  assert.strictEqual(review.otherStatusCount, 1);
  assert.deepStrictEqual(review.samples.pending, ['未処理成分']);
  assert.ok(review.gates.some((gate) => gate.id === 'queue_remaining' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('原因別')));
});

test('buildOfficialDrugLabelQueueReview blocks legacy schema and non-PMDA source URLs', () => {
  const review = buildOfficialDrugLabelQueueReview({
    generatedAt,
    queueEntries: queueEntries(),
    dataMetrics: collectOfficialDrugLabelDataMetrics([{
      drugName: '旧データ薬',
      contraindications: [{
        targetDrug: '旧単数',
        clinicalEffect: 'KEGG由来の古い文言',
        sourceUrl: 'https://example.com/not-pmda'
      }]
    }])
  });

  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.dataMetrics.oldTargetDrugSchemaCount, 1);
  assert.strictEqual(review.dataMetrics.keggSignalCount, 1);
  assert.strictEqual(review.dataMetrics.nonPmdaSourceUrlCount, 1);
  assert.ok(review.gates.some((gate) => gate.id === 'legacy_schema' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'source_urls' && gate.status === 'blocked'));
});

test('official drug label queue review exports privacy-safe CSV, checklist, and CLI contract', () => {
  const review = buildOfficialDrugLabelQueueReview({
    generatedAt,
    queueEntries: queueEntries([{ ingredient: '=危険成分', status: 'pending' }]),
    dataMetrics: collectOfficialDrugLabelDataMetrics(drugInfos())
  });
  const csv = buildOfficialDrugLabelQueueReviewCsv(review);
  const checklist = buildOfficialDrugLabelQueueChecklist(review);

  assert.match(csv, /PMDAラベルキューを保留/);
  assert.match(csv, /fetch_error内訳/);
  assert.match(csv, /pending:=危険成分/);
  assert.match(checklist, /PMDA公式ラベルキューレビュー/);
  assert.match(checklist, /fetch_error内訳/);
  assert.match(checklist, /P4-01内部ゲート/);
  assert.doesNotMatch(csv + checklist, /山田太郎|patient-001|<html|\/Users|secret-token/i);
  assert.strictEqual(packageJson.scripts['drug-label:queue-review'], 'tsx scripts/runOfficialDrugLabelQueueReview.ts');
  assert.match(queueReviewScript, /YAKUREKI_DRUG_LABEL_QUEUE_REVIEW_OUTPUT_DIR/);
  assert.match(queueReviewScript, /official-drug-label-queue-review\.json/);
});
