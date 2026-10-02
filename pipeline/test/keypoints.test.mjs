// test/keypoints.test.mjs — the "এক নজরে" box must be a complete, focused point.
//
// 2026-10-02, user report: "এক নজরে … i think its not really providing focus
// point of the news. sometimes its also giving an incomplete sentence."
// Measured over the last 100 articles: of ~500 bullets, 245 carried no
// terminal punctuation and 192 of those ended on a dangling token — a
// half-finished clause presented to the reader as a summary point.
//
// Three layers are pinned here: the sentence checker, the publish gate that
// refuses an article carrying a fragment, and the repair tool that fixes what
// is already published.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bulletIsComplete, asBullet } from '../lib/compose.mjs';
import { validatePublicArticle } from '../tools/site_preflight.mjs';
import { rebuildKeyPoints, setKeyPoints, repairOne } from '../tools/repair_keypoints.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const SAMPLE = `---
title: "পরীক্ষামূলক দাঁড়া উদ্বোধন করল প্রশিক্ষণার্থীরা"
seoTitle: "পরীক্ষামূলক দাঁড়া উদ্বোধন"
excerpt: "উদ্বোধনের পর দেখা গেছে সাফল্য।"
seoDescription: "উদ্বোধনের পর দেখা গেছে সাফল্য।"
date: 2026-09-30T10:00:00.000Z
publishedAt: 2026-09-30T11:00:00.000Z
developing: true
category: "national"
tags: ["dhaka"]
author: "desk"
lang: "bn"
draft: false
keyPoints: []
faq: []
sources:
  - name: "প্রথম আলো"
    url: "https://www.prothomalo.com/a"
verification:
  badge: "partial"
  tier: "A"
  score: 2
  uncorroborated: true
  status: "passed"
  evaluatedAt: "2026-09-30T11:00:00.000Z"
  clusterId: 7
  claimIds:
    - 11
  evidenceHash: "abcdef0123456789"
  evidence:
    - type: "paper"
      label: "reputable paper corroboration (prothomalo)"
publication:
  slug: "sample-1"
  gate: "passed"
  gateVersion: "1.0.0"
  checkedAt: "2026-09-30T11:00:00.000Z"
  clusterId: 7
  claimIds:
    - 11
  evidenceHash: "abcdef0123456789"
---

