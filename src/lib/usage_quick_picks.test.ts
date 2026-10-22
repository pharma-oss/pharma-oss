import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ELECTRONIC_USAGE_OPTIONS } from '@/lib/master-data/usage_master';
import {
  QUICK_USAGE_LIMIT,
  QUICK_USAGE_PRESCRIPTION_CODES,
  USAGE_RECENTS_LIMIT,
  USAGE_RECENTS_STORAGE_KEY,
  buildQuickUsageOptions,
  formatQuickUsageLabel,
  pushUsageRecent,
  readUsageRecents
} from './usage_quick_picks';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }
  };
}

describe('usage quick picks', () => {
  it('every curated code exists in the usage master under the category it is listed for', () => {
    for (const [category, codes] of Object.entries(QUICK_USAGE_PRESCRIPTION_CODES)) {
      for (const code of codes ?? []) {
        const option = ELECTRONIC_USAGE_OPTIONS.find((candidate) => candidate.prescriptionCode === code);
        assert.ok(option, `${code} is missing from the usage master`);
        assert.equal(option.category, category, `${code} (${option.label}) is not ${category}`);
      }
    }
  });

  it('leads the internal list with three-times-daily after meals', () => {
    const picks = buildQuickUsageOptions({ category: 'internal', options: ELECTRONIC_USAGE_OPTIONS });
    assert.equal(picks[0].label, '１日３回朝昼夕食後　服用');
    assert.ok(picks.length <= QUICK_USAGE_LIMIT);
    assert.ok(picks.every((option) => option.category === 'internal'));
  });

  it('puts recently used usages first without duplicating a curated one', () => {
    const recent = '１日２回朝夕食後　服用';
    const picks = buildQuickUsageOptions({
      category: 'internal',
      options: ELECTRONIC_USAGE_OPTIONS,
      recentLabels: [recent]
    });
    assert.equal(picks[0].label, recent);
    assert.equal(picks.filter((option) => option.label === recent).length, 1);
  });

  it('ignores recents that do not belong to the dosage category', () => {
    const picks = buildQuickUsageOptions({
      category: 'external',
      options: ELECTRONIC_USAGE_OPTIONS,
      recentLabels: ['１日３回朝昼夕食後　服用', '存在しない用法']
    });
    assert.ok(picks.every((option) => option.category === 'external'));
  });

  it('offers every internal-drop usage and no curated injection list', () => {
    const drop = buildQuickUsageOptions({ category: 'internal_drop', options: ELECTRONIC_USAGE_OPTIONS });
    assert.equal(drop.length, 3);
    assert.deepEqual(buildQuickUsageOptions({ category: 'injection', options: ELECTRONIC_USAGE_OPTIONS }), []);
  });

  it('shortens the label for a chip but keeps the external route', () => {
    assert.equal(formatQuickUsageLabel('１日３回朝昼夕食後　服用'), '１日３回朝昼夕食後');
    assert.equal(formatQuickUsageLabel('１日２回　塗布'), '１日２回 塗布');
    assert.equal(formatQuickUsageLabel('疼痛時　服用'), '疼痛時');
  });

  it('stores recents per category, newest first, capped and de-duplicated', () => {
    const storage = createMemoryStorage();
    assert.deepEqual(readUsageRecents('internal', storage), []);
    for (let i = 0; i < USAGE_RECENTS_LIMIT + 3; i += 1) pushUsageRecent('internal', `用法${i}`, storage);
    pushUsageRecent('external', '外用の用法', storage);
    const internal = readUsageRecents('internal', storage);
    assert.equal(internal.length, USAGE_RECENTS_LIMIT);
    assert.equal(internal[0], `用法${USAGE_RECENTS_LIMIT + 2}`);
    pushUsageRecent('internal', `用法${USAGE_RECENTS_LIMIT + 1}`, storage);
    assert.equal(readUsageRecents('internal', storage)[0], `用法${USAGE_RECENTS_LIMIT + 1}`);
    assert.equal(new Set(readUsageRecents('internal', storage)).size, USAGE_RECENTS_LIMIT);
    assert.deepEqual(readUsageRecents('external', storage), ['外用の用法']);
  });

  it('survives broken or unavailable storage', () => {
    const broken = createMemoryStorage({ [USAGE_RECENTS_STORAGE_KEY]: '{not json' });
    assert.deepEqual(readUsageRecents('internal', broken), []);
    assert.deepEqual(pushUsageRecent('internal', '用法', broken), ['用法']);
    const throwing = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    };
    assert.deepEqual(readUsageRecents('internal', throwing), []);
    assert.deepEqual(pushUsageRecent('internal', '用法', throwing), ['用法']);
  });
});
