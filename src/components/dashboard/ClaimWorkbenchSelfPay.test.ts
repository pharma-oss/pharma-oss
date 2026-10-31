import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClaimWorkbenchRow } from './DashboardRows';
import type { DashboardClaimWorkItem } from '@/hooks/useDashboardTasks';

// 保険種別が「自費」の患者を請求から外す配線を、画面の側で固定する。
// 判定・仕分け・UKEの防御そのものは src/lib/self_pay_claim.test.ts が実動で確かめている。

const workbenchSource = readFileSync(new URL('./ClaimWorkbenchSection.tsx', import.meta.url), 'utf8');
const printPageSource = readFileSync(new URL('../../app/print/[visitId]/page.tsx', import.meta.url), 'utf8');
const dashboardPageSource = readFileSync(new URL('../../app/app/page.tsx', import.meta.url), 'utf8');
const dashboardHookSource = readFileSync(new URL('../../hooks/useDashboardTasks.ts', import.meta.url), 'utf8');

function section(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  assert.ok(from >= 0, `start marker not found: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.ok(to > from, `end marker not found: ${end}`);
  return source.slice(from, to);
}

test('the workbench case builder drops self-pay cases and the visits that would be marked exported', () => {
  const body = section(workbenchSource, 'const buildClaimWorkbenchUkeCases = useCallback', 'const handleDownloadClaimWorkbenchOfficialReadiness');
  assert.match(body, /partitionSelfPayClaims\(cases\)/);
  // UKEに載せなかった受付を、出力済み・ロックにしない
  assert.match(body, /selfPayVisitIds/);
  assert.match(body, /claimableVisits = visits\.filter/);
  assert.match(body, /claimableVisitDocs = orderedVisitDocs\.filter/);
  assert.match(body, /return \{ cases: claimable, selfPayExcluded, missingMessages, visits: claimableVisits, visitDocs: claimableVisitDocs \}/);
});

test('every handler that builds UKE cases tells how many self-pay patients were left out, and ends quietly when none are left', () => {
  const builderCalls = workbenchSource.match(/await buildClaimWorkbenchUkeCases\(/g) || [];
  assert.strictEqual(builderCalls.length, 4, 'readiness, rule review, official UKE, legacy UKE');
  const destructured = workbenchSource.match(/const \{ cases, selfPayExcluded, missingMessages[^}]*\} = await buildClaimWorkbenchUkeCases\(/g) || [];
  assert.strictEqual(destructured.length, 4);
  const notes = workbenchSource.match(/const selfPayNote = describeSelfPayExclusion\(selfPayExcluded, cases\.length\);/g) || [];
  assert.strictEqual(notes.length, 4);
  assert.strictEqual((workbenchSource.match(/if \(selfPayNote\) toast\.info\(selfPayNote\);/g) || []).length, 4);
  // 空になっても、自費の説明があるときは「受付がありません」の二重表示にしない。エラーにもしない
  assert.strictEqual((workbenchSource.match(/if \(!selfPayNote\) toast\.info\(/g) || []).length, 4);
  assert.ok(!/throw new Error\([^)]*自費/.test(workbenchSource));
});

test('the workbench says when a billed claim now belongs to a self-pay patient', () => {
  assert.match(workbenchSource, /claimWorkItems\.some\(\(item\) => item\.selfPayExcluded\)/);
  assert.match(workbenchSource, /data-testid="claim-workbench-self-pay-note"/);
});

test('the dashboard risk section shows how many self-pay patients it leaves out', () => {
  assert.match(dashboardPageSource, /counts\.selfPayClaimExcludedCount \?\? 0\) > 0/);
  assert.match(dashboardPageSource, /data-testid="claim-risk-self-pay-note"/);
  assert.match(dashboardHookSource, /selfPayClaimExcludedCount: selfPayExcludedCount/);
});

test('the print page stops both UKE exports for a self-pay patient and says so in the claim screens', () => {
  assert.match(printPageSource, /const isSelfPayClaimExcluded = isSelfPayPatient\(patientData\);/);
  // 旧形式UKE: ボタンもハンドラも止める
  assert.match(printPageSource, /disabled=\{!canExportUke \|\| hasClaimErrors \|\| isSelfPayClaimExcluded\}/);
  const handler = section(printPageSource, 'const handleDownloadUke = async', 'const handleRegisterReturn = async');
  assert.match(handler, /if \(isSelfPayClaimExcluded\) \{\s*alert\(SELF_PAY_UKE_BLOCKED_MESSAGE\);\s*return;\s*\}/);
  // 公式UKE: ボタンとモーダルのチェックを止める
  assert.match(printPageSource, /disabled=\{!canExportUke \|\| isSelfPayClaimExcluded\}/);
  assert.match(printPageSource, /hasClaimErrors=\{hasClaimErrors \|\| isSelfPayClaimExcluded\}/);
  // 請求の画面に、対象外であることを出す
  assert.match(printPageSource, /data-testid="print-self-pay-claim-note"/);
  assert.match(printPageSource, /SELF_PAY_CLAIM_EXCLUSION_NOTE/);
  assert.match(printPageSource, /isSelfPayClaimExcluded \? '対象外（自費）'/);
  assert.match(printPageSource, /isSelfPayClaimExcluded \? '対象外' :/);
});

test('the print page leaves the receipt amount calculation alone for a self-pay patient', () => {
  // 領収金額は、自費でも保険点数×負担割合のまま。除外の判定を領収証の計算に持ち込んでいないこと
  const amounts = section(printPageSource, 'const insuranceAmounts = calculateInsuranceAmounts(', 'const copaymentGuidance');
  assert.ok(!amounts.includes('isSelfPayClaimExcluded'));
  const receiptSection = section(printPageSource, 'const receiptAmountsPending = unsetPointFees.length > 0;', 'const sumFeePoints = (codes: FeeCode[]) =>');
  assert.ok(!receiptSection.includes('isSelfPayClaimExcluded'));
});

const baseItem: DashboardClaimWorkItem = {
  visitId: 'v1',
  patientId: 'p1',
  name: '患者 一郎',
  issueDateLabel: '8/5',
  monthLabel: '8月',
  status: 'rebilling',
  statusLabel: '再請求準備',
  priority: 'normal',
  priorityLabel: '通常',
  totalPoints: 500,
  prescriptionCount: 2,
  latestEventLabel: '再請求準備 8/20',
  actionLabel: '再請求の準備を進める'
};

test('the workbench row shows a self-pay badge only for a flagged claim', () => {
  const flagged = renderToStaticMarkup(React.createElement(ClaimWorkbenchRow, { item: { ...baseItem, selfPayExcluded: true }, onOpen: () => {} }));
  assert.ok(flagged.includes('data-testid="claim-workbench-self-pay-badge"'));
  assert.ok(flagged.includes('自費（UKE対象外）'));
  const normal = renderToStaticMarkup(React.createElement(ClaimWorkbenchRow, { item: baseItem, onOpen: () => {} }));
  assert.ok(!normal.includes('claim-workbench-self-pay-badge'));
  assert.ok(!normal.includes('自費'));
});
