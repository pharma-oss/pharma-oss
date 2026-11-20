// 実画面検証（docs/gemini_continuous_improvement_guide.md §8.1）向けの
// 失敗注入・通知収集・React 入力操作の共通部品（提案書 P6-3）。
// 毎回使い捨てスクリプトで fiber 探索や bulkInsert 差し替えを書き直さず、ここから読み込んで使う。

/**
 * React Fiber ツリーから RxDB インスタンス（db）を探索する純粋関数。
 * 循環参照を避けつつ child / sibling / return を走査し、指定コレクションをすべて持つ db を返す。
 *
 * @param {unknown} rootFiber
 * @param {readonly string[]} [requiredCollections=['visits']]
 * @returns {Record<string, unknown> | null}
 */
export function findDbInReactFiberTree(rootFiber, requiredCollections = ['visits']) {
  if (!rootFiber || typeof rootFiber !== 'object') return null;

  const hasCollections = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    return requiredCollections.every((name) => Boolean(candidate[name] && typeof candidate[name] === 'object'));
  };

  const visited = new Set();
  const queue = [rootFiber];

  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || visited.has(node)) continue;
    visited.add(node);

    const propsDb = node.memoizedProps && typeof node.memoizedProps === 'object'
      ? node.memoizedProps.db
      : undefined;
    if (hasCollections(propsDb)) {
      return propsDb;
    }

    // Context.Provider の value や hook state に db が直接載っている場合も拾う
    const propsValue = node.memoizedProps && typeof node.memoizedProps === 'object'
      ? node.memoizedProps.value
      : undefined;
    if (hasCollections(propsValue)) {
      return propsValue;
    }
    if (propsValue && typeof propsValue === 'object' && hasCollections(propsValue.db)) {
      return propsValue.db;
    }

    let hook = node.memoizedState;
    const seenHooks = new Set();
    while (hook && typeof hook === 'object' && !seenHooks.has(hook)) {
      seenHooks.add(hook);
      if (hasCollections(hook.memoizedState)) {
        return hook.memoizedState;
      }
      hook = hook.next;
    }

    if (node.child && !visited.has(node.child)) queue.push(node.child);
    if (node.sibling && !visited.has(node.sibling)) queue.push(node.sibling);
    if (node.return && !visited.has(node.return)) queue.push(node.return);
  }

  return null;
}

/**
 * RxDB bulkInsert 失敗（全体失敗または部分失敗）の戻り値を組み立てる。
 *
 * @param {{ errorIds?: readonly string[]; successIds?: readonly string[]; status?: number }} [options]
 */
export function buildBulkInsertFailureResult(options = {}) {
  const errorIds = options.errorIds && options.errorIds.length > 0 ? options.errorIds : ['injected_err_1'];
  const successIds = options.successIds || [];
  const status = typeof options.status === 'number' ? options.status : 409;
  return {
    success: successIds.map((id) => ({ id })),
    error: errorIds.map((documentId) => ({ documentId, status }))
  };
}

/**
 * RxDB bulkRemove 失敗（ロールバック失敗再現用）の戻り値を組み立てる。
 *
 * @param {{ errorIds?: readonly string[]; status?: number }} [options]
 */
export function buildBulkRemoveFailureResult(options = {}) {
  const errorIds = options.errorIds && options.errorIds.length > 0 ? options.errorIds : ['injected_remove_err_1'];
  const status = typeof options.status === 'number' ? options.status : 500;
  return {
    success: [],
    error: errorIds.map((documentId) => ({ documentId, status }))
  };
}

/**
 * RxDB コレクション上のメソッドを差し替え、元のプロパティ定義（own/inherited）を退避する。
 *
 * @param {Record<string, any>} db
 * @param {string} collectionName
 * @param {string} methodName
 * @param {Function} replacement
 * @param {Map<string, { target: Record<string, any>; methodName: string; hadOwn: boolean; descriptor: PropertyDescriptor | undefined }>} registry
 */
