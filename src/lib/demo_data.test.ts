import { test } from 'node:test';
import assert from 'node:assert';
import {
  cleanupTutorialDemoData,
  DEMO_DRUG_CODE_PREFIX,
  DEMO_PATIENT_ID,
  hasTutorialDemoData,
  isDemoDrugCode,
  isDemoPatientId,
  isDemoVisit,
  seedTutorialDemoData
} from './demo_data.ts';

function createMockCollection(primaryKey: string) {
  const rows = new Map<string, any>();

  const matchesSelector = (row: any, selector?: Record<string, any>): boolean => {
    if (!selector) return true;
    for (const [key, condition] of Object.entries(selector)) {
      if (condition && typeof condition === 'object' && Array.isArray(condition.$in)) {
        if (!condition.$in.includes(row[key])) return false;
      } else if (row[key] !== condition) {
        return false;
      }
    }
    return true;
  };

  const wrapDoc = (row: any) => ({
    ...row,
    toJSON: () => ({ ...row }),
    get: (key: string) => row[key],
    remove: async () => {
      rows.delete(row[primaryKey]);
    }
  });

  return {
    rows,
    async upsert(doc: any) {
      rows.set(doc[primaryKey], { ...doc });
      return wrapDoc(doc);
    },
    async insert(doc: any) {
      if (rows.has(doc[primaryKey])) {
        throw new Error(`Duplicate primary key: ${doc[primaryKey]}`);
      }
      rows.set(doc[primaryKey], { ...doc });
      return wrapDoc(doc);
    },
    async bulkInsert(docs: any[]) {
      for (const doc of docs) {
        rows.set(doc[primaryKey], { ...doc });
      }
      return { success: docs, error: [] };
    },
    find(query?: { selector?: Record<string, any>; sort?: unknown }) {
      return {
        exec: async () =>
          Array.from(rows.values())
            .filter((row) => matchesSelector(row, query?.selector))
            .map(wrapDoc)
      };
    },
    findOne(id: string) {
      return {
        exec: async () => (rows.has(id) ? wrapDoc(rows.get(id)) : null)
      };
    }
  };
}

function createMockDb() {
  return {
    visits: createMockCollection('visitId'),
    patients: createMockCollection('patientId'),
    drugs: createMockCollection('code'),
    drug_stocks: createMockCollection('id'),
    alerts: createMockCollection('alertId'),
    prescription_items: createMockCollection('itemId'),
    soap_records: createMockCollection('soapId'),
    interventions: createMockCollection('interventionId'),
    audit_logs: createMockCollection('logId')
  };
}

test('demo detection helpers identify tutorial data only', () => {
  assert.strictEqual(isDemoPatientId(DEMO_PATIENT_ID), true);
  // 患者検索練習用の追加デモ患者(pt_demo_extra_1〜9)も同じ判定に含まれる
  assert.strictEqual(isDemoPatientId('pt_demo_extra_1'), true);
  assert.strictEqual(isDemoPatientId('pt_demo_extra_9'), true);
  assert.strictEqual(isDemoPatientId('pt_real_patient'), false);
  assert.strictEqual(isDemoPatientId(undefined), false);
  assert.strictEqual(isDemoVisit({ patientId: DEMO_PATIENT_ID }), true);
  assert.strictEqual(isDemoVisit({ patientId: 'pt_real_patient' }), false);
  assert.strictEqual(isDemoVisit(null), false);
  assert.strictEqual(isDemoDrugCode(`${DEMO_DRUG_CODE_PREFIX}2171022G1`), true);
  assert.strictEqual(isDemoDrugCode('2171022G1023'), false);
  assert.strictEqual(isDemoDrugCode(undefined), false);
});

test('seedTutorialDemoData creates the full practice set including history and alert', async () => {
  const db = createMockDb();
  const result = await seedTutorialDemoData(db);

  assert.strictEqual(result.alreadySeeded, false);
  assert.ok(result.visitId.startsWith('v_demo_'));

  assert.ok(db.patients.rows.has(DEMO_PATIENT_ID));
  // 患者検索の練習ができるよう、合計10名(みどり+軽量デモ患者9名)投入される
  assert.strictEqual(db.patients.rows.size, 10);
  for (let i = 1; i <= 9; i++) {
    assert.ok(db.patients.rows.has(`pt_demo_extra_${i}`), `pt_demo_extra_${i} should be seeded`);
  }
  // 生年月日だけの検索で複数候補が返る例として、一郎はみどりと同じ生年月日にしてある
  assert.strictEqual(db.patients.rows.get('pt_demo_extra_3').birthDate, db.patients.rows.get(DEMO_PATIENT_ID).birthDate);
  assert.strictEqual(db.drugs.rows.size, 3);
  assert.strictEqual(db.drug_stocks.rows.size, 3);
  for (const drug of db.drugs.rows.values()) {
    assert.ok(isDemoDrugCode(drug.code), `demo drug code should be prefixed: ${drug.code}`);
    assert.match(drug.name, /「デモ」/);
  }

  // 副作用歴アラート: エラー(要修正)ではなく警告(薬剤師確認)で練習フローを止めない
  const alerts = Array.from(db.alerts.rows.values());
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].patientId, DEMO_PATIENT_ID);
  assert.strictEqual(alerts[0].type, 'side_effect');
  assert.strictEqual(alerts[0].status, 'active');
  assert.match(alerts[0].content, /ロキソプロフェン/);

  // 前回来局: 完了済み・過去日付で、当日の受付キューや日次締めに影響しない
  const visits = Array.from(db.visits.rows.values());
  const previousVisit = visits.find((visit) => visit.visitId === 'v_demo_tutorial_prev');
  assert.ok(previousVisit, 'previous demo visit should be seeded');
  assert.strictEqual(previousVisit.status, 'completed');
  assert.ok(new Date(previousVisit.issueDate).getTime() < Date.now() - 20 * 86400000);

  const soapRecords = Array.from(db.soap_records.rows.values());
  assert.strictEqual(soapRecords.length, 1);
  assert.strictEqual(soapRecords[0].visitId, 'v_demo_tutorial_prev');
  assert.ok(soapRecords[0].problems.length > 0);

  // 今回受付: 処理中1件、処方3剤
  const processingVisits = visits.filter((visit) => visit.status === 'processing');
  assert.strictEqual(processingVisits.length, 1);
  const currentItems = Array.from(db.prescription_items.rows.values())
    .filter((item) => item.visitId === result.visitId);
  assert.strictEqual(currentItems.length, 3);
});

