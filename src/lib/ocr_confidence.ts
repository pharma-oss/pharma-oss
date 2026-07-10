export type OcrConfidenceSeverity = 'critical' | 'warning' | 'info';

export interface OcrConfidenceCheckInput {
  ocrText?: string;
  patientName?: string;
  patientBirthDate?: string;
  insuranceNumber?: string;
  institutionName?: string;
  departmentName?: string;
  doctorName?: string;
  prescriptions?: Array<{
    drugName?: string;
    amount?: string | number;
    usage?: string;
    days?: string | number;
  }>;
}

export interface OcrReviewPoint {
  field: string;
  label: string;
  severity: OcrConfidenceSeverity;
  message: string;
  suggestedAction: string;
}

export interface OcrConfidenceReport {
  score: number;
  label: string;
  tone: 'green' | 'amber' | 'red';
  reviewPoints: OcrReviewPoint[];
  evidence: string[];
}

const SUSPICIOUS_OCR_PATTERN = /[□■�?]{2,}|[|]{2,}|[Il]{3,}/;
const DATE_PATTERN = /\d{4}[-/年]?\d{1,2}[-/月]?\d{1,2}|令和\s*\d+|平成\s*\d+|昭和\s*\d+/;

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function compactValue(value: unknown): string {
  return normalizeText(value).replace(/[()（）・.,、。]/g, '');
}

function isValueInOcrText(value: unknown, ocrText: string): boolean {
  const normalizedValue = compactValue(value);
  if (!normalizedValue || normalizedValue.length < 2) return true;
  return normalizeText(ocrText).includes(normalizedValue);
}

function isDateValueInOcrText(value: unknown, ocrText: string): boolean {
  const rawValue = String(value ?? '');
  const digits = rawValue.replace(/\D/g, '');
  if (digits.length < 6) return isValueInOcrText(value, ocrText);
  const ocrDigits = ocrText.replace(/\D/g, '');
  if (ocrDigits.includes(digits)) return true;
  const isoMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const unpadded = `${year}${String(Number(month))}${String(Number(day))}`;
    if (ocrDigits.includes(unpadded)) return true;
  }
  return false;
}

function addReviewPoint(
  points: OcrReviewPoint[],
  point: Omit<OcrReviewPoint, 'severity'> & { severity?: OcrConfidenceSeverity }
): void {
  points.push({
    severity: point.severity || 'warning',
    ...point
  });
}

function scorePenalty(severity: OcrConfidenceSeverity): number {
  if (severity === 'critical') return 26;
  if (severity === 'warning') return 10;
  return 3;
}

