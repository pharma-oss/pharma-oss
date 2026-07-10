let sqlite3 = null;
let db = null;
let backend = 'memory';
let backendMessage = '';
let sqliteVersion = undefined;
let memoryVersion = '';
let memoryDrugs = [];
let memoryUsageOptions = [];

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeDrug(rawDrug, sortOrder) {
  const name = normalizeText(rawDrug.name);
  const genericName = rawDrug.genericName ? normalizeText(rawDrug.genericName) : undefined;
  return {
    code: normalizeText(rawDrug.code),
    name,
    yjCode: rawDrug.yjCode ? normalizeText(rawDrug.yjCode) : undefined,
    isGeneric: !!rawDrug.isGeneric,
    genericName,
    isAbolished: !!rawDrug.isAbolished,
    price: Number(rawDrug.price || 0),
    stockQuantity: Number(rawDrug.stockQuantity || 0),
    location: rawDrug.location ? normalizeText(rawDrug.location) : undefined,
    isNarcotic: !!rawDrug.isNarcotic,
    isPsychotropic: !!rawDrug.isPsychotropic,
    isPoisonous: !!rawDrug.isPoisonous,
    isHighRisk: !!rawDrug.isHighRisk,
    documentUrl: rawDrug.documentUrl ? normalizeText(rawDrug.documentUrl) : undefined,
    searchNameLower: normalizeLower(rawDrug.searchNameLower || name),
    searchGenericLower: normalizeLower(rawDrug.searchGenericLower || genericName),
    sortOrder
  };
}

function normalizeUsageOption(rawOption, sortOrder) {
  return {
    code: normalizeText(rawOption.code),
    label: normalizeText(rawOption.label),
    searchLabelLower: normalizeLower(rawOption.label),
    sortOrder
  };
}

function publicDrug(drug) {
  return {
    code: drug.code,
    name: drug.name,
    yjCode: drug.yjCode || undefined,
    isGeneric: !!drug.isGeneric,
    genericName: drug.genericName || undefined,
    isAbolished: !!drug.isAbolished,
    price: Number(drug.price || 0),
    stockQuantity: Number(drug.stockQuantity || 0),
    location: drug.location || undefined,
    isNarcotic: !!drug.isNarcotic,
    isPsychotropic: !!drug.isPsychotropic,
    isPoisonous: !!drug.isPoisonous,
    isHighRisk: !!drug.isHighRisk,
    documentUrl: drug.documentUrl || undefined,
    searchNameLower: normalizeLower(drug.searchNameLower || drug.name),
    searchGenericLower: normalizeLower(drug.searchGenericLower || drug.genericName)
  };
}

function rowToDrug(row) {
  return publicDrug({
    code: row.code,
    name: row.name,
    yjCode: row.yjCode,
    isGeneric: Number(row.isGeneric) === 1,
    genericName: row.genericName,
    isAbolished: Number(row.isAbolished) === 1,
    price: Number(row.price || 0),
    stockQuantity: Number(row.stockQuantity || 0),
    location: row.location,
    isNarcotic: Number(row.isNarcotic) === 1,
    isPsychotropic: Number(row.isPsychotropic) === 1,
    isPoisonous: Number(row.isPoisonous) === 1,
    isHighRisk: Number(row.isHighRisk) === 1,
    documentUrl: row.documentUrl,
    searchNameLower: row.searchNameLower,
    searchGenericLower: row.searchGenericLower
  });
}

function status() {
  return {
    backend,
    sqliteVersion,
    persistent: backend === 'opfs',
    message: backendMessage || undefined
  };
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (match) => `\\${match}`);
}

function clampLimit(limit, fallback) {
  const nextLimit = Number(limit);
  if (!Number.isFinite(nextLimit) || nextLimit <= 0) return fallback;
  return Math.min(Math.floor(nextLimit), 500);
}

function sqliteRows(sql, bind) {
  const resultRows = [];
  db.exec({
    sql,
    bind,
    rowMode: 'object',
    resultRows
  });
  return resultRows;
}

function initializeSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drugs (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      yjCode TEXT,
      isGeneric INTEGER NOT NULL,
      genericName TEXT,
      isAbolished INTEGER NOT NULL,
      price REAL NOT NULL,
      stockQuantity REAL NOT NULL,
      location TEXT,
      isNarcotic INTEGER NOT NULL,
      isPsychotropic INTEGER NOT NULL,
      isPoisonous INTEGER NOT NULL,
      isHighRisk INTEGER NOT NULL,
      documentUrl TEXT,
      searchNameLower TEXT NOT NULL,
      searchGenericLower TEXT NOT NULL,
      sortOrder INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drugs_name_lower ON drugs(searchNameLower);
    CREATE INDEX IF NOT EXISTS idx_drugs_generic_lower ON drugs(searchGenericLower);
    CREATE INDEX IF NOT EXISTS idx_drugs_yj_code ON drugs(yjCode);
    CREATE TABLE IF NOT EXISTS usage_options (
      code TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      searchLabelLower TEXT NOT NULL,
      sortOrder INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_usage_label_lower ON usage_options(searchLabelLower);
    PRAGMA user_version = 1;
  `);
}

async function initSQLite(payload) {
  if (db || backend !== 'memory') return status();

  const sqliteModuleUrl = payload && (payload.sqliteModuleUrl || payload.sqliteScriptUrl)
    ? payload.sqliteModuleUrl || payload.sqliteScriptUrl
    : '/sqlite/index.mjs';
  const sqliteWasmUrl = payload && payload.sqliteWasmUrl
    ? payload.sqliteWasmUrl
    : '/sqlite/sqlite3.wasm';
  const dbName = payload && payload.dbName ? payload.dbName : '/yakureki-master-data.sqlite3';

  try {
    const sqliteModule = await import(sqliteModuleUrl);
    const initModule = sqliteModule.default || sqliteModule.sqlite3InitModule;
    if (typeof initModule !== 'function') {
      throw new Error(`SQLite WASM initializer was not found after loading ${sqliteModuleUrl}`);
    }

    sqlite3 = await initModule({
      print: () => undefined,
      printErr: (...args) => console.warn('[SQLite MasterData]', ...args),
      locateFile: (path) => path.endsWith('.wasm') ? sqliteWasmUrl : path
    });
    sqliteVersion = sqlite3.version && sqlite3.version.libVersion;

    const hasOpfs = !!(
      sqlite3.oo1 &&
      sqlite3.oo1.OpfsDb &&
      sqlite3.capi &&
      sqlite3.capi.sqlite3_vfs_find &&
      sqlite3.capi.sqlite3_vfs_find('opfs')
    );

    if (hasOpfs) {
      db = new sqlite3.oo1.OpfsDb(dbName, 'c');
      backend = 'opfs';
      backendMessage = '';
    } else {
      db = new sqlite3.oo1.DB(':memory:', 'ct');
      backend = 'transient';
      backendMessage = 'OPFS is unavailable; SQLite is running with an in-memory database.';
    }

    initializeSchema();
  } catch (error) {
    sqlite3 = null;
    db = null;
    backend = 'memory';
    backendMessage = error instanceof Error ? error.message : String(error);
  }

  return status();
}

function seedMemory(payload) {
  if (payload.version === memoryVersion) return status();

  memoryDrugs = payload.drugs
    .map((drug, index) => normalizeDrug(drug, index))
    .filter((drug) => drug.code && drug.name);
  memoryUsageOptions = payload.usageOptions
    .map((usageOption, index) => normalizeUsageOption(usageOption, index))
    .filter((usageOption) => usageOption.code && usageOption.label);
  memoryVersion = payload.version;
  return status();
}

function seedSQLite(payload) {
  const currentVersion = db.selectValue("SELECT value FROM meta WHERE key = 'master_data_version'");
  if (currentVersion === payload.version) return status();

  db.transaction(() => {
    db.exec('DELETE FROM drugs; DELETE FROM usage_options;');

    const drugStmt = db.prepare(`
      INSERT INTO drugs (
        code, name, yjCode, isGeneric, genericName, isAbolished, price, stockQuantity,
        location, isNarcotic, isPsychotropic, isPoisonous, isHighRisk, documentUrl,
        searchNameLower, searchGenericLower, sortOrder
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    try {
      payload.drugs.forEach((rawDrug, index) => {
        const drug = normalizeDrug(rawDrug, index);
        if (!drug.code || !drug.name) return;
        drugStmt.bind([
          drug.code,
          drug.name,
          drug.yjCode || null,
          drug.isGeneric ? 1 : 0,
          drug.genericName || null,
          drug.isAbolished ? 1 : 0,
          drug.price,
          drug.stockQuantity,
          drug.location || null,
          drug.isNarcotic ? 1 : 0,
          drug.isPsychotropic ? 1 : 0,
          drug.isPoisonous ? 1 : 0,
          drug.isHighRisk ? 1 : 0,
          drug.documentUrl || null,
          drug.searchNameLower,
          drug.searchGenericLower,
          index
        ]).stepReset();
      });
    } finally {
      drugStmt.finalize();
    }

    const usageStmt = db.prepare(`
      INSERT INTO usage_options (code, label, searchLabelLower, sortOrder)
      VALUES (?, ?, ?, ?)
    `);
    try {
      payload.usageOptions.forEach((rawOption, index) => {
        const usageOption = normalizeUsageOption(rawOption, index);
        if (!usageOption.code || !usageOption.label) return;
        usageStmt.bind([
          usageOption.code,
          usageOption.label,
          usageOption.searchLabelLower,
          index
        ]).stepReset();
      });
    } finally {
      usageStmt.finalize();
    }

    db.exec({
      sql: "INSERT OR REPLACE INTO meta (key, value) VALUES ('master_data_version', ?)",
      bind: [payload.version]
    });
  });

  return status();
}

