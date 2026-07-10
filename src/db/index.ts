import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { INITIAL_ADMIN_USER, REMOVED_DEMO_STAFF_USER_IDS } from '@/lib/initial_staff';
import { createDefaultSoapStructuredAssessment } from '@/lib/soap_structured_assessment';
import { PharmacyDatabase, PharmacyDatabaseCollections } from './types';
import {
  PATIENT_SCHEMA,
  VISIT_SCHEMA,
  PRESCRIPTION_ITEM_SCHEMA,
  SOAP_RECORD_SCHEMA,
  USER_SCHEMA,
  ALERT_SCHEMA,
  INTERVENTION_SCHEMA,
  DRUG_SCHEMA,
  DRUG_STOCK_SCHEMA,
  FACILITY_SETTINGS_SCHEMA,
  LOCATION_SCHEMA,
  MEDICATION_GUIDANCE_SCHEMA,
  PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA,
  AUDIT_LOG_SCHEMA
} from './schema';


// Add migration plugin
addRxPlugin(RxDBMigrationSchemaPlugin);

// In development, add dev-mode plugin for helpful errors
if (process.env.NODE_ENV === 'development') {
    addRxPlugin(RxDBDevModePlugin);
}

let dbPromise: Promise<PharmacyDatabase> | null = null;
const keepDocument = (oldDoc: any) => oldDoc;
type BulkWriteResultLike = {
    error?: unknown[];
};

function assertBulkWriteSuccess(result: BulkWriteResultLike, label: string) {
    const errors = Array.isArray(result.error) ? result.error : [];
    if (errors.length === 0) return;

    console.error(`${label} failed:`, errors);
    throw new Error(`${label} failed for ${errors.length} record(s).`);
}

// NEXT_PUBLIC_* env vars are inlined into the client bundle at build time, so
// they never provide confidentiality against someone reading the deployed JS —
// they only give each deployment a chosen, non-default encryption key. What we
// must never do is fall back to a single hardcoded literal: that would make
// every install that forgot to set NEXT_PUBLIC_DB_PASSWORD share the exact
// same RxDB encryption key, so one leaked/shared IndexedDB dump would unlock
// every other unconfigured install too. When the operator hasn't set the env
// var, generate a random key on first run and persist it in this browser
// profile only (unique per install, never leaves the device, never committed
// to source).
const LOCAL_DB_PASSWORD_KEY = 'pharmacy_os_local_db_password';

