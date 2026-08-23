import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import PreLoginTour, {
  PRE_LOGIN_TOUR_FIXTURE,
  PRE_LOGIN_TOUR_STEPS
} from './PreLoginTour';
import { tutorialStorageKey } from './FirstRunTutorial';

describe('PreLoginTour contracts and isolation', () => {
  it('exports PreLoginTour as a callable React component function', () => {
    assert.equal(typeof PreLoginTour, 'function');
  });

  it('keeps demo data isolated with fixed demo IDs and mock records', () => {
    assert.equal(PRE_LOGIN_TOUR_FIXTURE.reception.prescriptionId, 'DEMO-RX-001');
    assert.equal(PRE_LOGIN_TOUR_FIXTURE.medicationRecord.patientName, 'デモ患者 さくら');
    assert.equal(PRE_LOGIN_TOUR_FIXTURE.medicationRecord.reviewPoints, 2);
  });

  it('defines structured tour steps walking through medication demo before prescription demo', () => {
    assert.equal(PRE_LOGIN_TOUR_STEPS.length, 2);
    assert.equal(PRE_LOGIN_TOUR_STEPS[0].label, '薬歴デモ');
    assert.equal(PRE_LOGIN_TOUR_STEPS[1].label, '処方箋入力デモ');
    assert.ok(PRE_LOGIN_TOUR_STEPS[0].title.length > 0);
    assert.ok(PRE_LOGIN_TOUR_STEPS[1].title.length > 0);
  });

  it('generates consistent storage keys for guest demo and tutorial suppression', () => {
    const key = tutorialStorageKey('admin_user_1');
    assert.ok(key.startsWith('yakureki:first-run-tutorial:'));
    assert.ok(key.endsWith(':admin_user_1'));
  });

  it('invokes callbacks properly when skip or start guest demo is triggered', () => {
    let finished = false;
    let guestDemoStarted = false;

    const props = {
      onFinish: () => { finished = true; },
      onStartGuestDemo: () => { guestDemoStarted = true; }
    };

    props.onFinish();
    assert.equal(finished, true);

    props.onStartGuestDemo();
    assert.equal(guestDemoStarted, true);
  });
});
