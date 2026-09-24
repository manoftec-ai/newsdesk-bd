// test/conflict-detect.test.mjs — structured contradiction detectors (P0-10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quantityGap, extractAmounts, polarityConflict, findPolarityConflict,
} from '../lib/conflict-detect.mjs';

const AMT = (s) => extractAmounts(s)[0];
const GAP = (a, b) => quantityGap(AMT(a), AMT(b));

test('extractAmounts: Bangla digits + outlan scale words, NFC-clean', () => {
  assert.equal(AMT('৮৮ লাখ').value, 88);
  assert.equal(AMT('৮৮ লাখ').unit, 'লাখ');
  assert.equal(AMT('৯০ লাখ').value, 90);
  assert.equal(AMT('১৮৬৮ জন ভর্তি').value, 1868); // ১৮৬৮=১৮৬৬ typo family
  assert.equal(AMT('২ কোটি ৫০ লাখ').value, 2);
  assert.equal(AMT('২ কোটি ৫০ লাখ').unit, 'কোটি');
});

test('quantityGap: same-scale figures — closeness vs true gap', () => {
  assert.ok(GAP('১৮৬৮ জন ভর্তি', '১৮৬৬ জন ভর্তি') < 0.01, '1868~1866 is a typo, not a conflict');
  const g = GAP('৮৮ লাখ টাকা', '৯০ লাখ টাকা');
  assert.ok(g > 0 && g < 0.05, `88 vs 90 লাখ small-but-nonzero gap: ${g}`);
  assert.ok(GAP('১২ জন ভর্তি', '২০০ জন ভর্তি') > 0.6, '12 vs 200 is an irreconcilable gap');
  assert.equal(GAP('৮৮ লাখ টাকা', '৮৮ কোটি টাকা'), null, 'different scales are separate fields, not conflicting');
});

test('quantityGap: mixed Bangla/Latin digits NFC-equivalent', () => {
  assert.ok(GAP('১৮৬৮ জন ভর্তি', '1868 জন ভর্তি') < 0.01);
});

test('polarityConflict: same act affirmed vs negated, one-only', () => {
  const c = findPolarityConflict('সরকার সমর্থন জানিয়েছে।', 'সরকার সমর্থন জানায়নি।');
  assert.ok(c, 'affirm vs negate must be a polarity conflict');
  assert.equal(c.field, 'সমর্থন');
});

test('polarityConflict: both affirm or both negate — no conflict', () => {
  assert.equal(findPolarityConflict('সরকার সমর্থন জানিয়েছে।', 'সরকার সমর্থন জানিয়েছে।'), null);
  assert.equal(findPolarityConflict('সরকার সমর্থন জানায়নি।', 'সরকার সমর্থন জানায়নি।'), null);
});
