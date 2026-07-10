import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./useDashboardTasks.ts', import.meta.url), 'utf8');

function section(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing section start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('dashboard task priority is based on prescription audit results', () => {
  assert.match(source, /buildPrescriptionInputAudit/);
  assert.match(source, /patient_allergy_match/);
  assert.match(source, /patient_side_effect_match/);
  assert.match(source, /要修正/);
  assert.match(source, /薬剤師確認/);
});

test('follow-up count screens completed prescriptions instead of mirroring completed count', () => {
  assert.match(source, /const completedVisits = \[\]/);
  assert.match(source, /completedVisits\.push\(visit\)/);
  assert.match(source, /interventionVisitIds/);
  assert.match(source, /hasFollowUpMedicationRisk/);
  assert.match(source, /hasLongTermPrescription/);
  assert.match(source, /Number\(item\.days\) >= 28/);
  assert.match(source, /DashboardFollowUpCandidate/);
  assert.match(source, /reasonFlags/);
  assert.match(source, /重点フォロー薬/);
  assert.match(source, /疑義照会あり/);
  assert.match(source, /followUp/);
  assert.match(source, /completeFollowUpCandidate/);
  assert.match(source, /recordFollowUpCandidate/);
  assert.match(source, /CompleteFollowUpInput/);
  assert.match(source, /RecordFollowUpInput/);
  assert.match(source, /contactMethod/);
  assert.match(source, /contactAttempts/);
  assert.match(source, /completedNote/);
  assert.match(source, /nextAction/);
  assert.match(source, /reminderAt/);
  assert.match(source, /reminderReason/);
  assert.match(source, /buildFollowUpSuggestion/);
  assert.match(source, /suggestedAction/);
  assert.match(source, /dueDate/);
  assert.match(source, /dueLabel/);
  assert.match(source, /isOverdue/);
  assert.match(source, /期限超過/);
  assert.match(source, /lastContactLabel/);
  assert.match(source, /attemptCount/);
  assert.match(source, /riskScore/);
  assert.match(source, /urgentFollowUpCount/);
  assert.match(source, /本日対応/);
  assert.match(source, /outcome: 'completed'/);
  assert.match(source, /status: nextStatus/);
  assert.match(source, /logAuditAction/);
  assert.match(source, /follow_up_record/);
  assert.match(source, /visit\.followUp\?\.status === 'completed'/);
  assert.match(source, /visit\.followUp\?\.status === 'dismissed'/);
  assert.match(source, /followUpDueCount/);
  assert.doesNotMatch(source, /followUpDueCount:\s*completedCount/);
});

test('follow-up record rolls back the visit update when audit logging fails', () => {
  const body = section('const recordFollowUpCandidate = useCallback', 'const completeFollowUpCandidate = useCallback');

  assert.match(body, /const previousVisit = visitDoc\.toJSON\(\) as Visit/);
  assert.match(body, /const hadExistingFollowUp = Object\.prototype\.hasOwnProperty\.call\(previousVisit, 'followUp'\)/);
  assert.match(body, /const auditOk = await logAuditAction\(/);
  assert.match(body, /if \(!auditOk\)/);
  assert.match(body, /await visitDoc\.incrementalModify\(\(rollbackVisit: Visit\) => \{/);
  assert.match(body, /rollbackVisit\.followUp = existingFollowUp/);
  assert.match(body, /delete rollbackVisit\.followUp/);
  assert.match(body, /服薬フォロー記録の監査ログ記録に失敗したため、変更を元に戻しました。/);
});

test('inventory shortage count is promoted into an actionable dashboard queue', () => {
  assert.match(source, /DashboardInventoryRisk/);
  assert.match(source, /inventoryRisks/);
  assert.match(source, /getTotalStock/);
  assert.match(source, /db\.drug_stocks\.find/);
  assert.match(source, /requiredVisitIdsByStockDrugId/);
  assert.match(source, /affectedPatientNames/);
  assert.match(source, /affectedVisitCount/);
  assert.match(source, /shortageAmount/);
  assert.match(source, /recommendedOrderAmount/);
  assert.match(source, /supplierName/);
  assert.match(source, /choosePrimarySupplier/);
  assert.match(source, /getInventoryOrderPriority/);
  assert.match(source, /getInventoryOrderActionLabel/);
  assert.match(source, /actionLabel/);
  assert.match(source, /棚位置未設定/);
  assert.match(source, /priority === 'high'/);
});

test('claim validation results are promoted into a return-prevention work queue', () => {
  assert.match(source, /DashboardClaimRisk/);
  assert.match(source, /claimRisks/);
  assert.match(source, /calculateDispensingFees/);
  assert.match(source, /getTotalPoints/);
  assert.match(source, /validateDispensingClaim/);
  assert.match(source, /buildClaimRiskSummary/);
  assert.match(source, /claimRiskCount/);
  assert.match(source, /urgentClaimRiskCount/);
  assert.match(source, /settingsData/);
  assert.match(source, /facility_settings\.findOne\('default'\)/);
  assert.match(source, /drugPrice: billingDrug\?\.price/);
  assert.match(source, /patientAlerts: alertsByPatientId\.get\(visit\.patientId\)/);
  assert.match(source, /claimSummary\.actionLabel/);
  assert.match(source, /topIssueTitles/);
  assert.match(source, /actionLabel/);
});

test('claim lifecycle rows are promoted into a monthly claim workbench', () => {
  assert.match(source, /DashboardClaimWorkItem/);
  assert.match(source, /claimWorkItems/);
  assert.match(source, /monthlyClaimVisits/);
  assert.match(source, /shouldIncludeInMonthlyClaimWorkbench/);
  assert.match(source, /getClaimLifecycleStatus/);
  assert.match(source, /getClaimWorkbenchPriority/);
  assert.match(source, /getClaimWorkbenchActionLabel/);
  assert.match(source, /CLAIM_LIFECYCLE_STATUS_LABELS/);
  assert.match(source, /returnedClaimCount/);
  assert.match(source, /rebillingClaimCount/);
  assert.match(source, /claimWorkbenchCount/);
  assert.match(source, /返戻/);
  assert.match(source, /再請求/);
});

test('dashboard exposes daily and monthly operational KPIs', () => {
  assert.match(source, /OperationalKpis/);
  assert.match(source, /EMPTY_OPERATIONAL_KPIS/);
  assert.match(source, /buildOperationalKpis/);
  assert.match(source, /kpis/);
  assert.match(source, /db\.soap_records\.find/);
  assert.match(source, /soapRecordDocs/);
  assert.match(source, /basisDate: today/);
  assert.match(source, /todayReceptionCount/);
  assert.match(source, /urgentFollowUpCount/);
});

test('monthly claim workbench never includes tutorial demo visits', () => {
  assert.match(source, /import \{ hasTutorialDemoData, isDemoVisit \} from '@\/lib\/demo_data'/);
  const monthlyCollect = section('const allVisits = await db.visits.find', 'const processingVisitIds');
  assert.match(monthlyCollect, /!isDemoVisit\(visit\)/);
  const demoGuardIndex = monthlyCollect.indexOf('!isDemoVisit(visit)');
  const pushIndex = monthlyCollect.indexOf('monthlyClaimVisits.push(visit)');
  assert.ok(demoGuardIndex > -1 && demoGuardIndex < pushIndex, 'demo exclusion must run before the visit joins the monthly claim list');
});

test('dashboard exposes leftover demo-data detection and a refresh handle', () => {
  assert.match(source, /hasTutorialDemoData/);
  assert.match(source, /const \[hasDemoData, setHasDemoData\] = useState\(false\)/);
  assert.match(source, /setHasDemoData\(await hasTutorialDemoData\(db\)\)/);
  assert.match(source, /const refresh = useCallback/);
  assert.match(source, /hasDemoData,\s*\n\s*refresh,/);
});
