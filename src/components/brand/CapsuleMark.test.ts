import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandTile, CapsuleGlyph } from './CapsuleMark';

test('CapsuleGlyph renders decorative aria-hidden SVG with default and custom size/className', () => {
  const defaultHtml = renderToStaticMarkup(React.createElement(CapsuleGlyph));
  assert.ok(defaultHtml.includes('aria-hidden="true"'));
  assert.ok(defaultHtml.includes('focusable="false"'));
  assert.ok(defaultHtml.includes('width="22"'));
  assert.ok(defaultHtml.includes('height="22"'));
  assert.ok(defaultHtml.includes('transform="rotate(-45 256 256)"'));
  assert.ok(defaultHtml.includes('fill-opacity="0.55"'));

  const customHtml = renderToStaticMarkup(
    React.createElement(CapsuleGlyph, { size: 32, className: 'nav-logo' })
  );
  assert.ok(customHtml.includes('width="32"'));
  assert.ok(customHtml.includes('height="32"'));
  assert.ok(customHtml.includes('class="nav-logo"'));
});

test('BrandTile renders accessible img SVG with gradient defs and unique IDs across sibling instances', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(BrandTile, { size: 48, className: 'tile-a' }),
      React.createElement(BrandTile)
    )
  );

  assert.ok(html.includes('role="img"'));
  assert.ok(html.includes('aria-label="pharma-oss"'));
  assert.ok(html.includes('viewBox="0 0 512 512"'));
  assert.ok(html.includes('width="48"'));
  assert.ok(html.includes('height="48"'));
  assert.ok(html.includes('class="tile-a"'));
  assert.ok(html.includes('width="40"'));
  assert.ok(html.includes('height="40"'));

  const clipIds = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
  assert.strictEqual(clipIds.length, 2);
  assert.notStrictEqual(clipIds[0], clipIds[1], 'Sibling BrandTile instances must use distinct clipPath IDs');
  assert.ok(html.includes('#2AD3BE'));
  assert.ok(html.includes('<circle cx="302" cy="232" r="9.5"'));
});
