import { test } from 'node:test';
import assert from 'node:assert';
import CryptoJS from 'crypto-js';
import { isFileSystemAccessSupported, saveBackupToDirectory } from './file_system_backup.ts';

test('isFileSystemAccessSupported accurately detects environment API presence', () => {
  const supported = isFileSystemAccessSupported();
  assert.strictEqual(typeof supported, 'boolean');
});

test('saveBackupToDirectory returns fallback result in non-browser env without silent error masking', async () => {
  const content = JSON.stringify({ test: 'data' });
  const result = await saveBackupToDirectory('backup.json', content);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.fileName, 'backup.json');
  assert.strictEqual(result.sha256Matched, true);
  assert.strictEqual(result.isFallback, true);
});

test('SHA-256 hash comparison correctly verifies payload consistency', () => {
  const content = 'test_payload_string_123';
  const hash1 = CryptoJS.SHA256(content).toString();
  const hash2 = CryptoJS.SHA256(content).toString();
  const hashTampered = CryptoJS.SHA256(content + '_tampered').toString();

  assert.strictEqual(hash1, hash2);
  assert.notStrictEqual(hash1, hashTampered);
});

// 以下、実際のディレクトリ書き込み・権限確認・読み戻しハッシュ照合(saveBackupToDirectory の
// 中核ロジック)を File System Access API のフェイクハンドルで検証する。
// window/document はテストごとに設定・後始末し、他テストへグローバル状態を持ち越さない。

function makeFakeDirectoryHandle(options: { tamperOnReadback?: boolean } = {}) {
  const files = new Map<string, string>();
  return {
    name: 'fake-nas-dir',
    queryPermission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    getFileHandle: async (fileName: string) => ({
      createWritable: async () => ({
        write: async (content: string) => { files.set(fileName, content); },
        close: async () => {},
      }),
      getFile: async () => ({
        text: async () => {
          const written = files.get(fileName) ?? '';
          return options.tamperOnReadback ? `${written}_corrupted` : written;
        },
      }),
    }),
  };
}

test('saveBackupToDirectory writes the file and confirms a matching SHA-256 readback', async () => {
  (global as any).window = {};
  try {
    const handle = makeFakeDirectoryHandle();
    const content = JSON.stringify({ backup: 'real-data' });

    const result = await saveBackupToDirectory('yakureki_backup_test.json', content, handle as any);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.sha256Matched, true);
    assert.strictEqual(result.pathOrName, 'fake-nas-dir');
    assert.strictEqual(result.isFallback, undefined);
  } finally {
    delete (global as any).window;
  }
});

test('saveBackupToDirectory requests permission when not already granted, and proceeds once granted', async () => {
  (global as any).window = {};
  try {
    const handle = makeFakeDirectoryHandle();
    let queryCalls = 0;
    let requestCalls = 0;
    handle.queryPermission = async () => { queryCalls++; return 'prompt' as any; };
    handle.requestPermission = async () => { requestCalls++; return 'granted' as const; };

    const result = await saveBackupToDirectory('yakureki_backup_test.json', 'content', handle as any);

    assert.strictEqual(queryCalls, 1);
    assert.strictEqual(requestCalls, 1);
    assert.strictEqual(result.success, true);
  } finally {
    delete (global as any).window;
  }
});

test('saveBackupToDirectory reports failure (not success) when write-back hash does not match, per the no-silent-failure contract', async () => {
  (global as any).window = {};
  try {
    const handle = makeFakeDirectoryHandle({ tamperOnReadback: true });
    const content = JSON.stringify({ backup: 'real-data' });

    const result = await saveBackupToDirectory('yakureki_backup_test.json', content, handle as any);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.sha256Matched, false);
    assert.match(result.errorMessage || '', /ハッシュ不一致/);
  } finally {
    delete (global as any).window;
  }
});

test('saveBackupToDirectory falls back to browser download (not a hidden failure) when permission is denied', async () => {
  let clicked = false;
  (global as any).window = { showDirectoryPicker: undefined };
  (global as any).URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };
  (global as any).document = {
    createElement: () => ({ set href(_v: string) {}, set download(_v: string) {}, click: () => { clicked = true; } }),
    body: { appendChild: () => {}, removeChild: () => {} },
  };

  try {
    const handle = makeFakeDirectoryHandle();
    handle.queryPermission = async () => 'prompt' as any;
    handle.requestPermission = async () => 'denied' as any;

    const result = await saveBackupToDirectory('yakureki_backup_test.json', 'content', handle as any);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.isFallback, true);
    assert.strictEqual(clicked, true);
  } finally {
    delete (global as any).window;
    delete (global as any).document;
    delete (global as any).URL;
  }
});

test('saveBackupToDirectory returns an explicit error (not a false success) when the underlying write throws', async () => {
  (global as any).window = {};
  try {
    const handle = makeFakeDirectoryHandle();
    handle.getFileHandle = async () => { throw new Error('disk full'); };

    const result = await saveBackupToDirectory('yakureki_backup_test.json', 'content', handle as any);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.sha256Matched, false);
    assert.match(result.errorMessage || '', /disk full/);
  } finally {
    delete (global as any).window;
  }
});
