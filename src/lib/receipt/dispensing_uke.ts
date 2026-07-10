import type { Patient, PrescriptionItem, Visit, FacilitySettings } from '@/db/types';
import type { CalculationResultItem, FeeCode } from '@/lib/calculator';
import type { UkeRecord } from './uke_generator';

export interface DispensingUkeItem extends PrescriptionItem {
  drugName?: string;
  yjCode?: string;
  drugPrice?: number;
}

export interface BuildDispensingUkeRecordsInput {
  visit: Visit;
  patient: Patient;
  settings: FacilitySettings;
  items: DispensingUkeItem[];
  calculatedFees: CalculationResultItem[];
  interventions?: any[];
  generatedAt?: Date;
}

const PREPARATION_RECORD_CODES: FeeCode[] = ['drug_preparation', 'ippoka', 'mixing'];
const OFFICIAL_SAMPLE_FIELD_COUNTS: Record<string, number> = {
  YK: 8,
  RE: 41,
  HO: 13,
  KO: 9,
  SN: 8,
  JD: 32,
  SH: 9,
  CZ: 70,
  KI: 113,
  IY: 9,
  CO: 2,
  TK: 2
};

function asText(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value);
}

function formatAmount(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function dateDigits(value?: string): string {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}${match[2]}${match[3]}` : '';
}

function monthDigits(value?: string): string {
  if (!value) return '';
  const match = value.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}${match[2]}` : '';
}

