import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DbSecurityBanner, DbSecurityBannerView } from './DbSecurityBanner';

describe('DbSecurityBanner component contracts and render tests', () => {
  it('exports DbSecurityBanner and DbSecurityBannerView as callable React functions', () => {
    assert.equal(typeof DbSecurityBanner, 'function');
    assert.equal(typeof DbSecurityBannerView, 'function');
  });

  it('renders security warning alert banner when showBanner is true', () => {
    const html = renderToStaticMarkup(React.createElement(DbSecurityBannerView, { showBanner: true }));

    assert.ok(html.includes('role="alert"'), 'Should render accessible alert role');
    assert.ok(html.includes('aria-label="データベース暗号鍵セキュリティ警告"'), 'Should render descriptive aria-label');
    assert.ok(html.includes('【本番運用上の注意】'), 'Should render warning prefix');
    assert.ok(html.includes('NEXT_PUBLIC_DB_PASSWORD'), 'Should mention env key');
    assert.ok(html.includes('href="/settings"'), 'Should provide link to settings');
    assert.ok(html.includes('詳細を確認'), 'Should render action link text');
  });

  it('writes CSS properties in kebab-case inside <style jsx> so the font-size declaration is not silently dropped', () => {
    const html = renderToStaticMarkup(React.createElement(DbSecurityBannerView, { showBanner: true }));

    assert.ok(html.includes('font-size: var(--fs-xs);'), 'Should declare font-size via the type-scale token');
    assert.ok(!/\bfontSize\s*:/.test(html), 'Should not contain camelCase property names, which browsers ignore in CSS text');
  });

  it('renders nothing when showBanner is false', () => {
    const html = renderToStaticMarkup(React.createElement(DbSecurityBannerView, { showBanner: false }));
    assert.equal(html, '', 'Should render empty string when showBanner is false');
  });
});
