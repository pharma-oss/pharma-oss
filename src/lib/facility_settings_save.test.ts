import { test } from 'node:test';
import assert from 'node:assert';
import type { FacilitySettings } from '../db/types.ts';
import {
  FACILITY_SETTINGS_AUDIT_ROLLED_BACK,
  buildFacilitySettingsRestorePatch,
  saveFacilitySettingsWithAudit
} from './facility_settings_save.ts';

const base = (overrides: Partial<FacilitySettings> = {}): FacilitySettings => ({
  id: 'default',
  pharmacyName: 'みらい調剤薬局',
  pharmacyCode: '1312345',
  baseFeeCategory: '1',
  ...overrides
} as FacilitySettings);

// patch はマージ、保存内容は JSON として扱う(undefined のキーは保存されない)ものとして近似した偽の RxDB 文書
function fakeFacilityDb(initial: FacilitySettings | null, options: { patchFailsAt?: number } = {}) {
  let stored: Record<string, unknown> | null = initial ? JSON.parse(JSON.stringify(initial)) : null;
  let patchCount = 0;
  const doc = () => stored && {
    toJSON: () => JSON.parse(JSON.stringify(stored)),
    patch: async (patch: Record<string, unknown>) => {
      patchCount += 1;
      if (options.patchFailsAt && patchCount === options.patchFailsAt) throw new Error('patch failed');
      stored = JSON.parse(JSON.stringify({ ...stored, ...patch }));
    },
    remove: async () => { stored = null; }
  };
  const db = {
    facility_settings: {
      findOne: () => ({ exec: async () => doc() }),
      insert: async (row: FacilitySettings) => { stored = JSON.parse(JSON.stringify(row)); }
    }
  } as unknown as Parameters<typeof saveFacilitySettingsWithAudit>[0]['db'];
  return { db, read: () => stored };
}

test('buildFacilitySettingsRestorePatch restores previous values and clears keys the save introduced', () => {
  const previous = base({ baseFeeCategory: '1' });
  const next = base({ baseFeeCategory: '3_a', officialFeeCodeOverrides: { a: '123456789' } });
  const patch = buildFacilitySettingsRestorePatch(previous, next) as Record<string, unknown>;

  assert.strictEqual(patch.baseFeeCategory, '1');
  assert.ok('officialFeeCodeOverrides' in patch);
  assert.strictEqual(patch.officialFeeCodeOverrides, undefined);
  assert.strictEqual(patch.pharmacyName, 'みらい調剤薬局');
});

test('saveFacilitySettingsWithAudit stores the new settings and audits once', async () => {
  const { db, read } = fakeFacilityDb(base());
  let audits = 0;

  await saveFacilitySettingsWithAudit({
    db, settings: base({ baseFeeCategory: '3_a' }), logAudit: async () => { audits += 1; return true; }
  });

  assert.strictEqual(read()?.baseFeeCategory, '3_a');
  assert.strictEqual(audits, 1);
});

test('saveFacilitySettingsWithAudit puts the previous settings back, field for field, when the audit log fails', async () => {
  const previous = base({ baseFeeCategory: '1', pharmacyName: '旧名称' });
  const { db, read } = fakeFacilityDb(previous);

  await assert.rejects(
    () => saveFacilitySettingsWithAudit({
      db,
      settings: base({
        baseFeeCategory: '3_a', pharmacyName: '新名称',
        officialFeeCodeOverrides: { dispensing_fee: '123456789' }, aiAssistMode: 'disabled'
      }),
      logAudit: async () => false
    }),
    new Error(FACILITY_SETTINGS_AUDIT_ROLLED_BACK)
  );

  assert.deepStrictEqual(read(), JSON.parse(JSON.stringify(previous)), 'no new key and no changed value survives');
});

test('saveFacilitySettingsWithAudit removes a first-time creation when the audit log fails', async () => {
  const { db, read } = fakeFacilityDb(null);

  await assert.rejects(
    () => saveFacilitySettingsWithAudit({ db, settings: base(), logAudit: async () => false }),
    new Error(FACILITY_SETTINGS_AUDIT_ROLLED_BACK)
  );
  assert.strictEqual(read(), null);

  const created = fakeFacilityDb(null);
  await saveFacilitySettingsWithAudit({ db: created.db, settings: base(), logAudit: async () => true });
  assert.strictEqual(created.read()?.pharmacyName, 'みらい調剤薬局');
});

test('saveFacilitySettingsWithAudit does not audit or roll back when the write itself fails', async () => {
  const previous = base();
  const { db, read } = fakeFacilityDb(previous, { patchFailsAt: 1 });
  let audited = false;

  await assert.rejects(
    () => saveFacilitySettingsWithAudit({
      db, settings: base({ baseFeeCategory: '3_a' }), logAudit: async () => { audited = true; return true; }
    }),
    /patch failed/
  );
  assert.strictEqual(audited, false);
  assert.deepStrictEqual(read(), JSON.parse(JSON.stringify(previous)));
});
