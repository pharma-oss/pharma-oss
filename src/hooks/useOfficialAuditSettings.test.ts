import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { wrappedKeyEncryptionCryptoJsStorage } from 'rxdb/plugins/encryption-crypto-js';
import { DRUG_SCHEMA, PATIENT_SCHEMA, PRESCRIPTION_ITEM_SCHEMA, VISIT_SCHEMA } from '@/db/schema';
import { legacyMigrationStrategies } from '@/db/index';
import type { Drug, Patient, PrescriptionItem, Visit } from '@/db/types';
import {
  buildPricedClaimItems,
  collectClaimDriftLookupIds,
  collectDosageConflictVisitIds,
  collectPrescriptionItemDrugCodes,
  extractVisitsWithExportSnapshot,
  groupPrescriptionItemDocsByVisitId,
  toClaimItemPricingDrug,
  toDosageCategoryConflictInput
} from './useOfficialAuditSettings.ts';

// 点数の変動点検・剤形判定の食い違い点検へ渡す入力の特性化テスト（現状の出力を固定する）。

const PRICE_HISTORY = [
  { price: 120 },
  { price: 110, effectiveFrom: '2026-04-01' },
  { price: 100, effectiveFrom: '2026-10-01' }
];

const drug = (overrides: Partial<Drug>): Partial<Drug> => ({ name: 'テスト薬', price: 100, ...overrides });

const itemJson = (overrides: Record<string, unknown> = {}) => ({
  itemId: 'i1',
  visitId: 'v1',
  drugId: 'D-PRESCRIBED',
  ...overrides
}) as { itemId: string; visitId: string; drugId: string; dispensedDrugCode?: string; isHighRisk?: boolean; drugPriceOverride?: { price: number; effectiveFrom?: string } };

const itemDoc = <T extends { drugId: string; dispensedDrugCode?: string }>(json: T) => ({
  drugId: json.drugId,
  dispensedDrugCode: json.dispensedDrugCode,
  toJSON: () => json
});

// --- toDosageCategoryConflictInput -----------------------------------------

test('toDosageCategoryConflictInput keys the item by itemId (a prescription item has no id field)', () => {
  const item = { visitId: 'v1', rpNumber: 2, itemId: 'item-77', drugId: 'D1', dispensedDrug: 'アムロジン錠', usage: '1日1回', dosageCategory: 'internal', dosageCategorySource: 'manual' } as Pick<
    PrescriptionItem,
    'visitId' | 'rpNumber' | 'itemId' | 'drugId' | 'dispensedDrug' | 'usage' | 'dosageCategory' | 'dosageCategorySource'
  >;
  const input = toDosageCategoryConflictInput({ ...item, ...({ id: 'WRONG-ID' } as object) });
  assert.deepEqual(input, {
    visitId: 'v1',
    rpNumber: 2,
    itemId: 'item-77',
    drugName: 'アムロジン錠',
    dispensedDrug: 'アムロジン錠',
    usage: '1日1回',
    dosageCategory: 'internal',
    dosageCategorySource: 'manual'
  });
});

test('toDosageCategoryConflictInput names the drug by the dispensed drug, then by the drug id', () => {
  const base = { visitId: 'v1', rpNumber: 1, itemId: 'i1', drugId: 'D-CODE', usage: '点眼' };
  assert.equal(toDosageCategoryConflictInput({ ...base, dispensedDrug: '調剤薬' }).drugName, '調剤薬');
  const noName = toDosageCategoryConflictInput(base);
  assert.equal(noName.drugName, 'D-CODE');
  assert.equal(noName.dispensedDrug, undefined);
});

// --- toClaimItemPricingDrug -------------------------------------------------

test('toClaimItemPricingDrug returns undefined for a missing drug', () => {
  assert.equal(toClaimItemPricingDrug(undefined), undefined);
  assert.equal(toClaimItemPricingDrug(null), undefined);
});