export function patchCollectionMethodOnDb(db, collectionName, methodName, replacement, registry) {
  if (!db || !db[collectionName] || typeof db[collectionName] !== 'object') {
    throw new Error(`コレクションが見つかりません: ${collectionName}`);
  }
  const target = db[collectionName];
  const key = `${collectionName}.${methodName}`;
  if (!registry.has(key)) {
    const hadOwn = Object.prototype.hasOwnProperty.call(target, methodName);
    const descriptor = hadOwn ? Object.getOwnPropertyDescriptor(target, methodName) : undefined;
    registry.set(key, { target, methodName, hadOwn, descriptor });
  }
  target[methodName] = replacement;
  return key;
}

/**
 * 差し替えた単一メソッドを元に戻す（プロトタイプ継承メソッドは delete で元へ戻す）。
 *
 * @param {string} key
 * @param {Map<string, { target: Record<string, any>; methodName: string; hadOwn: boolean; descriptor: PropertyDescriptor | undefined }>} registry
 */
export function restorePatchedMethod(key, registry) {
  const entry = registry.get(key);
  if (!entry) return false;
  if (entry.hadOwn && entry.descriptor) {
    Object.defineProperty(entry.target, entry.methodName, entry.descriptor);
  } else {
    delete entry.target[entry.methodName];
  }
  registry.delete(key);
  return true;
}

/**
 * 退避済みのすべての差し替えを逆順で復元する。
 *
 * @param {Map<string, { target: Record<string, any>; methodName: string; hadOwn: boolean; descriptor: PropertyDescriptor | undefined }>} registry
 */
export function restoreAllPatchedMethods(registry) {
  const keys = Array.from(registry.keys()).reverse();
  let restoredCount = 0;
  for (const key of keys) {
    if (restorePatchedMethod(key, registry)) {
      restoredCount++;
    }
  }
  return restoredCount;
}

/**
 * Puppeteer の alert / confirm / prompt ダイアログを収集し自動で応答する。
 *
 * @param {any} page
 * @param {{ acceptConfirm?: boolean }} [options]
 */
export function attachDialogCollector(page, options = {}) {
  const acceptConfirm = options.acceptConfirm !== false;
  /** @type {Array<{ type: string; message: string }>} */
  const dialogs = [];
  const handler = async (dialog) => {
    const type = typeof dialog.type === 'function' ? dialog.type() : 'alert';
    const message = typeof dialog.message === 'function' ? dialog.message() : '';
    dialogs.push({ type, message });
    if (type === 'confirm' && !acceptConfirm) {
      await dialog.dismiss();
    } else {
      await dialog.accept();
    }
  };
  page.on('dialog', handler);
  return {
    dialogs,
    getMessages: () => dialogs.map((d) => d.message),
    clear: () => { dialogs.length = 0; },
    detach: () => {
      if (typeof page.off === 'function') {
        page.off('dialog', handler);
      } else if (typeof page.removeListener === 'function') {
        page.removeListener('dialog', handler);
      }
    }
  };
}

/**
 * 一時的に消えるトースト（Sonner 等）の文言を MutationObserver で漏れなく記録する。
 *
 * @param {any} page
 */
export async function installToastCollector(page) {
  await page.evaluate(() => {
    const win = /** @type {any} */ (window);
    if (win.__yakurekiToastObserver) {
      win.__yakurekiToastObserver.disconnect();
    }
    const captured = [];
    const seen = new Set();
    win.__yakurekiCapturedToasts = captured;

    const scan = () => {
      const nodes = document.querySelectorAll('[data-sonner-toast], [role="status"], [role="alert"]');
      for (const node of nodes) {
        const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        captured.push(text);
      }
    };

    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    win.__yakurekiToastObserver = observer;
  });
}

/**
 * 記録済みトースト文言を取得する。
 *
 * @param {any} page
 * @returns {Promise<string[]>}
 */
