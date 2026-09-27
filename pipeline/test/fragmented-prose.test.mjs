// 2026-07-27: national-553 reported a DMP press conference as 36 paragraphs in
// which the same fact appeared seven times - once per outlet, in each outlet's
// wording - plus paragraphs opening on the tail of a sentence the feed cut away.
// It passed every gate that existed: c12 gave it 100% headline overlap, five
// genuinely distinct sources, no furniture. Nothing had a rule about repetition
// or about a paragraph that is a fragment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mechanicalAudit } from '../lib/audit.mjs';

const brief = {
  headline: 'ককটেল বিস্ফোরণ নিয়ে প্রয়োজনে নাসীরুদ্দীন পাটওয়ারীকে জিজ্ঞাসাবাদ: ডিএমপি',
  members: [{ lead: 'ডিএমপি সংবাদ সম্মেলন' }],
};

const FACT =
  'ডিএমপির যুগ্ম কমিশনার মো. তোফায়েল আহমেদ মিয়া বলেছেন, ককটেল বিস্ফোরণের ঘটনায় নাসীরুদ্দীন পাটওয়ারীকে জিজ্ঞাসাবাদ করা উচিত বলে মনে করছে পুলিশ।';

test('c13 refuses a paragraph that opens on a back-reference', () => {
  const body = [
    'শুক্রবার বিকেলে ডিএমপির মিডিয়া সেন্টারে সংবাদ সম্মেলন হয়েছে।',
    'পরে তার দেওয়া তথ্যের ভিত্তিতে ককটেল তৈরিতে ব্যবহৃত দেড় কেজি কস্টিক সোডা উদ্ধার করা হয়েছে।',
    FACT,
  ].join('\n\n');
  const r = mechanicalAudit(brief, body);
  assert.ok(r.fails.some((f) => f.id === 'c13'), JSON.stringify(r.fails));
});

test('c14 refuses the same fact stated twice', () => {
  const body = [
    FACT,
    'ডিএমপির যুগ্ম কমিশনার মো. তোফায়েল আহমেদ মিয়া বলেছেন, ককটেল বিস্ফোরণের ঘটনায় নাসীরুদ্দীন পাটওয়ারীকে জিজ্ঞাসাবাদ করা উচিত বলে মনে করছেন।',
  ].join('\n\n');
  const r = mechanicalAudit(brief, body);
  assert.ok(r.fails.some((f) => f.id === 'c14'), JSON.stringify(r.fails));
});

test('a summary block that echoes the lead is NOT a duplicate paragraph', () => {
  // The এক নজরে bullet block is 8 tokens and shares 5 common words with the
  // lead. On a ratio alone that read as a 0.63 duplicate and failed the
  // clean-body fixture, so c14 also requires an absolute shared-token floor.
  const body = [
    'ঢাকা মেট্রোরেলের নতুন একটি লাইন রবিবার সকালে চালু হয়েছে। পুলিশ জানিয়েছে, প্রথম দফায় ১০টি স্টেশনে ট্রেন চলবে। যাত্রীরা নির্ধারিত সময় অনুযায়ী টিকিট কেটে মেট্রো ব্যবহার করতে পারবেন।',
    '**এক নজরে**\n- নতুন লাইন চালু\n- ১০টি স্টেশন\n- রবিবার থেকে',
    'সকাল সাড়ে আটটায় কামরাঙ্গীরচর স্টেশন থেকে প্রথম ট্রেনটি যাত্রা শুরু করে। মন্ত্রণালয় জানায়, ভাড়া নির্ধারণের বিষয়ে সিদ্ধান্ত পরে জানানো হবে।',
  ].join('\n\n');
  const r = mechanicalAudit(brief, body);
  assert.ok(
    !r.fails.some((f) => f.id === 'c14'),
    `a summary block was treated as a duplicate: ${JSON.stringify(r.fails)}`,
  );
});
