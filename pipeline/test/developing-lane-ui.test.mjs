// test/developing-lane-ui.test.mjs — the reader-facing half of the developing
// lane (2026-09-30). The badge a story wears is the whole promise the lane
// makes, so it gets its own assertions: a solo story that is still being
// verified must say so, and an ordinary single-source story must not be swept
// into the same words by accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SITE = join(import.meta.dirname, '../../site');
const read = (rel) => readFileSync(join(SITE, rel), 'utf8');

// site/src/lib/news-data.js imports astro:content, which only exists inside an
// Astro build, so the two pure functions under test are lifted out by hand.
function loadBadgeLib() {
  const src = read('src/lib/news-data.js');
  const start = src.indexOf('export const BADGES = {');
  const getStart = src.indexOf('export const getBadge =');
  const end = src.indexOf('\n};', src.indexOf('return { key, ...meta };')) + 3;
  assert.ok(start > 0 && getStart > start && end > getStart, 'badge block locatable');
  const code = (src.slice(start, getStart) + src.slice(getStart, end)).replaceAll('export const', 'const');
  return import(`data:text/javascript,${encodeURIComponent(`${code}\nexport { BADGES, getBadge };`)}`);
}

test('a developing story is labelled "যাচাই চলছে" but keeps the partial key', async () => {
  const { getBadge } = await loadBadgeLib();
  const badge = getBadge({ verification: { badge: 'partial' }, developing: true });
  assert.equal(badge.label, 'যাচাই চলছে');
  assert.equal(badge.className, 'badge--developing');
  // The key drives sort weight (news-data.js) and every consumer; keeping it
  // `partial` means a developing story sits with the other fresh single-source
  // news on the homepage instead of being sorted away.
  assert.equal(badge.key, 'partial');
});

test('an ordinary single-source story keeps the old wording', async () => {
  const { getBadge } = await loadBadgeLib();
  const badge = getBadge({ verification: { badge: 'partial' } });
  assert.equal(badge.label, 'একক/আংশিক');
  assert.equal(badge.className, 'badge--partial');
});

test('developing never overrides a settled verdict', async () => {
  const { getBadge } = await loadBadgeLib();
  const badge = getBadge({ verification: { badge: 'verified' }, developing: true });
  assert.equal(badge.label, 'যাচাইকৃত');
  assert.equal(badge.key, 'verified');
});

test('the schema accepts publishedAt + developing on every article', () => {
  const cfg = read('src/content.config.js');
  assert.match(cfg, /publishedAt: z\.coerce\.date\(\)\.optional\(\)/);
  // A default (not .optional()) keeps every one of the existing articles
  // building while the flag is absent from their frontmatter.
  assert.match(cfg, /developing: z\.boolean\(\)\.default\(false\)/);
});

test('the badge component uses the label it is handed', () => {
  const comp = read('src/components/VerificationBadge.astro');
  // Regression guard: VerificationBadge used to re-resolve BADGES[badge.key],
  // which silently threw away the developing wording while keeping its colour
  // intent. It must trust a passed object and only fall back for a bare key.
  assert.match(comp, /badge\?\.label/);
  assert.match(comp, /BADGES\[badge\?\.key\] \?\? BADGES\[badge\] \?\? BADGES\.partial/);
});

test('the article page explains that verification is running', () => {
  const page = read('src/pages/article/[slug].astro');
  assert.match(page, /\{post\.developing && \(/);
  assert.match(page, /এই প্রতিবেদনটি এখনো যাচাই চলছে/);
  // The pre-existing tier A single-source notice must stay conditional.
  assert.match(page, /post\.verification\?\.uncorroborated/);
});

test('the developing chip has its own colour', () => {
  const css = read('src/styles.css');
  assert.match(css, /\.badge--developing \{/);
});

test(`a developing story is not buried under older confirmed news`, async () => {
  // 2026-10-01: with developing at rank 3 (below `confirmed`), all 24 developing
  // stories sorted to positions 395-452 of 452 and the homepage looked dead
  // while the stories were live. The lane exists to surface a first sighting,
  // so it must compete with confirmed and let recency decide.
  const src = read('src/lib/news-data.js');
  const start = src.indexOf('export const BADGES = {');
  const g = src.indexOf('export const getBadge =');
  const gEnd = src.indexOf('\n};', src.indexOf('return { key, ...meta };')) + 3;
  const rStart = src.indexOf('const editorialRank = (post) => {');
  const rEnd = src.indexOf('\n};', src.indexOf('return 4;')) + 3;
  const code = (src.slice(start, g) + src.slice(g, gEnd) + src.slice(rStart, rEnd))
    .replaceAll('export const', 'const');
  const { editorialRank } = await import(`data:text/javascript,${encodeURIComponent(`${code}\nexport { editorialRank };`)}`);
  const post = (over) => ({ verification: { badge: 'confirmed' }, ...over });
  const devRank = editorialRank(post({ developing: true, verification: { badge: 'partial' } }));
  const confirmedRank = editorialRank(post({}));
  const oldConfirmed = editorialRank(post({ verification: { badge: 'confirmed' } }));
  assert.equal(devRank, confirmedRank, `developing competes with confirmed, recency decides`);
  assert.ok(devRank < editorialRank(post({ verification: { badge: 'partial' } })), `still ahead of ordinary single-source`);
  assert.ok(devRank < editorialRank(post({ verification: { badge: 'suspect' } })), `suspect stays last`);
  assert.equal(oldConfirmed, devRank);
  assert.match(src, /if \(post\.developing\) return 2;/);
});