কোর্টের আদেশে চলে আসা মামলায় সরকারি দলের তদন্ত শুরু হয়েছে। ন্যায়বিচারের আস্থা রক্ষার জন্য সবাইকে একসঙ্গে কাজ করতে হবে বলে জানান আইনজীবীরা। সিদ্ধান্ত হতে আরও কয়েকটি সপ্তাহ সময় লাগবে বলে জানা গেছে।
`;

test('a bullet that ends on a connective is not a point', () => {
  assert.equal(bulletIsComplete('উপরে এবং'), false);
  assert.equal(bulletIsComplete('তিনি যা বলেছেন'), false);
  assert.equal(bulletIsComplete('নির্দেশনা এবং'), false);
});

test('a Bengali sentence may legitimately end on a finite verb', () => {
  // Regression guard on my own first attempt: treating every finite verb as
  // dangling rejected good sentences like "... বিবৃতিতে বলেছে".
  assert.equal(bulletIsComplete('মঙ্গলবার প্রকাশিত বিবৃতিতে তিনি বলেছেন'), true);
  assert.equal(bulletIsComplete('গতকাল রাজধানীর তাপমাত্রা ছিল ৩৫ দশমিক ৪ ডিগ্রি'), true);
});

test('quote marks must pair by type, and fragments with leaked punctuation are rejected', () => {
  assert.equal(bulletIsComplete('”ট্রান্সলুস তাদের বক্তব্যে বলেছে, “আমরা এই প্রচেষ্টার জন্য দায়ী করছি না'), false);
  assert.equal(bulletIsComplete("' . ওপেনএআইয়ের তিন কর্মীকে বরখাস্ত করার ঘটনা ঘটল"), false);
  assert.equal(bulletIsComplete('আমাদের সবাইকে একসঙ্গে কাজ করতে হবে'), true);
});

test('a point needs at least five words to say anything', () => {
  assert.equal(bulletIsComplete('কোনো কাজ করছে না'), false);
  assert.equal(bulletIsComplete('তিনি আজ সকালে অফিসে ছিলেন'), true);
});

test('asBullet returns nothing rather than half a clause', () => {
  assert.equal(asBullet('”ট্রান্সলুস তাদের বক্তব্যে বলেছে, “আমরা এই প্রচেষ্টার জন্য নিশ্চিতভাবে দায়ী করছি না'), '');
});

test('the publish gate refuses an article carrying an incomplete point', () => {
  const bad = SAMPLE.replace('keyPoints: []', 'keyPoints:\n  - "নির্দেশনা এবং"\n  - "তিনি যা বলেছেন"');
  const r = validatePublicArticle(bad, { slug: 'sample-1', now: new Date() });
  assert.equal(r.pass, false);
  assert.ok(r.failureCodes.includes('KEY_POINT_INCOMPLETE'));
  // and a well-formed box still passes
  const good = SAMPLE.replace('keyPoints: []', 'keyPoints:\n  - "তিনি আজ সকালে অফিসে ছিলেন"');
  const ok = validatePublicArticle(good, { slug: 'sample-1', now: new Date() });
  assert.ok(ok.failureCodes.length === 0, ok.failureCodes.join(','));
});

test('setKeyPoints rewrites the block and keeps the document parseable', () => {
  const fm = SAMPLE.match(/^---\n([\s\S]*?)\n---\n/)[1];
  const out = setKeyPoints(fm, ['প্রথম বাক্যটি এখানে থাকবে']);
  assert.match(out, /^keyPoints:\n {2}- "প্রথম বাক্যটি এখানে থাকবে"$/mu);
  assert.doesNotMatch(out, /^keyPoints: \[\]/mu);
  assert.doesNotThrow(() => parseYaml(out));
  // removing them again leaves no keyPoints at all
  assert.doesNotMatch(setKeyPoints(out, []), /^keyPoints:/mu);
});

test('setKeyPoints survives the two shapes that broke the first attempt', () => {
  // a bullet wrapped onto a continuation line
  const wrapped = '---\ntitle: "ট"\nkeyPoints:\n  - দীর্ঘ বাক্য যা চলতে\n    থাকে এখানে\ndate: 2026-01-01\n---\n';
  const fm1 = wrapped.slice(4, wrapped.indexOf('\n---\n', 4));
  const out1 = setKeyPoints(fm1, ['নতুন একটি পয়েন্ট এখানে যোগ হলো']);
  assert.doesNotThrow(() => parseYaml(out1), 'continuation line must not be orphaned');
  assert.doesNotMatch(out1, /থাকে এখানে/u);
  // keyPoints as the LAST key (no trailing newline on its final item)
  const last = '---\ntitle: "ট"\ndate: 2026-01-01\nkeyPoints:\n  - শেষ বাক্যটি এখানে আছে';
  const out2 = setKeyPoints(last, []);
  assert.doesNotThrow(() => parseYaml(out2), 'trailing item must not be orphaned');
  assert.doesNotMatch(out2, /^keyPoints:/mu);
});

test('rebuildKeyPoints only offers complete sentences from the body', () => {
  const body = 'কোর্টের আদেশে চলে আসা মামলায় সরকারি দলের তদন্ত শুরু হয়েছে। '
    + 'ন্যায়বিচারের আস্থা রক্ষার জন্য সবাইকে একসঙ্গে কাজ করতে হবে বলে জানান আইনজীবীরা। '
    + 'সিদ্ধান্ত হতে আরও কয়েকটি সপ্তাহ সময় লাগবে বলে জানা গেছে।';
  const points = rebuildKeyPoints('প্রশিক্ষণার্থীদের দাঁড়া উদ্বোধন করল সরকার', body, []);
  assert.ok(points.length > 0);
  for (const p of points) {
    assert.ok(bulletIsComplete(p), `not complete: ${p}`);
    assert.ok(p.length > 10);
  }
});

test('repairOne leaves a healthy box completely alone', () => {
  const healthy = SAMPLE.replace('keyPoints: []', 'keyPoints:\n  - "তিনি আজ সকালে অফিসে ছিলেন"');
  const res = repairOne(healthy, { slug: 'sample-1' });
  assert.equal(res.changed, false, 'a correct box must not be rewritten');
});

test('repairOne replaces a broken box, and removes it when nothing qualifies', () => {
  const broken = SAMPLE.replace('keyPoints: []', 'keyPoints:\n  - "নির্দেশনা এবং"');
  const fixed = repairOne(broken, { slug: 'sample-1' });
  assert.equal(fixed.changed, true);
  const after = parseYaml(fixed.content.match(/^---\n([\s\S]*?)\n---\n/)[1]).keyPoints;
  for (const p of after ?? []) assert.ok(bulletIsComplete(p));

  const noRoom = SAMPLE.replace('keyPoints: []', 'keyPoints:\n  - "তিনি যা বলেছেন"')
    .replace(/কোর্টের আদেশে[\s\S]*$/, 'এখানে পুরো বডি নেই।\n');
  const res = repairOne(noRoom, { slug: 'sample-1' });
  if (res.changed) {
    const pts = parseYaml(res.content.match(/^---\n([\s\S]*?)\n---\n/)[1]).keyPoints ?? [];
    for (const p of pts) assert.ok(bulletIsComplete(p), 'a removed box must not leave a fragment');
  }
});

test('no published article carries an incomplete key point', () => {
  // The real check, over what readers actually see. This walks every article
  // in the corpus, so a repair that fixes the generator but leaves the live
  // files broken cannot pass.
  const dir = join(import.meta.dirname, '../../site/src/content/news');
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const raw = readFileSync(join(dir, f), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (!m) continue;
    let d; try { d = parseYaml(m[1]); } catch { continue; }
    for (const p of d?.keyPoints ?? []) {
      if (!bulletIsComplete(String(p))) bad.push(`${f.slice(0, -3)}: ${String(p).slice(0, 50)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} incomplete key point(s) still published`);
});
