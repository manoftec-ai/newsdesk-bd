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