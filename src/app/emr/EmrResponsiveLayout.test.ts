import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { TimelineItem } from './page';

describe('EMR Responsive Layout and TimelineItem contracts (Track I-6)', () => {
  it('renders TimelineItem with current prescription badge when active is true', () => {
    const html = renderToStaticMarkup(
      React.createElement(TimelineItem, {
        date: '2026/09/30',
        drug: 'アムロジピンOD錠5mg',
        detail: '1日1回朝食後 14日分',
        change: '用量増量',
        active: true
      })
    );

    assert.ok(html.includes('timeline-item active'));
    assert.ok(html.includes('2026/09/30'));
    assert.ok(html.includes('timeline-badge current'));
    assert.ok(html.includes('今回'));
    assert.ok(html.includes('アムロジピンOD錠5mg'));
    assert.ok(html.includes('1日1回朝食後 14日分'));
    assert.ok(html.includes('用量増量'));
  });

  it('renders TimelineItem with past prescription badge when active is false or undefined', () => {
    const html = renderToStaticMarkup(
      React.createElement(TimelineItem, {
        date: '2026/08/15',
        drug: 'ロキソプロフェンNaテープ50mg',
        detail: '1日1回腰部に貼付 14日分',
        active: false
      })
    );

    assert.ok(!html.includes('timeline-item active'));
    assert.ok(html.includes('2026/08/15'));
    assert.ok(html.includes('timeline-badge past'));
    assert.ok(html.includes('処方'));
    assert.ok(html.includes('ロキソプロフェンNaテープ50mg'));
    assert.ok(!html.includes('※'));
  });

  it('verifies that emr/page.tsx defines responsive rules preventing 375px action button overflow', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'emr', 'page.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Must have max-width: 640px media query for emr-actions
    assert.ok(content.includes('@media (max-width: 640px)'), 'Missing 640px media query in emr/page.tsx');
    assert.ok(content.includes('grid-template-columns: 1.15fr 0.85fr;'), 'Missing responsive button grid in emr-actions');
    assert.ok(content.includes('.emr-actions .btn-label-sub'), 'Missing sublabel visibility handling');
  });

  it('verifies that SoapEditor.tsx footer allows responsive wrapping for problem addition buttons', () => {
    const filePath = path.join(process.cwd(), 'src', 'app', 'emr', 'components', 'SoapEditor.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    assert.ok(content.includes('flex-wrap: wrap;'), 'soap-editor-footer must allow flex-wrap');
    assert.ok(content.includes('@media (max-width: 480px)'), 'Missing 480px media query for soap-editor-footer');
  });
});
