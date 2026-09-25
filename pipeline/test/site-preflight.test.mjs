// test/site-preflight.test.mjs — public Markdown preflight contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PUBLICATION_GATE_VERSION } from '../lib/publication-gate.mjs';
import { preflightNews, validatePublicArticle } from '../tools/site_preflight.mjs';

const NOW = '2026-09-25T12:00:00.000Z';
const HASH = '0123456789abcdef';

function article({ draft = false, slug = 'metro-test', source = 'https://www.dailystar.net/story/metro-1', publication = true } = {}) {
  const publicationBlock = publication ? `
publication:
  slug: "${slug}"
  gate: "passed"
  gateVersion: "${PUBLICATION_GATE_VERSION}"
  checkedAt: "${NOW}"
  clusterId: 1
  claimIds: [1]
  evidenceHash: "${HASH}"` : '';
  const verificationStatus = publication ? 'passed' : 'failed';
  return `---
title: "ঢাকায় মেট্রোরেলের নতুন লাইন চালু"
excerpt: "পরীক্ষামূলক সেবা শুরু হয়েছে।"
date: "${NOW}"
category: "national"
author: "desk"
lang: "bn"
draft: ${draft}
sources:
  - name: "Daily Star"
    url: "${source}"
verification:
  badge: "confirmed"
  tier: "A"
  score: 4
  status: "${verificationStatus}"
  evaluatedAt: "${NOW}"
  clusterId: 1
  claimIds: [1]
  evidenceHash: "${HASH}"
  evidence: []${publicationBlock}
---

ঢাকায় মেট্রোরেলের নতুন লাইন রবিবার সকালে চালু হয়েছে। প্রথম পর্যায়ে ১০টি স্টেশনে ট্রেন চলবে। যাত্রীরা নির্ধারিত সময়ে টিকিট কিনে ট্রেন ব্যবহার করতে পারবেন।`;
}

test('site preflight accepts a complete public article', () => {
  const result = validatePublicArticle(article(), { slug: 'metro-test', now: NOW });
  assert.equal(result.pass, true, result.failureCodes.join(','));
  assert.deepEqual(result.failureCodes, []);
});

test('site preflight rejects missing publication metadata and draft content', () => {
  const result = validatePublicArticle(article({ publication: false, draft: true }), { slug: 'metro-test', now: NOW });
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('NOT_PUBLIC'));
  assert.ok(result.failureCodes.includes('PUBLICATION_GATE_NOT_PASSED'));
  assert.ok(result.failureCodes.includes('VERIFICATION_STATUS_INVALID'));
});

test('site preflight rejects invalid direct sources and route slugs', () => {
  const wrapper = validatePublicArticle(article({ source: 'https://news.google.com/rss/articles/wrapped' }), { slug: 'metro-test', now: NOW });
  assert.equal(wrapper.pass, false);
  assert.ok(wrapper.failureCodes.includes('GOOGLE_NEWS_WRAPPER_UNRESOLVED'));

  const mismatch = validatePublicArticle(article({ slug: 'other' }), { slug: 'metro-test', now: NOW });
  assert.equal(mismatch.pass, false);
  assert.ok(mismatch.failureCodes.includes('SLUG_MISMATCH'));
});

test('site preflight reports malformed frontmatter', () => {
  const result = validatePublicArticle('---\ntitle: [broken\n---\nbody', { slug: 'metro-test', now: NOW });
  assert.equal(result.pass, false);
  assert.ok(result.failureCodes.includes('FRONTMATTER_INVALID'));
});

test('site preflight limits directory checks to requested slugs', () => {
  const root = mkdtempSync(join(tmpdir(), 'jachai-preflight-'));
  try {
    mkdirSync(join(root, 'nested'), { recursive: true });
    writeFileSync(join(root, 'valid.md'), article({ slug: 'valid' }));
    writeFileSync(join(root, 'invalid.md'), '---\nnot: [valid\n---\nbody');
    const selected = preflightNews({ newsDir: root, slugs: ['valid'], now: NOW });
    assert.equal(selected.pass, true);
    assert.equal(selected.results.length, 1);
    const all = preflightNews({ newsDir: root, now: NOW });
    assert.equal(all.pass, false);
    assert.equal(all.results.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
