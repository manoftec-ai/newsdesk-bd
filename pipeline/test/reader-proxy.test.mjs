// test/reader-proxy.test.mjs — reader fallback for bot-blocked pages.
// Fully offline: the HTTP layer is injected/stubbed, never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readerEnabled,
  readerUrl,
  markdownToArticle,
  fetchViaReader,
  titleFromReaderMarkdown,
  titleMatchesReader,
} from '../lib/reader-proxy.mjs';
import { extractArticle } from '../lib/article-text.mjs';

const BN = 'ঢাকায় তিন দিনব্যাপী আন্তর্জাতিক প্রশিক্ষণ কর্মশালা শুরু হয়েছে। এশিয়ার আটটি দেশের সতেরো জন প্রশিক্ষণার্থী অংশ নিচ্ছেন। উদ্বোধনী অনুষ্ঠানে প্রধান অতিথি হিসেবে উপস্থিত ছিলেন ঊর্ধ্বতন কর্মকর্তারা। কর্মশালার মূল লক্ষ্য দায়িত্বশীল বিজ্ঞান চর্চার সংস্কৃতি গড়ে তোলা। যৌথ পরিকল্পনা ও বাস্তবায়নে এ কর্মসূচি অনুষ্ঠিত হচ্ছে।';

const MARKDOWN = `Title: পরীক্ষামূলক শিরোনাম

URL Source: https://example.com/news/1

Published Time: 2026-10-06T10:00:00+06:00

Markdown Content:
## পরীক্ষামূলক শিরোনাম

${BN}

![ছবি: বর্ণনা](https://example.com/img.jpg)

আরও পড়ুন [সম্পর্কিত খবর](https://example.com/related) শেষ।
`;

test('readerUrl accepts http(s) only', () => {
  assert.equal(readerUrl('https://example.com/a'), 'https://r.jina.ai/https://example.com/a');
  assert.equal(readerUrl('http://example.com/a'), 'https://r.jina.ai/http://example.com/a');
  assert.equal(readerUrl('ftp://example.com/a'), null);
  assert.equal(readerUrl('not a url'), null);
  assert.equal(readerUrl(null), null);
});

test('readerEnabled honours READER_PROXY=0', () => {
  const prev = process.env.READER_PROXY;
  assert.equal(readerEnabled(), true);
  process.env.READER_PROXY = '0';
  assert.equal(readerEnabled(), false);
  if (prev === undefined) delete process.env.READER_PROXY;
  else process.env.READER_PROXY = prev;
});

test('markdownToArticle strips preamble and markdown, keeps prose', () => {
  const art = markdownToArticle(MARKDOWN, { minBengali: 50 });
  assert.equal(art.ok, true);
  assert.equal(art.via, 'reader');
  assert.ok(!art.text.includes('URL Source:'), 'preamble removed');
  assert.ok(!art.text.includes('!['), 'images removed');
  assert.ok(!art.text.includes('](https://'), 'link syntax removed');
  assert.ok(art.text.includes('সম্পর্কিত খবর'), 'link text kept');
  assert.ok(art.text.includes('তিন দিনব্যাপী'), 'body kept');
});

test('markdownToArticle refuses thin markdown', () => {
  const art = markdownToArticle('Title: x\n\nMarkdown Content:\nছোট।\n', { minBengali: 400 });
  assert.equal(art.ok, false);
  assert.ok(art.why.startsWith('reader-thin'));
  assert.equal(markdownToArticle('', { minBengali: 1 }).why, 'reader-empty');
});

test('fetchViaReader maps statuses and sends key when set', async () => {
  const seen = {};
  const fakeFetch = async (url, opts) => {
    seen.url = url;
    seen.auth = opts?.headers?.Authorization;
    return { ok: true, status: 200, text: async () => MARKDOWN };
  };
  const prev = process.env.JINA_API_KEY;
  delete process.env.JINA_API_KEY;
  const r = await fetchViaReader('https://example.com/a', { fetchImpl: fakeFetch });
  assert.equal(r.ok, true);
  assert.equal(r.via, 'reader');
  assert.ok(seen.url.startsWith('https://r.jina.ai/https://'), 'proxied URL');
  assert.equal(seen.auth, undefined, 'no auth header without key');

  process.env.JINA_API_KEY = 'k-test';
  await fetchViaReader('https://example.com/a', { fetchImpl: fakeFetch });
  assert.equal(seen.auth, 'Bearer k-test');
  if (prev === undefined) delete process.env.JINA_API_KEY;
  else process.env.JINA_API_KEY = prev;

  const bad = await fetchViaReader('notaurl', { fetchImpl: fakeFetch });
  assert.equal(bad.why, 'reader-bad-url');
  const denied = await fetchViaReader('https://example.com/a', {
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'slow down' }),
  });
  assert.equal(denied.why, 'reader-http-429');
});

