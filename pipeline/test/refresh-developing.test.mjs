// test/refresh-developing.test.mjs — the developing lane's watch clock and its
// rewrites (2026-09-30). The rules under test are the user's: nothing is
// touched for 2 hours, a new source is added after that, a quiet story keeps
// being watched for 6 more hours, and after 8 hours it is left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { openDb } from '../lib/db.mjs';
import {
  phaseOf, freshReports, decideAction, noteFor, applyRefresh, refreshDeveloping, splitFrontmatter,
} from '../tools/refresh_developing.mjs';

const HOUR = 3_600_000;
const AT = '2026-09-30T16:05:00.000Z';
const TITLE = 'ঢাকায় নতুন ফ্লাইওভার চালু';

test('phaseOf follows the 2h quiet + 6h recycle clock exactly', () => {
  assert.equal(phaseOf(0), 'quiet');
  assert.equal(phaseOf(2 * HOUR - 1), 'quiet');
  assert.equal(phaseOf(2 * HOUR), 'recycle', 'the quiet window ends at 2h, not after');
  assert.equal(phaseOf(8 * HOUR - 1), 'recycle');
  assert.equal(phaseOf(8 * HOUR), 'frozen', 'the window closes at 8h');
  // A clock that reads ahead of us is not watchable, and must never be treated
  // as "brand new" (which would unlock an immediate rewrite).
  assert.equal(phaseOf(-HOUR), 'frozen');
  assert.equal(phaseOf(NaN), 'frozen');
});

test('freshReports counts only outlets the article does not credit yet', () => {
  const members = [
    { source_id: 'prothomalo', url: 'https://www.prothomalo.com/a', added_at: '2026-09-30T14:00:00.000Z' },
    { source_id: 'prothomalo', url: 'https://www.prothomalo.com/b', added_at: '2026-09-30T15:00:00.000Z' },
    { source_id: 'kalerkantho', url: 'https://www.kalerkantho.com/c', added_at: '2026-09-30T15:30:00.000Z' },
    { source_id: 'blogspot99', url: 'https://blogspot99.wordpress.com/d', added_at: '2026-09-30T15:40:00.000Z' },
    { source_id: 'jugantor', url: 'https://www.jugantor.com/e', added_at: '2026-09-30T13:00:00.000Z' },
  ];
  const trusted = new Set(['prothomalo', 'kalerkantho', 'jugantor']);
  const fresh = freshReports(members, {
    knownUrls: ['https://www.prothomalo.com/a'],
    trusted,
    publishedAtMs: Date.parse('2026-09-30T14:00:00.000Z'),
  });
  assert.deepEqual(fresh.map((f) => f.source_id), ['prothomalo', 'kalerkantho']);
});

test('decideAction never writes during the quiet window, whatever arrives', () => {
  const verdict = { badge: 'confirmed', status: 'passed' };
  const fresh = [{ source_id: 'kalerkantho', url: 'https://www.kalerkantho.com/c' }];
  assert.deepEqual(decideAction({ phase: 'quiet', fresh, verdict }), { action: 'hold', reason: 'QUIET_WINDOW' });
});

test('decideAction recycles a quiet story instead of editing it', () => {
  assert.deepEqual(decideAction({ phase: 'recycle', fresh: [], verdict: { badge: 'single', status: 'passed' } }),
    { action: 'hold', reason: 'RECYCLE_WAITING' });
});

test('decideAction holds a conflicting story for a human, even when the verdict passes', () => {
  const d = decideAction({
    phase: 'recycle',
    fresh: [{ source_id: 'kalerkantho', url: 'https://www.kalerkantho.com/c' }],
    verdict: { badge: 'confirmed', status: 'passed' },
    conflicts: 1,
  });
  assert.equal(d.action, 'hold');
  assert.equal(d.reason, 'CONFLICT_HOLD');
});

test('decideAction annotates a new source but only upgrades on the cluster verdict', () => {
  const fresh = [{ source_id: 'kalerkantho', url: 'https://www.kalerkantho.com/c' }];
  assert.equal(decideAction({ phase: 'recycle', fresh, verdict: { badge: 'single', status: 'passed' } }).action, 'annotate');
  assert.equal(decideAction({ phase: 'recycle', fresh, verdict: { badge: 'confirmed', status: 'human_check' } }).action, 'annotate');
  assert.equal(decideAction({ phase: 'recycle', fresh, verdict: { badge: 'confirmed', status: 'passed' } }).action, 'upgrade');
  assert.equal(decideAction({ phase: 'recycle', fresh, verdict: { badge: 'verified', status: 'passed' } }).action, 'upgrade');
});

