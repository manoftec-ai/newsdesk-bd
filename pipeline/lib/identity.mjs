// lib/identity.mjs — Entity RESOLUTION for Bengali news (P0-10).
// Resolves the many surface spellings of the same actor to ONE canonical name:
//   এরদোগান ~ এরদোয়ান ~ আরদোয়ান   ->  এরদোয়ান
//   মার্ক সুজম্যান ~ Mark Suzman      ->  মার্ক সুজম্যান
//   শেখ হাসিনা vs "প্রধানমন্ত্রী"      ->  শেখ হাসিনা (honorific stripped when a name follows)
// Provides:
//   - normalizeName(s): strip honorifics/particles, collapse whitespace
//   - identityKey(s):   canonical identity for an actor mention (null if not resolvable)
//   - extractActors(text): candidate actor phrases (person/org) from Bengali prose
// Pure rules, zero ML — an ALIASES table (curated from real outlets) + structural cues.

const HONORIFICS = [
  'প্রধানমন্ত্রী', 'উপপ্রধানমন্ত্রী', 'প্রেসিডেন্ট', 'রাষ্ট্রপতি', 'স্পিকার', 'ডেপুটি স্পিকার',
  'মন্ত্রী', 'প্রতিমন্ত্রী', 'উপমন্ত্রী', 'পররাষ্ট্রমন্ত্রী', 'অর্থমন্ত্রী', 'স্বাস্থ্যমন্ত্রী',
  'আইনমন্ত্রী', 'তথ্যমন্ত্রী', 'বাণিজ্যমন্ত্রী', 'শিল্পমন্ত্রী', 'এমপি', 'সংসদ সদস্য',
  'সচিব', 'উপসচিব', 'মেয়র', 'পুলিশ কমিশনার', 'আইজিপি', 'এসপি', 'ওসি', 'কমিশনার',
  'অধ্যাপক', 'প্রফেসর', 'ডাক্তার', 'ডা.', 'ডাঃ', 'ডঃ', 'অধিনায়ক', 'কোচ', 'ম্যানেজার',
  'বিচারপতি', 'জেনারেল', 'মেজর', 'ক্যাপ্টেন', 'সেনাপতি', 'রাষ্ট্রদূত', 'সিইও', 'প্রধান নির্বাহী',
  'মুফতি', 'ইমাম', 'খেলোয়াড়', 'সাবেক', 'নবনিযুক্ত',
].sort((a, b) => b.length - a.length);

// Curated alias map: every key -> its canonical identity. Keys are exact-match
// normalized forms (see identityKey); values are the canonical display name.
// Seeded from patterns seen live in our own feeds/clusters (2026-09-24).
export const ALIASES = {
  'এরদোগান': 'রিসেপ তাইয়েপ এরদোয়ান',
  'এরদোয়ান': 'রিসেপ তাইয়েপ এরদোয়ান',
  'এরদোয়াগান': 'রিসেপ তাইয়েপ এরদোয়ান',
  'আরদোয়ান': 'রিসেপ তাইয়েপ এরদোয়ান',
  'এর্দোয়ান': 'রিসেপ তাইয়েপ এরদোয়ান',
  'মার্ক সুজম্যান': 'মার্ক সুজম্যান',
  'মার্ক সুজমান': 'মার্ক সুজম্যান',
  'সুজম্যান': 'মার্ক সুজম্যান',
  'সুজমান': 'মার্ক সুজম্যান',
  'শেখ হাসিনা': 'শেখ হাসিনা',
  'শেখ হাসিনা ওয়াজেদ': 'শেখ হাসিনা',
  'তারেক রহমান': 'তারেক রহমান',
  'ডোনাল্ড ট্রাম্প': 'ডোনাল্ড ট্রাম্প',
  'ট্রাম্প': 'ডোনাল্ড ট্রাম্প',
  'নরেন্দ্র মোদি': 'নরেন্দ্র মোদি',
  'মোদি': 'নরেন্দ্র মোদি',
  'ভ্লাদিমির পুতিন': 'ভ্লাদিমির পুতিন',
  'পুতিন': 'ভ্লাদিমির পুতিন',
  'বরিস জনসন': 'বরিস জনসন',
  'বাইডেন': 'জো বাইডেন',
  'জো বাইডেন': 'জো বাইডেন',
  'মার্ক সুজম্যান': 'মার্ক সুজম্যান',
  'মারিয়া': 'মারিয়া',
};

