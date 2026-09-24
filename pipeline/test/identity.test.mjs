// test/identity.test.mjs — Entity resolution (P0-10)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeName, identityKey, extractActors } from '../lib/identity.mjs';

test('normalizeName strips honorifics from either side and NFC-normalizes', () => {
  assert.equal(normalizeName('প্রধানমন্ত্রী শেখ হাসিনা'), 'শেখ হাসিনা');
  assert.equal(normalizeName('শেখ হাসিনা প্রধানমন্ত্রী'), 'শেখ হাসিনা');
  assert.equal(normalizeName('প্রফেসর ডা. মোঃ রহিম'), 'মোঃ রহিম');
  assert.equal(normalizeName('  সিনা  '), 'সিনা');
});

test('identityKey collapses transliteration variants to one canonical (P0-10 core)', () => {
  assert.equal(identityKey('এরদোগান'), 'রিসেপ তাইয়েপ এরদোয়ান');
  assert.equal(identityKey('এরদোয়ান'), 'রিসেপ তাইয়েপ এরদোয়ান');
  assert.equal(identityKey('এর্দোয়ান'), 'রিসেপ তাইয়েপ এরদোয়ান');
  assert.equal(identityKey('আরদোয়ান'), 'রিসেপ তাইয়েপ এরদোয়ান');
  assert.equal(identityKey('সুজমান'), 'মার্ক সুজম্যান');
  assert.equal(identityKey('মার্ক সুজম্যান'), 'মার্ক সুজম্যান');
  assert.equal(identityKey('ট্রাম্প'), 'ডোনাল্ড ট্রাম্প');
});

test('identityKey stays null for junk/non-names', () => {
  assert.equal(identityKey('The Daily'), null);
  assert.equal(identityKey('com'), null);
  assert.equal(identityKey('১৮৬৮'), null);
  assert.equal(identityKey('১৮৬৮ মৃত্যু'), null); // digit-bearing clause
  assert.equal(identityKey(''), null);
  assert.equal(identityKey('পুলিশ, ঘটনাটি তদন্ত করছে'), null); // a clause, not a name
});

test('NFC equivalence: composed and decomposed য় resolve identically (DB bug handled)', () => {
  // DB text ships U+09DF; our literals used য(U+09AF)+়(U+09BC) — both must
  // canonicalize to the same identity
  const composed = 'এর্দোয়ান';
  const decomposed = composed.normalize('NFD'); // য় -> য+়
  assert.notEqual(composed, decomposed, 'precondition: forms differ at byte level');
  assert.equal(normalizeName(decomposed), normalizeName(composed));
  assert.equal(identityKey(decomposed), 'রিসেপ তাইয়েপ এরদোয়ান');
});

test('extractActors (normal): direct attribution + honorific-stripped actor', () => {
  const t = 'প্রধানমন্ত্রী শেখ হাসিনা বলেন, সিলেটে পুনর্বাসন চলবে। রিসেপ তাইয়েপ এরদোয়ান জানিয়েছেন, তুরস্ক সমর্থন দেবে।';
  assert.deepEqual(extractActors(t), ['প্রধানমন্ত্রী শেখ হাসিনা', 'রিসেপ তাইয়েপ এরদোয়ান']);
  assert.deepEqual(extractActors(t).map(identityKey), ['শেখ হাসিনা', 'রিসেপ তাইয়েপ এরদোয়ান']);
});

test('extractActors (normal): comma clause keeps only the clause holding the verb', () => {
  const t = 'এতে দুই শিক্ষার্থী আহত হয়েছেন, স্থানীয়রা বলেছেন, ক্যাম্পাসে উত্তেজনা বিরাজ করছে।';
  assert.deepEqual(extractActors(t), ['স্থানীয়রা']);
});

test('extractActors (strict): passive impersonal tails are NOT actors', () => {
  const passive = 'এতে দুই শিক্ষার্থী আহত হয়েছেন বলে জানা গেছে।';
  assert.deepEqual(extractActors(passive, { strict: true }), []);
  const real = 'এতে দুই শিক্ষার্থী আহত হয়েছেন, স্থানীয়রা বলেছেন, ক্যাম্পাসে উত্তেজনা বিরাজ করছে।';
  assert.deepEqual(extractActors(real, { strict: true }), ['স্থানীয়রা']);
});