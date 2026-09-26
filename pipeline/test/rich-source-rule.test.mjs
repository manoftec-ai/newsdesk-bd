// test/rich-source-rule.test.mjs — the user's rule, 2026-09-26.
//
//   "if you[r] writer found/pipeline found two sources have each more than
//    300/250+ words our article should catch that and publish to our site with
//    not less than 250/300 words"
//
// This is the companion to the evidence gate. The gate stops a thin story from
// STARTING; this stops a well-sourced one from being published SHORT. A story
// with two 250-word sources holds ~500 words of real material, so a 250-word
// article is a 2x expansion — honest, and well short of padding.
//
// Both thresholds are configurable because the user said "300/250+" and
// "250/300" without fixing a pair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  richSourceRule,
  memberWordCounts,
  richSourceThresholds,
  DEFAULT_RICH_SOURCE_WORDS,
  DEFAULT_RICH_ARTICLE_WORDS,
  DEFAULT_RICH_SOURCE_COUNT,
} from '../lib/editorial.mjs';

// A lead of EXACTLY `words` Bangla words. Built from a one-word token so the
// count is exact rather than estimated from characters — an earlier version
// divided by 6 and undercounted by a fifth, which quietly failed six tests.
const leadOf = (words) => 'বার্তা '.repeat(words);
const brief = (...leads) => ({ members: leads.map((lead) => ({ title: 'x', lead })) });

// --- the rule itself ---------------------------------------------------------
test('two sources at 250+ words each triggers a 250-word floor', () => {
  const r = richSourceRule(brief(leadOf(300), leadOf(300)));
  assert.equal(r.rich, true);
  assert.equal(r.richSources, 2);
  assert.equal(r.requiredWords, DEFAULT_RICH_ARTICLE_WORDS);
  assert.equal(r.requiredWords, 250);
});

test('one long source and one short does NOT trigger', () => {
  const r = richSourceRule(brief(leadOf(300), 'সংক্ষিপ্ত খবর।'));
  assert.equal(r.rich, false);
  assert.equal(r.requiredWords, 0, 'no requirement when the rule does not fire');
});

test('member count is not evidence: 9 short sources never trigger', () => {
  const r = richSourceRule(brief(...Array(9).fill('সংকষিপ্ত।')));
  assert.equal(r.rich, false);
  assert.equal(r.richSources, 0);
});

test('three long sources still trigger, and report the count honestly', () => {
  const r = richSourceRule(brief(leadOf(280), leadOf(280), leadOf(280), 'সংক্ষিপ্ত।'));
  assert.equal(r.rich, true);
  assert.equal(r.richSources, 3);
});

test('the boundary is inclusive: exactly 250 words qualifies', () => {
  // Build a lead and confirm bodyWordCount agrees before asserting on the rule,
  // so a wording change cannot silently move the boundary.
  const r = richSourceRule(brief(leadOf(250), leadOf(250)));
  assert.ok(r.memberWords[0] >= 250, `fixture is ${r.memberWords[0]} words, needs >=250`);
  assert.equal(r.rich, true);
});

test('just under the threshold does not trigger', () => {
  const r = richSourceRule(brief(leadOf(230), leadOf(230)));
  assert.ok(r.memberWords[0] < 250);
  assert.equal(r.rich, false);
});

// --- the 300/250 pair the user also mentioned --------------------------------
test('the thresholds are configurable, so 300/300 is one env change', () => {
  const t = richSourceThresholds({
    RICH_SOURCE_WORDS: '300',
    RICH_ARTICLE_WORDS: '300',
  });
  assert.equal(t.sourceWords, 300);
  assert.equal(t.articleWords, 300);

  const leads = brief(leadOf(300), leadOf(300));
  assert.equal(richSourceRule(leads, t).rich, true, '300/300 fires on 300-word sources');
  assert.equal(richSourceRule(leads, t).requiredWords, 300);

  // 260-word sources: pass at 250, fail at 300.
  const mid = brief(leadOf(260), leadOf(260));
  assert.equal(richSourceRule(mid, richSourceThresholds({})).rich, true, 'clears 250');
  assert.equal(richSourceRule(mid, t).rich, false, 'does not clear 300');
});

test('the source-count threshold is configurable', () => {
  const three = brief(leadOf(300), leadOf(300), leadOf(300));
  assert.equal(richSourceRule(three, richSourceThresholds({ RICH_SOURCE_COUNT: '2' })).rich, true);
  assert.equal(richSourceRule(three, richSourceThresholds({ RICH_SOURCE_COUNT: '4' })).rich, false);
});

test('garbage env values fall back to the defaults', () => {
  for (const env of [{}, { RICH_SOURCE_WORDS: '' }, { RICH_SOURCE_WORDS: 'abc' }, { RICH_ARTICLE_WORDS: '-5' }]) {
    const t = richSourceThresholds(env);
    assert.equal(t.sourceWords, DEFAULT_RICH_SOURCE_WORDS, JSON.stringify(env));
    assert.equal(t.articleWords, DEFAULT_RICH_ARTICLE_WORDS, JSON.stringify(env));
    assert.equal(t.sourceCount, DEFAULT_RICH_SOURCE_COUNT, JSON.stringify(env));
  }
});

