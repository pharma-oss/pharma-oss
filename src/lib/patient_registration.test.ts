import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { PATIENT_SCHEMA } from '@/db/schema';
import type { Patient } from '@/db/types';
import { AuditLogFailedError } from '@/lib/audit_guard';
import {
  applyMynaToRegistrationForm,
  buildPatientRecord,
  buildPatientRegistrationFormFromMyna,
  EMPTY_PATIENT_REGISTRATION_FORM,
  normalizeKana,
  PATIENT_REGISTRATION_AUDIT_FAILED_MESSAGE,
  registerPatient,
  validatePatientRegistration,
  type PatientRegistrationDb,
  type PatientRegistrationForm
} from '@/lib/patient_registration';
import {
  attachPatientSearchIndexHooks,
  computePatientBlindIndexFields,
  getPatientSearchIndexVersionTag,
  registerPatientSearchIndexKey,
  type PatientBirthDateBlindIndexQuery
} from '@/lib/patient_search_index';

addRxPlugin(RxDBMigrationSchemaPlugin);
const identityMigration = <T>(doc: T): T => doc;

const validForm: PatientRegistrationForm = {
  name: '山田 太郎',
  kana: 'やまだ たろう',
  birthDate: '19850315',
  gender: 'male',
  insurerNumber: '06139999',
  insuredNumber: '記号12 番号345',
  burdenRatio: '30'
};

// 2026-10-26 08:00(日本時間の朝。UTC では前日)
const now = new Date(2026, 9, 26, 8, 0, 0);

function expectOk(form: PatientRegistrationForm) {
  const result = validatePatientRegistration(form, now);
  assert.ok(result.ok, `expected valid: ${JSON.stringify(result)}`);
  return result.value;
}

function expectErrors(form: PatientRegistrationForm) {
  const result = validatePatientRegistration(form, now);
  assert.equal(result.ok, false);
  return result.ok ? {} : result.errors;
}

describe('validatePatientRegistration', () => {
  it('正しい入力は通り、生年月日8桁は YYYY-MM-DD、フリガナは全角カタカナにそろう', () => {
    const value = expectOk(validForm);
    assert.equal(value.name, '山田 太郎');
    assert.equal(value.kana, 'ヤマダ タロウ');
    assert.equal(value.birthDate, '1985-03-15');
    assert.equal(value.gender, 'male');
    assert.equal(value.insurerNumber, '06139999');
    assert.equal(value.insuredNumber, '記号12 番号345');
    assert.equal(value.burdenRatio, 30);
  });

  it('氏名・生年月日・性別は必須。保険情報とフリガナは空でもよい', () => {
    const errors = expectErrors({ ...EMPTY_PATIENT_REGISTRATION_FORM });
    assert.deepEqual(Object.keys(errors).sort(), ['birthDate', 'gender', 'name']);

    const minimal = expectOk({ ...EMPTY_PATIENT_REGISTRATION_FORM, name: '佐藤 花子', birthDate: '2001-02-03', gender: 'female' });
    assert.equal(minimal.kana, '');
    assert.equal(minimal.insurerNumber, '');
    assert.equal(minimal.insuredNumber, '');
  });

  it('空白だけの氏名は未入力として扱う', () => {
    assert.ok(expectErrors({ ...validForm, name: '  　 ' }).name);
  });

  it('生年月日は、実在する日付だけを通す(2月30日・桁不足は不可)', () => {
    assert.ok(expectErrors({ ...validForm, birthDate: '19850230' }).birthDate);
    assert.ok(expectErrors({ ...validForm, birthDate: '198503' }).birthDate);
    assert.ok(expectErrors({ ...validForm, birthDate: 'abc' }).birthDate);
    assert.equal(expectOk({ ...validForm, birthDate: '1985/3/15' }).birthDate, '1985-03-15');
    assert.equal(expectOk({ ...validForm, birthDate: '１９８５０３１５' }).birthDate, '1985-03-15');
  });

  it('生年月日が未来なら不可。今日は通り、日本時間の朝でも前日扱いにしない', () => {
    assert.ok(expectErrors({ ...validForm, birthDate: '2026-10-27' }).birthDate);
    assert.equal(expectOk({ ...validForm, birthDate: '2026-10-26' }).birthDate, '2026-10-26');
  });

  it('性別は男性・女性・その他のいずれかを選ぶ', () => {
    assert.ok(expectErrors({ ...validForm, gender: '' }).gender);
    assert.equal(expectOk({ ...validForm, gender: 'other' }).gender, 'other');
  });

  it('保険者番号は半角数字の6桁か8桁。全角・空白・ハイフンは取り除く', () => {
    assert.ok(expectErrors({ ...validForm, insurerNumber: '0613999' }).insurerNumber);
    assert.ok(expectErrors({ ...validForm, insurerNumber: '社保' }).insurerNumber);
    assert.ok(expectErrors({ ...validForm, insurerNumber: '0613999912' }).insurerNumber);
    assert.equal(expectOk({ ...validForm, insurerNumber: '０６１３９９９９' }).insurerNumber, '06139999');
    assert.equal(expectOk({ ...validForm, insurerNumber: '06 13-99 99' }).insurerNumber, '06139999');
    assert.equal(expectOk({ ...validForm, insurerNumber: '138012' }).insurerNumber, '138012');
  });

  it('文字数の上限(氏名100・記号番号50)を超えたら不可', () => {
    assert.ok(expectErrors({ ...validForm, name: 'あ'.repeat(101) }).name);
    assert.ok(expectErrors({ ...validForm, insuredNumber: 'a'.repeat(51) }).insuredNumber);
  });
});

