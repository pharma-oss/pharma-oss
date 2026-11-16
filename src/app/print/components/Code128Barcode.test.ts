import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CODE128_QUIET_ZONE_MODULES, layoutCode128B } from '@/lib/code128';
import {
  CODE128_BAR_HEIGHT_MM,
  CODE128_MODULE_MM,
  Code128Barcode
} from './Code128Barcode';

test('Code128Barcode renders SVG bars, quiet zones, and aria-label matching layoutCode128B without caption', () => {
  const payload = 'RX-2026-0001';
  const expectedLayout = layoutCode128B(payload);
  const expectedTotalModules = expectedLayout.modules + CODE128_QUIET_ZONE_MODULES * 2;
  const expectedWidthMm = expectedTotalModules * CODE128_MODULE_MM;

  const html = renderToStaticMarkup(
    React.createElement(Code128Barcode, { payload })
  );

  assert.ok(html.includes('data-testid="code128-barcode"'));
  assert.ok(html.includes(`data-barcode-payload="${payload}"`));
  assert.ok(html.includes(`aria-label="照合バーコード ${payload}"`));
  assert.ok(html.includes(`width="${expectedWidthMm}mm"`));
  assert.ok(html.includes(`height="${CODE128_BAR_HEIGHT_MM}mm"`));
  assert.ok(html.includes(`viewBox="0 0 ${expectedTotalModules} 1"`));

  const rectMatches = html.match(/<rect\b/g) ?? [];
  assert.strictEqual(rectMatches.length, expectedLayout.bars.length);
  const firstBar = expectedLayout.bars[0];
  assert.ok(
    html.includes(
      `<rect x="${firstBar.x + CODE128_QUIET_ZONE_MODULES}" y="0" width="${firstBar.width}" height="1" fill="#000"></rect>`
    )
  );
  assert.ok(!html.includes('<figcaption'));
});

test('Code128Barcode renders figcaption and uses caption in aria-label and custom testId when provided', () => {
  const html = renderToStaticMarkup(
    React.createElement(Code128Barcode, {
      payload: 'V-001',
      caption: '0001-V001',
      testId: 'receipt-barcode'
    })
  );

  assert.ok(html.includes('data-testid="receipt-barcode"'));
  assert.ok(html.includes('data-barcode-payload="V-001"'));
  assert.ok(html.includes('aria-label="照合バーコード 0001-V001"'));
  assert.ok(html.includes('<figcaption class="code128-caption">0001-V001</figcaption>'));
});

test('Code128Barcode rejects empty or non-ASCII payloads via layoutCode128B', () => {
  assert.throws(
    () => renderToStaticMarkup(React.createElement(Code128Barcode, { payload: '' })),
    /Code128 can only encode printable ASCII/
  );
  assert.throws(
    () => renderToStaticMarkup(React.createElement(Code128Barcode, { payload: '処方123' })),
    /Code128 can only encode printable ASCII/
  );
});
