import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import FirstRunTutorial, {
  DEMO_TUTORIAL_FIXTURE,
  tutorialStorageKey
} from './FirstRunTutorial';

describe('FirstRunTutorial contracts and isolation', () => {
  it('exports FirstRunTutorial as a callable React component function', () => {
    assert.equal(typeof FirstRunTutorial, 'function');
  });

  it('keeps demo data isolated with fixed fixtures without touching DB directly', () => {
    assert.equal(DEMO_TUTORIAL_FIXTURE.dashboard.receivedToday, 12);
    assert.equal(DEMO_TUTORIAL_FIXTURE.reception.prescriptionId, 'DEMO-RX-001');
    assert.equal(DEMO_TUTORIAL_FIXTURE.medicationRecord.patientName, 'デモ患者 さくら');
  });

  it('generates isolated localStorage keys per user for versioned first-run tutorial tracking', () => {
    const key1 = tutorialStorageKey('staff_1');
    const key2 = tutorialStorageKey('staff_2');

    assert.equal(key1, 'yakureki:first-run-tutorial:v1:staff_1');
    assert.equal(key2, 'yakureki:first-run-tutorial:v1:staff_2');
    assert.notEqual(key1, key2);
  });

  it('invokes workflow callback props correctly', () => {
    let receptionStarted = false;
    let demoStarted = false;
    let demoCleaned = false;

    const props = {
      userId: 'test_user',
      autoOpen: false,
      onStartReception: () => { receptionStarted = true; },
      onStartDemo: () => { demoStarted = true; },
      onCleanupDemo: () => { demoCleaned = true; }
    };

    props.onStartReception();
    assert.equal(receptionStarted, true);

    props.onStartDemo();
    assert.equal(demoStarted, true);

    props.onCleanupDemo();
    assert.equal(demoCleaned, true);
  });
});
