import { test } from 'node:test';
import assert from 'node:assert';
import type { Visit } from '../db/types.ts';
import { markClaimExported, type ClaimExportSnapshot } from './claim_lifecycle.ts';
import {
  formatOnlineClaimAcceptanceIssues,
  formatOnlineClaimAcceptanceSourceFormat,
  parseOnlineClaimAcceptanceResults,
  reconcileOnlineClaimAcceptanceResults
} from './online_claim_acceptance.ts';

function makeVisit(overrides: Partial<Visit> = {}): Visit {
  return {
    visitId: 'visit_1',
    patientId: 'pt_1',
    issueDate: '2026-06-14T09:00:00.000Z',
    status: 'completed',
    claimLifecycle: markClaimExported({
      at: '2026-06-14T10:00:00.000Z',
      by: '薬剤師 一郎',
      fileName: 'MONTHLY_CLAIM_20260614.uke',
      totalPoints: 147
    }),
    ...overrides
  };
}

function makeExportSnapshot(overrides: Partial<ClaimExportSnapshot> = {}): ClaimExportSnapshot {
  return {
    createdAt: '2026-06-14T10:00:00.000Z',
    visitId: 'visit_1',
    patientId: 'pt_1',
    patientName: '山田 太郎',
    patientBirthDate: '1980-01-01',
    issueDate: '2026-06-14T09:00:00.000Z',
    totalPoints: 147,
    prescriptionItems: [],
    ...overrides
  };
}

test('parseOnlineClaimAcceptanceResults parses accepted and returned CSV rows', () => {
  const parsed = parseOnlineClaimAcceptanceResults([
    '受付ID,患者ID,受付結果,受付番号,点数,理由',
    'visit_1,pt_1,受付済,ACC-001,147,',
    'visit_2,pt_2,返戻,,98,保険番号相違'
  ].join('\n'));

  assert.strictEqual(parsed.issues.length, 0);
  assert.strictEqual(parsed.rows.length, 2);
  assert.strictEqual(parsed.rows[0].status, 'accepted');
  assert.strictEqual(parsed.rows[0].receiptNumber, 'ACC-001');
  assert.strictEqual(parsed.rows[1].status, 'returned');
  assert.strictEqual(parsed.rows[1].reason, '保険番号相違');
});

test('parseOnlineClaimAcceptanceResults accepts preamble rows and payer-style TSV aliases', () => {
  const parsed = parseOnlineClaimAcceptanceResults([
    'オンライン請求受付結果一覧',
    '医療機関コード\t1312345',
    '来局ID\t患者番号\t処理結果\t受付管理番号\t総点数\t返戻事由\t請求ファイル名',
    'visit_1\tpt_1\t正常終了\tACC-001\t１,４７点\t\tMONTHLY_CLAIM_202606.uke',
    'visit_2\tpt_2\t受付不能\t\t98点\t資格喪失\tMONTHLY_CLAIM_202606.uke',
    '合計\t2件'
  ].join('\n'));

  assert.strictEqual(parsed.issues.length, 0);
  assert.strictEqual(parsed.sourceFormat?.delimiter, 'tab');
  assert.strictEqual(parsed.sourceFormat?.headerLine, 3);
  assert.strictEqual(parsed.sourceFormat?.recognizedColumns.visitId, '来局ID');
  assert.strictEqual(parsed.rows.length, 2);
  assert.strictEqual(parsed.rows[0].status, 'accepted');
  assert.strictEqual(parsed.rows[0].receiptNumber, 'ACC-001');
  assert.strictEqual(parsed.rows[0].totalPoints, 147);
  assert.strictEqual(parsed.rows[0].fileName, 'MONTHLY_CLAIM_202606.uke');
  assert.strictEqual(parsed.rows[1].status, 'returned');
  assert.strictEqual(parsed.rows[1].reason, '資格喪失');
  assert.match(formatOnlineClaimAcceptanceSourceFormat(parsed.sourceFormat), /TSV \/ ヘッダー3行目/);
});

