// test/fetch-enrich.test.mjs — B1: thin Google-News bodies get HTML enrichment.
// Only the pure decision logic is unit-tested (no network in tests).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import {
  enrichThinBodies,
  extractArticleBody,
  googleNewsArticleId,
  needsBodyEnrichment,
  parseGoogleNewsBatchResponse,
  parseGoogleNewsDecodingParams,
  resolveGoogleNewsUrl,
} from '../lib/fetch.mjs';
import { bodyWordCount } from '../lib/editorial.mjs';

test('needsBodyEnrichment: true for header-only Google-News item', () => {
  assert.equal(needsBodyEnrichment({ title: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান', body: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না ইরান' }), true);
  assert.equal(needsBodyEnrichment({ title: 'আজকের সংবাদ', body: '' }), true);
});

test('needsBodyEnrichment: true for a mid-length RSS summary that cannot be published', () => {
  // 2026-09-27: the old character heuristic (body < title + 20) treated a real
  // 30-word feed summary as "already a body" and skipped enrichment, so the
  // item never got the article and then failed the 150-word publish floor.
  // The trigger is now the publish floor, not the title length.
  const rssSummary = 'ঢাকার মিরপুরে স্বাস্থ্যসেবা কেন্দ্রে আজ সকালে উদ্বোধন করা হয়েছে। জেলা স্বাস্থ্য অধিদপ্তরের তথ্য অনুযায়ী, নতুন ভবনটিতে ডাক্তার, নার্স ও প্রয়োজনীয় যন্ত্রপাতি সরবরাহ করা হয়েছে। উপস্থেল ছিলেন স্থানীয় জনপ্রতিনিধি ও কর্মকর্তারা।';
  assert.equal(needsBodyEnrichment({ title: 'ঢাকার মিরপুরে স্বাস্থ্যসেবা কেন্দ্র উদ্বোধন', body: rssSummary }), true);
});

test('needsBodyEnrichment: false when a body is already long enough to publish', () => {
  const longBody = Array.from({ length: 40 }, (_, i) =>
    `ইরানের প্রেসিডেন্ট মসুদ পেজেশকিয়ান জাতিসংঘের সাধারণ পরিষদে ভাষণে বলেছেন ${i + 1}, ইরান শান্তিপূর্ণ পারমাণবিক কর্মসূচিতে প্রতিশ্রুতিবদ্ধ। তিনি বলেন, পরমাণু অস্ত্রের ব্যবহার সবসময় নিষিদ্ধ ছিল। জাতিসংঘের সদর দপ্তরে আয়োজিত সংবাদ সম্মেলনে তিনি আরও বলেন, অঞ্চলে স্থিতিশীলতা বজায় রাখতে ইরান কাজ করছে।`,
  ).join(' ');
  assert.ok(bodyWordCount(longBody) >= 150, 'fixture must clear the publish floor');
  assert.equal(needsBodyEnrichment({ title: 'শান্তিপূর্ণ পারমাণবিক প্রযুক্তি ছাড়বে না', body: longBody }), false);
});

test('extractArticleBody prefers JSON-LD articleBody', () => {
  const articleBody = 'রাজধানীর বাজারগুলোতে নতুন সিদ্ধান্ত কার্যকর হয়েছে। কর্তৃপক্ষ বলেছে, পরবর্তী ধাপে পরিবর্তনগুলো ধাপে ধাপে সব জায়গায় কার্যকর করা হবে। ব্যবসায়ীরা জানিয়েছেন, নতুন সময়সূচি ও কার্যপ্রণালি স্পষ্ট না হওয়া পর্যন্ত তারা প্রস্তুতি নিতে পারছেন না।';
  const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'NewsArticle', articleBody }] })}</script><article><p>সংক্ষিপ্ত বিবরণ</p></article>`;
  assert.equal(extractArticleBody(cheerio.load(html)), articleBody);
});

test('Google News helpers extract id, page parameters, and destination', () => {
  const token = Buffer.from('AU_yqLfake-token').toString('base64url');
  const wrapper = `https://news.google.com/rss/articles/${token}?oc=5`;
  assert.equal(googleNewsArticleId(wrapper), token);
  assert.deepEqual(
    parseGoogleNewsDecodingParams('<c-wiz><div jscontroller data-n-a-sg="signature" data-n-a-ts="123"></div></c-wiz>'),
    { signature: 'signature', timestamp: '123' },
  );
  const response = `)]}'\n\n${JSON.stringify([
    ['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', 'https://www.jugantor.com/capital/1140362']), null, null, null, 'generic'],
  ])}`;
  assert.equal(parseGoogleNewsBatchResponse(response), 'https://www.jugantor.com/capital/1140362');
});

test('resolveGoogleNewsUrl resolves a modern wrapper with fetched parameters', async () => {
  const token = Buffer.from('AU_yqLfake-token').toString('base64url');
  const wrapper = `https://news.google.com/rss/articles/${token}?oc=5`;
  const destination = 'https://www.jugantor.com/capital/1140362';
  let fetchedPath = null;
  let postedBody = null;
  const resolved = await resolveGoogleNewsUrl(wrapper, {
    getImpl: async (url) => {
      fetchedPath = url;
      return { ok: true, text: '<div data-n-a-sg="signature" data-n-a-ts="123"></div>' };
    },
    postImpl: async (_url, body) => {
      postedBody = body;
      return {
        ok: true,
        text: `)]}'\n\n${JSON.stringify([['wrb.fr', 'Fbv4je', JSON.stringify(['garturlres', destination])]])}`,
      };
    },
  });
  assert.equal(resolved, destination);
  assert.equal(fetchedPath, `https://news.google.com/articles/${token}`);
  assert.match(postedBody, /Fbv4je/);
  assert.match(decodeURIComponent(postedBody), new RegExp(token));
});

test('enrichThinBodies stores the resolved publisher URL and full body', async () => {
  const token = Buffer.from('AU_yqLfake-token').toString('base64url');
  const wrapper = `https://news.google.com/rss/articles/${token}?oc=5`;
  const destination = 'https://www.jugantor.com/capital/1140362';
  const articleBody = 'বাজারগুলোতে নতুন সিদ্ধান্ত কার্যকর হয়েছে। কর্তৃপক্ষ বলেছেন, পরবর্তী ধাপে বাজারগুলোর সময়সূচি ও প্রক্রিয়া আবার যাচাই করা হবে। ব্যবসায়ীরা জানিয়েছেন, স্পষ্ট নির্দেশনা পাওয়া গেলে তারা প্রস্তুতি নেবেন।';
  const [item] = await enrichThinBodies([
    { title: 'বাজারের নতুন সিদ্ধান্ত', body: 'বাজারের নতুন সিদ্ধান্ত', url: wrapper, url_hash: 'old' },
  ], {
    resolveImpl: async () => destination,
    getImpl: async (url) => ({
      ok: true,
      url,
      text: `<script type="application/ld+json">${JSON.stringify({ articleBody })}</script>`,
    }),
    delayMs: 0,
  });
  assert.equal(item.url, destination);
  assert.notEqual(item.url_hash, 'old');
  assert.equal(item.body, articleBody);
});
