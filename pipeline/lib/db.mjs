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
  `);
  return db;
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