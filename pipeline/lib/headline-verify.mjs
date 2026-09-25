// lib/headline-verify.mjs — HEADLINE VERIFICATION (P0).
//
// Pit the headline (and title variants: seoTitle, excerpt/summary) against the
// cluster's strongest supported claim + fact pool. Deterministic, automation-only:
//   - lexical support: how many headline content-tokens trace to the member leads
//   - hype / overclaim: clickbait words + definitive assertions when the
//     strongest claim is CONFLICTING or UNCONFIRMED
// Returns status: 'supported' | 'weak' | 'poor' | 'overclaim' plus flags/reasons.
//
// Additive: computes + records the verdict; does NOT change publish gating
// (the auditor's c6 + finalize_stories remain the blocking layer).

// Small Bengali stopwords + function-ish tokens: strip them from support scoring
// so "এক", "এই", "বলে", "এবং" never count as headline "facts".
const STOPWORDS = new Set([
  'এক', 'একটি', 'এই', 'ওই', 'ও', 'এবং', 'আর', 'বলে', 'বলেন', 'বলো', 'সহ',
  'নিয়ে', 'থেকে', 'জন্য', 'মধ্যে', 'মতো', 'সাথে', 'করে', 'করছে', 'করেছেন',
  'করবে', 'করণীয়', 'হয়েছে', 'হয়েছিল', 'হবে', 'হল', 'হয়', 'চলছে', 'চলবে',
  'বাড়ছে', 'বাড়বে', 'থাকবে', 'থাকছে', 'জানিয়েছে', 'জানায়', 'জানান', 'জানিয়েছেন',
  'নার', 'নি', 'তা', 'তাদের', 'তার', 'যারা', 'যা', 'যিনি', 'যে', 'কারণ',
]);

// Aggressive-on-purpose clickbait / hype terms that must never sit in a headline.
// Expanded per proposal §10 (বড় চমক/তোলপাড়/ভয়াবহ পরিস্থিতি etc).
export const HYPE_TERMS = [
  'অবিশ্বাস্য', 'চাঞ্চল্যকর', 'চাঞ্চল্য', 'ঐতিহাসিক', 'অভূতপূর্ব', 'আশ্চর্যজনক',
  'ভয়াবহ', 'বিপর্যয়', 'বিস্ময়', 'মহাঘটনা', 'চমক', 'শকে', 'সাড়া জাগিয়েছে',
  'সাড়া ফেলেছে', 'নজিরবিহীন', 'অতুলনীয়',
  // proposal §10 additions
  'বড় চমক', 'তোলপাড়', 'ভয়াবহ পরিস্থিতি', 'তুমুল', 'হুলস্থুল', 'আলোড়ন',
  'ফাঁস হলো', 'ফাঁস', 'ভাইরাল', 'শেষমেশ', 'অবশেষে চমক', 'চরম',
];

// Strong-assertion verbs that make a headline a DEFINITIVE claim (relevant when
// the evidence is actually conflicting/unconfirmed).
const ASSERTING = new Set(['পেলেন', 'পেল', 'নিশ্চিত', 'ঘোষণা', 'শুরু', 'সম্পন্ন', 'গেল', 'ছাড়ল', 'বন্ধ', 'চালু', 'দিলেন', 'হল']);

// Light Bengali suffix-stemming for support matching. Strips only common
// inflectional endings when the stem stays ≥3 chars — matches 'ঢাকায়'→'ঢাকা',
// 'রেস্টুরেন্টে'→'রেস্টুরেন্ট', 'অগ্নিকাণ্ডের'→'অগ্নিকাণ্ড' without mangling
// short roots like 'তুমি' or 'বাংলা'.
const SUFFIXES = [
  ['গুলো', 3], ['গুলা', 3], ['দেরের', 2], ['দের', 2], ['োগুলোর', 2],
  ['েরে', 2], ['েতে', 3], ['য়ের', 3], ['েতে', 3], ['টিতে', 3], ['টার', 3],
  ['গুলোতে', 3], ['গুলিতে', 3], ['ির', 3], ['ীর', 3], ['ের', 2], ['ে', 2], ['য়ে', 2], ['াক', 2],
];
export function stemTok(tok) {
  for (const [suf, minStem] of SUFFIXES) {
    if (tok.length > minStem + suf.length && tok.endsWith(suf)) {
      const stem = tok.slice(0, -suf.length);
      if (stem.length >= minStem) return stem;
    }
  }
  return tok;
}

export function tokenize(text) {
  const raw = String(text ?? '').toLowerCase()
    .replace(/["'‘’“”"`]/gi, ' ')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
  const tokens = raw.filter((t) => !STOPWORDS.has(t) && t.length > 1).map(stemTok);
  return { tokens, set: new Set(tokens) };
}

// Headline support: which headline tokens appear in the fact pool (member leads).
export function lexicalSupport(headline, pool) {
  const h = tokenize(headline);
  const p = tokenize(pool);
  if (!h.tokens.length) return { ratio: 0, matched: [], missing: h.tokens, pool_size: p.tokens.length };
  const matched = h.tokens.filter((t) => p.set.has(t));
  const missing = h.tokens.filter((t) => !p.set.has(t));
  return { ratio: matched.length / h.tokens.length, matched, missing, pool_size: p.tokens.length };
}

// The strongest supported claim of a cluster (highest-confidence verified claim).
function strongestClaim(brief) {
  const candidates = brief.claims && Array.isArray(brief.claims) ? brief.claims : [];
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0] ?? null;
}

// Full headline verification over a headline + its variants.
export function verifyHeadline(headline, { variants = [], leads = [], claim = null } = {}) {
  const pool = (Array.isArray(leads) ? leads : [leads]).join(' ');
  const support = lexicalSupport(headline, pool);
  const flags = [];
  const status = classify(support.ratio, claim);
  if (HYPE_TERMS.some((h) => headline.includes(h))) flags.push('hype');
  if (claim && ['CONFLICTING', 'UNCONFIRMED'].includes(claim.status)) flags.push(`claim-${claim.status.toLowerCase()}`);
  const assertion = toks(headline).filter((t) => ASSERTING.has(t));
  if (claim && claim.status === 'CONFLICTING' && assertion.length) flags.push('overclaim');
  const surface = { headline: { status, support: support.ratio, flags, matched: support.matched, missing: support.missing.slice(0, 8) } };
  for (const v of variants) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const s = lexicalSupport(v, pool);
    if (HYPE_TERMS.some((h) => v.includes(h))) surface[v] = { status: 'hype', support: s.ratio };
    else surface[v] = { status: classify(s.ratio, claim), support: s.ratio };
  }
  return { variable: headline, support: support.ratio, status, flags, claim_status: claim?.status ?? null, surfaces: surface };
}

export function toks(t) { return tokenize(t).tokens; }

// Final status mapping. Lenient floor: as long as ≥ half the headline tokens
// trace to the fact pool it is 'supported'; overclaim wins when conflicting.
function classify(ratio, claim) {
  if (claim && claim.status === 'CONFLICTING') return 'overclaim';
  if (ratio >= 0.5) return 'supported';
  if (ratio >= 0.3) return 'weak';
  return 'poor';
}

export default verifyHeadline;