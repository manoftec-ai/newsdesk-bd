// test/watcher.test.mjs — unit tests for tracked_watcher helpers
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripSourceFromTitle,
  decodeGoogleNewsUrl,
  relevanceScore,
} from '../tools/tracked_watcher.mjs';

test('stripSourceFromTitle removes outlet suffix', () => {
  assert.equal(
    stripSourceFromTitle('চট্টগ্রামে ডেঙ্গু শিক্ষার্থীর মৃত্যু - প্রথম আলো', 'প্রথম আলো'),
    'চট্টগ্রামে ডেঙ্গু শিক্ষার্থীর মৃত্যু',
  );
  assert.equal(
    stripSourceFromTitle('ঢাকায় বৃষ্টি নামছে - চ্যানেল আই', ''),
    'ঢাকায় বৃষ্টি নামছে',
  );
  assert.equal(stripSourceFromTitle('কোনো ড্যাশ নেই', ''), 'কোনো ড্যাশ নেই');
});

test('decodeGoogleNewsUrl recovers origin URL or falls back', () => {
  const fake = 'https://news.google.com/rss/articles/CBMiVGh0dHBzOi8vZXhhbXBsZS5jb20vc3RvcnkvMWlPdn1';
  const decoded = decodeGoogleNewsUrl(fake);
  assert.ok(typeof decoded === 'string' && decoded.length > 0);
  assert.equal(decodeGoogleNewsUrl('https://example.com/direct'), 'https://example.com/direct');
  assert.equal(decodeGoogleNewsUrl('not a url'), 'not a url');
});

test('relevanceScore counts fingerprint term hits', () => {
  const fp = { keywords: ['ডেঙ্গু', 'মৃত্যু'], entities: ['স্বাস্থ্য অধিদপ্তর'] };
  assert.equal(relevanceScore('ডেঙ্গু মৃত্যুর সংখ্যা কমেছে ঢাকায়', fp), 2);
  assert.equal(relevanceScore('আবহাওয়ার খবর', fp), 0);
  assert.equal(relevanceScore('DP world এনসিটি ইজারা', { keywords: ['এনসিটি ইজারা'] }), 1);
});