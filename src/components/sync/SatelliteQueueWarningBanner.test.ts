import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SatelliteQueueWarningBannerView, resolveQueueWarning } from './SatelliteQueueWarningBanner.tsx';
import {
  SATELLITE_QUEUE_LIMITS,
  clearAllUnsentQueue,
  enqueueUnsentRecord,
  getSatelliteQueueHealth,
  type SatelliteQueueHealth
} from '../../lib/sync/satellite_local_queue.ts';

function health(overrides: Partial<SatelliteQueueHealth> = {}): SatelliteQueueHealth {
  return {
    total: 0,
    byCollection: {},
    expiredCount: 0,
    hasExpired: false,
    isNearLimit: false,
    isLimitExceeded: false,
    oldestEnqueuedAt: null,
    newestEnqueuedAt: null,
    ...overrides
  };
}

const noop = () => {};

// <style jsx> の CSS 本文にも is-danger / disabled / animate-spin 等の語が含まれるため、
// DOM だけを検証対象にする(CSS に当たって肯定・否定どちらの assert も空虚になるのを防ぐ)。
function render(h: SatelliteQueueHealth | null, extra: { isSyncing?: boolean } = {}): string {
  const html = renderToStaticMarkup(
    React.createElement(SatelliteQueueWarningBannerView, {
      health: h,
      isSyncing: extra.isSyncing ?? false,
      onManualSync: noop,
      onOpenSettings: noop
    })
  );
  return html.replace(/<style[\s\S]*?<\/style>/g, '');
}

// ID は連番で固定なので、呼ぶたびに「総数が total 件になるまで」埋める(同一IDは上書きされ累積しない)。
function fillQueueTo(total: number): void {
  for (let i = 0; i < total; i++) {
    enqueueUnsentRecord('visits', { id: `visit_${i}` });
  }
  assert.equal(getSatelliteQueueHealth().total, total);
}

describe('resolveQueueWarning', () => {
  it('shows nothing before the first health reading or when the queue is healthy', () => {
    assert.equal(resolveQueueWarning(null), null);
    assert.equal(resolveQueueWarning(health()), null);
    assert.equal(resolveQueueWarning(health({ total: 799 })), null);
  });

  it('warns (not alarms) when only the near-limit flag is set', () => {
    const warning = resolveQueueWarning(health({ total: 850, isNearLimit: true }));
    assert.deepEqual(warning, {
      severity: 'warning',
      cause: 'near_limit',
      title: '【注意】未送信データが 850 件滞留しています（推奨上限1,000件）',
      description: '通信切断が継続すると未送信データが蓄積されます。Hub端末の稼働およびネットワーク接続を確認してください。'
    });
  });

  it('raises a danger alert with the expired count when records outlived the retention warning', () => {
    const warning = resolveQueueWarning(health({ total: 12, expiredCount: 3, hasExpired: true }));
    assert.deepEqual(warning, {
      severity: 'danger',
      cause: 'expired',
      title: '【要対応】前日以前の未送信データが 3 件滞留しています',
      description: '未送信のまま日付を跨いだ患者データがあります。データ欠落や重複を防止するため、Hub端末との接続を確認し、即座に同期を完了させてください。'
    });
  });

  it('raises a danger alert when the recommended limit is exceeded', () => {
    const warning = resolveQueueWarning(health({ total: 1000, isLimitExceeded: true }));
    assert.deepEqual(warning, {
      severity: 'danger',
      cause: 'limit_exceeded',
      title: '【要同期】未送信データが 1000 件滞留しています（推奨上限1,000件超過）',
      description: 'サテライト端末の未送信キューが上限に達しています。Hub端末へデータを同期するまで、新規受付等の連続入力は控えてください。'
    });
  });

  it('prefers the most severe cause: limit exceeded over expired, and expired over near-limit', () => {
    assert.equal(resolveQueueWarning(health({ isLimitExceeded: true, hasExpired: true, expiredCount: 5 }))?.cause, 'limit_exceeded');

    const expiredAndNear = resolveQueueWarning(health({ isNearLimit: true, hasExpired: true, expiredCount: 2, total: 900 }));
    assert.equal(expiredAndNear?.cause, 'expired');
    assert.equal(expiredAndNear?.severity, 'danger', 'an expired record upgrades a near-limit warning to danger');
  });
});

