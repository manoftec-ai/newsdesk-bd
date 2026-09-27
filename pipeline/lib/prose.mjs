// Is this text prose, or is it a website's furniture?
//
// 2026-09-27. 24 published articles contained site chrome - navigation menu
// rows, "প্রকাশিত :" bylines, "ছবি:" photo credits, related-story link farms.
// Measured cause: briefs whose lead came from a fetched page were 36% affected
// (21 of 59) while plain RSS leads were 0% (0 of 249). The culprit is
// extractArticle() in tools/resolve_sources.mjs, which strips semantic tags
// while these sites lay out pages with divs and classes.
//
// This module is the defence in depth: even if a better extractor lets
// furniture through, the composer can no longer turn it into a sentence.

const NAV_WORDS = [
  'জাতীয় রাজনীতি', 'সারাবিশ্ব', 'জেলার খবর', 'ক্যাম্পাস', 'খেলা', 'এলাকা',
  'শিক্ষা', 'বিজ্ঞান ও প্রযুক্তি', 'ভ্রমণ', 'ফ্যাক্ট চেক', 'কৃষি, অর্থ ও বাণিজ্য',
  'ধর্ম ও জীবন', 'স্বাস্থ্য ও চিকিৎসা', 'খোলা কলাম', 'লাইফ স্টাইল', 'প্রচ্ছদ',
  'বিনোদন', 'বিস্তারিত নিউজ', 'অন্যান্য', 'ইতিহাস', 'সংবাদ', 'খবর',
];

const INSTITUTIONS = [
  'ঢাকা বিশ্ববিদ্যালয়', 'জগন্নাথ বিশ্ববিদ্যালয়', 'জাহাঙ্গীরনগর বিশ্ববিদ্যালয়',
  'রাজশাহী বিশ্ববিদ্যালয়', 'খুলনা বিশ্ববিদ্যালয়', 'বাকৃবি', 'কুমিল্লা বিশ্ববিদ্যালয়',
  'ইসলামী বিশ্ববিদ্যালয়', 'যবিপ্রবি', 'বশেমুরবিপ্রবি', 'বুয়েট', 'ঢাকা কলেজ',
];

const BYLINE = /প্রকাশিত\s*:|সম্পাদক\s*:|প্রতিবেদক\s*:|ডেস্ক\s*:|সূত্র\s*[:：]/u;
const PHOTO = /ছবি\s*:|ফটো\s*:|ভিডিও\s*:|ছবির\s*ক্যাপশন/u;
const COPYRIGHT = /সর্বস্বত্ব\s*সংরক্ষিত|উপস্থাপনায়|অনুলিপি\s*নিষিদ্ধ/u;
const SHARE = /শেয়ার\s*করুন|ফেসবুকে|হোয়াটসঅ্যাপে|টুইটারে|লিংক\s*কপি/u;
const SUBSCRIBE = /সাবস্ক্রাইব|সাবস্ক্রিপশন|নিউজলেটার|বিজ্ঞাপন\s*দিন/u;

/** Furniture that is unambiguous wherever it appears. */
export function hardChrome(text) {
  const t = String(text ?? '');
  if (BYLINE.test(t)) return 'byline';
  if (PHOTO.test(t)) return 'photo-credit';
  if (COPYRIGHT.test(t)) return 'copyright';
  if (SUBSCRIBE.test(t)) return 'subscribe';
  return null;
}

/**
 * A menu row: many short comma-separated proper nouns, no sentence terminator.
 * Real prose has clauses and দাঁড়ি; navigation is a label list.
 */
export function looksLikeMenuRow(text) {
  const t = String(text ?? '').trim();
  if (t.length < 60) return false;
  if (/[।?!]/u.test(t)) return false; // prose ends sentences
  const commas = (t.match(/,/gu) ?? []).length;
  if (commas < 6) return false;
  const pieces = t.split(',').map((s) => s.trim()).filter(Boolean);
  if (pieces.length < 7) return false;
  // most pieces are 1-4 words: labels, not clauses
  const short = pieces.filter((p) => p.split(/\s+/u).length <= 4).length;
  if (short / pieces.length < 0.7) return false;
  return true;
}

/** Navigation vocabulary density: a real news body barely mentions these. */
export function navDensity(text) {
  const t = String(text ?? '');
  if (!t.trim()) return 0;
  const words = t.split(/\s+/u).filter(Boolean).length || 1;
  const hits = NAV_WORDS.filter((w) => t.includes(w)).length + INSTITUTIONS.filter((w) => t.includes(w)).length;
  return hits / Math.max(1, words / 12); // hits per ~12 words
}

export function isNavList(text) {
  return NAV_WORDS.filter((w) => String(text ?? '').includes(w)).length >= 3;
}

/**
 * The gate the composer applies to every candidate sentence. Returns null when
 * the text is usable prose, or a short reason when it is furniture.
 */
export function proseProblem(text) {
  const hard = hardChrome(text);
  if (hard) return hard;
  if (isNavList(text)) return 'nav-list';
  if (looksLikeMenuRow(text)) return 'menu-row';
  // a sentence made mostly of institution names is a nav row that slipped past
  const instHits = INSTITUTIONS.filter((w) => String(text ?? '').includes(w)).length;
  if (instHits >= 2) return 'institution-list';
  return null;
}
