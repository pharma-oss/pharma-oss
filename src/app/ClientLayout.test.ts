import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./ClientLayout.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

test('ClientLayout resolves the initial staff list before relying on subscription updates', () => {
  assert.match(source, /const initialUsers = await db\.users\.find\(\)\.exec\(\)/);
  assert.match(source, /applyUsers\(initialUsers\)/);
  assert.match(source, /db\.users\.find\(\)\.\$\.subscribe/);
});

test('ClientLayout marks staff loading complete when subscription setup fails', () => {
  assert.match(source, /Failed to subscribe to users/);
  assert.match(source, /if \(isMounted\) \{/);
  assert.match(source, /setHasLoadedUsers\(true\)/);
});

test('ClientLayout keeps patient screens closed while staff loading is slow', () => {
  assert.match(source, /STAFF_LOAD_TIMEOUT_MS = 8000/);
  assert.match(source, /setStaffLoadTimedOut\(true\)/);
  assert.doesNotMatch(source, /Timed out waiting for staff list/);
  assert.match(source, /確認が終わるまで、このままお待ちください/);
  const timeoutBlock = source.match(/const staffLoadTimeout = window\.setTimeout\(\(\) => \{([\s\S]*?)\}, STAFF_LOAD_TIMEOUT_MS\);/)?.[1] || '';
  assert.doesNotMatch(timeoutBlock, /setHasLoadedUsers\(true\)/);
});

test('ClientLayout offers a fail-closed retry when staff loading fails', () => {
  assert.match(source, /staffLoadError/);
  assert.match(source, /患者情報や受付は、確認が完了するまで表示しません/);
  assert.match(source, /setStaffLoadAttempt\(\(attempt\) => attempt \+ 1\)/);
  assert.match(source, /<span>再試行<\/span>/);
});

test('PWA install banner uses responsive classes instead of cramped inline layout', () => {
  assert.match(source, /className="pwa-install-banner animate-fade-in"/);
  assert.match(source, /className="pwa-install-actions"/);
  assert.match(source, /className="pwa-install-button"/);
  assert.match(source, /薬局OS（PWA）をインストール/);
  assert.match(cssSource, /\.pwa-install-banner/);
  assert.match(cssSource, /flex-direction: column/);
  assert.doesNotMatch(source, /PCにインストール/);
});

test('ClientLayout surfaces the first-run tutorial without opening patient screens before authentication', () => {
  assert.match(source, /import FirstRunTutorial from '@\/components\/FirstRunTutorial'/);
  assert.match(source, /isAuthenticated && \(/);
  assert.match(source, /<FirstRunTutorial/);
  assert.match(source, /userId=\{currentUser\.userId\}/);
  // 初回ログイン時はどの画面にいてもチュートリアルデモを経由させる
  assert.match(source, /autoOpen=\{true\}/);
  assert.match(source, /onStartReception=\{\(\) => router\.push\('\/ocr'\)\}/);
  assert.match(source, /onStartDemo=\{handleStartTutorialDemo\}/);
  assert.match(source, /seedTutorialDemoData/);
  assert.match(cssSource, /\.tutorial-trigger/);
  assert.match(cssSource, /\.tutorial-safe-badge/);
});

test('ClientLayout locks authenticated staff sessions after inactivity', () => {
  assert.match(source, /SESSION_LOCK_TIMEOUT_MS = 15 \* 60 \* 1000/);
  assert.match(source, /SESSION_ACTIVITY_EVENTS/);
  assert.match(source, /sessionLockTimerRef/);
  assert.match(source, /lockCurrentSession/);
  assert.match(source, /setCurrentUser\(UNAUTHENTICATED_USER\)/);
  assert.match(source, /setLocalCurrentUser\(UNAUTHENTICATED_USER\)/);
  assert.match(source, /session_lock/);
  assert.match(source, /無操作セッションロック/);
  assert.match(source, /一定時間操作がなかったため、スタッフセッションをロックしました。/);
});
