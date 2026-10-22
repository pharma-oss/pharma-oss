import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applySatelliteHubState,
  createFileSatelliteHubStateStore,
  generateHubEpoch,
  getDefaultSatelliteHubStateStore,
  isValidHubEpoch,
  SatelliteHubStateCorruptError,
  type SatelliteHubState
} from './satellite_hub_state.ts';
import type { SatelliteSyncConfig } from './sync_config.ts';

function baseConfig(overrides: Partial<SatelliteSyncConfig> = {}): SatelliteSyncConfig {
  return {
    role: 'satellite',
    hubEndpoint: 'https://main.local:3443',
    terminalId: 'sat-1',
    terminalToken: 'tok',
    transportEncryption: 'none',
    ...overrides
  };
}

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'pharma-oss-hub-state-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SAMPLE_STATE: SatelliteHubState = {
  endpoint: 'https://standby.local:3443',
  epoch: 'abc123def',
  switchedAt: '2026-10-22T01:00:00.000Z'
};

test('the file store returns null until something is saved, then round-trips the state', () => {
  withTempDir((dir) => {
    const store = createFileSatelliteHubStateStore(join(dir, 'nested', 'state.json'));
    assert.equal(store.read(), null);
    store.write(SAMPLE_STATE);
    assert.deepEqual(store.read(), SAMPLE_STATE);
    store.write({ endpoint: null, epoch: 'zzzz9999', switchedAt: '2026-10-22T02:00:00.000Z' });
    assert.equal(store.read()?.endpoint, null);
    assert.deepEqual(readdirSync(join(dir, 'nested')), ['state.json'], '書きかけの一時ファイルを残さない');
  });
});

test('the file store refuses to guess when the saved file is unreadable', () => {
  withTempDir((dir) => {
    const path = join(dir, 'state.json');
    const store = createFileSatelliteHubStateStore(path);
    for (const broken of ['not json', '{}', '[]', 'null', JSON.stringify({ endpoint: 5, epoch: 'abcd1234', switchedAt: 'x' }),
      JSON.stringify({ endpoint: null, epoch: 'bad epoch!', switchedAt: 'x' })]) {
      writeFileSync(path, broken);
      assert.throws(() => store.read(), SatelliteHubStateCorruptError, broken);
    }
  });
});

test('getDefaultSatelliteHubStateStore reads the path from PHARMACY_SYNC_SATELLITE_STATE_PATH', () => {
  withTempDir((dir) => {
    const path = join(dir, 'custom.json');
    const store = getDefaultSatelliteHubStateStore({ PHARMACY_SYNC_SATELLITE_STATE_PATH: path });
    store.write(SAMPLE_STATE);
    assert.deepEqual(createFileSatelliteHubStateStore(path).read(), SAMPLE_STATE);
  });
});

test('generateHubEpoch makes distinct, valid identifiers', () => {
  const epochs = new Set(Array.from({ length: 50 }, () => generateHubEpoch()));
  assert.equal(epochs.size, 50);
  for (const epoch of epochs) assert.ok(isValidHubEpoch(epoch), epoch);
  assert.equal(isValidHubEpoch(''), false);
  assert.equal(isValidHubEpoch('has-dash'), false);
});

test('applySatelliteHubState keeps the environment endpoint when nothing was switched', () => {
  const result = applySatelliteHubState(baseConfig(), { read: () => null, write: () => {} });
  assert.ok(result.ok);
  assert.equal(result.ok && result.config.hubEndpoint, 'https://main.local:3443');
  assert.equal(result.ok && result.state, null);
});

test('applySatelliteHubState prefers the saved endpoint and keeps the terminal credentials', () => {
  const result = applySatelliteHubState(baseConfig(), { read: () => SAMPLE_STATE, write: () => {} });
  assert.ok(result.ok);
  assert.equal(result.ok && result.config.hubEndpoint, 'https://standby.local:3443');
  assert.equal(result.ok && result.config.terminalToken, 'tok');
  assert.equal(result.ok && result.config.terminalId, 'sat-1');
});

test('applySatelliteHubState goes back to the environment endpoint after a return to the main hub', () => {
  const returned: SatelliteHubState = { endpoint: null, epoch: 'abcd1234', switchedAt: '2026-10-22T03:00:00.000Z' };
  const result = applySatelliteHubState(baseConfig(), { read: () => returned, write: () => {} });
  assert.ok(result.ok);
  assert.equal(result.ok && result.config.hubEndpoint, 'https://main.local:3443');
  assert.equal(result.ok && result.state?.epoch, 'abcd1234');
});

test('applySatelliteHubState stops with a message instead of silently falling back', () => {
  const notAllowed = applySatelliteHubState(
    baseConfig(),
    { read: () => ({ ...SAMPLE_STATE, endpoint: 'http://standby.local:3443' }), write: () => {} }
  );
  assert.equal(notAllowed.ok, false);
  assert.match(notAllowed.ok ? '' : notAllowed.message, /許可されません/);

  const corrupt = applySatelliteHubState(baseConfig(), {
    read: () => { throw new SatelliteHubStateCorruptError('/x/state.json'); },
    write: () => {}
  });
  assert.equal(corrupt.ok, false);
  assert.match(corrupt.ok ? '' : corrupt.message, /\/x\/state\.json/);
});
