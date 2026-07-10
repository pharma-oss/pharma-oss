import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./WorkflowMiniTutorial.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const ocrSource = readFileSync(new URL('../app/ocr/page.tsx', import.meta.url), 'utf8');
const emrSource = readFileSync(new URL('../app/emr/page.tsx', import.meta.url), 'utf8');

test('workflow demos use isolated fixed fixtures and never write pharmacy records', () => {
  assert.match(source, /WORKFLOW_DEMO_FIXTURE/);
  assert.match(source, /DEMO-INPUT-RX-001/);
  assert.match(source, /DEMO-PICK-001/);
  assert.match(source, /DEMO-SOAP-001/);
  assert.match(source, /独立デモ・DB未保存/);
  assert.match(source, /これは練習用の固定データです/);
  assert.match(source, /患者・受付・在庫・薬歴には保存されません/);
  assert.doesNotMatch(source, /from ['"]@\/db/);
  assert.doesNotMatch(source, /useDatabase/);
  assert.doesNotMatch(source, /\.(insert|bulkInsert|bulkUpsert|upsert|atomicPatch)\(/);
});

test('each mini demo opens once per staff member and workflow', () => {
  assert.match(source, /WORKFLOW_TUTORIAL_VERSION = 'v1'/);
  assert.match(source, /yakureki:workflow-tutorial:\$\{WORKFLOW_TUTORIAL_VERSION\}:\$\{userId\}:\$\{kind\}/);
  assert.match(source, /localStorage\.getItem\(workflowTutorialStorageKey\(userId, kind\)\)/);
  assert.match(source, /localStorage\.setItem\(workflowTutorialStorageKey\(userId, kind\), new Date\(\)\.toISOString\(\)\)/);
  assert.match(source, /if \(!autoOpen \|\| !userId\) return/);
});

test('input, picking, and medication demos are attached to their actual workflow screens', () => {
  assert.match(ocrSource, /<WorkflowMiniTutorial[\s\S]*?kind="input"[\s\S]*?autoOpen/);
  assert.match(emrSource, /<WorkflowMiniTutorial[\s\S]*?kind="medication"[\s\S]*?autoOpen=\{!isPickingModalOpen\}/);
  assert.match(emrSource, /<WorkflowMiniTutorial kind="picking" userId=\{userId\} autoOpen=\{isOpen\}/);
  assert.match(emrSource, /openPicking'\) === '1'/);
});

test('workflow demos use accessible native dialogs above the picking dialog', () => {
  assert.match(source, /import \{ createPortal \} from 'react-dom'/);
  assert.match(source, /<dialog/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /aria-labelledby=\{titleId\}/);
  assert.match(source, /aria-describedby=\{descriptionId\}/);
  assert.match(source, /onCancel=/);
  assert.match(source, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  assert.match(source, /createPortal\(demoDialog, document\.body\)/);
  assert.match(cssSource, /\.workflow-demo-dialog::backdrop/);
  assert.match(cssSource, /\.workflow-demo-data-note/);
  assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*\.workflow-demo-content/);
});

test('workflow demo text wraps instead of disappearing at narrow widths', () => {
  assert.match(cssSource, /\.workflow-demo-fields strong,[\s\S]*overflow-wrap: anywhere/);
  assert.match(cssSource, /\.workflow-demo-scan-code span[\s\S]*white-space: normal/);
  assert.match(cssSource, /@media \(max-width: 520px\)[\s\S]*\.workflow-demo-trigger span/);
});