test('toClaimItemPricingDrug passes only price, price history, YJ code, generic flag and high-risk flag', () => {
  const result = toClaimItemPricingDrug(drug({ name: 'は渡さない', yjCode: '2171022F1ZZZ', isGeneric: true, isHighRisk: true, price: 42, priceHistory: PRICE_HISTORY, stockQuantity: 9 }));
  assert.deepEqual(result, { price: 42, priceHistory: PRICE_HISTORY, yjCode: '2171022F1ZZZ', isGeneric: true, isHighRisk: true });
  assert.deepEqual(Object.keys(result ?? {}).sort(), ['isGeneric', 'isHighRisk', 'price', 'priceHistory', 'yjCode']);
});

test('toClaimItemPricingDrug reads RxDocument-like drugs through toJSON, copies the history, and leaves a missing history undefined', () => {
  const plain = drug({ price: 42, priceHistory: PRICE_HISTORY });
  const fromDoc = toClaimItemPricingDrug({ toJSON: () => plain });
  assert.deepEqual(fromDoc, toClaimItemPricingDrug(plain));
  assert.notStrictEqual(fromDoc?.priceHistory, PRICE_HISTORY, 'the history is copied, not shared');
  assert.equal(toClaimItemPricingDrug(drug({ price: 7 }))?.priceHistory, undefined);
});

// --- buildPricedClaimItems --------------------------------------------------

test('buildPricedClaimItems prices the prescribed drug by the dispensing date and keeps the item fields', () => {
  const drugs = new Map([['D-PRESCRIBED', drug({ yjCode: 'YJ-1', isGeneric: false, price: 100, priceHistory: PRICE_HISTORY })]]);
  const priceOn = (date: string) => buildPricedClaimItems([itemDoc(itemJson())], drugs, date)[0];
  assert.equal(priceOn('2026-03-31').price, 120);
  assert.equal(priceOn('2026-04-01').price, 110, 'the revision day already uses the new price');
  assert.equal(priceOn('2026-10-01').price, 100);
  const row = priceOn('2026-06-01');
  assert.equal(row.itemId, 'i1');
  assert.equal(row.visitId, 'v1');
  assert.equal(row.drugPrice, 110, 'the calculator and the pre-claim check read drugPrice');
  assert.equal(row.yjCode, 'YJ-1');
  assert.equal(row.drugPriceResolution.source, 'history');
});

test('buildPricedClaimItems bills the dispensed drug when there is one, and the prescribed drug otherwise', () => {
  const drugs = new Map([
    ['D-PRESCRIBED', drug({ yjCode: 'YJ-PRESCRIBED', price: 50 })],
    ['D-DISPENSED', drug({ yjCode: 'YJ-DISPENSED', price: 20 })]
  ]);
  const [dispensed] = buildPricedClaimItems([itemDoc(itemJson({ dispensedDrugCode: 'D-DISPENSED' }))], drugs, '2026-06-01');
  assert.equal(dispensed.price, 20);
  assert.equal(dispensed.yjCode, 'YJ-DISPENSED');
  const [prescribed] = buildPricedClaimItems([itemDoc(itemJson())], drugs, '2026-06-01');
  assert.equal(prescribed.price, 50);
  assert.equal(prescribed.yjCode, 'YJ-PRESCRIBED');
  // 調剤した薬品コードがマスターに無ければ、処方された薬品の薬価で引く
  const [missing] = buildPricedClaimItems([itemDoc(itemJson({ dispensedDrugCode: 'D-MISSING' }))], drugs, '2026-06-01');
  assert.equal(missing.price, 50);
});

test('buildPricedClaimItems honours the pharmacist-chosen price version and falls back to 0 for an unknown drug', () => {
  const drugs = new Map([['D-PRESCRIBED', drug({ price: 100, priceHistory: PRICE_HISTORY })]]);
  const [overridden] = buildPricedClaimItems([itemDoc(itemJson({ drugPriceOverride: { price: 120 } }))], drugs, '2026-06-01');
  assert.equal(overridden.price, 120);
  assert.equal(overridden.drugPriceResolution.source, 'override');
  const [unknown] = buildPricedClaimItems([itemDoc(itemJson())], new Map<string, Partial<Drug>>(), '2026-06-01');
  assert.equal(unknown.price, 0);
  assert.equal(unknown.yjCode, '');
});

