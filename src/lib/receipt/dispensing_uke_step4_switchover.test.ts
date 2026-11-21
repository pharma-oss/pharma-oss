import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  categorizeUkeExportAuditType,
  evaluateUkeRetirementReadiness,
  UKE_UI_GUIDANCE
} from './uke_migration_policy';
import { PrintHeaderActions } from '@/app/print/components/PrintHeaderActions';

test('track C-1 step 4: categorizeUkeExportAuditType distinguishes official from legacy inspection exports', () => {
  // 1. 公式提出用の監査ログ
  assert.equal(
    categorizeUkeExportAuditType('公式レセプト（UKE / RECEIPTY.CYO）エクスポート: 患者「テスト」の公式電子レセプト（点数: 1500点）を出力しました。'),
    'official'
  );
  assert.equal(
    categorizeUkeExportAuditType('月次公式UKE出力: RECEIPTY.CYO / 受付 12件 / 合計 18000点 / 提出準備確認済み / 集計突合OK'),
    'official'
  );

  // 2. 点検用旧形式の監査ログ
  assert.equal(
    categorizeUkeExportAuditType('レセプト（UKE・点検用旧形式）エクスポート: 患者「テスト」の電子レセプト（点数: 1500点、ファイル: RECEIPT_1.uke）を出力しました。'),
    'legacy_inspection'
  );
  assert.equal(
    categorizeUkeExportAuditType('月次一括UKE（点検用旧形式）出力: RECEIPT_2026-10.uke / 受付 12件 / 合計 18000点。'),
    'legacy_inspection'
  );

  // 3. その他
  assert.equal(
    categorizeUkeExportAuditType('処方監査を実施しました'),
    'unknown'
  );
});

test('track C-1 step 4: evaluateUkeRetirementReadiness strictly enforces safe retirement criteria', () => {
  // A. すべての基準未達成
  const resultBlocked = evaluateUkeRetirementReadiness({
    pilotMonthsConfirmed: 0,
    legacyExportCountLast3Months: 15,
    stakeholderConsentObtained: false
  });
  assert.equal(resultBlocked.canRetireLegacy, false);
  assert.equal(resultBlocked.currentStatus, 'active_parallel');
  assert.equal(resultBlocked.blockers.length, 3);

  // B. 実績あり・出力0だが合意がまだ
  const resultNesting = evaluateUkeRetirementReadiness({
    pilotMonthsConfirmed: 2,
    legacyExportCountLast3Months: 0,
    stakeholderConsentObtained: false
  });
  assert.equal(resultNesting.canRetireLegacy, false);
  assert.equal(resultNesting.currentStatus, 'ready_for_ui_nesting');
  assert.equal(resultNesting.blockers.length, 1);
  assert.match(resultNesting.blockers[0], /完全廃止合意が得られていません/);

  // C. 全条件クリア
  const resultReady = evaluateUkeRetirementReadiness({
    pilotMonthsConfirmed: 3,
    legacyExportCountLast3Months: 0,
    stakeholderConsentObtained: true
  });
  assert.equal(resultReady.canRetireLegacy, true);
  assert.equal(resultReady.currentStatus, 'ready_for_full_retirement');
  assert.equal(resultReady.blockers.length, 0);
});

test('track C-1 step 5a: single visit print header promotes official UKE and nests legacy UKE inside details disclosure', () => {
  const html = renderToStaticMarkup(
    React.createElement(PrintHeaderActions, {
      canExportUke: true,
      canPrintDocuments: true,
      hasClaimErrors: false,
      isSelfPayClaimExcluded: false,
      onOpenPicking: () => {},
      onOpenOfficialUke: () => {},
      onDownloadLegacyUke: () => {},
      onPrint: () => {}
    })
  );

  // 1. 公式UKEボタンはツールバー前面に配置され、点検用旧形式ボタンは閉じた <details> 内に格納されていること
  assert.match(html, /data-testid="print-official-uke-button"/);
  assert.match(
    html,
    /<details class="legacy-uke-details" data-testid="print-legacy-uke-disclosure"><summary class="legacy-uke-summary">旧形式UKE<\/summary>[\s\S]*?data-testid="print-uke-export-button"[\s\S]*?<\/details>/
  );
  assert.equal(html.includes('data-testid="print-legacy-uke-disclosure" open'), false, '旧形式UKEの折りたたみは初期状態で閉じていること');

  // 2. ボタンの title 属性で正本と点検用旧形式の役割が現場に明示されていること
  assert.ok(html.includes(UKE_UI_GUIDANCE.singleVisit.officialButtonTitle));
  assert.ok(html.includes(UKE_UI_GUIDANCE.singleVisit.legacyButtonTitleReady));

  // 3. 監査ログメッセージが「点検用旧形式」と「公式レセプト（UKE / RECEIPTY.CYO）」で厳密に区別されていること
  const printPagePath = path.resolve(process.cwd(), 'src/app/print/[visitId]/page.tsx');
  const printSource = fs.readFileSync(printPagePath, 'utf8');
  assert.match(printSource, /レセプト（UKE・点検用旧形式）エクスポート:/);
  assert.match(printSource, /公式レセプト（UKE \/ RECEIPTY\.CYO）エクスポート:/);
});

test('track C-1 step 5a: monthly claim workbench promotes official UKE and nests legacy UKE inside details disclosure', () => {
  const workbenchPath = path.resolve(process.cwd(), 'src/components/dashboard/ClaimWorkbenchSection.tsx');
  const workbenchSource = fs.readFileSync(workbenchPath, 'utf8');

  // 1. 公式UKEボタンが primary スタイルとして正本強調されていること
  assert.match(
    workbenchSource,
    /className="section-action-button primary"[\s\S]*?data-testid="monthly-claim-official-uke-button"/
  );

  // 2. 点検用旧形式ボタンが <details> 折りたたみ内に格納されていること
  assert.match(
    workbenchSource,
    /<details[\s\S]*?data-testid="monthly-claim-legacy-uke-disclosure"[\s\S]*?<summary className="legacy-uke-summary">旧形式UKE<\/summary>[\s\S]*?data-testid="monthly-claim-uke-button"[\s\S]*?<\/details>/
  );

  // 3. 各ボタンの title 属性で公式正本と点検用旧形式が明記されていること
  assert.match(workbenchSource, new RegExp(UKE_UI_GUIDANCE.monthlyClaim.officialButtonTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(workbenchSource, new RegExp(UKE_UI_GUIDANCE.monthlyClaim.legacyButtonTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // 4. 監査ログが点検用旧形式と公式正本で区別されていること
  assert.match(workbenchSource, /月次一括UKE（点検用旧形式）出力:/);
  assert.match(workbenchSource, /月次公式UKE出力: \$\{officialFileName\} \/ RECEIPTY\.CYO/);
});
