#!/usr/bin/env node
// tools/probe_new_sources.mjs — find outlets that actually deliver article text.
//
// WHY (2026-09-26)
//   The site publishes a 192-word median body because 96% of briefs carry under
//   250 words of evidence. That is a source problem, not a writer problem, and
//   the user asked for as many usable sources as possible.
//
//   HTTP 200 is not evidence of anything. Measured across the existing 23
//   sources: 11 usable, 6 that return 200 and yield ~0 words, 3 refused with
//   Cloudflare 403. So a candidate only counts if BOTH hold:
//     1. its feed yields items, and
//     2. a real article from that feed yields a usable body (>= 100 words)
//   Testing the feed alone would have admitted 6 hollow sources.
//
//   The extraction step reuses lib/fetch.mjs extractArticleBody, the same code
//   the live pipeline uses, so a pass here means a pass there.
//
// Usage:
//   node tools/probe_new_sources.mjs            # probe the built-in candidate list
//   node tools/probe_new_sources.mjs --write    # append passers to config/sources.yaml
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { extractArticleBody } from '../lib/fetch.mjs';
import { cleanBody } from '../lib/normalize.mjs';

const CONFIG = resolve(import.meta.dirname, '../config/sources.yaml');
const WRITE = process.argv.includes('--write');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MIN_WORDS = 100;
const MIN_ITEMS = 3;
const TIMEOUT = 20000;

