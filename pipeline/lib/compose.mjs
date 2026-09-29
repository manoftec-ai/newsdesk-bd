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
import { proseProblem } from './prose.mjs';
import {
  bodyWordCount,
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

// 2026-09-27: BANNED_OUTLET_NAMES is Bengali-only, so the English brand leaked
// straight through - "হামের উপসর্গে আরও ৪ শিশুর মৃত্যু Dhaka Tribune" was
// published with the masthead as the last two words of a sentence. An RSS lead
// routinely appends the English name where the Bengali one would have gone.
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, String.raw`\const ENGLISH_OUTLETS = [`);

const ENGLISH_OUTLETS = [
  'Dhaka Tribune', 'The Daily Star', 'Daily Star', 'Prothom Alo', 'The Independent',
  'The Business Standard', 'TBS News', 'The Guardian', 'Reuters', 'AP', 'AFP',
  'UNB', 'BBC News', 'Al Jazeera', 'New Age', 'The Daily Observer', 'Observer',
  'BD News24', 'news24', 'Channel i', 'Jamuna TV', 'ATN Bangla', 'GTV', 'BTV',
  'Voice of America', 'VOA', 'CNN', 'Bloomberg', 'Financial Express', 'FE News',
  'The Telegraph', 'Telegraph', 'Dhaka Courier', 'The Independentbd', 'Ispahani',
];

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
  for (const name of ENGLISH_OUTLETS) {
    out = out.replace(new RegExp(escapeRe(name), 'giu'), ' ');
  }
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
    .filter((s) => s.length >= 25)
    // 2026-09-27: 24 published articles carried the website's own furniture
    // into the body - menu rows, "প্রকাশিত :" bylines, "ছবি:" credits. The
    // composer accepted any 25+ character run as a sentence, and a fetched page
    // (21 of 59, 36%) is mostly not prose. Rejected here rather than downstream.
    .filter((s) => proseProblem(s) === null);
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
// 2026-09-27: added the discourse connectors as well. "তবে সেই অর্থ তার কাছে
// পৌঁছানো হয়নি…" is grammatical and useless as an opening - "তবে" (but)
// refers back to a clause the truncated feed never delivered.
// A paragraph that opens mid-thought is a continuation, not a paragraph. The RSS
// lead is cut at arbitrary offsets, so "আর নিশ্চিত হামে মৃত্যু ১০১ জনের।" survives
// as a standalone line. Same rule as the lead, applied to the body.
// 2026-07-27. A press-conference wire feed arrives chopped into sentences, so
// the pool is full of tails whose antecedent was in the part we never got:
// national-553 published "পরে তার দেওয়া তথ্যের ভিত্তিতে…", "এর আগে সম্প্রতি…",
// "আমরা তো এই ৩ দাবিতে…" and "ওই ভিডিওতে…" as standalone paragraphs. Measured
// across the corpus: 20 articles, 30 such paragraphs, and national-553 is the
// second worst. The clause they refer to is gone, so they cannot be repaired -
// only refused.
const CONTINUATION_START = /^(আর|এবং|ও|তবে|অথচ|ফলে|তাই|তাইলে|কিন্তু|যা|যার|যারা|সেই|এই|অর্থাৎ|অন্যদিকে|অপরদিকে|এরপর|তারপর|পরে|এখানে|সেখানে|পরে তার|এর আগে|আমরা তো|ওই|তখন|এই মুহূর্তে|এর মধ্যে|এর বদলে|সেখানে)/u;

const DANGLING_START = /^(তাঁদের|তাদের|তারা|এরা|ওদের|ওরা|তাঁর|তার|তিনি|তিনিগণ|সেই|ওই|এই|উপরে|এর\s|তবে|অথচ|তাই|ফলে|তাইলে|অর্থাৎ|যদিও|যদি|এখানে|সেখানে|তখন|এরপর|তারপর|অন্যদিকে|অপরদিকে)/u;

/**
 * Pick the lede.
 *
 * rep1 forbids a lead that restates the headline AND adds no new fact, so the
 * requirement is not "differ from the headline" - it is "match the headline and
 * add something". Scoring for *low* overlap, as this did at first,
 * over-corrected: national-578 opened on "হাসপাতালে ভর্তির পর শুরুতে বেড না
 * পাওয়ায়…", a true sentence from the same article that says nothing about the
 * story.
 *
 * So the lead is the sentence that best matches the headline. When that
 * sentence restates the headline completely - which is what a real lede does,
 * and which rep1 penalises - a second real sentence carrying a fresh fact is
 * appended. That is how a news lede is actually written: the statement, then the
 * detail that is not in the headline. Nothing is invented; both sentences are
 * source text.
 */
