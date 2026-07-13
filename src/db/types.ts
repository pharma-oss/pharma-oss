import type { RxCollection, RxDatabase } from 'rxdb';

export type AiAssistMode = 'enabled' | 'limited' | 'disabled';

export interface FacilitySettings {
  id: string;
  pharmacyName?: string;
  pharmacyKana?: string;
  pharmacyCode?: string;
  pharmacyPostalCode?: string;
  pharmacyAddress?: string;
  pharmacyPhone?: string;
  pharmacyFax?: string;
  registrationNumber?: string;
  ownerName?: string;
  managerName?: string;
  defaultPharmacistName?: string;
  baseFeeCategory: '1' | '2' | '3_a' | '3_b' | '3_ro' | 'special' | 'special_b';
  regionalSupportAddition: '1' | '2' | '3' | '4' | '5' | 'none';
  medicalDxAddition: boolean;
  postGenericAddition?: '1' | '2' | '3' | 'none';
  genericDispensingReduction?: boolean;
  aiAssistMode?: AiAssistMode;
  officialFeeCodeOverrides?: Record<string, string>;
}

export interface Location {
  id: string;
  part1: string;
  part2: string;
  part3: string;
  displayText: string;
}


export interface DrugStock {
  id: string;
  drugCode: string;
  janCode?: string;
  lotNumber?: string;
  expirationDate?: string;
  quantity: number;
  arrivalDate?: string;
  supplier?: string;
}

export interface Drug {
  code: string;
  name: string;
  yjCode?: string;
  isGeneric: boolean;
  genericName?: string;
  isAbolished?: boolean;
  price?: number;
  stockQuantity?: number;
  location?: string;
  isNarcotic?: boolean;
  isPsychotropic?: boolean;
  isPoisonous?: boolean;
  isHighRisk?: boolean;
  documentUrl?: string;
}

export interface PublicInsurance {
  provider: string;
  recipient: string;
  burdenRatio?: number;
  startDate?: string;
  endDate?: string;
  monthlyLimitYen?: number;
}

export type InsuranceEligibilityStatus = 'unchecked' | 'valid' | 'warning' | 'invalid' | 'unavailable';

export interface VisitElectronicPrescriptionLink {
  prescriptionId: string;
  documentKind: 'electronic_prescription' | 'prescription_information';
  validUntil: string;
  signatureStatus: 'valid' | 'invalid' | 'not_checked' | 'not_applicable';
  signatureHpkiVerification?: VisitElectronicPrescriptionHpkiVerification;
  duplicateCheckStatus: 'not_checked' | 'passed' | 'warning' | 'blocked';
  integrityHash: string;
  paperOriginalConfirmed?: boolean;
  supplementaryInformation?: VisitElectronicPrescriptionSupplementaryInformation;
}

export interface VisitElectronicPrescriptionHpkiVerification {
  status: 'valid' | 'invalid' | 'expired' | 'revoked' | 'not_checked' | 'not_applicable';
  signerRole?: 'doctor' | 'pharmacist' | 'unknown';
  certificateSerialHash?: string;
  certificateIssuerHash?: string;
  certificateNotAfter?: string;
  revocationCheckedAt?: string;
  policyOid?: string;
}

export interface VisitElectronicPrescriptionLaboratoryResult {
  testName: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  measuredAt?: string;
  comment?: string;
}

export interface VisitElectronicPrescriptionSupplementaryInformation {
  prescriptionComments: string[];
  laboratoryResults: VisitElectronicPrescriptionLaboratoryResult[];
  narcoticAdministration?: {
    isNarcoticPrescription: boolean;
    recordPresent: boolean;
    displayText?: string;
  };
}

