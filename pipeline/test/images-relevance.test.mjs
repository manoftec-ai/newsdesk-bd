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
