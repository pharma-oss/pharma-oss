import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const databaseSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

test('active RxDB collections stay within the open-core runtime limit', () => {
  const definitions = databaseSource.match(
    /const collectionDefinitions = \{([\s\S]*?)\n    \};\n    const activeCollectionCount/
  );
  assert.ok(definitions, 'collection definitions block was not found');
  const collectionNames = Array.from(
    definitions[1].matchAll(/^        ([a-z_]+): \{$/gm),
    (match) => match[1]
  );
  assert.ok(collectionNames.includes('patient_medication_info_templates'));
  assert.ok(collectionNames.length <= 14, `found ${collectionNames.length} active collections`);
  assert.doesNotMatch(definitions[1], /^        drug_infos: \{$/m);
});
