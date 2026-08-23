import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDrugMasterRecordsFromJson } from './sqlite_seed';
import drugsData from '../data/drugs.json' with { type: 'json' };
import generalDrugsData from '../data/general_drugs.json' with { type: 'json' };

describe('Drug master merge and sqlite seed contracts', () => {
  it('drug master merge does not duplicate price-master drugs via drug_infos', async () => {
    const records = await getDrugMasterRecordsFromJson();

    const priceMasterRows = [...(drugsData as any[]), ...(generalDrugsData as any[])];
    const priceMasterCodes = new Set(priceMasterRows.map((row: any) => String(row.code || '')));
    const priceMasterYjCodes = new Set(
      priceMasterRows.map((row: any) => String(row.yjCode || '')).filter(Boolean)
    );
    const priceMasterNames = new Set(
      priceMasterRows.map((row: any) => String(row.name || '').normalize('NFKC')).filter(Boolean)
    );

    for (const record of records) {
      if (priceMasterCodes.has(record.code)) continue;
      assert.ok(
        !priceMasterYjCodes.has(record.code),
        `drug_info record ${record.code} duplicates a price-master drug by YJ code`
      );
      assert.ok(
        !priceMasterNames.has(record.name.normalize('NFKC')),
        `drug_info record ${record.code} (${record.name}) duplicates a price-master drug by name`
      );
    }
  });

  it('a representative drug appears exactly once with its price-master code', async () => {
    const records = await getDrugMasterRecordsFromJson();
    const hits = records.filter((record) => record.name === 'アムロジピンＯＤ錠１０ｍｇ「ＣＨ」');

    assert.equal(hits.length, 1, 'the same drug must not appear twice in search candidates');
    const [hit] = hits;
    assert.ok(hit);
    assert.equal(hit.code, '622290901');
    assert.ok((hit.price ?? 0) > 0, 'the surviving record keeps its price-master price');
  });
});
