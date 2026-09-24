// test/claim-verify.test.mjs — unit tests for claim-level verification
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyClaim, evidenceHash } from '../lib/claim-verify.mjs';

const trust = { sources: { prothomalo: 'top', dmp: 'official', banglatribune: 'top', x: 'other' } };

test('two+ independent supporting sources -> VERIFIED, no conflict', () => {
  const v = verifyClaim('X met Y in Dhaka', {
    evidence: [{ source_id: 'prothomalo' }, { source_id: 'banglatribune' }, { source_id: 'x' }],
    trust,
  });
  assert.equal(v.status, 'VERIFIED');
  assert.equal(v.support_independent_sources, 3);
  assert.equal(v.contradiction_count, 0);
});

test('single supporting source -> SINGLE_SOURCE (not auto-confirmed)', () => {
  const v = verifyClaim('The meeting happened at 3:30 PM', {
    evidence: [{ source_id: 'prothomalo' }],
    trust,
  });
  assert.equal(v.status, 'SINGLE_SOURCE');
  assert.ok(v.confidence < 50);
});

test('official/agency evidence -> OFFICIAL', () => {
  const v = verifyClaim('Govt decision', { evidence: [{ source_id: 'dmp' }], trust });
  assert.equal(v.status, 'OFFICIAL');
  assert.equal(v.has_official, true);
});

test('unresolved conflict -> CONFLICTING even with multiple supporters', () => {
  const v = verifyClaim('Magnitude 5.2', {
    evidence: [{ source_id: 'prothomalo' }, { source_id: 'banglatribune' }],
    conflicts: [{ resolution: 'unresolved' }],
    trust,
  });
  assert.equal(v.status, 'CONFLICTING');
});

test('no evidence -> UNCONFIRMED', () => {
  const v = verifyClaim('unsubstantiated claim', { evidence: [], trust });
  assert.equal(v.status, 'UNCONFIRMED');
  assert.equal(v.support_count, 0);
});

test('contradicting evidence counts, not silently ignored', () => {
  const v = verifyClaim('casualty 5', {
    evidence: [{ source_id: 'prothomalo' }],
    contradict: [],
    conflicts: [{ resolution: 'unresolved' }],
    trust,
  });
  assert.equal(v.status, 'CONFLICTING');
});

test('evidenceHash is stable regardless of order, changes when evidence changes', () => {
  const a = evidenceHash([{ source_id: 'p1', url: 'u1', published_at: '2026-09-24T00:00:00Z' }, { source_id: 'p2', url: 'u2' }]);
  const b = evidenceHash([{ source_id: 'p2', url: 'u2' }, { source_id: 'p1', url: 'u1', published_at: '2026-09-24T00:00:00Z' }]);
  assert.equal(a, b); // order-insensitive
  const c = evidenceHash([{ source_id: 'p1', url: 'u1', published_at: '2026-09-24T00:00:00Z' }, { source_id: 'p2', url: 'u2' }, { source_id: 'p3', url: 'u3' }]);
  assert.notEqual(a, c); // new source changes the fingerprint
  const d = evidenceHash([{ source_id: 'p1', url: 'u1', published_at: '2026-09-24T00:00:00Z', relation: 'contradicts' }, { source_id: 'p2', url: 'u2', relation: 'contradicts' }]);
  assert.equal(d, evidenceHash([])); // contradicts never count as a fingerprint
});

test('stale-only supporting evidence trims confidence (no hard status change)', () => {
  const daysAgo100 = new Date(Date.now() - 100 * 86_400_000).toISOString();
  const fresh = verifyClaim('new figure', {
    evidence: [{ source_id: 'prothomalo', published_at: new Date(Date.now() - 1 * 86_400_000).toISOString() }, { source_id: 'banglatribune', published_at: new Date(Date.now() - 1 * 86_400_000).toISOString() }],
    trust,
  });
  const stale = verifyClaim('new figure', {
    evidence: [{ source_id: 'prothomalo', published_at: daysAgo100 }, { source_id: 'banglatribune', published_at: daysAgo100 }],
    trust,
  });
  assert.equal(fresh.status, 'VERIFIED');
  assert.equal(stale.status, 'VERIFIED'); // honesty floor: still supported
  assert.equal(stale.evidence_age.stale, 2);
  assert.equal(fresh.evidence_age.stale, 0);
  assert.ok(fresh.confidence > stale.confidence); // old anchors are discounted
});

test('evidence age profile reports max age and oldest evidence date', () => {
  const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
  const v = verifyClaim('X', { evidence: [{ source_id: 'prothomalo', published_at: old }, { source_id: 'banglatribune', published_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }], trust });
  assert.equal(v.evidence_age.max_days >= 200, true);
  assert.equal(v.evidence_age.oldest_evidence_at, old);
  assert.ok('evidence_hash' in v);
});