function timestampDigits(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function genderCode(patient: Patient): string {
  if (patient.gender === 'male') return '1';
  if (patient.gender === 'female') return '2';
  return '0';
}

function feeRecordType(code?: FeeCode): 'CZ' | 'KI' | 'TO' {
  if (code === 'drug_fee') return 'TO';
  if (code && PREPARATION_RECORD_CODES.includes(code)) return 'CZ';
  return 'KI';
}

function feeKey(code: FeeCode | undefined, index: number): string {
  switch (code) {
    case 'base_fee':
      return 'BASE';
    case 'base_additions':
      return 'BASE_ADD';
    case 'drug_preparation':
      return 'PREP';
    case 'dispensing_management':
      return 'MGMT';
    case 'medication_guidance':
      return 'GUIDE';
    case 'special_management':
      return 'HIGH_RISK';
    case 'ippoka':
      return 'IPPOKA';
    case 'mixing':
      return 'MIX';
    case 'drug_fee':
      return 'DRUG_FEE';
    default:
      return `FEE_${index + 1}`;
  }
}

function addReceiptRemark(records: UkeRecord[], remark: string | undefined, seenCodes: Set<string>) {
  if (!remark) return;
  const match = remark.match(/^(\d{9})\s*(.*)$/);
  if (!match) return;

  const [, code, text] = match;
  const key = `${code}:${text}`;
  if (seenCodes.has(key)) return;
  seenCodes.add(key);

  records.push({
    type: 'CO',
    fields: [code, '', text]
  });
}

function padRecordToOfficialSampleShape(record: UkeRecord): UkeRecord {
  const expectedFieldCount = OFFICIAL_SAMPLE_FIELD_COUNTS[record.type];
  if (!expectedFieldCount || record.fields.length >= expectedFieldCount) return record;
  return {
    ...record,
    fields: [...record.fields, ...Array(expectedFieldCount - record.fields.length).fill('')]
  };
}

function buildSpecialPublicExpenseRecord(visit: Visit): UkeRecord | undefined {
  const specialRecord = visit.claimOptions?.specialPublicExpenseRecord;
  if (!specialRecord) return undefined;

  return {
    type: 'SN',
    fields: [
      asText(specialRecord.category),
      asText(specialRecord.branch),
      '',
      '',
      '',
      asText(specialRecord.supplementalCode),
      '',
      ''
    ]
  };
}

export function buildDispensingUkeRecords(input: BuildDispensingUkeRecordsInput): UkeRecord[] {
  const { visit, patient, settings, items, calculatedFees, interventions } = input;
  const generatedAt = input.generatedAt || new Date();
  const totalPoints = calculatedFees.reduce((sum, fee) => sum + fee.points, 0);
  const records: UkeRecord[] = [];
  const seenCommentCodes = new Set<string>();

  records.push({
    type: 'YK',
    fields: [
      asText(settings.pharmacyCode),
      asText(settings.pharmacyName),
      asText(settings.pharmacyKana),
      asText(settings.pharmacyPostalCode),
      asText(settings.pharmacyAddress),
      asText(settings.pharmacyPhone),
      asText(settings.registrationNumber)
    ]
  });

  records.push({
    type: 'RE',
    fields: [
      '1',
      monthDigits(visit.issueDate),
      asText(visit.visitId),
      asText(patient.patientId),
      asText(patient.name),
      asText(patient.kana),
      genderCode(patient),
      dateDigits(patient.birthDate),
      asText(totalPoints)
    ]
  });

  if (patient.insuranceInfo) {
    records.push({
      type: 'HO',
      fields: [
        asText(patient.insuranceInfo.provider),
        asText(patient.insuranceInfo.number),
        asText(patient.insuranceInfo.burdenRatio)
      ]
    });
  }

  if (patient.publicInsurances && patient.publicInsurances.length > 0) {
    for (const pub of patient.publicInsurances) {
      records.push({
        type: 'KO',
        fields: [
          asText(pub.provider),
          asText(pub.recipient),
          asText(pub.burdenRatio !== undefined ? pub.burdenRatio : '')
        ]
      });
    }
  }

  const specialPublicExpenseRecord = buildSpecialPublicExpenseRecord(visit);
  if (specialPublicExpenseRecord) {
    records.push(specialPublicExpenseRecord);
  }

  records.push({
    type: 'JD',
    fields: [dateDigits(visit.issueDate)]
  });

  records.push({
    type: 'SH',
    fields: [
      dateDigits(visit.issueDate),
      asText(visit.institutionId),
      asText(visit.doctorId)
    ]
  });

  for (let i = 0; i < calculatedFees.length; i++) {
    const fee = calculatedFees[i];
    const recordType = feeRecordType(fee.code);
    records.push({
      type: recordType,
      fields: [
        asText(i + 1),
        feeKey(fee.code, i),
        asText(fee.name),
        asText(fee.points),
        asText(fee.rationale)
      ]
    });

    if (fee.receiptRemarks) {
      for (let j = 0; j < fee.receiptRemarks.length; j++) {
        const remark = fee.receiptRemarks[j];
        addReceiptRemark(records, `${remark.code} ${remark.text}`, seenCommentCodes);
      }
    }
  }

  // 算定除外理由の TO レコード挿入
  if (visit.claimOptions?.disabledFeeRationales) {
    const rationales = visit.claimOptions.disabledFeeRationales;
    Object.entries(rationales).forEach(([feeCode, text]) => {
      if (text) {
        records.push({
          type: 'TO',
          fields: [
            '',
            `EXCLUDE_${feeCode.toUpperCase()}`,
            `【算定除外】${feeCode}: ${text}`,
            '0',
            ''
          ]
        });
      }
    });
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const displayName = item.dispensedDrug || item.drugName || item.drugId;
    const billingDrugCode = item.dispensedDrugCode || item.drugId;
    records.push({
      type: 'IY',
      fields: [
        asText(i + 1),
        asText(item.rpNumber),
        asText(item.yjCode || billingDrugCode),
        asText(billingDrugCode),
        asText(displayName),
        formatAmount(item.amount),
        asText(item.days || ''),
        asText(item.usage),
        formatAmount(item.drugPrice),
        item.claimDrugFee === false ? '0' : '1',
        item.isDiagnosticTest ? '1' : '0'
      ]
    });

    addReceiptRemark(records, item.receiptRemark, seenCommentCodes);

    // 処方項目に紐づく Intervention (疑義照会/変更理由) の TO レコード
    if (interventions && interventions.length > 0) {
      const drugIdStr = item.drugId || '';
      const billingDrugIdStr = billingDrugCode || '';
      const drugNameStr = item.drugName || item.dispensedDrug || '';
      const related = interventions.filter(
        (inv) =>
          inv.visitId === visit.visitId &&
          ((inv.beforeSnapshot && inv.beforeSnapshot.includes(drugIdStr)) ||
            (inv.afterSnapshot && inv.afterSnapshot.includes(drugIdStr)) ||
            (billingDrugIdStr && inv.beforeSnapshot && inv.beforeSnapshot.includes(billingDrugIdStr)) ||
            (billingDrugIdStr && inv.afterSnapshot && inv.afterSnapshot.includes(billingDrugIdStr)) ||
            (inv.reason && inv.reason.includes(drugNameStr)))
      );

      for (const inv of related) {
        let details = `【疑義照会・処方変更】理由: ${inv.reason}`;
        if (inv.inquiryDoctor) {
          details += ` / 照会先: ${inv.inquiryDoctor}医師`;
        }
        if (inv.inquiryResult) {
          details += ` / 結果: ${inv.inquiryResult}`;
        }
        if (inv.patientConsented) {
          details += ` (患者同意済)`;
        }
        records.push({
          type: 'TO',
          fields: [
            '',
            `INTERVENT_${drugIdStr.substring(0, 10)}`,
            details,
            '0',
            ''
          ]
        });
      }
    }
  }

  records.push({
    type: 'TK',
    fields: [
      asText(totalPoints),
      asText(calculatedFees.length),
      asText(items.length)
    ]
  });

  records.push({
    type: 'ST',
    fields: [
      timestampDigits(generatedAt),
      'yakureki'
    ]
  });

  return records.map(padRecordToOfficialSampleShape);
}
