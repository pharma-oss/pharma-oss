import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { decryptAesGcm, encryptAesGcm, isValidAesGcmKey } from './sync_crypto.ts';

// メイン端末（ハブ）の正本ストア。RxDB open-core の外側で、患者データを含む
// 全コレクションのドキュメントを暗号化して保持する。RxDB の generic replication
// protocol（pull/push ハンドラ）が期待する形へ直接マッピングできる形状にしている。
// 参照: docs/satellite_terminal_sync_plan.md

export const HUB_LOCAL_TERMINAL_ID = 'hub-local';

export interface HubPushRow {
  docId: string;
  newDocumentState: Record<string, unknown>;
  assumedMasterState?: Record<string, unknown> | null;
}

export interface HubPullResult {
  documents: Record<string, unknown>[];
  checkpoint: { seq: number };
}

export interface HubTerminalRecord {
  terminalId: string;
  label: string;
  registeredAt: string;
  lastSeenAt?: string;
  lastPushedSeq?: number;
  revokedAt?: string;
}

export interface HubConflictRecord {
  id: string;
  collection: string;
  docId: string;
  terminalId: string;
  occurredAt: string;
  losingDocumentState: Record<string, unknown>;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface HubStoreOptions {
  dbPath: string;
  encryptionKey: Buffer;
}

export interface HubStore {
  close(): void;
  pull(collection: string, sinceSeq: number, limit: number): HubPullResult;
  push(collection: string, terminalId: string, rows: HubPushRow[]): Record<string, unknown>[];
  registerTerminal(terminalId: string, label: string): { token: string };
  rotateTerminalToken(terminalId: string, label?: string): { token: string };
  verifyTerminal(terminalId: string, token: string): boolean;
  revokeTerminal(terminalId: string): void;
  listTerminals(): HubTerminalRecord[];
  listConflicts(filter?: { collection?: string; resolved?: boolean }): HubConflictRecord[];
  resolveConflict(conflictId: string, resolvedBy: string): void;
}

export const isValidHubEncryptionKey = isValidAesGcmKey;

export function generateTerminalToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function tokensMatch(providedHash: string, storedHash: string): boolean {
  const provided = Buffer.from(providedHash, 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (provided.length !== stored.length) return false;
  return timingSafeEqual(provided, stored);
}

const encryptPayload = encryptAesGcm;
const decryptPayload = decryptAesGcm;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function statesMatch(a: Record<string, unknown> | null | undefined, b: Record<string, unknown> | null | undefined): boolean {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing && bMissing) return true;
  if (aMissing !== bMissing) return false;
  return canonicalJson(a) === canonicalJson(b);
}

export function openHubStore(options: HubStoreOptions): HubStore {
  if (!isValidHubEncryptionKey(options.encryptionKey)) {
    throw new Error('ハブストアの暗号化鍵は32バイトである必要があります。');
  }
  const key = options.encryptionKey;
  const db = new DatabaseSync(options.dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      collection TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      payload_enc BLOB NOT NULL,
      PRIMARY KEY (collection, doc_id)
    );
    CREATE INDEX IF NOT EXISTS idx_docs_collection_seq ON docs(collection, seq);

    CREATE TABLE IF NOT EXISTS seq_counter (
      name TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO seq_counter (name, value) VALUES ('global', 0);

    CREATE TABLE IF NOT EXISTS terminals (
      terminal_id TEXT PRIMARY KEY,
      label TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      last_seen_at TEXT,
      last_pushed_seq INTEGER,
      revoked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conflicts (
      id TEXT PRIMARY KEY,
      collection TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      losing_payload_enc BLOB NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT
    );
  `);

  function nextSeq(): number {
    db.exec("UPDATE seq_counter SET value = value + 1 WHERE name = 'global'");
    const row = db.prepare("SELECT value FROM seq_counter WHERE name = 'global'").get() as { value: number };
    return row.value;
  }

  function readCurrentDoc(collection: string, docId: string): Record<string, unknown> | undefined {
    const row = db.prepare('SELECT payload_enc FROM docs WHERE collection = ? AND doc_id = ?')
      .get(collection, docId) as { payload_enc: Uint8Array } | undefined;
    if (!row) return undefined;
    return JSON.parse(decryptPayload(Buffer.from(row.payload_enc), key));
  }

  function writeDoc(collection: string, docId: string, documentState: Record<string, unknown>): void {
    const seq = nextSeq();
    const deleted = documentState._deleted ? 1 : 0;
    const payloadEnc = encryptPayload(JSON.stringify(documentState), key);
    db.prepare(`
      INSERT INTO docs (collection, doc_id, seq, deleted, payload_enc)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(collection, doc_id) DO UPDATE SET
        seq = excluded.seq,
        deleted = excluded.deleted,
        payload_enc = excluded.payload_enc
    `).run(collection, docId, seq, deleted, payloadEnc);
  }

  function recordConflict(collection: string, docId: string, terminalId: string, losingState: Record<string, unknown>): void {
    const payloadEnc = encryptPayload(JSON.stringify(losingState), key);
    db.prepare(`
      INSERT INTO conflicts (id, collection, doc_id, terminal_id, occurred_at, losing_payload_enc)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(`${collection}:${docId}:${Date.now()}:${randomBytes(4).toString('hex')}`, collection, docId, terminalId, new Date().toISOString(), payloadEnc);
  }

  return {
    close() {
      db.close();
    },

    pull(collection, sinceSeq, limit) {
      const rows = db.prepare(`
        SELECT doc_id, seq, payload_enc FROM docs
        WHERE collection = ? AND seq > ?
        ORDER BY seq ASC
        LIMIT ?
      `).all(collection, sinceSeq, limit) as { doc_id: string; seq: number; payload_enc: Uint8Array }[];

      const documents = rows.map((row) => JSON.parse(decryptPayload(Buffer.from(row.payload_enc), key)));
      const checkpointSeq = rows.length > 0 ? rows[rows.length - 1].seq : sinceSeq;
      return { documents, checkpoint: { seq: checkpointSeq } };
    },

    push(collection, terminalId, rows) {
      const conflicts: Record<string, unknown>[] = [];
      let lastSeq: number | undefined;

      db.exec('BEGIN');
      try {
        for (const row of rows) {
          const currentDoc = readCurrentDoc(collection, row.docId);
          if (currentDoc === undefined || statesMatch(row.assumedMasterState, currentDoc)) {
            writeDoc(collection, row.docId, row.newDocumentState);
            continue;
          }
          conflicts.push(currentDoc);
          recordConflict(collection, row.docId, terminalId, row.newDocumentState);
        }
        const counterRow = db.prepare("SELECT value FROM seq_counter WHERE name = 'global'").get() as { value: number };
        lastSeq = counterRow.value;
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      if (lastSeq !== undefined) {
        db.prepare(`
          UPDATE terminals SET last_seen_at = ?, last_pushed_seq = ?
          WHERE terminal_id = ?
        `).run(new Date().toISOString(), lastSeq, terminalId);
      }

      return conflicts;
    },

    registerTerminal(terminalId, label) {
      const existing = db.prepare('SELECT terminal_id FROM terminals WHERE terminal_id = ?').get(terminalId);
      if (existing) {
        throw new Error(`端末ID ${terminalId} は既に登録されています。`);
      }
      const token = generateTerminalToken();
      db.prepare(`
        INSERT INTO terminals (terminal_id, label, token_hash, registered_at)
        VALUES (?, ?, ?, ?)
      `).run(terminalId, label, hashToken(token), new Date().toISOString());
      return { token };
    },

    rotateTerminalToken(terminalId, label) {
      const token = generateTerminalToken();
      const existing = db.prepare('SELECT terminal_id, label FROM terminals WHERE terminal_id = ?')
        .get(terminalId) as { terminal_id: string; label: string } | undefined;
      if (existing) {
        db.prepare(`
          UPDATE terminals SET token_hash = ?, label = ?, revoked_at = NULL
          WHERE terminal_id = ?
        `).run(hashToken(token), label ?? existing.label, terminalId);
      } else {
        db.prepare(`
          INSERT INTO terminals (terminal_id, label, token_hash, registered_at)
          VALUES (?, ?, ?, ?)
        `).run(terminalId, label ?? '', hashToken(token), new Date().toISOString());
      }
      return { token };
    },

    verifyTerminal(terminalId, token) {
      const row = db.prepare('SELECT token_hash, revoked_at FROM terminals WHERE terminal_id = ?')
        .get(terminalId) as { token_hash: string; revoked_at: string | null } | undefined;
      if (!row || row.revoked_at) return false;
      if (!tokensMatch(hashToken(token), row.token_hash)) return false;
      db.prepare('UPDATE terminals SET last_seen_at = ? WHERE terminal_id = ?')
        .run(new Date().toISOString(), terminalId);
      return true;
    },

    revokeTerminal(terminalId) {
      db.prepare('UPDATE terminals SET revoked_at = ? WHERE terminal_id = ?')
        .run(new Date().toISOString(), terminalId);
    },

    listTerminals() {
      const rows = db.prepare(`
        SELECT terminal_id, label, registered_at, last_seen_at, last_pushed_seq, revoked_at
        FROM terminals ORDER BY registered_at ASC
      `).all() as {
        terminal_id: string; label: string; registered_at: string;
        last_seen_at: string | null; last_pushed_seq: number | null; revoked_at: string | null;
      }[];
      return rows.map((row) => ({
        terminalId: row.terminal_id,
        label: row.label,
        registeredAt: row.registered_at,
        lastSeenAt: row.last_seen_at ?? undefined,
        lastPushedSeq: row.last_pushed_seq ?? undefined,
        revokedAt: row.revoked_at ?? undefined
      }));
    },

    listConflicts(filter) {
      const clauses: string[] = [];
      const params: (string | number)[] = [];
      if (filter?.collection) {
        clauses.push('collection = ?');
        params.push(filter.collection);
      }
      if (filter?.resolved !== undefined) {
        clauses.push(filter.resolved ? 'resolved_at IS NOT NULL' : 'resolved_at IS NULL');
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = db.prepare(`
        SELECT id, collection, doc_id, terminal_id, occurred_at, losing_payload_enc, resolved_at, resolved_by
        FROM conflicts ${where} ORDER BY occurred_at ASC
      `).all(...params) as {
        id: string; collection: string; doc_id: string; terminal_id: string; occurred_at: string;
        losing_payload_enc: Uint8Array; resolved_at: string | null; resolved_by: string | null;
      }[];
      return rows.map((row) => ({
        id: row.id,
        collection: row.collection,
        docId: row.doc_id,
        terminalId: row.terminal_id,
        occurredAt: row.occurred_at,
        losingDocumentState: JSON.parse(decryptPayload(Buffer.from(row.losing_payload_enc), key)),
        resolvedAt: row.resolved_at ?? undefined,
        resolvedBy: row.resolved_by ?? undefined
      }));
    },

    resolveConflict(conflictId, resolvedBy) {
      db.prepare('UPDATE conflicts SET resolved_at = ?, resolved_by = ? WHERE id = ?')
        .run(new Date().toISOString(), resolvedBy, conflictId);
    }
  };
}
