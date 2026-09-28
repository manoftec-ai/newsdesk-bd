// Extract the article body from a publisher page, and nothing else.
//
// 2026-07-27 -> corrected below. The first version of extractArticle() stripped
// <nav>/<header>/<footer> and then all remaining tags, and published the result
// as if it were prose. Measured: briefs whose lead came from a fetched page were
// 36% contaminated (21 of 59) while plain RSS leads were 0% (0 of 249), and 24
// live articles carried menu rows, "প্রকাশিত :" bylines or "ছবি:" credits.
// Worse, a page is not one story: bd24live's page for one article also contains
// "সম্পর্কিত" link farms, so a single member mixed three unrelated reports and
// national-578's lead became a sentence about a hospital bed.
//
// Tag-stripping cannot fix either problem, because the furniture is not in
// furniture tags. So the article is taken from scored paragraphs instead: news
// copy lives in <p>, and its paragraphs are long, Bengali, and full of sentence
// terminators, while menus and link farms are short and terminator-free.

import { proseProblem, hardChrome, looksLikeMenuRow, isNavList } from '../lib/prose.mjs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ENTITIES = {
  '&nbsp;': ' ', '&amp;': '&', '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&ldquo;': '"', '&rdquo;': '"', '&lsquo;': "'", '&rsquo;': "'", '&mdash;': '—',
  '&hellip;': '…', '&nbsp': ' ',
};

function decode(s) {
  let out = String(s ?? '');
  for (const [k, v] of Object.entries(ENTITIES)) out = out.split(k).join(v);
  return out.replace(/&[a-z#0-9]+;/giu, ' ').replace(/\s+/gu, ' ').trim();
}

const bengaliChars = (s) => (String(s).match(/[ঀ-৿]/g) ?? []).length;

/** Text nodes outside <p>: headlines, image captions, timestamps. */
function collectParagraphs(html) {
  const out = [];
  // <p>…</p>, including paragraphs that carry inline markup
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/giu;
  let m;
  while ((m = re.exec(html)) !== null) {
    const inner = m[1]
      .replace(/<br\s*\/?>/giu, ' ')
      .replace(/<[^>]*>/gu, ' ')
      .replace(/<!--[\s\S]*?-->/gu, ' ');
    const text = decode(inner);
    if (text) out.push({ text, kind: 'p' });
  }
  return out;
}

/**
 * Score a paragraph as news prose. Length and Bengali dominate; terminators
 * separate a sentence from a label; anything that looks like furniture is
 * rejected outright rather than scored.
 */
function scoreParagraph(text) {
  if (proseProblem(text) !== null) return -1;
  if (bengaliChars(text) < 40) return -1;
  if (/[।?!]/u.test(text) === false && text.length < 220) return -1; // a label
  const words = text.split(/\s+/u).filter(Boolean).length;
  if (words < 12) return -1;
  const terminators = (text.match(/[।?!]/gu) ?? []).length;
  // a real paragraph averages 15+ words per sentence
  const perSentence = terminators ? words / terminators : words;
  if (perSentence > 45) return -1; // run-on, probably concatenated link text
  return words + terminators * 6 + bengaliChars(text) / 40;
}

/**
 * Keep the longest run of consecutive good paragraphs. Article bodies are
 * contiguous; furniture and link farms sit between them, so a run beats a
 * global top-N that would splice unrelated stories together.
 *
 * maxGap lets the window survive a weak paragraph WITHOUT emitting it. That
 * distinction matters: scoreParagraph rejects anything under 12 words, and real
 * news copy contains one-sentence paragraphs, so a single short quote in the
 * middle of a story used to reset the run to zero and the body came back with
 * one paragraph. A run beats a global top-N for not splicing unrelated stories,
 * but on its own it was too brittle to cover a normal article.
 *
 * The gap may only ever be bridged by a WEAK paragraph, never by FURNITURE.
 * Furniture is a hard stop, because that is what actually separates two
 * unrelated stories on a page - bridging across it is how a digest's "আরও
 * পড়ুন" list gets spliced into the story above it.
 */
function longestRun(paragraphs, minScore, maxGap = 0) {
  const scored = paragraphs.map((p) => ({
    ...p,
    score: scoreParagraph(p.text),
    furniture: proseProblem(p.text) !== null,
  }));

  if (maxGap > 0) {
    let best = { start: 0, end: 0, len: 0 };
    let start = 0, gap = 0, len = 0;
    scored.forEach((p, i) => {
      const usable = p.score >= minScore && !p.furniture;
      if (usable) {
        if (len === 0) start = i;
        len++;
        gap = 0;
        if (len > best.len) best = { start, end: i + 1, len };
      } else if (len > 0 && !p.furniture && gap < maxGap) {
        gap++;
      } else {
        start = i + 1;
        gap = 0;
        len = 0;
      }
    });
    return scored.slice(best.start, best.end).filter((p) => p.score >= minScore && !p.furniture);
  }

  let best = { start: 0, len: 0, sum: 0 };
  let cur = { start: 0, len: 0, sum: 0 };
  scored.forEach((p, i) => {
    if (p.score >= minScore) {
      if (cur.len === 0) cur.start = i;
      cur.len++;
      cur.sum += p.score;
      if (cur.len > best.len) best = { ...cur };
    } else {
      cur = { start: i + 1, len: 0, sum: 0 };
    }
  });
  return scored.slice(best.start, best.start + best.len);
}

/** First paragraph is the lede; it must not start with a dangling reference. */
const DANGLING = /^(তবে|অথচ|তাই|ফলে|তাইলে|অর্থাৎ|যদিও|এই|সেই|ওই|এর\s|তাঁর|তার|তাঁদের|তাদের|তারা|এরা|উপরে)/u;

export async function extractArticle(url, { timeoutMs = 20000, minBengali = 400, maxGap = 2 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'bn,en;q=0.8',
      },
      signal: ctl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, why: `http-${res.status}` };
    const html = await res.text();

    const paragraphs = collectParagraphs(html);
    const good = longestRun(paragraphs, 25, maxGap);

    // prefer the run that actually opens the story over the largest run
    const leadIndex = good.findIndex((p) => !DANGLING.test(p.text));
    let chosen = good;
    if (leadIndex > 0) chosen = good.slice(leadIndex - 1);

    const text = chosen.map((p) => p.text).join('\n\n');
    const bengali = bengaliChars(text);
    if (bengali < minBengali) {
      return { ok: false, why: `no-article-run(bengali=${bengali},paras=${good.length}/${paragraphs.length})` };
    }
    return { ok: true, text: text.slice(0, 4000), paragraphs: chosen.length, bengali };
  } catch (err) {
    return { ok: false, why: err?.name === 'AbortError' ? 'timeout' : 'fetch-error' };
  } finally {
    clearTimeout(timer);
  }
}
