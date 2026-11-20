import { useState, useEffect } from 'react';

export interface PrintPresetConfig {
  printMarginTop: number;
  printMarginBottom: number;
  printFontScale: number;
}

export const DEFAULT_PRINT_PRESET_CONFIG: Readonly<PrintPresetConfig> = {
  printMarginTop: 15, // mm
  printMarginBottom: 15, // mm
  printFontScale: 100 // %
};

export const PRINT_PRESET_BOUNDS = {
  marginMin: 0,
  marginMax: 100,
  fontScaleMin: 50,
  fontScaleMax: 200
} as const;

// 破損値（NaN / 非数値 / 範囲外）で帳票レイアウトの CSS 変数が壊れるのを防ぐ。
export function parsePrintPresetNumber(
  raw: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string' && raw.trim() === '') return fallback;
  const parsed = typeof raw === 'number' ? raw : Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

export function readPrintPresetConfigFromStorage(
  storage: Pick<Storage, 'getItem'> | null | undefined
): PrintPresetConfig {
  if (!storage) {
    return { ...DEFAULT_PRINT_PRESET_CONFIG };
  }
  try {
    return {
      printMarginTop: parsePrintPresetNumber(
        storage.getItem('printMarginTop'),
        DEFAULT_PRINT_PRESET_CONFIG.printMarginTop,
        PRINT_PRESET_BOUNDS.marginMin,
        PRINT_PRESET_BOUNDS.marginMax
      ),
      printMarginBottom: parsePrintPresetNumber(
        storage.getItem('printMarginBottom'),
        DEFAULT_PRINT_PRESET_CONFIG.printMarginBottom,
        PRINT_PRESET_BOUNDS.marginMin,
        PRINT_PRESET_BOUNDS.marginMax
      ),
      printFontScale: parsePrintPresetNumber(
        storage.getItem('printFontScale'),
        DEFAULT_PRINT_PRESET_CONFIG.printFontScale,
        PRINT_PRESET_BOUNDS.fontScaleMin,
        PRINT_PRESET_BOUNDS.fontScaleMax
      )
    };
  } catch {
    return { ...DEFAULT_PRINT_PRESET_CONFIG };
  }
}

export interface UsePrintPresetConfigReturn extends PrintPresetConfig {
  handleMarginTopChange: (val: number) => void;
  handleMarginBottomChange: (val: number) => void;
  handleFontScaleChange: (val: number) => void;
}

export function usePrintPresetConfig(): UsePrintPresetConfigReturn {
  const [printMarginTop, setPrintMarginTop] = useState<number>(DEFAULT_PRINT_PRESET_CONFIG.printMarginTop);
  const [printMarginBottom, setPrintMarginBottom] = useState<number>(DEFAULT_PRINT_PRESET_CONFIG.printMarginBottom);
  const [printFontScale, setPrintFontScale] = useState<number>(DEFAULT_PRINT_PRESET_CONFIG.printFontScale);

  useEffect(() => {
    const loaded = readPrintPresetConfigFromStorage(typeof localStorage !== 'undefined' ? localStorage : null);
    setPrintMarginTop(loaded.printMarginTop);
    setPrintMarginBottom(loaded.printMarginBottom);
    setPrintFontScale(loaded.printFontScale);
  }, []);

  const handleMarginTopChange = (val: number) => {
    const safeVal = parsePrintPresetNumber(
      val,
      DEFAULT_PRINT_PRESET_CONFIG.printMarginTop,
      PRINT_PRESET_BOUNDS.marginMin,
      PRINT_PRESET_BOUNDS.marginMax
    );
    setPrintMarginTop(safeVal);
    try {
      localStorage.setItem('printMarginTop', String(safeVal));
    } catch {}
  };

  const handleMarginBottomChange = (val: number) => {
    const safeVal = parsePrintPresetNumber(
      val,
      DEFAULT_PRINT_PRESET_CONFIG.printMarginBottom,
      PRINT_PRESET_BOUNDS.marginMin,
      PRINT_PRESET_BOUNDS.marginMax
    );
    setPrintMarginBottom(safeVal);
    try {
      localStorage.setItem('printMarginBottom', String(safeVal));
    } catch {}
  };

  const handleFontScaleChange = (val: number) => {
    const safeVal = parsePrintPresetNumber(
      val,
      DEFAULT_PRINT_PRESET_CONFIG.printFontScale,
      PRINT_PRESET_BOUNDS.fontScaleMin,
      PRINT_PRESET_BOUNDS.fontScaleMax
    );
    setPrintFontScale(safeVal);
    try {
      localStorage.setItem('printFontScale', String(safeVal));
    } catch {}
  };

  return {
    printMarginTop,
    printMarginBottom,
    printFontScale,
    handleMarginTopChange,
    handleMarginBottomChange,
    handleFontScaleChange
  };
}
