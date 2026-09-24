// test/temporal-truth.test.mjs — TEMPORAL TRUTH: append-only claim verification history.
// A claim's verification state is a time range (valid_from..valid_until). Status
// changes close the open period and open a fresh one; the ledger is never mutated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.mjs';
import { verifyClaim, recordSnapshot, claimStatusAt, claimTimeline, claimTransitions, applyClaimVerification } from '../lib/claim-verify.mjs';

const trust = { sources: { prothomalo: 'top', banglatribune: 'top', dmp: 'official' } };

function mkClaim(db, claimText = 'X met Y in Dhaka at 5pm') {
  const r = db.prepare(`INSERT INTO claims(cluster_id, claim_text, created_at, updated_at) VALUES (1, ?, ?, ?)`).run(claimText, '2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z');
  return r.lastInsertRowid;
}

test('first recordSnapshot opens an initial period (valid_until NULL)', () => {
  const db = openDb(':memory:');
  const id = mkClaim(db);
  const v = verifyClaim('X', { evidence: [{ source_id: 'prothomalo' }, { source_id: 'banglatribune' }], trust });
  const res = recordSnapshot(db, id, v, { reason: 'initial', now: '2026-09-24T08:00:00.000Z' });
  assert.equal(res.changed, true);
  assert.equal(res.from, null);
  assert.equal(res.to, 'VERIFIED');
  const open = claimStatusAt(db, id);
  assert.equal(open.status, 'VERIFIED');
  assert.equal(open.valid_until, null);
  assert.equal(claimTimeline(db, id).length, 1);
});

test('idempotent re-verify with same status keeps the SAME open period (no new row)', () => {
  const db = openDb(':memory:');
  const id = mkClaim(db);
  const v = verifyClaim('X', { evidence: [{ source_id: 'prothomalo' }, { source_id: 'banglatribune' }], trust });
  recordSnapshot(db, id, v, { reason: 'initial', now: '2026-09-24T08:00:00.000Z' });
  const res = recordSnapshot(db, id, v, { reason: 're-verify', now: '2026-09-24T12:00:00.000Z' });
  assert.equal(res.changed, false);
  assert.equal(res.from, 'VERIFIED');
  assert.equal(res.to, 'VERIFIED');
  assert.equal(claimTimeline(db, id).length, 1);
});

test('status change CLOSES the open period and opens a new one (ledger preserved)', () => {
  const db = openDb(':memory:');
  const id = mkClaim(db);
  const v1 = verifyClaim('X', { evidence: [{ source_id: 'prothomalo' }, { source_id: 'banglatribune' }], trust });
  recordSnapshot(db, id, v1, { reason: 'initial', now: '2026-09-24T08:00:00.000Z' });
  const v2 = verifyClaim('X', { evidence: [{ source_id: 'prothomalo' }], conflicts: [{ resolution: 'unresolved' }], trust });
  const res = recordSnapshot(db, id, v2, { reason: 'conflict', now: '2026-09-24T14:00:00.000Z' });
  assert.equal(res.changed, true);
  assert.equal(res.from, 'VERIFIED');
  assert.equal(res.to, 'CONFLICTING');

  const tl = claimTimeline(db, id);
  assert.equal(tl.length, 2);
  assert.equal(tl[0].status, 'VERIFIED');
  assert.equal(tl[0].valid_until, '2026-09-24T14:00:00.000Z'); // closed
  assert.equal(tl[1].status, 'CONFLICTING');
  assert.equal(tl[1].valid_until, null); // open
  assert.equal(tl[1].reason, 'conflict');
});

test('claimStatusAt resolves the status valid on a given date', () => {
  const db = openDb(':memory:');
  const id = mkClaim(db);
  const v1 = verifyClaim('X', { evidence: [{ source_id: 'prothomalo' }, { source_id: 'banglatribune' }], trust });
  recordSnapshot(db, id, v1, { reason: 'initial', now: '2026-09-24T08:00:00.000Z' });
  const v2 = verifyClaim('X', { evidence: [{ source_id: 'dmp' }], trust }); // OFFICIAL
  recordSnapshot(db, id, v2, { reason: 're-verify', now: '2026-09-25T08:00:00.000Z' });

  assert.equal(claimStatusAt(db, id, '2026-09-24T12:00:00.000Z').status, 'VERIFIED');
  assert.equal(claimStatusAt(db, id, '2026-10-01T00:00:00.000Z').status, 'OFFICIAL'); // open period
  assert.equal(claimTimeline(db, id).map((r) => r.status).join(','), 'VERIFIED,OFFICIAL');
});

