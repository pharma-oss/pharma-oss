import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReceptionPrescriptionItemsPayload,
  createEmptyPrescription,
  updatePrescriptionFieldAt,
  updateRpGroupField
} from './helpers';
import { buildElectronicPrescriptionDispensingResultPayload } from '@/hooks/usePrintElectronicPrescription';
import {
  findElectronicUsageOptionByLabel,
  resolveReceiptUsageCodeForItem
} from '@/lib/master-data/usage_master';
import type { PrintPrescriptionItem } from '@/app/print/types';

describe('A-1: manual usage selection persists official 16-digit electronicUsageCode', () => {
  it('saves 16-digit prescriptionCode via updateRpGroupField and transmits it in dispensing result payload', () => {
    const officialOption = findElectronicUsageOptionByLabel('１日１回朝食前　服用');
    assert.ok(officialOption, 'official master option for １日１回朝食前　服用 must exist');
    assert.strictEqual(officialOption.prescriptionCode, '1011000100000000');
    assert.strictEqual(officialOption.code, '005');

    const initial = [
      createEmptyPrescription('rp_1', {
        id: 'rx_1',
        drugCode: '620000001',
        drugName: 'アムロジピン錠5mg',
        amount: '1',
        unitText: '錠',
        days: '14'
      })
    ];

    // Before A-1 equivalent: usage text set without electronicUsageCode
    const legacySavedItems = buildReceptionPrescriptionItemsPayload(
      [{ ...initial[0], usage: officialOption.label, electronicUsageCode: '' }],
      'visit_a1',
      () => 'fixed_legacy'
    );
    const beforePayload = buildElectronicPrescriptionDispensingResultPayload({
      visitData: {
        prescriptionDate: '2026-11-21',
        dispensingDate: '2026-11-21',
        issueDate: '2026-11-21T09:00:00Z'
      },
      prescriptionItems: legacySavedItems as unknown as PrintPrescriptionItem[],
      totalPoints: 120
    });

    // After A-1: pharmacist selects usage from official master via updateRpGroupField
    const updated = updateRpGroupField(initial, 'rp_1', 'usage', officialOption.label, {
      electronicUsageCode: officialOption.prescriptionCode
    });
    assert.strictEqual(updated[0].usage, officialOption.label);
    assert.strictEqual(updated[0].electronicUsageCode, '1011000100000000');

    const savedItems = buildReceptionPrescriptionItemsPayload(updated, 'visit_a1', () => 'fixed_after');
    assert.strictEqual(savedItems[0].electronicUsageCode, '1011000100000000');

    const afterPayload = buildElectronicPrescriptionDispensingResultPayload({
      visitData: {
        prescriptionDate: '2026-11-21',
        dispensingDate: '2026-11-21',
        issueDate: '2026-11-21T09:00:00Z'
      },
      prescriptionItems: savedItems as unknown as PrintPrescriptionItem[],
      totalPoints: 120
    });

    // Exact before/after payload diff: only usageCode transitions from undefined -> 16-digit official code
    assert.strictEqual(beforePayload.items[0].usageCode, undefined);
    assert.strictEqual(afterPayload.items[0].usageCode, '1011000100000000');
    assert.strictEqual(afterPayload.items[0].usage, beforePayload.items[0].usage);
    assert.strictEqual(afterPayload.totalPoints, beforePayload.totalPoints);
  });

  it('auto-resolves official 16-digit code by exact label match and clears code on clear or free-text', () => {
    const initial = [
      createEmptyPrescription('rp_2', {
        id: 'rx_2',
        drugCode: '620000002',
        drugName: 'ロキソニン錠60mg',
        amount: '1',
        days: '7'
      })
    ];

    // Label-only update resolves exact official master code
    const byLabel = updateRpGroupField(initial, 'rp_2', 'usage', '１日１回就寝前　服用');
    assert.strictEqual(byLabel[0].electronicUsageCode, '1011100000000000');

    // Clearing usage clears electronicUsageCode
    const cleared = updateRpGroupField(byLabel, 'rp_2', 'usage', '', { electronicUsageCode: '' });
    assert.strictEqual(cleared[0].usage, '');
    assert.strictEqual(cleared[0].electronicUsageCode, '');

    // Non-master free-text never fabricates a code
    const freeText = updatePrescriptionFieldAt(byLabel, 'rx_2', 'usage', '院内独自カスタム用法', 0);
    assert.strictEqual(freeText[0].usage, '院内独自カスタム用法');
    assert.strictEqual(freeText[0].electronicUsageCode, '');
  });

  it('resolveReceiptUsageCodeForItem resolves official 3-digit receipt code without fabricating unknown codes', () => {
    assert.strictEqual(
      resolveReceiptUsageCodeForItem({ electronicUsageCode: '1011000100000000', usage: '独自表記' }),
      '005'
    );
    assert.strictEqual(
      resolveReceiptUsageCodeForItem({ usage: '１日１回就寝前　服用' }),
      '013'
    );
    assert.strictEqual(
      resolveReceiptUsageCodeForItem({ usage: '疼痛時　貼付' }),
      '900'
    );
    assert.strictEqual(
      resolveReceiptUsageCodeForItem({ usage: '未登録の自由記載用法' }),
      undefined
    );
  });
});
