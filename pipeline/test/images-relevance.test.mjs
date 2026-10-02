// test/images-relevance.test.mjs — a thumbnail must be about its own story
// (2026-10-02). The user reported that roughly half the front page had
// images unrelated to the headline, and named national-1118: a story about a
// new penguin species illustrated by a night street scene.
//
// The cause was not bad luck. buildQuery() fell through to CATEGORY_QUERY when
// no keyword matched the title, and "national" -> "dhaka city" means EVERY
// national story that missed the keyword table got a random city photograph.
// The fallback is now only used where the category image is itself topical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuery } from '../lib/images.mjs';

const specific = (title, category = 'national') => buildQuery(category, [], title).specific;

test('a story about nature or science gets a nature query, not a city photo', () => {
  const r = buildQuery('national', [], '১০০ বছর পর পেঙ্গুইনের নতুন প্রজাতির সন্ধান পেলেন বিজ্ঞানীরা');
  assert.equal(r.specific, true);
  assert.match(r.query, /wildlife|nature/);
  assert.doesNotMatch(r.query, /dhaka city/, 'this is the exact defect the user reported');
});

test('the subjects that were landing on the wrong photo now match', () => {
  // each of these titles produced a decorative photo before
  const cases = [
    ['বিক্রির আগের দিন মরে ভেসে উঠেছে ৪০ বিঘা খামারের মাছ', /farm|market|agriculture/],
    ['ছাত্রকে ধর্ষণের অভিযোগে মাদ্রাসাশিক্ষককে গাছের সঙ্গে বাঁধল জনতা', /court|justice/],
    ['হামলার মধ্যেই ককপিটের দরজা খুলে যাত্রীদের বাঁচালেন ভারতীয় পাইলট', /airport|aviation|airplane/],
    ['ঢাকায় বৃষ্টিভেজা ছুটির সকাল', /nature|sky|rain/],
    ['সাধারণ একজন শ্রমিকের দিন', /factory|labour|workers/],
  ];
  for (const [title, expected] of cases) {
    const r = buildQuery('national', [], title);
    assert.equal(r.specific, true, `"${title}" must drive its own query`);
    assert.match(r.query, expected, `"${title}" -> ${r.query}`);
  }
});

test('the catch-all national bucket no longer borrows a city photo', () => {
  // nothing in the title maps to a subject: a branded card is the honest answer
  const r = buildQuery('national', [], 'একটি সাধারণ কথোপকথন');
  assert.equal(r.specific, false, 'no keyword hit means no photo claim');
  assert.equal(r.query, 'dhaka city', 'the query is unchanged; it is simply not used for a photo');
});

test('categories whose generic image is itself topical still get a photo', () => {
  for (const category of ['politics', 'sports', 'economy', 'international', 'tech', 'entertainment']) {
    assert.equal(specific('একটি সাধারণ কথোপকথন', category), true, `${category} should keep its topical image`);
  }
  for (const category of ['national', 'opinion', 'latest']) {
    assert.equal(specific('একটি সাধারণ কথোপকথন', category), false, `${category} must fall back to the card`);
  }
});

test('a re-render replaces the thumbnail keys instead of duplicating them', async () => {
  // 2026-10-02: --force re-rendered national-1118 and produced TWO
  // thumbnail/thumbnailAlt pairs. Duplicate mapping keys make js-yaml throw,
  // so the Astro build failed for the WHOLE site and Vercel went ERROR while
  // the last good deploy stayed live. insertThumbnail must strip the old pair
  // before writing the new one.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../tools/add_images.mjs', import.meta.url), 'utf8');
  const fn = src.match(/function insertThumbnail[\s\S]*?\n}/)[0];
  assert.match(fn, /replace\(\/\^thumbnailAlt:/, 'must remove the old thumbnailAlt');
  assert.match(fn, /replace\(\/\^thumbnail:/, 'must remove the old thumbnail');

  // and the corpus itself must stay free of duplicate top-level keys
  const dir = new URL('../../site/src/content/news/', import.meta.url);
  const { readdirSync } = await import('node:fs');
  const dupes = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const raw = readFileSync(new URL(f, dir), 'utf8');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (!m) continue;
    const seen = new Set();
    for (const line of m[1].split('\n')) {
      const k = (line.match(/^([A-Za-z_][A-Za-z0-9_-]*):/) || [])[1];
      if (!k) continue;
      if (seen.has(k)) dupes.push(`${f}: ${k}`);
      seen.add(k);
    }
  }
  assert.deepEqual(dupes, [], `duplicate front matter keys break the Astro build:\n${dupes.join('\n')}`);
});

test('a re-render cannot reintroduce a byte-identical copy', () => {
  // 2026-10-02: 136 images in the corpus were exact copies of another article
  // before the first pass, and a second pass still left 42 — the same Openverse
  // query re-offers the same photograph in a later batch. Comparing the SOURCE
  // url cannot see that (two records are routinely one photo), so the choice now
  // compares the RENDERED bytes against a hash set built from every image on disk.
  const src = readFileSync(new URL('../lib/images.mjs', import.meta.url), 'utf8');
  assert.match(src, /usedHashes/, 'the chooser must accept the corpus hashes');
  assert.match(src, /createHash\("sha1"\)\.update\(await renderPhotoFromBuffer/, 'it must hash the RENDERED bytes');
  const tool = readFileSync(new URL('../tools/add_images.mjs', import.meta.url), 'utf8');
  assert.match(tool, /usedHashes = new Set\(\)/, 'the tool must build the hash set from the corpus');
  assert.match(tool, /readdirSync\(imagesDir\)/, 'from every image on disk');
  assert.match(tool, /usedHashes\.add\(createHash\("sha1"\)\.update\(result\.webp\)/, 'and must record what it writes');
});