// Clean a mention: drop honorifics from either side, normalize whitespace and
// trailing/leading particles, strip middle dots/parentheses.
export function normalizeName(name) {
  // NFC composes য+়(U+09BC) into U+09DF so the DB text (composed) and our
  // rules (decomposed) are byte-identical for regex/alias matching
  let s = String(name ?? '').normalize('NFC').replace(/[\s\u00a0]+/g, ' ').replace(/['’‘"“”·•]/g, '').trim();
  for (const h of HONORIFICS) {
    const reStart = new RegExp(`^(?:${h}\\s+)`);
    if (reStart.test(s)) { s = s.replace(reStart, '').trim(); }
    const reEnd = new RegExp(`(?:\\s+${h})$`);
    if (reEnd.test(s)) { s = s.replace(reEnd, '').trim(); }
  }
  // dropped standalone particles "মি."/"শ্রী" etc.
  s = s.replace(/^(?:মি\.|মি |শ্রী |ড\.|ইং\.|জনাব|জনাবা|শ্রদ্ধেয়)\s*/u, '').trim();
  return s;
}

// CanonicBangla: true when the string actually carries a Bangla letter.
const BANGLA_RE = /[\u0980-\u09FF]/u;

// Canonical identity for a mention; null when it can't be resolved to anything
// name-like (numbers, bare honorifics, pure Latin/outlet mastheads).
export function identityKey(name) {
  const norm = normalizeName(name);
  if (!norm || norm.length < 3) return null;
  if (/[0-9০-৯]/.test(norm)) return null;
  if (!BANGLA_RE.test(norm)) return null;
  // punctuation (danda/comma/ellipsis/quotes) means it's a clause, not a name
  if (/[,\u09E4:;…"()\/\\|]/.test(norm)) return null;
  for (const rawAlias of Object.keys(ALIASES)) {
    // our literal may be decomposed while norm is NFC-composed — compare in NFC
    if (norm === rawAlias.normalize('NFC')) return ALIASES[rawAlias];
  }
  // an unrecognized multi-word human-format name still has an identity itself
  if (/^[\p{L}\p{M} .-]+$/u.test(norm) && /\p{L}{3}/u.test(norm.replace(/\s/g, ''))) return norm;
  return null;
}

// Actor-cue patterns that anchor an actor phrase in Bengali news prose.
const ACTOR_PATTERNS = [
  /([\p{L}\p{M} .-]{4,60}?)\s+(?:জানিয়েছে|জানান|জানায়|বলেছেন|বলে|বলেন|ঘোষণা দেন|দাবি করেন|দাবি করেছেন|স্বীকার করেন|সতর্ক করেন|আশা প্রকাশ করেন|উল্লেখ করেন|মন্তব্য করেন|প্রত্যাশা করেন|সমালোচনা করেন|নিশ্চিত করেন)/gu,
  /(?:অনুষ্ঠানে|বৈঠকে|সম্মেলনে|ভাষণে)\s+([\p{L}\p{M} .-]{4,60}?)\s+(?:বলেন|বলে|উল্লেখ)/gu,
  /(?:স্বরাষ্ট্রমন্ত্রী|পররাষ্ট্রমন্ত্রী|তথ্যমন্ত্রী|প্রধানমন্ত্রী|রাষ্ট্রদূত|কমিশনার|ডাক্তার|অধ্যাপক|উপদেষ্টা)\s+([\p{L}\p{M} .-]{4,60}?)(?=[\s,।])/gu,
];

// STRICT: only direct "X বলেন/জানিয়েছেন"-style attribution — the one structure
// whose subject is unambiguously the actor. Used for the actor REGISTRY where
// precision matters more than recall.
const STRICT_ACTOR_PATTERNS = [
  /([\p{L}\p{M} .-]{4,60}?)\s+(?:জানিয়েছে|জানান|জানায়|বলেছেন|বলে|বলেন|নিশ্চিত করেছেন|দাবি করেছেন)(?=[\s,।])/gu,
];

// Function words / generic nouns that never name a specific actor.
const FUNCTION_WORDS = new Set([
  'এতে', 'এক', 'একজন', 'একই', 'এমন', 'এর', 'সে', 'তিনি', 'তারা', 'তাদের', 'তার',
  'যারা', 'যে', 'কিছু', 'বেশ', 'খুব', 'হতে', 'থেকে', 'সঙ্গে', 'পর', 'আগে', 'যেখানে',
  'ওই', 'সেই', 'এই', 'নতুন', 'জানা', 'এখন', 'সম্প্রতি', 'গত', 'দুজনে', 'উভয়',
].map((w) => w.normalize('NFC')));

function guardPass(s) {
  const toks = s.split(/\s+/);
  if (toks.length > 6) return false;
  if (toks.length === 0) return false;
  if (toks.every((t) => FUNCTION_WORDS.has(t))) return false;
  if (maxSubstantiveLen(toks) < 4) return false;
  // passive/impersonal tails ("...হয়েছেন বলে জানা গেছে") are NOT actors.
  // NFC-normalize the pattern source so our decomposed literal and the composed
  // DB text (য় U+09DF) compare identically.
  const JUNK_PATTERN = /আহত হয়েছেন|পুলিশি হয়েছেন|হয়েছেন বলে|হয়েছে বলে|জানা গেছে|দেওয়ার|বহিষ্কার|সিদ্ধান্তটি|সাথে কথা|বিরুদ্ধে|প্রবাসী/.source.normalize('NFC');
  if (new RegExp(JUNK_PATTERN, 'u').test(s)) return false;
  return true;
}

const SENTENCE_RE = /([^।.!?\n]+[।.!?]?)/g;

// bangla-length of the LONGEST non-function token (name substance check)
function maxSubstantiveLen(toks) {
  let n = 0;
  for (const t of toks) {
    if (FUNCTION_WORDS.has(t)) continue;
    n = Math.max(n, [...t].length);
  }
  return n;
}

// Extract raw candidate actor phrases from text (deduped, order kept).
// strict=true: only unambiguous "X বলেন/জানিয়েছেন" attribution (registry-quality).
// Each pattern runs per SENTENCE so a match can't swallow text across the
// previous sentence's boundaries.
export function extractActors(text, { strict = false } = {}) {
  const patterns = strict ? STRICT_ACTOR_PATTERNS : ACTOR_PATTERNS;
  const found = new Set();        // raw mentions seen
  const foundCanon = new Set();   // identities seen (collapse honorific dupes)
  const out = [];
  const clean = (raw) => {
    let s = String(raw ?? '').normalize('NFC').replace(/[।;:]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/[.!?]+$/, '').trim();
    s = s.replace(/^(?:ও|এবং|তাই|অথবা)\s+/u, '').trim();
    // the ACTOR is the subject of the clause that contains the anchor verb;
    // anything before the last comma belongs to an earlier clause — drop it
    const lastComma = s.lastIndexOf(',');
    if (lastComma >= 0) s = s.slice(lastComma + 1).trim();
    return s;
  };
  const src = String(text ?? '');
  const sentences = src.match(SENTENCE_RE) ?? [src];
  for (const sent of sentences) {
    for (const re of patterns) {
      for (const m of sent.matchAll(re)) {
        const raw = clean(m[1]);
        if (!raw || !guardPass(raw)) continue;
        const key = raw.toLowerCase();
        if (found.has(key)) continue;
        found.add(key);
        out.push(raw);
        const canon = identityKey(raw);
        if (canon) { if (foundCanon.has(String(canon).toLowerCase())) out.pop(); else foundCanon.add(String(canon).toLowerCase()); }
      }
    }
  }
  return out;
}