describe('normalizeKana', () => {
  it('ひらがな・半角カナを全角カタカナにし、空白は半角1つにする', () => {
    assert.equal(normalizeKana('やまだ　たろう'), 'ヤマダ タロウ');
    assert.equal(normalizeKana('ﾔﾏﾀﾞ  ﾀﾛｳ'), 'ヤマダ タロウ');
    assert.equal(normalizeKana('  '), '');
  });
});

describe('buildPatientRecord', () => {
  it('保険者番号は provider、記号・番号は number に入れ、空の項目は作らない', () => {
    const value = expectOk(validForm);
    assert.deepEqual(buildPatientRecord(value, 'pt_1'), {
      patientId: 'pt_1',
      name: '山田 太郎',
      kana: 'ヤマダ タロウ',
      birthDate: '1985-03-15',
      gender: 'male',
      insuranceInfo: { provider: '06139999', number: '記号12 番号345', burdenRatio: 30 }
    });

    const minimal = buildPatientRecord(expectOk({ ...validForm, insurerNumber: '', insuredNumber: '', burdenRatio: '10' }), 'pt_2');
    assert.deepEqual(minimal.insuranceInfo, { burdenRatio: 10 });

    const withType = buildPatientRecord(expectOk({ ...validForm, insuranceType: '国保' }), 'pt_3');
    assert.equal(withType.insuranceInfo?.insuranceType, '国保');
    assert.ok(expectErrors({ ...validForm, insuranceType: '不正種別' as never }).insuranceType);
  });
});

describe('buildPatientRegistrationFormFromMyna', () => {
  const folderResult = {
    name: '山田 太郎',
    kana: 'ヤマダ タロウ',
    birthDate: '1985-03-15',
    gender: 'male' as const,
    insuranceInfo: { provider: '06139999', number: '記号12 番号345 枝番01', burdenRatio: 20 }
  };

  it('連携フォルダの読取結果から、氏名・フリガナ・生年月日・性別・保険者番号・記号番号・負担割合を引き継ぐ', () => {
    assert.deepEqual(buildPatientRegistrationFormFromMyna(folderResult), {
      name: '山田 太郎',
      kana: 'ヤマダ タロウ',
      birthDate: '1985-03-15',
      gender: 'male',
      insurerNumber: '06139999',
      insuredNumber: '記号12 番号345 枝番01',
      burdenRatio: '20'
    });
  });

  it('読取結果から作ったフォームは、そのまま検証を通って登録できる', () => {
    const value = expectOk(buildPatientRegistrationFormFromMyna(folderResult));
    assert.equal(value.burdenRatio, 20);
    assert.equal(value.birthDate, '1985-03-15');
  });

  it('保険者番号の欄には数字の保険者番号だけを入れる(「社保」のような種別は入れず、番号は記号・番号の欄へ)', () => {
    const form = buildPatientRegistrationFormFromMyna({
      name: 'マイナ 太郎',
      birthDate: '1980-01-01',
      gender: 'male',
      insuranceInfo: { provider: '社保', number: '12345678', burdenRatio: 30 }
    });
    assert.equal(form.insurerNumber, '');
    assert.equal(form.insuredNumber, '12345678');
  });

  it('性別・負担割合が読めなかったときは、性別を未選択にし、負担割合は渡した既定値のまま', () => {
    const form = buildPatientRegistrationFormFromMyna(
      { name: '佐藤 花子', birthDate: '2001-02-03', insuranceInfo: {} },
      '10'
    );
    assert.equal(form.gender, '');
    assert.equal(form.burdenRatio, '10');
    // 10・20・30 以外(0 や 40)は選択肢に無いので既定値にする
    assert.equal(buildPatientRegistrationFormFromMyna({ ...folderResult, insuranceInfo: { burdenRatio: 0 } }, '30').burdenRatio, '30');
  });

  it('ひらがなのフリガナ・スラッシュ区切りの生年月日も、登録フォームの形にそろえる', () => {
    const form = buildPatientRegistrationFormFromMyna({ ...folderResult, kana: 'やまだ たろう', birthDate: '1985/3/15' });
    assert.equal(form.kana, 'ヤマダ タロウ');
    assert.equal(form.birthDate, '1985-03-15');
  });
});