export interface VisitElectronicPrescription {
  prescriptionId: string;
  linkedPrescriptions?: VisitElectronicPrescriptionLink[];
  documentKind: 'electronic_prescription' | 'prescription_information';
  sourceMode: 'connector';
  receivedAt: string;
  appliedAt: string;
  validUntil: string;
  signatureStatus: 'valid' | 'invalid' | 'not_checked' | 'not_applicable';
  signatureHpkiVerification?: VisitElectronicPrescriptionHpkiVerification;
  duplicateCheckStatus: 'not_checked' | 'passed' | 'warning' | 'blocked';
  integrityHash: string;
  paperOriginalConfirmed?: boolean;
  refill?: {
    totalCount: number;
    currentCount: number;
    previousDispensingDate?: string;
    nextDispensingDate?: string;
  };
  supplementaryInformation?: VisitElectronicPrescriptionSupplementaryInformation;
  receptionStatus: 'accepted' | 'cancel_pending' | 'cancelled';
  dispensingResultStatus: 'pending' | 'submitted' | 'registered' | 'failed' | 'cancelled';
  dispensingResultEverRegistered?: boolean;
  dispensingResultId?: string;
  dispensingResultUpdatedAt?: string;
  dispensingInformationFile?: {
    signatureStatus: 'valid' | 'invalid' | 'present' | 'unsigned' | 'not_checked';
    signedAt?: string;
    fileHash?: string;
    hpkiVerification?: VisitElectronicPrescriptionHpkiVerification;
  };
}

export interface VisitPharmacyDeviceHandoff {
  connectorKind: 'nsips_gateway' | 'vendor_api';
  interfaceVersion: string;
  transferId: string;
  payloadHash: string;
  status: 'accepted' | 'duplicate' | 'cancelled';
  lastOperation: 'submit' | 'replace' | 'cancel';
  submittedAt: string;
  updatedAt: string;
}

export type TracingReportStatus = 'draft' | 'ready' | 'sent' | 'closed';

