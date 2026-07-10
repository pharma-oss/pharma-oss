import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const dashboardSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const printSource = readFileSync(new URL('./print/[visitId]/page.tsx', import.meta.url), 'utf8');

test('dashboard task cards open the pharmacist confirmation and print screen', () => {
  assert.match(dashboardSource, /router\.push\(`\/print\/\$\{visitId\}`\)/);
  assert.match(dashboardSource, /薬剤師確認・印刷画面/);
  assert.match(dashboardSource, /薬剤師確認を開く/);
});

test('dashboard surfaces follow-up candidates after completion', () => {
  assert.match(dashboardSource, /followUpCandidates/);
  assert.match(dashboardSource, /completeFollowUpCandidate/);
  assert.match(dashboardSource, /recordFollowUpCandidate/);
  assert.match(dashboardSource, /完了後フォロー候補/);
  assert.match(dashboardSource, /FollowUpCandidateRow/);
  assert.match(dashboardSource, /服薬フォロー対応記録/);
  assert.match(dashboardSource, /推奨フォロー計画/);
  assert.match(dashboardSource, /suggestedAction/);
  assert.match(dashboardSource, /riskScore/);
  assert.match(dashboardSource, /本日対応/);
  assert.match(dashboardSource, /対応記録/);
  assert.match(dashboardSource, /未完了で記録/);
  assert.match(dashboardSource, /接触\{attemptCount\}回/);
  assert.match(dashboardSource, /lastContactLabel/);
  assert.match(dashboardSource, /期限超過/);
  assert.match(dashboardSource, /記録して対応済み/);
  assert.match(dashboardSource, /router\.push\(`\/emr\?visitId=\$\{encodeURIComponent\(visitId\)\}`\)/);
});

test('dashboard surfaces an inventory shortage risk queue', () => {
  assert.match(dashboardSource, /inventoryRisks/);
  assert.match(dashboardSource, /inventory-risk-queue/);
  assert.match(dashboardSource, /在庫不足リスク/);
  assert.match(dashboardSource, /InventoryRiskRow/);
  assert.match(dashboardSource, /affectedPatientNames/);
  assert.match(dashboardSource, /shortageAmount/);
  assert.match(dashboardSource, /recommendedOrderAmount/);
  assert.match(dashboardSource, /supplierName/);
  assert.match(dashboardSource, /actionLabel/);
  assert.match(dashboardSource, /buildInventoryOrderCsv/);
  assert.match(dashboardSource, /buildInventoryOrderMemo/);
  assert.match(dashboardSource, /formatInventoryAmount/);
  assert.match(dashboardSource, /発注候補CSVを作成しました/);
  assert.match(dashboardSource, /発注・融通メモをコピーしました/);
  assert.match(dashboardSource, /在庫管理/);
  assert.match(dashboardSource, /router\.push\('\/inventory'\)/);
});

test('dashboard surfaces claim and return-prevention risk queue', () => {
  assert.match(dashboardSource, /claimRisks/);
  assert.match(dashboardSource, /claim-risk-queue/);
  assert.match(dashboardSource, /data-testid="claim-risk-queue"/);
  assert.match(dashboardSource, /data-testid="claim-risk-open-print"/);
  assert.match(dashboardSource, /返戻・請求リスク/);
  assert.match(dashboardSource, /ClaimRiskRow/);
  assert.match(dashboardSource, /urgentClaimRiskCount/);
  assert.match(dashboardSource, /counts\.claimRiskCount/);
  assert.match(dashboardSource, /topIssueTitles/);
  assert.match(dashboardSource, /actionLabel/);
  assert.match(dashboardSource, /リスク \{riskScore\}/);
  assert.match(dashboardSource, /請求確認/);
  assert.match(dashboardSource, /handleOpenTask\(risk\.visitId\)/);
});

test('dashboard surfaces cross-queue AI assisted prediction scores', () => {
  assert.match(dashboardSource, /buildOperationalAiPredictions/);
  assert.match(dashboardSource, /summarizeOperationalAiPredictions/);
  assert.match(dashboardSource, /operationalAiPredictions/);
  assert.match(dashboardSource, /AI補助予測スコア/);
  assert.match(dashboardSource, /返戻、在庫欠品、服薬フォロー/);
  assert.match(dashboardSource, /AiPredictionRow/);
  assert.match(dashboardSource, /prediction\.evidence/);
  assert.match(dashboardSource, /prediction\.confidence/);
  assert.match(dashboardSource, /handleOpenAiPrediction/);
  assert.match(dashboardSource, /prediction\.domain === 'inventory_shortage'/);
  assert.match(dashboardSource, /prediction\.domain === 'follow_up'/);
  assert.match(dashboardSource, /handleOpenTask\(prediction\.targetId\)/);
  assert.match(dashboardSource, /薬剤師/);
  assert.match(dashboardSource, /filterAiAssistItemsByMode/);
  assert.match(dashboardSource, /data-testid="operational-ai-mode-notice"/);
  assert.match(dashboardSource, /通常の業務キューは継続します/);
});

