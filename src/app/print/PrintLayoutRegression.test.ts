import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('./[visitId]/page.tsx', import.meta.url), 'utf8');
const printCssSource = readFileSync(new URL('./print.css', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
const workflowSource = readFileSync(new URL('../../../.github/workflows/onboarding-e2e.yml', import.meta.url), 'utf8');
const printLayoutScript = readFileSync(new URL('../../../scripts/runPrintLayoutRegression.mjs', import.meta.url), 'utf8');

const drugInfoSource = readFileSync(new URL('./components/DrugInfoPrint.tsx', import.meta.url), 'utf8');
const receiptStatementSource = readFileSync(new URL('./components/ReceiptStatementPrint.tsx', import.meta.url), 'utf8');
const receiptSource = readFileSync(new URL('./components/ReceiptPrint.tsx', import.meta.url), 'utf8');
const medicineBagSource = readFileSync(new URL('./components/MedicineBagPrint.tsx', import.meta.url), 'utf8');
const stickerSource = readFileSync(new URL('./components/MedicineNotebookStickerPrint.tsx', import.meta.url), 'utf8');
const liquidLabelSource = readFileSync(new URL('./components/LiquidLabelSheetPrint.tsx', import.meta.url), 'utf8');
const ointmentLabelSource = readFileSync(new URL('./components/OintmentLabelSheetPrint.tsx', import.meta.url), 'utf8');
const dispensingRecordSource = readFileSync(new URL('./components/DispensingRecordPrint.tsx', import.meta.url), 'utf8');

const allSources = [
  pageSource,
  drugInfoSource,
  receiptStatementSource,
  receiptSource,
  medicineBagSource,
  stickerSource,
  liquidLabelSource,
  ointmentLabelSource,
  dispensingRecordSource
].join('\n');

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
    assert.ok(allSources.includes(`data-testid="${testId}"`), `${testId} is missing from print page/components`);
  }
});

test('print layout regression runner captures every print document selector', () => {
  assert.strictEqual(packageJson.scripts['test:e2e:print-layout'], 'node scripts/runPrintLayoutRegression.mjs');
  assert.match(printLayoutScript, /puppeteer\.launch/);
  assert.match(printLayoutScript, /YAKUREKI_E2E_AUTO_SEED/);
  assert.match(printLayoutScript, /__yakurekiSeedOnboardingE2E/);
  assert.match(printLayoutScript, /manifest\.json/);

  for (const testId of printDocumentTestIds) {
    assert.ok(printLayoutScript.includes(`[data-testid="${testId}"]`), `${testId} is missing from print layout runner`);
  }
});

test('print preview keeps real paper widths instead of squeezing documents into columns', () => {
  const workspaceRule = printCssSource.match(/\.print-workspace\s*{([^}]*)}/)?.[1] || '';
  assert.match(workspaceRule, /display:\s*flex/);
  assert.doesNotMatch(workspaceRule, /grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(printCssSource, /\.yakujo-doc\s*{[\s\S]*?width:\s*210mm/);
  assert.match(printCssSource, /\.receipt-doc\s*{[\s\S]*?width:\s*148mm/);
  assert.match(printCssSource, /\.paper-embedded-control\s*{[\s\S]*?display:\s*none/);
});

test('print documents include shared patient identity marks for mixed-paper prevention', () => {
  assert.match(allSources, /patientIdentityMark|renderIdentityMark/);
  assert.match(printCssSource, /\.identity-mark\s*{/);
  assert.ok(allSources.includes("renderIdentityMark('compact')"));
  assert.doesNotMatch(allSources, /identity-copy/);
});

test('print documents use practical paper redesign sections', () => {
  assert.match(allSources, /statement-redesign-header/);
  assert.match(allSources, /statement-summary-band/);
  assert.match(allSources, /receipt-money-panel/);
  assert.match(allSources, /receipt-stub/);
  assert.match(allSources, /drug-info-counseling-grid/);
  assert.match(allSources, /drug-info-safety-grid/);
  assert.match(allSources, /yakutai-ribbon/);
  assert.match(allSources, /yakutai-safety-strip/);
  assert.match(allSources, /sticker-dose-panel/);
  assert.match(allSources, /label-warning/);
});

test('drug information printout uses only approved pharmacy templates and official search fallback', () => {
  assert.match(allSources, /buildMedicationInfoPrintContent/);
  assert.match(allSources, /data-testid="medication-info-fallback-alert"/);
  assert.match(allSources, /安全な定型文で印刷しますか/);
  assert.match(allSources, /参照版日/);
  assert.match(allSources, /PMDAで公式情報を確認/);
  assert.doesNotMatch(allSources, /shiori/i);
});

test('drug information printout renders only side effect and usage caution texts', () => {
  assert.match(allSources, /副作用・相談目安/);
  assert.match(allSources, /使用上の注意/);
  assert.match(allSources, /medicationInfo\.sideEffectText/);
  assert.match(allSources, /medicationInfo\.usageCautionText/);
  assert.doesNotMatch(allSources, /medicationInfo\.effectText/);
  assert.doesNotMatch(allSources, /medicationInfo\.interactionText/);
  assert.doesNotMatch(allSources, /medicationInfo\.storageText/);
  assert.doesNotMatch(allSources, /drug-info-message-box/);
});

test('CI workflow executes print layout regression and preserves artifacts', () => {
  assert.match(workflowSource, /Run print layout screenshot regression/);
  assert.match(workflowSource, /npm run test:e2e:print-layout/);
  assert.match(workflowSource, /artifacts\/print-layout-regression/);
});