export interface VisitTracingReport {
  reportId: string;
  status: TracingReportStatus;
  reportDate: string;
  destinationInstitution?: string;
  destinationDepartment?: string;
  destinationDoctor?: string;
  subject: string;
  medicationSummary?: string;
  patientCondition?: string;
  assessment?: string;
  proposal?: string;
  followUpPlan?: string;
  sentAt?: string;
  sentBy?: string;
  responseSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisitInitialQuestionnaire {
  sourceType: 'camera' | 'image' | 'manual';
  capturedAt: string;
  imageDataUrl?: string;
  imageOriginalName?: string;
  imageByteSize?: number;
  imageCompressedAt?: string;
  rawText?: string;
  allergies?: string;
  adverseDrugReactions?: string;
  medicalHistory?: string;
  currentSymptoms?: string;
  pregnancyLactation?: string;
  lifestyle?: string;
  notes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface VisitMynaSpecificHealthCheckup {
  checkedAt?: string;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
  systolicBloodPressure?: number;
  diastolicBloodPressure?: number;
  hba1c?: string;
  ldlCholesterol?: string;
  egfr?: string;
  findings?: string[];
  rawSummary?: string;
}

export interface VisitMynaMedicationHistoryItem {
  dispensedAt?: string;
  drugName: string;
  dosage?: string;
  usage?: string;
  days?: number;
  institutionName?: string;
  pharmacyName?: string;
  rawSummary?: string;
}

export interface VisitMynaClinicalImport {
  importId: string;
  importedAt: string;
  readerSource: 'bridge' | 'mock';
  readerCheckedAt: string;
  specificHealthCheckups?: VisitMynaSpecificHealthCheckup[];
  medicationHistory?: VisitMynaMedicationHistoryItem[];
  note?: string;
}

export interface VisitCareCommunication {
  tracingReports?: VisitTracingReport[];
  mynaClinicalImports?: VisitMynaClinicalImport[];
  updatedAt?: string;
}

export interface Patient {
  patientId: string;
  name: string;
  kana: string;
  birthDate: string;
  gender?: 'male' | 'female' | 'other';
  insuranceInfo?: {
    provider?: string;
    number?: string;
    burdenRatio?: number;
    insuranceType?: string;
    relationship?: string;
    validFrom?: string;
    validTo?: string;
    eligibilityCheckedAt?: string;
    eligibilityStatus?: InsuranceEligibilityStatus;
  };
  publicInsurances?: PublicInsurance[];
}

export interface Visit {
  visitId: string;
  patientId: string;
  institutionId?: string;
  institutionCode?: string;
  institutionName?: string;
  departmentName?: string;
  doctorId?: string;
  doctorName?: string;
  prescriptionDate?: string;
  dispensingDate?: string;
  issueDate: string;
  status: 'waiting' | 'processing' | 'completed' | 'cancelled';
  electronicPrescription?: VisitElectronicPrescription;
  pharmacyDeviceHandoff?: VisitPharmacyDeviceHandoff;
  initialQuestionnaire?: VisitInitialQuestionnaire;
  careCommunication?: VisitCareCommunication;
  claimOptions?: {
    drugFeeOnly?: boolean;
    disabledFeeCodes?: string[];
    disabledFeeRationales?: { [feeCode: string]: string };
    specialPublicExpenseRecord?: {
      category: string;
      branch: string;
      supplementalCode?: string;
    };
    officialSupplementalRecords?: {
      payerCategory: string;
      confirmationCategory: string;
      insurerNumber?: string;
      symbol?: string;
      number?: string;
      branch?: string;
      recipientNumber?: string;
      reserve?: string;
    }[];
    officialDispensingDateRecords?: {
      payerCategory: string;
      days?: Record<string, string | number>;
    }[];
    officialCopaymentRecords?: {
      category: string;
      dailyAmounts?: Record<string, string | number>;
    }[];
    officialSplitDispensingRecords?: {
      doctorNumber?: string;
      prescriptionDate?: string;
      dispensingDate?: string;
      receptionCount?: number;
      splitCount: number;
      insuranceTargetPoints?: number;
      insuranceAfterSplitPoints?: number;
      publicTargetPoints?: Array<number | undefined>;
      publicAfterSplitPoints?: Array<number | undefined>;
    }[];
  };
  claimLifecycle?: {
    status?: 'draft' | 'exported' | 'accepted' | 'returned' | 'rebilling' | 'closed';
    exportedAt?: string;
    exportedBy?: string;
    exportedFileName?: string;
    lockedAt?: string;
    totalPoints?: number;
    exportSnapshot?: {
      createdAt: string;
      visitId: string;
      patientId: string;
      patientName: string;
      patientKana?: string;
      patientBirthDate: string;
      patientGender?: string;
      insuranceInfo?: {
        provider?: string;
        number?: string;
          burdenRatio?: number;
          insuranceType?: string;
          relationship?: string;
          validFrom?: string;
          validTo?: string;
          eligibilityCheckedAt?: string;
          eligibilityStatus?: InsuranceEligibilityStatus;
        };
      publicInsurances?: PublicInsurance[];
      institutionCode?: string;
      institutionName?: string;
      departmentName?: string;
      doctorName?: string;
      prescriptionDate?: string;
      dispensingDate?: string;
      issueDate: string;
      exportedFileName?: string;
      totalPoints: number;
      prescriptionItems: {
        itemId: string;
        rpNumber?: number;
        drugId: string;
        dispensedDrug?: string;
        dispensedDrugCode?: string;
        amount: number;
        days: number;
        usage?: string;
      }[];
    };
    acceptedAt?: string;
    acceptedBy?: string;
    acceptanceReceiptNumber?: string;
    returnedAt?: string;
    returnReason?: string;
    rebillingAt?: string;
    rebillingReason?: string;
    closedAt?: string;
    closedBy?: string;
    history?: {
      type: 'exported' | 'accepted' | 'returned' | 'rebilling' | 'closed';
      at: string;
      by?: string;
      note?: string;
      totalPoints?: number;
      fileName?: string;
    }[];
  };
  followUp?: {
    status?: 'open' | 'completed' | 'dismissed';
    reasonFlags?: string[];
    summary?: string;
    dueDate?: string;
    contactMethod?: 'phone' | 'sms' | 'visit' | 'other';
    nextAction?: string;
    riskScore?: number;
    reminderAt?: string;
    reminderReason?: string;
    contactAttempts?: {
      at: string;
      by?: string;
      method: 'phone' | 'sms' | 'visit' | 'other';
      outcome: 'completed' | 'no_answer' | 'rescheduled' | 'dismissed';
      note: string;
      nextAction?: string;
      dueDate?: string;
    }[];
    completedAt?: string;
    completedBy?: string;
    completedNote?: string;
    updatedAt?: string;
  };
}

export interface PrescriptionItem {
  itemId: string;
  visitId: string;
  rpNumber?: number;
  drugId: string;
  dispensedDrug?: string;
  dispensedDrugCode?: string;
  prescribedDrugCodeStatus?: 'active' | 'abolished' | 'unknown';
  prescribedDrugCodeAbolishedAt?: string;
  electronicSourceDrugName?: string;
  electronicMasterDrugName?: string;
  electronicDrugNameVerificationStatus?: 'matched' | 'mismatch' | 'not_checked';
  electronicDrugNameVerificationCheckedAt?: string;
  unitCode?: string;
  unitText?: string;
  electronicUnitConversion?: {
    conversionFactor: string;
    masterUnitCode?: string;
    masterUnitText?: string;
    prescribedAmount: string;
    prescribedUnitCode?: string;
    prescribedUnitText: string;
  };
  electronicUsageCode?: string;
  electronicUsageFallbackText?: string;
  electronicUsageSupplementText?: string;
  changeReason?: string;
  amount: number;
  usage?: string;
  days: number;
  rpComment?: string;
  dosageCategory?: 'internal' | 'as_needed' | 'external' | 'internal_drop' | 'injection';
  dosageCategorySource?: 'auto' | 'manual';
  isIppoka?: boolean;
  isCrushed?: boolean;
  tokkanType?: 'none' | '1' | '3_i';
  receiptRemark?: string;
  billingAgentGroupKey?: string;
  billingAgentGroupReason?: string;
  claimPreparation?: boolean;
  claimManagement?: boolean;
  claimDrugFee?: boolean;
  isDiagnosticTest?: boolean;
  isPicked?: boolean;
  pickedAt?: string;
  pickedGs1Code?: string;
  pickedGtin?: string;
  pickedLotNumber?: string;
  pickedExpirationDate?: string;
  pickedStockId?: string;
  shortageQuantity?: number;
  shortageNote?: string;
  shortageRecordedAt?: string;
}

export interface SoapEntry {
  type: 'S' | 'O' | 'A' | 'P';
  text: string;
}

export interface SoapProblem {
  id: string;
  title: string;
  entries: SoapEntry[];
}

export interface SoapStructuredAssessment {
  adherence?: 'unknown' | 'good' | 'partial' | 'poor';
  leftoverMedicine?: 'unknown' | 'none' | 'has';
  adverseEvent?: 'unknown' | 'none' | 'has';
  genericChangePreference?: 'unknown' | 'accepted' | 'declined' | 'consult';
  medicationNotebook?: 'unknown' | 'issued' | 'not_issued';
}

export interface SoapRecord {
  soapId: string;
  visitId: string;
  problems: SoapProblem[];
  structuredAssessment?: SoapStructuredAssessment;
  authorId: string;
  updatedAt?: string;
}

export interface MedicationGuidance {
  id: string;
  drugCode: string;
  drugName: string;
  entries: SoapEntry[];
  updatedAt: string;
}

export type PatientMedicationInfoTemplateStatus = 'draft' | 'approved' | 'needs_review' | 'retired';

export interface PatientMedicationInfoTemplate {
  templateId: string;
  drugCode: string;
  drugName: string;
  genericName?: string;
  status: PatientMedicationInfoTemplateStatus;
  // Legacy optional fields are kept for existing local data. Patient-facing drug info prints only sideEffectText and counselingText.
  effectText?: string;
  sideEffectText?: string;
  interactionText?: string;
  storageText?: string;
  counselingText?: string;
  sourceType?: 'pmda_insert' | 'pmda_patient_guide' | 'pharmacy_authored' | 'licensed' | 'other';
  sourceUrl?: string;
  sourceRevisionDate?: string;
  sourceHash?: string;
  reviewerId?: string;
  approvedAt?: string;
  needsReviewReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface User {
  userId: string;
  name: string;
  role: 'admin' | 'pharmacist' | 'clerk';
  passwordHash?: string;       // PBKDF2-SHA-256 hashed password
  salt?: string;               // Random salt generated per user
  passkeyCredentialId?: string; // Hex/Base64 of registered WebAuthn credential ID
  passkeyPublicKey?: string;    // Hex/Base64 of registered WebAuthn public key
}

export interface Alert {
  alertId: string;
  patientId: string;
  type: 'allergy' | 'side_effect' | 'chronic_disease';
  content: string;
  status?: 'active' | 'resolved';
}

export interface Intervention {
  interventionId: string;
  visitId: string;
  beforeSnapshot?: string;
  afterSnapshot?: string;
  reason: string;
  inquiryStatus?: 'none' | 'pending' | 'completed' | 'cancelled';
  inquiryMethod?: 'phone' | 'fax' | 'in_person' | 'other';
  inquiryDoctor?: string;
  inquiryResult?: string;
  responseDueDate?: string;
  contactedAt?: string;
  respondedAt?: string;
  handledBy?: string;
  note?: string;
  patientConsented?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditLog {
  logId: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: 'admin' | 'pharmacist' | 'clerk';
  actionType: AuditActionType;
  patientId?: string;
  patientName?: string;
  details: string;
  /**
   * ハッシュチェーンは端末ごとに独立している(メイン端末は全端末分のログを集約保持するため、
   * 単一チェーンでは検証が壊れる)。メイン端末='hub-local'、サテライト=発行された端末ID、
   * 同期無効(standalone)の既存ログ=未設定(レガシーチェーンとして検証)。
   */
  terminalId?: string;
  previousHash?: string;
  integrityHash?: string;
}

export type AuditActionType =
  | 'login'
  | 'prescription_ocr'
  | 'prescription_edit'
  | 'billing_toggle'
  | 'claim_lifecycle'
  | 'daily_closing_approval'
  | 'daily_closing_kpi_action'
  | 'session_lock'
  | 'print'
  | 'uke_export'
  | 'stock_update'
  | 'user_switch'
  | 'facility_settings_update'
  | 'drug_master_update'
  | 'patient_medication_info_template'
  | 'follow_up_record'
  | 'ai_suggestion_review'
  | 'electronic_prescription'
  | 'external_device_handoff'
  | 'staff_create'
  | 'staff_delete'
  | 'staff_credential_recovery'
  | 'passkey_register'
  | 'audit_export'
  | 'audit_retention_approval'
  | 'backup_export'
  | 'backup_schedule_update'
  | 'backup_external_storage'
  | 'backup_external_transfer_manifest'
  | 'backup_drill'
  | 'backup_import'
  | 'official_spec_review';


export interface DrugInfo {
  id: string;
  drugName: string;
  genericName?: string;
  /**
   * 支払基金/PMDA添付文書「10. 相互作用」章由来。severityは10.1併用禁忌='danger'、
   * 10.2併用注意='warning'に対応する。sourceUrl/fetchedAtで出典を追跡する。
   */
  contraindications?: {
    targetDrugs: string[];
    severity: 'danger' | 'warning';
    clinicalEffect: string;
    mechanism?: string;
    sourceUrl: string;
    fetchedAt: string;
    /** 取得時点の添付文書本文のSHA-256。verifyOfficialDrugInteractionLabels.tsが
     *  再取得時に「内容が同じなのにデータが食い違う」ケースと「PMDA側の改訂」を区別するために使う */
    contentSha256?: string;
  }[];
  usageWarnings?: {
    condition: string;
    message: string;
    severity?: string;
    type?: string;
  }[];
  /**
   * PMDA添付文書「2. 禁忌（次の患者には投与しないこと）」章由来。他剤との併用ではなく
   * 患者の疾患・妊娠・肝腎機能等の状態に基づく絶対禁忌。薬剤名だけの禁忌（10.1併用禁忌と重複）と
   * 本剤への過敏症既往（アレルギー確認と重複）は抽出時に除外済み。常にseverity='danger'相当として扱う。
   */
  contraindicatedConditions?: {
    conditionText: string;
    reason?: string;
    sourceUrl: string;
    fetchedAt: string;
    contentSha256?: string;
  }[];
}

export type PharmacyDatabaseCollections = {
  patients: RxCollection<Patient>;
  visits: RxCollection<Visit>;
  prescription_items: RxCollection<PrescriptionItem>;
  soap_records: RxCollection<SoapRecord>;
  users: RxCollection<User>;
  alerts: RxCollection<Alert>;
  interventions: RxCollection<Intervention>;
  drugs: RxCollection<Drug>;
  drug_stocks: RxCollection<DrugStock>;
  facility_settings: RxCollection<FacilitySettings>;
  locations: RxCollection<Location>;
  medication_guidances: RxCollection<MedicationGuidance>;
  patient_medication_info_templates: RxCollection<PatientMedicationInfoTemplate>;
  audit_logs: RxCollection<AuditLog>;
};

export type PharmacyDatabase = RxDatabase<PharmacyDatabaseCollections>;
