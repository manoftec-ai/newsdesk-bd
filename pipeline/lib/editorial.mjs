// lib/editorial.mjs — deterministic editorial metrics, zero LLM cost.
//
// 1) READER VALUE test (critique #21): if a reader who already knows the
//    headline learns nothing new from the article, the article has no reason
//    to exist. Enforced as an extra mechanical gate (id 'rv1'), never a strip.
//
// 2) EDITORIAL VALUE ranking (critique #22): an internal-only priority score
//    (public impact, people affected, novelty, consequence, urgency,
//    geographic relevance, usefulness). Used by pick_briefs as a tiebreak
//    within the newest-first batch and exposed in pick.json for the author.

const QTY_WORDS = new Set([
  'কোটি', 'লাখ', 'লক্ষ', 'হাজার', 'দশ', 'শত', 'হাজার হাজার', 'বিলিয়ন',
  'মিলিয়ন', 'টাকা', 'কেজি', 'টন', 'কিলোমিটার', 'মিটার', 'শতাংশ',
  'জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই',
  'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর',
  'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার', 'রবিবার',
]);

const DAY_WORDS = new Set([
  'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার', 'রবিবার',
]);

const IMPACT_KEYWORDS = [
  'মৃত্যু', 'নিহত', 'আহত', 'হতাহত', 'বিস্ফোরণ', 'আগুন', 'বন্যা', 'ভূমিকম্প',
  'ঝড়', 'ঘূর্ণিঝড়', 'দুর্ঘটনা', 'সড়ক', 'দাম', 'মূল্য', 'জ্বালানি', 'গ্যাস',
  'বিদ্যুৎ', 'বেতন', 'ভাতা', 'নির্বাচন', 'সংসদ', 'আদালত', 'রায়', 'শিক্ষা',
  'স্কুল', 'বোর্ড', 'স্বাস্থ্য', 'হাসপাতাল', 'টিকা', 'সরকারি', 'মন্ত্রণালয়',
];

const CONSEQUENCE_KEYWORDS = [
  'সিদ্ধান্ত', 'ঘোষণা', 'কার্যকর', 'নিষেধ', 'বন্ধ', 'শুরু', 'চালু', 'অনুমোদন',
  'ওঠানো', 'নামানো', 'বাড়ানো', 'কমানো', 'প্রতিষ্ঠা', 'বাতিল',
];

const URGENCY_KEYWORDS = [
  'জরুরি', 'অবিলম্বে', 'আজ', 'আজই', 'তৎপর', 'রাত', 'সকালে', 'এখনই',
];

const USEFUL_KEYWORDS = [
  'টিকিট', 'আবেদন', 'সময়সূচি', 'নম্বর', 'হটলাইন', 'রুট', 'ভাড়া', 'কোয়ারেন্টাইন',
  'নিবন্ধন', 'ফোন', 'ঠিকানা',
];

const REGION_KEYWORDS = [
  'ঢাকা', 'চট্টগ্রাম', 'সিলেট', 'রাজশাহী', 'খুলনা', 'রংপুর', 'বরিশাল',
  'ময়মনসিংহ', 'বাংলাদেশ', 'কুমিল্লা', 'নারায়ণগঞ্জ', 'গাইবান্ধা', 'দিনাজপুর',
  'বগুড়া', 'যশোর', 'টাঙ্গাইল', 'কক্সবাজার', 'রণগামাটি',
];