async function seed(payload) {
  if (!payload || !payload.version) {
    throw new Error('Missing master-data seed payload.');
  }
  if (db) return seedSQLite(payload);
  return seedMemory(payload);
}

function getDrugs() {
  if (db) {
    return sqliteRows('SELECT * FROM drugs ORDER BY sortOrder ASC').map(rowToDrug);
  }
  return memoryDrugs.map(publicDrug);
}

function searchDrugs(payload) {
  const query = normalizeLower(payload && payload.query);
  const limit = clampLimit(payload && payload.limit, 100);
  if (!query) return [];

  if (db) {
    const pattern = `%${escapeLike(query)}%`;
    return sqliteRows(
      `SELECT * FROM drugs
       WHERE searchNameLower LIKE ? ESCAPE '\\'
          OR searchGenericLower LIKE ? ESCAPE '\\'
       ORDER BY sortOrder ASC
       LIMIT ?`,
      [pattern, pattern, limit]
    ).map(rowToDrug);
  }

  const results = [];
  for (const drug of memoryDrugs) {
    if (drug.searchNameLower.includes(query) || drug.searchGenericLower.includes(query)) {
      results.push(publicDrug(drug));
      if (results.length >= limit) break;
    }
  }
  return results;
}

function findDrugsByYjPrefix(payload) {
  const prefix = normalizeText(payload && payload.prefix);
  if (!prefix) return [];

  if (db) {
    return sqliteRows(
      `SELECT * FROM drugs
       WHERE yjCode LIKE ? ESCAPE '\\'
       ORDER BY sortOrder ASC`,
      [`${escapeLike(prefix)}%`]
    ).map(rowToDrug);
  }

  return memoryDrugs
    .filter((drug) => drug.yjCode && drug.yjCode.startsWith(prefix))
    .map(publicDrug);
}

function getUsageOptions() {
  if (db) {
    return sqliteRows('SELECT code, label FROM usage_options ORDER BY sortOrder ASC');
  }
  return memoryUsageOptions.map((option) => ({ code: option.code, label: option.label }));
}

function searchUsageOptions(payload) {
  const query = normalizeLower(payload && payload.query);
  const limit = clampLimit(payload && payload.limit, 50);
  if (!query) return getUsageOptions().slice(0, limit);

  if (db) {
    const pattern = `%${escapeLike(query)}%`;
    return sqliteRows(
      `SELECT code, label FROM usage_options
       WHERE code LIKE ? ESCAPE '\\'
          OR searchLabelLower LIKE ? ESCAPE '\\'
       ORDER BY sortOrder ASC
       LIMIT ?`,
      [pattern, pattern, limit]
    );
  }

  const results = [];
  for (const option of memoryUsageOptions) {
    if (option.code.includes(query) || option.searchLabelLower.includes(query)) {
      results.push({ code: option.code, label: option.label });
      if (results.length >= limit) break;
    }
  }
  return results;
}

async function handleRequest(type, payload) {
  switch (type) {
    case 'init':
      return initSQLite(payload);
    case 'seed':
      return seed(payload);
    case 'getDrugs':
      return getDrugs();
    case 'searchDrugs':
      return searchDrugs(payload);
    case 'findDrugsByYjPrefix':
      return findDrugsByYjPrefix(payload);
    case 'getUsageOptions':
      return getUsageOptions();
    case 'searchUsageOptions':
      return searchUsageOptions(payload);
    case 'status':
      return status();
    default:
      throw new Error(`Unknown SQLite master-data request: ${type}`);
  }
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};
  try {
    const result = await handleRequest(type, payload);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
};
