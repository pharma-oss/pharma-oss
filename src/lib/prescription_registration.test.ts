import { test } from 'node:test';
import assert from 'node:assert';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { PrescriptionRegistrationError, registerPrescriptionAtomically } from './prescription_registration.ts';

// 実際の RxDB(メモリ)で、処方箋の受付が「全部書けたときだけ残る」ことを確かめる。
async function createDb() {
  const db: any = await createRxDatabase({ name: `reg${Date.now()}${Math.random().toString(36).slice(2, 8)}`, storage: getRxStorageMemory() });
  const schema = (title: string, primaryKey: string, extra: Record<string, unknown> = {}) => ({
    title, version: 0, primaryKey, type: 'object',
    properties: { [primaryKey]: { type: 'string', maxLength: 100 }, ...extra }, required: [primaryKey]
  });
  await db.addCollections({
    patients: { schema: schema('patient', 'patientId', { name: { type: 'string' }, birthDate: { type: 'string' }, kana: { type: 'string' }, gender: { type: 'string' } }) },
    visits: { schema: schema('visit', 'visitId', { patientId: { type: 'string' }, status: { type: 'string' } }) },
    prescription_items: { schema: schema('item', 'itemId', { visitId: { type: 'string' }, drugId: { type: 'string' } }) }
  } as any);
  return db;
}

const counts = async (db: any) => ({
  patients: await db.patients.count().exec(),
  visits: await db.visits.count().exec(),
  items: await db.prescription_items.count().exec()
});

const visit = { visitId: 'v1', patientId: 'p1', status: 'processing' };
const items = [{ itemId: 'i1', visitId: 'v1', drugId: 'D1' }, { itemId: 'i2', visitId: 'v1', drugId: 'D2' }];

test('registerPrescriptionAtomically writes the new patient, the visit and every item', async () => {
  const db = await createDb();
  try {
    await registerPrescriptionAtomically({
      db, patientId: 'p1', patientUpdate: { name: '山田', birthDate: '1980-01-01' }, newPatientDefaults: { kana: '', gender: 'other' }, visit, items
    });
    assert.deepStrictEqual(await counts(db), { patients: 1, visits: 1, items: 2 });
    assert.strictEqual((await db.patients.findOne('p1').exec()).gender, 'other');
  } finally { await db.close(); }
});

test('registerPrescriptionAtomically updates an existing patient', async () => {
  const db = await createDb();
  try {
    await db.patients.insert({ patientId: 'p1', name: '旧姓', birthDate: '1980-01-01', kana: 'ヤマダ', gender: 'male' });
    const doc = await db.patients.findOne('p1').exec();
    await registerPrescriptionAtomically({
      db, patientId: 'p1', existingPatientDoc: doc, patientUpdate: { name: '新姓' }, newPatientDefaults: {}, visit, items
    });
    assert.strictEqual((await db.patients.findOne('p1').exec()).name, '新姓');
    assert.deepStrictEqual(await counts(db), { patients: 1, visits: 1, items: 2 });
  } finally { await db.close(); }
});

test('registerPrescriptionAtomically leaves nothing when one item cannot be saved (a new patient is removed too)', async () => {
  const db = await createDb();
  try {
    // i2 は別の受付の明細としてすでに存在する => bulkInsert はこの1件だけ失敗する(例外にはならない)
    await db.prescription_items.insert({ itemId: 'i2', visitId: 'other_visit', drugId: 'EXISTING' });

    await assert.rejects(
      () => registerPrescriptionAtomically({ db, patientId: 'p1', patientUpdate: { name: '山田' }, newPatientDefaults: {}, visit, items }),
      (error: unknown) => error instanceof PrescriptionRegistrationError && error.rollbackFailed === false && /処方明細の保存に失敗しました（1件）/.test(error.message)
    );

    assert.deepStrictEqual(await counts(db), { patients: 0, visits: 0, items: 1 }, 'only the unrelated, already existing item is left');
    assert.strictEqual((await db.prescription_items.findOne('i2').exec()).drugId, 'EXISTING', 'the existing item with the clashing id is untouched');
  } finally { await db.close(); }
});

test('registerPrescriptionAtomically puts an existing patient back when a later write fails', async () => {
  const db = await createDb();
  try {
    await db.patients.insert({ patientId: 'p1', name: '旧姓', birthDate: '1980-01-01', kana: 'ヤマダ', gender: 'male' });
    await db.visits.insert({ visitId: 'v1', patientId: 'p1', status: 'completed' }); // 受付IDが衝突 => 受付の書き込みで失敗
    const doc = await db.patients.findOne('p1').exec();

    await assert.rejects(
      () => registerPrescriptionAtomically({
        db, patientId: 'p1', existingPatientDoc: doc, patientUpdate: { name: '新姓', birthDate: '1999-09-09' }, newPatientDefaults: {}, visit, items
      }),
      PrescriptionRegistrationError
    );

    const patient = await db.patients.findOne('p1').exec();
    assert.strictEqual(patient.name, '旧姓');
    assert.strictEqual(patient.birthDate, '1980-01-01');
    assert.deepStrictEqual(await counts(db), { patients: 1, visits: 1, items: 0 });
    assert.strictEqual((await db.visits.findOne('v1').exec()).status, 'completed', 'the existing visit with the clashing id is untouched');
  } finally { await db.close(); }
});

test('registerPrescriptionAtomically writes nothing when the patient update conflicts with another writer', async () => {
  const db = await createDb();
  try {
    await db.patients.insert({ patientId: 'p1', name: '旧姓', birthDate: '1980-01-01', kana: '', gender: 'male' });
    const stale = await db.patients.findOne('p1').exec();
    await (await db.patients.findOne('p1').exec()).patch({ name: '他端末で変更' });

    await assert.rejects(
      () => registerPrescriptionAtomically({ db, patientId: 'p1', existingPatientDoc: stale, patientUpdate: { name: '新姓' }, newPatientDefaults: {}, visit, items }),
      (error: unknown) => error instanceof PrescriptionRegistrationError && (error.cause as any)?.code === 'CONFLICT'
    );

    assert.deepStrictEqual(await counts(db), { patients: 1, visits: 0, items: 0 });
    assert.strictEqual((await db.patients.findOne('p1').exec()).name, '他端末で変更');
  } finally { await db.close(); }
});

test('registerPrescriptionAtomically reports when the undo itself fails', async () => {
  const db = await createDb();
  try {
    await db.prescription_items.insert({ itemId: 'i2', visitId: 'other_visit', drugId: 'EXISTING' });
    const brokenDb = { ...db, visits: db.visits, patients: db.patients, prescription_items: {
      bulkInsert: (docs: any[]) => db.prescription_items.bulkInsert(docs),
      bulkRemove: async () => { throw new Error('storage unavailable'); }
    } };

    await assert.rejects(
      () => registerPrescriptionAtomically({ db: brokenDb as any, patientId: 'p1', patientUpdate: { name: '山田' }, newPatientDefaults: {}, visit, items }),
      (error: unknown) => error instanceof PrescriptionRegistrationError && error.rollbackFailed === true
    );
    assert.strictEqual((await counts(db)).visits, 0, 'the other undo steps still ran');
  } finally { await db.close(); }
});
