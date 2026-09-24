// test/claims-graph.test.mjs — claims/claim_evidence graph (RETURNING id fix)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { upsertClaim, addClaimEvidence } from '../lib/db.mjs';

function memDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE claims(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cluster_id INTEGER NOT NULL,
      story_slug TEXT, claim_text TEXT NOT NULL, claim_type TEXT,
      status TEXT DEFAULT 'UNCONFIRMED', confidence REAL DEFAULT 0,
      support_count INTEGER DEFAULT 0, contradiction_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(cluster_id, claim_text)
    );
    CREATE TABLE claim_evidence(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL, source_id TEXT NOT NULL, url TEXT, excerpt TEXT,
      relation TEXT DEFAULT 'supports', evidence_type TEXT, published_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(claim_id) REFERENCES claims(id) ON DELETE CASCADE
    );
  `);
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

test('upsertClaim returns the SAME stable id on duplicate text (RETURNING fix)', () => {
  const db = memDb();
  const a = upsertClaim(db, { cluster_id: 5, claim_text: 'X ঘটেছে', claim_type: 'event' });
  const b = upsertClaim(db, { cluster_id: 5, claim_text: 'X ঘটেছে', claim_type: 'event' });
  assert.equal(a, b, 'duplicate upsert must return the existing claim id');
  db.close();
});

test('duplicate-title members do NOT break evidence FK insert (was the bug)', () => {
  const db = memDb();
  // two members with the SAME title: second upsert conflicts-noop
  const id = upsertClaim(db, { cluster_id: 5, claim_text: 'ঢাকায় অগ্নিকাণ্ড', claim_type: 'headline' });
  const id2 = upsertClaim(db, { cluster_id: 5, claim_text: 'ঢাকায় অগ্নিকাণ্ড', claim_type: 'headline' });
  assert.equal(id, id2);
  addClaimEvidence(db, { claim_id: id, source_id: 's1', url: 'u1' });
  addClaimEvidence(db, { claim_id: id2, source_id: 's2', url: 'u2' }); // formerly FK-failed
  const n = db.prepare('SELECT count(*) n FROM claim_evidence WHERE claim_id=?').get(id).n;
  assert.equal(n, 2);
  db.close();
});

test('distinct claims for one cluster accumulate', () => {
  const db = memDb();
  const a = upsertClaim(db, { cluster_id: 5, claim_text: 'প্রথম ঘটনা', claim_type: 'event' });
  const b = upsertClaim(db, { cluster_id: 5, claim_text: 'দ্বিতীয় ঘটনা', claim_type: 'headline' });
  assert.notEqual(a, b);
  addClaimEvidence(db, { claim_id: a, source_id: 's1' });
  addClaimEvidence(db, { claim_id: b, source_id: 's1' });
  db.close();
});