describe('applyMynaToRegistrationForm', () => {
  it('マイナで読めた項目は上書きし、読めなかった項目は入力済みの値を残す', () => {
    const current: PatientRegistrationForm = {
      ...EMPTY_PATIENT_REGISTRATION_FORM,
      name: '山田 太',
      kana: 'ヤマダ タロウ',
      birthDate: '1985-03-15',
      gender: 'female',
      burdenRatio: '10'
    };
    const merged = applyMynaToRegistrationForm(current, {
      name: '山田 太郎',
      birthDate: '1985-03-15',
      insuranceInfo: { provider: '06139999', burdenRatio: 20 }
    });
    assert.equal(merged.name, '山田 太郎');
    assert.equal(merged.kana, 'ヤマダ タロウ');
    assert.equal(merged.gender, 'female');
    assert.equal(merged.insurerNumber, '06139999');
    assert.equal(merged.burdenRatio, '20');

    // 負担割合が読めなければ、いま選んでいる値のまま
    assert.equal(applyMynaToRegistrationForm(current, { name: '山田 太郎', birthDate: '1985-03-15' }).burdenRatio, '10');
  });
});

interface FakeStore {
  db: PatientRegistrationDb;
  inserted: Patient[];
  removedIds: string[];
  audited: Patient[];
}

function createFakeDb(existing: Patient[] = [], options: { failInsert?: boolean; failRemove?: boolean } = {}): FakeStore {
  const inserted: Patient[] = [];
  const removedIds: string[] = [];
  const rows = [...existing];
  const db: PatientRegistrationDb = {
    patients: {
      find: () => ({ exec: async () => rows.map((row) => ({ toJSON: () => row })) }),
      insert: async (doc: Patient) => {
        if (options.failInsert) throw new Error('insert failed');
        inserted.push(doc);
        rows.push(doc);
        return { toJSON: () => doc, patch: async () => ({}) };
      },
      findOne: (id: string) => ({
        exec: async () => ({
          remove: async () => {
            if (options.failRemove) throw new Error('remove failed');
            removedIds.push(id);
            const index = rows.findIndex((row) => row.patientId === id);
            if (index >= 0) rows.splice(index, 1);
          }
        })
      })
    }
  };
  return { db, inserted, removedIds, audited: [] };
}

const existingPatient: Patient = {
  patientId: 'pt_existing',
  name: '山田　太郎',
  kana: 'ヤマダ タロウ',
  birthDate: '1985-03-15',
  insuranceInfo: { burdenRatio: 30 }
};

