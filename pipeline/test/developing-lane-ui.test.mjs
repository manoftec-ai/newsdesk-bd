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

test(`the homepage is a clock: newest first, badge never decides`, async () => {
  // 2026-10-01 (user rule): latest news is always on top. Rank promotion
  // (featured/breaking/confirmed-first) buried 24 live developing stories at
  // positions 395-452 of 452, and the site read as dead. Every story now
  // competes on recency alone; only `suspect` stays pinned at the bottom.
  const src = read('src/lib/news-data.js');
  const start = src.indexOf('export const BADGES = {');
  const g = src.indexOf('export const getBadge =');
  const gEnd = src.indexOf('\n};', src.indexOf('return { key, ...meta };')) + 3;
  const oStart = src.indexOf('export const editorialOrder =');
  const oEnd = src.indexOf('\n  });', src.indexOf('suspectB ||')) + 5;
  assert.ok(oStart > 0 && oEnd > oStart, 'editorialOrder locatable');
  const code = (src.slice(start, g) + src.slice(g, gEnd) + src.slice(oStart, oEnd))
    .replaceAll('export const', 'const');
  const fixtures = [
    { slug: 'old-confirmed', verification: { badge: 'confirmed' }, ts: Date.parse('2026-09-29T10:00:00Z') },
    { slug: 'new-developing', verification: { badge: 'partial' }, developing: true, ts: Date.parse('2026-10-01T08:00:00Z') },
    { slug: 'new-verified', verification: { badge: 'verified' }, ts: Date.parse('2026-10-01T07:00:00Z') },
    { slug: 'new-suspect', verification: { badge: 'suspect' }, ts: Date.parse('2026-10-01T09:00:00Z') },
  ];
  const stub = `const posts = async () => ${JSON.stringify(fixtures)};`;
  const { editorialOrder } = await import(`data:text/javascript,${encodeURIComponent(`${code}\n${stub}\nexport { editorialOrder };`)}`);
  const order = (await editorialOrder()).map((p) => p.slug);
  assert.deepEqual(order, ['new-developing', 'new-verified', 'old-confirmed', 'new-suspect'],
    'newest first regardless of badge; even a brand-new suspect stays last');
});

test('the hero slider stays minimal, fast and honest', () => {
  // 2026-10-01: the hero shows the 5 latest stories as a swipeable strip.
  // The theme rules demand minimal JS, no autoplay, crawlable content and no
  // layout shift — this test pins those properties so the slider cannot
  // silently grow into a library, a video wall, or a JS-only widget.
  const slider = read('src/components/HeroSlider.astro');
  const page = read('src/pages/index.astro');
  // comments talk about autoplay (saying there is none); the check is about code.
  const code = slider.replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.match(page, /<HeroSlider slides=\{heroSlides\} \/>/, 'the hero is the slider');
  assert.match(slider, /scroll-snap-type:\s*x mandatory/, 'swiping works with zero JS');
  assert.doesNotMatch(code, /setInterval\s*\(|setTimeout\s*\(|autoplay\s*[:=]/i, 'no autoplay, no timers');
  assert.doesNotMatch(slider, /from ["'](react|swiper|embla|keen-slider|flickity)/, 'no carousel dependency');
  assert.match(slider, /loading=\{i === 0 \? "eager" : "lazy"\}/, 'only slide 0 can be LCP');
  assert.match(slider, /width="1200"[\s\S]{0,40}height="630"/, 'image dimensions are fixed (no layout shift)');
  assert.match(slider, /prefers-reduced-motion/, 'reduced motion gets instant jumps');
  assert.match(slider, /aria-roledescription="carousel"/, 'announced as a carousel');
  assert.match(slider, /aria-roledescription="slide"/, 'each slide is announced');
  assert.match(slider, /data-hero-prev[^]*aria-label="আগের খবর"/, 'prev button is labelled');
  assert.match(slider, /data-hero-next[^]*aria-label="পরের খবর"/, 'next button is labelled');
  assert.match(slider, /tabindex="0"/, 'the track is keyboard-focusable');
  assert.match(slider, /ArrowLeft[\s\S]{0,80}ArrowRight/, 'arrow keys move slides');
  assert.match(slider, /<a href=\{`\/article\/\$\{p\.slug\}`\}/, 'slides are real crawlable links');
});
