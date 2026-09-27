// test/db-upsert.test.mjs — a duplicate fetch must be able to upgrade a thin
// stored body, and must never be able to downgrade a rich one.
//
// Context (2026-09-27): feeds return the same items every run, so nearly every
// fetch is a duplicate. With a bare INSERT OR IGNORE the enrichment work was
// computed and discarded every 30 minutes, which is why the store stayed
// permanently thin and the evidence gate refused every brief.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { insertRawItem } from '../lib/db.mjs';

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE raw_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT, url TEXT, url_hash TEXT UNIQUE, title TEXT, body TEXT,
      published_at TEXT, seen_at TEXT, category TEXT, lang TEXT, dup_of_id INTEGER
    )`);
  return db;
}

const item = (body, over = {}) => ({
  source_id: 'bbc-bengali',
  url: 'https://example.test/a/1',
  url_hash: 'hash-1',
  title: 'একটি শিরোনাম',
  body,
  published_at: null,
  seen_at: '2026-09-27T19:00:00.000Z',
  category: null,
  lang: 'bn',
  ...over,
});

const storedLength = (db) => db.prepare('SELECT LENGTH(body) l FROM raw_items').get().l;

test('insertRawItem inserts a genuinely new item', () => {
  const db = freshDb();
  const r = insertRawItem(db, item('a'.repeat(180)));
  assert.equal(r.inserted, true);
  assert.equal(r.upgraded, false);
  assert.equal(storedLength(db), 180);
});

test('insertRawItem upgrades a thin body when a duplicate arrives enriched', () => {
  const db = freshDb();
  insertRawItem(db, item('a'.repeat(180)));          // the 18-52 word reality
  const r = insertRawItem(db, item('b'.repeat(2400))); // fetched full article
  assert.equal(r.inserted, false, 'still a duplicate');
  assert.equal(r.upgraded, true, 'but the body was upgraded');
  assert.equal(storedLength(db), 2400);
});

test('insertRawItem never downgrades a rich body with a thin re-fetch', () => {
  const db = freshDb();
  insertRawItem(db, item('b'.repeat(2400)));
  const r = insertRawItem(db, item('c'.repeat(60))); // blocked/truncated retry
  assert.equal(r.upgraded, false);
  assert.equal(storedLength(db), 2400, 'stored body untouched');
});

test('insertRawItem ignores a marginal length gain', () => {
  const db = freshDb();
  insertRawItem(db, item('a'.repeat(1000)));
  const r = insertRawItem(db, item('a'.repeat(1030))); // +30, under the margin
  assert.equal(r.upgraded, false);
  assert.equal(storedLength(db), 1000);
});

test('insertRawItem reports the existing id on a duplicate', () => {
  const db = freshDb();
  const first = insertRawItem(db, item('a'.repeat(180)));
  const again = insertRawItem(db, item('a'.repeat(180)));
  assert.equal(again.id, first.id);
});
