// lib/db.mjs — SQLite store via node:sqlite (zero native deps)
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export const DB_PATH = resolve(import.meta.dirname, '../state/store.db');

export function openDb(path = DB_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS raw_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      url_hash TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      published_at TEXT,
      seen_at TEXT NOT NULL,
      category TEXT,
      lang TEXT,
      dup_of_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_raw_seen ON raw_items(published_at);
    CREATE INDEX IF NOT EXISTS idx_raw_hash  ON raw_items(url_hash);
    CREATE TABLE IF NOT EXISTS fetch_history(
      source_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      http_status INTEGER,
      etag TEXT,
      modified TEXT,
      item_count INTEGER,
      PRIMARY KEY(source_id, fetched_at)
    );
    CREATE TABLE IF NOT EXISTS clusters(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT NOT NULL DEFAULT 'open',
      first_seen TEXT NOT NULL,
      last_update TEXT NOT NULL,
      member_count INTEGER NOT NULL DEFAULT 0,
      mature_runs INTEGER NOT NULL DEFAULT 0,
      headline TEXT
    );
    CREATE TABLE IF NOT EXISTS cluster_members(
      cluster_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 1,
      added_at TEXT NOT NULL,
      PRIMARY KEY(cluster_id, item_id)
    );
    CREATE INDEX IF NOT EXISTS idx_member_item ON cluster_members(item_id);
    CREATE TABLE IF NOT EXISTS verdicts(
      cluster_id INTEGER PRIMARY KEY,
      tier TEXT NOT NULL,
      score REAL NOT NULL,
      badge TEXT NOT NULL,
      status TEXT NOT NULL,
      signals_json TEXT NOT NULL,
      evaluated_at TEXT NOT NULL
    );

    -- Claim -> Evidence graph (non-destructive, dual-write)
    CREATE TABLE IF NOT EXISTS claims(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER NOT NULL,
      story_slug TEXT,
      claim_text TEXT NOT NULL,
      claim_type TEXT,
      status TEXT DEFAULT 'UNCONFIRMED',
      confidence REAL DEFAULT 0,
      support_count INTEGER DEFAULT 0,
      contradiction_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cluster_id, claim_text)
    );
    CREATE INDEX IF NOT EXISTS idx_claims_cluster ON claims(cluster_id);
    CREATE TABLE IF NOT EXISTS claim_evidence(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT,
      excerpt TEXT,
      relation TEXT DEFAULT 'supports', -- supports|contradicts|official
      evidence_type TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(claim_id) REFERENCES claims(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ce_claim ON claim_evidence(claim_id);
    -- Stop the 48x duplication recurring. Partial on url IS NOT NULL because url
    -- is nullable and SQLite counts NULLs as distinct in a unique index, which
    -- would leave url-less evidence free to duplicate. See addClaimEvidence().
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ce_claim_url ON claim_evidence(claim_id, url) WHERE url IS NOT NULL;
    -- Temporal truth: append-only verification snapshots per claim. Each row is a
    -- period during which a claim's verification state was VALID (valid_from..valid_until;
    -- valid_until NULL = the current open period). Never mutated in place — a status
    -- change closes the open row and opens a new one.
    CREATE TABLE IF NOT EXISTS claim_snapshots(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      support_count INTEGER NOT NULL DEFAULT 0,
      contradiction_count INTEGER NOT NULL DEFAULT 0,
      evidence_hash TEXT,
      evidence_count INTEGER NOT NULL DEFAULT 0,
      oldest_evidence_at TEXT,
      valid_from TEXT NOT NULL,
      valid_until TEXT,
      reason TEXT NOT NULL DEFAULT 'verify', -- initial | re-verify | conflict
      created_at TEXT NOT NULL,
      FOREIGN KEY(claim_id) REFERENCES claims(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_cs_claim ON claim_snapshots(claim_id);
    CREATE TABLE IF NOT EXISTS conflicts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER NOT NULL,
      claim_id INTEGER,
      conflict_type TEXT,
      field TEXT,
      values_json TEXT,
      sources_json TEXT,
      resolution TEXT DEFAULT 'unresolved',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conflicts_cluster ON conflicts(cluster_id);

    -- Actor registry + claim link (entity resolution, P0-10)
    CREATE TABLE IF NOT EXISTS actors(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canonical TEXT NOT NULL UNIQUE,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      kind TEXT DEFAULT 'person',
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      claim_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS actors_claims(
      actor_id INTEGER NOT NULL,
      claim_id INTEGER NOT NULL,
      mention TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(actor_id, claim_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ac_claim ON actors_claims(claim_id);
  `);
  // Migrations for the RACED committed store.db — a parallel worker may already
  // have created claim_snapshots with the pre-evidence shape. CREATE-or-skip does
  // not add columns, so ALTER-add any missing ones (idempotent, safe to re-run).
  ensureColumn(db, 'claim_snapshots', 'evidence_hash', 'TEXT');
  ensureColumn(db, 'claim_snapshots', 'evidence_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'claim_snapshots', 'oldest_evidence_at', 'TEXT');
  return db;
}

// Add a column to a table if it does not exist yet (idempotent migration).
export function ensureColumn(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// Insert one raw item. Returns { inserted, id } — url unique constraint guards exact dups.
export function insertRawItem(db, it) {
  const st = db.prepare(`
    INSERT OR IGNORE INTO raw_items
      (source_id,url,url_hash,title,body,published_at,seen_at,category,lang)
    VALUES (?,?,?,?,?,?,?,?,?)
  `);
  const info = st.run(
    it.source_id, it.url, it.url_hash, it.title, it.body ?? '',
    it.published_at ?? null, it.seen_at, it.category ?? null, it.lang ?? null,
  );
  if (info.changes === 0) {
    const existing = db.prepare('SELECT id FROM raw_items WHERE url = ?').get(it.url);
    return { inserted: false, id: existing?.id ?? null };
  }
  return { inserted: true, id: Number(info.lastInsertRowid) };
}

export function logFetch(db, { source_id, http_status, etag, modified, item_count }) {
  db.prepare(`
    INSERT INTO fetch_history(source_id,fetched_at,http_status,etag,modified,item_count)
    VALUES (?,?,?,?,?,?)
  `).run(source_id, new Date().toISOString(), http_status ?? null, etag ?? null, modified ?? null, item_count ?? 0);
}

export function recentItems(db, hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000).toISOString();
  return db.prepare(`
    SELECT * FROM raw_items
    WHERE seen_at >= ? AND dup_of_id IS NULL
    ORDER BY published_at DESC
  `).all(since);
}

// Existing open/mature clusters with their member item-id sets (for stable reuse).
export function existingClusters(db) {
  return db.prepare('SELECT id, status, mature_runs FROM clusters WHERE status != ? ORDER BY id').all('closed');
}

export function clusterMemberSets(db) {
  const rows = db.prepare('SELECT cluster_id, item_id FROM cluster_members').all();
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.cluster_id)) map.set(r.cluster_id, new Set());
    map.get(r.cluster_id).add(r.item_id);
  }
  return map;
}

export function insertCluster(db, { status = 'open', headline = '' } = {}) {
  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO clusters (status, first_seen, last_update, member_count, headline) VALUES (?,?,?,0,?)')
    .run(status, now, now, headline);
  return Number(info.lastInsertRowid);
}

export function addClusterMembers(db, clusterId, members) {
  for (const m of members) {
    db.prepare('INSERT OR IGNORE INTO cluster_members (cluster_id,item_id,source_id,score,added_at) VALUES (?,?,?,?,?)')
      .run(clusterId, m.item_id, m.source_id, m.score ?? 1, new Date().toISOString());
  }
}

export function touchCluster(db, clusterId, { status, headline, memberCount, matureRuns }) {
  db.prepare('UPDATE clusters SET status=?, last_update=?, member_count=?, mature_runs=?, headline=? WHERE id=?')
    .run(status, new Date().toISOString(), memberCount, matureRuns, headline, clusterId);
}
export function upsertClaim(db, { cluster_id, story_slug = null, claim_text, claim_type = null, status = 'UNCONFIRMED' }) {
  const now = new Date().toISOString();
  // RETURNING gives the deterministic row id on BOTH insert and conflict-update
  // paths (last_insert_rowid() is STALE on an unchanged DO UPDATE — it can point
  // at a previous claim_evidence insert → the child FK insert then fails).
  const row = db.prepare(`
    INSERT INTO claims (cluster_id, story_slug, claim_text, claim_type, status, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(cluster_id, claim_text) DO UPDATE SET
      story_slug=COALESCE(excluded.story_slug, story_slug),
      claim_type=COALESCE(excluded.claim_type, claim_type),
      status=COALESCE(excluded.status, status),
      updated_at=excluded.updated_at
    RETURNING id
  `).get(cluster_id, story_slug, claim_text, claim_type, status, now, now);
  return Number(row?.id ?? -1);
}

export function addClaimEvidence(db, { claim_id, source_id, url = null, excerpt = null, relation = 'supports', evidence_type = null, published_at = null }) {
  const now = new Date().toISOString();
  // INSERT OR IGNORE, backed by the partial unique index added in ensureSchema.
  //
  // 2026-09-26: this was a bare INSERT, and the pipeline re-attaches the same
  // evidence on every run, so claim_evidence grew to 68,500 rows holding only
  // 1,207 distinct (claim_id, url, excerpt) tuples. 62 MB of a database that
  // then crossed GitHub's 100 MB hard file-size limit and blocked every push.
  //
  // The index is PARTIAL on url IS NOT NULL, because url is nullable and SQLite
  // treats NULLs as distinct in a unique index, which would let url-less
  // evidence duplicate freely. `id` is the conflict target, which SQLite accepts
  // for partial indexes, so only genuinely new evidence inserts.
  db.prepare(`
    INSERT OR IGNORE INTO claim_evidence (claim_id, source_id, url, excerpt, relation, evidence_type, published_at, created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(claim_id, source_id, url, excerpt, relation, evidence_type, published_at, now);
}

export function recordConflict(db, { cluster_id, claim_id = null, conflict_type = null, field = null, values = [], sources = [], resolution = 'unresolved' }) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO conflicts (cluster_id, claim_id, conflict_type, field, values_json, sources_json, resolution, created_at)
    VALUES (?,?,?,?,?,?,?,?)
  `).run(cluster_id, claim_id, conflict_type, field, JSON.stringify(values), JSON.stringify(sources), resolution, now);
}
