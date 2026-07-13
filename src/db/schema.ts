import type { RxJsonSchema } from 'rxdb';
import type { Patient, Visit, PrescriptionItem, SoapRecord, User, Alert, Intervention, Drug, DrugStock, FacilitySettings, Location, DrugInfo, MedicationGuidance, PatientMedicationInfoTemplate, AuditLog } from './types.ts';


export const DRUG_STOCK_SCHEMA: RxJsonSchema<DrugStock> = {
  title: 'drug stock schema',
  version: 5,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    drugCode: { type: 'string', maxLength: 100 },
    janCode: { type: 'string', maxLength: 100 },
    lotNumber: { type: 'string', maxLength: 100 },
    expirationDate: { type: 'string', maxLength: 50 },
    quantity: { type: 'number' },
    arrivalDate: { type: 'string', maxLength: 50 },
    supplier: { type: 'string', maxLength: 100 }
  },
  required: ['id', 'drugCode', 'quantity'],
  indexes: ['drugCode']
};

export const LOCATION_SCHEMA: RxJsonSchema<Location> = {
  title: 'location schema',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    part1: { type: 'string', maxLength: 50 },
    part2: { type: 'string', maxLength: 50 },
    part3: { type: 'string', maxLength: 50 },
    displayText: { type: 'string', maxLength: 200 }
  },
  required: ['id', 'part1', 'part2', 'part3', 'displayText']
};

export const FACILITY_SETTINGS_SCHEMA: RxJsonSchema<FacilitySettings> = {
  title: 'facility settings schema',
  version: 5,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    pharmacyName: { type: 'string', maxLength: 200 },
    pharmacyKana: { type: 'string', maxLength: 200 },
    pharmacyCode: { type: 'string', maxLength: 20 },
    pharmacyPostalCode: { type: 'string', maxLength: 20 },
    pharmacyAddress: { type: 'string', maxLength: 300 },
    pharmacyPhone: { type: 'string', maxLength: 30 },
    pharmacyFax: { type: 'string', maxLength: 30 },
    registrationNumber: { type: 'string', maxLength: 20 },
    ownerName: { type: 'string', maxLength: 100 },
    managerName: { type: 'string', maxLength: 100 },
    defaultPharmacistName: { type: 'string', maxLength: 100 },
    baseFeeCategory: { type: 'string', enum: ['1', '2', '3_a', '3_b', '3_ro', 'special', 'special_b'], maxLength: 50 },
    regionalSupportAddition: { type: 'string', enum: ['1', '2', '3', '4', '5', 'none'], maxLength: 50 },
    medicalDxAddition: { type: 'boolean' },
    postGenericAddition: { type: 'string', enum: ['1', '2', '3', 'none'], maxLength: 50 },
    genericDispensingReduction: { type: 'boolean' },
    aiAssistMode: { type: 'string', enum: ['enabled', 'limited', 'disabled'], maxLength: 50 },
    officialFeeCodeOverrides: {
      type: 'object',
      additionalProperties: { type: 'string', maxLength: 9, pattern: '^\\d{0,9}$' }
    }
  },
  required: ['id', 'baseFeeCategory', 'regionalSupportAddition', 'medicalDxAddition']
};

export const PATIENT_SCHEMA: RxJsonSchema<Patient> = {
  title: 'patient schema',
  version: 3,
  description: 'Patient master data',
  primaryKey: 'patientId',
  type: 'object',
  properties: {
    patientId: { type: 'string', maxLength: 100 },
    name: { type: 'string', maxLength: 100 },
    kana: { type: 'string', maxLength: 100 },
    birthDate: { type: 'string', format: 'date' },
    gender: { type: 'string', enum: ['male', 'female', 'other'], maxLength: 50 },
    insuranceInfo: {
      type: 'object',
      properties: {
        provider: { type: 'string', maxLength: 100 },
        number: { type: 'string', maxLength: 50 },
        burdenRatio: { type: 'number', minimum: 0, maximum: 100 },
        insuranceType: { type: 'string', maxLength: 50 },
        relationship: { type: 'string', maxLength: 50 },
        validFrom: { type: 'string', maxLength: 50 },
        validTo: { type: 'string', maxLength: 50 },
        eligibilityCheckedAt: { type: 'string', maxLength: 50 },
        eligibilityStatus: { type: 'string', enum: ['unchecked', 'valid', 'warning', 'invalid', 'unavailable'], maxLength: 50 }
      }
    },
    publicInsurances: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          provider: { type: 'string', maxLength: 50 },
          recipient: { type: 'string', maxLength: 50 },
          burdenRatio: { type: 'number', minimum: 0, maximum: 100 },
          startDate: { type: 'string', maxLength: 50 },
          endDate: { type: 'string', maxLength: 50 },
          monthlyLimitYen: { type: 'number', minimum: 0 }
        },
        required: ['provider', 'recipient']
      }
    }
  },
  required: ['patientId', 'name', 'kana', 'birthDate'],
  encrypted: ['name', 'kana', 'birthDate', 'insuranceInfo', 'publicInsurances']
};

