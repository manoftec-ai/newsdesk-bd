import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findEditorialViolations, targetWords } from '../lib/synth.mjs';

const bn = 'বাংলা';
const bn2 = 'বাংলা-২';

test('blocks "পর্যবক্ষকরা মনে করছেন" speculation', () => {
  const body = `${bn} বৈঠকের পর পর্যবক্ষকরা মনে করছেন, দুই পক্ষের মধ্যে সমঝোতা হবে।`;
  const hits = findEditorialViolations(body);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].type, 'speculation');
});

test('blocks "মনে করা হচ্ছে" and "আলোচনার জন্ম দেবে"', () => {
  const body = `${bn} বিষয়টি নিয়ে আলোচনার জন্ম দেবে বলে মনে করা হচ্ছে।`;
  const hits = findEditorialViolations(body);
  assert.ok(hits.length >= 2, `expected 2 hits, got ${hits.length}`);
  assert.ok(hits.every((h) => h.type === 'speculation'));
});

test('blocks "পর্যবক্ষকদের মতে" variant', () => {
  const body = `${bn} পর্যবক্ষকদের মতে, এটি সম্ভব।`;
  assert.equal(findEditorialViolations(body).length, 1);
});

test('blocks empty predictive "আলোচনা হতে পারে" sentence', () => {
  const body = `${bn}\n\nবিষয়টি নিয়ে ব্যাপক আলোচনা হতে পারে।`;
  const hits = findEditorialViolations(body);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].type, 'filler');
});

test('allows a clean synthesized factual body', () => {
  const body = `${bn} নিউইয়র্কে প্রধানমন্ত্রীর সঙ্গে গেটস ফাউন্ডেশনের সিইওর বৈঠক হয়েছে।
বাংলা ট্রিবিউন ও যুগান্তর জানিয়েছে, বুধবার একটি স্থানীয় হোটেলে বৈঠকটি অনুষ্ঠিত হয়।

## কী ঘটেছে

বৈঠকে কোন বিষয় আলোচনা হয়েছে তা দুই প্রতিবেদনে বিস্তারিত বলা হয়নি।

## যা এখনো জানা যায়নি

বৈঠকে কী কী বিষয় নিয়ে আলোচনা হয়েছে এবং কোনো সিদ্ধান্ত হয়েছে কি না, এবিষয়ে বিস্তারিত প্রকাশিত হয়নি।`;
  assert.equal(findEditorialViolations(body).length, 0);
});

test('allows quoted statement containing "মনে করছেন" inside a quote', () => {
  const body = `${bn} রিজভী বলেন, "আমি মনে করছি এটি ভুল সিদ্ধান্ত হবে।"`;
  const hits = findEditorialViolations(body);
  assert.equal(hits.length, 0);
});

test('targetWords: ≤2 sources -> short (100-180)', () => {
  assert.deepEqual(targetWords({ members: [{}, {}] }), { min: 100, max: 180, tier: 'short' });
  assert.equal(targetWords({ members: [{}] }).tier, 'short');
});

test('targetWords: 3 sources -> normal (200-350)', () => {
  assert.deepEqual(targetWords({ members: [{}, {}, {}] }), { min: 200, max: 350, tier: 'normal' });
});

test('targetWords: ≥4 sources -> complex (400-550)', () => {
  assert.deepEqual(targetWords({ members: [{}, {}, {}, {}] }), { min: 400, max: 550, tier: 'complex' });
  assert.equal(targetWords({ members: [] }).tier, 'short');
});