function article({ publishedAt = AT, developing = true, badge = 'partial', extra = '', sourceUrl = 'https://www.prothomalo.com/bangladesh/one', slug = 'national-7', clusterId = 7 } = {}) {
  return `---
title: "${TITLE}"
seoTitle: "${TITLE}"
excerpt: "ঢাকায় নতুন ফ্লাইওভার চালু হয়েছে।"
seoDescription: "ঢাকায় নতুন ফ্লাইওভার চালু হয়েছে।"
date: 2026-09-30T12:00:00.000Z
publishedAt: ${publishedAt}
developing: ${developing}
category: "national"
tags: ["dhaka"]
author: "desk"
lang: "bn"
draft: false
keyPoints: []
faq: []
sources:
  - name: "প্রথম আলো"
    url: "${sourceUrl}"
verification:
  badge: "${badge}"
  tier: "A"
  score: 2
  # a comment that must survive byte for byte
  uncorroborated: true
  status: "passed"
  evaluatedAt: "${publishedAt}"
  clusterId: ${clusterId}
  claimIds:
    - 11
  evidenceHash: "abcdef0123456789"
  evidence:
    - type: "paper"
      label: "reputable paper corroboration (prothomalo)"
publication:
  slug: "${slug}"
  gate: "passed"
  gateVersion: "1.0.0"
  checkedAt: "${publishedAt}"
  clusterId: ${clusterId}
  claimIds:
    - 11
  evidenceHash: "abcdef0123456789"
${extra}---

ঢাকায় নতুন ফ্লাইওভার আজ সকালে চালু হয়েছে।

প্রথম পর্যায়ে ছয়টি স্টেশনে ট্রেন চলবে বলে জানিয়েছে ঢাকা মেট্রোরেল।
`;
}

const parse = (md) => parseYaml(splitFrontmatter(md).fm);

