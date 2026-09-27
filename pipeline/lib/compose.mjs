// Deterministic Bengali news composer.
//
// 2026-09-27. Three author configurations in a row (big-pickle with the full
// prompt, space-bunny with the full prompt, space-bunny with the minimal
// prompt) all failed the same way: 6/6 stories rejected, MECHANICAL_AUDIT_FAILED
// plus PROMPT_LEAKED, bodies ~150 words against a 180 minimum. Supply was never
// the problem - 1,023 usable items/day and 58 eligible briefs were waiting.
//
// So the body is composed here, in code, from the brief's own member leads.
//
// THE ONE RULE: every sentence below is copied from, or mechanically normalised
// out of, a real member lead. Nothing is inferred, nothing is summarised into
// prose that a source did not already say, and no adjective is added. When the
// evidence is thin the article is short - `composedShort` reports that instead
// of padding, because a padded 180-word story is a fabricated 180-word story.
//
// The mechanical audit is a contract, not an obstacle, and each rule below
// names the rule it satisfies:
//   c5  no outlet name in body          -> stripOutlet()
//   c7  no editorial/draft footer       -> footer phrases stripped
//   c8  plain lead first, এক নজরে for 3+ sources -> shape below
//   c9  body length inside the band     -> fillToBand()
//   c10 no raw URL, no সূত্র: in body    -> stripUrls(), drop attribution tails
//   n14 no English month/number         -> toBengaliDigits(), MONTHS
//   rep1 lead must not restate headline, paragraphs must not restate the lead,
//        bullets must be distinct        -> pickLead(), distinctBy()

import { BANNED_OUTLET_NAMES } from './audit.mjs';
import {
  lengthForMode,
  publicationMode,
  minPublishWords,
  richSourceRule,
  richSourceThresholds,
} from './editorial.mjs';

/** An article shorter than this is not an article. 2026-09-27: a 50-150 band let
 *  31- and 39-word bodies through, because the floor was derived from the band
 *  (min-20 = 30) instead of from what a reader would accept. */
export const MIN_ARTICLE_WORDS = minPublishWords();

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];

const MONTHS = [
  ['January', 'জানুয়ারি'], ['February', 'ফেব্রুয়ারি'], ['March', 'মার্চ'],
  ['April', 'এপ্রিল'], ['May', 'মে'], ['June', 'জুন'], ['July', 'জুলাই'],
  ['August', 'আগস্ট'], ['September', 'সেপ্টেম্বর'], ['October', 'অক্টোবর'],
  ['November', 'নভেম্বর'], ['December', 'ডিসেম্বর'],
];

