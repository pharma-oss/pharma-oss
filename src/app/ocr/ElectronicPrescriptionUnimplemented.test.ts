import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 電子処方箋は接続モジュールが無く未実装。受付画面の関連ボタンが「未実装」表示で押せないことを、
// 画面ソースの配線で確かめる(受付ページ全体は単体描画できないため)。
describe('electronic prescription is shown as not implemented on the reception page', () => {
  const content = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'ocr', 'page.tsx'), 'utf-8');

  it('reads the availability flag from the shared registry', () => {
    assert.ok(content.includes("isFeatureImplemented('electronicPrescription')"));
    assert.ok(content.includes('UNIMPLEMENTED_BADGE_LABEL'));
  });

  it('disables the "電子処方箋で受付" card and guards its click handler', () => {
    const card = content.slice(content.indexOf('data-testid="electronic-prescription-entry"'));
    assert.ok(card.includes('disabled={!electronicPrescriptionImplemented}'), 'the card must be disabled');
    assert.ok(card.includes('aria-disabled={!electronicPrescriptionImplemented}'));
    assert.ok(card.includes('if (!electronicPrescriptionImplemented) return;'), 'the handler must not open the editor');
    assert.ok(card.includes('electronic-prescription-entry-badge'), 'the card must show the 未実装 badge');
  });

  it('replaces the fetch form with a disabled button and a 未実装 badge while it is not implemented', () => {
    const start = content.indexOf('{!electronicPrescriptionImplemented ? (');
    const end = content.indexOf(') : (', start);
    assert.ok(start > 0 && end > start, 'the unimplemented branch must come before the real panel');
    const notice = content.slice(start, end);
    assert.ok(notice.includes('electronic-prescription-unimplemented-badge'));
    assert.ok(/<button[^>]*\n\s+type="button"[\s\S]*?disabled\n/.test(notice), 'the fetch button must be disabled');
    // 未実装の間は、引換番号・被保険者番号の入力欄や「処方入力へ反映」を出さない
    assert.equal(notice.includes('electronicPrescriptionKey'), false);
    assert.equal(notice.includes('handleElectronicPrescriptionApply'), false);
  });

  it('disables the Myna read and online eligibility buttons and tells staff to type insurance by hand', () => {
    const myna = content.slice(content.indexOf('data-testid="myna-read-button"') - 400, content.indexOf('data-testid="myna-read-button"'));
    assert.ok(myna.includes('disabled={isReadingMyna || !mynaCardReaderImplemented}'), 'the Myna button must be disabled');
    const eligibility = content.slice(content.indexOf('data-testid="online-eligibility-button"') - 600, content.indexOf('data-testid="online-eligibility-button"'));
    assert.ok(eligibility.includes('!onlineEligibilityImplemented ||'), 'the eligibility button must be disabled');
    assert.ok(content.includes("labelWithAvailability('mynaCardReader'"));
    assert.ok(content.includes("labelWithAvailability('onlineEligibility', 'オンライン資格確認')"));
    assert.ok(content.includes('reception-tool-unimplemented-note'));
  });

  it('does not tell the user the QR intake also covers electronic prescriptions', () => {
    assert.ok(content.includes("'処方箋QRから取り込む'"));
  });
});
