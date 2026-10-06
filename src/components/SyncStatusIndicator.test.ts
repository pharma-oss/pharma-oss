import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  resolveSyncIndicatorState,
  getSyncIndicatorPresentation,
  SyncStatusIndicatorView,
  type SyncIndicatorState
} from './SyncStatusIndicator';
import type { SatelliteQueueHealth } from '../lib/sync/satellite_local_queue';

describe('resolveSyncIndicatorState pure state machine contracts', () => {
  const baseHealth: SatelliteQueueHealth = {
    total: 0,
    byCollection: {},
    expiredCount: 0,
    oldestEnqueuedAt: null,
    newestEnqueuedAt: null,
    isNearLimit: false,
    isLimitExceeded: false,
    hasExpired: false
  };

  it('evaluates hub terminal states based on reachability and active streams', () => {
    assert.equal(
      resolveSyncIndicatorState({
        role: 'hub',
        hubReachable: true,
        activeCollectionCount: 0,
        queueHealth: null
      }),
      'synced'
    );

    assert.equal(
      resolveSyncIndicatorState({
        role: 'hub',
        hubReachable: true,
        activeCollectionCount: 3,
        queueHealth: null
      }),
      'syncing'
    );

    assert.equal(
      resolveSyncIndicatorState({
        role: 'hub',
        hubReachable: false,
        activeCollectionCount: 0,
        queueHealth: null
      }),
      'disconnected'
    );
  });

  it('prioritizes danger and safety limits over connectivity on satellite terminal', () => {
    // 1. Limit exceeded is highest priority
    const limitExceededHealth: SatelliteQueueHealth = {
      ...baseHealth,
      total: 1000,
      isLimitExceeded: true,
      hasExpired: true,
      isNearLimit: true
    };
    assert.equal(
      resolveSyncIndicatorState({
        role: 'satellite',
        hubReachable: false,
        activeCollectionCount: 0,
        queueHealth: limitExceededHealth
      }),
      'danger-limit'
    );

    // 2. Expired items (from previous day)
    const expiredHealth: SatelliteQueueHealth = {
      ...baseHealth,
      total: 5,
      expiredCount: 2,
      hasExpired: true
    };
    assert.equal(
      resolveSyncIndicatorState({
        role: 'satellite',
        hubReachable: true,
        activeCollectionCount: 0,
        queueHealth: expiredHealth
      }),
      'danger-expired'
    );

    // 3. Near limit
    const nearLimitHealth: SatelliteQueueHealth = {
      ...baseHealth,
      total: 800,
      isNearLimit: true
    };
    assert.equal(
      resolveSyncIndicatorState({
        role: 'satellite',
        hubReachable: true,
        activeCollectionCount: 0,
        queueHealth: nearLimitHealth
      }),
      'warning-limit'
    );

    // 4. Disconnected from hub
    const disconnectedHealth: SatelliteQueueHealth = {
      ...baseHealth,
      total: 3
    };
    assert.equal(
      resolveSyncIndicatorState({
        role: 'satellite',
        hubReachable: false,
        activeCollectionCount: 0,
        queueHealth: disconnectedHealth
      }),
      'disconnected'
    );

    // 5. Active syncing or items in queue
    assert.equal(
      resolveSyncIndicatorState({
        role: 'satellite',
        hubReachable: true,
        activeCollectionCount: 1,
        queueHealth: baseHealth
      }),
      'syncing'
    );

    // 6. Completely synced
    assert.equal(
      resolveSyncIndicatorState({
        role: 'satellite',
        hubReachable: true,
        activeCollectionCount: 0,
        queueHealth: baseHealth
      }),
      'synced'
    );
  });
});