test('never crashes on malformed briefs', () => {
  for (const b of [null, undefined, {}, { members: null }, { members: [null, {}] }, { members: 'no' }]) {
    const r = richSourceRule(b);
    assert.equal(typeof r.rich, 'boolean', JSON.stringify(b));
    assert.equal(r.requiredWords, 0);
  }
});

test('is deterministic', () => {
  const b = brief(leadOf(300), leadOf(300));
  assert.deepEqual(richSourceRule(b), richSourceRule(b));
});

test('memberWordCounts matches the body word counter', () => {
  const b = brief(leadOf(120), 'সংক্ষিপ্ত।');
  const counts = memberWordCounts(b);
  assert.equal(counts.length, 2);
  assert.ok(counts[0] >= 120);
  assert.ok(counts[1] < 250);
});

// --- the cap that used to make the rule impossible -----------------------------
test('the per-source excerpt cap must allow a full article, or the rule can never fire', () => {
  // excerptOf() was 1200 chars, about 185 Bangla words, so NO member could reach
  // 250 and the rule was unreachable — 0 of 423 briefs qualified. The cap is now
  // 2000 chars, about 300 words. If someone lowers it again, this fails.
  const src = readFileSync(join(import.meta.dirname, '../lib/extract.mjs'), 'utf8');
  const m = src.match(/function excerptOf\(body, n = (\d+)\)/);
  assert.ok(m, 'excerptOf must still declare a default cap');
  const cap = Number(m[1]);
  // 250 words at the measured 6.5 chars per Bangla word, with headroom.
  assert.ok(cap >= 1700, `cap is ${cap} chars, too small for a 250-word source (needs ~1625)`);
});

// --- against the real corpus -------------------------------------------------
test('AGAINST THE REAL BRIEFS: the rule is reachable and not always on', () => {
  const dir = join(import.meta.dirname, '../state/briefs');
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return;
  }
  if (files.length < 50) return;

  let fired = 0;
  let n = 0;
  for (const f of files) {
    const b = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if (!(b.members || []).length) continue;
    n++;
    if (richSourceRule(b).rich) fired++;
  }

  // 0 would mean the cap regressed and the rule is dead code again. Always-on
  // would mean requiredWords is meaningless.
  assert.ok(fired > 0, 'the rule never fires on the real corpus — check the excerpt cap');
  assert.ok(fired < n * 0.5, `rule fires on ${fired}/${n} — it should be the exception, not the default`);
  console.log(`      (rich-source rule fires on ${fired} of ${n} briefs)`);
});

// --- how the finalizer composes the two floors --------------------------------
// A full end-to-end publish needs a brief backed by a real cluster in store.db,
// so the publication gate rejects synthetic fixtures with BRIEF_INVALID before
// the body is ever examined. These tests cover the composition arithmetic
// instead, which is the part this change actually altered.
test('the effective floor is the higher of the two rules', () => {
  // D105 sets the general floor at 150. The rich-source rule raises it to 250
  // when 2+ sources each carry 250+ words. The finalizer must use the higher.
  const GENERAL_FLOOR = 150;
  const r = richSourceRule(brief(leadOf(300), leadOf(300)));
  assert.equal(Math.max(GENERAL_FLOOR, r.requiredWords), 250);

  // And it must NOT raise the floor for a thin story, or every article would
  // need 250 words regardless of evidence.
  const thin = richSourceRule(brief('সংক্ষিপ্ত।', 'সংক্ষিপ্ত।'));
  assert.equal(Math.max(GENERAL_FLOOR, thin.requiredWords), GENERAL_FLOOR);
});

test('a 200-word body is rejected on a rich brief and accepted on a thin one', async () => {
  const { bodySubstanceCheck, minPublishWords } = await import('../lib/editorial.mjs');
  const general = minPublishWords({});

  const rich = richSourceRule(brief(leadOf(300), leadOf(300)));
  const headline = 'মেট্রোরেল নতুন লাইন চালু';
  // A 200-word body that is genuinely novel, so NO_READER_VALUE cannot be what
  // rejects it — only length can.
  const novel200 = `মেট্রোরেল ${'নতুন স্টেশন যুক্ত হয়েছে। '.repeat(45)}`;

  assert.equal(
    bodySubstanceCheck(headline, novel200, { minWords: Math.max(general, rich.requiredWords) }).pass,
    false,
    '200 words must fail the 250 floor on a well-sourced brief',
  );
  assert.equal(
    bodySubstanceCheck(headline, novel200, { minWords: general }).pass,
    true,
    'the same 200 words pass the general floor, so the rule is what rejected it',
  );
});
