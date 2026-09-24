// test/headline-verify.test.mjs — headline verification unit tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyHeadline, tokenize, lexicalSupport } from '../lib/headline-verify.mjs';

const leads = [
  'ঢাকা ফ্লোরা রেস্টুরেন্ট অগ্নিকাণ্ডের ঘটনায় একজনের মৃত্যু হয়েছে। ফায়ার সার্ভিস জানায়, আগুন নিয়ন্ত্রণে এসেছে।',
  'রাজধানীর মিরপুরে ভবন থেকে পড়ে মারা গেছেন',
  'ট্রেন দুর্ঘটনায় দুজন নিহত',
];

test('headline that copies fact pool tokens is supported', () => {
  const v = verifyHeadline('ঢাকায় রেস্টুরেন্টে অগ্নিকাণ্ড, একজনের মৃত্যু', { leads });
  assert.equal(v.status, 'supported');
});

test('headline about unrelated topic fails (poor)', () => {
  const v = verifyHeadline('ক্রিকেট দল জয় পেয়েছে', { leads });
  assert.equal(v.status, 'poor');
});

test('hype term flags headline', () => {
  const v = verifyHeadline('অবিশ্বাস্য ঘটনার চাঞ্চল্যকর রূপ', { leads });
  assert.ok(v.flags.includes('hype'));
});

test('overclaim when strongest claim is CONFLICTING', () => {
  const claim = { status: 'CONFLICTING', confidence: 40 };
  const v = verifyHeadline('আগুন লাগার কারণ নিশ্চিত হয়েছে', { leads, claim });
  assert.equal(v.status, 'overclaim');
});

test('supported headline stays supported when claim is VERIFIED', () => {
  const claim = { status: 'VERIFIED', confidence: 100 };
  const v = verifyHeadline('ঢাকায় রেস্টুরেন্টে অগ্নিকাণ্ড, একজনের মৃত্যু', { leads, claim });
  assert.equal(v.status, 'supported');
});

test('variants (excerpt) are scored too', () => {
  const v = verifyHeadline('ঢাকায় রেস্টুরেন্টে অগ্নিকাণ্ড, একজনের মৃত্যু', {
    leads,
    variants: ['অগ্নিকাণ্ডে ফ্লোরা রেস্টুরেন্টে একজনের মৃত্যু', 'পুরোপুরি unrelated সাজেশন'],
  });
  assert.ok(v.surfaces['অগ্নিকাণ্ডে ফ্লোরা রেস্টুরেন্টে একজনের মৃত্যু']);
  assert.equal(v.surfaces['অগ্নিকাণ্ডে ফ্লোরা রেস্টুরেন্টে একজনের মৃত্যু'].status, 'supported');
  assert.equal(v.surfaces['পুরোপুরি unrelated সাজেশন'].status, 'poor');
});

test('tokenize strips stopwords', () => {
  const t = tokenize('একটি ঢাকায় রেস্টুরেন্টে অগ্নিকাণ্ড');
  assert.ok(!t.tokens.includes('একটি'));
  assert.ok(t.tokens.includes('ঢাকায়'));
});

test('lexicalSupport counts overlap ratio', () => {
  const s = lexicalSupport('ঢাকায় রেস্টুরেন্টে অগ্নিকাণ্ড', 'ঢাকায় রেস্টুরেন্টে অগ্নিকাণ্ড নতুন খবর');
  assert.equal(s.ratio, 1);
});