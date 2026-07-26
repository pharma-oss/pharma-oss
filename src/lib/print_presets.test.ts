import { test } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_PRINT_PRESETS,
  getPrintPresetsForDocument,
  type PrintPreset
} from './print_presets.ts';

test('DEFAULT_PRINT_PRESETS contains presets for all target document types', () => {
  const documentTypes = [
    'dispensing_record',
    'medication_notebook',
    'drug_bag',
    'liquid_label',
    'ointment_label'
  ] as const;

  for (const docType of documentTypes) {
    const presets = getPrintPresetsForDocument(docType);
    assert.ok(presets.length > 0, `Preset for ${docType} must exist`);
    assert.ok(presets.every((p) => p.targetDocument === docType));
  }
});

test('DEFAULT_PRINT_PRESETS have valid margins and font scales', () => {
  for (const preset of DEFAULT_PRINT_PRESETS) {
    assert.ok(preset.marginTopMm >= 0);
    assert.ok(preset.marginBottomMm >= 0);
    assert.ok(preset.fontScalePercent >= 50 && preset.fontScalePercent <= 200);
    assert.ok(preset.paperSize.length > 0);
  }
});
