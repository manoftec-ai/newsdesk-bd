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
  translateUrl,
  fetchViaTranslate,
  titleFromHtml,
  guessBn,
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

test('translateUrl builds a proxy URL with language', () => {
  assert.equal(
    translateUrl('https://example.com/a'),
    'https://translate.google.com/translate?sl=auto&tl=bn&u=https%3A%2F%2Fexample.com%2Fa',
  );
  assert.ok(translateUrl('https://example.com/a', 'en').includes('tl=en'));
  assert.equal(translateUrl('notaurl'), null);
});

test('guessBn distinguishes Bengali from English text', () => {
  assert.equal(guessBn('ঢাকায় প্রশিক্ষণ কর্মশালা শুরু হয়েছে আজ'), true);
  assert.equal(guessBn('Training workshop started today in Dhaka city'), false);
  assert.equal(guessBn(''), null);
  assert.equal(titleFromHtml('<html><head><title>পরীক্ষা শিরোনাম</title></head></html>'), 'পরীক্ষা শিরোনাম');
  assert.equal(titleFromHtml('no title here'), '');
});

test('fetchViaTranslate maps statuses (injected fetch)', async () => {
  const html = `<html><head><title>t</title></head><body>${'<p>ঢাকায় প্রশিক্ষণ কর্মশালা শুরু হয়েছে আজ সকালে।</p>'.repeat(40)}</body></html>`;
  const ok = await fetchViaTranslate('https://example.com/a', {
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => html }),
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.via, 'translate');
  const denied = await fetchViaTranslate('https://example.com/a', {
    fetchImpl: async () => ({ ok: false, status: 403, text: async () => '' }),
  });
  assert.equal(denied.why, 'translate-http-403');
  const thin = await fetchViaTranslate('https://example.com/a', {
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'short' }),
  });
  assert.ok(thin.why.startsWith('translate-thin-response'));
});

test('extractArticle falls through to translate when reader also fails', async () => {
  const prevFetch = globalThis.fetch;
  const para = 'ঢাকায় তিন দিনব্যাপী আন্তর্জাতিক প্রশিক্ষণ কর্মশালা শুরু হয়েছে আজ সকালে রাজধানীর একটি হোটেলে। এতে এশিয়ার আটটি দেশের প্রতিনিধিরা অংশ নিচ্ছেন বলে আয়োজকরা জানিয়েছেন।';
  const html = `<html><head><title>প্রশিক্ষণ কর্মশালা শুরু</title></head><body>${`<p>${para}</p>`.repeat(12)}</body></html>`;
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://translate.google.com/')) {
      return { ok: true, status: 200, text: async () => html };
    }
    return { ok: false, status: 403, url, text: async () => '' };
  };
  try {
    const art = await extractArticle('https://blocked.example.com/s', {
      minBengali: 50,
      expectTitle: 'প্রশিক্ষণ কর্মশালা শুরু হয়েছে',
    });
    assert.equal(art.ok, true);
    assert.equal(art.via, 'translate');
    assert.ok(art.text.includes('তিন দিনব্যাপী'));
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('extractArticle records translate mismatch and uses tl=en for English', async () => {
  const prevFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).startsWith('https://translate.google.com/')) {
      const filler = '<p>ঢাকায় প্রশিক্ষণ কর্মশালা নিয়ে বিস্তারিত আলোচনা হয়েছে আজকের বৈঠকে উপস্থিত সকলের মধ্যে।</p>'.repeat(20);
      return { ok: true, status: 200, text: async () => `<html><head><title>Wrong Page</title></head><body>${filler}</body></html>` };
    }
    return { ok: false, status: 403, url, text: async () => '' };
  };
  try {
    const art = await extractArticle('https://blocked.example.com/s', {
      minBengali: 10,
      expectTitle: 'ঢাকায় প্রশিক্ষণ কর্মশালা',
    });
    assert.equal(art.ok, false);
    assert.equal(art.translateWhy, 'translate-title-mismatch');

    seen.length = 0;
    await extractArticle('https://blocked.example.com/s', { minBengali: 10, lang: 'en' });
    assert.ok(seen.some((u) => u.includes('tl=en')), 'english evidence proxies without translating');
  } finally {
    globalThis.fetch = prevFetch;
  }
});
