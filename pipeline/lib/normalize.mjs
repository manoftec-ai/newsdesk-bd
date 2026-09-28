// lib/normalize.mjs — text cleaning, hashing, similarity (no external NLP deps)
import { createHash } from 'node:crypto';

const BN_BOILERPLATE = new Set([
  'সবশেষ', 'আরো পড়ুন', 'আরও পড়ুন', 'বিস্তারিত', 'ভিডিও', 'ছবি', 'ফটো',
  'সাক্ষাৎকার', 'বিশেষ সংবাদ', 'মতামত', 'সম্পাদকীয়', 'লেখা', 'প্রতিবেদন', 'লাইভ',
]);

const NAV_KEYWORDS = ['login', 'signin', 'signup', 'register', 'privacy', 'terms', 'about-us',
  'advertise', 'contact', 'career', 'press', 'ফেসবুক', 'টুইটার', 'ইউটিউব'];

// Collapse whitespace, normalize bengali unicode, lowercase latin, remove emojis/symbols.
export function normalizeTitle(t) {
  return (t ?? '')
    .replace(/[\u200b\u200c\u200d\ufeff]/g, '')       // zero-width + BOM
    .replace(/\s+/g, ' ')
    .replace(/[\u{1F600}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '') // emojis/symbols
    .trim();
}

export function urlHash(url) {
  return createHash('sha1').update(url).digest('hex');
}

const HTML_ENTITIES = {
  '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'",
  '&nbsp;': ' ', '&amp;': '&',
};

// Decode HTML entities (named + decimal/hex numeric) in one left-to-right
// pass. 2026-09-28: extractor output reached brief leads with escaped markup
// still in it (`&lt;p&gt;...`, national-251 prothomalo member) because
// cleanBody stripped literal `<...>` tags but never decoded entities first,
// so `&lt;p&gt;` survived as visible text all the way to the brief JSON.
// Decoding before tag-stripping turns those into real tags the next step
// removes. Single-pass alternation keeps `&amp;lt;` correct (yields literal
// `&lt;` text, not a tag).
export function decodeEntities(text) {
  return String(text ?? '').replace(
    /&(lt|gt|quot|apos|nbsp|amp);|&#(\d+);|&#x([0-9a-f]+);/giu,
    (m, named, dec, hex) => {
      if (named) return HTML_ENTITIES[`&${named.toLowerCase()};`] ?? m;
      const code = dec ? Number(dec) : Number.parseInt(hex, 16);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    },
  );
}

export function cleanBody(text) {
  if (!text) return '';
  return decodeEntities(text)
    .replace(/<[^>]+>/g, ' ')               // strip leftover tags
    .replace(/\s+/g, ' ')
    .replace(/[\u{1F600}-\u{1FAFF}]/gu, '')
    .trim()
    .slice(0, 6000);
}

// Drop generic/navigation titles that are not real headlines.
export function isBoilerplateTitle(t) {
  const s = (t ?? '').trim();
  if (s.length < 12) return true;
  if (BN_BOILERPLATE.has(s)) return true;
  const lower = s.toLowerCase();
  return NAV_KEYWORDS.some((k) => lower.includes(k));
}

// Tokenize for similarity: Bengali words + latin words, lowercase.
// Keeps combining marks (virama ্ U+09CD, anusvara ং), ZWJ/ZWNJ inside words,
// so conjunct/anusvara words ("অপ্রতিম", "বাংলাদেশ") stay single tokens.
export function tokens(text) {
  return (text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}\p{M}\u200c\u200d]+/u)
    .filter((w) => w.length > 1);
}

// Dice coefficient on bigrams of tokens — good for near-duplicate title matching.
export function titleSimilarity(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const ga = new Set();
  for (let i = 0; i < ta.length - 1; i++) ga.add(ta[i] + ' ' + ta[i + 1]);
  let both = 0, total = 0;
  const gb = new Set();
  for (let i = 0; i < tb.length - 1; i++) gb.add(tb[i] + ' ' + tb[i + 1]);
  for (const g of ga) { if (gb.has(g)) both++; total++; }
  for (const g of gb) total++;
  return total === 0 ? 0 : (2 * both) / total;
}

export function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}