import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import TerminalSyncPanel from '@/components/TerminalSyncPanel';
import { SyncStatusIndicator } from '@/components/SyncStatusIndicator';

describe('SettingsTerminalSync components and contracts', () => {
  it('exports TerminalSyncPanel and SyncStatusIndicator as callable React components', () => {
    assert.equal(typeof TerminalSyncPanel, 'function');
    assert.equal(typeof SyncStatusIndicator, 'function');
  });
});
