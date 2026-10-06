// lib/reader-proxy.mjs — reader fallback for bot-blocked publisher pages.
//
// WHY (2026-10-06): publisher sites answer HTTP 403 to GitHub-runner IPs
// (measured in one day: enrich_bodies 0/150 improved, resolve_sources 8/81
// texts recovered with 80x http-403), while the same URLs fetch fine from a
// residential IP. The pipeline starves: ~529 briefs under the 100-word
// evidence floor, auto-author picks 0, the live site goes quiet — with every
// job green. A text-reader proxy (Jina AI Reader, https://r.jina.ai/<url>)
// fetches the page from ITS servers and returns the publisher's own article
// as clean markdown, so attribution and the no-fabrication rule are
// unchanged. It is used ONLY as a fallback after the direct fetch fails or
// comes back thin — never as the primary path (rate limits + courtesy).
//
// Cost: the free anonymous tier works (verified 2026-10-06: a full Prothom
// Alo article, no key). If the anonymous tier ever rate-limits, set
// JINA_API_KEY (free at https://jina.ai) — workflows pass it through when
// present and this module sends it as `Authorization: Bearer` automatically.
// READER_PROXY=0 disables the fallback entirely (direct-only, old behaviour).

const READER_BASE = 'https://r.jina.ai/';
const TIMEOUT_MS_DEFAULT = 30000;
const MIN_RESPONSE_CHARS = 500;

export function readerEnabled() {
  return process.env.READER_PROXY !== '0';
}

export function readerUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null;
  return READER_BASE + url;
}

function bengaliChars(s) {
  const m = String(s ?? '').match(/[\u0980-\u09FF]/g);
  return m ? m.length : 0;
}

// Turn reader markdown into article prose. The reader prepends a preamble
// (Title: / URL Source: / Published Time: / Markdown Content:) followed by
// the article as markdown; navigation and boilerplate are already gone, so
// this only strips markdown syntax and drops non-prose lines.
function wordsOf(s) {
  return String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function titleFromReaderMarkdown(md) {
  if (typeof md !== 'string') return '';
  const m = md.match(/^title\s*:\s*(.+)$/im);
  return (m ? m[1] : '').trim();
}

// Guard against soft-404s: some outlets answer a bogus URL with a front
// page or another story (HTTP 200, real Bengali prose, wrong facts).
// Accept the proxied text only if its Title shares vocabulary with the
// headline we asked for. Missing titles on either side cannot be judged,
// so they pass — the evidence and publication gates still apply.
export function titleMatchesReader(expectedTitle, md, { minOverlap = 2 } = {}) {
  const got = titleFromReaderMarkdown(md);
  if (!expectedTitle || !got) return true;
  const toks = (s) =>
    new Set(
      String(s)
        .toLowerCase()
        .replace(/[।.,!?;:()"'“”‘’—–-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !/^\d+$/.test(w)),
    );
  const a = toks(expectedTitle);
  const b = toks(got);
  if (!a.size) return true;
  let overlap = 0;
  for (const w of a) if (b.has(w)) overlap++;
  return overlap >= Math.min(minOverlap, a.size);
}

// Turn reader markdown into article prose. The reader prepends a preamble
// (Title: / URL Source: / Published Time: / Markdown Content:) followed by
// the article as markdown; navigation and boilerplate are already gone, so
// this only strips markdown syntax and drops non-prose lines.
export function markdownToArticle(md, { minBengali = 400, minWords = 25, maxChars = 4000 } = {}) {
  if (typeof md !== 'string' || !md.trim()) return { ok: false, why: 'reader-empty' };
  const lines = md.split('\n');
  const marker = lines.findIndex((l) => l.trim().toLowerCase() === 'markdown content:');
  const body = marker >= 0 ? lines.slice(marker + 1) : lines;
  const paras = [];
  let buf = [];
  const flush = () => {
    const p = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (p) paras.push(p);
    buf = [];
  };
  for (const raw of body) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^!\[.*?\]\(.*?\)$/.test(line)) continue; // standalone image
    if (/^(title|url source|published time|images?|last updated)\s*:/i.test(line)) continue;
    if (/^https?:\/\/\S+$/.test(line)) continue; // bare URL line
    if (/^\|?[\s:|-]+\|[\s:|.-]*$/.test(line)) continue; // table separator
    let t = line
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^#{1,6}\s+/, '')
      .replace(/^>\s?/, '')
      .replace(/^[-*•‣]\s+/, '')
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      .trim();
    if (!t) continue;
    buf.push(t);
    if (/[।.!?।]$/.test(t) || t.length > 220) flush();
  }
  flush();
  // Navigation furniture (menus, calendars, link farms) arrives as short
  // fragments. A soft-404 front page passes the Bengali floor on furniture
  // alone (measured 2026-10-06: 2141 chars of kalerkantho menus), so keep
  // only paragraphs that read as prose: 8+ words, or a terminated sentence.
  const prose = paras.filter((p) => wordsOf(p) >= 8 || (/[।.!?…]$/.test(p) && wordsOf(p) >= 4));
  const text = prose.join('\n\n').slice(0, maxChars);
  const bengali = bengaliChars(text);
  const words = wordsOf(text);
  if (bengali < minBengali || words < minWords) {
    return { ok: false, why: `reader-thin(bengali=${bengali},words=${words},paras=${prose.length})`, text };
  }
  return { ok: true, text, paragraphs: prose.length, bengali, words, via: 'reader' };
}

export async function fetchViaReader(
  url,
  { timeoutMs = TIMEOUT_MS_DEFAULT, fetchImpl = fetch } = {},
) {
  const target = readerUrl(url);
  if (!target) return { ok: false, status: 0, text: '', why: 'reader-bad-url' };
  const headers = { Accept: 'text/markdown,text/plain,*/*', 'User-Agent': 'newsdesk-bd-reader/1' };
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(target, { headers, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return { ok: false, status: res.status, text: '', why: `reader-http-${res.status}` };
    const text = await res.text();
    if (text.length < MIN_RESPONSE_CHARS) {
      return { ok: false, status: res.status, text, why: `reader-thin-response(chars=${text.length})` };
    }
    return { ok: true, status: res.status, text, via: 'reader' };
  } catch (err) {
    return { ok: false, status: 0, text: '', why: err?.name === 'AbortError' ? 'reader-timeout' : 'reader-fetch-error' };
  } finally {
    clearTimeout(timer);
  }
}
