import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRUG_RECENTS_LIMIT,
  DRUG_RECENTS_STORAGE_KEY,
  pushDrugRecent,
  readDrugRecents
} from './drug_recents';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }
  };
}

describe('drug recents', () => {
  it('keeps the newest drug first and moves a re-picked drug to the top without duplicating it', () => {
    const storage = createMemoryStorage();
    pushDrugRecent({ code: 'A', name: '薬A' }, storage);
    pushDrugRecent({ code: 'B', name: '薬B' }, storage);
    pushDrugRecent({ code: 'A', name: '薬A' }, storage);
    assert.deepEqual(readDrugRecents(storage).map((drug) => drug.code), ['A', 'B']);
  });

  it('caps the list', () => {
    const storage = createMemoryStorage();
    for (let i = 0; i < DRUG_RECENTS_LIMIT + 4; i += 1) pushDrugRecent({ code: `C${i}`, name: `薬${i}` }, storage);
    const recents = readDrugRecents(storage);
    assert.equal(recents.length, DRUG_RECENTS_LIMIT);
    assert.equal(recents[0].code, `C${DRUG_RECENTS_LIMIT + 3}`);
  });

  it('ignores entries without a code or a name', () => {
    const storage = createMemoryStorage();
    pushDrugRecent({ code: '', name: '薬' }, storage);
    pushDrugRecent({ code: 'X', name: '  ' }, storage);
    assert.deepEqual(readDrugRecents(storage), []);
  });

  it('drops malformed stored entries instead of failing', () => {
    const storage = createMemoryStorage({
      [DRUG_RECENTS_STORAGE_KEY]: JSON.stringify([{ code: 'A', name: '薬A' }, { code: 1 }, null, 'text'])
    });
    assert.deepEqual(readDrugRecents(storage), [{ code: 'A', name: '薬A' }]);
    assert.deepEqual(readDrugRecents(createMemoryStorage({ [DRUG_RECENTS_STORAGE_KEY]: '{broken' })), []);
  });

  it('works when storage is blocked', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); }
    };
    assert.deepEqual(readDrugRecents(blocked), []);
    assert.deepEqual(pushDrugRecent({ code: 'A', name: '薬A' }, blocked), [{ code: 'A', name: '薬A' }]);
  });
});
