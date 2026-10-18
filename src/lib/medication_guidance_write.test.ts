import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROLE_PERMISSION_POLICY } from './audit.ts';
import { AuditLogFailedError, ROLLBACK_ALSO_FAILED_NOTE } from './audit_guard.ts';
import { RxLikeStore } from './test_support/rxdb_like_doc.ts';
import {
  MEDICATION_GUIDANCE_AUDIT_FAILED_MESSAGE,
  buildMedicationGuidanceAuditDetail,
  checkMedicationGuidanceEditPermission,
  getMedicationGuidanceSaveErrorMessage,
  saveMedicationGuidance,
  type GuidanceCollectionLike
} from './medication_guidance_write.ts';
import type { User } from '../db/types.ts';

const user = (role: User['role'], userId = `u-${role}`): User => ({ userId, name: `${role}太郎`, role } as User);

// 実際の RxDB と同じ「版」の性質を持つドキュメントで作った、文例のコレクション
class FakeGuidanceCollection {
  stores = new Map<string, RxLikeStore>();

  findOne(query: { selector: { id: string } }) {
    return {
      exec: async () => {
        const store = this.stores.get(query.selector.id);
        return store && !store.removed ? store.open() : null;
      }
    };
  }

  async insert(doc: { id: string }) {
    this.stores.set(doc.id, new RxLikeStore(doc as Record<string, unknown>));
  }

  asCollection() {
    return this as unknown as GuidanceCollectionLike;
  }
}

const drug = { code: 'DEMO-1', name: 'アムロジピン錠5mg' };
const storedEntries = [{ type: 'S', text: '以前の文例' }];
const newEntries = [
  { type: 'S', text: 'ふらつきはありませんか' },
  { type: 'P', text: '朝食後に服用' },
  { type: 'P', text: '飲み忘れ時の対応' }
];

function collectionWithStoredDoc() {
  const collection = new FakeGuidanceCollection();
  const store = new RxLikeStore({ id: 'g1', drugCode: drug.code, drugName: drug.name, entries: storedEntries, updatedAt: '2026-10-01T00:00:00.000Z' });
  collection.stores.set('g1', store);
  return { collection, store };
}

test('only roles with manage_facility_settings may edit the guidance', () => {
  assert.deepEqual(checkMedicationGuidanceEditPermission(user('admin'), DEFAULT_ROLE_PERMISSION_POLICY), { ok: true });
  assert.deepEqual(checkMedicationGuidanceEditPermission(user('pharmacist'), DEFAULT_ROLE_PERMISSION_POLICY), { ok: true });

  const clerk = checkMedicationGuidanceEditPermission(user('clerk'), DEFAULT_ROLE_PERMISSION_POLICY);
  assert.equal(clerk.ok, false);
  assert.match(clerk.ok ? '' : clerk.message, /施設基準設定.*権限がありません/);

  const loggedOut = checkMedicationGuidanceEditPermission(user('admin', 'unauthenticated'), DEFAULT_ROLE_PERMISSION_POLICY);
  assert.equal(loggedOut.ok, false);
  assert.match(loggedOut.ok ? '' : loggedOut.message, /スタッフログインが必要/);
});

test('the audit detail names the drug and counts the entries per SOAP type without the text', () => {
  assert.equal(
    buildMedicationGuidanceAuditDetail({ mode: 'create', drugName: drug.name, drugCode: drug.code, entries: newEntries }),
    '服薬指導文例登録: アムロジピン錠5mg (DEMO-1) / 項目 3件 (S 1 / O 0 / A 0 / P 2)'
  );
  assert.equal(
    buildMedicationGuidanceAuditDetail({ mode: 'update', drugName: drug.name, drugCode: drug.code, entries: [] }),
    '服薬指導文例更新: アムロジピン錠5mg (DEMO-1) / 項目 0件 (S 0 / O 0 / A 0 / P 0)'
  );
});

test('creating a guidance writes the document and records the audit log', async () => {
  const collection = new FakeGuidanceCollection();
  const details: string[] = [];

  const result = await saveMedicationGuidance({
    collection: collection.asCollection(), docId: null, drug, entries: newEntries,
    now: '2026-10-18T09:00:00.000Z', newId: 'guidance_new',
    logAudit: async (detail) => { details.push(detail); return true; }
  });

  assert.deepEqual(result, { id: 'guidance_new', mode: 'create' });
  assert.deepEqual(collection.stores.get('guidance_new')?.current(), {
    id: 'guidance_new', drugCode: drug.code, drugName: drug.name, entries: newEntries, updatedAt: '2026-10-18T09:00:00.000Z'
  });
  assert.deepEqual(details, ['服薬指導文例登録: アムロジピン錠5mg (DEMO-1) / 項目 3件 (S 1 / O 0 / A 0 / P 2)']);
});