const ELECTRONIC_PRESCRIPTION_SUPPLEMENTARY_INFORMATION_SCHEMA = {
  type: 'object' as const,
  properties: {
    prescriptionComments: {
      type: 'array' as const,
      maxItems: 50,
      items: { type: 'string' as const, maxLength: 1000 }
    },
    laboratoryResults: {
      type: 'array' as const,
      maxItems: 100,
      items: {
        type: 'object' as const,
        properties: {
          testName: { type: 'string' as const, maxLength: 200 },
          value: { type: 'string' as const, maxLength: 200 },
          unit: { type: 'string' as const, maxLength: 50 },
          referenceRange: { type: 'string' as const, maxLength: 200 },
          measuredAt: { type: 'string' as const, format: 'date-time' as const, maxLength: 50 },
          comment: { type: 'string' as const, maxLength: 500 }
        },
        required: ['testName', 'value']
      }
    },
    narcoticAdministration: {
      type: 'object' as const,
      properties: {
        isNarcoticPrescription: { type: 'boolean' as const },
        recordPresent: { type: 'boolean' as const },
        displayText: { type: 'string' as const, maxLength: 1000 }
      },
      required: ['isNarcoticPrescription', 'recordPresent']
    }
  },
  required: ['prescriptionComments', 'laboratoryResults']
};