test('parseOnlineClaimAcceptanceResults accepts fixed-width text exported from receipt result reports', () => {
  const parsed = parseOnlineClaimAcceptanceResults([
    'オンライン請求受付結果一覧',
    '作成日時 2026/06/15 10:00',
    '受付ID        患者番号    患者名        処理結果    受付管理番号    総点数    返戻事由',
    'visit_1       pt_1        山田 太郎     受付完了    ACC-001         １４７',
    'visit_2       pt_2        佐藤 花子     返戻                       98        保険番号相違',
    '合計          2件'
  ].join('\n'));

  assert.strictEqual(parsed.issues.length, 0);
  assert.strictEqual(parsed.sourceFormat?.delimiter, 'fixed_width_text');
  assert.strictEqual(parsed.sourceFormat?.headerLine, 3);
  assert.strictEqual(parsed.sourceFormat?.recognizedColumns.visitId, '受付ID');
  assert.strictEqual(parsed.sourceFormat?.recognizedColumns.status, '処理結果');
  assert.strictEqual(parsed.rows.length, 2);
  assert.strictEqual(parsed.rows[0].patientName, '山田 太郎');
  assert.strictEqual(parsed.rows[0].status, 'accepted');
  assert.strictEqual(parsed.rows[0].receiptNumber, 'ACC-001');
  assert.strictEqual(parsed.rows[0].totalPoints, 147);
  assert.strictEqual(parsed.rows[1].patientName, '佐藤 花子');
  assert.strictEqual(parsed.rows[1].status, 'returned');
  assert.strictEqual(parsed.rows[1].reason, '保険番号相違');
  assert.match(formatOnlineClaimAcceptanceSourceFormat(parsed.sourceFormat), /固定長風テキスト \/ ヘッダー3行目/);
});

test('parseOnlineClaimAcceptanceResults accepts copied PDF result text blocks', () => {
  const parsed = parseOnlineClaimAcceptanceResults([
    'オンライン請求受付結果通知書',
    '保険者別受付結果 2026年6月請求分',
    '受付ID: visit_1 患者番号: pt_1 患者氏名: 山田 太郎',
    '受付結果: 受付完了 受理番号: ACC-001 請求点数: 147点',
    '請求ファイル: MONTHLY_CLAIM_202606.uke',
    '------------------------------------------------',
    'レセプト管理番号 visit_2',
    '患者番号 pt_2',
    '患者名 佐藤 花子',
    '処理結果 受付不能',
    '総点数 98',
    '返戻事由',
    '保険番号相違',
    '資格喪失疑い',
    '合計 2件'
  ].join('\n'));

  assert.strictEqual(parsed.issues.length, 0);
  assert.strictEqual(parsed.sourceFormat?.delimiter, 'pdf_text');
  assert.strictEqual(parsed.sourceFormat?.headerLine, 3);
  assert.strictEqual(parsed.sourceFormat?.recognizedColumns.visitId, '受付ID');
  assert.strictEqual(parsed.sourceFormat?.recognizedColumns.patientName, '患者名');
  assert.strictEqual(parsed.rows.length, 2);
  assert.strictEqual(parsed.rows[0].visitId, 'visit_1');
  assert.strictEqual(parsed.rows[0].patientId, 'pt_1');
  assert.strictEqual(parsed.rows[0].patientName, '山田 太郎');
  assert.strictEqual(parsed.rows[0].status, 'accepted');
  assert.strictEqual(parsed.rows[0].receiptNumber, 'ACC-001');
  assert.strictEqual(parsed.rows[0].totalPoints, 147);
  assert.strictEqual(parsed.rows[0].fileName, 'MONTHLY_CLAIM_202606.uke');
  assert.strictEqual(parsed.rows[1].visitId, 'visit_2');
  assert.strictEqual(parsed.rows[1].patientName, '佐藤 花子');
  assert.strictEqual(parsed.rows[1].status, 'returned');
  assert.strictEqual(parsed.rows[1].totalPoints, 98);
  assert.strictEqual(parsed.rows[1].reason, '保険番号相違 資格喪失疑い');
  assert.match(formatOnlineClaimAcceptanceSourceFormat(parsed.sourceFormat), /PDF抽出テキスト \/ ヘッダー3行目/);
});