// ---- token helpers -------------------------------------------------------
function tokensOf(text) {
  return String(text ?? '')
    .replace(/[#*_"'.,:;!?()\[\]{}“”‘’\-—«»।]/gu, ' ')
    .toLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
}

// "Concrete" tokens = anything carrying a digit (Bengali or Latin) + known
// quantity/date words. These are the facts a headline can already contain;
// novel concrete tokens in the body prove the article adds information.
export function concreteTokens(text) {
  const set = new Set();
  for (const tok of tokensOf(text)) {
    if (/\d/u.test(tok) || /[০-৯]/u.test(tok) || QTY_WORDS.has(tok)) set.add(tok);
  }
  return set;
}

// ---- #21 reader-value test ------------------------------------------------
// deterministic novelty probe: does the body carry any concrete fact the
// headline does not already state? A body that only restates the headline
// (same numbers, same quantities, no new day/date) adds nothing for a reader
// who read the headline -> it should not be published.
export function readerValueCheck(headline, body) {
  const headInfo = concreteTokens(headline);
  const bodyInfo = concreteTokens(body);
  const novel = [...bodyInfo].filter((t) => !headInfo.has(t));
  const bodyWords = tokensOf(body).length;
  const headWords = tokensOf(headline).length;
  // A body that is far longer than the headline is real reporting even when it
  // repeats the headline's facts (details, quotes, chronology); only a
  // near-restatement with zero new concrete facts is rejected.
  const ok = novel.length >= 1 || bodyWords >= headWords * 4 + 20;
  return { ok, novel: novel.slice(0, 8), bodyWords, headWords };
}

// ---- #A1/#A2 content sufficiency + publication modes ----------------------
// Verification ≠ pubitability (Phase-2 editorial correction #1/#3). A brief can
// be fully VERIFIED yet still contain only the one fact its headline states
// (e.g. two Google-News header-only items). We measure the FACT POOL
// deterministically and classify the STORY into a publication mode BEFORE
// writing, so a thin, verified story becomes a short honest brief — never a
// padded fake "full article" that merely restates the headline 3×.

export function contentSufficiency(brief) {
  const members = brief?.members ?? [];
  const claims = brief?.claims ?? [];
  let richLeads = 0;
  let thinLeads = 0;
  let leadNovel = 0;
  const pool = [];
  for (const m of members) {
    const title = String(m?.title ?? '').trim();
    const lead = String(m?.lead ?? '').trim();
    pool.push(title, lead);
    if (!lead) continue;
    const titleToks = new Set(tokensOf(title));
    const leadToks = tokensOf(lead);
    const novel = leadToks.filter((t) => !titleToks.has(t)).length;
    leadNovel += novel;
    // "rich" = the captured lead carries real reporting beyond the headline
    // (a Google-News item has body == title → zero surplus info).
    if (lead.length >= 70 && novel >= 8) richLeads += 1;
    else thinLeads += 1;
  }
  const factClaims = claims.filter((c) =>
    ['VERIFIED', 'OFFICIAL', 'CORROBORATED'].includes(c?.status),
  ).length;
  const conflicts = claims.filter((c) => c?.status === 'CONFLICTING').length;
  const units = richLeads * 8 + factClaims * 4 + conflicts * 3 + Math.min(leadNovel, 40);
  return {
    score: Math.min(100, Math.round(units)),
    units,
    richLeads,
    thinLeads,
    factClaims,
    conflicts,
    novelTokens: Math.min(leadNovel, 40),
    distinctPool: new Set(tokensOf(pool.join(' '))).size,
  };
}

// Deterministic publication-mode classifier (pure). 'developing' is decided by
// recency + unfolding-event markers and takes precedence at call time.
export function publicationModeOf(s) {
  if (s.richLeads === 0 && s.factClaims <= 1) return 'news-brief';
  return 'standard';
}

export function isDevelopingBrief(brief) {
  const pool = [
    brief?.headline ?? '',
    ...(brief?.members ?? []).map((m) => `${m?.title ?? ''} ${m?.lead ?? ''}`),
  ].join(' ');
  const markers = ['জরুরি', 'অবিলম্বে', 'আপডেট', 'চলমান', 'রাত', 'এখনই', 'তদন্ত চলছে', 'প্রতীক্ষায়', 'উদ্ধার'];
  if (!markers.some((k) => pool.includes(k))) return false;
  const dates = (brief?.members ?? []).map((m) => Date.parse(m?.published_at ?? '') || 0).filter(Boolean);
  if (!dates.length) return false;
  return (Date.now() - Math.max(...dates)) < 12 * 3600 * 1000;
}

export function publicationMode(brief) {
  if (isDevelopingBrief(brief)) return 'developing';
  return publicationModeOf(contentSufficiency(brief));
}

// Length discipline is mode-aware: a verified-but-thin story must NOT be padded
// to the STANDARD tier; a developing story allows a middle band. Falls back to
// the classic member-count tiers for STANDARD stories (backward compatible).
export function lengthForMode(mode, srcCount) {
  if (mode === 'news-brief') return { min: 50, max: 150, tier: 'brief' };
  if (mode === 'developing') return { min: 100, max: 240, tier: 'developing' };
  if (srcCount <= 2) return { min: 100, max: 180, tier: 'short' };
  if (srcCount === 3) return { min: 200, max: 350, tier: 'normal' };
  return { min: 400, max: 550, tier: 'complex' };
}

// ---- anti-repetition gate (Phase-2 #4/#5) ----------------------------------
// Mechanical overlap probes between the article's own sections. Catches:
//   - lead paragraph that only restates the headline
//   - মূল খবর paragraphs that re-stated the lead
//   - duplicate/overlapping এক নজরে bullets
// (Bullet-vs-headline restatement is left to the writer prompt + the n5 LLM
// audit stage — mechanically it false-positives on legitimately short bullets.)

function overlapRatio(a, b) {
  const ta = tokensOf(a);
  if (!ta.length) return 0;
  const tb = new Set(tokensOf(b));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / ta.length;
}

export function repetitionViolations(headline, body) {
  const out = [];
  const text = String(body ?? '');
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let lead = '';
  const bullets = [];
  const mainParas = [];
  for (const p of paras) {
    const lines = p.split('\n');
    // bullet block: a "এক নজরে" heading line (possibly bold / with colon) or a
    // bare list of bullet lines
    const headingOrBullets = lines.length > 1 && (
      /^(?:\*\*)?এক\s*নজরে(?:\*\*)?:?\s*$/.test(lines[0].trim()) ||
      lines.every((l) => /^\s*[-•*]\s/.test(l))
    );
    if (headingOrBullets) {
      for (const l of lines) {
        if (/^\s*[-•*]\s/.test(l)) bullets.push(l.replace(/^\s*[-•*]\s*/, '').replace(/\*+$/g, '').trim());
      }
      continue;
    }
    if (/^#{1,6}\s/u.test(p) || /^\*\*/u.test(p)) continue;
    if (!lead && p.length > 30) { lead = p; continue; }
    if (p.length > 30) mainParas.push(p);
  }
  // lead restating the headline with essentially no new information: every
// content token of the headline appears in the lead AND the lead adds no new
// concrete fact (number/date/quantity) beyond the headline. Short leads only.
  if (lead && headline) {
    const leadToks = tokensOf(lead);
    const headToks = new Set(tokensOf(headline));
    if (leadToks.length > 2 && leadToks.length <= 40) {
      const coverage = leadToks.filter((t) => headToks.has(t)).length / headToks.size;
      const novelConcrete = [...concreteTokens(lead)].filter((t) => !concreteTokens(headline).has(t));
      if (headToks.size > 0 && coverage >= 0.75 && novelConcrete.length === 0) {
        out.push({ type: 'lead-repeats-headline', section: 'lead' });
      }
    }
  }
  // মূল খবর paragraphs that merely re-state the lead (only flag a substantial
  // restatement — short quote/attribution lines are legitimate lead support)
  for (const p of mainParas) {
    if (lead && p.length >= 120 && p.length <= 300 && overlapRatio(p, lead) > 0.8) {
      out.push({ type: 'para-repeats-lead', section: 'মূল খবর' });
    }
  }
  // duplicate এক নজরে bullets
  for (let i = 0; i < bullets.length; i++) {
    for (let j = i + 1; j < bullets.length; j++) {
      if (bullets[i] && bullets[j] && overlapRatio(bullets[i], bullets[j]) > 0.7) {
        out.push({ type: 'duplicate-bullets', section: 'এক নজরে' });
      }
    }
  }
  return out;
}

// ---- #22 editorial-value ranking (internal only) --------------------------
// Deterministic 0..100 score from the brief; signals listed for transparency.
// The score never leaves the pipeline (not shown to readers) — it only informs
// which story gets authored first and which appears higher in the feed.
export function editorialValue(brief) {
  const pool = [
    brief?.headline ?? '',
    ...(brief?.members ?? []).map((m) => `${m?.title ?? ''} ${m?.lead ?? ''}`),
  ].join(' ');
  const low = pool.toLowerCase();

  const count = (kws) => kws.reduce((n, k) => n + (low.includes(k.toLowerCase()) ? 1 : 0), 0);

  const corroboration = (brief?.members ?? []).length;
  const uniqueOutlets = new Set((brief?.members ?? []).map((m) => m?.source_id)).size;

  const impact = count(IMPACT_KEYWORDS);
  const consequence = count(CONSEQUENCE_KEYWORDS);
  const urgency = count(URGENCY_KEYWORDS);
  const usefulness = count(USEFUL_KEYWORDS);
  const region = count(REGION_KEYWORDS);

  const impactScore = Math.min(impact, 4) * 5;            // 0..20
  const corrScore = Math.min(corroboration, 4) * 4 + Math.min(uniqueOutlets, 3); // 0..19
  const consequenceScore = Math.min(consequence, 3) * 4;  // 0..12
  const urgencyScore = Math.min(urgency, 4) * 3;          // 0..12
  const usefulnessScore = Math.min(usefulness, 2) * 4;    // 0..8
  const regionScore = region >= 1 ? 10 : 5;               // 0..10 (BD focus site)

  const score = Math.min(
    100,
    impactScore + corrScore + consequenceScore + urgencyScore + usefulnessScore + regionScore,
  );

  return {
    score,
    signals: {
      impact: impactScore,
      corroboration: corrScore,
      consequence: consequenceScore,
      urgency: urgencyScore,
      usefulness: usefulnessScore,
      geoRelevance: regionScore,
    },
  };
}

export const _internal = { DAY_WORDS };