describe('registerPatient', () => {
  it('新規患者を登録し、監査ログに記録して、登録した患者を返す', async () => {
    const store = createFakeDb();
    const value = expectOk({ ...validForm, name: '鈴木 一郎', birthDate: '1970-04-05' });
    const outcome = await registerPatient({
      db: store.db,
      value,
      generatePatientId: () => 'pt_new',
      logAudit: async (patient) => { store.audited.push(patient); return true; }
    });
    assert.equal(outcome.status, 'registered');
    assert.equal(store.inserted.length, 1);
    assert.equal(store.inserted[0].patientId, 'pt_new');
    assert.equal(store.inserted[0].name, '鈴木 一郎');
    assert.deepEqual(store.audited.map((patient) => patient.patientId), ['pt_new']);
    if (outcome.status === 'registered') assert.equal(outcome.patient.patientId, 'pt_new');
  });

  it('同じ氏名(空白・全角半角の違いは無視)と生年月日の患者がいれば、登録せずその患者を返す', async () => {
    const store = createFakeDb([existingPatient]);
    const outcome = await registerPatient({
      db: store.db,
      value: expectOk(validForm),
      generatePatientId: () => 'pt_new',
      logAudit: async (patient) => { store.audited.push(patient); return true; }
    });
    assert.equal(outcome.status, 'duplicate');
    if (outcome.status === 'duplicate') assert.equal(outcome.patient.patientId, 'pt_existing');
    assert.equal(store.inserted.length, 0);
    assert.equal(store.audited.length, 0);
  });

  it('氏名が同じでも生年月日が違えば、別の患者として登録する', async () => {
    const store = createFakeDb([existingPatient]);
    const outcome = await registerPatient({
      db: store.db,
      value: expectOk({ ...validForm, birthDate: '1962-11-30' }),
      generatePatientId: () => 'pt_new',
      logAudit: async () => true
    });
    assert.equal(outcome.status, 'registered');
    assert.equal(store.inserted.length, 1);
  });

  it('監査ログが残らなかったら、登録を取り消してエラーにする', async () => {
    const store = createFakeDb();
    await assert.rejects(
      registerPatient({
        db: store.db,
        value: expectOk(validForm),
        generatePatientId: () => 'pt_new',
        logAudit: async () => false
      }),
      (error: unknown) => error instanceof AuditLogFailedError && error.message === PATIENT_REGISTRATION_AUDIT_FAILED_MESSAGE
    );
    assert.deepEqual(store.removedIds, ['pt_new']);
  });

  it('監査ログが残らず、取り消しにも失敗したら、その旨をメッセージに加える', async () => {
    const store = createFakeDb([], { failRemove: true });
    await assert.rejects(
      registerPatient({
        db: store.db,
        value: expectOk(validForm),
        generatePatientId: () => 'pt_new',
        logAudit: async () => false
      }),
      (error: unknown) => error instanceof AuditLogFailedError && error.rollbackFailed && error.message.includes('元に戻す処理にも失敗')
    );
  });

  it('書き込みに失敗したら、監査ログは記録せずエラーにする', async () => {
    const store = createFakeDb([], { failInsert: true });
    let audited = false;
    await assert.rejects(
      registerPatient({
        db: store.db,
        value: expectOk(validForm),
        generatePatientId: () => 'pt_new',
        logAudit: async () => { audited = true; return true; }
      }),
      { message: 'insert failed' }
    );
    assert.equal(audited, false);
  });
});