// Candidates not already in config/sources.yaml. Feed first, because a working
// feed is what the pipeline consumes; `gnews` proxies are listed where the
// outlet blocks direct fetching (ittefaq works that way today).
const CANDIDATES = [
  { id: 'somoy-news', nameBn: 'সময় নিউজ', nameEn: 'Somoy News', home: 'https://dailymailbd.com/', feed: 'https://dailymailbd.com/feed' },
  { id: 'zamanbarta', nameBn: 'জামানবর্তা', nameEn: 'Zamanbarta', home: 'https://zamanbarta.net/', feed: 'https://zamanbarta.net/feed' },
  { id: 'swabhumi', nameBn: 'স্বাভূমি', nameEn: 'Swabhumi', home: 'https://www.swabhumi.com/', feed: 'https://www.swabhumi.com/feed' },
  { id: 'sankha', nameBn: 'সংবাপ্ত্র', nameEn: 'Sankha', home: 'https://www.sankhanews.com/', feed: 'https://www.sankhanews.com/feed' },
  { id: 'mshrtv', nameBn: 'মশির টিভি', nameEn: 'Mishir TV', home: 'https://mshr.tv/', feed: 'https://mshr.tv/feed' },
  { id: 'sportsbangla', nameBn: 'স্পোর্টসবাংলা', nameEn: 'Sportsbangla', home: 'https://sportsbangla.com/', feed: 'https://sportsbangla.com/feed' },
  { id: 'risingbd', nameBn: 'রাইজিংবিড', nameEn: 'Risingbd', home: 'https://www.risingbd.com/', feed: 'https://www.risingbd.com/feed' },
  { id: 'khobor', nameBn: 'খবর', nameEn: 'Khobor', home: 'https://www.khobor.net/', feed: 'https://www.khobor.net/feed' },
  { id: 'gono-tajmin', nameBn: 'গণো তাজমিন', nameEn: 'Daily Gano Tajmin', home: 'https://www.dailyganotajmin.com/', feed: 'https://www.dailyganotajmin.com/feed' },
  { id: 'dbnews', nameBn: 'ডিবি নিউজ', nameEn: 'DB News', home: 'https://www.dbnews.info/', feed: 'https://www.dbnews.info/rss.xml' },
  { id: 'balikadhape', nameBn: 'বালিকা ধাপে', nameEn: 'Balika Dape', home: 'https://www.balikadape.org/', feed: 'https://www.balikadape.org/feed' },
  { id: 'daily-sun', nameBn: 'দৈনিক সান', nameEn: 'Daily Sun', home: 'https://dailysun.com.bd/', feed: 'https://dailysun.com.bd/feed' },
  { id: 'newagebd', nameBn: 'নিউ এজ', nameEn: 'New Age', home: 'https://www.newagebd.net/', feed: 'https://www.newagebd.net/rss.xml' },
  { id: 'bssnews', nameBn: 'বাংলাদেশ সংবাদ সংস্থা', nameEn: 'BSS', home: 'https://www.bssnews.net/', feed: 'https://www.bssnews.net/rss' },
  { id: 'thenation', nameBn: 'দ্য নেশন', nameEn: 'The Nation', home: 'https://www.thenation.com.bd/', feed: 'https://www.thenation.com.bd/feed' },
  { id: 'inewsbd', nameBn: 'আই নিউজ', nameEn: 'iNews', home: 'https://www.inewsbd.com/', feed: 'https://www.inewsbd.com/feed' },
  { id: 'ntvnewsbd', nameBn: 'এনটিভি', nameEn: 'NTV', home: 'https://ntvnewsbd.com/', feed: 'https://ntvnewsbd.com/feed' },
  { id: 'ekattor', nameBn: 'একাত্তর', nameEn: 'Ekattor', home: 'https://ekattornews.com/', feed: 'https://ekattornews.com/feed' },
  { id: 'gtrends-24', nameBn: 'গ্লোবাল ট্রেন্ডস', nameEn: 'Global Trends', home: 'https://gtrends24.net/', feed: 'https://gtrends24.net/feed' },
  { id: 'purbokalpa', nameBn: 'পূর্বকল্প', nameEn: 'Purbokalpa', home: 'https://purbokalpa.com/', feed: 'https://purbokalpa.com/feed' },
  { id: 'somoytv', nameBn: 'সময় টিভি', nameEn: 'Somoy TV', home: 'https://www.somoytv.com/', feed: 'https://www.somoytv.com/rss' },
  { id: 'amitv', nameBn: 'আমি টিভি', nameEn: 'Ami TV', home: 'https://amitv.com.bd/', feed: 'https://amitv.com.bd/feed' },
  { id: 'prothomalo-en', nameBn: 'প্রথম আলো ইংরেজি', nameEn: 'Prothom Alo English', home: 'https://en.prothomalo.com/', feed: 'https://en.prothomalo.com/feed' },
  { id: 'bbc-bengali-com', nameBn: 'বিবিসি বাংলা', nameEn: 'BBC News Bengali', home: 'https://www.bbc.com/bengali', feed: 'https://feeds.bbci.co.uk/bengali/rss.xml' },
  { id: 'wsh', nameBn: 'বিশ্ব সংবাদ', nameEn: 'World Something', home: 'https://wsh.com/', feed: 'https://wsh.com/feed' },
  { id: 'digitalnewsbd', nameBn: 'ডিজিটাল নিউজ', nameEn: 'Digital News', home: 'https://www.digitalnewsbd.com/', feed: 'https://www.digitalnewsbd.com/feed' },
  { id: 'lalonnews', nameBn: 'লালন নিউজ', nameEn: 'Lalon News', home: 'https://lalonnews.com/', feed: 'https://lalonnews.com/feed' },
  { id: 'sholaynews', nameBn: 'শোলায় নিউজ', nameEn: 'Sholay News', home: 'https://sholaynews24.com/', feed: 'https://sholaynews24.com/feed' },
];

const parser = new Parser({
  timeout: TIMEOUT,
  headers: { 'user-agent': UA, 'accept-language': 'bn,en;q=0.8' },
  customFields: { item: ['description'] },
});

const words = (s) => String(s ?? '').split(/\s+/).filter((w) => /[\u0980-\u09FFA-Za-z0-9]/u.test(w)).length;

const fetchText = async (url) => {
  const r = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'bn,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT),
  });
  return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : '' };
};

const existing = new Set(
  [...readFileSync(CONFIG, 'utf8').matchAll(/^\s*-\s*id:\s*(\S+)\s*$/gm)].map((m) => m[1]),
);