test('a created guidance is removed again when the audit log is not recorded', async () => {
  const collection = new FakeGuidanceCollection();

  await assert.rejects(
    saveMedicationGuidance({
      collection: collection.asCollection(), docId: null, drug, entries: newEntries,
      now: '2026-10-18T09:00:00.000Z', newId: 'guidance_new', logAudit: async () => false
    }),
    (error: unknown) => error instanceof AuditLogFailedError && error.message === MEDICATION_GUIDANCE_AUDIT_FAILED_MESSAGE
  );
  assert.equal(collection.stores.get('guidance_new')?.removed, true);
});

test('a created guidance is removed again when the audit log throws', async () => {
  const collection = new FakeGuidanceCollection();

  await assert.rejects(
    saveMedicationGuidance({
      collection: collection.asCollection(), docId: null, drug, entries: newEntries,
      now: '2026-10-18T09:00:00.000Z', newId: 'guidance_new', logAudit: async () => { throw new Error('digest failed'); }
    }),
    /digest failed/
  );
  assert.equal(collection.stores.get('guidance_new')?.removed, true);
});

test('updating a guidance patches the stored document and records the audit log', async () => {
  const { collection, store } = collectionWithStoredDoc();
  const details: string[] = [];

  const result = await saveMedicationGuidance({
    collection: collection.asCollection(), docId: 'g1', drug, entries: newEntries,
    now: '2026-10-18T09:00:00.000Z', newId: 'unused',
    logAudit: async (detail) => { details.push(detail); return true; }
  });

  assert.deepEqual(result, { id: 'g1', mode: 'update' });
  assert.deepEqual(store.current().entries, newEntries);
  assert.equal(store.current().updatedAt, '2026-10-18T09:00:00.000Z');
  assert.equal(store.writeLog.length, 1);
  assert.deepEqual(details, ['服薬指導文例更新: アムロジピン錠5mg (DEMO-1) / 項目 3件 (S 1 / O 0 / A 0 / P 2)']);
});

test('an updated guidance goes back to the stored entries when the audit log is not recorded, on a document that rejects a second patch', async () => {
  const { collection, store } = collectionWithStoredDoc();

  await assert.rejects(
    saveMedicationGuidance({
      collection: collection.asCollection(), docId: 'g1', drug, entries: newEntries,
      now: '2026-10-18T09:00:00.000Z', newId: 'unused', logAudit: async () => false
    }),
    (error: unknown) => error instanceof AuditLogFailedError && error.message === MEDICATION_GUIDANCE_AUDIT_FAILED_MESSAGE
  );
  assert.deepEqual(store.current().entries, storedEntries);
  assert.equal(store.current().updatedAt, '2026-10-01T00:00:00.000Z');
  assert.equal(store.writeLog.length, 2, 'one write and one rollback');
});

test('the failure message says so when the rollback of an updated guidance also fails', async () => {
  const { collection, store } = collectionWithStoredDoc();
  store.failWrite = (values) => (values.updatedAt === '2026-10-01T00:00:00.000Z');

  await assert.rejects(
    saveMedicationGuidance({
      collection: collection.asCollection(), docId: 'g1', drug, entries: newEntries,
      now: '2026-10-18T09:00:00.000Z', newId: 'unused', logAudit: async () => false
    }),
    (error: unknown) => error instanceof AuditLogFailedError
      && error.rollbackFailed === true
      && error.message === `${MEDICATION_GUIDANCE_AUDIT_FAILED_MESSAGE}${ROLLBACK_ALSO_FAILED_NOTE}`
  );
});

test('a guidance that vanished after it was loaded is created again so the edit is not lost', async () => {
  const collection = new FakeGuidanceCollection();
  const details: string[] = [];

  const result = await saveMedicationGuidance({
    collection: collection.asCollection(), docId: 'gone', drug, entries: newEntries,
    now: '2026-10-18T09:00:00.000Z', newId: 'guidance_new',
    logAudit: async (detail) => { details.push(detail); return true; }
  });

  assert.deepEqual(result, { id: 'guidance_new', mode: 'create' });
  assert.match(details[0], /^服薬指導文例登録:/);
  assert.deepEqual(collection.stores.get('guidance_new')?.current().entries, newEntries);
});

test('getMedicationGuidanceSaveErrorMessage shows the audit failure reason and hides anything else', () => {
  assert.equal(getMedicationGuidanceSaveErrorMessage(new AuditLogFailedError('監査ログの理由')), '監査ログの理由');
  assert.equal(getMedicationGuidanceSaveErrorMessage(new Error('RxError (VD2) schema mismatch')), '保存に失敗しました');
});
