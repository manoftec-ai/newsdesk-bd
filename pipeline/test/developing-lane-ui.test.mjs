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

test('the article page states its verification state with the badge, not a sentence', () => {
  // 2026-09-30: the developing lane added an explanatory sentence under the
  // headline. 2026-10-01 the user removed it — the chip ("যাচাই চলছে") and the
  // প্রমাণ দেখুন panel already say how firm a story is, and the extra paragraph
  // was noise. This test now records that decision so the sentence does not
  // creep back in.
  const page = read('src/pages/article/[slug].astro');
  assert.doesNotMatch(page, /এই প্রতিবেদনটি এখনো যাচাই চলছে/);
  assert.doesNotMatch(page, /\{post\.developing && \(/);
  assert.match(page, /<VerificationBadge/, 'the badge chip is how the state is shown');
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
  // comments describe the motion design; the checks below are about code.
  const code = slider.replace(/\/\/[^\n]*/g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  assert.match(page, /<HeroSlider slides=\{heroSlides\} \/>/, 'the hero is the slider');
  assert.match(slider, /scroll-snap-type:\s*x mandatory/, 'swiping works with zero JS');
  // 2026-10-01 (user rule): the slider auto-moves. The timer is allowed, but
  // only with the three brakes: reduced-motion never starts it, and hover /
  // focus / a hidden tab pause it.
  assert.match(code, /setInterval\(\(\) => go\(current\(\) \+ 1\), AUTOPLAY_MS\)/, 'auto-advance exists');
  assert.match(code, /if \(reduce \|\| timer/, 'reduced-motion never starts the timer');
  assert.match(code, /mouseenter[^]*stop\(\)/, 'hover pauses');
  assert.match(code, /focusin[^]*stop\(\)/, 'keyboard focus pauses');
  assert.match(code, /visibilitychange/, 'a hidden tab pauses');
  assert.doesNotMatch(code, /from ["'](react|swiper|embla|keen-slider|flickity)/, 'no carousel dependency');
  assert.match(slider, /loading=\{i === 0 \? "eager" : "lazy"\}/, 'only slide 0 can be LCP');
  assert.match(slider, /width="1200"[\s\S]{0,40}height="630"/, 'image dimensions are fixed (no layout shift)');
  assert.match(slider, /prefers-reduced-motion/, 'reduced motion gets instant jumps');
  assert.match(slider, /aria-roledescription="carousel"/, 'announced as a carousel');
  assert.match(slider, /aria-roledescription="slide"/, 'each slide is announced');
  // 2026-10-01 (user rule): arrows sit ON the slider, nothing below it.
  assert.doesNotMatch(slider, /hero-nav|hero-dots|hero-dot/, 'no below-slider controls remain');
  assert.match(slider, /class="hero-arrow hero-arrow-left"[^]*aria-label="আগের খবর"/, 'prev arrow labelled');
  assert.match(slider, /class="hero-arrow hero-arrow-right"[^]*aria-label="পরের খবর"/, 'next arrow labelled');
  assert.match(slider, /\.hero-arrow \{[^}]*position:\s*absolute/, 'arrows overlay the slider');
  assert.match(slider, /tabindex="0"/, 'the track stays keyboard-focusable');
  assert.match(slider, /ArrowLeft[\s\S]{0,120}ArrowRight/, 'arrow keys still move slides');
  assert.match(slider, /<a href=\{`\/article\/\$\{p\.slug\}`\}/, 'slides are real crawlable links');
});

test(`article page: no dev notice, no prev/next, no comments`, () => {
  // 2026-10-01 (user request): the in-progress sentence, the "আগের/পরের
  // সংবাদ" crawl links and the Giscus comment box all came off the article
  // page — the evidence panel already says how firm a story is, and the
  // related grid already carries onward reading.
  const page = read('src/pages/article/[slug].astro');
  assert.doesNotMatch(page, /এই প্রতিবেদনটি এখনো যাচাই চলছে/, 'the in-progress sentence is gone');
  assert.doesNotMatch(page, /post\.developing &&/, 'the developing notice block is gone');
  assert.doesNotMatch(page, /আগের সংবাদ|পরের সংবাদ/, 'prev/next links are gone');
  assert.doesNotMatch(page, /adjacentPosts/, 'the prev/next query is gone with it');
  assert.doesNotMatch(page, /Giscus/, 'the comment section is gone');
  // The tier A single-source notice is a DIFFERENT sentence and stays.
  assert.match(page, /post\.verification\?\.uncorroborated/, 'the uncorroborated notice stays');
  // And the badge chip is still there — that is what the user means by
  // "we already have the proof section".
  assert.match(page, /<VerificationBadge/, 'the verification badge stays');
});

test(`homepage latest-headlines strip: titled, thumb on the left`, () => {
  // 2026-10-01 (user request): a header over the latest headlines, each row
  // showing a small thumbnail on its LEFT. .mini-row is `grid-template-columns:
  // auto 1fr`, i.e. it was always designed for thumb-then-text; the markup had
  // drifted to a forced single column, so the thumb never appeared.
  const page = read('src/pages/index.astro');
  assert.match(page, /id="latest-headlines"/, 'the strip has a real heading id');
  assert.match(page, />\s*সাম্প্রতিক খবর\s*</, 'the heading is named');
  assert.match(page, /<span class="mini-row-thumb">/, 'each row carries a thumbnail');
  assert.match(page, /<div class="mini-row">/, 'the row uses the two-column mini-row grid');
  assert.doesNotMatch(page, /mini-row !grid-cols-1/, 'the forced single column is gone');
  assert.match(page, /width="176"[\s\S]{0,40}height="102"/, 'thumb has fixed dims (no layout shift)');
  assert.match(page, /loading="lazy"/, 'thumbs below the fold are lazy');
  assert.match(page, /alt=""/, 'the decorative thumb has empty alt');
  const css = read('src/styles.css');
  assert.match(css, /\.mini-row \{[^}]*grid-template-columns:\s*auto 1fr/, 'thumb column is first = left');
});
