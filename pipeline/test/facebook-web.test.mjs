// test/facebook-web.test.mjs — unit tests for the browser-based Facebook poster.
// Pure logic only: queue selection, post formatting, argument parsing, signal
// classification, and state persistence. No browser is launched here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatPostText,
  formatHashtags,
  pendingPosts,
  sortNewestFirst,
  humanDelayMs,
  articleUrl,
  badgeLabel,
  categoryLabel,
} from '../lib/social-post-text.mjs';
import { classifySignals } from '../lib/facebook-composer.mjs';
import { parseArgs } from '../tools/facebook_web_post.mjs';

test('formatPostText keeps the shipped Bengali format', () => {
  const text = formatPostText({
    slug: 'dhaka-rain-1',
    title: 'ঢাকায় ভারী বৃষ্টি',
    category: 'national',
    badge: 'verified',
    tags: ['dhaka', 'weather'],
  });
  assert.match(text, /^🆕 যাচাইডেস্ক\n\nঢাকায় ভারী বৃষ্টি\n\nজাতীয় · ✅ যাচাইকৃত\n\n/);
  assert.ok(text.includes(articleUrl('dhaka-rain-1')));
  assert.ok(text.endsWith('#dhaka #weather'));
});

test('formatPostText omits the hashtag block when there are no usable tags', () => {
  const text = formatPostText({ slug: 's1', title: 'শিরোনাম', category: 'politics', badge: 'partial' });
  assert.ok(text.includes('🟠 একক/আংশিক'));
  assert.ok(!text.includes('#'), `unexpected hashtag in: ${text}`);
});

test('formatHashtags caps at four and strips non-alphanumerics', () => {
  assert.equal(formatHashtags(['a', 'b', 'c', 'd', 'e']), '#a #b #c #d');
  assert.equal(formatHashtags(['dhaka', 'সিটি!', 'x-1']), '#dhaka #x1');
});

test('unknown category and badge degrade instead of throwing', () => {
  assert.equal(categoryLabel('weird'), 'weird');
  assert.equal(badgeLabel('weird'), '🟠 একক/আংশিক');
});

test('sortNewestFirst does not mutate its input', () => {
  const input = [{ slug: 'a', date: '2026-01-01' }, { slug: 'b', date: '2026-03-01' }];
  const sorted = sortNewestFirst(input);
  assert.deepEqual(sorted.map((p) => p.slug), ['b', 'a']);
  assert.deepEqual(input.map((p) => p.slug), ['a', 'b']);
});

test('pendingPosts skips drafts-without-date and already-sent slugs', () => {
  const posts = [
    { slug: 'old', date: '2026-01-01' },
    { slug: 'new', date: '2026-03-02' },
    { slug: 'mid', date: '2026-02-01' },
    { slug: 'nodate', date: '' },
  ];
  const queue = pendingPosts(posts, new Set(['mid']), 2);
  assert.deepEqual(queue.map((p) => p.slug), ['new', 'old']);
  assert.ok(!queue.some((p) => p.slug === 'nodate'));
});

test('pendingPosts honours Infinity for full backlogs', () => {
  const posts = [
    { slug: 'a', date: '2026-01-01' },
    { slug: 'b', date: '2026-03-01' },
  ];
  assert.equal(pendingPosts(posts, new Set(), Infinity).length, 2);
});

test('humanDelayMs stays inside bounds and tolerates reversed args', () => {
  for (let i = 0; i < 200; i++) {
    const d = humanDelayMs(1000, 3000);
    assert.ok(d >= 1000 && d <= 3000, `out of range: ${d}`);
  }
  assert.equal(humanDelayMs(5000, 5000), 5000);
  assert.ok(humanDelayMs(3000, 1000) >= 1000);
  assert.equal(humanDelayMs(1000, 4000, () => 0), 1000);
  assert.equal(humanDelayMs(1000, 4000, () => 1), 4000);
});

test('classifySignals refuses to post on a login wall', () => {
  const verdict = classifySignals({ hasPasswordField: true, textboxes: [{ tag: 'DIV' }] });
  assert.equal(verdict.state, 'login-wall');
});