test('claimTransitions lists consecutive from->to status changes (flip-flop signal)', () => {
  const db = openDb(':memory:');
  const id = mkClaim(db);
  const v1 = verifyClaim('X', { evidence: [{ source_id: 'prothomalo' }], trust }); // SINGLE_SOURCE
  recordSnapshot(db, id, v1, { reason: 'initial', now: '2026-09-24T08:00:00.000Z' });
  const v2 = verifyClaim('X', { evidence: [{ source_id: 'prothomalo' }], conflicts: [{ resolution: 'unresolved' }], trust }); // CONFLICTING
  recordSnapshot(db, id, v2, { reason: 'conflict', now: '2026-09-24T14:00:00.000Z' });
  const v3 = verifyClaim('X', { evidence: [{ source_id: 'prothomalo' }, { source_id: 'banglatribune' }], trust }); // VERIFIED again
  recordSnapshot(db, id, v3, { reason: 're-verify', now: '2026-09-26T08:00:00.000Z' });

  const tr = claimTransitions(db, id);
  assert.equal(tr.length, 2);
  assert.deepEqual([tr[0].from, tr[0].to], ['SINGLE_SOURCE', 'CONFLICTING']);
  assert.deepEqual([tr[1].from, tr[1].to], ['CONFLICTING', 'VERIFIED']);
  assert.equal(tr[1].changed_at, '2026-09-26T08:00:00.000Z');
});

test('claimStatusAt returns null for a claim with no snapshots', () => {
  const db = openDb(':memory:');
  assert.equal(claimStatusAt(db, 999), null);
  assert.equal(claimTimeline(db, 999).length, 0);
});

test('applyClaimVerification advances updated_at and dates snapshots with the run time', () => {
  const db = openDb(':memory:');
  const trust2 = { sources: { prothomalo: 'top', banglatribune: 'top' } };
  db.prepare(`INSERT INTO claims(cluster_id, claim_text, created_at, updated_at) VALUES (1, ?, ?, ?)`).run('Flood hit the district', '2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z');
  db.prepare(`INSERT INTO claim_evidence(claim_id, source_id, relation, created_at) VALUES (1, ?, ?, ?)`).run('prothomalo', 'supports', '2026-09-24T08:00:00.000Z');
  applyClaimVerification(db, { trust: trust2, now: '2026-09-24T09:00:00.000Z' });
  let row = db.prepare('SELECT updated_at FROM claims WHERE id=1').get();
  assert.equal(row.updated_at, '2026-09-24T09:00:00.000Z');
  let tl = claimTimeline(db, 1);
  assert.equal(tl.length, 1);
  assert.equal(tl[0].valid_from, '2026-09-24T09:00:00.000Z');

  // re-check with new official evidence at a later time -> status changes,
  // the closed period ends exactly at the re-check time
  db.prepare(`INSERT INTO claim_evidence(claim_id, source_id, relation, created_at) VALUES (1, ?, ?, ?)`).run('dmp', 'supports', '2026-09-25T08:00:00.000Z');
  applyClaimVerification(db, { trust: { ...trust2, sources: { ...trust2.sources, dmp: 'official' } }, now: '2026-09-25T09:00:00.000Z' });
  tl = claimTimeline(db, 1);
  assert.equal(tl.length, 2);
  assert.equal(tl[0].status, 'SINGLE_SOURCE');
  assert.equal(tl[0].valid_until, '2026-09-25T09:00:00.000Z');
  assert.equal(tl[1].status, 'OFFICIAL');
  assert.equal(tl[1].valid_from, '2026-09-25T09:00:00.000Z');
  assert.equal(tl[1].valid_until, null);
  row = db.prepare('SELECT updated_at FROM claims WHERE id=1').get();
  assert.equal(row.updated_at, '2026-09-25T09:00:00.000Z');
});