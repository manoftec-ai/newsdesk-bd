// lib/fetch.mjs — fetching: RSS via rss-parser; HTML scraper via cheerio.
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import { normalizeTitle, urlHash, cleanBody, parseDate, isBoilerplateTitle } from './normalize.mjs';

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
    items.push({
      source_id: source.id,
      url,
      url_hash: urlHash(url),
      title,
      body,
      published_at: parseDate(it.isoDate || it.pubDate),
      seen_at: new Date().toISOString(),
      category: (it.categories && it.categories[0]) || null,
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
  throw new Error(`${source.id}: unsupported method ${source.method}`);
}