// Case-insensitive outlet names + the bare outlet slugs we fetch, so a tail
// like "… বিস্ফোরণ jugantor.com" loses both the brand and the domain.
const OUTLET_TAIL = BANNED_OUTLET_NAMES.map((n) => [n, new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gu')]);

export function toBengaliDigits(s) {
  return String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function stripUrls(s) {
  return String(s ?? '')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/\bwww\.\S+/gu, ' ')
    .replace(/\b[a-z0-9-]+\.(?:com|net|org|bd|co\.uk)\S*/giu, ' ');
}

function stripOutlet(s) {
  let out = String(s ?? '');
  // a trailing "… headline <outlet><domain>" that RSS appends to the lead
  for (const [name, re] of OUTLET_TAIL) out = out.replace(re, ' ');
  out = out.replace(/\b(jugantor|prothomalo|banglatribune|kalerkantho|bdnews24|bd24live|samakal|ittefaq|channeli|jamuna|dailystar|dhakatribune|daily-observer|dainikbangla|atnbangla|tbs|voa-bangla|bbc-bengali|guardian-world|dainikazadi|deshrupantor)\b/giu, ' ');
  return out;
}

// 2026-09-27. These patterns were all written with \b, and \b in JavaScript is
// defined on [A-Za-z0-9_] - so `\bএই\s*সাইট\b` can never match, because the
// character before "এই" is not an ASCII word character. Every Bengali editorial
// tail in this list was dead code that still looked like a filter. No \b here.
const EDITORIAL_TAIL = [
  /click here/giu, /read (?:more|the full)/giu, /follow us/giu,
  /এই\s*প্রবন্ধটি\s*পড়ুন/gu, /এই\s*সাইট/gu, /সম্পাদক\s*:/gu,
  /দেখুন/gu, /আরও\s*পড়ুন/gu, /সূত্রে/gu, /সূত্র\s*[:：]/gu,
  /\bdraft\b/giu, /\bTODO\b/gu, /\bplaceholder\b/giu,
];

/** Raw lead -> clean Bengali prose sentence fragments. Never invents text. */
export function cleanEvidence(raw) {
  let s = String(raw ?? '');
  s = s
    .replace(/&lt;/giu, '<').replace(/&gt;/giu, '>').replace(/&quot;/giu, '"')
    .replace(/&#0?39;|&apos;|&nbsp;/giu, "' ").replace(/&amp;/giu, '&')
    .replace(/&#8217;|&rsquo;/giu, '’').replace(/<[^>]*>/gu, ' ')
    .replace(/\s+/gu, ' ');
  s = stripUrls(s);
  s = stripOutlet(s);
  for (const [en, bn] of MONTHS) s = s.replace(new RegExp(en, 'giu'), bn);
  s = s.replace(/\b(AM|PM|a\.m\.|p\.m\.)\b/giu, (m) => (/a/i.test(m) ? 'সকাল' : 'বিকাল'));
  for (const re of EDITORIAL_TAIL) s = s.replace(re, ' ');
  s = toBengaliDigits(s);
  s = s.replace(/\s*([।?!])\s*/gu, '$1 ');
  s = s.replace(/[ \t]{2,}/gu, ' ').replace(/\s+([।?!])/gu, '$1').trim();
  // feeds truncate mid-word; drop dangling fragments
  s = s.replace(/[^।?!\s]+$/u, (m) => (m.length >= 12 ? m : '')).trim();
  return s;
}

export function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[।?!])\s+/u)
    .map((s) => s.trim())
    // a feed that truncated mid-clause leaves a fragment starting with a
    // dangling comma or full stop - "… জানা গেছে। , দুদক জানায়, এক আইনজীবী…" -
    // which then surfaces as an excerpt that opens with ". "
    .map((s) => s.replace(/^[\s.,;:।?!-]+/u, '').trim())
    .filter((s) => s.length >= 25);
}


function tokensOf(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^\u0980-\u09FF\s]/gu, ' ')
    .split(/\s+/u)
    .filter((w) => w.length > 1);
}