test('parseOnlineClaimAcceptanceResults reports missing headers and duplicate rows', () => {
  const missing = parseOnlineClaimAcceptanceResults('患者ID,受付結果\npt_1,受付済');
  assert.ok(missing.issues.some((issue) => issue.code === 'acceptance_header_missing'));

  const duplicated = parseOnlineClaimAcceptanceResults([
    '受付ID,受付結果',
    'visit_1,受付済',
    'visit_1,返戻'
  ].join('\n'));
  assert.ok(duplicated.issues.some((issue) => issue.code === 'acceptance_duplicate_visit'));
  assert.match(formatOnlineClaimAcceptanceIssues(duplicated.issues), /受付IDが重複/);
});

test('reconcileOnlineClaimAcceptanceResults warns on patient name mismatch without blocking id-matched rows', () => {
  const rows = parseOnlineClaimAcceptanceResults([
    '受付ID,患者ID,患者名,受付結果,点数',
    'visit_1,pt_1,山田 花子,受付済,147'
  ].join('\n')).rows;
  const reconciliation = reconcileOnlineClaimAcceptanceResults({
    rows,
    visits: [
      makeVisit({
        claimLifecycle: markClaimExported({
          at: '2026-06-14T10:00:00.000Z',
          by: '薬剤師 一郎',
          fileName: 'MONTHLY_CLAIM_20260614.uke',
          totalPoints: 147,
          exportSnapshot: makeExportSnapshot({ patientName: '山田 太郎' })
        })
      })
    ],
    importedAt: '2026-06-14T11:00:00.000Z',
    importedBy: '管理者'
  });

  assert.ok(reconciliation.issues.some((issue) => issue.code === 'acceptance_patient_name_mismatch'));
  assert.ok(!reconciliation.issues.some((issue) => issue.severity === 'error'));
  assert.strictEqual(reconciliation.items[0].nextLifecycle?.status, 'accepted');
});

test('reconcileOnlineClaimAcceptanceResults marks accepted and returned claims', () => {
  const rows = parseOnlineClaimAcceptanceResults([
    '受付ID,患者ID,受付結果,受付番号,点数,理由',
    'visit_1,pt_1,受付済,ACC-001,147,',
    'visit_2,pt_2,返戻,,98,保険番号相違'
  ].join('\n')).rows;
  const reconciliation = reconcileOnlineClaimAcceptanceResults({
    rows,
    visits: [
      makeVisit(),
      makeVisit({
        visitId: 'visit_2',
        patientId: 'pt_2',
        claimLifecycle: markClaimExported({
          at: '2026-06-14T10:00:00.000Z',
          by: '薬剤師 一郎',
          fileName: 'MONTHLY_CLAIM_20260614.uke',
          totalPoints: 98
        })
      })
    ],
    importedAt: '2026-06-14T11:00:00.000Z',
    importedBy: '管理者'
  });

  assert.strictEqual(reconciliation.issues.length, 0);
  assert.strictEqual(reconciliation.acceptedCount, 1);
  assert.strictEqual(reconciliation.returnedCount, 1);
  assert.strictEqual(reconciliation.items[0].nextLifecycle?.status, 'accepted');
  assert.strictEqual(reconciliation.items[0].nextLifecycle?.acceptanceReceiptNumber, 'ACC-001');
  assert.strictEqual(reconciliation.items[1].nextLifecycle?.status, 'returned');
  assert.strictEqual(reconciliation.items[1].nextLifecycle?.returnReason, '保険番号相違');
});

test('reconcileOnlineClaimAcceptanceResults blocks patient mismatches and warns on point mismatch', () => {
  const rows = parseOnlineClaimAcceptanceResults([
    '受付ID,患者ID,受付結果,点数',
    'visit_1,pt_other,受付済,148'
  ].join('\n')).rows;
  const reconciliation = reconcileOnlineClaimAcceptanceResults({
    rows,
    visits: [makeVisit()],
    importedAt: '2026-06-14T11:00:00.000Z',
    importedBy: '管理者'
  });

  assert.ok(reconciliation.issues.some((issue) => issue.code === 'acceptance_patient_mismatch'));
  assert.ok(reconciliation.issues.some((issue) => issue.code === 'acceptance_points_mismatch'));
  assert.strictEqual(reconciliation.items[0].nextLifecycle, undefined);
});
