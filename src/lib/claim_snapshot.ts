import type { Patient, PrescriptionItem, Visit } from '@/db/types';
import type { ClaimExportSnapshot } from './claim_lifecycle';

export interface ClaimSnapshotDifference {
  field: string;
  label: string;
  snapshotValue: string;
  currentValue: string;
}

export type ClaimReturnCorrectionActionTarget =
  | 'patient-insurance-editor'
  | 'prescription-intervention-record'
  | 'claim-adjust-panel';

export interface ClaimReturnCorrectionSuggestion {
  id: string;
  title: string;
  message: string;
  actionLabel: string;
  actionTarget: ClaimReturnCorrectionActionTarget;
  severity: 'error' | 'warning';
  fields: string[];
  differenceSummary: string;
}

export interface ClaimSnapshotDifferenceExportInput {
  snapshot: ClaimExportSnapshot;
  differences: ClaimSnapshotDifference[];
  suggestions: ClaimReturnCorrectionSuggestion[];
}

export type ClaimReturnCorrectionAction =
  | {
      type: 'route';
      pathname: '/emr';
      searchParams: Record<string, string>;
    }
  | {
      type: 'anchor';
      elementId: 'claim-adjust-panel';
    };

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text.trimStart())) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function displayText(value: unknown): string {
  const text = normalizeText(value);
  return text || '未設定';
}

function displayRatio(value: unknown): string {
  const text = normalizeText(value);
  return text ? `${text}%` : '未設定';
}

function publicInsuranceKey(insurances: ClaimExportSnapshot['publicInsurances'] | Patient['publicInsurances']): string {
  return (insurances || [])
    .map((insurance) => [
      normalizeText(insurance.provider),
      normalizeText(insurance.recipient),
      normalizeText(insurance.burdenRatio),
      normalizeText(insurance.startDate),
      normalizeText(insurance.endDate),
      normalizeText(insurance.monthlyLimitYen)
    ].join(':'))
    .join('|');
}

function publicInsuranceSummary(insurances: ClaimExportSnapshot['publicInsurances'] | Patient['publicInsurances']): string {
  if (!insurances || insurances.length === 0) return '未設定';
  return insurances
    .map((insurance) => `${displayText(insurance.provider)}/${displayText(insurance.recipient)}`)
    .join('、');
}

function prescriptionKey(items: Array<Pick<PrescriptionItem, 'drugId' | 'dispensedDrug' | 'dispensedDrugCode' | 'amount' | 'days' | 'usage' | 'rpNumber'>>): string {
  return items
    .map((item) => [
      normalizeText(item.rpNumber),
      normalizeText(item.drugId),
      normalizeText(item.dispensedDrugCode),
      normalizeText(item.dispensedDrug),
      normalizeText(item.amount),
      normalizeText(item.days),
      normalizeText(item.usage)
    ].join(':'))
    .join('|');
}

function prescriptionSummary(items: Array<Pick<PrescriptionItem, 'drugId' | 'dispensedDrug' | 'dispensedDrugCode'>>): string {
  if (items.length === 0) return '0薬品';
  const names = items
    .slice(0, 3)
    .map((item) => displayText(item.dispensedDrug || item.dispensedDrugCode || item.drugId))
    .join('、');
  return `${items.length}薬品（${names}${items.length > 3 ? ' ほか' : ''}）`;
}

function addDifference(
  differences: ClaimSnapshotDifference[],
  field: string,
  label: string,
  snapshotValue: string,
  currentValue: string,
  snapshotKey = snapshotValue,
  currentKey = currentValue
) {
  if (snapshotKey === currentKey) return;
  differences.push({ field, label, snapshotValue, currentValue });
}

export function buildClaimExportSnapshot({
  visit,
  patient,
  items,
  totalPoints,
  createdAt,
  exportedFileName
}: {
  visit: Visit;
  patient: Patient;
  items: PrescriptionItem[];
  totalPoints: number;
  createdAt: string;
  exportedFileName?: string;
}): ClaimExportSnapshot {
  return {
    createdAt,
    visitId: visit.visitId,
    patientId: patient.patientId,
    patientName: patient.name,
    patientKana: patient.kana,
    patientBirthDate: patient.birthDate,
    patientGender: patient.gender,
    insuranceInfo: patient.insuranceInfo ? { ...patient.insuranceInfo } : undefined,
    publicInsurances: patient.publicInsurances?.map((insurance) => ({ ...insurance })) || [],
    institutionCode: visit.institutionCode,
    institutionName: visit.institutionName,
    departmentName: visit.departmentName,
    doctorName: visit.doctorName,
    prescriptionDate: visit.prescriptionDate,
    dispensingDate: visit.dispensingDate,
    issueDate: visit.issueDate,
    exportedFileName,
    totalPoints,
    prescriptionItems: items.map((item) => ({
      itemId: item.itemId,
      rpNumber: item.rpNumber,
      drugId: item.drugId,
      dispensedDrug: item.dispensedDrug,
      dispensedDrugCode: item.dispensedDrugCode,
      amount: item.amount,
      days: item.days,
      usage: item.usage
    }))
  };
}

