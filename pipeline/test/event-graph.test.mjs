// test/event-graph.test.mjs — story event graph derivation (read-only, deterministic)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveTimeline, sortTimeline, KIND_LABELS } from '../lib/event-graph.mjs';
import { openDb } from '../lib/db.mjs';

const T1 = '2026-09-20T08:00:00.000Z';
const T2 = '2026-09-21T09:00:00.000Z';
const T3 = '2026-09-22T10:00:00.000Z';

test('deriveTimeline merges claim/evidence/verify/conflict events chronologically', () => {
  const claims = [{ id: 1, cluster_id: 5, claim_text: 'দাবি ক', created_at: T2 }];
  const events = deriveTimeline({
    claims,
    evidence: [{ claim_id: 1, source_id: 'prothomalo', relation: 'supports', published_at: T1, url: null }],
    snapshots: [{ claim_id: 1, status: 'VERIFIED', confidence: 80, valid_from: T3, reason: 're-verify' }],
    conflicts: [{ claim_id: 1, conflict_type: 'facts', field: 'figure', created_at: T3 }],
  });
  assert.equal(events.length, 4);
  assert.equal(events[0].kind, 'evidence'); // earliest: evidence at T1
  assert.equal(events[0].detail.source_id, 'prothomalo');
  assert.equal(events[1].kind, 'claim'); // claim at T2
  assert.equal(events[1].claim_text, 'দাবি ক');
  assert.ok(events[2].kind === 'verify' || events[2].kind === 'conflict'); // T3 pair, stable order
  assert.ok(events[3].kind === 'verify' || events[3].kind === 'conflict');
  const statuses = events.filter((e) => e.kind === 'verify').map((e) => e.detail.status);
  assert.deepEqual(statuses, ['VERIFIED']);
});

test('verify events dedupe unchanged periods (idempotent re-verify reuse of open period)', () => {
  const claims = [{ id: 1, cluster_id: 5, claim_text: 'দাবি', created_at: T1 }];
  const snapshots = [
    { claim_id: 1, status: 'VERIFIED', confidence: 80, valid_from: T1, reason: 'verify' },
    { claim_id: 1, status: 'VERIFIED', confidence: 80, valid_from: T2, reason: 're-verify' }, // no change → skipped
    { claim_id: 1, status: 'CONFLICTING', confidence: 20, valid_from: T3, reason: 'conflict' },
  ];
  const events = deriveTimeline({ claims, snapshots });
  const verifies = events.filter((e) => e.kind === 'verify');
  assert.equal(verifies.length, 2); // VERIFIED + CONFLICTING, the middle no-op dropped
  assert.equal(verifies[1].detail.from, 'VERIFIED');
  assert.equal(verifies[1].detail.status, 'CONFLICTING');
});

test('events without a ts are dropped; sortTimeline is stable', () => {
  const events = deriveTimeline({
    claims: [{ id: 1, cluster_id: 5, claim_text: 'x', created_at: null }],
    evidence: [{ claim_id: 1, source_id: 's', relation: 'supports', published_at: null }],
  });
  assert.equal(events.length, 0);
  const sorted = sortTimeline([
    { ts: '2026-09-22T00:00:00.000Z', kind: 'claim' },
    { ts: '2026-09-20T00:00:00.000Z', kind: 'evidence' },
  ]);
  assert.deepEqual(sorted.map((e) => e.kind), ['evidence', 'claim']);
});

test('KIND_LABELS covers every emitted kind (reader copy)', () => {
  for (const kind of ['claim', 'evidence', 'verify', 'conflict']) assert.ok(KIND_LABELS[kind]);
});

test('storyTimeline returns empty events when a cluster has no claims', () => {
  const db = openDb(':memory:');
  const tl = storyTimelineFromDb(db, 999);
  assert.equal(tl.events.length, 0);
  db.close();
});

// import via dynamic to avoid needing the db fixture above
import { storyTimeline as storyTimelineFromDb } from '../lib/event-graph.mjs';

test('relatedStories links by shared sources (>=2) not single coincidental outlet', () => {
  const db = openDb(':memory:');
  seedCluster(db, 1, 'এক', ['prothomalo', 'dailystar']);
  seedCluster(db, 2, 'দুই', ['prothomalo', 'dailystar', 'samakal']);
  seedCluster(db, 3, 'তিন', ['prothomalo']); // only 1 shared → NOT related
  const dbg = import('../lib/event-graph.mjs').then((m) => m);
  return dbg.then(async (m) => {
    const related = m.relatedStories(db, 1);
    const ids = related.map((r) => r.cluster_id);
    assert.deepEqual(ids, [2]);
    assert.ok(related[0].source_links >= 2);
    db.close();
  });
});

function seedCluster(db, cid, text, sources) {
  db.prepare(`INSERT INTO clusters(id, status, first_seen, last_update, member_count, headline) VALUES (?, 'open', ?, ?, 1, ?)`)
    .run(cid, T1, T2, text);
  db.prepare(`INSERT INTO claims(id, cluster_id, claim_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(cid * 100, cid, `${text}-দাবি`, T1, T2);
  for (const src of sources) {
    db.prepare(`INSERT INTO claim_evidence(claim_id, source_id, relation, published_at, created_at) VALUES (?, ?, 'supports', ?, ?)`)
      .run(cid * 100, src, T1, T1);
  }
}

test('storyVersions exposes the full append-only ledger in period order', async () => {
  const db = openDb(':memory:');
  const m = await import('../lib/event-graph.mjs');
  seedCluster(db, 1, 'প্রথম', ['prothomalo']);
  db.prepare(`INSERT INTO claim_snapshots(claim_id, status, confidence, evidence_hash, valid_from, valid_until, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(100, 'VERIFIED', 80, 'h1', T1, T2, 'verify', T1);
  db.prepare(`INSERT INTO claim_snapshots(claim_id, status, confidence, evidence_hash, valid_from, valid_until, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(100, 'CONFLICTING', 20, 'h2', T2, T3, 're-verify', T2);
  db.prepare(`INSERT INTO claim_snapshots(claim_id, status, confidence, evidence_hash, valid_from, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(100, 'VERIFIED', 90, 'h3', T3, 'conflict', T3); // current open period
  const versions = m.storyVersions(db, 1);
  assert.equal(versions.length, 1);
  const periods = versions[0].periods;
  assert.equal(periods.length, 3);
  assert.deepEqual(periods.map((p) => p.status), ['VERIFIED', 'CONFLICTING', 'VERIFIED']); // chronological
  assert.equal(periods[0].valid_until, T2); // closed
  assert.equal(periods[2].valid_until, null); // current open period
  assert.equal(periods[2].reason, 'conflict');
  assert.equal(versions[0].claim_text, 'প্রথম-দাবি');
  db.close();
});

test('storyVersions returns empty array for a cluster with no claims', async () => {
  const db = openDb(':memory:');
  const m = await import('../lib/event-graph.mjs');
  assert.deepEqual(m.storyVersions(db, 999), []);
  db.close();
});