function generateRandomPassword(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function getOrCreateLocalDbPassword(): string {
    try {
        const existing = window.localStorage.getItem(LOCAL_DB_PASSWORD_KEY);
        if (existing) return existing;
        const generated = generateRandomPassword();
        window.localStorage.setItem(LOCAL_DB_PASSWORD_KEY, generated);
        return generated;
    } catch (e) {
        // localStorage unavailable (private browsing lockdown, etc.): fall back to an
        // in-memory-only random key. Data will not be readable across reloads in that
        // case, which is safer than reusing a fixed key.
        console.error('Failed to persist local DB encryption key; using a session-only key.', e);
        return generateRandomPassword();
    }
}

function resolveDbPassword(): string {
    const configured = process.env.NEXT_PUBLIC_DB_PASSWORD;
    if (configured) return configured;
    console.warn(
        'NEXT_PUBLIC_DB_PASSWORD is not set. Using a randomly generated, ' +
        'per-install encryption key stored in this browser profile. Set ' +
        'NEXT_PUBLIC_DB_PASSWORD explicitly before production use — see README.md.'
    );
    return getOrCreateLocalDbPassword();
}

// 旧バージョンは env 未設定時にこの固定文字列で暗号化していた。読み取り互換のためだけに
// 残している(新規DBには決して使わない)。この鍵で開けた場合は既知鍵のままなので、
// バックアップ→復旧で新しい鍵のDBへ移行することを推奨する。
const LEGACY_FIXED_DB_PASSWORD = 'secure-default-pharmacy-os-local-key-2026';

function persistResolvedDbPassword(password: string) {
    if (process.env.NEXT_PUBLIC_DB_PASSWORD) return;
    try {
        window.localStorage.setItem(LOCAL_DB_PASSWORD_KEY, password);
    } catch {
        // 保存できなくても起動は続行する(次回起動時に再度レガシー鍵で開く)
    }
}

const legacyMigrationStrategies = (
    schema: { version: number },
    zeroBasedStrategies: Record<number, (oldDoc: any) => any>
) => {
    const strategies: Record<number, (oldDoc: any) => any> = {};
    for (let nextVersion = 1; nextVersion <= schema.version; nextVersion++) {
        strategies[nextVersion] = zeroBasedStrategies[nextVersion - 1] || keepDocument;
    }
    return strategies;
};
const LEGACY_PENDING_WIPE_KEY = 'pharmacy_os_db_pending_wipe';
const DB_RECOVERY_NOTICE_KEY = 'pharmacy_os_db_recovery_required';
// RxDB 17.1.0 open-core currently rejects creation after 14 concurrently open collections.
const ACTIVE_RXDB_COLLECTION_LIMIT = 14;

async function seedReferenceData(db: PharmacyDatabase) {
    // Keep large reference-data JSON out of the critical app startup path. Staff login
    // and reception can render first; drug search data warms in the background.
    const guidanceCount = await db.medication_guidances.count().exec();
    if (guidanceCount === 0) {
        try {
            console.log("Seeding medication_guidances...");
            const { default: rawMedicationGuidanceData } = await import('@/lib/data/medication_guidances.json');
            if ((rawMedicationGuidanceData as unknown[]).length === 0) {
                console.log("Skipped medication_guidances seed because source data is empty.");
            } else {
                const result = await db.medication_guidances.bulkInsert(rawMedicationGuidanceData as any[]);
                assertBulkWriteSuccess(result, 'medication_guidances seed');
            }
            console.log("Seeded medication_guidances successfully.");
        } catch (e) {
            console.error("Failed to seed medication_guidances:", e);
        }
    }

    const drugCount = await db.drugs.count().exec();
    if (drugCount === 0) {
        try {
            console.log("Seeding drugs...");
            const [
                { default: rawDrugData },
                { default: rawGeneralDrugData }
            ] = await Promise.all([
                import('@/lib/data/drugs.json'),
                import('@/lib/data/general_drugs.json')
            ]);
            const seedData = [...(rawDrugData as any[]), ...(rawGeneralDrugData as any[])].map(d => ({
                code: d.code || '',
                name: d.name || '',
                yjCode: d.yjCode,
                isGeneric: !!d.isGeneric,
                genericName: d.genericName,
                isAbolished: false,
                price: d.price || 0
            }));
            const result = await db.drugs.bulkInsert(seedData);
            assertBulkWriteSuccess(result, 'drugs seed');
            console.log("Seeded drugs successfully.");
        } catch (e) {
            console.error("Failed to seed drugs:", e);
        }
    }
}

const recordDatabaseRecoveryNotice = (error: unknown, reason: string) => {
    if (typeof window === 'undefined') return;
    try {
        const errorMessage = error instanceof Error ? error.message : String(error || '');
        localStorage.setItem(DB_RECOVERY_NOTICE_KEY, JSON.stringify({
            occurredAt: new Date().toISOString(),
            reason,
            errorMessage
        }));
    } catch (storageError) {
        console.error('[Database Recovery] Failed to save recovery notice:', storageError);
    }
};

async function removeRemovedDemoStaffUsers(db: PharmacyDatabase) {
    const demoUsers = await db.users.find({
        selector: {
            userId: {
                $in: [...REMOVED_DEMO_STAFF_USER_IDS]
            }
        }
    }).exec();

    if (demoUsers.length === 0) return;

    try {
        await Promise.all(demoUsers.map((user) => user.remove()));
        console.log(`Removed ${demoUsers.length} demo staff user(s).`);
    } catch (e) {
        console.error('Failed to remove demo staff users:', e);
    }
}

async function seedInitialAdminUser(db: PharmacyDatabase) {
    const userCount = await db.users.count().exec();
    if (userCount > 0) return;

    try {
        await db.users.insert(INITIAL_ADMIN_USER);
        console.log('Seeded initial administrator user.');
    } catch (e) {
        console.error('Failed to seed initial administrator user:', e);
    }
}

const create = async () => {
    // Clear legacy auto-wipe requests from older builds. Production builds must never
    // delete patient data without an explicit administrator recovery workflow.
    if (typeof window !== 'undefined') {
        const pendingWipe = sessionStorage.getItem(LEGACY_PENDING_WIPE_KEY);
        if (pendingWipe === 'true') {
            sessionStorage.removeItem(LEGACY_PENDING_WIPE_KEY);
            recordDatabaseRecoveryNotice(
                new Error('Legacy automatic wipe request was blocked.'),
                '旧バージョンの自動DB削除要求を検出しましたが、患者データ保護のため削除せず停止しました。'
            );
        }
    }

    const storageWithValidation = wrappedValidateAjvStorage({
        storage: getRxStorageDexie()
    });

    const storageWithEncryption = wrappedKeyEncryptionCryptoJsStorage({
        storage: storageWithValidation
    });

    const password = resolveDbPassword();
    const openDatabase = (candidatePassword: string) => createRxDatabase<PharmacyDatabaseCollections>({
        name: 'pharmacy_os_db',
        password: candidatePassword,
        storage: storageWithEncryption,
        ignoreDuplicate: process.env.NODE_ENV === 'development'
    });

    const collectionDefinitions = {
        patients: {
            schema: PATIENT_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(PATIENT_SCHEMA, {
                // v0 -> v1: encrypted fields added. Returning the old doc triggers re-save with encryption.
                0: keepDocument,
                1: (oldDoc) => {
                    oldDoc.publicInsurances = oldDoc.publicInsurances || [];
                    return oldDoc;
                },
                2: keepDocument
            })
        },
        visits: {
            schema: VISIT_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(VISIT_SCHEMA, {
                0: keepDocument,
                1: (oldDoc) => ({
                    ...oldDoc,
                    claimOptions: oldDoc.claimOptions || {
                        drugFeeOnly: false,
                        disabledFeeCodes: []
                    }
                }),
                2: (oldDoc) => {
                    if (oldDoc.claimOptions) {
                        oldDoc.claimOptions.disabledFeeRationales = oldDoc.claimOptions.disabledFeeRationales || {};
                    }
                    return oldDoc;
                },
                3: (oldDoc) => {
                    const fallbackDate = typeof oldDoc.issueDate === 'string'
                        ? oldDoc.issueDate.slice(0, 10)
                        : undefined;
                    if (fallbackDate) {
                        oldDoc.prescriptionDate = oldDoc.prescriptionDate || fallbackDate;
                        oldDoc.dispensingDate = oldDoc.dispensingDate || fallbackDate;
                    }
                    return oldDoc;
                },
                4: keepDocument,
                5: keepDocument,
                6: keepDocument,
                7: keepDocument,
                8: keepDocument,
                9: keepDocument,
                10: keepDocument,
                11: keepDocument,
                12: keepDocument,
                13: keepDocument,
                14: (oldDoc) => {
                    const electronicPrescription = oldDoc.electronicPrescription;
                    if (electronicPrescription && !Array.isArray(electronicPrescription.linkedPrescriptions)) {
                        electronicPrescription.linkedPrescriptions = [{
                            prescriptionId: electronicPrescription.prescriptionId,
                            documentKind: electronicPrescription.documentKind,
                            validUntil: electronicPrescription.validUntil,
                            signatureStatus: electronicPrescription.signatureStatus,
                            duplicateCheckStatus: electronicPrescription.duplicateCheckStatus,
                            integrityHash: electronicPrescription.integrityHash,
                            paperOriginalConfirmed: electronicPrescription.paperOriginalConfirmed
                        }];
                    }
                    return oldDoc;
                },
                15: keepDocument,
                16: keepDocument,
                17: (oldDoc) => {
                    const electronicPrescription = oldDoc.electronicPrescription;
                    if (electronicPrescription && electronicPrescription.dispensingResultEverRegistered === undefined) {
                        electronicPrescription.dispensingResultEverRegistered = electronicPrescription.dispensingResultStatus === 'registered'
                            || !!electronicPrescription.dispensingResultId;
                    }
                    return oldDoc;
                },
                18: keepDocument,
                19: keepDocument
            })
        },
        prescription_items: {
            schema: PRESCRIPTION_ITEM_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(PRESCRIPTION_ITEM_SCHEMA, {
                0: keepDocument,
                1: (oldDoc) => {
                    oldDoc.tokkanType = oldDoc.tokkanType || 'none';
                    return oldDoc;
                },
                2: (oldDoc) => {
                    oldDoc.claimPreparation = oldDoc.claimPreparation !== false;
                    oldDoc.claimManagement = oldDoc.claimManagement !== false;
                    oldDoc.claimDrugFee = oldDoc.claimDrugFee !== false;
                    oldDoc.isDiagnosticTest = !!oldDoc.isDiagnosticTest;
                    return oldDoc;
                },
                3: (oldDoc) => {
                    oldDoc.claimPreparation = oldDoc.claimPreparation !== false;
                    oldDoc.claimManagement = oldDoc.claimManagement !== false;
                    oldDoc.claimDrugFee = oldDoc.claimDrugFee !== false;
                    oldDoc.isDiagnosticTest = !!oldDoc.isDiagnosticTest;
                    return oldDoc;
                },
                4: (oldDoc) => {
                    oldDoc.isPicked = !!oldDoc.isPicked;
                    return oldDoc;
                },
                5: keepDocument,
                6: keepDocument,
                9: (oldDoc) => {
                    oldDoc.billingAgentGroupKey = oldDoc.billingAgentGroupKey || '';
                    oldDoc.billingAgentGroupReason = oldDoc.billingAgentGroupReason || '';
                    return oldDoc;
                },
                10: keepDocument,
                11: keepDocument
            })
        },
        soap_records: {
            schema: SOAP_RECORD_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(SOAP_RECORD_SCHEMA, {
                0: keepDocument,
                1: (oldDoc) => {
                    return {
                        ...oldDoc,
                        problems: [
                            {
                                id: 'prob_1',
                                title: '#1 ',
                                entries: [
                                    ...(oldDoc.s_text ? [{ type: 'S', text: oldDoc.s_text }] : []),
                                    ...(oldDoc.o_text ? [{ type: 'O', text: oldDoc.o_text }] : []),
                                    ...(oldDoc.a_text ? [{ type: 'A', text: oldDoc.a_text }] : []),
                                    ...(oldDoc.p_text ? [{ type: 'P', text: oldDoc.p_text }] : [])
                                ]
                            }
                        ]
                    };
                },
                2: (oldDoc) => {
                    oldDoc.structuredAssessment = oldDoc.structuredAssessment || createDefaultSoapStructuredAssessment();
                    return oldDoc;
                }
            })
        },
        medication_guidances: {
            schema: MEDICATION_GUIDANCE_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(MEDICATION_GUIDANCE_SCHEMA, {
                0: keepDocument
            })
        },
        patient_medication_info_templates: {
            schema: PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(PATIENT_MEDICATION_INFO_TEMPLATE_SCHEMA, {
                0: keepDocument
            })
        },
        users: {
            schema: USER_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(USER_SCHEMA, {
                0: keepDocument,
                1: keepDocument
            })
        },
        alerts: {
            schema: ALERT_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(ALERT_SCHEMA, {
                0: keepDocument
            })
        },

        interventions: {
            schema: INTERVENTION_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(INTERVENTION_SCHEMA, {
                0: keepDocument,
                1: (oldDoc) => {
                    oldDoc.inquiryStatus = oldDoc.inquiryStatus || 'none';
                    oldDoc.inquiryDoctor = oldDoc.inquiryDoctor || '';
                    oldDoc.inquiryResult = oldDoc.inquiryResult || '';
                    oldDoc.patientConsented = oldDoc.patientConsented !== false;
                    oldDoc.createdAt = oldDoc.createdAt || new Date().toISOString();
                    return oldDoc;
                },
                2: keepDocument
            })
        },
        drugs: {
            schema: DRUG_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(DRUG_SCHEMA, {
                0: keepDocument,
                1: (oldDoc) => {
                    oldDoc.location = oldDoc.location || undefined;
                    return oldDoc;
                },
                2: (oldDoc) => {
                    oldDoc.stockQuantity = oldDoc.stockQuantity || 0;
                    return oldDoc;
                },
                3: (oldDoc) => {
                    oldDoc.isNarcotic = oldDoc.isNarcotic || false;
                    oldDoc.isPsychotropic = oldDoc.isPsychotropic || false;
                    oldDoc.isPoisonous = oldDoc.isPoisonous || false;
                    oldDoc.isHighRisk = oldDoc.isHighRisk || false;
                    return oldDoc;
                },
                4: keepDocument,
                5: keepDocument
            })
        },
        drug_stocks: {
            schema: DRUG_STOCK_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(DRUG_STOCK_SCHEMA, {
                0: keepDocument,
                1: keepDocument,
                2: (oldDoc) => {
                    oldDoc.expirationDate = oldDoc.expirationDate || '9999-99-99';
                    return oldDoc;
                },
                3: (oldDoc) => {
                    if (oldDoc.expirationDate === '9999-99-99') {
                        delete oldDoc.expirationDate;
                    }
                    return oldDoc;
                }
            })
        },
        facility_settings: {
            schema: FACILITY_SETTINGS_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(FACILITY_SETTINGS_SCHEMA, {
                0: keepDocument,
                1: (oldDoc) => ({
                    ...oldDoc,
                    genericDispensingReduction: !!oldDoc.genericDispensingReduction
                }),
                2: (oldDoc) => ({
                    ...oldDoc,
                    pharmacyName: oldDoc.pharmacyName || 'Next-Gen 薬局',
                    pharmacyKana: oldDoc.pharmacyKana || '',
                    pharmacyCode: oldDoc.pharmacyCode || '',
                    pharmacyPostalCode: oldDoc.pharmacyPostalCode || '123-4567',
                    pharmacyAddress: oldDoc.pharmacyAddress || '東京都渋谷区桜丘町26-1',
                    pharmacyPhone: oldDoc.pharmacyPhone || '03-1234-5678',
                    pharmacyFax: oldDoc.pharmacyFax || '',
                    registrationNumber: oldDoc.registrationNumber || 'T1234567890123',
                    ownerName: oldDoc.ownerName || '',
                    managerName: oldDoc.managerName || '',
                    defaultPharmacistName: oldDoc.defaultPharmacistName || '山田'
                }),
                3: (oldDoc) => ({
                    ...oldDoc,
                    officialFeeCodeOverrides: oldDoc.officialFeeCodeOverrides || {}
                }),
                4: (oldDoc) => ({
                    ...oldDoc,
                    aiAssistMode: oldDoc.aiAssistMode || 'enabled'
                })
            })
        },
        locations: {
            schema: LOCATION_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(LOCATION_SCHEMA, {
                0: keepDocument
            })
        },
        audit_logs: {
            schema: AUDIT_LOG_SCHEMA,
            migrationStrategies: legacyMigrationStrategies(AUDIT_LOG_SCHEMA, {
                0: keepDocument,
                1: keepDocument,
                2: keepDocument,
                15: keepDocument,
                16: keepDocument
            })
        }
    };
    const activeCollectionCount = Object.keys(collectionDefinitions).length;
    if (activeCollectionCount > ACTIVE_RXDB_COLLECTION_LIMIT) {
        throw new Error(
            `RxDBコレクション数 ${activeCollectionCount}件が無償版上限 ${ACTIVE_RXDB_COLLECTION_LIMIT}件を超えています。`
        );
    }

    // 鍵不一致(RxDBのDB1)はcreateRxDatabaseではなくaddCollections時に検出されるため、
    // オープンとコレクション登録をひとまとめにして鍵を検証する。
    const openWithCollections = async (candidatePassword: string) => {
        const candidateDb = await openDatabase(candidatePassword);
        try {
            await candidateDb.addCollections(collectionDefinitions);
            return candidateDb;
        } catch (error) {
            // 同名DBを別の鍵で開き直せるよう、失敗したインスタンスは閉じてから投げ直す
            try {
                await candidateDb.close();
            } catch (closeError) {
                console.error('Failed to close database instance after open failure:', closeError);
            }
            throw error;
        }
    };

    let db;
    try {
        db = await openWithCollections(password);
    } catch (error: any) {
        // 鍵不一致(DB1)は、旧バージョンの固定既定鍵で作成された既存DBの可能性がある。
        // ロックアウト(患者データへアクセス不能)を避けるため、一度だけレガシー鍵で開き直す。
        // 開けた場合は次回以降も同じ鍵で開けるよう保存し、新しい鍵への移行を警告する。
        const isPasswordMismatch = error?.code === 'DB1';
        if (isPasswordMismatch && password !== LEGACY_FIXED_DB_PASSWORD) {
            try {
                db = await openWithCollections(LEGACY_FIXED_DB_PASSWORD);
                persistResolvedDbPassword(LEGACY_FIXED_DB_PASSWORD);
                console.warn(
                    'このデータベースは旧バージョンの既定の暗号化キーで作成されています。' +
                    '公開されている既知の鍵のため、暗号化バックアップを書き出し、' +
                    'NEXT_PUBLIC_DB_PASSWORD を設定した環境で復旧して新しい鍵へ移行してください。'
                );
            } catch (legacyError) {
                console.error('Legacy-key open attempt also failed:', legacyError);
                console.warn('Database initialization failed. Manual recovery is required; automatic wipe is disabled.', error);
                recordDatabaseRecoveryNotice(
                    error,
                    'データベース初期化に失敗しました。自動削除は実行していません。バックアップ確認後に管理者が復旧してください。'
                );
                throw error;
            }
        } else {
            console.warn('Database initialization failed. Manual recovery is required; automatic wipe is disabled.', error);
            recordDatabaseRecoveryNotice(
                error,
                'データベース初期化に失敗しました。自動削除は実行していません。バックアップ確認後に管理者が復旧してください。'
            );
            throw error;
        }
    }

    const settingsCount = await db.facility_settings.count().exec();
    if (settingsCount === 0) {
        await db.facility_settings.insert({
            id: 'default',
            pharmacyName: 'Next-Gen 薬局',
            pharmacyKana: '',
            pharmacyCode: '',
            pharmacyPostalCode: '123-4567',
            pharmacyAddress: '東京都渋谷区桜丘町26-1',
            pharmacyPhone: '03-1234-5678',
            pharmacyFax: '',
            registrationNumber: 'T1234567890123',
            ownerName: '',
            managerName: '',
            defaultPharmacistName: '山田',
            baseFeeCategory: '1',
            regionalSupportAddition: 'none',
            medicalDxAddition: false,
            postGenericAddition: 'none',
            genericDispensingReduction: false,
            aiAssistMode: 'limited',
            officialFeeCodeOverrides: {}
        });
    }

    await removeRemovedDemoStaffUsers(db);
    await seedInitialAdminUser(db);

    const warmReferenceData = () => {
        seedReferenceData(db).catch((error) => {
            console.error('Failed to warm reference data:', error);
        });
    };
    if (typeof window !== 'undefined') {
        window.setTimeout(warmReferenceData, 2500);
    } else {
        warmReferenceData();
    }

    return db;
};

export const getDatabase = () => {
    if (!dbPromise) {
        dbPromise = create();
    }
    return dbPromise;
};
