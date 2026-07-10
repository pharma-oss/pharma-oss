import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptUrl = new URL('../../scripts/runBrowserBackupExport.mjs', import.meta.url);
const packageJsonUrl = new URL('../../package.json', import.meta.url);
const settingsPageUrl = new URL('../app/settings/page.tsx', import.meta.url);

test('browser backup export job is exposed as an npm script and documents safe defaults', async () => {
  const packageJson = JSON.parse(await readFile(packageJsonUrl, 'utf8'));
  const source = await readFile(scriptUrl, 'utf8');

  assert.strictEqual(
    packageJson.scripts['backup:browser-export'],
    'node scripts/runBrowserBackupExport.mjs'
  );
  assert.match(source, /--user-data-dir/);
  assert.match(source, /--download-dir/);
  assert.match(source, /--password-env/);
  assert.match(source, /--allow-plaintext/);
  assert.match(source, /Browser\.setDownloadBehavior/);
  assert.match(source, /browser-backup-export-receipt/);
  assert.match(source, /Downloaded backup is plaintext/);
  assert.match(source, /External transfer manifest SHA-256/);
});

test('browser backup export job refuses plaintext backup by default before launching browser', async () => {
  const root = await mkdtemp(join(tmpdir(), 'yakureki-browser-export-test-'));

  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptUrl.pathname,
        '--user-data-dir',
        root,
        '--download-dir',
        root
      ], { timeout: 15000 }),
      (error: any) => {
        assert.match(error.stderr || error.message, /--password or --password-env is required/);
        return true;
      }
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('settings backup screen exposes stable hooks for browser export automation', async () => {
  const source = await readFile(settingsPageUrl, 'utf8');

  assert.match(source, /params\.get\('tab'\)/);
  assert.match(source, /tab === 'backup'/);
  assert.match(source, /data-testid="settings-tab-backup"/);
  assert.match(source, /data-testid="backup-section"/);
  assert.match(source, /data-testid="backup-export-encryption-checkbox"/);
  assert.match(source, /data-testid="backup-export-password"/);
  assert.match(source, /data-testid="backup-export-transfer-manifest-checkbox"/);
  assert.match(source, /data-testid="backup-external-destination-name"/);
  assert.match(source, /data-testid="backup-external-destination-path"/);
  assert.match(source, /data-testid="backup-export-button"/);
});