console.log(`probing ${CANDIDATES.length} candidates (feed AND article extraction must both pass)\n`);
console.log('id                   feed  items  HTTP  words  verdict');
console.log('-'.repeat(64));

const passed = [];
const rows = [];
for (const c of CANDIDATES) {
  if (existing.has(c.id)) {
    rows.push({ ...c, verdict: 'already configured' });
    continue;
  }
  let items = 0;
  let firstLink = null;
  let feedUrl = c.feed;
  // A guessed /feed path is wrong far more often than a site simply has no RSS.
  // Ask the homepage which feed it declares, and only fall back to the guess.
  try {
    const home = await fetchText(c.home);
    if (home.ok) {
      const $h = cheerio.load(home.text);
      const declared = $h('link[type*="rss"], link[type*="atom"]').map((_, el) => $(el).attr('href')).get().filter(Boolean);
      for (const href of declared) {
        try {
          const abs = new URL(href, c.home).toString();
          const f = await parser.parseURL(abs);
          if ((f.items?.length ?? 0) >= MIN_ITEMS) { feedUrl = abs; break; }
        } catch { /* try the next declared feed */ }
      }
    }
  } catch { /* homepage unreachable; the guessed feed is all we have */ }
  try {
    const feed = await parser.parseURL(feedUrl);
    items = feed.items?.length ?? 0;
    firstLink = feed.items?.[0]?.link ?? null;
  } catch {
    rows.push({ ...c, items: 0, status: 0, w: 0, verdict: 'feed unreachable' });
    console.log(
      `  ${c.id.padEnd(19)}${'--'.padStart(4)}${String(items).padStart(6)}${'--'.padStart(6)}${'--'.padStart(6)}   feed unreachable`,
    );
    continue;
  }

  if (items < MIN_ITEMS) {
    rows.push({ ...c, items, status: 0, w: 0, verdict: `feed too small (${items})` });
    console.log(`  ${c.id.padEnd(19)}${'--'.padStart(4)}${String(items).padStart(6)}${'--'.padStart(6)}${'--'.padStart(6)}   feed too small (${items} items)`);
    continue;
  }

  // The part that matters: can we actually read the article?
  let status = 0;
  let w = 0;
  try {
    const { ok, status: st, text } = await fetchText(firstLink);
    status = st;
    if (ok) w = words(cleanBody(extractArticleBody(cheerio.load(text)) || ''));
  } catch {
    status = 'ERR';
  }

  const verdict = w >= MIN_WORDS ? 'USABLE' : status === 403 ? 'blocked (cloudflare)' : 'hollow (200, no text)';
  rows.push({ ...c, items, status, w, verdict });
  console.log(
    `  ${c.id.padEnd(19)}${'ok'.padStart(4)}${String(items).padStart(6)}${String(status).padStart(6)}${String(w).padStart(6)}   ${verdict}`,
  );
  if (w >= MIN_WORDS) passed.push(c);
}

console.log('');
console.log(`  USABLE: ${passed.length} — ${passed.map((p) => p.id).join(', ') || '(none)'}`);
const blocked = rows.filter((r) => r.verdict?.includes('blocked'));
const hollow = rows.filter((r) => r.verdict?.includes('hollow'));
console.log(`  blocked by cloudflare: ${blocked.length} — ${blocked.map((r) => r.id).join(', ') || '(none)'}`);
console.log(`  hollow: ${hollow.length} — ${hollow.map((r) => r.id).join(', ') || '(none)'}`);

if (WRITE && passed.length) {
  const block = passed
    .map(
      (c) => `
  - id: ${c.id}
    nameBn: ${c.nameBn}
    nameEn: ${c.nameEn}
    lang: bn
    method: rss
    feed: ${c.feed}
    home: ${c.home}
    reputation: standard
    note: "2026-09-26 probe: feed OK, article extraction verified (>=100 words)."`
    )
    .join('\n');
  appendFileSync(CONFIG, block);
  console.log(`\nappended ${passed.length} sources to ${CONFIG}`);
} else if (!WRITE) {
  console.log('\nDRY RUN — add --write to append the usable ones to config/sources.yaml');
}
