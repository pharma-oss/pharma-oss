import type {
  AuditLog,
  Drug,
  FacilitySettings,
  Patient,
  PrescriptionItem,
  User,
  Visit
} from '../db/types.ts';

export const RETURN_CORRECTION_E2E_SEED_IDS = {
  adminUserId: 'e2e_return_correction_admin',
  patientId: 'e2e_return_correction_patient',
  visitId: 'e2e_return_correction_visit',
  oldDrugCode: '999999911',
  currentDrugCode: '999999912',
  prescriptionItemId: 'e2e_return_correction_item_1'
} as const;

export interface ReturnCorrectionE2ESeedRecords {
  facilitySettings: FacilitySettings;
  users: User[];
  patients: Patient[];
  visits: Visit[];
  drugs: Drug[];
  prescriptionItems: PrescriptionItem[];
  auditLogs: AuditLog[];
}

export interface ReturnCorrectionE2ESeedResult {
  ok: true;
  seededAt: string;
  patientId: string;
  visitId: string;
  expectedActionTargets: string[];
}

interface BulkUpsertCollection<T> {
  bulkUpsert(rows: T[]): Promise<unknown>;
}

export interface ReturnCorrectionE2ESeedDatabase {
  facility_settings: BulkUpsertCollection<FacilitySettings>;
  users: BulkUpsertCollection<User>;
  patients: BulkUpsertCollection<Patient>;
  visits: BulkUpsertCollection<Visit>;
  drugs: BulkUpsertCollection<Drug>;
  prescription_items: BulkUpsertCollection<PrescriptionItem>;
  audit_logs: BulkUpsertCollection<AuditLog>;
}

