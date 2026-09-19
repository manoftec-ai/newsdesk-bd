#!/usr/bin/env node
// probe_feeds.mjs — READ-ONLY probe of candidate news sources & official channels.
// Phase 1: for each site, (a) fetch homepage, (b) discover RSS/Atom feed links from HTML,
// (c) try common feed paths when none found in HTML, (d) validate candidate feeds,
// (e) record reachability + method hint. No writes to any website. Results → tmp/probe_report.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const PROBE_FILE = resolve(import.meta.dirname, '../tmp/probe_report.json');
const TIMEOUT_MS = 20000;
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';

const SOURCES = [
  { id: 'prothomalo',   nameBn: 'প্রথম আলো',       home: 'https://www.prothomalo.com/' },
  { id: 'ittefaq',      nameBn: 'দৈনিক ইত্তেফাক',  home: 'https://www.ittefaq.com.bd/' },
  { id: 'kalerkantho',  nameBn: 'কালের কণ্ঠ',      home: 'https://www.kalerkantho.com/' },
  { id: 'jugantor',     nameBn: 'যুগান্তর',        home: 'https://www.jugantor.com/' },
  { id: 'samakal',      nameBn: 'সমকাল',           home: 'https://www.samakal.com/' },
  { id: 'dainikbangla', nameBn: 'দৈনিক বাংলা',     home: 'https://www.dainikbangla.com.bd/' },
  { id: 'dhakatribune', nameBn: 'ঢাকা ট্রিবিউন',   home: 'https://www.dhakatribune.com/' },
  { id: 'dailystar',    nameBn: 'ডেইলি স্টার',     home: 'https://www.thedailystar.net/' },
  { id: 'banglatribune', nameBn: 'বাংলা ট্রিবিউন', home: 'https://www.banglatribune.com/' },
  { id: 'bdnews24',     nameBn: 'বিডিনিউজ২৪',      home: 'https://bangla.bdnews24.com/' },
  { id: 'independent',  nameBn: 'দ্য ইন্ডিপেন্ডেন্ট', home: 'https://www.theindependentbd.com/' },
  { id: 'deshrupantor', nameBn: 'দেশ রূপান্তর',    home: 'https://www.deshrupantor.com/' },
  { id: 'jamuna',       nameBn: 'জামুনা টিভি',     home: 'https://www.jamuna.tv/' },
  { id: 'atnbangla',    nameBn: 'এটিএন বাংলা',     home: 'https://www.atnbanglatv.com/' },
  { id: 'channeli',     nameBn: 'চ্যানেল আই',      home: 'https://www.channelionline.com/' },
];

const OFFICIALS = [
  { id: 'fire_service', name: 'Bangladesh Fire Service & Civil Defence', home: 'https://fireservice.gov.bd/' },
  { id: 'police',       name: 'Bangladesh Police',                       home: 'https://www.police.gov.bd/' },
  { id: 'dmp',          name: 'Dhaka Metropolitan Police',               home: 'https://dmp.gov.bd/' },
  { id: 'bmd',          name: 'Bangladesh Meteorological Department',    home: 'https://www.bmd.gov.bd/' },
  { id: 'bbs',          name: 'Bangladesh Bureau of Statistics',         home: 'https://www.bbs.gov.bd/' },
  { id: 'pid',          name: 'Press Information Department',            home: 'https://www.pid.gov.bd/' },
  { id: 'pmo',          name: "Prime Minister's Office",                 home: 'https://www.pmo.gov.bd/' },
  { id: 'btrc',         name: 'BTRC',                                    home: 'https://www.btrc.gov.bd/' },
  { id: 'dghs',         name: 'DG Health Services',                      home: 'https://dghs.gov.bd/' },
  { id: 'nbr',          name: 'National Board of Revenue',               home: 'https://www.nbr.gov.bd/' },
];

