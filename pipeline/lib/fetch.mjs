// lib/fetch.mjs — fetching: RSS via rss-parser; HTML scraper via cheerio.
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { normalizeTitle, urlHash, cleanBody, parseDate, isBoilerplateTitle } from './normalize.mjs';
import { decodeGoogleNewsUrl, stripSourceFromTitle } from '../tools/tracked_watcher.mjs';

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';
const TIMEOUT_MS = 25000;
const ARTICLE_TIMEOUT_MS = 12000;
const SCRAPE_MAX_ARTICLES = 15;
// Skip non-news entry points on scraper homepages
const NON_NEWS_PATH = /\/video\/|\/gallery\/|\/photostory\/|\/photos?\//i;

async function get(url, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA, accept: '*/*' } });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text, headers: res.headers };
  } finally { clearTimeout(t); }
}

// ---------- RSS ----------
export async function fetchRss(source) {
  const parser = new Parser({ timeout: TIMEOUT_MS, headers: { 'user-agent': UA } });
  const feed = await parser.parseURL(source.feed);
  const items = [];
  for (const it of feed.items.slice(0, 60)) {
    const title = normalizeTitle(it.title || '');
    const url = (it.link || '').trim();
    if (!title || !url) continue;
    if (isBoilerplateTitle(title)) continue;
    const body = cleanBody(it.contentSnippet || it.content || it.summary || '');
    let category = null;
    if (it.categories && it.categories[0] !== undefined) {
      const c = it.categories[0];
      category = typeof c === 'object' && c !== null ? String(c._ ?? c['#text'] ?? '') : String(c);
      if (!category) category = null;
    }
    items.push({
      source_id: source.id,
      url,
      url_hash: urlHash(url),
      title,
      body,
      published_at: parseDate(it.isoDate || it.pubDate),
      seen_at: new Date().toISOString(),
      category,
      lang: source.lang,
    });
  }
  return { items, feedMeta: { title: feed.title, etag: null, modified: null } };
}

// ---------- HTML scraper (generic; per-source refinements later) ----------
function sameOrigin(a, b) {
  try { return new URL(a, b).origin === new URL(b).origin; } catch { return false; }
}

function extractArticleMeta($, u) {
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDesc = $('meta[property="og:description"]').attr('content') || '';
  const ogTime = $('meta[property="article:published_time"]').attr('content') ||
    $('meta[property="og:updated_time"]').attr('content') || '';
  const h1 = $('h1').first().text();
  const timeAttr = $('time[datetime]').first().attr('datetime') || '';
  let body = '';
  const art = $('article').first();
  if (art.length) {
    art.find('h1,h2,script,style,nav,button,.ad,.ads,.social').remove();
    body = cleanBody(art.find('p').map((_, el) => $(el).text()).get().join(' '));
  }
  if (!body) body = cleanBody($('main .content p, .article-content p, .post-content p').map((_, el) => $(el).text()).get().join(' '));
  if (!body) body = cleanBody($('p').map((_, el) => $(el).text()).get().join(' '));
  return {
    title: normalizeTitle(ogTitle || h1 || ''),
    body,
    published_at: parseDate(ogTime || timeAttr),
    excerpt: cleanBody(ogDesc),
  };
}

export async function fetchScraper(source) {
  const home = await get(source.home);
  if (!home.ok) throw new Error(`${source.id}: HTTP ${home.status}`);
  const $ = cheerio.load(home.text);
  const candidates = [];
  const seen = new Set();
  for (const el of $('a[href]')) {
    const a = $(el);
    const href = a.attr('href');
    if (!href) continue;
    const abs = new URL(href, source.home).href;
    if (seen.has(abs) || !sameOrigin(abs, source.home)) continue;
    if (NON_NEWS_PATH.test(abs)) continue;
    const text = normalizeTitle(a.text());
    if (text.length < 25 || text.length > 200) continue;
    if (isBoilerplateTitle(text)) continue;
    // Prefer headline-looking anchors (inside h2/h3 or with heading classes)
    const inHeading = a.parents('h1,h2,h3,h4').length > 0 || /title|headline/i.test(a.attr('class') || '');
    seen.add(abs);
    candidates.push({ abs, text, inHeading, weight: inHeading ? 2 : 1 });
  }
  candidates.sort((x, y) => y.weight - x.weight || x.abs.length - y.abs.length);
  const chosen = candidates.slice(0, SCRAPE_MAX_ARTICLES);
  const items = [];
  for (const c of chosen) {
    const page = await get(c.abs, ARTICLE_TIMEOUT_MS);
    if (!page.ok) continue;
    const $art = cheerio.load(page.text);
    const m = extractArticleMeta($art, c.abs);
    const title = m.title || c.text;
    const body = m.body || m.excerpt || '';
    await new Promise((r) => setTimeout(r, 300)); // politeness between article fetches
    items.push({
      source_id: source.id,
      url: c.abs,
      url_hash: urlHash(c.abs),
      title,
      body,
      published_at: m.published_at,
      seen_at: new Date().toISOString(),
      category: null,
      lang: source.lang,
    });
  }
  return { items, feedMeta: { title: null, etag: null, modified: null } };
}

export async function fetchSource(source) {
  if (source.method === 'rss') return fetchRss(source);
  if (source.method === 'scraper') return fetchScraper(source);
  if (source.method === 'gnews') return fetchGnews(source);
  if (source.method === 'gtrends') return fetchGTrends(source);
  throw new Error(`${source.id}: unsupported method ${source.method}`);
}

// ---------- Google News proxy (bypasses HTTP 403 bot-protection on runner) ----------
// Feed is a news.google.com/rss/search?q=site:<outlet> URL. Items are decoded to the
// real article URL and titles get the trailing " - Outlet" suffix stripped.
const GNEWS_ITEMS_MAX = 60;