test('dashboard surfaces a monthly claim workbench for returns and rebilling', () => {
  assert.match(dashboardSource, /claimWorkItems/);
  assert.match(dashboardSource, /monthly-claim-workbench/);
  assert.match(dashboardSource, /data-testid="monthly-claim-workbench"/);
  assert.match(dashboardSource, /data-testid="monthly-claim-uke-button"/);
  assert.match(dashboardSource, /data-testid="monthly-claim-official-uke-button"/);
  assert.match(dashboardSource, /data-testid="monthly-claim-official-readiness-button"/);
  assert.match(dashboardSource, /data-testid="monthly-claim-close-accepted-button"/);
  assert.match(dashboardSource, /data-testid="claim-acceptance-import-button"/);
  assert.match(dashboardSource, /data-testid="claim-workbench-open-print"/);
  assert.match(dashboardSource, /月次請求ワークベンチ/);
  assert.match(dashboardSource, /ClaimWorkbenchRow/);
  assert.match(dashboardSource, /returnedClaimCount/);
  assert.match(dashboardSource, /rebillingClaimCount/);
  assert.match(dashboardSource, /claimWorkbenchCount/);
  assert.match(dashboardSource, /buildClaimWorkbenchCsv/);
  assert.match(dashboardSource, /buildClaimWorkbenchMemo/);
  assert.match(dashboardSource, /buildMonthlyClaimUkeResults/);
  assert.match(dashboardSource, /buildMonthlyClaimUkePreflightReport/);
  assert.match(dashboardSource, /buildMonthlyClaimUkeBundle/);
  assert.match(dashboardSource, /buildMonthlyClaimOfficialUkeBundle/);
  assert.match(dashboardSource, /buildClaimExportSnapshot/);
  assert.match(dashboardSource, /exportSnapshot/);
  assert.match(dashboardSource, /formatMonthlyClaimUkeAllFieldIssues/);
  assert.match(dashboardSource, /formatMonthlyClaimUkeOfficialReadinessIssues/);
  assert.match(dashboardSource, /formatMonthlyClaimUkeOfficialSampleScopeReport/);
  assert.match(dashboardSource, /officialSampleScopeReport/);
  assert.match(dashboardSource, /makeMonthlyClaimUkeAllFieldIssueFileName/);
  assert.match(dashboardSource, /makeMonthlyClaimUkeOfficialReadinessIssueFileName/);
  assert.match(dashboardSource, /makeMonthlyClaimUkeOfficialReadinessReviewFileName/);
  assert.match(dashboardSource, /handleDownloadClaimWorkbenchOfficialReadiness/);
  assert.match(dashboardSource, /handleDownloadClaimWorkbenchOfficialUke/);
  assert.match(dashboardSource, /公式確認/);
  assert.match(dashboardSource, /公式UKE/);
  assert.match(dashboardSource, /RECEIPTY\.CYO|bundle\.fileName/);
  assert.match(dashboardSource, /officialReadinessReviewCsv/);
  assert.match(dashboardSource, /downloadUtf8Csv/);
  assert.match(dashboardSource, /全項目定義の指摘/);
  assert.match(dashboardSource, /公式提出形式へ切り替える前/);
  assert.match(dashboardSource, /公式提出準備チェック/);
  assert.match(dashboardSource, /確認CSV/);
  assert.match(dashboardSource, /月次一括UKE出力停止/);
  assert.match(dashboardSource, /allFields指摘/);
  assert.match(dashboardSource, /allFields確認/);
  assert.match(dashboardSource, /officialReadinessSummary/);
  assert.match(dashboardSource, /allFieldSourceSummary\.sourceUrl/);
  assert.match(dashboardSource, /オンライン請求受付前チェック/);
  assert.match(dashboardSource, /parseOnlineClaimAcceptanceResults/);
  assert.match(dashboardSource, /reconcileOnlineClaimAcceptanceResults/);
  assert.match(dashboardSource, /formatOnlineClaimAcceptanceSourceFormat/);
  assert.match(dashboardSource, /handleImportClaimAcceptanceResults/);
  assert.match(dashboardSource, /handleDownloadClaimWorkbenchUke/);
  assert.match(dashboardSource, /handleCloseAcceptedClaimWorkbenchItems/);
  assert.match(dashboardSource, /markClaimClosed/);
  assert.match(dashboardSource, /isClaimWorkbenchUkeExportable/);
  assert.match(dashboardSource, /isClaimWorkbenchClosable/);
  assert.match(dashboardSource, /受付済締め/);
  assert.match(dashboardSource, /受付済み請求 \$\{closedCount\}件を請求完了として締めました/);
  assert.match(dashboardSource, /月次請求ワークCSVを作成しました/);
  assert.match(dashboardSource, /月次請求メモをコピーしました/);
  assert.match(dashboardSource, /月次一括UKEを作成しました/);
  assert.match(dashboardSource, /受付結果を取り込みました/);
  assert.match(dashboardSource, /取込形式/);
  assert.match(dashboardSource, /一括UKE/);
  assert.match(dashboardSource, /結果取込/);
  assert.match(dashboardSource, /UKE出力済み、返戻対応、再請求\/月遅れ準備/);
  assert.match(dashboardSource, /handleOpenTask\(item\.visitId\)/);
});

