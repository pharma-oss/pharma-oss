import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import drugInfos from './data/drug_infos.json' with { type: 'json' };

describe('Drug info seed data and scraper elimination contracts', () => {
  it('drug info seed data excludes scraped shiori body text', () => {
    assert.ok(drugInfos.length > 0);
    assert.ok((drugInfos as Array<Record<string, unknown>>).every((entry) => !Object.prototype.hasOwnProperty.call(entry, 'shiori')));
  });

  it('source tree has no Kusuri-no-Shiori acquisition scripts', () => {
    const scriptsDirectory = new URL('../scripts/', import.meta.url);
    const scriptNames = readdirSync(scriptsDirectory).filter((name) => name.endsWith('.ts'));
    assert.ok(scriptNames.every((name) => !/kusuri.*shiori|shiori.*kusuri/i.test(name)));
  });
});
