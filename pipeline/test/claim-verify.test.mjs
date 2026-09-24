// test/claim-verify.test.mjs — unit tests for claim-level verification
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyClaim } from '../lib/claim-verify.mjs';

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