function minutesAfter(base: Date, minutes: number): string {
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

export function buildReturnCorrectionE2ESeedRecords(seededAt: Date = new Date()): ReturnCorrectionE2ESeedRecords {
  const seededIso = seededAt.toISOString();
  const prescriptionDate = seededIso.slice(0, 10);
  const exportedAt = minutesAfter(seededAt, 1);
  const returnedAt = minutesAfter(seededAt, 2);

  const patient: Patient = {
    patientId: RETURN_CORRECTION_E2E_SEED_IDS.patientId,
    name: '返戻 テスト',
    kana: 'ヘンレイ テスト',
    birthDate: '1975-03-04',
    gender: 'other',
    insuranceInfo: {
      provider: '06123456',
      number: 'E2E-9999',
      burdenRatio: 20,
      insuranceType: '協会けんぽ',
      relationship: '本人',
      validFrom: '2026-04-01',
      validTo: '2027-03-31',
      eligibilityCheckedAt: seededIso,
      eligibilityStatus: 'valid'
    },
    publicInsurances: [{
      provider: '51136018',
      recipient: '1234567',
      burdenRatio: 10,
      startDate: '2026-04-01',
      endDate: '2027-03-31',
      monthlyLimitYen: 5000
    }]
  };

  const currentItem: PrescriptionItem = {
    itemId: RETURN_CORRECTION_E2E_SEED_IDS.prescriptionItemId,
    visitId: RETURN_CORRECTION_E2E_SEED_IDS.visitId,
    rpNumber: 1,
    drugId: RETURN_CORRECTION_E2E_SEED_IDS.currentDrugCode,
    dispensedDrug: '返戻確認薬 10mg',
    dispensedDrugCode: RETURN_CORRECTION_E2E_SEED_IDS.currentDrugCode,
    amount: 2,
    usage: '1日2回 朝夕食後',
    days: 7,
    isIppoka: false,
    isCrushed: false,
    tokkanType: 'none',
    claimPreparation: true,
    claimManagement: true,
    claimDrugFee: true,
    isDiagnosticTest: false
  };

  const visit: Visit = {
    visitId: RETURN_CORRECTION_E2E_SEED_IDS.visitId,
    patientId: RETURN_CORRECTION_E2E_SEED_IDS.patientId,
    institutionId: 'e2e_return_clinic',
    institutionCode: '1312345',
    institutionName: '返戻確認クリニック',
    departmentName: '内科',
    doctorId: 'e2e_return_doctor',
    doctorName: '返戻 医師',
    prescriptionDate,
    dispensingDate: prescriptionDate,
    issueDate: seededIso,
    status: 'completed',
    claimLifecycle: {
      status: 'returned',
      exportedAt,
      exportedBy: 'E2E返戻管理者',
      exportedFileName: 'E2E_RETURN_CORRECTION.uke',
      totalPoints: 1,
      exportSnapshot: {
        createdAt: exportedAt,
        visitId: RETURN_CORRECTION_E2E_SEED_IDS.visitId,
        patientId: patient.patientId,
        patientName: patient.name,
        patientKana: patient.kana,
        patientBirthDate: patient.birthDate,
        patientGender: patient.gender,
        insuranceInfo: {
          provider: '06123456',
          number: 'E2E-0001',
          burdenRatio: 30,
          insuranceType: '協会けんぽ',
          relationship: '本人',
          validFrom: '2026-04-01',
          validTo: '2027-03-31',
          eligibilityCheckedAt: exportedAt,
          eligibilityStatus: 'valid'
        },
        publicInsurances: [],
        institutionCode: '1312345',
        institutionName: '返戻確認クリニック',
        departmentName: '内科',
        doctorName: '返戻 医師',
        prescriptionDate,
        dispensingDate: prescriptionDate,
        issueDate: seededIso,
        exportedFileName: 'E2E_RETURN_CORRECTION.uke',
        totalPoints: 1,
        prescriptionItems: [{
          itemId: RETURN_CORRECTION_E2E_SEED_IDS.prescriptionItemId,
          rpNumber: 1,
          drugId: RETURN_CORRECTION_E2E_SEED_IDS.oldDrugCode,
          dispensedDrug: '返戻確認薬 5mg',
          dispensedDrugCode: RETURN_CORRECTION_E2E_SEED_IDS.oldDrugCode,
          amount: 1,
          days: 14,
          usage: '1日1回 朝食後'
        }]
      },
      returnedAt,
      returnReason: '返戻修正導線E2E確認用',
      history: [
        {
          type: 'exported',
          at: exportedAt,
          by: 'E2E返戻管理者',
          fileName: 'E2E_RETURN_CORRECTION.uke',
          totalPoints: 1,
          note: '返戻修正導線E2E用UKE出力'
        },
        {
          type: 'returned',
          at: returnedAt,
          by: 'E2E返戻管理者',
          note: '返戻修正導線E2E用の返戻登録'
        }
      ]
    }
  };

  return {
    facilitySettings: {
      id: 'default',
      pharmacyName: '青空薬局 返戻確認店',
      pharmacyKana: 'アオゾラヤッキョク ヘンレイカクニンテン',
      pharmacyCode: '1312345',
      pharmacyPostalCode: '100-0001',
      pharmacyAddress: '東京都千代田区1-1-1',
      pharmacyPhone: '03-0000-0000',
      defaultPharmacistName: '返戻 薬剤師',
      baseFeeCategory: '1',
      regionalSupportAddition: 'none',
      medicalDxAddition: false,
      postGenericAddition: 'none',
      genericDispensingReduction: false
    },
    users: [{
      userId: RETURN_CORRECTION_E2E_SEED_IDS.adminUserId,
      name: 'E2E返戻管理者',
      role: 'admin',
      passwordHash: 'e2e-return-password-hash',
      salt: 'e2e-return-salt'
    }],
    patients: [patient],
    visits: [visit],
    drugs: [
      {
        code: RETURN_CORRECTION_E2E_SEED_IDS.oldDrugCode,
        name: '返戻確認薬 5mg',
        yjCode: '2149040F1012',
        isGeneric: true,
        genericName: '返戻確認薬',
        isAbolished: false,
        price: 9.9,
        stockQuantity: 100
      },
      {
        code: RETURN_CORRECTION_E2E_SEED_IDS.currentDrugCode,
        name: '返戻確認薬 10mg',
        yjCode: '2149040F2019',
        isGeneric: true,
        genericName: '返戻確認薬',
        isAbolished: false,
        price: 19.8,
        stockQuantity: 100
      }
    ],
    prescriptionItems: [currentItem],
    auditLogs: [{
      logId: 'e2e_return_correction_claim_lifecycle',
      timestamp: returnedAt,
      userId: RETURN_CORRECTION_E2E_SEED_IDS.adminUserId,
      userName: 'E2E返戻管理者',
      userRole: 'admin',
      actionType: 'claim_lifecycle',
      patientId: RETURN_CORRECTION_E2E_SEED_IDS.patientId,
      patientName: patient.name,
      details: '返戻修正導線E2Eテストデータ: 返戻登録済み'
    }]
  };
}

export async function seedReturnCorrectionE2EData(
  db: ReturnCorrectionE2ESeedDatabase,
  seededAt: Date = new Date()
): Promise<ReturnCorrectionE2ESeedResult> {
  const records = buildReturnCorrectionE2ESeedRecords(seededAt);
  await Promise.all([
    db.facility_settings.bulkUpsert([records.facilitySettings]),
    db.users.bulkUpsert(records.users),
    db.patients.bulkUpsert(records.patients),
    db.visits.bulkUpsert(records.visits),
    db.drugs.bulkUpsert(records.drugs),
    db.prescription_items.bulkUpsert(records.prescriptionItems),
    db.audit_logs.bulkUpsert(records.auditLogs)
  ]);

  return {
    ok: true,
    seededAt: seededAt.toISOString(),
    patientId: RETURN_CORRECTION_E2E_SEED_IDS.patientId,
    visitId: RETURN_CORRECTION_E2E_SEED_IDS.visitId,
    expectedActionTargets: [
      'patient-insurance-editor',
      'prescription-intervention-record',
      'claim-adjust-panel'
    ]
  };
}