describe('getSyncIndicatorPresentation pure presentation contracts', () => {
  it('formats danger-limit with correct Japanese notice and is-danger class', () => {
    const health: SatelliteQueueHealth = {
      total: 1500,
      byCollection: {},
      expiredCount: 0,
      oldestEnqueuedAt: null,
    newestEnqueuedAt: null,
      isNearLimit: true,
      isLimitExceeded: true,
      hasExpired: false
    };
    const pres = getSyncIndicatorPresentation({
      indicator: 'danger-limit',
      role: 'satellite',
      queueHealth: health
    });
    assert.equal(pres.className, 'is-danger');
    assert.equal(pres.label, '未送信 1500件 (上限超過・要同期)');
  });

  it('formats danger-expired with expired items count and is-danger class', () => {
    const health: SatelliteQueueHealth = {
      total: 12,
      byCollection: {},
      expiredCount: 4,
      oldestEnqueuedAt: null,
    newestEnqueuedAt: null,
      isNearLimit: false,
      isLimitExceeded: false,
      hasExpired: true
    };
    const pres = getSyncIndicatorPresentation({
      indicator: 'danger-expired',
      role: 'satellite',
      queueHealth: health
    });
    assert.equal(pres.className, 'is-danger');
    assert.equal(pres.label, '未送信 12件 (前日未送信 4件)');
  });

  it('formats warning-limit and disconnected correctly for satellite', () => {
    const health: SatelliteQueueHealth = {
      total: 850,
      byCollection: {},
      expiredCount: 0,
      oldestEnqueuedAt: null,
    newestEnqueuedAt: null,
      isNearLimit: true,
      isLimitExceeded: false,
      hasExpired: false
    };
    const warningPres = getSyncIndicatorPresentation({
      indicator: 'warning-limit',
      role: 'satellite',
      queueHealth: health
    });
    assert.equal(warningPres.className, 'is-warning');
    assert.equal(warningPres.label, '未送信 850件 (上限接近)');

    const disconnectedWithQueue = getSyncIndicatorPresentation({
      indicator: 'disconnected',
      role: 'satellite',
      queueHealth: { ...health, total: 3 }
    });
    assert.equal(disconnectedWithQueue.className, 'is-disconnected');
    assert.equal(disconnectedWithQueue.label, '未同期 3件 (Hub未接続)');
  });

  it('formats synced and syncing correctly', () => {
    const syncedPres = getSyncIndicatorPresentation({
      indicator: 'synced',
      role: 'hub',
      queueHealth: null
    });
    assert.equal(syncedPres.className, 'is-synced');
    assert.equal(syncedPres.label, '同期済み');

    const syncingPres = getSyncIndicatorPresentation({
      indicator: 'syncing',
      role: 'hub',
      queueHealth: null
    });
    assert.equal(syncingPres.className, 'is-syncing');
    assert.equal(syncingPres.label, '同期中…');
  });
});

describe('SyncStatusIndicatorView renderToStaticMarkup contracts', () => {
  it('returns null/empty string when role is standalone', () => {
    const html = renderToStaticMarkup(
      React.createElement(SyncStatusIndicatorView, {
        role: 'standalone',
        indicator: 'synced',
        queueHealth: null
      })
    );
    assert.equal(html, '');
  });

  it('renders hub synced status badge with role title and icon', () => {
    const html = renderToStaticMarkup(
      React.createElement(SyncStatusIndicatorView, {
        role: 'hub',
        indicator: 'synced',
        queueHealth: null
      })
    );
    assert.ok(html.includes('class="sync-status-indicator is-synced"'));
    assert.ok(html.includes('data-testid="sync-status-indicator"'));
    assert.ok(html.includes('メイン端末: 同期済み'));
    assert.ok(html.includes('role="status"'));
    assert.ok(html.includes('aria-live="polite"'));
  });

  it('renders satellite danger badge with limit exceeded label and alert icon', () => {
    const health: SatelliteQueueHealth = {
      total: 200,
      byCollection: {},
      expiredCount: 0,
      oldestEnqueuedAt: null,
    newestEnqueuedAt: null,
      isNearLimit: true,
      isLimitExceeded: true,
      hasExpired: false
    };
    const html = renderToStaticMarkup(
      React.createElement(SyncStatusIndicatorView, {
        role: 'satellite',
        indicator: 'danger-limit',
        queueHealth: health
      })
    );
    assert.ok(html.includes('class="sync-status-indicator is-danger"'));
    assert.ok(html.includes('サテライト: 未送信 200件 (上限超過・要同期)'));
  });
});
