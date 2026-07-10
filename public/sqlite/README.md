SQLite WASM runtime assets live here.

These files are pinned from `@sqlite.org/sqlite-wasm@3.53.0-build1`:

- `index.mjs`
- `sqlite3.wasm`
- `sqlite3-opfs-async-proxy.js`

The master-data worker loads `/sqlite/index.mjs` and `/sqlite/sqlite3.wasm`
by default. To test another build, set:

- `NEXT_PUBLIC_SQLITE_WASM_MODULE_URL`
- `NEXT_PUBLIC_SQLITE_WASM_BINARY_URL`

The master-data worker runs as a module worker and initializes SQLite inside
that worker so OPFS can be used when the browser supports it.