export async function readCapturedToasts(page) {
  return page.evaluate(() => {
    const win = /** @type {any} */ (window);
    return Array.isArray(win.__yakurekiCapturedToasts) ? [...win.__yakurekiCapturedToasts] : [];
  });
}

/**
 * 画面上の React Fiber（または window.__yakurekiDb）から RxDB インスタンスを取り出して window.__db に公開する。
 *
 * @param {any} page
 * @param {{ rootSelector?: string; requiredCollections?: string[] }} [options]
 */
export async function exposeReactFiberDb(page, options = {}) {
  const rootSelector = options.rootSelector || 'main, #__next, body';
  const requiredCollections = options.requiredCollections || ['visits'];

  return page.evaluate((selector, collections) => {
    const win = /** @type {any} */ (window);
    const hasCollections = (candidate) => (
      Boolean(candidate)
      && typeof candidate === 'object'
      && collections.every((name) => Boolean(candidate[name] && typeof candidate[name] === 'object'))
    );

    if (hasCollections(win.__yakurekiDb)) {
      win.__db = win.__yakurekiDb;
      return { found: true, source: 'window.__yakurekiDb', collections: Object.keys(win.__db) };
    }

    const candidates = Array.from(document.querySelectorAll(selector));
    if (document.body && !candidates.includes(document.body)) {
      candidates.push(document.body);
    }

    for (const el of candidates) {
      const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
      if (!fiberKey) continue;
      const root = /** @type {any} */ (el)[fiberKey];
      const visited = new Set();
      const queue = [root];
      while (queue.length > 0) {
        const node = queue.shift();
        if (!node || typeof node !== 'object' || visited.has(node)) continue;
        visited.add(node);

        const propsDb = node.memoizedProps && typeof node.memoizedProps === 'object' ? node.memoizedProps.db : undefined;
        const propsVal = node.memoizedProps && typeof node.memoizedProps === 'object' ? node.memoizedProps.value : undefined;
        const match = hasCollections(propsDb)
          ? propsDb
          : hasCollections(propsVal)
            ? propsVal
            : propsVal && typeof propsVal === 'object' && hasCollections(propsVal.db)
              ? propsVal.db
              : null;
        if (match) {
          win.__db = match;
          return { found: true, source: 'reactFiber', collections: Object.keys(match) };
        }

        let hook = node.memoizedState;
        const seenHooks = new Set();
        while (hook && typeof hook === 'object' && !seenHooks.has(hook)) {
          seenHooks.add(hook);
          if (hasCollections(hook.memoizedState)) {
            win.__db = hook.memoizedState;
            return { found: true, source: 'reactFiberHook', collections: Object.keys(win.__db) };
          }
          hook = hook.next;
        }

        if (node.child && !visited.has(node.child)) queue.push(node.child);
        if (node.sibling && !visited.has(node.sibling)) queue.push(node.sibling);
        if (node.return && !visited.has(node.return)) queue.push(node.return);
      }
    }

    return { found: false, source: null, collections: [] };
  }, rootSelector, requiredCollections);
}

/**
 * window.__db 上の指定コレクションメソッドに失敗応答を注入する。
 *
 * @param {any} page
 * @param {{ collection: string; method: string; mode: 'throw' | 'bulkInsertError' | 'bulkRemoveError'; errorMessage?: string; errorIds?: string[]; successIds?: string[]; status?: number }} options
 */
