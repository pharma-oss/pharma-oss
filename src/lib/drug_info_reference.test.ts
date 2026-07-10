import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findDrugInfosByDrugNames,
  getDrugInfoReferenceCount
} from './drug_info_reference.ts';

test('drug info reference data is available without an RxDB collection', async () => {
  assert.ok(await getDrugInfoReferenceCount() > 10_000);
  const matches = await findDrugInfosByDrugNames(['ガスターD錠20mg']);
  assert.ok((matches.get('ガスターD錠20mg') || []).some((info) => info.id === 'drug_info_2325003F4031'));
});