test('applyRefresh annotates without touching the publish moment or the badge', () => {
  const notes = [noteFor({ headline: 'ফ্লাইওভারে চলতে শুরু করল যাত্রী', outlet: 'কালের কথা', url: 'https://www.kalerkantho.com/notice/9', at: AT })];
  const next = applyRefresh(article(), { at: AT, notes, slug: 'national-7' });
  const fm = parse(next);
  assert.equal(fm.publishedAt, AT, 'publishedAt is the watch clock zero and never moves');
  assert.equal(fm.updated, AT);
  assert.equal(fm.developing, true, 'still on the lane: one source is not two');
  assert.equal(fm.verification.badge, 'partial');
  assert.equal(fm.verification.uncorroborated, true);
  assert.equal(fm.verification.upgrade, undefined, 'no upgrade record without a verdict');
  assert.equal(fm.sources.length, 2);
  assert.equal(fm.sources[1].url, 'https://www.kalerkantho.com/notice/9');
  assert.equal(fm.updates.length, 1);
  assert.match(fm.updates[0].note, /কালের কথা/);
  assert.equal(fm.publication.evidenceHash, 'abcdef0123456789', 'publication record untouched');
  assert.match(next, /# a comment that must survive byte for byte/);
  assert.match(next, /\*\*হালনাগাদ:\*\*/, 'the reader sees the new source in the body');
});

test('applyRefresh upgrades only the fields the verdict earned', () => {
  const notes = [noteFor({ headline: 'ফ্লাইওভারে চলতে শুরু করল যাত্রী', outlet: 'কালের কথা', url: 'https://www.kalerkantho.com/notice/9', at: AT })];
  const next = applyRefresh(article(), { at: AT, notes, upgrade: { badge: 'confirmed', from: 'partial' }, slug: 'national-7' });
  const fm = parse(next);
  assert.equal(fm.developing, false);
  assert.equal(fm.verification.badge, 'confirmed');
  assert.equal(fm.verification.uncorroborated, false);
  assert.deepEqual(fm.verification.upgrade, {
    at: AT, from: 'partial', to: 'confirmed', added: 'কালের কথা',
  });
  assert.equal(fm.verification.evidence.length, 2, 'the corroborating source is recorded as evidence');
  assert.equal(fm.verification.evidenceHash, 'abcdef0123456789', 'the original gate digest is not rewritten');
  assert.equal(fm.verification.clusterId, 7);
  assert.equal(fm.title, TITLE);
  assert.match(next, /\*\*যাচাই:\*\*/, 'the badge change is stated in the body too');
});

test('applyRefresh is idempotent for a note it has already applied', () => {
  const notes = [noteFor({ headline: 'ফ্লাইওভারে চলতে শুরু করল যাত্রী', outlet: 'কালের কথা', url: 'https://www.kalerkantho.com/notice/9', at: AT })];
  const once = applyRefresh(article(), { at: AT, notes, slug: 'national-7' });
  const known = parse(once).sources.map((s) => s.url);
  const again = freshReports([{ source_id: 'kalerkantho', url: 'https://www.kalerkantho.com/notice/9', added_at: AT }],
    { knownUrls: known, trusted: new Set(['kalerkantho']), publishedAtMs: Date.parse(AT) });
  assert.deepEqual(again, [], 'an outlet already credited is not new, so the next cycle is quiet');
});

test('applyRefresh refuses to produce an article the site would reject', () => {
  const broken = article().replace('gate: "passed"', 'gate: "failed"');
  assert.throws(() => applyRefresh(broken, {
    at: AT, notes: [noteFor({ headline: 'x', outlet: 'y', url: 'https://kalerkantho.com/z', at: AT })], slug: 'national-7',
  }), /preflight rejected/);
});

// --- driver, against a real (in-memory) db and a real article on disk -------

function seed(db, { clusterId, publishedAt, secondSeenAt, badge = 'single', verdictBadge = 'confirmed', verdictStatus = 'passed' }) {
  db.prepare("INSERT INTO clusters(id,status,first_seen,last_update,member_count,mature_runs,headline) VALUES(?,'open',?,?,1,0,?)")
    .run(clusterId, publishedAt, publishedAt, TITLE);
  const add = (sourceId, url, seenAt) => {
    const item = db.prepare('INSERT INTO raw_items(source_id,url,url_hash,title,body,published_at,seen_at) VALUES(?,?,?,?,?,?,?)')
      .run(sourceId, url, url, TITLE, 'শরীর।', publishedAt, seenAt);
    db.prepare('INSERT INTO cluster_members(cluster_id,item_id,source_id,score,added_at) VALUES(?,?,?,1,?)')
      .run(clusterId, Number(item.lastInsertRowid), sourceId, seenAt);
  };
  add('prothomalo', `https://www.prothomalo.com/bangladesh/one-${clusterId}`, publishedAt);
  if (secondSeenAt) add('kalerkantho', `https://www.kalerkantho.com/notice/${clusterId}`, secondSeenAt);
  db.prepare('INSERT INTO verdicts(cluster_id,tier,score,badge,status,signals_json,evaluated_at) VALUES(?,\'A\',4,?,?,\'[]\',?)')
    .run(clusterId, verdictBadge, verdictStatus, AT);
  return badge;
}

function scenario(run) {
  const dir = mkdtempSync(join(tmpdir(), 'devlane-'));
  mkdirSync(join(dir, 'news'), { recursive: true });
  const siteDir = join(dir, 'news');
  const db = openDb(':memory:');
  return { dir, siteDir, db, cleanup: () => db.close() };
}

test('refreshDeveloping holds a 1h-old story and upgrades a 3h-old one', () => {
  const { siteDir, db, cleanup } = scenario();
  const quiet = '2026-09-30T15:00:00.000Z';   // 1h05m old at AT
  const ripe = '2026-09-30T13:00:00.000Z';   // 3h05m old at AT
  const frozen = '2026-09-30T04:00:00.000Z'; // 12h old: window closed
  seed(db, { clusterId: 71, publishedAt: quiet, secondSeenAt: '2026-09-30T15:30:00.000Z' });
  seed(db, { clusterId: 72, publishedAt: ripe, secondSeenAt: '2026-09-30T15:30:00.000Z' });
  seed(db, { clusterId: 73, publishedAt: frozen, secondSeenAt: '2026-09-30T15:30:00.000Z' });
  writeFileSync(join(siteDir, 'national-71.md'), article({ publishedAt: quiet, slug: 'national-71', clusterId: 71, sourceUrl: 'https://www.prothomalo.com/bangladesh/one-71' }));
  writeFileSync(join(siteDir, 'national-72.md'), article({ publishedAt: ripe, slug: 'national-72', clusterId: 72, sourceUrl: 'https://www.prothomalo.com/bangladesh/one-72' }));
  writeFileSync(join(siteDir, 'national-73.md'), article({ publishedAt: frozen, slug: 'national-73', clusterId: 73, sourceUrl: 'https://www.prothomalo.com/bangladesh/one-73' }));

  const report = refreshDeveloping({ siteDir, db, now: AT, write: false });
  assert.equal(report.scanned, 3);
  assert.deepEqual(report.held.map((h) => h.slug), ['national-71']);
  assert.equal(report.held[0].reason, 'QUIET_WINDOW');
  assert.deepEqual(report.upgraded.map((u) => u.slug), ['national-72']);
  assert.deepEqual(report.skipped.map((s) => s.slug), ['national-73']);
  assert.equal(report.skipped[0].reason, 'WINDOW_CLOSED');
  // A dry run writes nothing.
  assert.equal(parse(readFileSync(join(siteDir, 'national-72.md'), 'utf8')).developing, true);
  cleanup();
});

test('refreshDeveloping writes the upgrade when asked, and only once', () => {
  const { siteDir, db, cleanup } = scenario();
  const ripe = '2026-09-30T13:00:00.000Z';
  seed(db, { clusterId: 81, publishedAt: ripe, secondSeenAt: '2026-09-30T15:30:00.000Z' });
  const file = join(siteDir, 'national-81.md');
  writeFileSync(file, article({ publishedAt: ripe, slug: 'national-81', clusterId: 81, sourceUrl: 'https://www.prothomalo.com/bangladesh/one-81' }));

  const first = refreshDeveloping({ siteDir, db, now: AT, write: true });
  assert.equal(first.upgraded.length, 1);
  const after = parse(readFileSync(file, 'utf8'));
  assert.equal(after.developing, false);
  assert.equal(after.verification.badge, 'confirmed');
  assert.equal(after.publishedAt, ripe, 'still the original publish moment');

  const second = refreshDeveloping({ siteDir, db, now: AT, write: true });
  assert.equal(second.upgraded.length, 0, 'the second source is already credited');
  assert.equal(second.annotated.length, 0);
  cleanup();
});

test('refreshDeveloping never upgrades a story with an unresolved conflict', () => {
  const { siteDir, db, cleanup } = scenario();
  const ripe = '2026-09-30T13:00:00.000Z';
  seed(db, { clusterId: 91, publishedAt: ripe, secondSeenAt: '2026-09-30T15:30:00.000Z' });
  db.prepare('INSERT INTO claims(id,cluster_id,claim_text,status,confidence,created_at,updated_at) VALUES(5,91,?,\'UNCONFIRMED\',0.5,?,?)')
    .run(TITLE, ripe, ripe);
  db.prepare("INSERT INTO claim_evidence(claim_id,source_id,url,excerpt,relation,published_at,created_at) VALUES(5,'kalerkantho','https://www.kalerkantho.com/notice/91','না','contradicts',?,?)")
    .run(ripe, ripe);
  const file = join(siteDir, 'national-91.md');
  writeFileSync(file, article({ publishedAt: ripe, slug: 'national-91', clusterId: 91, sourceUrl: 'https://www.prothomalo.com/bangladesh/one-91' }));

  const report = refreshDeveloping({ siteDir, db, now: AT, write: true });
  assert.equal(report.upgraded.length, 0);
  assert.equal(report.annotated.length, 0);
  assert.equal(report.held[0].reason, 'CONFLICT_HOLD');
  assert.equal(parse(readFileSync(file, 'utf8')).developing, true, 'untouched, waiting for a human');
  cleanup();
});

test('refreshDeveloping keeps a story developing while its second source is not enough', () => {
  const { siteDir, db, cleanup } = scenario();
  const ripe = '2026-09-30T13:00:00.000Z';
  seed(db, { clusterId: 95, publishedAt: ripe, secondSeenAt: '2026-09-30T15:30:00.000Z', verdictBadge: 'single', verdictStatus: 'passed' });
  const file = join(siteDir, 'national-95.md');
  writeFileSync(file, article({ publishedAt: ripe, slug: 'national-95', clusterId: 95, sourceUrl: 'https://www.prothomalo.com/bangladesh/one-95' }));

  const report = refreshDeveloping({ siteDir, db, now: AT, write: true });
  assert.equal(report.annotated.length, 1);
  assert.equal(report.upgraded.length, 0);
  const after = parse(readFileSync(file, 'utf8'));
  assert.equal(after.developing, true);
  assert.equal(after.verification.badge, 'partial');
  assert.equal(after.sources.length, 2, 'the new outlet is credited even without an upgrade');
  assert.equal(after.updates.length, 1);
  cleanup();
});
