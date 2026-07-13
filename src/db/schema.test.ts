import { test, describe } from 'node:test';
import assert from 'node:assert';
import Ajv from 'ajv';
import {
  PATIENT_SCHEMA,
  VISIT_SCHEMA,
  PRESCRIPTION_ITEM_SCHEMA,
  SOAP_RECORD_SCHEMA,
  PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA,
  USER_SCHEMA,
  ALERT_SCHEMA,
  INTERVENTION_SCHEMA,
  DRUG_STOCK_SCHEMA,
  AUDIT_LOG_SCHEMA
} from './schema.ts';

const ajv = new Ajv({ strict: false });
ajv.addFormat('date', /^\d{4}-\d{2}-\d{2}$/);
ajv.addFormat(
  'date-time',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
);

// Helper to validate and return errors
function getErrors(schema: any, data: any) {
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return valid ? null : validate.errors;
}

describe('Schema Validation', () => {
  describe('PATIENT_SCHEMA', () => {
    test('should validate a correct patient object', () => {
      const validPatient = {
        patientId: 'pt_123',
        name: '山田 太郎',
        kana: 'ヤマダ タロウ',
        birthDate: '1980-01-01',
        gender: 'male',
        insuranceInfo: {
          provider: '協会けんぽ',
          number: '123456',
          burdenRatio: 30,
          insuranceType: '社保',
          relationship: '本人',
          validFrom: '2026-04-01',
          validTo: '2026-12-31',
          eligibilityCheckedAt: '2026-06-15',
          eligibilityStatus: 'valid'
        },
        publicInsurances: [
          {
            provider: '51136018',
            recipient: '1234567',
            burdenRatio: 10,
            startDate: '2026-04-01',
            endDate: '2026-12-31',
            monthlyLimitYen: 5000
          }
        ]
      };
      const errors = getErrors(PATIENT_SCHEMA, validPatient);
      assert.strictEqual(errors, null);
    });

    test('should fail if required fields are missing', () => {
      const invalidPatient = {
        patientId: 'pt_123',
        // name is missing
        kana: 'ヤマダ タロウ',
        birthDate: '1980-01-01'
      };
      const errors = getErrors(PATIENT_SCHEMA, invalidPatient);
      assert.notStrictEqual(errors, null);
    });

    test('should fail if enum value is incorrect', () => {
      const invalidPatient = {
        patientId: 'pt_123',
        name: '山田 太郎',
        kana: 'ヤマダ タロウ',
        birthDate: '1980-01-01',
        gender: 'invalid_gender'
      };
      const errors = getErrors(PATIENT_SCHEMA, invalidPatient);
      assert.notStrictEqual(errors, null);
    });
  });

  describe('VISIT_SCHEMA', () => {
    test('should validate a correct visit object', () => {
      const validVisit = {
        visitId: 'v_123',
        patientId: 'pt_123',
        institutionCode: '1312345670',
        institutionName: '青山内科クリニック',
        departmentName: '内科',
        doctorName: '青山 一郎',
        prescriptionDate: '2023-10-01',
        dispensingDate: '2023-10-01',
        issueDate: '2023-10-01T10:00:00Z',
        status: 'waiting'
      };
      const errors = getErrors(VISIT_SCHEMA, validVisit);
      assert.strictEqual(errors, null);
    });

    test('should fail with invalid status', () => {
      const invalidVisit = {
        visitId: 'v_123',
        patientId: 'pt_123',
        issueDate: '2023-10-01T10:00:00Z',
        status: 'unknown_status'
      };
      const errors = getErrors(VISIT_SCHEMA, invalidVisit);
      assert.notStrictEqual(errors, null);
    });

    test('should validate follow-up completion state on a visit', () => {
      const visitWithFollowUp = {
        visitId: 'v_123',
        patientId: 'pt_123',
        issueDate: '2026-06-14T09:00:00Z',
        status: 'completed',
        followUp: {
          status: 'completed',
          reasonFlags: ['重点フォロー薬', '長期処方'],
          summary: '高リスク薬の服薬状況確認',
          contactMethod: 'phone',
          nextAction: '3日後に副作用確認',
          riskScore: 55,
          reminderAt: '2026-06-17T10:00:00Z',
          reminderReason: '不在のため翌日再架電',
          contactAttempts: [{
            at: '2026-06-14T09:30:00Z',
            by: '薬剤師 一郎',
            method: 'phone',
            outcome: 'rescheduled',
            note: '電話したが不在。翌日再架電。',
            nextAction: '翌日再架電',
            dueDate: '2026-06-15'
          }, {
            at: '2026-06-14T10:00:00Z',
            by: '薬剤師 一郎',
            method: 'phone',
            outcome: 'completed',
            note: '電話で副作用なしを確認',
            nextAction: '3日後に副作用確認',
            dueDate: '2026-06-17'
          }],
          completedAt: '2026-06-14T10:00:00Z',
          completedBy: '薬剤師 一郎',
          completedNote: '電話で副作用なしを確認',
          updatedAt: '2026-06-14T10:00:00Z'
        }
      };
      const errors = getErrors(VISIT_SCHEMA, visitWithFollowUp);
      assert.strictEqual(errors, null);
      assert.deepStrictEqual(VISIT_SCHEMA.indexes, ['patientId', 'status']);
      assert.ok(VISIT_SCHEMA.encrypted?.includes('followUp'));
    });

    test('should validate confirmed special public expense SN claim option on a visit', () => {
      const visitWithSpecialPublicExpense = {
        visitId: 'v_sn',
        patientId: 'pt_123',
        issueDate: '2026-06-14T09:00:00Z',
        status: 'completed',
        claimOptions: {
          specialPublicExpenseRecord: {
            category: '1',
            branch: '01',
            supplementalCode: '46'
          }
        }
      };

      const errors = getErrors(VISIT_SCHEMA, visitWithSpecialPublicExpense);
      assert.strictEqual(errors, null);
      assert.strictEqual(VISIT_SCHEMA.version, 20);
    });

    test('should validate initial questionnaire and tracing report records on a visit', () => {
      const visitWithCareCommunication = {
        visitId: 'v_questionnaire',
        patientId: 'pt_123',
        issueDate: '2026-07-01T09:00:00Z',
        status: 'processing',
        initialQuestionnaire: {
          sourceType: 'camera',
          capturedAt: '2026-07-01T09:00:00Z',
          imageDataUrl: 'data:image/jpeg;base64,' + 'a'.repeat(1200),
          imageOriginalName: 'questionnaire.jpg',
          imageByteSize: 900,
          imageCompressedAt: '2026-07-01T09:00:02Z',
          rawText: 'アレルギー: ペニシリン\n副作用: 眠気',
          allergies: 'ペニシリン',
          adverseDrugReactions: '眠気',
          medicalHistory: '高血圧',
          currentSymptoms: '咳',
          pregnancyLactation: '該当なし',
          lifestyle: '飲酒なし',
          notes: '薬剤師確認済み',
          reviewedAt: '2026-07-01T09:05:00Z',
          reviewedBy: '薬剤師 一郎'
        },
        careCommunication: {
          tracingReports: [{
            reportId: 'tr_1',
            status: 'sent',
            reportDate: '2026-07-01',
            destinationInstitution: '青山内科クリニック',
            destinationDepartment: '内科',
            destinationDoctor: '青山 一郎',
            subject: '服薬状況のご報告',
            medicationSummary: '残薬あり',
            patientCondition: '眠気の訴えあり',
            assessment: '副作用可能性を確認',
            proposal: '用量調整をご検討ください',
            followUpPlan: '3日後に電話確認',
            sentAt: '2026-07-01T09:10:00Z',
            sentBy: '薬剤師 一郎',
            responseSummary: '継続指示',
            createdAt: '2026-07-01T09:05:00Z',
            updatedAt: '2026-07-01T09:10:00Z'
          }],
          mynaClinicalImports: [{
            importId: 'myna_1',
            importedAt: '2026-07-01T09:12:00Z',
            readerSource: 'bridge',
            readerCheckedAt: '2026-07-01T09:12:00Z',
            specificHealthCheckups: [{
              checkedAt: '2026-04-10',
              heightCm: 170.2,
              weightKg: 68.4,
              bmi: 23.6,
              systolicBloodPressure: 128,
              diastolicBloodPressure: 78,
              hba1c: '5.8',
              ldlCholesterol: '110',
              egfr: '72.4',
              findings: ['腎機能確認'],
              rawSummary: '特定健診概要'
            }],
            medicationHistory: [{
              dispensedAt: '2026-06-01',
              drugName: 'アムロジピン錠5mg',
              dosage: '1錠',
              usage: '1日1回 朝食後',
              days: 28,
              institutionName: '青山内科クリニック',
              pharmacyName: 'テスト薬局',
              rawSummary: '薬剤履歴概要'
            }],
            note: 'マイナから取込'
          }],
          updatedAt: '2026-07-01T09:10:00Z'
        }
      };

      const errors = getErrors(VISIT_SCHEMA, visitWithCareCommunication);
      assert.strictEqual(errors, null);
      assert.ok(VISIT_SCHEMA.encrypted?.includes('initialQuestionnaire'));
      assert.ok(VISIT_SCHEMA.encrypted?.includes('careCommunication'));
    });

    test('should validate electronic prescription provenance and lifecycle on a visit', () => {
      const visitWithElectronicPrescription = {
        visitId: 'v_ep',
        patientId: 'pt_123',
        issueDate: '2026-06-30T09:00:00Z',
        status: 'processing',
        electronicPrescription: {
          prescriptionId: 'EP-2026-001',
          linkedPrescriptions: [
            {
              prescriptionId: 'EP-2026-001',
              documentKind: 'electronic_prescription',
              validUntil: '2026-07-03',
              signatureStatus: 'valid',
              signatureHpkiVerification: {
                status: 'valid',
                signerRole: 'doctor',
                certificateSerialHash: 'd'.repeat(64),
                certificateIssuerHash: 'e'.repeat(64),
                certificateNotAfter: '2027-06-30',
                revocationCheckedAt: '2026-06-30T09:00:00Z'
              },
              duplicateCheckStatus: 'passed',
              integrityHash: 'a'.repeat(64),
              supplementaryInformation: {
                prescriptionComments: ['重複処方を確認済み'],
                laboratoryResults: [{ testName: 'eGFR', value: '58.2', unit: 'mL/min/1.73m2' }],
                narcoticAdministration: {
                  isNarcoticPrescription: true,
                  recordPresent: true,
                  displayText: '麻薬施用者情報確認済み'
                }
              }
            },
            {
              prescriptionId: 'EP-2026-002',
              documentKind: 'prescription_information',
              validUntil: '2026-07-03',
              signatureStatus: 'not_applicable',
              duplicateCheckStatus: 'warning',
              integrityHash: 'b'.repeat(64),
              paperOriginalConfirmed: true
            }
          ],
          documentKind: 'electronic_prescription',
          sourceMode: 'connector',
          receivedAt: '2026-06-30T08:55:00Z',
          appliedAt: '2026-06-30T09:00:00Z',
          validUntil: '2026-07-03',
          signatureStatus: 'valid',
          signatureHpkiVerification: {
            status: 'valid',
            signerRole: 'doctor',
            certificateSerialHash: 'd'.repeat(64),
            certificateIssuerHash: 'e'.repeat(64),
            certificateNotAfter: '2027-06-30',
            revocationCheckedAt: '2026-06-30T09:00:00Z'
          },
          duplicateCheckStatus: 'passed',
          integrityHash: 'a'.repeat(64),
          refill: {
            totalCount: 3,
            currentCount: 2,
            previousDispensingDate: '2026-05-30',
            nextDispensingDate: '2026-07-30'
          },
          supplementaryInformation: {
            prescriptionComments: ['重複処方を確認済み'],
            laboratoryResults: [{ testName: 'eGFR', value: '58.2', unit: 'mL/min/1.73m2' }],
            narcoticAdministration: {
              isNarcoticPrescription: true,
              recordPresent: true,
              displayText: '麻薬施用者情報確認済み'
            }
          },
          receptionStatus: 'accepted',
          dispensingResultStatus: 'pending',
          dispensingResultEverRegistered: false,
          dispensingInformationFile: {
            signatureStatus: 'present',
            signedAt: '2026-06-30T09:10:00Z',
            fileHash: 'c'.repeat(64),
            hpkiVerification: {
              status: 'valid',
              signerRole: 'pharmacist',
              certificateSerialHash: '1'.repeat(64),
              certificateIssuerHash: '2'.repeat(64),
              certificateNotAfter: '2027-06-30',
              revocationCheckedAt: '2026-06-30T09:10:00Z',
              policyOid: '1.2.392.100495'
            }
          }
        }
      };

      const errors = getErrors(VISIT_SCHEMA, visitWithElectronicPrescription);
      assert.strictEqual(errors, null);
      assert.ok(VISIT_SCHEMA.encrypted?.includes('electronicPrescription'));
    });

    test('should validate encrypted pharmacy device handoff lifecycle on a visit', () => {
      const visitWithHandoff = {
        visitId: 'v_device',
        patientId: 'pt_123',
        issueDate: '2026-06-30T09:00:00Z',
        status: 'processing',
        pharmacyDeviceHandoff: {
          connectorKind: 'nsips_gateway',
          interfaceVersion: '1.07.01',
          transferId: 'transfer-001',
          payloadHash: 'a'.repeat(64),
          status: 'accepted',
          lastOperation: 'submit',
          submittedAt: '2026-06-30T09:10:00Z',
          updatedAt: '2026-06-30T09:10:00Z'
        }
      };

      const errors = getErrors(VISIT_SCHEMA, visitWithHandoff);
      assert.strictEqual(errors, null);
      assert.ok(VISIT_SCHEMA.encrypted?.includes('pharmacyDeviceHandoff'));
    });

    test('should validate claim lifecycle lock and rebilling history on a visit', () => {
      const visitWithClaimLifecycle = {
        visitId: 'v_claim',
        patientId: 'pt_123',
        issueDate: '2026-06-14T09:00:00Z',
        status: 'completed',
        claimLifecycle: {
          status: 'rebilling',
          exportedAt: '2026-06-14T10:00:00Z',
          exportedBy: '薬剤師 一郎',
          exportedFileName: 'RECEIPT_claim.uke',
          totalPoints: 147,
          exportSnapshot: {
            createdAt: '2026-06-14T10:00:00Z',
            visitId: 'v_claim',
            patientId: 'pt_123',
            patientName: '山田 太郎',
            patientKana: 'ヤマダ タロウ',
            patientBirthDate: '1980-01-02',
            patientGender: 'male',
            insuranceInfo: {
              provider: '06123456',
              number: '記号123',
              burdenRatio: 30
            },
            publicInsurances: [],
            issueDate: '2026-06-14T09:00:00Z',
            exportedFileName: 'RECEIPT_claim.uke',
            totalPoints: 147,
            prescriptionItems: [
              {
                itemId: 'item_1',
                drugId: 'drug_1',
                amount: 1,
                days: 7,
                usage: '1日1回朝食後'
              }
            ]
          },
          returnedAt: '2026-06-15T10:00:00Z',
          returnReason: '保険番号相違',
          rebillingAt: '2026-06-15T11:00:00Z',
          rebillingReason: '保険番号修正後の再請求',
          history: [
            {
              type: 'exported',
              at: '2026-06-14T10:00:00Z',
              by: '薬剤師 一郎',
              fileName: 'RECEIPT_claim.uke',
              totalPoints: 147
            },
            {
              type: 'returned',
              at: '2026-06-15T10:00:00Z',
              by: '薬剤師 二郎',
              note: '保険番号相違'
            },
            {
              type: 'rebilling',
              at: '2026-06-15T11:00:00Z',
              by: '薬剤師 二郎',
              note: '保険番号修正後の再請求'
            }
          ]
        }
      };

      const errors = getErrors(VISIT_SCHEMA, visitWithClaimLifecycle);
      assert.strictEqual(errors, null);
      assert.ok(VISIT_SCHEMA.encrypted?.includes('claimLifecycle'));
    });

    test('should validate accepted online claim result metadata on a visit', () => {
      const visitWithAcceptedClaim = {
        visitId: 'v_claim_accepted',
        patientId: 'pt_123',
        issueDate: '2026-06-14T09:00:00Z',
        status: 'completed',
        claimLifecycle: {
          status: 'accepted',
          exportedAt: '2026-06-14T10:00:00Z',
          exportedFileName: 'MONTHLY_CLAIM_20260614.uke',
          acceptedAt: '2026-06-14T11:00:00Z',
          acceptedBy: '管理者',
          acceptanceReceiptNumber: 'ACC-001',
          lockedAt: '2026-06-14T10:00:00Z',
          totalPoints: 147,
          history: [
            {
              type: 'accepted',
              at: '2026-06-14T11:00:00Z',
              by: '管理者',
              note: 'オンライン請求の受付結果を取り込みました。'
            }
          ]
        }
      };

      const errors = getErrors(VISIT_SCHEMA, visitWithAcceptedClaim);
      assert.strictEqual(errors, null);
    });
  });

  describe('PRESCRIPTION_ITEM_SCHEMA', () => {
    test('should validate a correct prescription item', () => {
      const validItem = {
        itemId: 'item_1',
        visitId: 'v_123',
        rpNumber: 1,
        drugId: 'drug_456',
        dispensedDrug: 'アムロジピン錠5mg「サワイ」',
        dispensedDrugCode: '2171022F4010',
        prescribedDrugCodeStatus: 'active',
        electronicSourceDrugName: 'アムロジピン錠5mg「サワイ」',
        electronicMasterDrugName: 'アムロジピン錠5mg「サワイ」',
        electronicDrugNameVerificationStatus: 'matched',
        electronicDrugNameVerificationCheckedAt: '2026-06-30T09:01:00Z',
        unitCode: 'TAB',
        unitText: '錠',
        electronicUnitConversion: {
          conversionFactor: '250',
          masterUnitText: 'mL',
          prescribedAmount: '3',
          prescribedUnitText: '缶'
        },
        electronicUsageCode: 'U001',
        electronicUsageFallbackText: '1日2回 朝夕食後',
        electronicUsageSupplementText: '腰部に貼付',
        amount: 2,
        usage: '1日2回 朝夕食後',
        days: 7,
        dosageCategory: 'internal',
        dosageCategorySource: 'auto',
        billingAgentGroupKey: 'mtx-weekly',
        billingAgentGroupReason: '地域審査の運用に合わせて週1回用法を別剤確認'
      };
      const errors = getErrors(PRESCRIPTION_ITEM_SCHEMA, validItem);
      assert.strictEqual(errors, null);
      assert.strictEqual(PRESCRIPTION_ITEM_SCHEMA.version, 15);
    });

    test('should fail if dosage category is not a known value', () => {
      const invalidItem = {
        itemId: 'item_1',
        visitId: 'v_123',
        drugId: 'drug_456',
        amount: 2,
        days: 7,
        dosageCategory: 'topical' // not in enum
      };
      const errors = getErrors(PRESCRIPTION_ITEM_SCHEMA, invalidItem);
      assert.notStrictEqual(errors, null);
    });

    test('should validate picking state embedded in a prescription item', () => {
      const pickedItem = {
        itemId: 'item_1',
        visitId: 'v_123',
        drugId: 'drug_456',
        amount: 2,
        days: 7,
        isPicked: true,
        pickedAt: '2026-06-04T03:30:00Z',
        pickedGs1Code: '(01)04912345678904(17)260630(10)LOT-A',
        pickedGtin: '04912345678904',
        pickedLotNumber: 'LOT-A',
        pickedExpirationDate: '2026-06-30',
        pickedStockId: 'stock_2171022F4010_LOT_A'
      };
      const errors = getErrors(PRESCRIPTION_ITEM_SCHEMA, pickedItem);
      assert.strictEqual(errors, null);
    });

    test('should fail if amount is not a number', () => {
      const invalidItem = {
        itemId: 'item_1',
        visitId: 'v_123',
        drugId: 'drug_456',
        amount: 'two', // should be number
        days: 7
      };
      const errors = getErrors(PRESCRIPTION_ITEM_SCHEMA, invalidItem);
      assert.notStrictEqual(errors, null);
    });
  });

  describe('SOAP_RECORD_SCHEMA', () => {
    test('should validate a correct soap record', () => {
      const validSoap = {
        soapId: 'soap_1',
        visitId: 'v_123',
        problems: [
          {
            id: 'prob_1',
            title: '#1 高血圧',
            entries: [
              { type: 'S', text: '最近、血圧が高い' },
              { type: 'O', text: '145/92 mmHg' }
            ]
          }
        ],
        structuredAssessment: {
          adherence: 'good',
          leftoverMedicine: 'none',
          adverseEvent: 'none',
          genericChangePreference: 'accepted',
          medicationNotebook: 'issued'
        },
        authorId: 'user_1',
        updatedAt: '2023-10-01T10:00:00Z'
      };
      const errors = getErrors(SOAP_RECORD_SCHEMA, validSoap);
      assert.strictEqual(errors, null);
    });

    test('should validate structured medication guidance fields', () => {
      assert.strictEqual(SOAP_RECORD_SCHEMA.version, 3);
      const invalidSoap = {
        soapId: 'soap_1',
        visitId: 'v_123',
        problems: [],
        structuredAssessment: {
          adherence: 'sometimes',
          leftoverMedicine: 'none',
          adverseEvent: 'none',
          genericChangePreference: 'accepted',
          medicationNotebook: 'issued'
        },
        authorId: 'user_1'
      };

      const errors = getErrors(SOAP_RECORD_SCHEMA, invalidSoap);
      assert.notStrictEqual(errors, null);
    });
  });

  describe('PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA', () => {
    test('should validate an approved patient medication info template with two safety texts and review metadata', () => {
      const validTemplate = {
        templateId: 'pmit_2325003F4031',
        drugCode: '2325003F4031',
        drugName: 'ガスターD錠20mg',
        genericName: 'ファモチジン口腔内崩壊錠20mg',
        status: 'approved',
        sideEffectText: '発疹、便秘、体調変化などがあれば相談してください。',
        counselingText: '用法・用量を守り、飲み忘れや飲み合わせで迷う場合は薬剤師へ相談してください。',
        sourceType: 'pharmacy_authored',
        sourceUrl: 'https://www.pmda.go.jp/PmdaSearch/iyakuSearch/',
        sourceRevisionDate: '2026-06-25',
        reviewerId: 'user_1',
        approvedAt: '2026-06-25T10:00:00Z',
        createdAt: '2026-06-25T09:00:00Z',
        updatedAt: '2026-06-25T10:00:00Z'
      };

      const errors = getErrors(PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA, validTemplate);
      assert.strictEqual(errors, null);
    });

    test('should reject invalid patient medication info template status', () => {
      const invalidTemplate = {
        templateId: 'pmit_2325003F4031',
        drugCode: '2325003F4031',
        drugName: 'ガスターD錠20mg',
        status: 'scraped'
      };

      const errors = getErrors(PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA, invalidTemplate);
      assert.notStrictEqual(errors, null);
    });
  });

  describe('USER_SCHEMA', () => {
    test('should validate a correct user object', () => {
      const validUser = {
        userId: 'user_1',
        name: '薬剤師 一郎',
        role: 'pharmacist'
      };
      const errors = getErrors(USER_SCHEMA, validUser);
      assert.strictEqual(errors, null);
    });

    test('should fail with invalid role', () => {
      const invalidUser = {
        userId: 'user_1',
        name: '薬剤師 一郎',
        role: 'superman'
      };
      const errors = getErrors(USER_SCHEMA, invalidUser);
      assert.notStrictEqual(errors, null);
    });
  });

  describe('ALERT_SCHEMA', () => {
    test('should validate a correct alert object', () => {
      const validAlert = {
        alertId: 'alert_1',
        patientId: 'pt_123',
        type: 'allergy',
        content: 'Pollen',
        status: 'active'
      };
      const errors = getErrors(ALERT_SCHEMA, validAlert);
      assert.strictEqual(errors, null);
    });
  });

  describe('INTERVENTION_SCHEMA', () => {
    test('should validate a correct intervention object', () => {
      const validIntervention = {
        interventionId: 'int_1',
        visitId: 'v_123',
        reason: 'Dosage adjustment'
      };
      const errors = getErrors(INTERVENTION_SCHEMA, validIntervention);
      assert.strictEqual(errors, null);
    });

    test('should validate pending inquiry details on an intervention', () => {
      const pendingInquiry = {
        interventionId: 'int_pending',
        visitId: 'v_123',
        reason: '重複投薬確認',
        inquiryStatus: 'pending',
        inquiryMethod: 'fax',
        inquiryDoctor: '青山',
        inquiryResult: '折り返し待ち',
        responseDueDate: '2026-07-02',
        contactedAt: '2026-07-01T09:00:00Z',
        handledBy: '薬剤師 一郎',
        note: 'FAX送信済み',
        patientConsented: true,
        createdAt: '2026-07-01T09:00:00Z',
        updatedAt: '2026-07-01T09:00:00Z'
      };

      const errors = getErrors(INTERVENTION_SCHEMA, pendingInquiry);
      assert.strictEqual(errors, null);
      assert.strictEqual(INTERVENTION_SCHEMA.version, 3);
      assert.ok(INTERVENTION_SCHEMA.encrypted?.includes('note'));
    });
  });

  describe('DRUG_STOCK_SCHEMA', () => {
    test('should allow a stock lot without an expiration date when it was not extracted', () => {
      const validStock = {
        id: 'stock_1',
        drugCode: 'drug_456',
        quantity: 12,
        arrivalDate: '2026-06-20'
      };

      const errors = getErrors(DRUG_STOCK_SCHEMA, validStock);
      assert.strictEqual(errors, null);
    });

    test('should validate a stock lot with an expiration date when present', () => {
      const validStock = {
        id: 'stock_2',
        drugCode: 'drug_456',
        quantity: 12,
        expirationDate: '2027-03-31',
        arrivalDate: '2026-06-20',
        supplier: 'sample supplier'
      };

      const errors = getErrors(DRUG_STOCK_SCHEMA, validStock);
      assert.strictEqual(errors, null);
    });

    test('should not index optional expiration date for Dexie storage compatibility', () => {
      assert.deepStrictEqual(DRUG_STOCK_SCHEMA.indexes, ['drugCode']);
      assert.ok(!DRUG_STOCK_SCHEMA.required?.includes('expirationDate'));
    });
  });

  describe('AUDIT_LOG_SCHEMA', () => {
    test('should validate dedicated operational audit action types', () => {
      const validLog = {
        logId: 'log_1',
        timestamp: '2026-06-04T03:30:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'staff_create',
        details: 'スタッフを追加しました。'
      };
      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate staff credential recovery audit actions', () => {
      const validLog = {
        logId: 'log_staff_credential_recovery',
        timestamp: '2026-06-21T10:00:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'staff_credential_recovery',
        details: 'スタッフ認証復旧 / 理由 パスキー紛失 / 操作 パスワード再設定 / 対象 薬剤師 (pharmacist) / 確認者 管理者'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate claim lifecycle audit actions', () => {
      const validLog = {
        logId: 'log_claim',
        timestamp: '2026-06-14T10:00:00Z',
        userId: 'pharm_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'claim_lifecycle',
        patientId: 'pt_123',
        patientName: '山田 太郎',
        details: '請求状態変更: UKE出力により請求をロックしました。'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate daily closing approval audit actions', () => {
      const validLog = {
        logId: 'log_daily_closing',
        timestamp: '2026-06-15T11:00:00Z',
        userId: 'pharm_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'daily_closing_approval',
        details: '日次締め承認: 2026/06/15 20:00 / 確認者 薬剤師 一郎 / 本日完了率 100%'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate daily closing KPI action audit records', () => {
      const validLog = {
        logId: 'log_daily_closing_kpi_action',
        timestamp: '2026-06-16T11:00:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'daily_closing_kpi_action',
        details: '店舗別KPI改善アクション記録: reduce-closing-blockers / タイトル 閉店前残タスクを削減 / 店舗 青空薬局 渋谷店 / 優先度 high / 基準完了率 75% / 基準残タスク 4 / 期待 残タスク差を0件以下へ戻す'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate session lock audit actions', () => {
      const validLog = {
        logId: 'log_session_lock',
        timestamp: '2026-06-14T10:15:00Z',
        userId: 'pharm_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'session_lock',
        details: '無操作セッションロック: 操作者を自動ログアウトしました。'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate signed audit export logs', () => {
      const validLog = {
        logId: 'log_audit_export',
        timestamp: '2026-06-14T10:30:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'audit_export',
        details: '監査ログJSONエクスポート: yakureki_audit_logs_20260614_103000.json に3件を書き出しました。',
        previousHash: 'previous-integrity-hash',
        integrityHash: 'current-integrity-hash'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate audit retention manager approval logs', () => {
      const validLog = {
        logId: 'log_audit_retention_approval',
        timestamp: '2026-06-14T10:40:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'audit_retention_approval',
        details: '監査ログ保全責任者承認: 2026年06月 / 判定 棚卸完了 / 確認者 管理者 / 最新ハッシュ current-integrity-hash / 差し戻し 0件 / 対応 責任者が棚卸結果を承認する',
        previousHash: 'previous-integrity-hash',
        integrityHash: 'current-integrity-hash'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate official specification review logs', () => {
      const validLog = {
        logId: 'log_official_spec_review',
        timestamp: '2026-06-20T10:30:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'official_spec_review',
        details: 'UKE仕様PDF全項目突合: 公式PDF iryokikan_in_07.pdf / 判定 未完了 / 残 12項目'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate electronic prescription audit actions', () => {
      const validLog = {
        logId: 'log_electronic_prescription',
        timestamp: '2026-06-30T10:30:00Z',
        userId: 'pharm_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'electronic_prescription',
        details: '電子処方箋取得内容を処方入力へ反映: 文書区分 電子処方箋、署名 valid、重複確認 passed、取得内容SHA-256 abcdef1234567890...。'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate external device handoff audit actions', () => {
      const validLog = {
        logId: 'log_external_device_handoff',
        timestamp: '2026-06-30T10:35:00Z',
        userId: 'pharm_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'external_device_handoff',
        details: '外部調剤機器連携完了: 送信 / 状態 受付済み / 連携ID transfer-001 / 仕様版 1.07.01'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
      assert.strictEqual(AUDIT_LOG_SCHEMA.version, 18);
    });

    test('should validate per-terminal chained audit logs with terminalId', () => {
      const validLog = {
        logId: 'log_terminal_chained',
        timestamp: '2026-07-12T10:35:00Z',
        userId: 'pharm_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'print',
        details: '薬袋を印刷しました。',
        terminalId: 'satellite-1',
        previousHash: '',
        integrityHash: 'abcdef1234567890'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate patient medication info template audit actions', () => {
      const validLog = {
        logId: 'log_patient_medication_info_template',
        timestamp: '2026-06-25T10:30:00Z',
        userId: 'pharmacist_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'patient_medication_info_template',
        details: '薬情テンプレ承認: ロキソプロフェン錠 (620007813) / 状態 承認済み / 参照元 PMDA 添付文書'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate backup restore drill audit actions', () => {
      const validLog = {
        logId: 'log_backup_drill',
        timestamp: '2026-06-14T11:00:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'backup_drill',
        details: '復旧テスト（訓練）: sample.json / 判定 テストOK / 対象 42件'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate backup external storage audit actions', () => {
      const validLog = {
        logId: 'log_backup_external_storage',
        timestamp: '2026-06-14T11:30:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'backup_external_storage',
        details: 'バックアップ外部保存確認: sample.json / 保存先 店舗保管庫 / 保存先パス s3://backup/ / 読取 確認済み / 上書き削除不可 確認済み / 確認者 管理者 / 判定 外部保存OK'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate backup external transfer manifest audit actions', () => {
      const validLog = {
        logId: 'log_backup_external_transfer_manifest',
        timestamp: '2026-06-14T11:40:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'backup_external_transfer_manifest',
        details: 'バックアップ外部保存連携JSON: sample_external_transfer.json / 対象 sample.json / SHA-256 abc123 / サイズ 1024B / 暗号化 あり / 保存先 店舗保管庫 / 保存先パス s3://backup/ / 保持 30日 / 判定 連携準備OK'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate backup schedule update audit actions', () => {
      const validLog = {
        logId: 'log_backup_schedule_update',
        timestamp: '2026-06-14T11:45:00Z',
        userId: 'admin_1',
        userName: '管理者',
        userRole: 'admin',
        actionType: 'backup_schedule_update',
        details: 'バックアップ予定設定 / 状態 有効 / 予定時刻 20:00 / 暗号化 必須 / 外部保存 必須'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate follow-up record audit actions', () => {
      const validLog = {
        logId: 'log_follow_up_record',
        timestamp: '2026-06-14T12:00:00Z',
        userId: 'pharmacist_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'follow_up_record',
        patientId: 'patient_1',
        patientName: '山田 太郎',
        details: '服薬フォロー記録: 山田 太郎 / 電話 / 次回確認へ継続 / 次回確認 2026-06-17 / 対応内容 不在のため翌日再架電'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });

    test('should validate AI suggestion review audit actions', () => {
      const validLog = {
        logId: 'log_ai_suggestion_review',
        timestamp: '2026-06-16T12:00:00Z',
        userId: 'pharmacist_1',
        userName: '薬剤師 一郎',
        userRole: 'pharmacist',
        actionType: 'ai_suggestion_review',
        patientId: 'patient_1',
        patientName: '山田 太郎',
        details: 'AI提案採否: 修正 / 確認者: 薬剤師 一郎 / 提案ID: prescription-audit-high-risk-without-comment-1 / 信頼度: 82% / 根拠: ハイリスク薬 / 修正後対応: 薬歴へ確認事項を記録'
      };

      const errors = getErrors(AUDIT_LOG_SCHEMA, validLog);
      assert.strictEqual(errors, null);
    });
  });
});