async function createEncryptedPatientRxDb(password: string) {
  const storage = wrappedKeyEncryptionCryptoJsStorage({
    storage: wrappedValidateAjvStorage({
      storage: getRxStorageMemory()
    })
  });
  const db = await createRxDatabase({
    name: `patient_reg_blind_index_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    password,
    storage,
    multiInstance: false
  });
  await db.addCollections({
    patients: {
      schema: PATIENT_SCHEMA,
      migrationStrategies: {
        1: identityMigration,
        2: identityMigration,
        3: identityMigration,
        4: identityMigration,
        5: identityMigration,
        6: identityMigration
      }
    }
  });
  return db;
}

describe('registerPatient with PATIENT_SCHEMA v5 keyed blind index', () => {
  it('全患者が索引済みなら birthDateHash クエリのみで重複検出し、全件スキャンを行わない', async () => {
    const password = 'reg-blind-index-password-2026';
    const db = await createEncryptedPatientRxDb(password);
    try {
      const hmacKey = registerPatientSearchIndexKey(db, password);
      const versionTag = getPatientSearchIndexVersionTag(hmacKey);
      attachPatientSearchIndexHooks(db.patients, hmacKey);

      await db.patients.insert({
        patientId: 'pt_existing',
        name: '山田　太郎',
        kana: 'ヤマダ タロウ',
        birthDate: '1985-03-15',
        insuranceInfo: { burdenRatio: 30 }
      });
      await db.patients.insert({
        patientId: 'pt_other',
        name: '鈴木 一郎',
        kana: 'スズキ イチロウ',
        birthDate: '1970-04-05',
        insuranceInfo: { burdenRatio: 30 }
      });

      const recordedQueries: Array<PatientBirthDateBlindIndexQuery | undefined> = [];
      const spiedDb: PatientRegistrationDb = {
        patients: {
          find: (query?: PatientBirthDateBlindIndexQuery) => {
            recordedQueries.push(query);
            return db.patients.find(query);
          },
          insert: (doc: Patient) => db.patients.insert(doc),
          findOne: (id: string) => db.patients.findOne(id)
        }
      };
      registerPatientSearchIndexKey(spiedDb, password);

      const expectedHash = computePatientBlindIndexFields(
        { name: '山田 太郎', kana: 'ヤマダ タロウ', birthDate: '1985-03-15' },
        hmacKey
      ).birthDateHash;

      // 1. 重複患者は birthDateHash 索引のみで検出し、無条件 find() を呼ばない
      const dupOutcome = await registerPatient({
        db: spiedDb,
        value: expectOk(validForm),
        generatePatientId: () => 'pt_dup_blocked',
        logAudit: async () => true
      });
      assert.equal(dupOutcome.status, 'duplicate');
      if (dupOutcome.status === 'duplicate') {
        assert.equal(dupOutcome.patient.patientId, 'pt_existing');
      }
      assert.deepEqual(recordedQueries, [
        { selector: { searchIndexVersion: { $ne: versionTag } }, limit: 1 },
        { selector: { birthDateHash: expectedHash } }
      ]);

      // 2. 同生年月日・別氏名の患者も全件スキャンなしで新規登録でき、索引が付与される
      recordedQueries.length = 0;
      const sameBirthDifferentName = await registerPatient({
        db: spiedDb,
        value: expectOk({ ...validForm, name: '高橋 花子', kana: 'タカハシ ハナコ', gender: 'female' }),
        generatePatientId: () => 'pt_same_birth',
        logAudit: async () => true
      });
      assert.equal(sameBirthDifferentName.status, 'registered');
      assert.equal(recordedQueries.every((query) => query !== undefined), true);
      const savedSameBirth = await db.patients.findOne('pt_same_birth').exec();
      assert.equal((savedSameBirth?.toJSON() as Patient).searchIndexVersion, versionTag);
      assert.equal((savedSameBirth?.toJSON() as Patient).birthDateHash, expectedHash);

      // 3. 該当生年月日が 0 件でも全件スキャンへフォールバックせず登録完了する
      recordedQueries.length = 0;
      const newBirthOutcome = await registerPatient({
        db: spiedDb,
        value: expectOk({ ...validForm, name: '佐藤 新規', birthDate: '1991-09-09' }),
        generatePatientId: () => 'pt_new_birth',
        logAudit: async () => true
      });
      assert.equal(newBirthOutcome.status, 'registered');
      assert.equal(recordedQueries.length, 2);
      assert.equal(recordedQueries.every((query) => query !== undefined), true);
    } finally {
      await db.close();
    }
  });

  it('未索引レコードが残っている場合は安全に全件フォールバックし、重複患者を見逃さない', async () => {
    const password = 'reg-blind-index-legacy-2026';
    const db = await createEncryptedPatientRxDb(password);
    try {
      // フック登録前に旧 v4 相当の未索引レコードを挿入
      await db.patients.insert({
        patientId: 'pt_legacy_unindexed',
        name: '山田　太郎',
        kana: 'ヤマダ タロウ',
        birthDate: '1985-03-15',
        insuranceInfo: { burdenRatio: 30 }
      });

      const recordedQueries: Array<PatientBirthDateBlindIndexQuery | undefined> = [];
      const spiedDb: PatientRegistrationDb = {
        patients: {
          find: (query?: PatientBirthDateBlindIndexQuery) => {
            recordedQueries.push(query);
            return db.patients.find(query);
          },
          insert: (doc: Patient) => db.patients.insert(doc),
          findOne: (id: string) => db.patients.findOne(id)
        }
      };
      const hmacKey = registerPatientSearchIndexKey(spiedDb, password);
      const versionTag = getPatientSearchIndexVersionTag(hmacKey);

      const outcome = await registerPatient({
        db: spiedDb,
        value: expectOk(validForm),
        generatePatientId: () => 'pt_should_not_insert',
        logAudit: async () => true
      });
      assert.equal(outcome.status, 'duplicate');
      if (outcome.status === 'duplicate') {
        assert.equal(outcome.patient.patientId, 'pt_legacy_unindexed');
      }
      assert.deepEqual(recordedQueries, [
        { selector: { searchIndexVersion: { $ne: versionTag } }, limit: 1 },
        undefined
      ]);
      const blockedDoc = await db.patients.findOne('pt_should_not_insert').exec();
      assert.equal(blockedDoc, null);
    } finally {
      await db.close();
    }
  });
});