async function parseGnewsUrl(source) {
  const parser = new Parser({ timeout: TIMEOUT_MS, headers: { 'user-agent': UA } });
  const feed = await parser.parseURL(source.feed);
  const items = [];
  for (const it of feed.items.slice(0, GNEWS_ITEMS_MAX)) {
    const rawTitle = String(it.title ?? '').trim();
    const link = String(it.link ?? '').trim();
    if (!rawTitle || !link) continue;
    const url = decodeGoogleNewsUrl(link);
    if (!url || !/^https?:/.test(url)) continue;
    const title = normalizeTitle(stripSourceFromTitle(rawTitle));
    if (!title || isBoilerplateTitle(title)) continue;
    // Drop homepage/epaper prints that Google News site: search surfaces
    if (/\|\|| \| |epaper|e-paper|\|\s*$/.test(rawTitle.toLowerCase())) continue;
    items.push({
      source_id: source.id,
      url,
      url_hash: urlHash(url),
      title,
      body: cleanBody(it.contentSnippet || ''),
      published_at: parseDate(it.isoDate || it.pubDate),
      seen_at: new Date().toISOString(),
      category: null,
      lang: source.lang,
    });
  }
  return { items, feedMeta: { title: feed.title, etag: null, modified: null } };
}

// ---------- Google Trends lead engine ----------
// Reads Google Trends RSS for BD, then for each trending term runs a Google News
// search (bn/BD). Items are re-attributed to the real outlet's source_id when the
// decoded URL host matches a known outlet, so verify treats them as that paper.
const KNOWN_OUTLETS = new Map([
  ['prothomalo.com', 'prothomalo'], ['ittefaq.com.bd', 'ittefaq'],
  ['kalerkantho.com', 'kalerkantho'], ['jugantor.com', 'jugantor'],
  ['samakal.com', 'samakal'], ['dainikbangla.com.bd', 'dainikbangla'],
  ['dhakatribune.com', 'dhakatribune'], ['thedailystar.net', 'dailystar'],
  ['banglatribune.com', 'banglatribune'], ['bdnews24.com', 'bdnews24'],
  ['theindependentbd.com', 'independent'], ['deshrupantor.com', 'deshrupantor'],
  ['jamuna.tv', 'jamuna'], ['atnbangla.tv', 'atnbangla'],
  ['channelionline.com', 'channeli'], ['tbsnews.net', 'tbs'],
  ['bbc.com', 'bbc-bengali'], ['voabangla.com', 'voa-bangla'],
  ['observerbd.com', 'daily-observer'], ['bd24live.com', 'bd24live'],
  ['dainikazadi.net', 'dainikazadi'], ['theguardian.com', 'guardian-world'],
]);

async function parseGnewsSearch(query) {
  const url = `https://news.google.com/rss/search?${new URLSearchParams({
    q: query, hl: 'bn', gl: 'BD', ceid: 'BD:bn',
  })}`;
  const parser = new Parser({ timeout: TIMEOUT_MS, headers: { 'user-agent': UA } });
  const feed = await parser.parseURL(url);
  const out = [];
  for (const it of feed.items.slice(0, 15)) {
    const rawTitle = String(it.title ?? '').trim();
    const link = String(it.link ?? '').trim();
    if (!rawTitle || !link) continue;
    // Google News put the outlet in the trailing " - host" part of the title;
    // use that to pick the known source and get the real headline.
    const m = rawTitle.match(/^(.*?)\s*-\s*([A-Za-z0-9][A-Za-z0-9.-]*\.(?:com|net|bd|tv|org))\s*$/);
    if (!m) continue;
    const outlet = m[2].toLowerCase();
    let srcId = null;
    for (const [host, id] of KNOWN_OUTLETS) if (outlet.endsWith(host.replace(/^www\./, ''))) { srcId = id; break; }
    if (!srcId) continue;
    const title = normalizeTitle(m[1]);
    if (!title || isBoilerplateTitle(title)) continue;
    if (/\|\|| \| |epaper|e-paper|\|\s*$/.test(rawTitle.toLowerCase())) continue;
    const real = decodeGoogleNewsUrl(link);
    out.push({
      source_id: srcId,
      real: /^https?:/.test(real) ? real : link,
      title,
      snippet: cleanBody(it.contentSnippet || ''),
      published_at: parseDate(it.isoDate || it.pubDate),
    });
  }
  return out;
}

async function fetchGTrends(source) {
  const parser = new Parser({ timeout: TIMEOUT_MS, headers: { 'user-agent': UA } });
  const feed = await parser.parseURL(source.feed);
  const topics = feed.items.slice(0, source.limit ?? 10);
  const seen = new Set();
  const items = [];
  let queries = 0;
  for (const topic of topics) {
    const term = String(topic.title ?? '').trim();
    if (term.length < 3 || seen.has(term)) continue;
    seen.add(term);
    if (queries++ >= (source.queries ?? 6)) break;
    try {
      const hits = await parseGnewsSearch(term);
      for (const h of hits) {
        if (!h.snippet && !h.title) continue;
        items.push({
          source_id: h.source_id,
          url: h.real,
          url_hash: urlHash(h.real),
          title: h.title,
          body: h.snippet,
          published_at: h.published_at,
          seen_at: new Date().toISOString(),
          category: null,
          lang: h.title.match(/[\u0900-\u097F]/) ? 'bn' : 'en',
          trendQuery: term,
        });
      }
    } catch { /* one failing search must not kill the engine */ }
  }
  return { items, feedMeta: { title: feed.title, etag: null, modified: null } };
}

export async function fetchGnews(source) {
  return parseGnewsUrl(source);
}