export const VISIT_SCHEMA: RxJsonSchema<Visit> = {
  title: 'visit schema',
  version: 20,
  primaryKey: 'visitId',
  type: 'object',
  properties: {
    visitId: { type: 'string', maxLength: 100 },
    patientId: { type: 'string', maxLength: 100 },
    institutionId: { type: 'string', maxLength: 100 },
    institutionCode: { type: 'string', maxLength: 50 },
    institutionName: { type: 'string', maxLength: 200 },
    departmentName: { type: 'string', maxLength: 100 },
    doctorId: { type: 'string', maxLength: 100 },
    doctorName: { type: 'string', maxLength: 100 },
    prescriptionDate: { type: 'string', format: 'date', maxLength: 50 },
    dispensingDate: { type: 'string', format: 'date', maxLength: 50 },
    issueDate: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['waiting', 'processing', 'completed', 'cancelled'], maxLength: 50 },
    electronicPrescription: {
      type: 'object',
      properties: {
        prescriptionId: { type: 'string', maxLength: 100 },
        linkedPrescriptions: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              prescriptionId: { type: 'string', maxLength: 100 },
              documentKind: {
                type: 'string',
                enum: ['electronic_prescription', 'prescription_information'],
                maxLength: 50
              },
              validUntil: { type: 'string', format: 'date', maxLength: 50 },
              signatureStatus: {
                type: 'string',
                enum: ['valid', 'invalid', 'not_checked', 'not_applicable'],
                maxLength: 50
              },
              signatureHpkiVerification: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['valid', 'invalid', 'expired', 'revoked', 'not_checked', 'not_applicable'],
                    maxLength: 50
                  },
                  signerRole: { type: 'string', enum: ['doctor', 'pharmacist', 'unknown'], maxLength: 50 },
                  certificateSerialHash: { type: 'string', maxLength: 64 },
                  certificateIssuerHash: { type: 'string', maxLength: 64 },
                  certificateNotAfter: { type: 'string', format: 'date', maxLength: 50 },
                  revocationCheckedAt: { type: 'string', format: 'date-time', maxLength: 50 },
                  policyOid: { type: 'string', maxLength: 80 }
                },
                required: ['status']
              },
              duplicateCheckStatus: {
                type: 'string',
                enum: ['not_checked', 'passed', 'warning', 'blocked'],
                maxLength: 50
              },
              integrityHash: { type: 'string', maxLength: 64 },
              paperOriginalConfirmed: { type: 'boolean' },
              supplementaryInformation: ELECTRONIC_PRESCRIPTION_SUPPLEMENTARY_INFORMATION_SCHEMA
            },
            required: [
              'prescriptionId',
              'documentKind',
              'validUntil',
              'signatureStatus',
              'duplicateCheckStatus',
              'integrityHash'
            ]
          }
        },
        documentKind: {
          type: 'string',
          enum: ['electronic_prescription', 'prescription_information'],
          maxLength: 50
        },
        sourceMode: { type: 'string', enum: ['connector'], maxLength: 50 },
        receivedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        appliedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        validUntil: { type: 'string', format: 'date', maxLength: 50 },
        signatureStatus: {
          type: 'string',
          enum: ['valid', 'invalid', 'not_checked', 'not_applicable'],
          maxLength: 50
        },
        signatureHpkiVerification: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['valid', 'invalid', 'expired', 'revoked', 'not_checked', 'not_applicable'],
              maxLength: 50
            },
            signerRole: { type: 'string', enum: ['doctor', 'pharmacist', 'unknown'], maxLength: 50 },
            certificateSerialHash: { type: 'string', maxLength: 64 },
            certificateIssuerHash: { type: 'string', maxLength: 64 },
            certificateNotAfter: { type: 'string', format: 'date', maxLength: 50 },
            revocationCheckedAt: { type: 'string', format: 'date-time', maxLength: 50 },
            policyOid: { type: 'string', maxLength: 80 }
          },
          required: ['status']
        },
        duplicateCheckStatus: {
          type: 'string',
          enum: ['not_checked', 'passed', 'warning', 'blocked'],
          maxLength: 50
        },
        integrityHash: { type: 'string', maxLength: 64 },
        paperOriginalConfirmed: { type: 'boolean' },
        supplementaryInformation: ELECTRONIC_PRESCRIPTION_SUPPLEMENTARY_INFORMATION_SCHEMA,
        refill: {
          type: 'object',
          properties: {
            totalCount: { type: 'number', minimum: 1 },
            currentCount: { type: 'number', minimum: 1 },
            previousDispensingDate: { type: 'string', format: 'date', maxLength: 50 },
            nextDispensingDate: { type: 'string', format: 'date', maxLength: 50 }
          },
          required: ['totalCount', 'currentCount']
        },
        receptionStatus: {
          type: 'string',
          enum: ['accepted', 'cancel_pending', 'cancelled'],
          maxLength: 50
        },
        dispensingResultStatus: {
          type: 'string',
          enum: ['pending', 'submitted', 'registered', 'failed', 'cancelled'],
          maxLength: 50
        },
        dispensingResultEverRegistered: { type: 'boolean' },
        dispensingResultId: { type: 'string', maxLength: 100 },
        dispensingResultUpdatedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        dispensingInformationFile: {
          type: 'object',
          properties: {
            signatureStatus: {
              type: 'string',
              enum: ['valid', 'invalid', 'present', 'unsigned', 'not_checked'],
              maxLength: 50
            },
            signedAt: { type: 'string', format: 'date-time', maxLength: 50 },
            fileHash: { type: 'string', maxLength: 64 },
            hpkiVerification: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['valid', 'invalid', 'expired', 'revoked', 'not_checked', 'not_applicable'],
                  maxLength: 50
                },
                signerRole: { type: 'string', enum: ['doctor', 'pharmacist', 'unknown'], maxLength: 50 },
                certificateSerialHash: { type: 'string', maxLength: 64 },
                certificateIssuerHash: { type: 'string', maxLength: 64 },
                certificateNotAfter: { type: 'string', format: 'date', maxLength: 50 },
                revocationCheckedAt: { type: 'string', format: 'date-time', maxLength: 50 },
                policyOid: { type: 'string', maxLength: 80 }
              },
              required: ['status']
            }
          },
          required: ['signatureStatus']
        }
      },
      required: [
        'prescriptionId',
        'documentKind',
        'sourceMode',
        'receivedAt',
        'appliedAt',
        'validUntil',
        'signatureStatus',
        'duplicateCheckStatus',
        'integrityHash',
        'receptionStatus',
        'dispensingResultStatus'
      ]
    },
    pharmacyDeviceHandoff: {
      type: 'object',
      properties: {
        connectorKind: {
          type: 'string',
          enum: ['nsips_gateway', 'vendor_api'],
          maxLength: 50
        },
        interfaceVersion: { type: 'string', maxLength: 50 },
        transferId: { type: 'string', maxLength: 100 },
        payloadHash: { type: 'string', maxLength: 64 },
        status: {
          type: 'string',
          enum: ['accepted', 'duplicate', 'cancelled'],
          maxLength: 50
        },
        lastOperation: {
          type: 'string',
          enum: ['submit', 'replace', 'cancel'],
          maxLength: 50
        },
        submittedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        updatedAt: { type: 'string', format: 'date-time', maxLength: 50 }
      },
      required: [
        'connectorKind',
        'interfaceVersion',
        'transferId',
        'payloadHash',
        'status',
        'lastOperation',
        'submittedAt',
        'updatedAt'
      ]
    },
    initialQuestionnaire: {
      type: 'object',
      properties: {
        sourceType: { type: 'string', enum: ['camera', 'image', 'manual'], maxLength: 50 },
        capturedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        imageDataUrl: { type: 'string', maxLength: 260000 },
        imageOriginalName: { type: 'string', maxLength: 200 },
        imageByteSize: { type: 'number', minimum: 0 },
        imageCompressedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        rawText: { type: 'string', maxLength: 12000 },
        allergies: { type: 'string', maxLength: 2000 },
        adverseDrugReactions: { type: 'string', maxLength: 2000 },
        medicalHistory: { type: 'string', maxLength: 2000 },
        currentSymptoms: { type: 'string', maxLength: 2000 },
        pregnancyLactation: { type: 'string', maxLength: 1000 },
        lifestyle: { type: 'string', maxLength: 1000 },
        notes: { type: 'string', maxLength: 3000 },
        reviewedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        reviewedBy: { type: 'string', maxLength: 100 }
      },
      required: ['sourceType', 'capturedAt']
    },
    careCommunication: {
      type: 'object',
      properties: {
        tracingReports: {
          type: 'array',
          maxItems: 50,
          items: {
            type: 'object',
            properties: {
              reportId: { type: 'string', maxLength: 100 },
              status: { type: 'string', enum: ['draft', 'ready', 'sent', 'closed'], maxLength: 50 },
              reportDate: { type: 'string', format: 'date', maxLength: 50 },
              destinationInstitution: { type: 'string', maxLength: 200 },
              destinationDepartment: { type: 'string', maxLength: 100 },
              destinationDoctor: { type: 'string', maxLength: 100 },
              subject: { type: 'string', maxLength: 300 },
              medicationSummary: { type: 'string', maxLength: 3000 },
              patientCondition: { type: 'string', maxLength: 3000 },
              assessment: { type: 'string', maxLength: 3000 },
              proposal: { type: 'string', maxLength: 3000 },
              followUpPlan: { type: 'string', maxLength: 3000 },
              sentAt: { type: 'string', format: 'date-time', maxLength: 50 },
              sentBy: { type: 'string', maxLength: 100 },
              responseSummary: { type: 'string', maxLength: 3000 },
              createdAt: { type: 'string', format: 'date-time', maxLength: 50 },
              updatedAt: { type: 'string', format: 'date-time', maxLength: 50 }
            },
            required: ['reportId', 'status', 'reportDate', 'subject', 'createdAt', 'updatedAt']
          }
        },
        mynaClinicalImports: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              importId: { type: 'string', maxLength: 100 },
              importedAt: { type: 'string', format: 'date-time', maxLength: 50 },
              readerSource: { type: 'string', enum: ['bridge', 'mock'], maxLength: 50 },
              readerCheckedAt: { type: 'string', format: 'date-time', maxLength: 50 },
              specificHealthCheckups: {
                type: 'array',
                maxItems: 20,
                items: {
                  type: 'object',
                  properties: {
                    checkedAt: { type: 'string', maxLength: 50 },
                    heightCm: { type: 'number', minimum: 0 },
                    weightKg: { type: 'number', minimum: 0 },
                    bmi: { type: 'number', minimum: 0 },
                    systolicBloodPressure: { type: 'number', minimum: 0 },
                    diastolicBloodPressure: { type: 'number', minimum: 0 },
                    hba1c: { type: 'string', maxLength: 50 },
                    ldlCholesterol: { type: 'string', maxLength: 50 },
                    egfr: { type: 'string', maxLength: 50 },
                    findings: {
                      type: 'array',
                      maxItems: 50,
                      items: { type: 'string', maxLength: 500 }
                    },
                    rawSummary: { type: 'string', maxLength: 3000 }
                  }
                }
              },
              medicationHistory: {
                type: 'array',
                maxItems: 200,
                items: {
                  type: 'object',
                  properties: {
                    dispensedAt: { type: 'string', maxLength: 50 },
                    drugName: { type: 'string', maxLength: 200 },
                    dosage: { type: 'string', maxLength: 200 },
                    usage: { type: 'string', maxLength: 500 },
                    days: { type: 'number', minimum: 0 },
                    institutionName: { type: 'string', maxLength: 200 },
                    pharmacyName: { type: 'string', maxLength: 200 },
                    rawSummary: { type: 'string', maxLength: 3000 }
                  },
                  required: ['drugName']
                }
              },
              note: { type: 'string', maxLength: 3000 }
            },
            required: ['importId', 'importedAt', 'readerSource', 'readerCheckedAt']
          }
        },
        updatedAt: { type: 'string', format: 'date-time', maxLength: 50 }
      }
    },
    claimOptions: {
      type: 'object',
      properties: {
        drugFeeOnly: { type: 'boolean' },
        disabledFeeCodes: {
          type: 'array',
          items: { type: 'string', maxLength: 100 }
        },
        disabledFeeRationales: {
          type: 'object'
        },
        specialPublicExpenseRecord: {
          type: 'object',
          properties: {
            category: { type: 'string', maxLength: 20 },
            branch: { type: 'string', maxLength: 20 },
            supplementalCode: { type: 'string', maxLength: 50 }
          },
          required: ['category', 'branch']
        }
      }
    },
    claimLifecycle: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'exported', 'accepted', 'returned', 'rebilling', 'closed'], maxLength: 50 },
        exportedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        exportedBy: { type: 'string', maxLength: 100 },
        exportedFileName: { type: 'string', maxLength: 200 },
        lockedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        totalPoints: { type: 'number', minimum: 0 },
        exportSnapshot: {
          type: 'object',
          properties: {
            createdAt: { type: 'string', format: 'date-time', maxLength: 50 },
            visitId: { type: 'string', maxLength: 100 },
            patientId: { type: 'string', maxLength: 100 },
            patientName: { type: 'string', maxLength: 100 },
            patientKana: { type: 'string', maxLength: 100 },
            patientBirthDate: { type: 'string', maxLength: 50 },
            patientGender: { type: 'string', maxLength: 50 },
            insuranceInfo: {
              type: 'object',
              properties: {
                provider: { type: 'string', maxLength: 100 },
                number: { type: 'string', maxLength: 50 },
                burdenRatio: { type: 'number', minimum: 0, maximum: 100 },
                insuranceType: { type: 'string', maxLength: 50 },
                relationship: { type: 'string', maxLength: 50 },
                validFrom: { type: 'string', maxLength: 50 },
                validTo: { type: 'string', maxLength: 50 },
                eligibilityCheckedAt: { type: 'string', maxLength: 50 },
                eligibilityStatus: { type: 'string', enum: ['unchecked', 'valid', 'warning', 'invalid', 'unavailable'], maxLength: 50 }
              }
            },
            publicInsurances: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  provider: { type: 'string', maxLength: 50 },
                  recipient: { type: 'string', maxLength: 50 },
                  burdenRatio: { type: 'number', minimum: 0, maximum: 100 },
                  startDate: { type: 'string', maxLength: 50 },
                  endDate: { type: 'string', maxLength: 50 },
                  monthlyLimitYen: { type: 'number', minimum: 0 }
                },
                required: ['provider', 'recipient']
              }
            },
            institutionCode: { type: 'string', maxLength: 50 },
            institutionName: { type: 'string', maxLength: 200 },
            departmentName: { type: 'string', maxLength: 100 },
            doctorName: { type: 'string', maxLength: 100 },
            prescriptionDate: { type: 'string', maxLength: 50 },
            dispensingDate: { type: 'string', maxLength: 50 },
            issueDate: { type: 'string', format: 'date-time', maxLength: 50 },
            exportedFileName: { type: 'string', maxLength: 200 },
            totalPoints: { type: 'number', minimum: 0 },
            prescriptionItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  itemId: { type: 'string', maxLength: 100 },
                  rpNumber: { type: 'number' },
                  drugId: { type: 'string', maxLength: 100 },
                  dispensedDrug: { type: 'string', maxLength: 100 },
                  dispensedDrugCode: { type: 'string', maxLength: 100 },
                  amount: { type: 'number' },
                  days: { type: 'number' },
                  usage: { type: 'string', maxLength: 2000 }
                },
                required: ['itemId', 'drugId', 'amount', 'days']
              }
            }
          },
          required: ['createdAt', 'visitId', 'patientId', 'patientName', 'patientBirthDate', 'issueDate', 'totalPoints', 'prescriptionItems']
        },
        acceptedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        acceptedBy: { type: 'string', maxLength: 100 },
        acceptanceReceiptNumber: { type: 'string', maxLength: 100 },
        returnedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        returnReason: { type: 'string', maxLength: 2000 },
        rebillingAt: { type: 'string', format: 'date-time', maxLength: 50 },
        rebillingReason: { type: 'string', maxLength: 2000 },
        closedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        closedBy: { type: 'string', maxLength: 100 },
        history: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['exported', 'accepted', 'returned', 'rebilling', 'closed'], maxLength: 50 },
              at: { type: 'string', format: 'date-time', maxLength: 50 },
              by: { type: 'string', maxLength: 100 },
              note: { type: 'string', maxLength: 2000 },
              totalPoints: { type: 'number', minimum: 0 },
              fileName: { type: 'string', maxLength: 200 }
            },
            required: ['type', 'at']
          }
        }
      }
    },
    followUp: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'completed', 'dismissed'], maxLength: 50 },
        reasonFlags: {
          type: 'array',
          items: { type: 'string', maxLength: 100 }
        },
        summary: { type: 'string', maxLength: 2000 },
        dueDate: { type: 'string', maxLength: 50 },
        contactMethod: { type: 'string', enum: ['phone', 'sms', 'visit', 'other'], maxLength: 50 },
        nextAction: { type: 'string', maxLength: 2000 },
        riskScore: { type: 'number', minimum: 0, maximum: 200 },
        reminderAt: { type: 'string', format: 'date-time', maxLength: 50 },
        reminderReason: { type: 'string', maxLength: 2000 },
        contactAttempts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              at: { type: 'string', format: 'date-time', maxLength: 50 },
              by: { type: 'string', maxLength: 100 },
              method: { type: 'string', enum: ['phone', 'sms', 'visit', 'other'], maxLength: 50 },
              outcome: { type: 'string', enum: ['completed', 'no_answer', 'rescheduled', 'dismissed'], maxLength: 50 },
              note: { type: 'string', maxLength: 2000 },
              nextAction: { type: 'string', maxLength: 2000 },
              dueDate: { type: 'string', maxLength: 50 }
            },
            required: ['at', 'method', 'outcome', 'note']
          }
        },
        completedAt: { type: 'string', format: 'date-time', maxLength: 50 },
        completedBy: { type: 'string', maxLength: 100 },
        completedNote: { type: 'string', maxLength: 2000 },
        updatedAt: { type: 'string', format: 'date-time', maxLength: 50 }
      }
    }
  },
  required: ['visitId', 'patientId', 'issueDate', 'status'],
  indexes: ['patientId', 'status'],
  encrypted: ['electronicPrescription', 'pharmacyDeviceHandoff', 'initialQuestionnaire', 'careCommunication', 'claimLifecycle', 'followUp']
};

