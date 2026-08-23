import { useState, useEffect } from 'react';

export interface UsePrintPresetConfigReturn {
  printMarginTop: number;
  printMarginBottom: number;
  printFontScale: number;
  handleMarginTopChange: (val: number) => void;
  handleMarginBottomChange: (val: number) => void;
  handleFontScaleChange: (val: number) => void;
}

export function usePrintPresetConfig(): UsePrintPresetConfigReturn {
  const [printMarginTop, setPrintMarginTop] = useState(15); // mm
  const [printMarginBottom, setPrintMarginBottom] = useState(15); // mm
  const [printFontScale, setPrintFontScale] = useState(100); // %

  useEffect(() => {
    try {
      const top = localStorage.getItem('printMarginTop');
      const bottom = localStorage.getItem('printMarginBottom');
      const scale = localStorage.getItem('printFontScale');
      if (top) setPrintMarginTop(Number(top));
      if (bottom) setPrintMarginBottom(Number(bottom));
      if (scale) setPrintFontScale(Number(scale));
    } catch {
      // ignore storage error
    }
  }, []);

  const handleMarginTopChange = (val: number) => {
    setPrintMarginTop(val);
    try {
      localStorage.setItem('printMarginTop', String(val));
    } catch {}
  };

  const handleMarginBottomChange = (val: number) => {
    setPrintMarginBottom(val);
    try {
      localStorage.setItem('printMarginBottom', String(val));
    } catch {}
  };

  const handleFontScaleChange = (val: number) => {
    setPrintFontScale(val);
    try {
      localStorage.setItem('printFontScale', String(val));
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
