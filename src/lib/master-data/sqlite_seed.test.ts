import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { getDrugMasterRecordsFromJson } from './sqlite_seed.ts';

const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));

// 添付文書由来(drug_infos.json)のレコードはcodeがYJコードのため、レセ電コードの
// 薬価マスター行とcode重複排除をすり抜け、同名薬が薬価0円で二重に検索候補へ
// 並んでいた(約1.5万件)。同一YJコード・同一名の重複が混入しないことを固定する。
test('drug master merge does not duplicate price-master drugs via drug_infos', async () => {
  const records = await getDrugMasterRecordsFromJson();

  const priceMasterRows = [...readJson('../data/drugs.json'), ...readJson('../data/general_drugs.json')];
  const priceMasterCodes = new Set(priceMasterRows.map((row: any) => String(row.code || '')));
  const priceMasterYjCodes = new Set(
    priceMasterRows.map((row: any) => String(row.yjCode || '')).filter(Boolean)
  );
  const priceMasterNames = new Set(
    priceMasterRows.map((row: any) => String(row.name || '').normalize('NFKC')).filter(Boolean)
  );

  for (const record of records) {
    if (priceMasterCodes.has(record.code)) continue;
    // 薬価マスター行以外(=添付文書由来)のレコードは、既存行とYJコードも名前も
    // 重複していないものだけが残る。
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

test('a representative drug appears exactly once with its price-master code', async () => {
  const records = await getDrugMasterRecordsFromJson();
  const hits = records.filter((record) => record.name === 'アムロジピンＯＤ錠１０ｍｇ「ＣＨ」');

  assert.strictEqual(hits.length, 1, 'the same drug must not appear twice in search candidates');
  const [hit] = hits;
  assert.ok(hit);
  assert.strictEqual(hit.code, '622290901');
  assert.ok((hit.price ?? 0) > 0, 'the surviving record keeps its price-master price');
});