export const PRESCRIPTION_ITEM_SCHEMA: RxJsonSchema<PrescriptionItem> = {
  title: 'prescription item schema',
  version: 15,
  primaryKey: 'itemId',
  type: 'object',
  properties: {
    itemId: { type: 'string', maxLength: 100 },
    visitId: { type: 'string', maxLength: 100 },
    rpNumber: { type: 'number' },
    drugId: { type: 'string', maxLength: 100 },
    dispensedDrug: { type: 'string', maxLength: 100 },
    dispensedDrugCode: { type: 'string', maxLength: 100 },
    prescribedDrugCodeStatus: {
      type: 'string',
      enum: ['active', 'abolished', 'unknown'],
      maxLength: 50
    },
    prescribedDrugCodeAbolishedAt: { type: 'string', format: 'date', maxLength: 50 },
    electronicSourceDrugName: { type: 'string', maxLength: 200 },
    electronicMasterDrugName: { type: 'string', maxLength: 200 },
    electronicDrugNameVerificationStatus: {
      type: 'string',
      enum: ['matched', 'mismatch', 'not_checked'],
      maxLength: 50
    },
    electronicDrugNameVerificationCheckedAt: { type: 'string', format: 'date-time', maxLength: 50 },
    unitCode: { type: 'string', maxLength: 50 },
    unitText: { type: 'string', maxLength: 50 },
    electronicUnitConversion: {
      type: 'object',
      properties: {
        conversionFactor: { type: 'string', maxLength: 50 },
        masterUnitCode: { type: 'string', maxLength: 50 },
        masterUnitText: { type: 'string', maxLength: 50 },
        prescribedAmount: { type: 'string', maxLength: 80 },
        prescribedUnitCode: { type: 'string', maxLength: 50 },
        prescribedUnitText: { type: 'string', maxLength: 50 }
      },
      required: ['conversionFactor', 'prescribedAmount', 'prescribedUnitText']
    },
    electronicUsageCode: { type: 'string', maxLength: 50 },
    electronicUsageFallbackText: { type: 'string', maxLength: 2000 },
    electronicUsageSupplementText: { type: 'string', maxLength: 500 },
    changeReason: { type: 'string', maxLength: 200 },
    amount: { type: 'number' },
    usage: { type: 'string', maxLength: 2000 },
    days: { type: 'number' },
    rpComment: { type: 'string', maxLength: 1000 },
    dosageCategory: {
      type: 'string',
      enum: ['internal', 'as_needed', 'external', 'internal_drop', 'injection'],
      maxLength: 20
    },
    dosageCategorySource: {
      type: 'string',
      enum: ['auto', 'manual'],
      maxLength: 10
    },
    isIppoka: { type: 'boolean' },
    isCrushed: { type: 'boolean' },
    tokkanType: { type: 'string', maxLength: 10 },
    receiptRemark: { type: 'string', maxLength: 2000 },
    billingAgentGroupKey: { type: 'string', maxLength: 50 },
    billingAgentGroupReason: { type: 'string', maxLength: 500 },
    claimPreparation: { type: 'boolean' },
    claimManagement: { type: 'boolean' },
    claimDrugFee: { type: 'boolean' },
    isDiagnosticTest: { type: 'boolean' },
    isPicked: { type: 'boolean' },
    pickedAt: { type: 'string', format: 'date-time', maxLength: 50 },
    pickedGs1Code: { type: 'string', maxLength: 200 },
    pickedGtin: { type: 'string', maxLength: 50 },
    pickedLotNumber: { type: 'string', maxLength: 100 },
    pickedExpirationDate: { type: 'string', maxLength: 50 },
    pickedStockId: { type: 'string', maxLength: 100 },
    shortageQuantity: { type: 'number', minimum: 0 },
    shortageNote: { type: 'string', maxLength: 500 },
    shortageRecordedAt: { type: 'string', format: 'date-time', maxLength: 50 }
  },
  required: ['itemId', 'visitId', 'drugId', 'amount', 'days'],
  indexes: ['visitId'],
  encrypted: ['usage']
};

