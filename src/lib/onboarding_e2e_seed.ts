import type {
  AuditLog,
  Drug,
  FacilitySettings,
  Patient,
  PrescriptionItem,
  User,
  Visit
} from '../db/types.ts';

export const ONBOARDING_E2E_SEED_IDS = {
  adminUserId: 'e2e_onboarding_admin',
  pharmacistUserId: 'e2e_onboarding_pharmacist',
  patientId: 'e2e_onboarding_patient',
  visitId: 'e2e_onboarding_visit',
  drugCode: '999999901',
  liquidDrugCode: '999999902',
  ointmentDrugCode: '999999903',
  prescriptionItemId: 'e2e_onboarding_item_1',
  liquidPrescriptionItemId: 'e2e_onboarding_item_2',
  ointmentPrescriptionItemId: 'e2e_onboarding_item_3'
} as const;

export interface OnboardingE2ESeedRecords {
  facilitySettings: FacilitySettings;
  users: User[];
  patients: Patient[];
  visits: Visit[];
  drugs: Drug[];
  prescriptionItems: PrescriptionItem[];
  auditLogs: AuditLog[];
}

export interface OnboardingE2ESeedResult {
  ok: true;
  seededAt: string;
  patientId: string;
  visitId: string;
  auditLogIds: string[];
  collections: string[];
}

interface BulkUpsertCollection<T> {
  bulkUpsert(rows: T[]): Promise<unknown>;
}

