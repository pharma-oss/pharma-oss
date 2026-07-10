import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';

const drugInfos = JSON.parse(readFileSync(new URL('./data/drug_infos.json', import.meta.url), 'utf8')) as Array<Record<string, unknown>>;

test('drug info seed data excludes scraped shiori body text', () => {
  assert.ok(drugInfos.length > 0);
  assert.ok(drugInfos.every((entry) => !Object.prototype.hasOwnProperty.call(entry, 'shiori')));
});

test('source tree has no Kusuri-no-Shiori acquisition scripts', () => {
  const scriptsDirectory = new URL('../scripts/', import.meta.url);
  const scriptNames = readdirSync(scriptsDirectory).filter((name) => name.endsWith('.ts'));
  assert.ok(scriptNames.every((name) => !/kusuri.*shiori|shiori.*kusuri/i.test(name)));

  for (const scriptName of scriptNames) {
    const source = readFileSync(new URL(scriptName, scriptsDirectory), 'utf8');
    assert.doesNotMatch(source, /rad-ar\.or\.jp\/siori/i, `${scriptName} must not scrape Kusuri-no-Shiori`);
  }
});
