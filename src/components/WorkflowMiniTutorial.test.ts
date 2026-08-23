import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import WorkflowMiniTutorial, {
  WORKFLOW_DEMO_FIXTURE,
  workflowTutorialStorageKey,
  type WorkflowTutorialKind
} from './WorkflowMiniTutorial';

describe('WorkflowMiniTutorial contracts and fixtures', () => {
  it('exports WorkflowMiniTutorial as a callable React component function', () => {
    assert.equal(typeof WorkflowMiniTutorial, 'function');
  });

  it('keeps fixed workflow demo fixtures isolated from DB storage', () => {
    assert.equal(WORKFLOW_DEMO_FIXTURE.input.prescriptionId, 'DEMO-INPUT-RX-001');
    assert.equal(WORKFLOW_DEMO_FIXTURE.input.patientName, 'デモ患者 みどり');
    assert.equal(WORKFLOW_DEMO_FIXTURE.picking.taskId, 'DEMO-PICK-001');
    assert.equal(WORKFLOW_DEMO_FIXTURE.picking.lot, 'DEMO-LOT-A');
    assert.equal(WORKFLOW_DEMO_FIXTURE.medication.recordId, 'DEMO-SOAP-001');
    assert.equal(WORKFLOW_DEMO_FIXTURE.medication.previousDifference, '用量変更あり');
  });

  it('generates distinct storage keys for each workflow kind and staff member', () => {
    const kinds: WorkflowTutorialKind[] = ['input', 'picking', 'medication'];
    const keys = kinds.map((kind) => workflowTutorialStorageKey('staff_A', kind));

    assert.equal(keys[0], 'yakureki:workflow-tutorial:v1:staff_A:input');
    assert.equal(keys[1], 'yakureki:workflow-tutorial:v1:staff_A:picking');
    assert.equal(keys[2], 'yakureki:workflow-tutorial:v1:staff_A:medication');

    // 異なるユーザーでは異なるキーになること
    const userBKey = workflowTutorialStorageKey('staff_B', 'input');
    assert.notEqual(keys[0], userBKey);
  });
});
