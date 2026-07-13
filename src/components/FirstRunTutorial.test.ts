import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./FirstRunTutorial.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

test('FirstRunTutorial keeps demo data isolated from real pharmacy records', () => {
  assert.match(source, /DEMO_TUTORIAL_FIXTURE/);
  assert.match(source, /DEMO-RX-001/);
  assert.match(source, /独立デモ・DB未保存/);
  assert.match(source, /表示中のデモデータはチュートリアル専用です/);
  assert.match(source, /患者・受付・薬歴データには保存されません/);
  assert.doesNotMatch(source, /from ['"]@\/db/);
  assert.doesNotMatch(source, /useDatabase/);
  assert.doesNotMatch(source, /\.(insert|bulkInsert|bulkUpsert|upsert|atomicPatch)\(/);
});

test('FirstRunTutorial opens automatically once per authenticated staff member', () => {
  assert.match(source, /TUTORIAL_VERSION = 'v1'/);
  assert.match(source, /yakureki:first-run-tutorial:\$\{TUTORIAL_VERSION\}:\$\{userId\}/);
  // ClientLayoutがゲスト体験の直後に既読マークできるよう公開している
  assert.match(source, /export function tutorialStorageKey/);
  assert.match(source, /window\.localStorage\.getItem\(tutorialStorageKey\(userId\)\)/);
  assert.match(source, /window\.localStorage\.setItem\(tutorialStorageKey\(userId\), new Date\(\)\.toISOString\(\)\)/);
  assert.match(source, /if \(!autoOpen \|\| !userId\) return/);
});

test('FirstRunTutorial is accessible and offers a clear handoff to the real workflow', () => {
  assert.match(source, /import \{ createPortal \} from 'react-dom'/);
  assert.match(source, /data-testid="tutorial-trigger"/);
  assert.match(source, /data-testid="first-run-tutorial"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="tutorial-title"/);
  assert.match(source, /aria-describedby="tutorial-description"/);
  assert.match(source, /3分デモ/);
  assert.match(source, /実際の受付画面へ/);
  assert.match(source, /data-testid="tutorial-start-reception"/);
  assert.match(source, /createPortal\(tutorialModal, document\.body\)/);
});

test('FirstRunTutorial offers demo-data seeding through a callback without touching the DB itself', () => {
  assert.match(source, /onStartDemo: \(\) => void/);
  assert.match(source, /data-testid="tutorial-start-demo"/);
  assert.match(source, /デモ患者で体験を始める/);
  // 投入処理は呼び出し側に委譲し、コンポーネント自体はDB非接触を維持する
  assert.doesNotMatch(source, /from ['"]@\/db/);
  assert.doesNotMatch(source, /seedTutorialDemoData/);
});

test('FirstRunTutorial styles include the isolated-demo notice and responsive trigger', () => {
  assert.match(cssSource, /\.tutorial-trigger/);
  assert.match(cssSource, /\.tutorial-dialog/);
  assert.match(cssSource, /\.tutorial-data-note/);
  assert.match(cssSource, /\.tutorial-demo-id/);
  assert.match(cssSource, /@media \(max-width: 1120px\)[\s\S]*\.tutorial-trigger span/);
});

test('FirstRunTutorial offers demo-data cleanup through a callback without touching the DB itself', () => {
  assert.match(source, /onCleanupDemo: \(\) => void/);
  assert.match(source, /data-testid="tutorial-cleanup-demo"/);
  assert.match(source, /デモデータを片づける/);
  // 削除前に確認ダイアログを出し、削除処理自体は呼び出し側に委譲する
  assert.match(source, /window\.confirm\(/);
  assert.doesNotMatch(source, /cleanupTutorialDemoData/);
  // デモは請求(UKE)に載らないことを画面上でも明示する
  assert.match(source, /請求\(UKE\)・外部機器連携に載らず/);
  assert.match(source, /前回来局の薬歴と副作用歴アラートも投入され/);
});
