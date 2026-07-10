import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const printSource = readFileSync(new URL('./[visitId]/page.tsx', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const workflowSource = readFileSync(new URL('../../../.github/workflows/onboarding-e2e.yml', import.meta.url), 'utf8');
const printLayoutScript = readFileSync(new URL('../../../scripts/runPrintLayoutRegression.mjs', import.meta.url), 'utf8');

const printDocumentTestIds = [
  'dispensing-record-doc',
  'receipt-statement-doc',
  'receipt-doc',
  'drug-info-doc',
  'medicine-bag-doc',
  'medicine-notebook-sticker-doc',
  'liquid-label-sheet-doc',
  'ointment-label-sheet-doc'
];

test('print documents expose stable screenshot regression selectors', () => {
  for (const testId of printDocumentTestIds) {
    assert.ok(printSource.includes(`data-testid="${testId}"`), `${testId} is missing from print page`);
  }
});

test('print layout regression runner captures every print document selector', () => {
  assert.strictEqual(packageJson.scripts['test:e2e:print-layout'], 'node scripts/runPrintLayoutRegression.mjs');
  assert.match(printLayoutScript, /puppeteer\.launch/);
  assert.match(printLayoutScript, /YAKUREKI_E2E_AUTO_SEED/);
  assert.match(printLayoutScript, /__yakurekiSeedOnboardingE2E/);
  assert.match(printLayoutScript, /print-page-full\.png/);
  assert.match(printLayoutScript, /manifest\.json/);

  for (const testId of printDocumentTestIds) {
    assert.ok(printLayoutScript.includes(`[data-testid="${testId}"]`), `${testId} is missing from print layout runner`);
  }
});

test('print preview keeps real paper widths instead of squeezing documents into columns', () => {
  const workspaceRule = printSource.match(/\.print-workspace\s*{([^}]*)}/)?.[1] || '';
  assert.match(workspaceRule, /display:\s*flex/);
  assert.doesNotMatch(workspaceRule, /grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(printSource, /\.yakujo-doc\s*{[\s\S]*?width:\s*210mm/);
  assert.match(printSource, /\.receipt-doc\s*{[\s\S]*?width:\s*148mm/);
  assert.match(printSource, /\.paper-embedded-control\s*{[\s\S]*?display:\s*none/);
});

test('print documents include shared patient identity marks for mixed-paper prevention', () => {
  assert.match(printSource, /PATIENT_IDENTITY_MARKS/);
  assert.match(printSource, /stableHashText/);
  assert.match(printSource, /renderIdentityMark/);
  assert.match(printSource, /:global\(\.identity-mark\)\s*{/);
  assert.ok(printSource.includes("renderIdentityMark('compact')"));
  assert.ok(printSource.includes("renderIdentityMark('tiny')"));
  assert.match(printSource, /職員用照合色/);
  assert.doesNotMatch(printSource, /identity-copy/);
  assert.doesNotMatch(printSource, /識別/);
  assert.doesNotMatch(printSource, /こはく|さくら|あおば|つばき|すみれ|しずく/);
});

test('print documents use practical paper redesign sections', () => {
  assert.match(printSource, /statement-redesign-header/);
  assert.match(printSource, /statement-summary-band/);
  assert.match(printSource, /receipt-money-panel/);
  assert.match(printSource, /receipt-stub/);
  assert.match(printSource, /drug-info-counseling-grid/);
  assert.match(printSource, /drug-info-safety-grid/);
  assert.match(printSource, /yakutai-ribbon/);
  assert.match(printSource, /yakutai-safety-strip/);
  assert.match(printSource, /sticker-dose-panel/);
  assert.match(printSource, /label-warning/);
});

test('drug information printout uses only approved pharmacy templates and official search fallback', () => {
  assert.match(printSource, /patient_medication_info_templates/);
  assert.match(printSource, /status:\s*'approved'/);
  assert.match(printSource, /buildMedicationInfoPrintContent/);
  assert.match(printSource, /selectApprovedPatientMedicationInfoTemplate/);
  assert.match(printSource, /data-testid="medication-info-fallback-alert"/);
  assert.match(printSource, /安全な定型文で印刷しますか/);
  assert.match(printSource, /参照版日/);
  assert.match(printSource, /PMDAで公式情報を確認/);
  assert.doesNotMatch(printSource, /shiori/i);
});

test('drug information printout renders only side effect and usage caution texts', () => {
  assert.match(printSource, /副作用・相談目安/);
  assert.match(printSource, /使用上の注意/);
  assert.match(printSource, /medicationInfo\.sideEffectText/);
  assert.match(printSource, /medicationInfo\.usageCautionText/);
  assert.doesNotMatch(printSource, /medicationInfo\.effectText/);
  assert.doesNotMatch(printSource, /medicationInfo\.interactionText/);
  assert.doesNotMatch(printSource, /medicationInfo\.storageText/);
  assert.doesNotMatch(printSource, /drug-info-message-box/);
});

test('CI workflow runs print layout screenshot regression and uploads artifacts', () => {
  assert.match(workflowSource, /Run print layout screenshot regression/);
  assert.match(workflowSource, /npm run test:e2e:print-layout/);
  assert.match(workflowSource, /artifacts\/print-layout-regression/);
  assert.match(workflowSource, /if: always\(\)/);
});
