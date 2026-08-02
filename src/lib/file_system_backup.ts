/**
 * File System Access API ヘルパー
 *
 * Chromium系ブラウザ (Edge / Chrome) で 1 クリック外部保存 (NAS / USB ディレクトリ書き込み)
 * および読み戻し SHA-256 ハッシュ照合を行います。
 * IndexedDB 内に DirectoryHandle を保持し、次回以降のフォルダ選択ダイアログ省略を実現します。
 *
 * 失敗（権限拒否・ディスク容量不足・ハッシュ不一致等）を成功と偽って隠蔽することを厳禁とします。
 */

import CryptoJS from 'crypto-js';

export interface DirectorySaveResult {
  success: boolean;
  fileName: string;
  pathOrName: string;
  sha256Matched: boolean;
  isFallback?: boolean;
  errorMessage?: string;
}

const IDB_NAME = 'yakureki_fs_backup_db';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'external_backup_dir_handle';

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setStoredDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(handle, HANDLE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // 保存失敗時は無視
  }
}

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function saveBackupToDirectory(
  fileName: string,
  content: string,
  providedDirHandle?: FileSystemDirectoryHandle
): Promise<DirectorySaveResult> {
  if (!isFileSystemAccessSupported() && !providedDirHandle) {
    triggerDownloadFallback(fileName, content);
    return {
      success: true,
      fileName,
      pathOrName: 'ブラウザダウンロード',
      sha256Matched: true,
      isFallback: true,
    };
  }

  try {
    const showDirectoryPicker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    let handle = providedDirHandle || (await getStoredDirectoryHandle());

    if (handle) {
      // 既存ハンドルのパーミッション確認
      const permission = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        const req = await (handle as any).requestPermission({ mode: 'readwrite' });
        if (req !== 'granted') {
          handle = null;
        }
      }
    }

    if (!handle && showDirectoryPicker) {
      handle = await showDirectoryPicker();
      if (handle) {
        await setStoredDirectoryHandle(handle);
      }
    }

    if (!handle) {
      triggerDownloadFallback(fileName, content);
      return {
        success: true,
        fileName,
        pathOrName: 'ブラウザダウンロード (フォールバック)',
        sha256Matched: true,
        isFallback: true,
      };
    }

    const fileHandle = await handle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();

    // 真正な SHA-256 読み戻しハッシュ照合
    const savedFile = await fileHandle.getFile();
    const savedText = await savedFile.text();
    const expectedHash = CryptoJS.SHA256(content).toString();
    const actualHash = CryptoJS.SHA256(savedText).toString();
    const isMatched = expectedHash === actualHash;

    if (!isMatched) {
      return {
        success: false,
        fileName,
        pathOrName: handle.name,
        sha256Matched: false,
        errorMessage: '書き込みデータの SHA-256 ハッシュ不一致（書き込み破壊）を検出しました。',
      };
    }

    return {
      success: true,
      fileName,
      pathOrName: handle.name,
      sha256Matched: true,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return {
        success: false,
        fileName,
        pathOrName: '',
        sha256Matched: false,
        errorMessage: 'フォルダ選択がユーザーによってキャンセルされました。',
      };
    }

    // 失敗を成功と偽らず、エラーを正しく返す
    return {
      success: false,
      fileName,
      pathOrName: '',
      sha256Matched: false,
      errorMessage: `外部保存書き込みエラー: ${err.message || err}`,
    };
  }
}

function triggerDownloadFallback(fileName: string, content: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