test('extractArticle falls back to reader on direct 403', async () => {
  const prevFetch = globalThis.fetch;
  const prevFlag = process.env.READER_PROXY;
  delete process.env.READER_PROXY;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://r.jina.ai/')) {
      return { ok: true, status: 200, text: async () => MARKDOWN };
    }
    return { ok: false, status: 403, url, text: async () => '' };
  };
  try {
    const art = await extractArticle('https://blocked.example.com/story', { minBengali: 50 });
    assert.equal(art.ok, true);
    assert.equal(art.via, 'reader');
    assert.ok(art.text.includes('তিন দিনব্যাপী'));
  } finally {
    globalThis.fetch = prevFetch;
    if (prevFlag === undefined) delete process.env.READER_PROXY;
    else process.env.READER_PROXY = prevFlag;
  }
});

test('markdownToArticle rejects nav-furniture pages (soft-404 front pages)', () => {
  const furniture = `Title: প্রথম পাতা

URL Source: https://example.com/print-edition/front-page/1234567

Markdown Content:
ঢাকা, মঙ্গলবার ০৬ অক্টোবর ২০২৬

*   [ই-পেপার](https://example.com/epaper)
*   [প্রথম পাতা](https://example.com/front)
*   [খেলা](https://example.com/sports)

Sunday Su Monday Mo Tuesday Tu Wednesday We Thursday Th Friday Fr Saturday Sa 27 28 29 30 1 2 3
`;
  const art = markdownToArticle(furniture, { minBengali: 400, minWords: 60 });
  assert.equal(art.ok, false);
  assert.ok(art.why.startsWith('reader-thin'));
});

test('titleMatchesReader accepts same story, rejects wrong page', () => {
  assert.equal(
    titleMatchesReader('পরীক্ষামূলক শিরোনাম নিয়ে প্রতিবেদন', MARKDOWN),
    true,
  );
  const other = MARKDOWN.replace('পরীক্ষামূলক শিরোনাম', 'খেলার মাঠে নতুন রেকর্ড');
  assert.equal(titleMatchesReader('নারীদের জন্য হোম লোন: নিজের বাড়ি', other), false);
  assert.equal(titleMatchesReader('', MARKDOWN), true, 'missing expectation cannot judge');
  assert.equal(titleFromReaderMarkdown(MARKDOWN), 'পরীক্ষামূলক শিরোনাম');
});

test('extractArticle rejects reader text with mismatched title', async () => {
  const prevFetch = globalThis.fetch;
  const other = MARKDOWN.replaceAll('পরীক্ষামূলক শিরোনাম', 'খেলার মাঠে নতুন রেকর্ড');
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://r.jina.ai/')) {
      return { ok: true, status: 200, text: async () => other };
    }
    return { ok: false, status: 403, url, text: async () => '' };
  };
  try {
    const art = await extractArticle('https://blocked.example.com/s', {
      minBengali: 50,
      expectTitle: 'নারীদের জন্য হোম লোন',
    });
    assert.equal(art.ok, false);
    assert.equal(art.readerWhy, 'reader-title-mismatch');
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('extractArticle keeps original failure when reader disabled or also fails', async () => {
  const prevFetch = globalThis.fetch;
  const prevFlag = process.env.READER_PROXY;
  globalThis.fetch = async () => ({ ok: false, status: 403, url: '', text: async () => '' });
  try {
    process.env.READER_PROXY = '0';
    const direct = await extractArticle('https://blocked.example.com/s', { minBengali: 50 });
    assert.equal(direct.why, 'http-403');
    assert.equal(direct.readerWhy, undefined);

    delete process.env.READER_PROXY;
    const both = await extractArticle('https://blocked.example.com/s', { minBengali: 50 });
    assert.equal(both.ok, false);
    assert.equal(both.why, 'http-403');
    assert.ok(both.readerWhy, 'reader attempt recorded');
  } finally {
    globalThis.fetch = prevFetch;
    if (prevFlag === undefined) delete process.env.READER_PROXY;
    else process.env.READER_PROXY = prevFlag;
  }
});
