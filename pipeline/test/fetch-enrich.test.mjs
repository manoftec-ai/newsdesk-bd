// test/fetch-enrich.test.mjs — B1: thin Google-News bodies get HTML enrichment.
// Only the pure decision logic is unit-tested (no network in tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsBodyEnrichment } from '../lib/fetch.mjs';

test('needsBodyEnrichment: true for header-only Google-News item', () => {
  assert.equal(needsBodyEnrichment({ title: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান', body: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান' }), true);
  assert.equal(needsBodyEnrichment({ title: 'আজকের সংবাদ', body: '' }), true);
});

test('needsBodyEnrichment: false when a real body is present', () => {
  const longBody = 'ইরানের প্রেসিডেন্ট মসুদ পেজেশকিয়ান জাতিসংঘের সাধারণ পরিষদে ভাষণে বলেছেন, ইরান শান্তিপূর্ণ পারমাণবিক কর্মসূচিতে প্রতিশ্রুতিবদ্ধ। তিনি বলেন, পরমাণু অস্ত্রের ব্যবহার সবসময় নিষিদ্ধ ছিল। জাতিসংঘের সদর দপ্তরে আয়োজিত সংবাদ সম্মেলনে তিনি আরও বলেন, অঞ্চলে স্থিতিশীলতা বজায় রাখতে ইরান কাজ করছে।';
  assert.equal(needsBodyEnrichment({ title: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না', body: longBody }), false);
});