export function compareClaimExportSnapshotToCurrent({
  snapshot,
  patient,
  items,
  totalPoints
}: {
  snapshot: ClaimExportSnapshot;
  patient: Patient;
  items: PrescriptionItem[];
  totalPoints: number;
}): ClaimSnapshotDifference[] {
  const differences: ClaimSnapshotDifference[] = [];

  addDifference(differences, 'patientName', '患者名', displayText(snapshot.patientName), displayText(patient.name));
  addDifference(differences, 'patientBirthDate', '生年月日', displayText(snapshot.patientBirthDate), displayText(patient.birthDate));
  addDifference(
    differences,
    'insuranceProvider',
    '保険者番号',
    displayText(snapshot.insuranceInfo?.provider),
    displayText(patient.insuranceInfo?.provider)
  );
  addDifference(
    differences,
    'insuranceNumber',
    '保険記号番号',
    displayText(snapshot.insuranceInfo?.number),
    displayText(patient.insuranceInfo?.number)
  );
  addDifference(
    differences,
    'burdenRatio',
    '負担割合',
    displayRatio(snapshot.insuranceInfo?.burdenRatio),
    displayRatio(patient.insuranceInfo?.burdenRatio)
  );
  addDifference(
    differences,
    'insuranceValidTo',
    '保険有効期限',
    displayText(snapshot.insuranceInfo?.validTo),
    displayText(patient.insuranceInfo?.validTo)
  );
  addDifference(
    differences,
    'eligibilityStatus',
    '資格確認状態',
    displayText(snapshot.insuranceInfo?.eligibilityStatus),
    displayText(patient.insuranceInfo?.eligibilityStatus)
  );
  addDifference(
    differences,
    'publicInsurances',
    '公費',
    publicInsuranceSummary(snapshot.publicInsurances),
    publicInsuranceSummary(patient.publicInsurances),
    publicInsuranceKey(snapshot.publicInsurances),
    publicInsuranceKey(patient.publicInsurances)
  );
  addDifference(
    differences,
    'prescriptionItems',
    '処方内容',
    prescriptionSummary(snapshot.prescriptionItems),
    prescriptionSummary(items),
    prescriptionKey(snapshot.prescriptionItems),
    prescriptionKey(items)
  );
  addDifference(
    differences,
    'totalPoints',
    '合計点数',
    `${snapshot.totalPoints}点`,
    `${totalPoints}点`
  );

  return differences;
}

function summarizeDifferences(differences: ClaimSnapshotDifference[]): string {
  return differences
    .map((difference) => `${difference.label}: 請求時点「${difference.snapshotValue}」/ 現在「${difference.currentValue}」`)
    .join('、');
}

function pickDifferences(differences: ClaimSnapshotDifference[], fields: string[]): ClaimSnapshotDifference[] {
  return differences.filter((difference) => fields.includes(difference.field));
}

function addSuggestion(
  suggestions: ClaimReturnCorrectionSuggestion[],
  suggestion: Omit<ClaimReturnCorrectionSuggestion, 'differenceSummary'>,
  differences: ClaimSnapshotDifference[]
) {
  if (differences.length === 0) return;
  suggestions.push({
    ...suggestion,
    differenceSummary: summarizeDifferences(differences)
  });
}

export function buildClaimReturnCorrectionSuggestions(
  differences: ClaimSnapshotDifference[]
): ClaimReturnCorrectionSuggestion[] {
  const suggestions: ClaimReturnCorrectionSuggestion[] = [];
  const patientDifferences = pickDifferences(differences, ['patientName', 'patientBirthDate']);
  const insuranceDifferences = pickDifferences(differences, [
    'insuranceProvider',
    'insuranceNumber',
    'burdenRatio',
    'insuranceValidTo',
    'eligibilityStatus',
    'publicInsurances'
  ]);
  const prescriptionDifferences = pickDifferences(differences, ['prescriptionItems']);
  const pointDifferences = pickDifferences(differences, ['totalPoints']);

  addSuggestion(suggestions, {
    id: 'patient-master',
    title: '患者基本情報を確認',
    message: '返戻理由が本人情報や生年月日に関係する場合は、患者マスターを現在値で再確認し、再請求前に請求時点との差分を解消してください。',
    actionLabel: '患者情報を確認',
    actionTarget: 'patient-insurance-editor',
    severity: 'error',
    fields: patientDifferences.map((difference) => difference.field)
  }, patientDifferences);

  addSuggestion(suggestions, {
    id: 'insurance-master',
    title: '保険・公費を確認',
    message: '返戻理由が資格、保険者、記号番号、負担割合、公費に関係する場合は、オンライン資格確認または保険証原本で修正してから再請求してください。',
    actionLabel: '保険・公費を修正',
    actionTarget: 'patient-insurance-editor',
    severity: 'error',
    fields: insuranceDifferences.map((difference) => difference.field)
  }, insuranceDifferences);

  addSuggestion(suggestions, {
    id: 'prescription-items',
    title: '処方内容を確認',
    message: '返戻理由が薬剤、数量、日数、用法、変更調剤に関係する場合は、返戻登録後に処方内容を修正し、薬剤師確認を通してください。',
    actionLabel: '処方内容を修正',
    actionTarget: 'prescription-intervention-record',
    severity: 'error',
    fields: prescriptionDifferences.map((difference) => difference.field)
  }, prescriptionDifferences);

  addSuggestion(suggestions, {
    id: 'claim-points',
    title: '点数を再計算',
    message: prescriptionDifferences.length > 0
      ? '処方内容の変更により点数が変わっています。修正後の点数でUKEを再出力してください。'
      : '算定設定やマスター更新により点数だけが変わっている可能性があります。算定内訳を確認してUKEを再出力してください。',
    actionLabel: '点数内訳を確認',
    actionTarget: 'claim-adjust-panel',
    severity: prescriptionDifferences.length > 0 ? 'warning' : 'error',
    fields: pointDifferences.map((difference) => difference.field)
  }, pointDifferences);

  return suggestions;
}