test('buildPricedClaimItems decides the high-risk flag from the item first, then the prescribed drug, then the dispensed drug', () => {
  const drugs = new Map([
    ['D-PRESCRIBED', drug({ isHighRisk: true })],
    ['D-DISPENSED', drug({ isHighRisk: false })]
  ]);
  assert.equal(buildPricedClaimItems([itemDoc(itemJson())], drugs, '2026-06-01')[0].isHighRisk, true);
  assert.equal(buildPricedClaimItems([itemDoc(itemJson({ isHighRisk: false }))], drugs, '2026-06-01')[0].isHighRisk, false);
  assert.equal(buildPricedClaimItems([itemDoc(itemJson())], new Map<string, Partial<Drug>>(), '2026-06-01')[0].isHighRisk, false);
});

// --- P2-2: collectDosageConflictVisitIds & groupPrescriptionItemDocsByVisitId ---

test('collectDosageConflictVisitIds trims, skips empty values, and deduplicates visitIds in order', () => {
  assert.deepEqual(
    collectDosageConflictVisitIds([
      { visitId: ' visit_1 ' },
      { visitId: '' },
      { visitId: null },
      { visitId: 'visit_2' },
      { visitId: 'visit_1' },
      {}
    ]),
    ['visit_1', 'visit_2']
  );
  assert.deepEqual(collectDosageConflictVisitIds([]), []);
});

test('groupPrescriptionItemDocsByVisitId groups items by trimmed visitId and skips empty visitIds', () => {
  const docs = [
    { itemId: 'i1', visitId: 'v1' },
    { itemId: 'i2', visitId: 'v2' },
    { itemId: 'i3', visitId: ' v1 ' },
    { itemId: 'i4', visitId: '   ' }
  ];
  const grouped = groupPrescriptionItemDocsByVisitId(docs);
  assert.deepEqual(Array.from(grouped.keys()), ['v1', 'v2']);
  assert.deepEqual(grouped.get('v1')?.map((d) => d.itemId), ['i1', 'i3']);
  assert.deepEqual(grouped.get('v2')?.map((d) => d.itemId), ['i2']);
});