const COMMON_FEED_PATHS = ['/feed', '/feeds', '/rss', '/rss.xml', '/feed.xml', '/atom', '/atom.xml', '/?feed=rss'];

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: '*/*' } });
    const text = await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url, type: (res.headers.get('content-type') || '').toLowerCase(), text };
  } catch (err) {
    return { ok: false, status: 0, finalUrl: url, type: '', text: '', error: err.cause?.code || err.message };
  } finally {
    clearTimeout(t);
  }
}

function discoverFeedLinks(html, baseUrl) {
  const out = new Set();
  // <link rel="alternate" type="application/rss+xml" href="...">
  const re = /<link\b[^>]*>/gi;
  const m = html.matchAll(re);
  for (const tag of m) {
    const t = tag[0];
    const typeM = t.match(/type\s*=\s*["']application\/(rss|atom)\+xml["']/i);
    if (!typeM) continue;
    const hrefM = t.match(/href\s*=\s*["']([^"']+)["']/i);
    if (hrefM) out.add(hrefM[1]);
  }
  // also RSS URLs referenced as plain anchors (common on BD sites)
  const re2 = /href\s*=\s*["']([^"']*(?:rss|feed|atom)[^"']*)["']/gi;
  const m2 = html.matchAll(re2);
  for (const tag of m2) {
    const href = tag[1].toLowerCase();
    if (/\.(rss|xml|atom)$|rss|feed|atom/.test(href) && !/^\s*$/.test(href)) {
      if (href.startsWith('http')) out.add(tag[1]);
      else out.add(new URL(tag[1], baseUrl).href);
    }
  }
  return [...out];
}

function guessFeedUrls(homeUrl) {
  const u = new URL(homeUrl);
  return COMMON_FEED_PATHS.map((p) => new URL(p, u.origin).href);
}

function looksLikeFeed(text, type) {
  return /<rss[ >]|<feed[ >]|<rdf:RDF|<\?xml/.test(text) && /<item>|<entry>|<item\s|<entry\s/.test(text);
}

function inspectFeed(text) {
  const items = [...text.matchAll(/<(item|entry)\b[^>]*>.*?<\/\1>/gis)];
  const titles = [];
  for (const it of items.slice(0, 3)) {
    const t = it[0].match(/<(?:title|media:title)\b[^>]*>(.*?)<\/\1>/is);
    if (t) titles.push(t[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim().slice(0, 90));
  }
  return { tag: items[0]?.[1] || (text.includes('<item>') ? 'rss' : 'atom'), itemCount: items.length, sampleTitles: titles };
}

async function probeSite(entry) {
  const r = { id: entry.id, name: entry.nameBn || entry.name, home: entry.home, homeReachable: false, httpStatus: 0, feeds: [], note: '' };
  const home = await fetchWithTimeout(entry.home);
  r.httpStatus = home.status;
  if (!home.ok || home.status >= 400 || !home.text) {
    r.note = home.error || `HTTP ${home.status}`;
    return r;
  }
  r.homeReachable = true;
  const found = discoverFeedLinks(home.text, entry.home);
  const candidates = [...new Set([...found, ...guessFeedUrls(entry.home)])].slice(0, 12);
  const seen = new Set();
  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    const fr = await fetchWithTimeout(url);
    if (!fr.ok) continue;
    if (!looksLikeFeed(fr.text, fr.type)) continue;
    const insp = inspectFeed(fr.text);
    r.feeds.push({ url, status: fr.status, type: fr.type.split(';')[0] || '', tag: insp.tag, itemCount: insp.itemCount, sampleTitles: insp.sampleTitles });
    break; // first valid feed per site is enough for the probe
  }
  if (r.feeds.length === 0) r.note = 'no feed discovered (scraper likely)';
  return r;
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), sources: [], officials: [] };
  for (const s of SOURCES) { report.sources.push(await probeSite(s)); console.log('probed source', s.id); }
  for (const o of OFFICIALS) { report.officials.push(await probeSite(o)); console.log('probed official', o.id); }
  mkdirSync(dirname(PROBE_FILE), { recursive: true });
  writeFileSync(PROBE_FILE, JSON.stringify(report, null, 2));
  console.log('\nProbe report written →', PROBE_FILE);
}

main().catch((e) => { console.error(e); process.exit(1); });