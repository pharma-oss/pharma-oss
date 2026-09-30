import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('./[visitId]/page.tsx', import.meta.url), 'utf8');
const printCssSource = readFileSync(new URL('./print.css', import.meta.url), 'utf8');
const dispensingRecordSource = readFileSync(new URL('./components/DispensingRecordPrint.tsx', import.meta.url), 'utf8');

test('verifies that print page.tsx defines print-header-actions for responsive layout', () => {
  assert.ok(
    pageSource.includes('className="print-header-actions flex items-center gap-2"'),
    'print header must include print-header-actions class for responsive grid layout'
  );
  assert.ok(
    pageSource.includes('btn-primary'),
    'print header must include a primary print execute button'
  );
  assert.ok(
    pageSource.includes('btn-secondary'),
    'print header must include secondary buttons (picking and uke export)'
  );
});

test('verifies that DispensingRecordPrint includes paper-preview-card for consistent horizontal scroll and styling', () => {
  assert.ok(
    dispensingRecordSource.includes('paper-preview-card'),
    'DispensingRecordPrint root section must include paper-preview-card'
  );
  assert.ok(
    dispensingRecordSource.includes('dispensing-record-card'),
    'DispensingRecordPrint root section must keep dispensing-record-card class'
  );
});

test('verifies that print.css preserves real paper width and prevents squeeze distortion', () => {
  // .yakujo-doc must preserve 210mm minimum width and not force max-width: 100%
  const yakujoRule = printCssSource.match(/\.yakujo-doc\s*{([^}]*)}/)?.[1] || '';
  assert.match(yakujoRule, /width:\s*210mm/);
  assert.match(yakujoRule, /min-width:\s*210mm/);
  assert.doesNotMatch(yakujoRule, /max-width:\s*100%/);

  // .receipt-doc must preserve 148mm minimum width
  const receiptRule = printCssSource.match(/\.receipt-doc\s*{([^}]*)}/)?.[1] || '';
  assert.match(receiptRule, /width:\s*148mm/);
  assert.match(receiptRule, /min-width:\s*148mm/);

  // .yakutai-doc must preserve 148mm minimum width
  const yakutaiRule = printCssSource.match(/\.yakutai-doc\s*{([^}]*)}/)?.[1] || '';
  assert.match(yakutaiRule, /width:\s*148mm/);
  assert.match(yakutaiRule, /min-width:\s*148mm/);

  // .sticker-sheet must preserve 210mm minimum width
  const stickerRule = printCssSource.match(/\.sticker-sheet,\s*\.label-sheet\s*{([^}]*)}/)?.[1] || '';
  assert.match(stickerRule, /width:\s*210mm/);
  assert.match(stickerRule, /min-width:\s*210mm/);
  assert.doesNotMatch(stickerRule, /max-width:\s*100%/);
});

test('verifies that print.css defines mobile (640px) responsive grid rules for header buttons, flow grid, and claim header', () => {
  const media640Match = printCssSource.match(/@media\s*\(max-width:\s*640px\)\s*{([\s\S]*?)(?=\n\s*\/\*|\n\s*@media|$)/);
  assert.ok(media640Match, '@media (max-width: 640px) must exist in print.css');
  const mediaContent = media640Match[1];

  // print-header-actions grid and primary button full width
  assert.match(mediaContent, /\.print-header-actions\s*{[\s\S]*?grid-template-columns:\s*1fr 1fr/);
  assert.match(mediaContent, /\.print-header-actions\s+button\.btn-primary\s*{[\s\S]*?grid-column:\s*1\s*\/\s*-1/);

  // receipt-flow-grid single column for mobile readability
  assert.match(mediaContent, /\.receipt-flow-grid\s*{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(mediaContent, /\.receipt-flow-step\s*{[\s\S]*?display:\s*flex/);

  // claim-check-header column orientation
  assert.match(mediaContent, /\.claim-check-header\s*{[\s\S]*?flex-direction:\s*column/);

  // paper-preview-card compact padding on small screens
  assert.match(mediaContent, /\.paper-preview-card\s*{[\s\S]*?padding:\s*0\.75rem 0\.5rem/);
});