test('RxDB visits.findByIds(collectDosageConflictVisitIds(cases)) loads only conflicting encrypted visits (P2-2)', async () => {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  const storage = wrappedValidateAjvStorage({
    storage: wrappedKeyEncryptionCryptoJsStorage({ storage: getRxStorageMemory() })
  });
  const db = await createRxDatabase({
    name: `dosage_conflict_p2_2_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    storage,
    password: 'test-dosage-conflict-p22',
    ignoreDuplicate: true
  });
  try {
    const collections = await db.addCollections({
      visits: {
        schema: VISIT_SCHEMA,
        migrationStrategies: legacyMigrationStrategies(VISIT_SCHEMA, {})
      }
    });
    const makeVisit = (visitId: string, patientId: string): Visit => ({
      visitId,
      patientId,
      issueDate: '2026-06-15T09:00:00.000Z',
      prescriptionDate: '2026-06-15',
      dispensingDate: '2026-06-15',
      status: 'completed'
    });
    await collections.visits.bulkInsert([
      makeVisit('visit_conflict_1', 'pt_1'),
      makeVisit('visit_clean_2', 'pt_2'),
      makeVisit('visit_conflict_3', 'pt_3')
    ]);

    const targetIds = collectDosageConflictVisitIds([
      { visitId: 'visit_conflict_1' },
      { visitId: 'visit_conflict_1' },
      { visitId: 'visit_conflict_3' }
    ]);
    const foundMap = await collections.visits.findByIds(targetIds).exec();
    const fetchedVisits = targetIds
      .map((visitId) => foundMap.get(visitId))
      .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
      .map((doc) => doc.toJSON() as Visit);

    assert.deepEqual(fetchedVisits.map((v) => v.visitId), ['visit_conflict_1', 'visit_conflict_3']);
    assert.deepEqual(fetchedVisits.map((v) => v.patientId), ['pt_1', 'pt_3']);
  } finally {
    await db.close();
  }
});

// --- P2-2: batched claim drift & dosage conflict lookups --------------------

test('extractVisitsWithExportSnapshot keeps only visits with finite exportSnapshot.totalPoints', () => {
  const docs = [
    { toJSON: () => ({ visitId: 'v_draft', claimLifecycle: { status: 'draft' } }) },
    { toJSON: () => ({ visitId: 'v_no_pts', claimLifecycle: { status: 'exported', exportSnapshot: { totalPoints: Number.NaN } } }) },
    { toJSON: () => ({ visitId: 'v_zero', claimLifecycle: { status: 'exported', exportSnapshot: { totalPoints: 0 } } }) },
    { toJSON: () => ({ visitId: 'v_ok', claimLifecycle: { status: 'accepted', exportSnapshot: { totalPoints: 125 } } }) }
  ];
  const exported = extractVisitsWithExportSnapshot(docs);
  assert.deepEqual(
    exported.map((entry) => ({ visitId: entry.visit.visitId, exportedPoints: entry.exportedPoints })),
    [
      { visitId: 'v_zero', exportedPoints: 0 },
      { visitId: 'v_ok', exportedPoints: 125 }
    ]
  );
});

test('collectClaimDriftLookupIds and collectPrescriptionItemDrugCodes deduplicate and trim IDs in order', () => {
  assert.deepEqual(
    collectClaimDriftLookupIds([
      { visitId: ' v1 ', patientId: ' p1 ' },
      { visitId: 'v2', patientId: 'p1' },
      { visitId: 'v1', patientId: '' },
      { visitId: '', patientId: 'p2' }
    ]),
    { visitIds: ['v1', 'v2'], patientIds: ['p1', 'p2'] }
  );
  assert.deepEqual(
    collectPrescriptionItemDrugCodes([
      { drugId: ' D1 ', dispensedDrugCode: 'D2' },
      { drugId: 'D2', dispensedDrugCode: 'D3' },
      { drugId: '', dispensedDrugCode: null },
      { drugId: 'D1', dispensedDrugCode: ' D3 ' }
    ]),
    ['D1', 'D2', 'D3']
  );
});

test('RxDB batched claim drift lookups fetch only exported visits patients/items/drugs and match per-visit pricing (P2-2)', async () => {
  addRxPlugin(RxDBMigrationSchemaPlugin);
  const storage = wrappedValidateAjvStorage({
    storage: wrappedKeyEncryptionCryptoJsStorage({ storage: getRxStorageMemory() })
  });
  const db = await createRxDatabase({
    name: `claim_drift_p2_2_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    storage,
    password: 'test-claim-drift-p22',
    ignoreDuplicate: true
  });
  try {
    const collections = await db.addCollections({
      visits: { schema: VISIT_SCHEMA, migrationStrategies: legacyMigrationStrategies(VISIT_SCHEMA, {}) },
      patients: { schema: PATIENT_SCHEMA, migrationStrategies: legacyMigrationStrategies(PATIENT_SCHEMA, {}) },
      prescription_items: { schema: PRESCRIPTION_ITEM_SCHEMA, migrationStrategies: legacyMigrationStrategies(PRESCRIPTION_ITEM_SCHEMA, {}) },
      drugs: { schema: DRUG_SCHEMA, migrationStrategies: legacyMigrationStrategies(DRUG_SCHEMA, {}) }
    });

    const patients: Patient[] = [
      { patientId: 'pt_1', name: '山田 太郎', kana: 'ヤマダ タロウ', birthDate: '1965-04-01' },
      { patientId: 'pt_unexported', name: '未出力 花子', kana: 'ミシュツリョク ハナコ', birthDate: '1980-08-15' }
    ];
    await collections.patients.bulkInsert(patients);

    const drugs: Drug[] = [
      { code: 'D_PRESC', name: '処方薬A', isGeneric: false, price: 30, yjCode: '2171022F1020' },
      { code: 'D_DISP', name: '調剤後発薬B', isGeneric: true, price: 15, yjCode: '2171022F1038' },
      { code: 'D_UNUSED', name: '未出力受付の薬C', isGeneric: false, price: 99, yjCode: '9999999F1000' }
    ];
    await collections.drugs.bulkInsert(drugs);

    const makeSnapshot = (visitId: string, patientId: string, patientName: string, totalPoints: number) => ({
      createdAt: '2026-06-20T10:00:00.000Z',
      visitId,
      patientId,
      patientName,
      patientBirthDate: '1965-04-01',
      issueDate: '2026-06-15T09:00:00.000Z',
      totalPoints,
      prescriptionItems: []
    });

    const visits: Visit[] = [
      {
        visitId: 'v_exp_1',
        patientId: 'pt_1',
        issueDate: '2026-06-15T09:00:00.000Z',
        dispensingDate: '2026-06-15',
        status: 'completed',
        claimLifecycle: { status: 'exported', exportSnapshot: makeSnapshot('v_exp_1', 'pt_1', '山田 太郎', 100) }
      },
      {
        visitId: 'v_exp_2',
        patientId: 'pt_1',
        issueDate: '2026-06-18T09:00:00.000Z',
        dispensingDate: '2026-06-18',
        status: 'completed',
        claimLifecycle: { status: 'accepted', exportSnapshot: makeSnapshot('v_exp_2', 'pt_1', '山田 太郎', 200) }
      },
      {
        visitId: 'v_draft_3',
        patientId: 'pt_unexported',
        issueDate: '2026-06-19T09:00:00.000Z',
        dispensingDate: '2026-06-19',
        status: 'completed',
        claimLifecycle: { status: 'draft' }
      }
    ];
    await collections.visits.bulkInsert(visits);

    const items: PrescriptionItem[] = [
      { itemId: 'item_1', visitId: 'v_exp_1', drugId: 'D_PRESC', amount: 1, days: 14, usage: '1日1回朝食後' },
      { itemId: 'item_2', visitId: 'v_exp_2', drugId: 'D_PRESC', dispensedDrugCode: 'D_DISP', amount: 1, days: 14, usage: '1日1回朝食後' },
      { itemId: 'item_3', visitId: 'v_draft_3', drugId: 'D_UNUSED', amount: 1, days: 7, usage: '1日1回' }
    ];
    await collections.prescription_items.bulkInsert(items);

    const visitDocs = await collections.visits.find().exec();
    const exportedVisits = extractVisitsWithExportSnapshot(visitDocs);
    const { visitIds, patientIds } = collectClaimDriftLookupIds(exportedVisits.map((entry) => entry.visit));
    assert.deepEqual(visitIds.sort(), ['v_exp_1', 'v_exp_2']);
    assert.deepEqual(patientIds, ['pt_1']);

    const [patientsMap, batchedItemDocs] = await Promise.all([
      collections.patients.findByIds(patientIds).exec(),
      collections.prescription_items.find({ selector: { visitId: { $in: visitIds } } }).exec()
    ]);
    assert.deepEqual(Array.from(patientsMap.keys()), ['pt_1']);
    assert.deepEqual(batchedItemDocs.map((d) => d.itemId).sort(), ['item_1', 'item_2']);

    const itemsByVisitId = groupPrescriptionItemDocsByVisitId(batchedItemDocs);
    const drugCodes = collectPrescriptionItemDrugCodes(batchedItemDocs);
    assert.deepEqual(drugCodes.sort(), ['D_DISP', 'D_PRESC']);

    const drugsMap = await collections.drugs.findByIds(drugCodes).exec();
    assert.deepEqual(Array.from(drugsMap.keys()).sort(), ['D_DISP', 'D_PRESC']);

    const v1Items = buildPricedClaimItems(itemsByVisitId.get('v_exp_1') ?? [], drugsMap, '2026-06-15');
    const v2Items = buildPricedClaimItems(itemsByVisitId.get('v_exp_2') ?? [], drugsMap, '2026-06-18');
    assert.equal(v1Items[0].price, 30);
    assert.equal(v2Items[0].price, 15);
  } finally {
    await db.close();
  }
});
