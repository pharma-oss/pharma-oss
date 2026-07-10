import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./PreLoginTour.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
const clientLayoutSource = readFileSync(new URL('../app/ClientLayout.tsx', import.meta.url), 'utf8');

test('PreLoginTour keeps demo data isolated from real pharmacy records', () => {
  assert.match(source, /PRE_LOGIN_TOUR_FIXTURE/);
  assert.match(source, /DEMO-RX-001/);
  assert.match(source, /独立デモ・DB未保存/);
  assert.match(source, /体験専用です/);
  assert.match(source, /患者・受付・薬歴データには一切保存されません/);
  assert.doesNotMatch(source, /from ['"]@\/db/);
  assert.doesNotMatch(source, /useDatabase/);
  assert.doesNotMatch(source, /\.(insert|bulkInsert|bulkUpsert|upsert|atomicPatch)\(/);
});

test('PreLoginTour walks through medication demo before prescription-entry demo', () => {
  const medicationIndex = source.indexOf("label: '薬歴デモ'");
  const receptionIndex = source.indexOf("label: '処方箋入力デモ'");
  assert.ok(medicationIndex > -1, '薬歴デモ step is defined');
  assert.ok(receptionIndex > -1, '処方箋入力デモ step is defined');
  assert.ok(medicationIndex < receptionIndex, '薬歴デモ comes before 処方箋入力デモ');
});

test('PreLoginTour can always be skipped without completing every step', () => {
  assert.match(source, /onFinish: \(\) => void/);
  assert.match(source, /data-testid="pre-login-tour-skip"/);
  assert.match(source, /data-testid="pre-login-tour-skip-footer"/);
  assert.match(source, /data-testid="pre-login-tour-finish"/);
  assert.match(source, /スキップしてログインへ/);
  assert.match(source, /if \(event\.key === 'Escape'\) \{\s*onFinish\(\);/);
});

test('PreLoginTour is an accessible modal rendered through a portal', () => {
  assert.match(source, /import \{ createPortal \} from 'react-dom'/);
  assert.match(source, /data-testid="pre-login-tour"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby="pre-login-tour-title"/);
  assert.match(source, /aria-describedby="pre-login-tour-description"/);
  assert.match(source, /createPortal\(tourModal, document\.body\)/);
  assert.match(cssSource, /\.tutorial-dialog/);
  assert.match(cssSource, /\.tutorial-scan-preview/);
  assert.match(cssSource, /\.tutorial-record-preview/);
});

test('ClientLayout shows the pre-login tour before forcing initial admin password setup', () => {
  assert.match(clientLayoutSource, /import PreLoginTour from '@\/components\/PreLoginTour'/);
  assert.match(clientLayoutSource, /const showPreLoginTour = !isAuthenticated && initialAdminNeedsCredential && !preLoginTourDismissed/);
  assert.match(clientLayoutSource, /\) : showPreLoginTour \? \(\s*<PreLoginTour onFinish=\{handleFinishPreLoginTour\} \/>\s*\) : initialAdminNeedsCredential \? \(/);
  // 未ログインのまま体験できるよう、認証チェック(isAuthenticated)より後、パスワード設定フォームより前に分岐する
  const isAuthenticatedIndex = clientLayoutSource.indexOf(') : isAuthenticated ? (');
  const showTourIndex = clientLayoutSource.indexOf(') : showPreLoginTour ? (');
  const adminSetupIndex = clientLayoutSource.indexOf(') : initialAdminNeedsCredential ? (');
  assert.ok(isAuthenticatedIndex > -1 && showTourIndex > isAuthenticatedIndex);
  assert.ok(adminSetupIndex > -1 && adminSetupIndex > showTourIndex);
});

test('ClientLayout remembers pre-login tour dismissal without blocking skip when storage fails', () => {
  assert.match(clientLayoutSource, /PRE_LOGIN_TOUR_STORAGE_KEY = 'yakureki:pre-login-tour:v1'/);
  assert.match(clientLayoutSource, /window\.localStorage\.getItem\(PRE_LOGIN_TOUR_STORAGE_KEY\)/);
  assert.match(clientLayoutSource, /window\.localStorage\.setItem\(PRE_LOGIN_TOUR_STORAGE_KEY, new Date\(\)\.toISOString\(\)\)/);
  assert.match(clientLayoutSource, /setPreLoginTourDismissed\(true\)/);
});