export function buildClaimReturnCorrectionAction(
  suggestion: ClaimReturnCorrectionSuggestion,
  visitId: string
): ClaimReturnCorrectionAction {
  if (suggestion.actionTarget === 'patient-insurance-editor') {
    return {
      type: 'route',
      pathname: '/emr',
      searchParams: {
        visitId,
        openInsurance: '1',
        returnCorrection: suggestion.id
      }
    };
  }

  if (suggestion.actionTarget === 'prescription-intervention-record') {
    return {
      type: 'route',
      pathname: '/emr',
      searchParams: {
        visitId,
        openIntervention: '1',
        returnCorrection: suggestion.id,
        reason: `返戻修正候補: ${suggestion.differenceSummary}`
      }
    };
  }

  return {
    type: 'anchor',
    elementId: 'claim-adjust-panel'
  };
}

function findSuggestionsForDifference(
  suggestions: ClaimReturnCorrectionSuggestion[],
  field: string
): ClaimReturnCorrectionSuggestion[] {
  return suggestions.filter((suggestion) => suggestion.fields.includes(field));
}

export function buildClaimSnapshotDifferenceCsv({
  snapshot,
  differences,
  suggestions
}: ClaimSnapshotDifferenceExportInput): string {
  const rows = [
    ['受付ID', '患者ID', '患者名', 'UKEファイル', '請求時点', '差分項目', '請求時点の値', '現在の値', '返戻修正候補', '修正先', '重要度', '差分サマリ'],
    ...differences.map((difference) => {
      const relatedSuggestions = findSuggestionsForDifference(suggestions, difference.field);
      return [
        snapshot.visitId,
        snapshot.patientId,
        snapshot.patientName,
        snapshot.exportedFileName || '',
        snapshot.createdAt,
        difference.label,
        difference.snapshotValue,
        difference.currentValue,
        relatedSuggestions.map((suggestion) => suggestion.title).join(' / '),
        relatedSuggestions.map((suggestion) => suggestion.actionLabel).join(' / '),
        relatedSuggestions.map((suggestion) => suggestion.severity === 'error' ? '要修正' : '要確認').join(' / '),
        relatedSuggestions.map((suggestion) => suggestion.differenceSummary).join(' / ')
      ];
    })
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildClaimReturnCorrectionHandoffMemo({
  snapshot,
  differences,
  suggestions
}: ClaimSnapshotDifferenceExportInput): string {
  const header = [
    '返戻修正メモ',
    `受付ID: ${snapshot.visitId}`,
    `患者: ${snapshot.patientName}`,
    `UKE: ${snapshot.exportedFileName || 'ファイル名未記録'}`,
    `請求時点: ${snapshot.createdAt}`,
    `差分: ${differences.length}件`
  ];
  const differenceLines = differences.length > 0
    ? differences.map((difference, index) => (
      `${index + 1}. ${difference.label}: 請求時点「${difference.snapshotValue}」→ 現在「${difference.currentValue}」`
    ))
    : ['差分はありません。'];
  const suggestionLines = suggestions.length > 0
    ? suggestions.map((suggestion, index) => (
      `${index + 1}. ${suggestion.title}: ${suggestion.actionLabel} / ${suggestion.differenceSummary}`
    ))
    : ['返戻修正候補はありません。'];

  return [
    ...header,
    '',
    '差分',
    ...differenceLines,
    '',
    '次の対応',
    ...suggestionLines
  ].join('\n');
}

export function makeClaimSnapshotDifferenceCsvFileName(
  snapshot: ClaimExportSnapshot,
  date = new Date()
): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const timestamp = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
  const safeVisitId = snapshot.visitId.replace(/[^\w.-]/g, '_');
  return `CLAIM_SNAPSHOT_DIFF_${safeVisitId}_${timestamp}.csv`;
}
