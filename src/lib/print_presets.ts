export type PrintDocumentType =
  | 'dispensing_record'
  | 'medication_notebook'
  | 'drug_bag'
  | 'liquid_label'
  | 'ointment_label';

export interface PrintPreset {
  id: string;
  name: string;
  targetDocument: PrintDocumentType;
  paperSize: string; // e.g. 'A4', 'A6', '50x30mm', '60x40mm'
  marginTopMm: number;
  marginBottomMm: number;
  fontScalePercent: number; // 80 - 120
  description: string;
  isBuiltIn?: boolean;
}

export const DEFAULT_PRINT_PRESETS: PrintPreset[] = [
  {
    id: 'preset_a4_dispensing_record',
    name: 'A4標準（調剤録・明細書用）',
    targetDocument: 'dispensing_record',
    paperSize: 'A4',
    marginTopMm: 10,
    marginBottomMm: 10,
    fontScalePercent: 100,
    description: '一般的なA4複合機・レーザープリンター用標準余白',
    isBuiltIn: true
  },
  {
    id: 'preset_a6_notebook_sticker',
    name: 'A6お薬手帳シール（標準）',
    targetDocument: 'medication_notebook',
    paperSize: 'A6',
    marginTopMm: 5,
    marginBottomMm: 5,
    fontScalePercent: 95,
    description: 'A6判お薬手帳貼付用シール紙（Brother / EPSON等）',
    isBuiltIn: true
  },
  {
    id: 'preset_a5_drug_bag',
    name: '薬袋（汎用A5/B5判）',
    targetDocument: 'drug_bag',
    paperSize: 'A5',
    marginTopMm: 8,
    marginBottomMm: 8,
    fontScalePercent: 100,
    description: '内服・外用薬袋（A5またはB5汎用プリンター給紙）',
    isBuiltIn: true
  },
  {
    id: 'preset_liquid_roll_50x30',
    name: '水剤ラベル 50×30mm（ロール紙）',
    targetDocument: 'liquid_label',
    paperSize: '50x30mm',
    marginTopMm: 2,
    marginBottomMm: 2,
    fontScalePercent: 90,
    description: '水剤ボトル貼付用標準感熱ロールラベル（Brother TD / SATO等）',
    isBuiltIn: true
  },
  {
    id: 'preset_ointment_roll_60x40',
    name: '軟膏ラベル 60×40mm（ロール紙）',
    targetDocument: 'ointment_label',
    paperSize: '60x40mm',
    marginTopMm: 3,
    marginBottomMm: 3,
    fontScalePercent: 90,
    description: '軟膏容器貼付用感熱ロールラベル',
    isBuiltIn: true
  }
];

const PRESET_STORAGE_KEY = 'yakureki:print-presets:v1';

export function getPrintPresetsForDocument(documentType?: PrintDocumentType): PrintPreset[] {
  const customPresets = loadCustomPrintPresets();
  const all = [...DEFAULT_PRINT_PRESETS, ...customPresets];
  if (!documentType) return all;
  return all.filter((preset) => preset.targetDocument === documentType);
}

export function loadCustomPrintPresets(): PrintPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load custom print presets:', err);
    return [];
  }
}

export function saveCustomPrintPreset(preset: Omit<PrintPreset, 'id' | 'isBuiltIn'>): PrintPreset {
  const customPresets = loadCustomPrintPresets();
  const newPreset: PrintPreset = {
    ...preset,
    id: `custom_preset_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    isBuiltIn: false
  };

  const updated = [...customPresets, newPreset];
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save custom print preset:', err);
    }
  }
  return newPreset;
}

export function deleteCustomPrintPreset(presetId: string): boolean {
  const customPresets = loadCustomPrintPresets();
  const filtered = customPresets.filter((p) => p.id !== presetId);
  if (filtered.length === customPresets.length) return false;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(filtered));
    } catch (err) {
      console.error('Failed to delete custom print preset:', err);
      return false;
    }
  }
  return true;
}
