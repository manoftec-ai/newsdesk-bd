// test/source-health.test.mjs — source-health derivation (read-only, deterministic)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSourceHealth, loadSourceHealth, HEALTH_LABELS } from '../lib/source-health.mjs';
import { openDb } from '../lib/db.mjs';

const ASOF = new Date('2026-09-24T00:00:00.000Z').getTime();
const recent = '2026-09-23T00:00:00.000Z';
const ancient = '2025-01-01T00:00:00.000Z'; // ~266 days before asOf

const trust = { sources: { prothomalo: 'top', dailystar: 'top', wirex: 'other', dmp: 'official' } };
const lineage = {
  prothomalo: { source_type: 'major_news' },
  dailystar: { source_type: 'major_news' },
  wirex: { wire_origin: 'AP' },
  ap: { source_type: 'major_news' },
  dmp: { source_type: 'official' },
};

test('healthy source: many claims, no conflicts, fresh evidence, independent', () => {
  const evidence = [
    { source_id: 'prothomalo', claim_id: 1, relation: 'supports', published_at: recent },
    { source_id: 'prothomalo', claim_id: 2, relation: 'supports', published_at: recent },
    { source_id: 'prothomalo', claim_id: 3, relation: 'supports', published_at: recent },
  ];
  const h = deriveSourceHealth({ evidence, transitions: new Map(), current: new Map([[1, 'VERIFIED'], [2, 'VERIFIED'], [3, 'VERIFIED']]), trust, lineage, asOfMs: ASOF });
  const s = h.prothomalo;
  assert.equal(s.claims_supported, 3);
  assert.equal(s.conflict_affected, 0);
  assert.equal(s.stale_share, 0);
  assert.equal(s.independent, true);
  assert.ok(s.health_score >= 80);
  assert.equal(s.health_label, HEALTH_LABELS.healthy);
});

test('conflict-ridden source drops to flagged; conflicts counted once per claim', () => {
  const evidence = [
    { source_id: 'dailystar', claim_id: 1, relation: 'supports', published_at: recent },
    { source_id: 'dailystar', claim_id: 2, relation: 'supports', published_at: recent },
  ];
  const transitions = new Map([
    [1, [{ from: 'VERIFIED', to: 'CONFLICTING' }, { from: 'CONFLICTING', to: 'VERIFIED' }]],
    [2, []],
  ]);
  const current = new Map([[1, 'VERIFIED'], [2, 'SINGLE_SOURCE']]);
  const h = deriveSourceHealth({ evidence, transitions, current, trust, lineage, asOfMs: ASOF });
  const s = h.dailystar;
  assert.equal(s.conflict_affected, 1); // claim 1 affected once despite 2 transitions
  assert.ok(s.health_score < 90); // still penalized by the conflict share
  assert.equal(s.health_label, HEALTH_LABELS.flagged); // >=50% of claims conflict-prone -> flag
});

test('fully-conflicted single source scores below 50', () => {
  const evidence = [
    { source_id: 'dailystar', claim_id: 1, relation: 'supports', published_at: recent },
  ];
  const transitions = new Map([[1, [{ from: 'VERIFIED', to: 'CONFLICTING' }]]]);
  const current = new Map([[1, 'CONFLICTING']]);
  const h = deriveSourceHealth({ evidence, transitions, current, trust, lineage, asOfMs: ASOF });
  assert.ok(h.dailystar.health_score < 80); // heavily penalized by 100% conflict share
  assert.equal(h.dailystar.health_label, HEALTH_LABELS.flagged);
});

test('stale-heavy evidence penalizes and wire-syndicated sources lose independence points', () => {
  const evidence = [
    { source_id: 'wirex', claim_id: 1, relation: 'supports', published_at: ancient },
    { source_id: 'wirex', claim_id: 2, relation: 'supports', published_at: ancient },
  ];
  const h = deriveSourceHealth({ evidence, transitions: new Map(), current: new Map([[1, 'VERIFIED'], [2, 'VERIFIED']]), trust, lineage, asOfMs: ASOF });
  const s = h.wirex;
  assert.equal(s.stale_share, 1);
  assert.equal(s.independent, false); // shares AP wire
  assert.ok(s.health_score < 80);
  assert.notEqual(s.health_label, HEALTH_LABELS.healthy);
});

test('contradicting evidence rows are not counted as supporting claims', () => {
  const evidence = [
    { source_id: 'prothomalo', claim_id: 1, relation: 'supports', published_at: recent },
    { source_id: 'prothomalo', claim_id: 1, relation: 'contradicts', published_at: recent },
  ];
  const h = deriveSourceHealth({ evidence, transitions: new Map(), current: new Map([[1, 'CONFLICTING']]), trust, lineage, asOfMs: ASOF });
  assert.equal(h.prothomalo.claims_supported, 1);
  assert.equal(h.prothomalo.conflict_affected, 1); // the claim IS conflicting
});

test('loadSourceHealth aggregates from store.db rows (integration)', () => {
  const db = openDb(':memory:');
  // claim 1: two fresh supporting rows, stable VERIFIED ledger
  db.prepare(`INSERT INTO claims(id, cluster_id, claim_text, created_at, updated_at) VALUES (1, 10, 'A', ?, ?)`).run('2026-09-24T00:00:00.000Z', '2026-09-24T00:00:00.000Z');
  db.prepare(`INSERT INTO claim_evidence(claim_id, source_id, relation, published_at, created_at) VALUES (1, 'prothomalo', 'supports', ?, ?)`).run(recent, '2026-09-24T00:00:00.000Z');
  db.prepare(`INSERT INTO claim_evidence(claim_id, source_id, relation, published_at, created_at) VALUES (1, 'dailystar', 'supports', ?, ?)`).run(recent, '2026-09-24T00:00:00.000Z');
  db.prepare(`INSERT INTO claim_snapshots(claim_id, status, confidence, valid_from, valid_until, reason, created_at) VALUES (1, 'VERIFIED', 80, '2026-09-24T00:00:00.000Z', NULL, 'initial', '2026-09-24T00:00:00.000Z')`).run();
  db.prepare(`INSERT INTO claim_snapshots(claim_id, status, confidence, valid_from, valid_until, reason, created_at) VALUES (1, 'CONFLICTING', 30, '2026-09-24T01:00:00.000Z', '2026-09-24T02:00:00.000Z', 'conflict', '2026-09-24T01:00:00.000Z')`).run();
  db.prepare(`INSERT INTO claim_snapshots(claim_id, status, confidence, valid_from, valid_until, reason, created_at) VALUES (1, 'VERIFIED', 70, '2026-09-24T02:00:00.000Z', NULL, 're-verify', '2026-09-24T02:00:00.000Z')`).run();

  const health = loadSourceHealth(db, { trust, lineage, asOfMs: ASOF });
  assert.ok(health.prothomalo);
  assert.ok(health.dailystar);
  assert.equal(health.dailystar.claims_supported, 1);
  assert.equal(health.prothomalo.conflict_affected, 1); // claim flip-flopped -> conflict-affected
  assert.equal(health.prothomalo.stale_share, 0);
});