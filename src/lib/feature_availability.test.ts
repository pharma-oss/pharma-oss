import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FEATURE_AVAILABILITY,
  UNIMPLEMENTED_BADGE_LABEL,
  isFeatureImplemented,
  labelWithAvailability
} from './feature_availability';

describe('feature availability', () => {
  it('marks electronic prescription as not implemented until a connector module exists', () => {
    assert.equal(isFeatureImplemented('electronicPrescription'), false);
    assert.ok(FEATURE_AVAILABILITY.electronicPrescription.unavailableReason.length > 0);
  });

  it('marks the Myna clinical import and online eligibility as not implemented too', () => {
    assert.equal(isFeatureImplemented('mynaClinicalImport'), false);
    assert.equal(isFeatureImplemented('onlineEligibility'), false);
    assert.equal(labelWithAvailability('mynaClinicalImport', '特定健診・薬剤履歴を取込'), '特定健診・薬剤履歴を取込（未実装）');
    assert.equal(labelWithAvailability('onlineEligibility', 'オンライン資格確認'), 'オンライン資格確認（未実装）');
  });

  it('does not list the Myna card read, whose availability depends on the configured connection', () => {
    assert.equal('mynaCardReader' in FEATURE_AVAILABILITY, false);
  });

  it('adds the 未実装 marker to a label only for features that are not implemented', () => {
    assert.equal(UNIMPLEMENTED_BADGE_LABEL, '未実装');
    assert.equal(labelWithAvailability('electronicPrescription', '取得して確認'), '取得して確認（未実装）');
  });

  it('gives every feature a name and a reason to show when it is unavailable', () => {
    for (const feature of Object.values(FEATURE_AVAILABILITY)) {
      assert.ok(feature.label.length > 0);
      assert.ok(feature.unavailableReason.length > 0);
    }
  });
});
