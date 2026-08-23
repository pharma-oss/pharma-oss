import { test } from 'node:test';
import assert from 'node:assert';
import {
  buildPickingInstruction,
  buildPickingInstructionCsv,
  buildPickingInstructionFileName,
  parsePickingSystemResult
} from '../lib/picking_system';
import { PickingSupportModal } from './emr/components/PickingSupportModal';

test('buildPickingInstruction creates handoff instruction entries', () => {
  const items = [
    {
      itemId: 'i1',
      drugName: 'ロキソニン錠60mg',
      totalQuantity: 2,
      unit: '錠',
      location: 'A-1',
      stockLots: []
    }
  ];
  const instruction = buildPickingInstruction({
    patientName: 'テスト患者',
    visitId: 'visit_1',
    items: items as any
  });
  assert.strictEqual(instruction.patientName, 'テスト患者');
  assert.strictEqual(instruction.items.length, 1);
  const csv = buildPickingInstructionCsv(instruction);
  assert.ok(csv.includes('ロキソニン錠60mg'));
  assert.ok(csv.includes('visit_1'));
});

test('parsePickingSystemResult correctly parses external result text', () => {
  const csvContent = '明細ID,結果,ロット番号,有効期限\ni1,完了,LOT123,2027-01-01';
  const result = parsePickingSystemResult(csvContent);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.rows.length, 1);
  assert.strictEqual(result.rows[0].lotNumber, 'LOT123');
});

test('PickingSupportModal is properly exported as React component', () => {
  assert.ok(PickingSupportModal);
});

