import eventsRegistry from "../data/events.json" with { type: "json" };

export const events = () => eventsRegistry.events ?? [];

export const getEvent = (slug) => events().find((event) => event.id === slug);

export const eventRegistryMeta = () => eventsRegistry.meta ?? {};

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
  let score = 0;
  for (const keyword of keywords) {
    const weight = isSpecific(keyword) ? 1 : 0.1;
    score += countOccurrences(title, keyword) * 3 * weight;
    score += countOccurrences(excerpt, keyword) * 1.5 * weight;
    if (body) score += countOccurrences(body, keyword) * 0.8 * weight;
  }
  return score;
};

// Match purely by weighted score. Add a small credit for a title hit so a single
// strong keyword in the headline can still qualify.
export const matchesEvent = (event, post, minimum = 4) => {
  if (!event || !post) return false;
  const score = eventMatchScore(event, post);
  if (score >= minimum) return true;
  for (const keyword of event?.keywords ?? []) {
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