function overlapRatio(a, b) {
  const A = new Set(tokensOf(a));
  const B = new Set(tokensOf(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return hit / Math.min(A.size, B.size);
}

// A feed lead is a truncated wire copy, so the pool is full of tails: "এ হিসাব
// আজ শুক্রবার সকাল আটটা থেকে...". A sentence that does not end on a
// terminator was cut mid-clause by the feed, so it can never open a story.
const COMPLETE = /[।?!]$/u;

// A wire lead cut mid-copy often opens with a back-reference whose antecedent
// was in the part we never got ("তাঁদের মধ্যে সুস্থ হয়ে..." - among whom?).
// Grammatical, complete, and useless as an opening, so it is not a lead.
const DANGLING_START = /^(তাঁদের|তাদের|তারা|এরা|ওদের|ওরা|তাঁর|তার|তিনি|তিনিগণ|সেই|ওই|এই|উপরে|এর\s)/u;

/** rep1: the lead must add a concrete fact the headline does not have. */
function pickLead(cands, headline) {
  const H = new Set(tokensOf(headline));
  const HC = new Set((String(headline).match(/[০-৯০-৯]+|হাজার|লাখ|কোটি|শতাংশ|টাকা|জন|টি|বছর|দিন|ঘণ্টা/gu) || []));
  let best = null;
  let bestScore = -Infinity;
  for (const s of cands) {
    const T = tokensOf(s);
    if (T.length < 8) continue;
    if (DANGLING_START.test(s)) continue;
    const overlap = H.size ? T.filter((t) => H.has(t)).length / H.size : 0;
    // rep1 fires when every headline token appears in the lead AND the lead adds
    // no new number/quantity. So require a concrete token the headline lacks -
    // that alone makes the repetition impossible.
    const novel = (String(s).match(/[০-৯০-৯]+|হাজার|লাখ|কোটি|শতাংশ|টাকা|জন|টি|বছর|দিন|ঘণ্টা/gu) || []).filter((x) => !HC.has(x));
    const complete = COMPLETE.test(s) ? 2 : 0;
    const sized = s.length >= 60 && s.length <= 260 ? 1 : 0;
    const score = (novel.length ? 3 : 0) + complete * 2 + sized - overlap * 2;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  if (best) return best;
  const usable = cands.filter((s) => COMPLETE.test(s) && !DANGLING_START.test(s));
  return usable.sort((a, b) => b.length - a.length)[0] || cands[0] || '';
}

/** rep1: bullets must be mutually distinct (overlap <= 0.7). */
function distinctBy(cands, limit) {
  const out = [];
  for (const s of cands) {
    if (out.length >= limit) break;
    if (s.length < 20) continue;
    if (out.some((b) => overlapRatio(b, s) > 0.7)) continue;
    out.push(s);
  }
  return out;
}

export function bnWordCount(text) {
  return String(text ?? '').replace(/[A-Za-z0-9]/g, ' ').trim().split(/\s+/u).filter(Boolean).length;
}

/** c9: top up from real sentences only; never invent filler. */
function fillToBand(paras, pool, { min }) {
  const out = [...paras];
  const all = pool.length ? pool : paras;
  let guard = 0;
  while (bnWordCount(out.join('\n\n')) < min && guard < 200) {
    const next = all[guard];
    if (!next) break;
    if (out.some((p) => overlapRatio(p, next) > 0.6)) { guard++; continue; }
    out.push(next);
    guard++;
  }
  return { paras: out };
}

/** A bullet is a point, not a paragraph. Keep the clause carrying the fact. */
function shorten(s) {
  const w = String(s ?? '').split(/\s+/u);
  return w.length <= 14 ? String(s ?? '').trim() : w.slice(0, 14).join(' ') + '…';
}

/**
 * Assemble blocks under a hard ceiling.
 *
 * 2026-09-27: trimming only the মূল খবর paragraphs left the body at 224-269
 * words against a 50-150 band, because the lead and the এক নজরে bullets were
 * never counted against the ceiling - 25 articles rejected c9 "too long" on a
 * band the composer had itself chosen. Blocks are now admitted one at a time
 * and a block that would overflow is dropped whole; paragraphs are never cut
 * mid-sentence, which would leave a dangling clause.
 */
function assemble(lead, bullets, mainParas, { min, max }) {
  const ceiling = max + 40;
  const count = (arr) => bnWordCount(arr.join('\n\n'));

  const blocks = [lead].filter(Boolean);
  if (count(blocks) > ceiling) {
    // even the lead alone overflows this band: the brief is longer than the
    // band, not the other way round. Report it rather than mangling the lead.
    return { blocks, bulletsUsed: false, overflow: true };
  }

  // c8 requires এক নজরে once a brief has 3+ members, so the bullets are not the
  // first thing to go when space runs short - they are reserved, and the
  // মূল খবর paragraphs take what is left.
  let bulletsUsed = false;
  if (bullets.length) {
    const withBullets = count([...blocks, ...bullets]);
    if (withBullets <= ceiling) {
      blocks.push(...bullets);
      bulletsUsed = true;
    }
  }

  for (const p of mainParas) {
    if (count([...blocks, p]) > ceiling) break;
    blocks.push(p);
  }

  return { blocks, bulletsUsed, overflow: false };
}

function buildWithBand(brief, pool, srcCount, band) {
  const { min, max } = band;
  const headline = brief?.headline ?? '';
  const lead = pickLead(pool, headline);
  const rest = pool.filter((s) => s !== lead);

  const candBullets = distinctBy(rest, 3).map((b) => shorten(b.replace(/[।?!]\s*$/u, '').trim()));
  const bodySents = rest.filter((s) => !candBullets.includes(s));
  const { paras } = fillToBand(bodySents.length ? bodySents : rest, pool, band);
  const mainParas = paras
    .filter((p) => p && p.length > 30)
    .filter((p) => !lead || overlapRatio(p, lead) <= 0.6)
    .map((p) => p.replace(/[।?!]\s*$/u, '').trim())
    .filter(Boolean);

  const { blocks, bulletsUsed } = assemble(lead, candBullets, mainParas, band);

  const parts = [];
  if (lead) parts.push(lead);
  if (bulletsUsed) parts.push(`**এক নজরে**\n${candBullets.map((b) => `- ${b}`).join('\n')}`);
  const keptMain = blocks.filter((b) => b !== lead && !candBullets.includes(b));
  // No "মূল খবর" heading. It is on GENERIC_HEADINGS in publication-gate.mjs, so a
  // bold "**মূল খবর**" line fails ARTIFICIAL_GENERIC_HEADING - scaffolding that
  // adds nothing for a reader. repetitionViolations() still treats every
  // paragraph after the lead as body text, so dropping the heading costs the
  // rep1 check nothing. "এক নজরে" is not on that list and is required by c8.
  if (keptMain.length) parts.push(keptMain.join('\n\n'));

  const body = parts.filter(Boolean).join('\n\n').trim();
  const words = bnWordCount(body);
  return {
    body,
    min,
    max,
    words,
    short: words < Math.max(min - 20, MIN_ARTICLE_WORDS),
    tooLong: words > max + 40,
  };
}

/**
 * c9 has a floor and a ceiling, and a brief's aspirational band is often
 * unreachable from the evidence that actually exists. Padding to reach it would
 * be fabrication, so instead the band steps to what the real sentences support
 * - 100-180, then 50-150 - and the article is published at its true length with
 * the reading time the site computes from it. The floor that must never be
 * crossed is 50 words: below that there is no story.
 *
 * 2026-09-27: 66 of 108 composed bodies failed c9 on length alone, every one of
 * them because the band wanted more words than the sources provided.
 */
function fitBand(brief, srcCount, pool, preferred) {
  // 2026-09-27: a 50-150 rung is dead weight. The finalizer's body-substance floor
  // is max(minPublishWords=150, rich-source), so no band topping out below 150 can
  // ever publish - 4 of 6 picked stories were approved here and then rejected
  // BODY_SUBSTANCE_BLOCKED at 104-133 words. Bands are floored at the real floor.
  const ladder = [preferred, { min: 150, max: 250, tier: 'short' }, { min: 150, max: 320, tier: 'normal' }].map(
    (b) => (b.max < MIN_ARTICLE_WORDS ? { min: MIN_ARTICLE_WORDS, max: MIN_ARTICLE_WORDS + 120, tier: b.tier } : b),
  );
  let best = null;
  for (const band of ladder) {
    const r = buildWithBand(brief, pool, srcCount, band);
    if (!r.short && !r.tooLong) return r;
    // keep whichever attempt is closest to legal, to report if none succeed
    const slack = (x) => (x.tooLong ? x.words - (x.max + 40) : x.short ? x.min - 20 - x.words : 0);
    if (!best || slack(r) < slack(best)) best = r;
  }
  return best;
}

/**
 * Compose a publishable Bengali body from a brief.
 * Returns { body, min, max, words, short, tooLong, poolSize } - `short` means
 * the real evidence could not reach even the 50-word floor, which the caller
 * must treat as a thin brief rather than something to pad.
 */
export function composeBody(brief, bandOverride) {
  // mechanicalAudit() counts MEMBERS, not sources (audit.mjs:195), so the
  // composer must count members too or the এক নজরে rule disagrees with itself:
  // the writer sees 2 sources and skips the bullets, the gate sees 3 members and
  // fails c8 'এক নজরে key points missing'. Same brief, two different counts.
  const srcCount = (brief?.members ?? []).length || (brief?.sources ?? []).length || 1;

  // pool: every real sentence, deduped across sources (the same wire story is
  // often carried by five outlets, and repeating it is rep1, not reporting)
  const seen = new Set();
  const pool = [];
  for (const m of brief?.members ?? []) {
    for (const s of sentences(cleanEvidence(m.lead))) {
      const k = tokensOf(s).slice(0, 12).join(' ');
      if (!k || seen.has(k)) continue;
      seen.add(k);
      pool.push(s);
    }
  }

  // 2026-09-27: the finalizer's substance floor is max(minPublishWords, rich), so
  // a brief whose sources each carry a full article (2 x 250+ words) must be
  // written to 250+ even when the length band says less. national-137 composed at
  // 237 words and was rejected BODY_SUBSTANCE_BLOCKED for a floor the band never
  // mentioned. The band and the floor are now the same number.
  const rich = richSourceRule(brief, richSourceThresholds());
  const base = bandOverride ?? lengthForMode(publicationMode(brief), srcCount, brief);
  const preferred = rich.requiredWords > base.min
    ? { ...base, min: Math.max(base.min, rich.requiredWords), max: Math.max(base.max, rich.requiredWords + 60) }
    : base;
  const r = fitBand(brief, srcCount, pool, preferred);
  return { ...r, poolSize: pool.length };
}