test('dashboard surfaces daily and monthly operational KPI cards', () => {
  assert.match(dashboardSource, /kpis/);
  assert.match(dashboardSource, /日次・月次KPI/);
  assert.match(dashboardSource, /KpiCard/);
  assert.match(dashboardSource, /buildOperationalClosingReport/);
  assert.match(dashboardSource, /buildOperationalClosingAuditDetails/);
  assert.match(dashboardSource, /buildOperationalClosingCsv/);
  assert.match(dashboardSource, /buildOperationalClosingMemo/);
  assert.match(dashboardSource, /facilitySettings/);
  assert.match(dashboardSource, /storeName: facilitySettings\?\.pharmacyName/);
  assert.match(dashboardSource, /storeCode: facilitySettings\?\.pharmacyCode/);
  assert.match(dashboardSource, /buildBackupContinuityReport/);
  assert.match(dashboardSource, /readBackupSchedulePolicy/);
  assert.match(dashboardSource, /schedulePolicy: backupSchedulePolicy/);
  assert.match(dashboardSource, /backupContinuity/);
  assert.match(dashboardSource, /バックアップ確認/);
  assert.match(dashboardSource, /countInventoryReceivingLogs/);
  assert.match(dashboardSource, /発注ワークベンチ入庫登録/);
  assert.match(dashboardSource, /inventoryReceivingCount/);
  assert.match(dashboardSource, /入庫登録/);
  assert.match(dashboardSource, /approve_daily_closing/);
  assert.match(dashboardSource, /daily_closing_approval/);
  assert.match(dashboardSource, /本日完了率/);
  assert.match(dashboardSource, /平均処理時間/);
  assert.match(dashboardSource, /閉店前残タスク/);
  assert.match(dashboardSource, /月次請求締め率/);
  assert.match(dashboardSource, /締め承認/);
  assert.match(dashboardSource, /締めメモ/);
  assert.match(dashboardSource, /締めCSV/);
  assert.match(dashboardSource, /日次締め承認を監査ログに記録しました/);
  assert.match(dashboardSource, /日次締めCSVを作成しました/);
  assert.match(dashboardSource, /日次締めメモをコピーしました/);
  assert.match(dashboardSource, /closingStatusLabel/);
  assert.match(dashboardSource, /closedClaimRateLabel/);
});

test('print screen keeps the route from pharmacist confirmation to picking support', () => {
  assert.match(printSource, /router\.push\(`\/emr\?visitId=\$\{encodeURIComponent\(visitId\)\}&openPicking=1`\)/);
  assert.match(printSource, />ピッキングへ</);
});

test('dashboard reminds staff to clean up leftover tutorial demo data', () => {
  assert.match(dashboardSource, /hasDemoData/);
  assert.match(dashboardSource, /data-testid="demo-data-reminder"/);
  assert.match(dashboardSource, /data-testid="demo-data-cleanup-button"/);
  assert.match(dashboardSource, /デモデータを片づける/);
  // 削除前に確認し、削除後はダッシュボード集計を再読み込みする
  const cleanupBody = dashboardSource.slice(
    dashboardSource.indexOf('const handleCleanupDemoData = useCallback'),
    dashboardSource.indexOf('const handleOpenTask')
  );
  assert.match(cleanupBody, /window\.confirm\(/);
  assert.match(cleanupBody, /cleanupTutorialDemoData\(db\)/);
  assert.match(cleanupBody, /refresh\(\)/);
});
