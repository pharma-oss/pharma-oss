import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PRINT_PRESET_CONFIG,
  PRINT_PRESET_BOUNDS,
  parsePrintPresetNumber,
  readPrintPresetConfigFromStorage
} from './usePrintPresetConfig.ts';

describe('usePrintPresetConfig validation helpers', () => {
  it('parsePrintPresetNumber accepts valid boundary values and falls back on blank, NaN, Infinity, or out-of-range values', () => {
    assert.equal(parsePrintPresetNumber('0', 15, 0, 100), 0);
    assert.equal(parsePrintPresetNumber(' 100 ', 15, 0, 100), 100);
    assert.equal(parsePrintPresetNumber(50, 100, 50, 200), 50);
    assert.equal(parsePrintPresetNumber(200, 100, 50, 200), 200);

    assert.equal(parsePrintPresetNumber(null, 15, 0, 100), 15);
    assert.equal(parsePrintPresetNumber('', 15, 0, 100), 15);
    assert.equal(parsePrintPresetNumber('   ', 15, 0, 100), 15);
    assert.equal(parsePrintPresetNumber('NaN', 15, 0, 100), 15);
    assert.equal(parsePrintPresetNumber('abc', 15, 0, 100), 15);
    assert.equal(parsePrintPresetNumber(Number.POSITIVE_INFINITY, 15, 0, 100), 15);
    assert.equal(parsePrintPresetNumber('-1', 15, 0, 100), 15);
    assert.equal(parsePrintPresetNumber('101', 15, 0, 100), 15);
    assert.equal(parsePrintPresetNumber('0', 100, PRINT_PRESET_BOUNDS.fontScaleMin, PRINT_PRESET_BOUNDS.fontScaleMax), 100);
  });

  it('readPrintPresetConfigFromStorage loads valid stored settings and sanitizes corrupted entries without throwing', () => {
    const validStore = new Map<string, string>([
      ['printMarginTop', '8'],
      ['printMarginBottom', '0'],
      ['printFontScale', '115']
    ]);
    assert.deepEqual(
      readPrintPresetConfigFromStorage({ getItem: (key) => validStore.get(key) ?? null }),
      { printMarginTop: 8, printMarginBottom: 0, printFontScale: 115 }
    );

    const corruptedStore = new Map<string, string>([
      ['printMarginTop', 'corrupted'],
      ['printMarginBottom', '-5'],
      ['printFontScale', '999']
    ]);
    assert.deepEqual(
      readPrintPresetConfigFromStorage({ getItem: (key) => corruptedStore.get(key) ?? null }),
      DEFAULT_PRINT_PRESET_CONFIG
    );

    const throwingStorage = {
      getItem: () => {
        throw new Error('SecurityError: storage blocked');
      }
    };
    assert.deepEqual(readPrintPresetConfigFromStorage(throwingStorage), DEFAULT_PRINT_PRESET_CONFIG);
    assert.deepEqual(readPrintPresetConfigFromStorage(null), DEFAULT_PRINT_PRESET_CONFIG);
  });
});