describe('resolveQueueWarning against the real satellite queue thresholds', () => {
  it('stays silent below the warning threshold, warns from WARN_RECORDS, and alarms from MAX_RECOMMENDED_RECORDS', () => {
    clearAllUnsentQueue();
    try {
      fillQueueTo(SATELLITE_QUEUE_LIMITS.WARN_RECORDS - 1);
      assert.equal(resolveQueueWarning(getSatelliteQueueHealth()), null, 'one below the threshold');

      fillQueueTo(SATELLITE_QUEUE_LIMITS.WARN_RECORDS);
      assert.equal(resolveQueueWarning(getSatelliteQueueHealth())?.cause, 'near_limit');

      fillQueueTo(SATELLITE_QUEUE_LIMITS.MAX_RECOMMENDED_RECORDS - 1);
      assert.equal(resolveQueueWarning(getSatelliteQueueHealth())?.cause, 'near_limit', 'one below the limit');

      fillQueueTo(SATELLITE_QUEUE_LIMITS.MAX_RECOMMENDED_RECORDS);
      const exceeded = resolveQueueWarning(getSatelliteQueueHealth());
      assert.equal(exceeded?.cause, 'limit_exceeded');
      assert.match(exceeded!.title, new RegExp(`${SATELLITE_QUEUE_LIMITS.MAX_RECOMMENDED_RECORDS.toLocaleString('ja-JP')}件超過`));
    } finally {
      clearAllUnsentQueue();
    }
  });

  it('alarms about a single record once it is older than the retention warning window', () => {
    clearAllUnsentQueue();
    try {
      enqueueUnsentRecord('visits', { id: 'old_visit' });
      const hour = 60 * 60 * 1000;
      const now = Date.now();

      const justBefore = new Date(now + (SATELLITE_QUEUE_LIMITS.EXPIRY_WARNING_HOURS - 1) * hour);
      assert.equal(resolveQueueWarning(getSatelliteQueueHealth(justBefore)), null);

      const afterWindow = new Date(now + (SATELLITE_QUEUE_LIMITS.EXPIRY_WARNING_HOURS + 1) * hour);
      const warning = resolveQueueWarning(getSatelliteQueueHealth(afterWindow));
      assert.equal(warning?.cause, 'expired');
      assert.match(warning!.title, /1 件滞留/);
    } finally {
      clearAllUnsentQueue();
    }
  });
});

describe('SatelliteQueueWarningBannerView', () => {
  it('renders nothing without a warning-worthy health reading', () => {
    assert.equal(render(null), '');
    assert.equal(render(health()), '');
  });

  it('renders an assertive danger alert with the octagon icon when the limit is exceeded', () => {
    const html = render(health({ total: 1000, isLimitExceeded: true }));

    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('aria-live="assertive"'));
    assert.ok(html.includes('data-testid="satellite-queue-warning-banner"'));
    assert.ok(html.includes('satellite-queue-banner is-danger'));
    assert.ok(html.includes('lucide-octagon-alert') && html.includes('icon-danger'));
    assert.ok(html.includes('【要同期】未送信データが 1000 件滞留しています'));
    assert.ok(html.includes('btn-sync-action btn-danger-sync'));
    assert.ok(html.includes('今すぐ同期'));
    assert.ok(html.includes('端末同期設定'));
  });

  it('renders the triangle icon in danger colours for expired records', () => {
    const html = render(health({ total: 4, expiredCount: 4, hasExpired: true }));
    assert.ok(html.includes('is-danger'));
    assert.ok(html.includes('lucide-triangle-alert') && html.includes('icon-danger'));
    assert.ok(!html.includes('lucide-octagon-alert'));
    assert.ok(html.includes('【要対応】前日以前の未送信データが 4 件滞留しています'));
  });

  it('renders the near-limit case as a warning, not a danger alert', () => {
    const html = render(health({ total: 820, isNearLimit: true }));
    assert.ok(html.includes('satellite-queue-banner is-warning'));
    assert.ok(!html.includes('is-danger'));
    assert.ok(html.includes('icon-warning'));
    assert.ok(html.includes('btn-sync-action btn-warning-sync'));
    assert.ok(html.includes('【注意】未送信データが 820 件滞留しています（推奨上限1,000件）'));
  });

  it('disables the sync button and shows progress text while a sync is running', () => {
    const idle = render(health({ total: 1000, isLimitExceeded: true }));
    assert.ok(!idle.includes('disabled=""'));
    assert.ok(idle.includes('今すぐ同期'));
    assert.ok(!idle.includes('animate-spin'));

    const busy = render(health({ total: 1000, isLimitExceeded: true }), { isSyncing: true });
    assert.ok(busy.includes('disabled=""'));
    assert.ok(busy.includes('同期中…'));
    assert.ok(!busy.includes('今すぐ同期'));
    assert.ok(busy.includes('animate-spin'));
  });

  it('wires the sync button to onManualSync and the settings button to onOpenSettings', () => {
    const calls: string[] = [];
    const tree = SatelliteQueueWarningBannerView({
      health: health({ total: 1000, isLimitExceeded: true }),
      isSyncing: false,
      onManualSync: () => { calls.push('sync'); },
      onOpenSettings: () => { calls.push('settings'); }
    }) as React.ReactElement;

    const buttons: React.ReactElement<{ className?: string; onClick?: () => void }>[] = [];
    const walk = (node: React.ReactNode): void => {
      if (!React.isValidElement(node)) {
        if (Array.isArray(node)) node.forEach(walk);
        return;
      }
      const element = node as React.ReactElement<{ children?: React.ReactNode; className?: string; onClick?: () => void }>;
      if (element.type === 'button') buttons.push(element);
      walk(element.props.children);
    };
    walk(tree);

    assert.equal(buttons.length, 2);
    const syncButton = buttons.find((b) => b.props.className?.includes('btn-sync-action'));
    const settingsButton = buttons.find((b) => b.props.className?.includes('btn-details-action'));
    assert.ok(syncButton && settingsButton);

    syncButton.props.onClick!();
    assert.deepEqual(calls, ['sync']);
    settingsButton.props.onClick!();
    assert.deepEqual(calls, ['sync', 'settings']);
  });
});