export interface OnboardingE2ESeedDatabase {
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

function makeAuditLog(
  actionType: AuditLog['actionType'],
  detail: string,
  timestamp: string,
  index: number
): AuditLog {
  return {
    logId: `e2e_onboarding_${actionType}_${index}`,
    timestamp,
    userId: ONBOARDING_E2E_SEED_IDS.adminUserId,
    userName: 'E2E導入管理者',
    userRole: 'admin',
    actionType,
    patientId: ONBOARDING_E2E_SEED_IDS.patientId,
    patientName: '導入 テスト',
    details: detail
  };
}

function makeDailyClosingAuditLog(
  seededAt: Date,
  monthOffset: number,
  index: number,
  values: {
    completionRate: number;
    closingBlockers: number;
    inventoryShortages: number;
    inventoryReceivings: number;
    followUpDueCount: number;
    supportCaseCount: number;
  }
): AuditLog {
  const approvedAt = new Date(seededAt.getFullYear(), seededAt.getMonth() + monthOffset, 15 + index, 20, 0, 0);
  const dateLabel = `${approvedAt.getFullYear()}/${String(approvedAt.getMonth() + 1).padStart(2, '0')}/${String(approvedAt.getDate()).padStart(2, '0')} 20:00`;
  return {
    logId: `e2e_onboarding_daily_closing_${monthOffset}_${index}`,
    timestamp: approvedAt.toISOString(),
    userId: ONBOARDING_E2E_SEED_IDS.adminUserId,
    userName: 'E2E導入管理者',
    userRole: 'admin',
    actionType: 'daily_closing_approval',
    details: [
      `日次締め承認: ${dateLabel}`,
      '店舗名 青空薬局 導入確認店',
      '店舗コード 1312345',
      '確認者 E2E導入管理者',
      `本日完了率 ${values.completionRate}%`,
      `閉店前残タスク ${values.closingBlockers}`,
      `在庫不足 ${values.inventoryShortages}品目`,
      `入庫登録 ${values.inventoryReceivings}件`,
      `服薬フォロー ${values.followUpDueCount}件`,
      `問い合わせ負荷 ${values.supportCaseCount}件`
    ].join(' / '),
    integrityHash: `e2e-closing-hash-${monthOffset}-${index}`
  };
}

export function buildOnboardingE2ESeedRecords(seededAt: Date = new Date()): OnboardingE2ESeedRecords {
  const seededIso = seededAt.toISOString();
  const prescriptionDate = seededIso.slice(0, 10);
  const exportedAt = minutesAfter(seededAt, 2);
  const returnedAt = minutesAfter(seededAt, 3);
  const rebillingAt = minutesAfter(seededAt, 4);
  const totalPoints = 126;

  const patient: Patient = {
    patientId: ONBOARDING_E2E_SEED_IDS.patientId,
    name: '導入 テスト',
    kana: 'ドウニュウ テスト',
    birthDate: '1980-01-02',
    gender: 'other',
    insuranceInfo: {
      provider: '06123456',
      number: 'E2E-0001',
      burdenRatio: 30,
      insuranceType: '協会けんぽ',
      relationship: '本人',
      validFrom: '2026-04-01',
      validTo: '2027-03-31',
      eligibilityCheckedAt: seededIso,
      eligibilityStatus: 'valid'
    },
    publicInsurances: []
  };

  const prescriptionItem: PrescriptionItem = {
    itemId: ONBOARDING_E2E_SEED_IDS.prescriptionItemId,
    visitId: ONBOARDING_E2E_SEED_IDS.visitId,
    rpNumber: 1,
    drugId: ONBOARDING_E2E_SEED_IDS.drugCode,
    dispensedDrug: 'アムロジピン錠5mg「E2E」',
    dispensedDrugCode: ONBOARDING_E2E_SEED_IDS.drugCode,
    amount: 1,
    usage: '1日1回 朝食後',
    days: 14,
    isIppoka: false,
    isCrushed: false,
    tokkanType: 'none',
    claimPreparation: true,
    claimManagement: true,
    claimDrugFee: true,
    isDiagnosticTest: false,
    isPicked: true,
    pickedAt: minutesAfter(seededAt, 1),
    pickedGs1Code: '01049999999000011727063010E2ELOT',
    pickedGtin: '04999999900001',
    pickedLotNumber: 'E2ELOT',
    pickedExpirationDate: '2027-06-30'
  };
  const liquidPrescriptionItem: PrescriptionItem = {
    itemId: ONBOARDING_E2E_SEED_IDS.liquidPrescriptionItemId,
    visitId: ONBOARDING_E2E_SEED_IDS.visitId,
    rpNumber: 2,
    drugId: ONBOARDING_E2E_SEED_IDS.liquidDrugCode,
    dispensedDrug: '小児用シロップ水剤「E2E」',
    dispensedDrugCode: ONBOARDING_E2E_SEED_IDS.liquidDrugCode,
    amount: 30,
    usage: '1日3回 毎食後 水剤',
    days: 5,
    rpComment: 'よく振ってから服用',
    isIppoka: false,
    isCrushed: false,
    tokkanType: 'none',
    claimPreparation: true,
    claimManagement: true,
    claimDrugFee: true,
    isDiagnosticTest: false,
    isPicked: true,
    pickedAt: minutesAfter(seededAt, 1),
    pickedGs1Code: '01049999999000021727063010E2ELIQ',
    pickedGtin: '04999999900002',
    pickedLotNumber: 'E2ELIQ',
    pickedExpirationDate: '2027-06-30'
  };
  const ointmentPrescriptionItem: PrescriptionItem = {
    itemId: ONBOARDING_E2E_SEED_IDS.ointmentPrescriptionItemId,
    visitId: ONBOARDING_E2E_SEED_IDS.visitId,
    rpNumber: 3,
    drugId: ONBOARDING_E2E_SEED_IDS.ointmentDrugCode,
    dispensedDrug: 'E2E軟膏1% 外用',
    dispensedDrugCode: ONBOARDING_E2E_SEED_IDS.ointmentDrugCode,
    amount: 10,
    usage: '1日2回 患部に外用',
    days: 7,
    rpComment: '目に入らないよう注意',
    isIppoka: false,
    isCrushed: false,
    tokkanType: 'none',
    claimPreparation: true,
    claimManagement: true,
    claimDrugFee: true,
    isDiagnosticTest: false,
    isPicked: true,
    pickedAt: minutesAfter(seededAt, 1),
    pickedGs1Code: '01049999999000031727063010E2EOIN',
    pickedGtin: '04999999900003',
    pickedLotNumber: 'E2EOIN',
    pickedExpirationDate: '2027-06-30'
  };
  const prescriptionItems = [prescriptionItem, liquidPrescriptionItem, ointmentPrescriptionItem];

  const visit: Visit = {
    visitId: ONBOARDING_E2E_SEED_IDS.visitId,
    patientId: ONBOARDING_E2E_SEED_IDS.patientId,
    institutionId: 'e2e_clinic',
    institutionCode: '1312345',
    institutionName: '導入確認クリニック',
    departmentName: '内科',
    doctorId: 'e2e_doctor',
    doctorName: '導入 医師',
    prescriptionDate,
    dispensingDate: prescriptionDate,
    issueDate: seededIso,
    status: 'completed',
    claimLifecycle: {
      status: 'rebilling',
      exportedAt,
      exportedBy: 'E2E導入管理者',
      exportedFileName: 'E2E_ONBOARDING_TEST.uke',
      totalPoints,
      exportSnapshot: {
        createdAt: exportedAt,
        visitId: ONBOARDING_E2E_SEED_IDS.visitId,
        patientId: patient.patientId,
        patientName: patient.name,
        patientKana: patient.kana,
        patientBirthDate: patient.birthDate,
        patientGender: patient.gender,
        insuranceInfo: patient.insuranceInfo,
        publicInsurances: patient.publicInsurances,
        institutionCode: '1312345',
        institutionName: '導入確認クリニック',
        departmentName: '内科',
        doctorName: '導入 医師',
        prescriptionDate,
        dispensingDate: prescriptionDate,
        issueDate: seededIso,
        exportedFileName: 'E2E_ONBOARDING_TEST.uke',
        totalPoints,
        prescriptionItems: prescriptionItems.map((item) => ({
          itemId: item.itemId,
          rpNumber: item.rpNumber,
          drugId: item.drugId,
          dispensedDrug: item.dispensedDrug,
          dispensedDrugCode: item.dispensedDrugCode,
          amount: item.amount,
          days: item.days,
          usage: item.usage
        }))
      },
      returnedAt,
      returnReason: '導入E2E確認用の返戻シナリオ',
      rebillingAt,
      rebillingReason: '導入E2E確認用の再請求準備',
      history: [
        {
          type: 'exported',
          at: exportedAt,
          by: 'E2E導入管理者',
          fileName: 'E2E_ONBOARDING_TEST.uke',
          totalPoints,
          note: '導入E2E確認用UKE出力'
        },
        {
          type: 'returned',
          at: returnedAt,
          by: 'E2E導入管理者',
          note: '導入E2E確認用の返戻登録'
        },
        {
          type: 'rebilling',
          at: rebillingAt,
          by: 'E2E導入管理者',
          note: '導入E2E確認用の再請求準備'
        }
      ]
    }
  };

  const auditLogs: AuditLog[] = [
    makeAuditLog('drug_master_update', '導入E2Eテストデータ: 医薬品マスター更新済みとして確認', minutesAfter(seededAt, 5), 1),
    makeAuditLog('backup_drill', '導入E2Eテストデータ: 復旧テスト（訓練）: onboarding_e2e.json / 判定 テストOK / 移行診断 移行OK ID欠落0件・重複0件・文字化け疑い0件', minutesAfter(seededAt, 6), 2),
    makeAuditLog('backup_export', '導入E2Eテストデータ: 暗号化バックアップを書き出しました。', minutesAfter(seededAt, 7), 3),
    makeAuditLog('backup_external_storage', '導入E2Eテストデータ: バックアップ外部保存確認 / 保存先 E2E / 読取 確認済み / 上書き削除不可 確認済み / 判定 外部保存OK', minutesAfter(seededAt, 8), 4),
    makeAuditLog('claim_lifecycle', '導入E2Eテストデータ: 請求状態変更で再請求準備まで確認しました。', minutesAfter(seededAt, 9), 5),
    makeAuditLog('uke_export', '導入E2Eテストデータ: E2E_ONBOARDING_TEST.uke を出力済みとして確認しました。', minutesAfter(seededAt, 10), 6),
    makeAuditLog('print', '導入E2Eテストデータ: 調剤録・領収証の帳票印刷導線を確認しました。', minutesAfter(seededAt, 11), 7),
    makeDailyClosingAuditLog(seededAt, -1, 1, {
      completionRate: 75,
      closingBlockers: 4,
      inventoryShortages: 3,
      inventoryReceivings: 1,
      followUpDueCount: 2,
      supportCaseCount: 3
    }),
    makeDailyClosingAuditLog(seededAt, 0, 2, {
      completionRate: 92,
      closingBlockers: 1,
      inventoryShortages: 1,
      inventoryReceivings: 2,
      followUpDueCount: 1,
      supportCaseCount: 1
    })
  ];

  return {
    facilitySettings: {
      id: 'default',
      pharmacyName: '青空薬局 導入確認店',
      pharmacyKana: 'アオゾラヤッキョク ドウニュウカクニンテン',
      pharmacyCode: '1312345',
      pharmacyPostalCode: '100-0001',
      pharmacyAddress: '東京都千代田区1-1-1',
      pharmacyPhone: '03-0000-0000',
      pharmacyFax: '03-0000-0001',
      registrationNumber: 'T1234567890123',
      ownerName: '導入 法人',
      managerName: '導入 管理者',
      defaultPharmacistName: '導入 薬剤師',
      baseFeeCategory: '1',
      regionalSupportAddition: 'none',
      medicalDxAddition: false,
      postGenericAddition: 'none',
      genericDispensingReduction: false
    },
    users: [
      {
        userId: ONBOARDING_E2E_SEED_IDS.adminUserId,
        name: 'E2E導入管理者',
        role: 'admin',
        passwordHash: 'e2e-admin-password-hash',
        salt: 'e2e-admin-salt'
      },
      {
        userId: ONBOARDING_E2E_SEED_IDS.pharmacistUserId,
        name: '導入 薬剤師',
        role: 'pharmacist',
        passwordHash: 'e2e-pharmacist-password-hash',
        salt: 'e2e-pharmacist-salt'
      }
    ],
    patients: [patient],
    visits: [visit],
    drugs: [
      {
        code: ONBOARDING_E2E_SEED_IDS.drugCode,
        name: 'アムロジピン錠5mg「E2E」',
        yjCode: '2149040F1012',
        isGeneric: true,
        genericName: 'アムロジピンベシル酸塩',
        isAbolished: false,
        price: 10.1,
        stockQuantity: 100,
        isHighRisk: false
      },
      {
        code: ONBOARDING_E2E_SEED_IDS.liquidDrugCode,
        name: '小児用シロップ水剤「E2E」',
        yjCode: '5200000S1010',
        isGeneric: false,
        isAbolished: false,
        price: 8.2,
        stockQuantity: 50,
        isHighRisk: false
      },
      {
        code: ONBOARDING_E2E_SEED_IDS.ointmentDrugCode,
        name: 'E2E軟膏1% 外用',
        yjCode: '2600000M1010',
        isGeneric: false,
        isAbolished: false,
        price: 12.4,
        stockQuantity: 30,
        isHighRisk: false
      }
    ],
    prescriptionItems,
    auditLogs
  };
}

export async function seedOnboardingE2EData(
  db: OnboardingE2ESeedDatabase,
  seededAt: Date = new Date()
): Promise<OnboardingE2ESeedResult> {
  const records = buildOnboardingE2ESeedRecords(seededAt);

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
    patientId: ONBOARDING_E2E_SEED_IDS.patientId,
    visitId: ONBOARDING_E2E_SEED_IDS.visitId,
    auditLogIds: records.auditLogs.map((log) => log.logId),
    collections: [
      'facility_settings',
      'users',
      'patients',
      'visits',
      'drugs',
      'prescription_items',
      'audit_logs'
    ]
  };
}