export const SOAP_RECORD_SCHEMA: RxJsonSchema<SoapRecord> = {
  title: 'soap record schema',
  version: 3,
  primaryKey: 'soapId',
  type: 'object',
  properties: {
    soapId: { type: 'string', maxLength: 100 },
    visitId: { type: 'string', maxLength: 100 },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['S', 'O', 'A', 'P'] },
                text: { type: 'string' }
              }
            }
          }
        }
      }
    },
    structuredAssessment: {
      type: 'object',
      properties: {
        adherence: { type: 'string', enum: ['unknown', 'good', 'partial', 'poor'] },
        leftoverMedicine: { type: 'string', enum: ['unknown', 'none', 'has'] },
        adverseEvent: { type: 'string', enum: ['unknown', 'none', 'has'] },
        genericChangePreference: { type: 'string', enum: ['unknown', 'accepted', 'declined', 'consult'] },
        medicationNotebook: { type: 'string', enum: ['unknown', 'issued', 'not_issued'] }
      }
    },
    authorId: { type: 'string', maxLength: 100 },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['soapId', 'visitId', 'authorId', 'problems'],
  indexes: ['visitId'],
  encrypted: ['problems', 'structuredAssessment']
};

export const MEDICATION_GUIDANCE_SCHEMA: RxJsonSchema<MedicationGuidance> = {
  title: 'medication guidance schema',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    drugCode: { type: 'string', maxLength: 100 },
    drugName: { type: 'string', maxLength: 200 },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['S', 'O', 'A', 'P'] },
          text: { type: 'string' }
        }
      }
    },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'drugCode', 'drugName', 'entries'],
  indexes: ['drugCode']
};

