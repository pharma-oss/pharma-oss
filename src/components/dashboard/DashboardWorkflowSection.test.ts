import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardWorkflowSection, type DashboardWorkflowSectionProps } from './DashboardWorkflowSection';
import type { DashboardTask } from '@/lib/dashboard_tasks';

const task: DashboardTask = {
  visitId: 'design-test', name: '架空患者 <長い名前>', age: '60', status: '薬剤師確認',
  time: '10:30', waitMinutes: 35, prescriptionCount: 3, unpickedCount: 1,
  priority: 'high', reviewFlags: ['患者アラート 1', 'GS1未照合 1', '待ち 35分']
};

function render(overrides: Partial<DashboardWorkflowSectionProps> = {}) {
  return renderToStaticMarkup(React.createElement(DashboardWorkflowSection, {
    tasks: [task], pendingCount: 0, isLoading: false, error: null,
    onOpenTask: () => {}, onOpenRecords: () => {}, onRetry: () => {}, ...overrides
  }));
}

test('patient workflow renders review patients before normal tasks and retains warnings and accessible actions', () => {
  const html = render({ tasks: [{ ...task, visitId: 'normal', name: '通常患者', priority: 'normal', reviewFlags: [] }, task] });
  assert.ok(html.indexOf('data-visit-id="design-test"') < html.indexOf('data-visit-id="normal"'));
  assert.match(html, /架空患者 &lt;長い名前&gt;/);
  assert.doesNotMatch(html, /<長い名前>/);
  for (const flag of task.reviewFlags) assert.ok(html.includes(flag));
  assert.match(html, /role="button" tabindex="0"/);
  assert.match(html, /薬剤師確認を開く/);
  assert.match(html, /薬歴一覧を開く/);
});

test('loading workflow announces loading without showing stale patients or an empty success state', () => {
  const html = render({ isLoading: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="status"/);
  assert.match(html, /患者一覧を読み込んでいます/);
  assert.doesNotMatch(html, /data-visit-id=|現在、/);
});

test('failed workflow exposes retry without presenting stale patients as current data', () => {
  const html = render({ error: new Error('fixture failure') });
  assert.match(html, /role="alert"/);
  assert.match(html, /患者一覧を読み込めませんでした/);
  assert.match(html, /<button[^>]*>.*再読み込み<\/button>/);
  assert.doesNotMatch(html, /data-visit-id=|現在、/);
});

test('empty processing queues retain the waiting reception count and an action', () => {
  const html = render({ tasks: [], pendingCount: 2 });
  assert.match(html, /受付待ち 2件/);
  assert.match(html, /受付を確認/);
  assert.match(html, /現在、確認待ちの患者はいません/);
  assert.match(html, /現在、該当する患者はいません/);
  assert.doesNotMatch(html, /data-visit-id=/);
});
