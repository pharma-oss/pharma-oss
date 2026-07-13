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
  assert.match(source, /スキップしてログインへ/);
  assert.match(source, /if \(event\.key === 'Escape'\) \{\s*onFinish\(\);/);
});

test('PreLoginTour offers a guest-demo callback available from every step, without touching the DB itself', () => {
  assert.match(source, /onStartGuestDemo: \(\) => void/);
  assert.match(source, /data-testid="pre-login-tour-start-guest-demo"/);
  assert.match(source, /デモ患者で実際に操作する/);
  assert.match(source, /onClick=\{onStartGuestDemo\}/);
  // 投入・ログイン処理は呼び出し側に委譲し、コンポーネント自体はDB非接触を維持する
  assert.doesNotMatch(source, /from ['"]@\/db/);
  assert.doesNotMatch(source, /seedTutorialDemoData/);
  // 最終ステップまで進まなくても押せる(isLastStepの外側にある)ことを確認
  const guestButtonIndex = source.indexOf('data-testid="pre-login-tour-start-guest-demo"');
  const isLastStepGateIndex = source.indexOf('{!isLastStep && (');
  assert.ok(guestButtonIndex > -1 && isLastStepGateIndex > guestButtonIndex);
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
  assert.match(
    clientLayoutSource,
    /\) : showPreLoginTour \? \(\s*<PreLoginTour onFinish=\{handleFinishPreLoginTour\} onStartGuestDemo=\{handleStartGuestDemo\} \/>\s*\) : initialAdminNeedsCredential \? \(/
  );
  // 未ログインのまま体験できるよう、認証チェック(isAuthenticated)より後、パスワード設定フォームより前に分岐する
  const isAuthenticatedIndex = clientLayoutSource.indexOf(') : isAuthenticated ? (');
  const showTourIndex = clientLayoutSource.indexOf(') : showPreLoginTour ? (');
  const adminSetupIndex = clientLayoutSource.indexOf(') : initialAdminNeedsCredential ? (');
  assert.ok(isAuthenticatedIndex > -1 && showTourIndex > isAuthenticatedIndex);
  assert.ok(adminSetupIndex > -1 && adminSetupIndex > showTourIndex);
});

test('ClientLayout lets guests operate the real app as the not-yet-configured initial admin', () => {
  // パスワード未設定の初期管理者としてログインさせ、既存のRBAC/監査ログをそのまま使う
  assert.match(clientLayoutSource, /const isGuestDemoSession = isAuthenticated && isInitialAdminUser\(currentUser\) && !hasLoginCredential\(currentUser\)/);
  assert.match(clientLayoutSource, /const handleStartGuestDemo = async \(\) => \{/);
  assert.match(clientLayoutSource, /await completeLogin\(initialAdmin\)/);
  assert.match(clientLayoutSource, /seedTutorialDemoData/);
  assert.match(clientLayoutSource, /router\.push\(`\/emr\?visitId=\$\{encodeURIComponent\(result\.visitId\)\}`\)/);
});

test('ClientLayout suppresses the redundant first-run tutorial popup right after the guest demo tour', () => {
  // PreLoginTourで案内済みのため、ログイン直後に3分デモを自動で二重表示しない
  assert.match(clientLayoutSource, /import FirstRunTutorial, \{ tutorialStorageKey \} from '@\/components\/FirstRunTutorial'/);
  assert.match(clientLayoutSource, /window\.localStorage\.setItem\(tutorialStorageKey\(initialAdmin\.userId\), new Date\(\)\.toISOString\(\)\)/);
  const markSeenIndex = clientLayoutSource.indexOf('window.localStorage.setItem(tutorialStorageKey(initialAdmin.userId)');
  const completeLoginIndex = clientLayoutSource.indexOf('await completeLogin(initialAdmin);');
  assert.ok(markSeenIndex > -1 && completeLoginIndex > markSeenIndex, '3分デモの既読マークはログイン(isAuthenticated反転)より前に行う');
});

test('ClientLayout shows a persistent guest-demo banner with a way back to real password setup', () => {
  assert.match(clientLayoutSource, /data-testid="guest-demo-banner"/);
  assert.match(clientLayoutSource, /\{isGuestDemoSession && \(/);
  assert.match(clientLayoutSource, /体験モードで操作しています（パスワード未設定）/);
  assert.match(clientLayoutSource, /data-testid="guest-demo-end-button"/);
  assert.match(clientLayoutSource, /const handleEndGuestDemo = \(\) => \{/);
  assert.match(clientLayoutSource, /setCurrentUser\(UNAUTHENTICATED_USER\)/);
  assert.match(cssSource, /\.guest-demo-banner/);
});

test('ClientLayout remembers pre-login tour dismissal without blocking skip when storage fails', () => {
  assert.match(clientLayoutSource, /PRE_LOGIN_TOUR_STORAGE_KEY = 'yakureki:pre-login-tour:v1'/);
  assert.match(clientLayoutSource, /window\.localStorage\.getItem\(PRE_LOGIN_TOUR_STORAGE_KEY\)/);
  assert.match(clientLayoutSource, /window\.localStorage\.setItem\(PRE_LOGIN_TOUR_STORAGE_KEY, new Date\(\)\.toISOString\(\)\)/);
  assert.match(clientLayoutSource, /setPreLoginTourDismissed\(true\)/);
});