function pickLead(cands, headline) {
  const H = new Set(tokensOf(headline));
  const facts = (s) =>
    (String(s).match(/[০-৯০-৯]+|হাজার|লাখ|কোটি|শতাংশ|টাকা|জন|টি|বছর|দিন|ঘণ্টা/gu) ?? []);
  const HC = new Set(facts(String(headline)));

  const usable = cands.filter((s) => {
    if (tokensOf(s).length < 8) return false;
    return !DANGLING_START.test(s);
  });
  if (!usable.length) return { lead: cands[0] ?? '', support: '' };

  const score = (s, i) => {
    const T = tokensOf(s);
    const overlap = H.size ? T.filter((t) => H.has(t)).length / H.size : 0;
    const novel = facts(s).filter((x) => !HC.has(x));
    const complete = COMPLETE.test(s) ? 2 : 0;
    const sized = s.length >= 60 && s.length <= 300 ? 1 : 0;
    const early = i < 3 ? 1.5 : 0; // a journalistic lede comes first
    return { overlap, novel, total: overlap * 4 + complete * 2 + sized + early + novel.length };
  };

  const ranked = usable
    .map((s, i) => ({ s, ...score(s, i) }))
    .sort((a, b) => b.total - a.total);

  const primary = ranked[0];
  // rep1 fires at coverage >= 0.75 with no new fact: add one
  const repeats = primary.overlap >= 0.75 && primary.novel.length === 0;
  if (!repeats) return { lead: primary.s, support: '' };

  const support = ranked.find((r) => r.s !== primary.s && r.novel.length > 0);
  return { lead: primary.s, support: support ? support.s : '' };
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
function fillToBand(paras, pool, { min }, skip = new Set()) {
  const out = [...paras];
  // never re-add a sentence already used as a bullet: otherwise the bullet and
  // the fact it was cut from both appear, which is how
  // "১৫ মার্চ থেকে এ পর্যন্ত… মোট ৯৫৬ জন" showed up as a bullet AND the last
  // paragraph
  const all = (pool.length ? pool : paras).filter((p) => !skip.has(p));
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

/**
 * A paragraph ends the way a Bengali sentence ends. Stripping the terminal
 * দাঁড়ি left 22 of 23 paragraphs in national-202 finishing mid-word - "ে",
 * "ন", "ু" - which is ungrammatical and reads as machine output no matter how
 * good the source text is. A paragraph that does not already end in punctuation
 * gets a দাঁড়ি; one that was cut off mid-word is dropped rather than repaired,
 * because guessing the missing ending invents text.
 */
function closeParagraph(text) {
  const t = String(text ?? '').trim();
  if (!t) return '';
  if (/[।?!]$/u.test(t)) return t;
  // ends mid-word: the feed truncated it, so the ending is unknown
  if (!/[ঀ-৿]$/u.test(t)) return t;
  const words = t.split(/\s+/u);
  const last = words[words.length - 1] ?? '';
  if (last.length < 4) return '';
  return `${t}।`;
}

/**
 * Group sentences into paragraphs. One sentence per paragraph reads as a
 * sitemap; two to three reads as an article. Breaks are placed after a sentence
 * that ends a thought, never mid-sentence, and a paragraph is not allowed to
 * grow past a readable length.
 */
function groupIntoParagraphs(sentences, { maxWords = 55, targetSentences = 3 } = {}) {
  const paras = [];
  let current = [];
  for (const s of sentences) {
    current.push(s);
    const words = current.join(' ').split(/\s+/u).filter(Boolean).length;
    if (current.length >= targetSentences || words >= maxWords) {
      const closed = closeParagraph(current.join(' '));
      if (closed) paras.push(closed);
      current = [];
    }
  }
  if (current.length) {
    const closed = closeParagraph(current.join(' '));
    if (closed) paras.push(closed);
  }
  return paras;
}

/**
 * Narrative order: what happened first, then the detail, then background.
 * Sentences are ranked by how much of the headline they carry, with sentences
 * that add a new fact placed early, so the article degrades into context rather
 * than wandering.
 */
function orderForNarrative(sentences, headline) {
  const H = new Set(tokensOf(headline));
  const facts = (s) =>
    (String(s).match(/[০-৯০-৯]+|হাজার|লাখ|কোটি|শতাংশ|টাকা|জন|টি|বছর|দিন|ঘণ্টা/gu) ?? []);
  return sentences
    .map((s, i) => {
      const T = tokensOf(s);
      const overlap = H.size ? T.filter((t) => H.has(t)).length / H.size : 0;
      return { s, i, overlap, novel: facts(s).length, words: T.length };
    })
    .sort((a, b) => {
      if (Math.abs(b.overlap - a.overlap) > 0.15) return b.overlap - a.overlap;
      if (a.novel !== b.novel) return b.novel - a.novel;
      return a.i - b.i; // otherwise keep source order
    })
    .map((x) => x.s);
}

/**
 * Drop paragraphs that say something already said.
 *
 * 2026-07-27. national-553 stated the same fact in seven near-identical
 * paragraphs - the DMP press conference was reported by five outlets, and the
 * composer wrote each outlet's version rather than one of them. Measured across
 * the corpus: 26 articles, 76 such pairs, national-332 worst with 10. Reading
 * that, a reader concludes seven separate things happened.
 */
function dedupeParagraphs(paras) {
  const out = [];
  for (const p of paras) {
    if (out.some((q) => overlapRatio(q, p) > 0.6)) continue;
    out.push(p);
  }
  return out;
}

/** A bullet is a point, not a truncated clause. Cutting a long sentence at 14
 * words leaves "…জগন্নাথ বিশ্ববিদ্যালয়", so only sentences that are already
 * short enough are used, and the tail is trimmed at a clause boundary
 * (comma, colon, or a connective) rather than mid-word.
 */
function asBullet(sentence, maxWords = 16) {
  const words = String(sentence ?? '').split(/\s+/u).filter(Boolean);
  if (!words.length) return '';
  if (words.length <= maxWords) return sentence.replace(/[।?!]\s*$/u, '').trim();
  // find the last clause boundary within the budget
  const CONNECTIVE = /^(এবং|ও|যা|যার|যারা|এই|সেই|তবে|অথচ|এর|কিন্তু)$/u;
  let cut = -1;
  for (let i = Math.min(words.length, maxWords); i > 4; i--) {
    // cut after punctuation, never after a connective that needs a following clause
    if (/[,;:]$/u.test(words[i - 1])) { cut = i; break; }
    if (CONNECTIVE.test(words[i])) { cut = i; break; }
  }
  while (cut > 4 && CONNECTIVE.test(words[cut - 1])) cut--;
  if (cut < 5) return ''; // no clean boundary: not a point
  return words.slice(0, cut).join(' ').replace(/[,;:]\s*$/u, '').trim();
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
function assemble(lede, bullets, mainParas, { min, max }) {
  const ceiling = max + 40;
  const count = (arr) => bnWordCount(arr.join('\n\n'));

  const blocks = [lede].filter(Boolean);
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

  // Filter the SENTENCE POOL, not the assembled paragraphs. Filtering afterwards
  // left national-202 at 121 words against a 150 floor: the filters removed the
  // sub-headings and continuation fragments, then fillToBand refilled from the
  // same pool and hit them again. Clean the pool once and the word budget is
  // reachable from prose that actually survives.
  //
  // A Bengali paragraph carries a finite verb; an in-article sub-heading
  // ("হামের উপসর্গে আরও ৪ শিশুর মৃত্যু", 35 characters) does not. The verb list
  // cannot be complete - first-person narrative is legitimate prose and
  // "পড়েছি", "করেছি", "বলেছিলেন" are all verbs - so a long sentence is trusted
  // even without a match. An enumeration of verbs was discarding whole
  // first-person profiles, which are exactly the briefs that read worst.
  const FINITE =
    /(হয়েছে|হয়েছেন|হয়েছি|হয়|হবে|হয়ে|করে|করেছে|করেছি|করেছেন|করি|করছে|করছিল|করা|জানায়|জানিয়েছেন|জানিয়ে|বলে|বলেন|বলেছে|বলেছিলেন|বলছে|দিয়ে|দেন|দিয়েছেন|দেওয়া|থেকে|নেই|আছে|ছিল|ছিলেন|ছিলাম|পেয়েছেন|নিয়েছেন|পড়েছি|পড়েছেন|পড়ছি|পড়ছেন|থাকে|থাকেন|হিসেবে|প্রকাশ)/u;
  const cleanPool = pool.filter(
    (p) =>
      p.length >= 45 &&
      (FINITE.test(p) || p.length >= 80) &&
      !CONTINUATION_START.test(p) &&
      !DANGLING_START.test(p) &&
      proseProblem(p) === null,
  );
  const usable = cleanPool.length >= 4 ? cleanPool : pool;

  const { lead, support } = pickLead(usable, headline);
  const lede = support ? `${lead} ${support}` : lead;
  const rest = usable.filter((s) => !lede.includes(s));
  const ordered = orderForNarrative(rest, headline);

  // asBullet() strips the terminal punctuation, so the bullet text is not equal
  // to its parent sentence - matching on the bullet string let both the bullet
  // and the same fact reappear as the first body paragraph.
  const bulletPairs = [];
  for (const s of distinctBy(ordered, 3)) {
    const bullet = asBullet(s);
    if (bullet) bulletPairs.push({ bullet, source: s });
    if (bulletPairs.length === 3) break;
  }
  const candBullets = bulletPairs.map((x) => x.bullet);
  const used = new Set(bulletPairs.map((x) => x.source));
  const bodySents = ordered.filter((s) => !used.has(s));

  const { paras } = fillToBand(bodySents, usable, band, used);
  // rep1: a paragraph that mostly re-states the lead adds nothing for a reader
  // 2026-09-27: a sub-heading inside the article ("হামের উপসর্গে আরও ৪ শিশুর মৃত্যু" -
  // 35 characters, no finite verb) was published as its own paragraph. A Bengali
  // paragraph carries a verb; a heading does not.
  const mainParas = dedupeParagraphs(
    paras
      .filter((p) => p && p.length >= 55)
      // 2026-09-29: dedupe against the FULL lede (lead + support sentence),
      // not the lead alone. The audit measures repetition against the emitted
      // first paragraph, so a body para overlapping only the support sentence
      // slipped through here and fired rep1/c14 downstream (national-679).
      .filter((p) => !lede || overlapRatio(p, lede) <= 0.6),
  );

  // 2026-09-29 self-heal: drop what the audit's c14 would flag, using the
  // audit's own rule (content-token overlap >0.65 with >=8 shared tokens, on
  // the smaller side), so the composer never ships a body it knows fails.
  // Only removes duplication — never invents, never pads. A body left too
  // short is reported short below; padding with near-dupes is what tripped
  // c14 on wire-overlap stories (national-681: bullet block vs body para
  // restating the same wire fact). Bullets win over body paras (c8 requires
  // the section for 3+ members); among bullets the first wins.
  const auditTokens = (s) =>
    new Set(
      String(s ?? '')
        .toLowerCase()
        .replace(/[^\u0980-\u09FF\s]/gu, ' ')
        .split(/\s+/u)
        .filter((w) => w.length > 2),
    );
  const isDup = (a, b) => {
    const ta = auditTokens(a), tb = auditTokens(b);
    if (ta.size < 4 || tb.size < 4) return false;
    let hit = 0;
    for (const w of ta) if (tb.has(w)) hit++;
    return hit / Math.min(ta.size, tb.size) > 0.65 && hit >= 8;
  };
  const healBullets = [];
  for (const b of candBullets) {
    if (healBullets.some((k) => isDup(b, k))) continue;
    healBullets.push(b);
  }
  const bulletBlock = healBullets.join('\n');
  const healParas = mainParas.filter((p) => !isDup(p, lede) && (healBullets.length === 0 || !isDup(p, bulletBlock)));

  const { blocks, bulletsUsed } = assemble(lede, healBullets, healParas, band);

  const parts = [];
  if (lede) parts.push(closeParagraph(lede));
  if (bulletsUsed) parts.push(`**এক নজরে**\n${healBullets.map((b) => `- ${b}`).join('\n')}`);

  const keptMain = blocks.filter((b) => b !== lede && !healBullets.includes(b));
  // No "মূল খবর" heading: it is on GENERIC_HEADINGS in publication-gate.mjs, so a
  // bold "**মূল খবর**" line fails ARTIFICIAL_GENERIC_HEADING. "এক নজরে" is not
  // on that list and is required by c8 once a brief has 3+ members.
  if (keptMain.length) parts.push(keptMain.join('\n\n'));

  const body = parts.filter(Boolean).join('\n\n').trim();
  // Count words the way tools/finalize_stories.mjs does, not the way the audit
  // does. bnWordCount() discards Latin runs and digits; bodyWordCount() keeps
  // them, so the two disagreed by ~10% and a body the composer scored at 100 came
  // back as 91 and was rejected BODY_SUBSTANCE_BLOCKED. The composer has to
  // measure with the grader's ruler.
  const words = bodyWordCount(body);
  return {
    body,
    min,
    max,
    words,
    // The band's own tolerance is not the floor. A band can bottom out at
    // min-20 = 16 words, and a 59-word body was passing as "not short" - it then
    // reached the finalizer and came back BODY_SUBSTANCE_BLOCKED. The floor is
    // the publish floor, measured with the grader's own counter.
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
