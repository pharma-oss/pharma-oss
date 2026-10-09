import { test } from 'node:test';
import assert from 'node:assert';
import type { FacilitySettings } from '../db/types.ts';
import { RxLikeStore } from './test_support/rxdb_like_doc.ts';
import { saveFacilitySettingsWithAudit } from './facility_settings_save.ts';
import { applyAiAssistModeWithAudit } from './ai_assist_policy.ts';
import { applyDrugPriceOverrideWithAudit, applyItemClaimFlagWithAudit, persistClaimLifecycleWithAudit } from '../app/print/claim_actions.ts';
import { recordInterventionWithAudit } from './prescription_intervention_support.ts';

// 監査ログが残らなかったときの取り消しを、本物の RxDB と同じ「版」の性質を持つドキュメントで確かめる。
// 実際の RxDB では、同じインスタンスで書いたあとにもう一度 patch() すると CONFLICT になるため、
// 取り消しが patch() のままだと、データは戻らず、取り消しに失敗したことにもならない場合があった。
// (単純に上書きするだけの偽物はこの失敗を再現できず、壊れた取り消しがテストを通っていた)

test('facility settings save: a missing audit log puts the previous values back on a real-RxDB-like document', async () => {
  const previous = { pharmacyName: '旧薬局', pharmacyCode: '1234567', basicFeeCategory: '1' };
  const store = new RxLikeStore(previous);
  const db = { facility_settings: { findOne: () => ({ exec: async () => store.open() }), insert: async () => undefined } };
  const next = { ...previous, pharmacyName: '新薬局', aiAssistMode: 'enabled' } as unknown as FacilitySettings;

  await assert.rejects(() => saveFacilitySettingsWithAudit({ db: db as any, settings: next, logAudit: async () => false }), /元に戻しました/);

  assert.strictEqual(store.current().pharmacyName, '旧薬局');
  assert.strictEqual(store.current().aiAssistMode, undefined, 'a field the save added is removed again');
});

test('AI assist mode: a missing audit log puts the previous mode back on a real-RxDB-like document', async () => {
  const store = new RxLikeStore({ aiAssistMode: 'limited' });
  const db = { facility_settings: { findOne: () => ({ exec: async () => store.open() }) } };

  await assert.rejects(
    () => applyAiAssistModeWithAudit({ db: db as any, previousMode: 'limited', recommendedMode: 'disabled', auditDetail: 'x', logAudit: async () => false }),
    /元に戻しました/
  );

  assert.strictEqual(store.current().aiAssistMode, 'limited');
});

test('item claim flag: a missing audit log puts the previous flags back on a real-RxDB-like document', async () => {
  const store = new RxLikeStore({ isDiagnosticTest: false, claimPreparation: true, claimManagement: true });
  const item = store.current();

  await assert.rejects(
    () => applyItemClaimFlagWithAudit({
      db: {} as any, item, itemDoc: store.open() as any, field: 'isDiagnosticTest', value: true,
      logAudit: async () => false
    }),
    /元に戻/
  );

  assert.deepStrictEqual(store.current(), { isDiagnosticTest: false, claimPreparation: true, claimManagement: true });
});

test('claim lifecycle: a missing audit log puts the previous lifecycle back on a real-RxDB-like document', async () => {
  const previousLifecycle = { status: 'draft' } as any;
  const store = new RxLikeStore({ claimLifecycle: previousLifecycle });
  const db = { visits: { findOne: () => ({ exec: async () => store.open() }) } };
  const applied: unknown[] = [];

  await assert.rejects(
    () => persistClaimLifecycleWithAudit({
      db: db as any, visitId: 'v1', nextLifecycle: { status: 'exported' } as any, detail: 'd',
      applyLifecycle: (lifecycle: unknown) => { applied.push(lifecycle); },
      logAudit: async () => false
    }),
    /元に戻|取り消/
  );

  assert.deepStrictEqual(store.current().claimLifecycle, previousLifecycle);
  assert.deepStrictEqual(applied, [{ status: 'exported' }, previousLifecycle], 'the screen is told about the change and then the undo');
});

test('intervention registration: a missing audit log removes the record and puts the visit events back on a real-RxDB-like document', async () => {
  const visitStore = new RxLikeStore({ patientId: 'p1', interventionEvents: [{ eventId: 'old' }] });
  const visit = visitStore.open();
  const inserted = { removed: false };
  const db = {
    interventions: { insert: async () => ({ remove: async () => { inserted.removed = true; } }) },
    patients: { find: () => ({ exec: async () => [{ name: '山田' }] }) }
  };

  await assert.rejects(
    () => recordInterventionWithAudit({
      db: db as any, visit: visit as any, record: { interventionId: 'i1' } as any, event: { eventId: 'new' } as any,
      auditDetail: 'x', logAudit: async () => false
    }),
    /元に戻しました/
  );

  assert.strictEqual(inserted.removed, true);
  assert.deepStrictEqual(visitStore.current().interventionEvents, [{ eventId: 'old' }]);
});

test('drug price override: a missing audit log removes the override again on a real-RxDB-like document', async () => {
  const store = new RxLikeStore({ drugId: 'D1', price: 10 });
  const doc = store.open();

  await assert.rejects(
    () => applyDrugPriceOverrideWithAudit({
      db: {} as any, item: store.current() as any, itemDoc: doc as any, drug: { price: 10 }, dispensingDate: '2026-06-14',
      override: { price: 12.3 }, logAudit: async () => false
    }),
    /元に戻|取り消/
  );

  assert.strictEqual('drugPriceOverride' in store.current(), false, 'the override that was written is gone again');
});
