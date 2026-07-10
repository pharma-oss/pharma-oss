export interface InitialQuestionnaireOcrDraft {
  rawText: string;
  allergies: string;
  adverseDrugReactions: string;
  medicalHistory: string;
  currentSymptoms: string;
  pregnancyLactation: string;
  lifestyle: string;
  notes: string;
  warnings: string[];
}

type QuestionnaireField = Exclude<keyof InitialQuestionnaireOcrDraft, 'rawText' | 'warnings'>;

const FIELD_LABELS: Record<QuestionnaireField, string[]> = {
  allergies: ['アレルギー', '薬物アレルギー', '食物アレルギー', '花粉症'],
  adverseDrugReactions: ['副作用', '薬で具合', '薬が合わない', '過去に合わなかった薬'],
  medicalHistory: ['既往歴', '持病', '治療中', '病気', '疾患'],
  currentSymptoms: ['症状', '体調', '困っていること', '今回相談したいこと'],
  pregnancyLactation: ['妊娠・授乳', '妊娠/授乳', '妊娠', '授乳', '妊娠中', '授乳中'],
  lifestyle: ['飲酒', '喫煙', '生活', '車の運転', '仕事'],
  notes: ['備考', 'その他', '自由記入', 'メモ']
};

const FIELD_PLACEHOLDERS = new Set(['あり', 'なし', '有', '無', '不明', '未記入']);

function normalizeLine(line: string): string {
  return line
    .normalize('NFKC')
    .replace(/[□■☑✓✔]/g, ' ')
    .replace(/[|｜]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractInlineValue(line: string, labels: string[]): string {
  const labelPattern = [...labels]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp)
    .join('|');
  return line
    .replace(new RegExp(`^.*?(?:${labelPattern})\\s*(?:[:：=／/・\\-]|について|は)?\\s*`, 'u'), '')
    .replace(/^(あり|有|なし|無)\s*[,:：-]?\s*/u, '')
    .trim();
}

function isUsableValue(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && !FIELD_PLACEHOLDERS.has(normalized);
}

function pickFieldValue(lines: string[], field: QuestionnaireField): string {
  const labels = FIELD_LABELS[field];
  const values: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!labels.some((label) => line.includes(label))) continue;

    const inlineValue = extractInlineValue(line, labels);
    if (isUsableValue(inlineValue)) {
      values.push(inlineValue);
      continue;
    }

    const nextLine = lines[index + 1] || '';
    if (isUsableValue(nextLine) && !Object.values(FIELD_LABELS).flat().some((label) => nextLine.includes(label))) {
      values.push(nextLine);
    }
  }

  return Array.from(new Set(values)).join('\n');
}

export function extractInitialQuestionnaireOcrDraft(rawText: string): InitialQuestionnaireOcrDraft {
  const normalizedLines = rawText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(normalizeLine)
    .filter(Boolean)
    .slice(0, 120);

  const draft: InitialQuestionnaireOcrDraft = {
    rawText: rawText.trim().slice(0, 12000),
    allergies: pickFieldValue(normalizedLines, 'allergies'),
    adverseDrugReactions: pickFieldValue(normalizedLines, 'adverseDrugReactions'),
    medicalHistory: pickFieldValue(normalizedLines, 'medicalHistory'),
    currentSymptoms: pickFieldValue(normalizedLines, 'currentSymptoms'),
    pregnancyLactation: pickFieldValue(normalizedLines, 'pregnancyLactation'),
    lifestyle: pickFieldValue(normalizedLines, 'lifestyle'),
    notes: pickFieldValue(normalizedLines, 'notes'),
    warnings: []
  };

  const extractedFieldCount = [
    draft.allergies,
    draft.adverseDrugReactions,
    draft.medicalHistory,
    draft.currentSymptoms,
    draft.pregnancyLactation,
    draft.lifestyle,
    draft.notes
  ].filter(Boolean).length;

  if (!draft.rawText) {
    draft.warnings.push('OCRテキストが空です。画像の明るさとピントを確認してください。');
  } else if (extractedFieldCount === 0) {
    draft.warnings.push('見出しを自動判定できませんでした。OCR全文を確認して必要項目へ転記してください。');
  }

  return draft;
}