export const PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA: RxJsonSchema<PatientMedicationInfoTemplate> = {
  title: 'patient medication info template schema',
  version: 1,
  primaryKey: 'templateId',
  type: 'object',
  properties: {
    templateId: { type: 'string', maxLength: 120 },
    drugCode: { type: 'string', maxLength: 100 },
    drugName: { type: 'string', maxLength: 200 },
    genericName: { type: 'string', maxLength: 200 },
    status: { type: 'string', enum: ['draft', 'approved', 'needs_review', 'retired'], maxLength: 50 },
    effectText: { type: 'string' },
    sideEffectText: { type: 'string' },
    interactionText: { type: 'string' },
    storageText: { type: 'string' },
    counselingText: { type: 'string' },
    sourceType: { type: 'string', enum: ['pmda_insert', 'pmda_patient_guide', 'pharmacy_authored', 'licensed', 'other'], maxLength: 50 },
    sourceUrl: { type: 'string' },
    sourceRevisionDate: { type: 'string' },
    sourceHash: { type: 'string', maxLength: 128 },
    reviewerId: { type: 'string', maxLength: 100 },
    approvedAt: { type: 'string', format: 'date-time' },
    needsReviewReason: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['templateId', 'drugCode', 'drugName', 'status'],
  indexes: ['drugCode', 'status']
};

export const USER_SCHEMA: RxJsonSchema<User> = {
  title: 'user schema',
  version: 2,
  primaryKey: 'userId',
  type: 'object',
  properties: {
    userId: { type: 'string', maxLength: 100 },
    name: { type: 'string', maxLength: 100 },
    role: { type: 'string', enum: ['admin', 'pharmacist', 'clerk'], maxLength: 50 },
    passwordHash: { type: 'string', maxLength: 256 },
    salt: { type: 'string', maxLength: 100 },
    passkeyCredentialId: { type: 'string', maxLength: 500 },
    passkeyPublicKey: { type: 'string', maxLength: 1000 }
  },
  required: ['userId', 'name', 'role']
};

export const ALERT_SCHEMA: RxJsonSchema<Alert> = {
  title: 'alert schema',
  version: 1,
  primaryKey: 'alertId',
  type: 'object',
  properties: {
    alertId: { type: 'string', maxLength: 100 },
    patientId: { type: 'string', maxLength: 100 },
    type: { type: 'string', enum: ['allergy', 'side_effect', 'chronic_disease'], maxLength: 50 },
    content: { type: 'string', maxLength: 2000 },
    status: { type: 'string', enum: ['active', 'resolved'], maxLength: 50 }
  },
  required: ['alertId', 'patientId', 'type', 'content'],
  indexes: ['patientId'],
  encrypted: ['content']
};

export const INTERVENTION_SCHEMA: RxJsonSchema<Intervention> = {
  title: 'intervention schema',
  version: 3,
  primaryKey: 'interventionId',
  type: 'object',
  properties: {
    interventionId: { type: 'string', maxLength: 100 },
    visitId: { type: 'string', maxLength: 100 },
    beforeSnapshot: { type: 'string', maxLength: 10000 },
    afterSnapshot: { type: 'string', maxLength: 10000 },
    reason: { type: 'string', maxLength: 2000 },
    inquiryStatus: { type: 'string', enum: ['none', 'pending', 'completed', 'cancelled'], maxLength: 50 },
    inquiryMethod: { type: 'string', enum: ['phone', 'fax', 'in_person', 'other'], maxLength: 50 },
    inquiryDoctor: { type: 'string', maxLength: 100 },
    inquiryResult: { type: 'string', maxLength: 2000 },
    responseDueDate: { type: 'string', format: 'date', maxLength: 50 },
    contactedAt: { type: 'string', format: 'date-time', maxLength: 50 },
    respondedAt: { type: 'string', format: 'date-time', maxLength: 50 },
    handledBy: { type: 'string', maxLength: 100 },
    note: { type: 'string', maxLength: 3000 },
    patientConsented: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['interventionId', 'visitId', 'reason'],
  indexes: ['visitId'],
  encrypted: ['beforeSnapshot', 'afterSnapshot', 'reason', 'inquiryDoctor', 'inquiryResult', 'note']
};

export const DRUG_SCHEMA: RxJsonSchema<Drug> = {
  title: 'drug schema',
  version: 6,
  description: 'Drug master data',
  primaryKey: 'code',
  type: 'object',
  properties: {
    code: { type: 'string', maxLength: 100 },
    name: { type: 'string', maxLength: 200 },
    yjCode: { type: 'string', maxLength: 100 },
    isGeneric: { type: 'boolean' },
    genericName: { type: 'string', maxLength: 200 },
    isAbolished: { type: 'boolean' },
    price: { type: 'number' },
    stockQuantity: { type: 'number' },
    location: { type: 'string', maxLength: 100 },
    isNarcotic: { type: 'boolean' },
    isPsychotropic: { type: 'boolean' },
    isPoisonous: { type: 'boolean' },
    isHighRisk: { type: 'boolean' },
    documentUrl: { type: 'string', maxLength: 1000 }
  },
  required: ['code', 'name', 'isGeneric']
};


export const DRUG_INFO_SCHEMA: RxJsonSchema<DrugInfo> = {
  title: 'drug info schema',
  version: 2,
  description: 'Drug information for contraindications and dosage warnings',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    drugName: { type: 'string', maxLength: 200 },
    genericName: { type: 'string', maxLength: 200 },
    contraindications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          targetDrugs: { type: 'array', items: { type: 'string' } },
          severity: { type: 'string' },
          clinicalEffect: { type: 'string' },
          mechanism: { type: 'string' },
          sourceUrl: { type: 'string' },
          fetchedAt: { type: 'string' },
          contentSha256: { type: 'string' }
        }
      }
    },
    usageWarnings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          condition: { type: 'string' },
          message: { type: 'string' },
          severity: { type: 'string' },
          type: { type: 'string' }
        }
      }
    },
    contraindicatedConditions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          conditionText: { type: 'string' },
          reason: { type: 'string' },
          sourceUrl: { type: 'string' },
          fetchedAt: { type: 'string' },
          contentSha256: { type: 'string' }
        }
      }
    }
  },
  required: ['id', 'drugName']
};

