import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveReferenceDataSeedWarningOutcome,
  recordReferenceDataSeedFailure,
  getReferenceDataSeedFailures,
  subscribeReferenceDataSeedFailure,
  _resetReferenceDataSeedFailuresForTesting,
  type ReferenceDataSeedTarget
} from './reference_data_seed_notice';

describe('reference_data_seed_notice', () => {
  beforeEach(() => {
    _resetReferenceDataSeedFailuresForTesting();
  });

  describe('resolveReferenceDataSeedWarningOutcome', () => {
    it('returns warning with guidance-specific cause and next actions when medication_guidances fails', () => {
      const outcome = resolveReferenceDataSeedWarningOutcome({
        target: 'medication_guidances',
        alreadyWarned: false
      });
      assert.strictEqual(outcome.shouldWarn, true);
      assert.ok(outcome.warningMessage);
      assert.ok(outcome.warningMessage.includes('服薬指導テンプレート'));
      assert.ok(outcome.warningMessage.includes('再読み込み'));
      assert.ok(outcome.warningMessage.includes('管理者に連絡'));
    });

    it('returns warning with drug-specific cause and next actions when drugs fails', () => {
      const outcome = resolveReferenceDataSeedWarningOutcome({
        target: 'drugs',
        alreadyWarned: false
      });
      assert.strictEqual(outcome.shouldWarn, true);
      assert.ok(outcome.warningMessage);
      assert.ok(outcome.warningMessage.includes('医薬品マスター'));
      assert.ok(outcome.warningMessage.includes('再読み込み'));
      assert.ok(outcome.warningMessage.includes('マスタ更新'));
      assert.ok(outcome.warningMessage.includes('管理者に連絡'));
    });

    it('silences warning when alreadyWarned is true for both targets', () => {
      const guidancesOutcome = resolveReferenceDataSeedWarningOutcome({
        target: 'medication_guidances',
        alreadyWarned: true
      });
      assert.strictEqual(guidancesOutcome.shouldWarn, false);
      assert.strictEqual(guidancesOutcome.warningMessage, null);

      const drugsOutcome = resolveReferenceDataSeedWarningOutcome({
        target: 'drugs',
        alreadyWarned: true
      });
      assert.strictEqual(drugsOutcome.shouldWarn, false);
      assert.strictEqual(drugsOutcome.warningMessage, null);
    });
  });

  describe('recordReferenceDataSeedFailure and subscribeReferenceDataSeedFailure', () => {
    it('records failures in set and notifies registered listeners', () => {
      const events: ReferenceDataSeedTarget[] = [];
      const unsubscribe = subscribeReferenceDataSeedFailure((target) => {
        events.push(target);
      });

      assert.strictEqual(getReferenceDataSeedFailures().size, 0);

      recordReferenceDataSeedFailure('medication_guidances', new Error('test guidance error'));
      assert.strictEqual(getReferenceDataSeedFailures().has('medication_guidances'), true);
      assert.deepStrictEqual(events, ['medication_guidances']);

      recordReferenceDataSeedFailure('drugs', new Error('test drug error'));
      assert.strictEqual(getReferenceDataSeedFailures().has('drugs'), true);
      assert.deepStrictEqual(events, ['medication_guidances', 'drugs']);

      unsubscribe();
      recordReferenceDataSeedFailure('medication_guidances', new Error('repeat'));
      // No additional event received after unsubscribe
      assert.deepStrictEqual(events, ['medication_guidances', 'drugs']);
    });

    it('replays previously recorded failures to new subscribers immediately', () => {
      recordReferenceDataSeedFailure('drugs', new Error('pre-existing'));
      assert.strictEqual(getReferenceDataSeedFailures().has('drugs'), true);

      const events: ReferenceDataSeedTarget[] = [];
      const unsubscribe = subscribeReferenceDataSeedFailure((target) => {
        events.push(target);
      });

      assert.deepStrictEqual(events, ['drugs']);
      unsubscribe();
    });
  });
});
