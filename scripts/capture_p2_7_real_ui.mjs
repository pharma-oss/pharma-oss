import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const ARTIFACT_DIR = '/Users/takeaki/.gemini/antigravity-ide/brain/7ad7cc77-8091-43b0-8626-4a614821a8f9';
const SCREENSHOT_DIR = '/Users/takeaki/pharma-oss/screenshots';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkServerReady(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
      resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

function findChromePath() {
  const commonPaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome binary not found on macOS');
}

async function run() {
  const port = 3456;
  const baseUrl = `http://127.0.0.1:${port}`;

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  let isReady = await checkServerReady(port);
  let serverProcess = null;

  if (!isReady) {
    console.log(`Starting dev server on port ${port}...`);
    serverProcess = spawn('npx', ['next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: '/Users/takeaki/pharma-oss',
      env: { ...process.env, PORT: String(port) },
      stdio: 'inherit'
    });

    for (let i = 0; i < 40; i++) {
      await wait(1000);
      if (await checkServerReady(port)) {
        isReady = true;
        break;
      }
    }
  }

  if (!isReady) {
    throw new Error('Failed to start development server.');
  }

  console.log('Server is ready!');
  const executablePath = findChromePath();
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('Error') || text.includes('Audit') || text.includes('Seed')
        || text.includes('Failed') || text.includes('ai_draft')) {
      console.log('[BROWSER]', text);
    }
  });

  try {
    // 1. Setup localStorage and login session
    await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2' });
    await page.evaluate(() => {
      const user = JSON.stringify({
        id: 'admin_user',
        username: 'admin',
        name: '管理者',
        role: 'admin',
        active: true
      });
      try {
        sessionStorage.setItem('pharmacy_os_current_user', user);
        localStorage.setItem('pharmacy_os_current_user', user);
        localStorage.setItem('pharmacy_os_ai_mode', 'enabled');
      } catch {}
    });

    console.log('Clicking demo start button on root tour...');
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => (b.textContent || '').includes('デモ患者で実際に操作する'));
    }, { timeout: 10000 });

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const startBtn = buttons.find(b => (b.textContent || '').includes('デモ患者で実際に操作する'));
      if (startBtn) startBtn.click();
    });

    console.log('Waiting for navigation to EMR with visitId...');
    await page.waitForFunction(() => window.location.href.includes('/emr'), { timeout: 15000 });
    // dev サーバーのコールドスタートでは RxDB のクエリ解決に時間がかかる。
    // 処方データが描画されるまで待たないと AI 下書きカードが出ない。
    await page.waitForFunction(
      () => document.body.innerText.includes('処方'),
      { timeout: 30000 }
    );
    await wait(6000);

    // Ensure all items are marked as picked so completion check passes smoothly
    await page.evaluate(async () => {
      const dialogs = document.querySelectorAll('dialog');
      for (const d of dialogs) {
        if (d.open) d.close();
      }
      const db = window.__yakurekiDb;
      if (db) {
        try {
          const items = await db.prescription_items.find().exec();
          for (const item of items) {
            await item.patch({ isPicked: true });
          }
        } catch {}
        // AI 補助モードは localStorage ではなく facility_settings.aiAssistMode を見る。
        // デモシードは 'enabled' 以外で入るため、ここで明示的に有効化しないと
        // 下書き候補が全件フィルタされ、SoapAiDraftInsightCard が描画されない。
        try {
          const settings = await db.facility_settings.findOne('default').exec();
          if (!settings) throw new Error("facility_settings 'default' が見つかりません");
          await settings.patch({ aiAssistMode: 'enabled' });
        } catch (e) {
          throw new Error('facility_settings.aiAssistMode の更新に失敗: ' + e.message);
        }
      }
    });
    await wait(1500);

    // facilitySettings はページ読み込み時に一度だけ state へ入るため、
    // patch を反映させるにはリロードが必要。
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(
      () => document.body.innerText.includes('SOAP 入力'),
      { timeout: 30000 }
    );
    await wait(6000);

    // リロードでチュートリアルの「30秒デモ」モーダルが再表示される。
    // 閉じないと以降のキャプチャがこのモーダルに覆われる。
    await page.evaluate(() => {
      const later = Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').includes('あとで見る'));
      if (later) later.click();
      for (const d of document.querySelectorAll('dialog')) {
        if (d.open) d.close();
      }
    });
    await wait(1500);

    // Step 1: Capture AI Draft Insight Card with Disclaimer Badge
    console.log('Step 1: Capturing SoapAiDraftInsightCard with disclaimer badge...');
    try {
      await page.waitForSelector('.soap-ai-draft', { timeout: 30000 });
    } catch (e) {
      const diag = await page.evaluate(async () => {
        const db = window.__yakurekiDb;
        let counts = {};
        if (db) {
          for (const c of ['visits', 'prescription_items', 'patients', 'facility_settings']) {
            try { counts[c] = (await db[c].find().exec()).length; } catch { counts[c] = 'err'; }
          }
        }
        return {
          url: location.href,
          hasDb: !!db,
          counts,
          insightCards: Array.from(document.querySelectorAll('.insight-card')).map(e => e.className),
          aiNotice: document.body.innerText.includes('AI補助は'),
          bodySample: document.body.innerText.slice(0, 700)
        };
      });
      console.log('=== DIAGNOSTIC ===');
      console.log(JSON.stringify(diag, null, 2));
      throw e;
    }
    const disclaimerText = await page.evaluate(() => {
      const disclaimer = document.querySelector('.soap-ai-disclaimer');
      return disclaimer ? disclaimer.textContent : '';
    });
    console.log('Found disclaimer text:', disclaimerText);
    assert(disclaimerText?.includes('【定型文】医薬品マスタ・監査ルールに基づく補助候補'), 'Disclaimer badge must be present');

    await page.evaluate(() => {
      const el = document.querySelector('.soap-ai-draft');
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await wait(1000);

    const step1Path = path.join(SCREENSHOT_DIR, 'p2_7_step1_ai_draft_card.png');
    const step1Artifact = path.join(ARTIFACT_DIR, 'p2_7_step1_ai_draft_card.png');
    await page.screenshot({ path: step1Path, fullPage: false });
    fs.copyFileSync(step1Path, step1Artifact);
    console.log('Saved Step 1 screenshot:', step1Path);

    // Step 2: Apply AI draft to create an unconfirmed AI entry box
    console.log('Step 2: Applying AI draft suggestion...');
    await page.evaluate(() => {
      const draftCard = document.querySelector('.soap-ai-draft');
      if (draftCard) {
        const applyBtn = draftCard.querySelector('.soap-ai-apply');
        if (!applyBtn) throw new Error('「SOAPへ反映」ボタン(.soap-ai-apply)が見つかりません');
        applyBtn.click();
      }
    });
    await wait(1500);

    console.log('Verifying unconfirmed AI draft badge and approve button...');
    await page.waitForSelector('.ai-unconfirmed-badge', { timeout: 10000 });
    await page.waitForSelector('.btn-approve-ai', { timeout: 10000 });

    await page.evaluate(() => {
      const unconfirmedBox = document.querySelector('.soap-entry-box.entry-ai-unconfirmed');
      if (unconfirmedBox) unconfirmedBox.scrollIntoView({ block: 'center' });
    });
    await wait(1000);

    const step2Path = path.join(SCREENSHOT_DIR, 'p2_7_step2_ai_unconfirmed_box.png');
    const step2Artifact = path.join(ARTIFACT_DIR, 'p2_7_step2_ai_unconfirmed_box.png');
    await page.screenshot({ path: step2Path, fullPage: false });
    fs.copyFileSync(step2Path, step2Artifact);
    console.log('Saved Step 2 screenshot:', step2Path);

    // Step 3: Trigger completion confirmation warning modal
    console.log('Step 3: Triggering completion confirmation warning modal...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      // 実際のボタンラベルは「薬歴完了 (在庫引落)」。見つからなければ throw して
      // 気づかないまま同じ画面を撮り続けるのを防ぐ。
      const completeBtn = buttons.find(b => (b.textContent || '').includes('薬歴完了'));
      if (!completeBtn) throw new Error('完了ボタン(薬歴完了)が見つかりません');
      completeBtn.click();
    });
    await wait(1500);

    // body 全体を見ると、SOAP エディタ側のヒント文でも一致してしまう。
    // 完了モーダル自身の見出しと警告文の両方が出るまで待つ。
    await page.waitForFunction(() => {
      const title = document.querySelector('#completion-confirm-title');
      if (!title || !(title.textContent || '').includes('薬歴を完了しますか')) return false;
      const modal = title.closest('[role="dialog"]') || title.parentElement?.parentElement;
      const modalText = modal ? modal.innerText : '';
      return modalText.includes('AI下書き（未確認）が') && modalText.includes('残っています');
    }, { timeout: 15000 });

    const step3Path = path.join(SCREENSHOT_DIR, 'p2_7_step3_completion_warning_modal.png');
    const step3Artifact = path.join(ARTIFACT_DIR, 'p2_7_step3_completion_warning_modal.png');
    await page.screenshot({ path: step3Path, fullPage: false });
    fs.copyFileSync(step3Path, step3Artifact);
    console.log('Saved Step 3 screenshot:', step3Path);

    // Dismiss completion modal
    console.log('Dismissing completion modal...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const cancelBtn = buttons.find(b => (b.textContent || '').includes('戻って入力'));
      if (!cancelBtn) throw new Error('完了モーダルの「戻って入力」が見つかりません');
      cancelBtn.click();
    });
    await wait(1000);

    // Step 4: Approve the AI draft
    console.log('Step 4: Approving AI draft entry...');
    await page.evaluate(() => {
      const approveBtn = document.querySelector('.btn-approve-ai');
      if (!approveBtn) throw new Error('「この内容で承認」ボタンが見つかりません');
      approveBtn.click();
    });
    await wait(1500);

    await page.waitForSelector('.ai-approved-badge', { timeout: 10000 });
    await page.evaluate(() => {
      const approvedBox = document.querySelector('.soap-entry-box');
      if (approvedBox) approvedBox.scrollIntoView({ block: 'center' });
    });
    await wait(1000);

    const step4Path = path.join(SCREENSHOT_DIR, 'p2_7_step4_ai_approved_box.png');
    const step4Artifact = path.join(ARTIFACT_DIR, 'p2_7_step4_ai_approved_box.png');
    await page.screenshot({ path: step4Path, fullPage: false });
    fs.copyFileSync(step4Path, step4Artifact);
    console.log('Saved Step 4 screenshot:', step4Path);

    // Step 5: Check Audit Log in Settings
    console.log('Step 5: Navigating to Settings to verify Audit Log...');
    await page.goto(`${baseUrl}/settings?tab=audit`, { waitUntil: 'networkidle2' });
    await wait(2500);

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.tab-pill, button'));
      const auditTab = buttons.find(b => (b.textContent || '').includes('操作ログ'));
      if (!auditTab) throw new Error('設定画面の「操作ログ」タブが見つかりません');
      auditTab.click();
    });
    await wait(2000);

    // 監査パネルの見出しが出るまで待ち、そこへスクロールする。
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('h2, h3'))
        .some(h => (h.textContent || '').includes('操作ログ')),
      { timeout: 15000 }
    );
    await page.evaluate(() => {
      const h = Array.from(document.querySelectorAll('h2, h3'))
        .find(el => (el.textContent || '').includes('操作ログ'));
      if (h) h.scrollIntoView({ block: 'start' });
    });
    await wait(2000);

    // body 全体だとフィルタの <option>「AI下書き承認」に一致してしまう。
    // 実際のログ行(テーブル/リスト)に出ているかで判定する。
    try {
      // 監査ログ表は整合性サマリより後から読み込まれる。行が出るまで待つ。
      await page.waitForSelector('.audit-log-row', { timeout: 30000 });
      await page.waitForFunction(() => {
        const rows = Array.from(document.querySelectorAll('.audit-log-row'));
        return rows.some(r => (r.innerText || '').includes('AI下書き承認'));
      }, { timeout: 30000 });
      await page.evaluate(() => {
        const row = Array.from(document.querySelectorAll('.audit-log-row'))
          .find(r => (r.innerText || '').includes('AI下書き承認'));
        if (row) row.scrollIntoView({ block: 'center' });
      });
      await wait(1500);
    } catch (e) {
      const diag = await page.evaluate(async () => {
        const db = window.__yakurekiDb;
        let logs = [];
        if (db) {
          try {
            const docs = await db.audit_logs.find().exec();
            logs = docs.map(d => d.toJSON()).map(l => l.actionType);
          } catch (err) { logs = ['err:' + err.message]; }
        }
        return {
          actionTypes: [...new Set(logs)],
          hasAiDraftApproved: logs.includes('ai_draft_approved'),
          totalLogs: logs.length,
          trCount: document.querySelectorAll('tr').length,
          bodyHas: document.body.innerText.includes('AI下書き承認'),
          panelSample: (document.querySelector('.settings-section')?.innerText || '').slice(0, 400)
        };
      });
      console.log('=== STEP5 DIAGNOSTIC ===');
      console.log(JSON.stringify(diag, null, 2));
      throw e;
    }

    const step5Path = path.join(SCREENSHOT_DIR, 'p2_7_step5_audit_log_ai_approval.png');
    const step5Artifact = path.join(ARTIFACT_DIR, 'p2_7_step5_audit_log_ai_approval.png');
    await page.screenshot({ path: step5Path, fullPage: false });
    fs.copyFileSync(step5Path, step5Artifact);
    console.log('Saved Step 5 screenshot:', step5Path);

    console.log('All 5 screenshots captured successfully!');
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
  }
}

run().catch((err) => {
  console.error('Capture script error:', err);
  process.exit(1);
});
