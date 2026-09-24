// test/reverify.test.mjs — corrections + re-verification engine tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectCorrections, applyCorrection, badgeDropped, loadFrontmatter } from '../lib/reverify.mjs';

test('badgeDropped detects rank decrease only', () => {
  assert.equal(badgeDropped('confirmed', 'partial'), true);
  assert.equal(badgeDropped('confirmed', 'verified'), true);
  assert.equal(badgeDropped('partial', 'partial'), false);
  assert.equal(badgeDropped('partial', 'confirmed'), false); // UPGRADE is not a correction trigger
  assert.equal(badgeDropped('confirmed', undefined), false);
});

test('detectCorrections: verdict not passed + badge drop + conflict', () => {
  const notes = detectCorrections({
    front: { verification: { badge: 'confirmed' } },
    verdict: { status: 'human_check', badge: 'partial' },
    claims: [{ claim_text: 'XXX', status: 'CONFLICTING', contradiction_count: 1 }],
    headlineStatus: 'supported',
  });
  assert.ok(notes.some((n) => n.includes('পাস নয়')));
  assert.ok(notes.some((n) => n.includes('ব্যাজ কমেছে')));
  assert.ok(notes.some((n) => n.includes('দ্বন্দ্ব')));
});

test('detectCorrections: healthy story yields no notes', () => {
  const notes = detectCorrections({
    front: { verification: { badge: 'confirmed' } },
    verdict: { status: 'passed', badge: 'confirmed' },
    claims: [{ claim_text: 'X', status: 'VERIFIED' }],
    headlineStatus: 'supported',
  });
  assert.deepEqual(notes, []);
});

test('detectCorrections: headline overclaim triggers R4', () => {
  const notes = detectCorrections({
    front: { verification: { badge: 'verified' } },
    verdict: { status: 'passed', badge: 'verified' },
    claims: [],
    headlineStatus: 'overclaim',
  });
  assert.ok(notes.some((n) => n.includes('শিরোনাম')));
});

test('detectCorrections: R5 flip-flop — claim went CONFLICTING then recovered', () => {
  const notes = detectCorrections({
    front: { verification: { badge: 'verified' } },
    verdict: { status: 'passed', badge: 'verified' },
    claims: [{ id: 7, claim_text: 'Z', status: 'VERIFIED' }],
    headlineStatus: 'supported',
    timelines: { 7: [
      { from: 'VERIFIED', to: 'CONFLICTING', changed_at: '2026-09-24T14:00:00.000Z' },
      { from: 'CONFLICTING', to: 'VERIFIED', changed_at: '2026-09-26T08:00:00.000Z' },
    ] },
  });
  assert.ok(notes.some((n) => n.includes('দোদুল্যমান')));
});

test('detectCorrections: no flip-flop (stable timeline) yields no R5 note', () => {
  const notes = detectCorrections({
    front: { verification: { badge: 'confirmed' } },
    verdict: { status: 'passed', badge: 'confirmed' },
    claims: [{ id: 1, claim_text: 'A', status: 'VERIFIED' }],
    headlineStatus: 'supported',
    timelines: { 1: [
      { from: 'SINGLE_SOURCE', to: 'VERIFIED', changed_at: '2026-09-25T08:00:00.000Z' },
    ] },
  });
  assert.ok(!notes.some((n) => n.includes('দোদুল্যমান')));
});

test('applyCorrection writes corrected/updated/updates + validates parsed yaml', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reverify-'));
  const mdPath = join(dir, 'x.md');
  const original = `---
title: "X"
date: 2026-09-20T10:00:00.000Z
corrected: false
updates: []
verification:
  badge: "confirmed"
---
body line`;
  writeFileSync(mdPath, original);
  const res = applyCorrection({ mdPath, notes: ['সূত্রে দ্বন্দ্ব ধরা পড়েছে («X»)'] });
  assert.equal(res.changed, true);
  const { front } = loadFrontmatter(mdPath);
  assert.equal(front.corrected, true);
  assert.ok(front.updated);
  assert.equal(front.correctionNote, 'সূত্রে দ্বন্দ্ব ধরা পড়েছে («X»)');
  assert.equal(front.updates.length, 1);
  assert.equal(front.updates[0].label, 'সংশোধন');
  // body untouched
  assert.equal(front.title, 'X');
});

test('applyCorrection is idempotent — same note not appended twice', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reverify2-'));
  const mdPath = join(dir, 'x.md');
  writeFileSync(mdPath, `---
title: "X"
date: 2026-09-20T10:00:00.000Z
corrected: true
updated: 2026-09-21T10:00:00.000Z
correctionNote: "note-one"
updates:
  - date: "2026-09-21T10:00:00.000Z"
    note: "note-one"
    label: "সংশোধন"
---
body`);
  const res = applyCorrection({ mdPath, notes: ['note-one'] });
  assert.equal(res.changed, false);
  const { front } = loadFrontmatter(mdPath);
  assert.equal(front.updates.length, 1);
});