test('seedTutorialDemoData reuses an in-progress practice visit', async () => {
  const db = createMockDb();
  const first = await seedTutorialDemoData(db);
  const second = await seedTutorialDemoData(db);

  assert.strictEqual(second.alreadySeeded, true);
  assert.strictEqual(second.visitId, first.visitId);
  const processingVisits = Array.from(db.visits.rows.values())
    .filter((visit) => visit.status === 'processing');
  assert.strictEqual(processingVisits.length, 1);
});

test('cleanupTutorialDemoData removes demo data and keeps real records', async () => {
  const db = createMockDb();

  await db.patients.upsert({ patientId: 'pt_real', name: '実患者 太郎' });
  await db.visits.upsert({ visitId: 'v_real', patientId: 'pt_real', issueDate: new Date().toISOString(), status: 'completed' });
  await db.prescription_items.upsert({ itemId: 'item_real', visitId: 'v_real', drugId: '2171022G1023', amount: 1, days: 14 });
  await db.drugs.upsert({ code: '2171022G1023', name: 'アムロジピンOD錠5mg' });
  await db.drug_stocks.upsert({ id: 'stock_real', drugCode: '2171022G1023', quantity: 50 });
  await db.alerts.upsert({ alertId: 'alert_real', patientId: 'pt_real', type: 'allergy', content: 'ペニシリンで発疹', status: 'active' });

  await seedTutorialDemoData(db);
  const result = await cleanupTutorialDemoData(db);

  assert.strictEqual(result.removedPatients, 10);
  assert.strictEqual(result.removedVisits, 2);
  assert.strictEqual(result.removedPrescriptionItems, 4);
  assert.strictEqual(result.removedSoapRecords, 1);
  assert.strictEqual(result.removedAlerts, 1);
  assert.strictEqual(result.removedDrugs, 3);
  assert.strictEqual(result.removedStocks, 3);

  assert.strictEqual(db.patients.rows.has(DEMO_PATIENT_ID), false);
  for (let i = 1; i <= 9; i++) {
    assert.strictEqual(db.patients.rows.has(`pt_demo_extra_${i}`), false, `pt_demo_extra_${i} should be removed`);
  }
  assert.ok(db.patients.rows.has('pt_real'));
  assert.ok(db.visits.rows.has('v_real'));
  assert.ok(db.prescription_items.rows.has('item_real'));
  assert.ok(db.drugs.rows.has('2171022G1023'));
  assert.ok(db.drug_stocks.rows.has('stock_real'));
  assert.ok(db.alerts.rows.has('alert_real'));

  for (const visit of db.visits.rows.values()) {
    assert.notStrictEqual(visit.patientId, DEMO_PATIENT_ID);
  }
});

test('cleanupTutorialDemoData is safe to run when no demo data exists', async () => {
  const db = createMockDb();
  const result = await cleanupTutorialDemoData(db);

  assert.strictEqual(result.removedPatients, 0);
  assert.strictEqual(result.removedVisits, 0);
  assert.strictEqual(result.removedDrugs, 0);
});

test('hasTutorialDemoData reflects seeding and cleanup', async () => {
  const db = createMockDb();
  assert.strictEqual(await hasTutorialDemoData(db), false);

  await seedTutorialDemoData(db);
  assert.strictEqual(await hasTutorialDemoData(db), true);

  await cleanupTutorialDemoData(db);
  assert.strictEqual(await hasTutorialDemoData(db), false);

  // 患者だけ手動で消えても、デモ薬品が残っていれば検知する
  await db.drugs.upsert({ code: 'DEMO-2171022G1', name: '「デモ」アムロジピンOD錠5mg' });
  assert.strictEqual(await hasTutorialDemoData(db), true);
});
