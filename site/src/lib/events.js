import eventsRegistry from "../data/events.json" with { type: "json" };
import eventsNewsRegistry from "../data/events-news.json" with { type: "json" };

export const events = () => eventsRegistry.events ?? [];

export const getEvent = (slug) => events().find((event) => event.id === slug);

export const eventRegistryMeta = () => eventsRegistry.meta ?? {};

export const chronology = () => eventsNewsRegistry.chronology ?? {};

// Dated historical news archive for one event (empty array if none curated yet).
export const chronologyFor = (slug) => chronology()[slug] ?? [];

export const hasChronology = (slug) => (chronology()[slug]?.length ?? 0) > 0;

// Number of dated archive entries per event (0 when not curated).
export const chronologyCounts = () => {
  const counts = {};
  for (const [id, items] of Object.entries(chronology())) {
    if (Array.isArray(items)) counts[id] = items.length;
  }
  return counts;
};

// group chronological archive items by year (descending), partial dates intact.
export const groupChronologyByYear = (items) => {
  const byYear = {};
  for (const item of items) {
    const year = (item.date ?? "").slice(0, 4) || "অজানা";
    byYear[year] = byYear[year] ?? [];
    byYear[year].push(item);
  }
  return byYear;
};

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const toBn = (str = "") => String(str).replace(/\d/g, (d) => BN_DIGITS[+d]);
const MONTH_BN = [
  null,
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

// Format chronological dates that may have YEAR-only or YEAR-MONTH precision:
// "2012" -> "২০১২", "2012-08" -> "আগস্ট ২০১২", full ISO -> "১১ ফেব্রুয়ারি ২০১২".
export const formatChronoDate = (value) => {
  if (!value) return "অজানা";
  const [y, m, d] = String(value).split("-");
  const year = toBn(y);
  if (d && m) {
    const day = toBn(Number(d));
    return `${day} ${MONTH_BN[Number(m)] ?? ""} ${year}`.trim();
  }
  if (m) return `${MONTH_BN[Number(m)] ?? ""} ${year}`.trim();
  return year;
};

export const EVENT_CATEGORY_LABELS = {
  security: "নিরাপত্তা",
  media: "গণমাধ্যম",
  economy: "অর্থনীতি",
  politics: "রাজনীতি",
  education: "শিক্ষা",
  international: "আন্তর্জাতিক",
  infrastructure: "অবকাঠামো",
  energy: "জ্বালানি ও বিদ্যুৎ",
  health: "স্বাস্থ্য",
  disaster: "দুর্যোগ",
  sports: "ক্রীড়া",
  justice: "বিচার",
  culture: "সংস্কৃতি",
  environment: "পরিবেশ",
  national: "জাতীয়",
  tech: "প্রযুক্তি",
};

export const eventCategoryLabel = (slug) =>
  EVENT_CATEGORY_LABELS[slug] ?? (slug ? slug[0]?.toUpperCase() + slug.slice(1) : "");

const normalize = (text = "") =>
  text
    .toLowerCase()
    .replace(/[\u200c\u200d]/g, "")
    .replace(/\s+/g, " ");

// Words too generic to distinguish an event; edge-weighted near zero.
const GENERIC_WORDS = new Set([
  "বাংলাদেশ",
  "ঢাকা",
  "ভারত",
  "সরকার",
  "দেশ",
  "রাজধানী",
  "দেশজুড়ে",
  "লাখ",
  "কোটি",
  "প্রতিবেদন",
  "তথ্য",
  "শেষ",
  "একই",
  "সংশ্লিষ্ট",
  "সন্ধান",
  "এখন",
]);

// A keyword is "specific" when it is long enough to be distinctive AND not generic.
const isSpecific = (keyword) => {
  const key = normalize(keyword);
  return key.length >= 5 && !GENERIC_WORDS.has(key);
};

const countOccurrences = (text, keyword) => {
  const hay = normalize(text);
  const needle = normalize(keyword);
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while ((index = hay.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
};

export const eventMatchScore = (event, post) => {
  const title = normalize(post?.title ?? "");
  const excerpt = normalize(post?.excerpt ?? "");
  const body = normalize(post?.body ?? "");
  const keywords = event?.keywords ?? [];
  const strong = new Set((event?.strongKeywords ?? []).map((k) => normalize(k)));
  let score = 0;
  for (const keyword of keywords) {
    const weight = strong.has(normalize(keyword)) ? 1 : isSpecific(keyword) ? 1 : 0.1;
    score += countOccurrences(title, keyword) * 3 * weight;
    score += countOccurrences(excerpt, keyword) * 1.5 * weight;
    if (body) score += countOccurrences(body, keyword) * 0.8 * weight;
  }
  return score;
};

// Optional hard gates an event can declare to keep chronicle links precise:
//   strongKeywords    — topic-defining words; an article MUST mention at least one
//                       of them (and they score at full weight like specific keywords)
//   years             — allowed years (from post.date / post.year); empty = any year
//   excludeCategories — categories that must never link into this chronicle
const passesHardGates = (event, post) => {
  const strongWords = (event?.strongKeywords ?? []).filter(Boolean);
  if (strongWords.length) {
    const hay = normalize([post?.title, post?.excerpt, post?.body].filter(Boolean).join(" "));
    if (!strongWords.some((k) => normalize(k) && hay.includes(normalize(k)))) return false;
  }
  const years = event?.years ?? [];
  if (years.length) {
    const year =
      post?.year ??
      (post?.date ? Math.trunc(Number(String(post.date).slice(0, 4))) : 0) ??
      0;
    if (year && !years.map(Number).filter(Boolean).includes(Number(year))) return false;
  }
  const excludeCats = event?.excludeCategories ?? [];
  if (excludeCats.length && post?.category && excludeCats.includes(post.category)) return false;
  return true;
};

// Match purely by weighted score, bounded by the event's hard gates. Add a small
// credit for a title hit so a single strong keyword in the headline can still qualify.
export const matchesEvent = (event, post, minimum = 4) => {
  if (!event || !post) return false;
  if (!passesHardGates(event, post)) return false;
  const score = eventMatchScore(event, post);
  if (score >= minimum) return true;
  for (const keyword of [...(event?.strongKeywords ?? []), ...(event?.keywords ?? [])]) {
    if (isSpecific(keyword) && normalize(post.title).includes(normalize(keyword))) {
      return true;
    }
  }
  return false;
};

export const eventsForPost = (post, minimum = 4) =>
  events()
    .filter((event) => matchesEvent(event, post, minimum))
    .map((event) => ({ ...event, matchScore: eventMatchScore(event, post) }))
    .sort((a, b) => b.matchScore - a.matchScore);

export const postsForEvent = (slug, posts) => {
  const event = getEvent(slug);
  return (posts ?? [])
    .filter((post) => matchesEvent(event, post))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
};

export const eventCounts = (posts) => {
  const counts = new Map();
  for (const event of events()) {
    const matching = (posts ?? []).filter((post) => matchesEvent(event, post));
    if (matching.length > 0) counts.set(event.id, matching.length);
  }
  return counts;
};