export function buildOcrConfidenceReport(input: OcrConfidenceCheckInput): OcrConfidenceReport {
  const ocrText = input.ocrText || '';
  const hasOcrText = ocrText.trim().length > 0;
  const reviewPoints: OcrReviewPoint[] = [];
  const evidence: string[] = [];

  if (!hasOcrText) {
    addReviewPoint(reviewPoints, {
      field: 'ocrText',
      label: 'OCR本文',
      severity: 'critical',
      message: 'OCR本文がありません。',
      suggestedAction: '処方箋画像を再読み取りするか、手入力内容を処方箋原本で確認してください。'
    });
  } else {
    evidence.push(`OCR本文 ${ocrText.trim().length.toLocaleString('ja-JP')}文字`);
    if (ocrText.trim().length < 40) {
      addReviewPoint(reviewPoints, {
        field: 'ocrText',
        label: 'OCR本文',
        severity: 'warning',
        message: 'OCR本文が短く、処方箋全体を読めていない可能性があります。',
        suggestedAction: '画像の向き、解像度、処方箋全体が写っているかを確認してください。'
      });
    }
    if (SUSPICIOUS_OCR_PATTERN.test(ocrText)) {
      addReviewPoint(reviewPoints, {
        field: 'ocrText',
        label: '文字認識',
        severity: 'warning',
        message: 'OCR本文に判読しにくい記号や連続した誤認識候補があります。',
        suggestedAction: '該当箇所を処方箋イメージと照合し、数字・薬品名・用法を確認してください。'
      });
    }
  }

  const requiredFields = [
    { field: 'patientName', label: '患者名', value: input.patientName },
    { field: 'patientBirthDate', label: '生年月日', value: input.patientBirthDate },
    { field: 'institutionName', label: '医療機関名', value: input.institutionName },
    { field: 'departmentName', label: '診療科', value: input.departmentName },
    { field: 'doctorName', label: '医師名', value: input.doctorName }
  ];

  for (const field of requiredFields) {
    if (!String(field.value ?? '').trim()) {
      addReviewPoint(reviewPoints, {
        field: field.field,
        label: field.label,
        severity: 'critical',
        message: `${field.label}が未入力です。`,
        suggestedAction: `${field.label}を処方箋原本で確認して入力してください。`
      });
    } else if (hasOcrText && !(field.field === 'patientBirthDate' ? isDateValueInOcrText(field.value, ocrText) : isValueInOcrText(field.value, ocrText))) {
      addReviewPoint(reviewPoints, {
        field: field.field,
        label: field.label,
        severity: 'info',
        message: `${field.label}の入力値がOCR本文中に見つかりません。`,
        suggestedAction: '候補選択や手入力で補正した内容か、処方箋原本と照合してください。'
      });
    }
  }

  const insuranceNumber = String(input.insuranceNumber ?? '').trim();
  if (insuranceNumber && !/^\d{6,8}$/.test(insuranceNumber)) {
    addReviewPoint(reviewPoints, {
      field: 'insuranceNumber',
      label: '保険者番号',
      severity: 'warning',
      message: '保険者番号が一般的な6から8桁の数字ではありません。',
      suggestedAction: 'オンライン資格確認または保険証情報で保険者番号を確認してください。'
    });
  }

  if (input.patientBirthDate && hasOcrText && !DATE_PATTERN.test(ocrText)) {
    addReviewPoint(reviewPoints, {
      field: 'patientBirthDate',
      label: '日付認識',
      severity: 'info',
      message: 'OCR本文から日付らしい文字列を十分に確認できません。',
      suggestedAction: '生年月日、処方日、調剤日を処方箋原本で確認してください。'
    });
  }

  const prescriptions = input.prescriptions || [];
  if (prescriptions.length === 0) {
    addReviewPoint(reviewPoints, {
      field: 'prescriptions',
      label: '処方内容',
      severity: 'critical',
      message: '処方内容が入力されていません。',
      suggestedAction: '薬品名、用量、用法、日数を入力してください。'
    });
  }

  prescriptions.forEach((prescription, index) => {
    const number = index + 1;
    if (!String(prescription.drugName ?? '').trim()) {
      addReviewPoint(reviewPoints, {
        field: `prescriptions.${index}.drugName`,
        label: `処方薬${number}`,
        severity: 'critical',
        message: `処方薬${number}の薬品名が未入力です。`,
        suggestedAction: '薬品マスターから薬品名を選択してください。'
      });
    } else if (hasOcrText && !isValueInOcrText(prescription.drugName, ocrText)) {
      addReviewPoint(reviewPoints, {
        field: `prescriptions.${index}.drugName`,
        label: `処方薬${number}`,
        severity: 'info',
        message: `処方薬${number}の薬品名がOCR本文中に見つかりません。`,
        suggestedAction: 'マスター選択で補正した内容か、処方箋原本と照合してください。'
      });
    }

    if (!String(prescription.amount ?? '').trim()) {
      addReviewPoint(reviewPoints, {
        field: `prescriptions.${index}.amount`,
        label: `処方薬${number} 数量`,
        severity: 'critical',
        message: `処方薬${number}の数量が未入力です。`,
        suggestedAction: '1日量または総量を処方箋原本で確認してください。'
      });
    }

    if (!String(prescription.usage ?? '').trim()) {
      addReviewPoint(reviewPoints, {
        field: `prescriptions.${index}.usage`,
        label: `処方薬${number} 用法`,
        severity: 'critical',
        message: `処方薬${number}の用法が未入力です。`,
        suggestedAction: '用法をRp単位で確認してください。'
      });
    }

    if (!String(prescription.days ?? '').trim()) {
      addReviewPoint(reviewPoints, {
        field: `prescriptions.${index}.days`,
        label: `処方薬${number} 日数`,
        severity: 'critical',
        message: `処方薬${number}の日数が未入力です。`,
        suggestedAction: '投与日数を処方箋原本で確認してください。'
      });
    }
  });

  const score = Math.max(0, Math.min(100, Math.round(
    96 - reviewPoints.reduce((sum, point) => sum + scorePenalty(point.severity), 0)
  )));
  const tone = score >= 85 ? 'green' : score >= 65 ? 'amber' : 'red';
  const label = score >= 85 ? '高' : score >= 65 ? '要確認' : '低';

  if (hasOcrText) {
    evidence.push(`確認ポイント ${reviewPoints.length}件`);
  }

  return {
    score,
    label,
    tone,
    reviewPoints,
    evidence
  };
}
