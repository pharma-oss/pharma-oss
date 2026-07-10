import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  buildOfficialDrugLabelNoCandidateChecklist,
  buildOfficialDrugLabelNoCandidateEvidenceTemplate,
  buildOfficialDrugLabelNoCandidateReview,
  buildOfficialDrugLabelNoCandidateReviewCsv,
  collectOfficialDrugLabelNoCandidateEntries,
  type OfficialDrugLabelNoCandidateEvidenceInput
} from './official_drug_label_no_candidate_review.ts';
import type { OfficialDrugLabelQueueEntry } from './official_drug_label_queue_review.ts';

const generatedAt = new Date('2026-07-07T10:00:00.000Z');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const noCandidateReviewScript = readFileSync(new URL('../../scripts/runOfficialDrugLabelNoCandidateReview.ts', import.meta.url), 'utf8');

function queueEntries(overrides: OfficialDrugLabelQueueEntry[] = []): OfficialDrugLabelQueueEntry[] {
  return [
    {
      ingredient: 'アムロジピン',
      productCount: 121,
      status: 'done',
      sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/example-a'
    },
    {
      ingredient: '通信失敗成分',
      productCount: 3,
      status: 'fetch_error',
      error: 'timeout'
    },
    ...overrides
  ];
}

function completeEvidence(): OfficialDrugLabelNoCandidateEvidenceInput {
  return {
    capturedAt: '2026-07-07T09:30:00.000Z',
    operatorReviewId: 'pmda-no-candidate-review-001',
    sourceArtifactSha256: 'b'.repeat(64),
    noPatientDataConfirmed: true,
    officialProcedureConfirmed: true,
    pmdaGeneralListRechecked: true,
    localMasterCandidatesReviewed: true,
    alternativeSourceSearchCompleted: true,
    noOfficialLabelFoundClosureApproved: true,
    ownerReviewCompleted: true
  };
}

test('collectOfficialDrugLabelNoCandidateEntries collects only PMDA no-candidate fetch errors', () => {
  const entries = collectOfficialDrugLabelNoCandidateEntries(queueEntries([
    {
      ingredient: '候補なし成分',
      productCount: 7,
      representativeDrugName: '候補なし成分錠',
      representativeDocumentUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example',
      status: 'fetch_error',
      error: 'GeneralListページに添付文書候補が見つかりません: https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example',
      lastAttemptAt: '2026-07-07T09:10:00.000Z'
    },
    {
      ingredient: '閉じ済み成分',
      productCount: 1,
      status: 'no_official_label_found'
    }
  ]));

  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0]?.ingredient, '候補なし成分');
});

test('buildOfficialDrugLabelNoCandidateReview blocks closure until human evidence and owner approval are present', () => {
  const noCandidateEntries = collectOfficialDrugLabelNoCandidateEntries(queueEntries([
    {
      ingredient: '候補なし成分',
      productCount: 7,
      representativeDrugName: '候補なし成分錠',
      representativeDocumentUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example',
      status: 'fetch_error',
      error: 'GeneralListページに添付文書候補が見つかりません: https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example',
      lastAttemptAt: '2026-07-07T09:10:00.000Z'
    }
  ]));
  const review = buildOfficialDrugLabelNoCandidateReview({ generatedAt, noCandidateEntries });

  assert.strictEqual(review.type, 'yakureki-official-drug-label-no-candidate-review');
  assert.strictEqual(review.schemaVersion, 1);
  assert.strictEqual(review.status, 'blocked');
  assert.strictEqual(review.readyForNoOfficialLabelFoundClosure, false);
  assert.strictEqual(review.candidateCount, 1);
  assert.strictEqual(review.totalProductCount, 7);
  assert.strictEqual(review.highProductCountCandidateCount, 1);
  assert.strictEqual(review.missingRepresentativeDocumentUrlCount, 0);
  assert.strictEqual(review.evidenceIntegrity.status, 'attention');
  assert.ok(review.gates.some((gate) => gate.id === 'pmda_search_recheck' && gate.status === 'blocked'));
  assert.ok(review.gates.some((gate) => gate.id === 'owner_review' && gate.status === 'blocked'));
  assert.ok(review.nextActions.some((action) => action.includes('責任者')));
});

test('buildOfficialDrugLabelNoCandidateReview passes when PMDA no-candidate evidence is complete', () => {
  const noCandidateEntries = collectOfficialDrugLabelNoCandidateEntries(queueEntries([
    {
      ingredient: '候補なし成分',
      productCount: 7,
      representativeDrugName: '候補なし成分錠',
      representativeDocumentUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example',
      status: 'fetch_error',
      error: 'GeneralListページに添付文書候補が見つかりません: https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example',
      lastAttemptAt: '2026-07-07T09:10:00.000Z'
    }
  ]));
  const review = buildOfficialDrugLabelNoCandidateReview({
    generatedAt,
    noCandidateEntries,
    evidence: completeEvidence()
  });

  assert.strictEqual(review.status, 'pass');
  assert.strictEqual(review.readyForNoOfficialLabelFoundClosure, true);
  assert.strictEqual(review.evidenceIntegrity.status, 'pass');
  assert.ok(review.gates.every((gate) => gate.status === 'pass'));
  assert.deepStrictEqual(review.nextActions, ['対応不要']);
});

test('official drug label no-candidate review exports privacy-safe CSV, checklist, template, and CLI contract', () => {
  const review = buildOfficialDrugLabelNoCandidateReview({
    generatedAt,
    noCandidateEntries: collectOfficialDrugLabelNoCandidateEntries(queueEntries([
      {
        ingredient: '=候補なし成分',
        productCount: 7,
        representativeDrugName: '+候補なし成分錠',
        representativeDocumentUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example',
        status: 'fetch_error',
        error: 'GeneralListページに添付文書候補が見つかりません: https://www.pmda.go.jp/PmdaSearch/iyakuDetail/GeneralList/example'
      }
    ]))
  });
  const csv = buildOfficialDrugLabelNoCandidateReviewCsv(review);
  const checklist = buildOfficialDrugLabelNoCandidateChecklist(review);
  const template = buildOfficialDrugLabelNoCandidateEvidenceTemplate({ generatedAt });

  assert.match(csv, /PMDA候補なし確認を保留/);
  assert.match(csv, /PMDA候補なしレビュー/);
  assert.match(csv, /'=候補なし成分/);
  assert.match(checklist, /PMDA検索候補なしレビュー/);
  assert.match(checklist, /no_official_label_found閉じ候補/);
  assert.strictEqual(template.type, 'yakureki-official-drug-label-no-candidate-evidence-template');
  assert.strictEqual(template.noPatientDataConfirmed, false);
  assert.doesNotMatch(csv + checklist + JSON.stringify(template), /山田太郎|patient-001|<html|\/Users|secret-token/i);
  assert.strictEqual(
    packageJson.scripts['drug-label:no-candidate-review'],
    'tsx scripts/runOfficialDrugLabelNoCandidateReview.ts'
  );
  assert.match(noCandidateReviewScript, /YAKUREKI_DRUG_LABEL_NO_CANDIDATE_EVIDENCE/);
  assert.match(noCandidateReviewScript, /official-drug-label-no-candidate-review\.json/);
});