export const AUDIT_LOG_SCHEMA: RxJsonSchema<AuditLog> = {
  title: 'audit log schema',
  version: 18,
  primaryKey: 'logId',
  type: 'object',
  properties: {
    logId: { type: 'string', maxLength: 100 },
    timestamp: { type: 'string', format: 'date-time', maxLength: 50 },
    userId: { type: 'string', maxLength: 100 },
    userName: { type: 'string', maxLength: 100 },
    userRole: { type: 'string', enum: ['admin', 'pharmacist', 'clerk'], maxLength: 50 },
    actionType: { type: 'string', enum: ['login', 'prescription_ocr', 'prescription_edit', 'billing_toggle', 'claim_lifecycle', 'daily_closing_approval', 'daily_closing_kpi_action', 'session_lock', 'print', 'uke_export', 'stock_update', 'user_switch', 'facility_settings_update', 'drug_master_update', 'patient_medication_info_template', 'follow_up_record', 'ai_suggestion_review', 'electronic_prescription', 'external_device_handoff', 'staff_create', 'staff_delete', 'staff_credential_recovery', 'passkey_register', 'audit_export', 'audit_retention_approval', 'backup_export', 'backup_schedule_update', 'backup_external_storage', 'backup_external_transfer_manifest', 'backup_drill', 'backup_import', 'official_spec_review'], maxLength: 50 },
    patientId: { type: 'string', maxLength: 100 },
    patientName: { type: 'string', maxLength: 100 },
    details: { type: 'string', maxLength: 2000 },
    terminalId: { type: 'string', maxLength: 100 },
    previousHash: { type: 'string', maxLength: 200 },
    integrityHash: { type: 'string', maxLength: 200 }
  },
  required: ['logId', 'timestamp', 'userId', 'userName', 'userRole', 'actionType', 'details'],
  indexes: ['timestamp', 'userId', 'actionType']
};