export async function injectCollectionMethodFailure(page, options) {
  return page.evaluate((opts) => {
    const win = /** @type {any} */ (window);
    const db = win.__db || win.__yakurekiDb;
    if (!db || !db[opts.collection]) {
      throw new Error(`window.__db.${opts.collection} が見つかりません。先に exposeReactFiberDb を実行してください。`);
    }
    if (!win.__yakurekiPatchedDbMethods) {
      win.__yakurekiPatchedDbMethods = new Map();
    }
    const registry = win.__yakurekiPatchedDbMethods;
    const target = db[opts.collection];
    const key = `${opts.collection}.${opts.method}`;
    if (!registry.has(key)) {
      const hadOwn = Object.prototype.hasOwnProperty.call(target, opts.method);
      const descriptor = hadOwn ? Object.getOwnPropertyDescriptor(target, opts.method) : undefined;
      registry.set(key, { target, methodName: opts.method, hadOwn, descriptor });
    }

    if (opts.mode === 'throw') {
      target[opts.method] = async () => {
        throw new Error(opts.errorMessage || `E2E_INJECTED_${opts.collection}_${opts.method}_FAIL`);
      };
    } else if (opts.mode === 'bulkInsertError') {
      const errorIds = opts.errorIds && opts.errorIds.length > 0 ? opts.errorIds : ['injected_err_1'];
      const successIds = opts.successIds || [];
      const status = typeof opts.status === 'number' ? opts.status : 409;
      target[opts.method] = async () => ({
        success: successIds.map((id) => ({ id })),
        error: errorIds.map((documentId) => ({ documentId, status }))
      });
    } else if (opts.mode === 'bulkRemoveError') {
      const errorIds = opts.errorIds && opts.errorIds.length > 0 ? opts.errorIds : ['injected_remove_err_1'];
      const status = typeof opts.status === 'number' ? opts.status : 500;
      target[opts.method] = async () => ({
        success: [],
        error: errorIds.map((documentId) => ({ documentId, status }))
      });
    } else {
      throw new Error(`未対応の失敗注入モードです: ${String(opts.mode)}`);
    }

    return { patchedKey: key };
  }, options);
}

/**
 * injectCollectionMethodFailure で差し替えたすべてのメソッドを元に戻す。
 *
 * @param {any} page
 */
export async function restoreCollectionMethods(page) {
  return page.evaluate(() => {
    const win = /** @type {any} */ (window);
    const registry = win.__yakurekiPatchedDbMethods;
    if (!(registry instanceof Map)) return 0;
    const entries = Array.from(registry.entries()).reverse();
    let count = 0;
    for (const [key, entry] of entries) {
      if (entry.hadOwn && entry.descriptor) {
        Object.defineProperty(entry.target, entry.methodName, entry.descriptor);
      } else {
        delete entry.target[entry.methodName];
      }
      registry.delete(key);
      count++;
    }
    return count;
  });
}

/**
 * React 制御下の input / textarea に値を入力し、onChange が発火する input イベントを送出する。
 *
 * @param {any} page
 * @param {string} selector
 * @param {string} value
 */
export async function setReactControlledInputValue(page, selector, value) {
  await page.evaluate((sel, nextValue) => {
    const el = document.querySelector(sel);
    if (!el) {
      throw new Error(`入力要素が見つかりません: ${sel}`);
    }
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (!descriptor || typeof descriptor.set !== 'function') {
      throw new Error(`ネイティブ value setter を取得できませんでした: ${sel}`);
    }
    descriptor.set.call(el, nextValue);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}

/**
 * ゲスト体験デモを開始する（トップページ・/app の起動ボタンのいずれかをクリック）。
 *
 * @param {any} page
 * @param {string} baseUrl
 */
export async function startGuestDemoSession(page, baseUrl) {
  await page.goto(`${baseUrl.replace(/\/+$/, '')}/app`, { waitUntil: 'domcontentloaded' });
  const selectors = [
    '[data-testid="guest-demo-start"]',
    'button[data-testid="pre-login-tour-start-guest-demo"]',
    '.btn-resume-demo'
  ];
  for (const sel of selectors) {
    const clicked = await page.evaluate((s) => {
      const btn = document.querySelector(s);
      if (!btn || !(btn instanceof HTMLElement)) return false;
      btn.click();
      return true;
    }, sel);
    if (clicked) {
      return { startedWith: sel };
    }
  }
  return { startedWith: null };
}