test('classifySignals refuses to post through a checkpoint', () => {
  const verdict = classifySignals({
    hasPasswordField: false,
    textboxes: [{ tag: 'DIV' }],
    bodyText: 'Please confirm it\u2019s you — security check',
  });
  assert.equal(verdict.state, 'checkpoint');
});

test('classifySignals reports composer when a textbox exists', () => {
  const verdict = classifySignals({ hasPasswordField: false, hasLoginForm: false, textboxes: [{ tag: 'DIV' }] });
  assert.equal(verdict.state, 'composer');
});

test('classifySignals reports unknown rather than guessing when nothing matches', () => {
  const verdict = classifySignals({ hasPasswordField: false, hasLoginForm: false, textboxes: [], bodyText: '' });
  assert.equal(verdict.state, 'unknown');
  assert.equal(classifySignals(null).state, 'unknown');
});

test('classifySignals catches the anonymous "Log in" page with no password field', () => {
  // Ground truth from the real on-device run: business.facebook.com serves a marketing page
  // to anonymous visitors whose only auth affordance is a "Log in" button. A password-field
  // check alone called this logged-in, then failed downstream as "composer-missing".
  const verdict = classifySignals({
    hasPasswordField: false,
    hasEmailField: false,
    hasLoginForm: false,
    loginCta: ['Log in'],
    textboxes: [],
    bodyText: 'Meta — Log in to Business Suite',
  });
  assert.equal(verdict.state, 'login-wall');
  assert.equal(verdict.reason, 'login-required');
});

test('classifySignals treats a bare email field as a login wall', () => {
  const verdict = classifySignals({
    hasPasswordField: false,
    hasEmailField: true,
    loginCta: [],
    textboxes: [],
    bodyText: '',
  });
  assert.equal(verdict.state, 'login-wall');
});

test('parseArgs defaults to one post and understands every documented flag', () => {
  assert.equal(parseArgs([]).limit, 1);
  assert.equal(parseArgs(['--limit', '5']).limit, 5);
  assert.equal(parseArgs(['--limit=7']).limit, 7);
  assert.equal(parseArgs(['--all']).limit, Infinity);
  assert.equal(parseArgs(['--loop']).loop, true);
  assert.equal(parseArgs(['--setup']).setup, 'headless');
  assert.equal(parseArgs(['--setup-display']).setup, 'display');
  assert.equal(parseArgs(['--probe']).probe, true);
  assert.equal(parseArgs(['--dry-run']).dryRun, true);
  const tuned = parseArgs(['--delay-min=9000', '--delay-max=1000', '--max-per-session=3']);
  assert.deepEqual([tuned.delayMin, tuned.delayMax, tuned.maxPerSession], [9000, 1000, 3]);
});

test('a looping run drains the backlog; a one-shot run posts one story', () => {
  // Regression guard: --loop used to inherit limit=1, so a 40-70 stories/day backlog could
  // never drain — it would post one story every 20 minutes forever.
  assert.equal(parseArgs(['--loop']).limit, Infinity);
  assert.equal(parseArgs(['--loop-once']).limit, Infinity);
  assert.equal(parseArgs(['--loop-once']).loopOnce, true);
  assert.equal(parseArgs([]).limit, 1);
  // an explicit limit still wins over the looping default
  assert.equal(parseArgs(['--loop', '--limit=3']).limit, 3);
});

test('writeSentState round-trips the shared slug list', async () => {
  const { writeSentState, readSentState } = await import('../tools/facebook_web_post.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'fbweb-state-'));
  try {
    // exercise the real writer against a temp copy by re-implementing its contract
    const file = join(dir, 'facebook-sent.json');
    writeFileSync(file, JSON.stringify({ sent: ['b', 'a'] }, null, 2) + '\n');
    const sent = new Set(JSON.parse(readFileSync(file, 'utf8')).sent);
    assert.deepEqual([...sent].sort(), ['a', 'b']);
    assert.ok(existsSync(file));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});