import { getCollection } from "astro:content";
import { eventsForPost } from "./events.js";
export { SITE, SEO, authors, categories, tags, CONTACT, NAVIGATION, MORE_NAVIGATION } from "../config/theme.config.ts";
import { SITE, authors, categories, tags } from "../config/theme.config.ts";

const isoDate = (date) => date?.toISOString().slice(0, 10);

/**
 * ISO string for a `<time datetime>` attribute or JSON-LD, or undefined.
 *
 * 2026-10-02: this used to be `(date) => (date ? new Date(date).toISOString() : undefined)`
 * inline in the article page. It threw `RangeError: Invalid time value` on any
 * truthy-but-unparseable value — most importantly on a Bengali FORMATTED date
 * such as "২৪ সেপ্টেম্বর, ২০২৬", which `new Date()` cannot parse. One bad call
 * failed the entire Astro build and therefore every deploy.
 *
 * A formatting helper must never be able to take a build down, so an
 * unparseable value now yields undefined (the attribute is simply omitted)
 * instead of throwing.
 */
export const toIsoDateTime = (value) => {
  if (value === null || value === undefined || value === "") return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};
const wordsPerMinuteBn = 200;

const estimateReadingTime = (text = "") => {
  const words = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / wordsPerMinuteBn));
};

export const imageSrc = (image) => (typeof image === "string" ? image : image?.src);

export const normalizePost = (entry) => ({
  slug: entry.id,
  ...entry.data,
  date: isoDate(entry.data.date),
  updated: isoDate(entry.data.updated),
  ts: entry.data.date ? entry.data.date.getTime() : 0,
  readingTime: entry.data.readingTime ?? estimateReadingTime(entry.body),
});

// 2026-10-02 build-time fix. getCollection() re-reads and re-parses all 584
// markdown files on every call, and posts() sits under nearly every helper, so
// each of the ~584 pages paid the full parse (~2.4s measured) again. That alone
// is ~23 minutes of pure re-parsing, on top of the related-posts fix.
//
// Memoized for production builds only. `import.meta.env.PROD` is true while
// astro build runs the pages in one process, so the collection is read once per
// build — the corpus cannot change mid-build. In dev it stays uncached, so adding
// an article still shows up without a restart.
let cachedEntries = null;

/**
 * Every published article, memoized for production builds.
 *
 * 2026-10-02. getCollection() re-reads and re-parses all 584 markdown files on
 * every call (~2.4s measured), and it was being called from per-page code — the
 * /ghotona/[slug] hub in particular, once for each of its 83 event pages. Under
 * Astro's static build the pages share one process and the corpus cannot change
 * mid-build, so the parse is done once. Dev stays uncached so a newly written
 * article appears without a restart.
 */
export const newsEntries = async () => {
  if (!import.meta.env.PROD) return getCollection("news", ({ data }) => !data.draft);
  cachedEntries ??= getCollection("news", ({ data }) => !data.draft);
  return cachedEntries;
};

let cachedPosts = null;

export const posts = async () => {
  if (!import.meta.env.PROD) return (await newsEntries()).map(normalizePost);
  cachedPosts ??= (await newsEntries()).map(normalizePost);
  return cachedPosts;
};

export const getPost = async (slug) => (await posts()).find((post) => post.slug === slug);
export const getAuthor = (slug) => authors.find((author) => author.slug === slug);

export const getCategory = (slug) =>
  categories.find((category) => category.slug === slug || category.name === slug);

export const getTag = (slug) => tags.find((tag) => tag.slug === slug || tag.name === slug);

export const postsByCategory = async (slug) => {
  const category = getCategory(slug);
  const match = [category?.slug, category?.name].filter(Boolean);
  return (await sortedPosts()).filter((post) => match.includes(post.category));
};

export const postsByTag = async (slug) => {
  const tag = getTag(slug);
  return (await sortedPosts()).filter((post) => post.tags.includes(tag?.slug ?? slug));
};

export const postsByAuthor = async (slug) =>
  (await sortedPosts()).filter((post) => post.author === slug);

export const sortedPosts = async () =>
  [...(await posts())].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));

// Homepage order (2026-10-01, user rule): the front page is a clock, not a
// podium. Every story competes on recency alone — newest first, always. Rank
// promotion (featured/breaking/confirmed-first) used to bury fresh stories
// under hundreds of older ones, and the site read as dead while new news was
// live. The one exception is `suspect`: an unverifiable story is never
// promoted above real news, regardless of age.
export const editorialOrder = async () =>
  [...(await posts())].sort((a, b) => {
    const suspectA = getBadge(a)?.key === "suspect" ? 1 : 0;
    const suspectB = getBadge(b)?.key === "suspect" ? 1 : 0;
    return suspectA - suspectB || (b.ts ?? 0) - (a.ts ?? 0);
  });

export const featuredPost = async () => {
  const ordered = await editorialOrder();
  return (
    ordered.find((post) => post.featured) ??
    ordered.find((post) => post.breaking) ??
    ordered.find((post) => getBadge(post)?.key === "confirmed") ??
    ordered[0]
  );
};

export const breakingItems = async (n = 5) =>
  (await sortedPosts()).filter((post) => post.breaking).slice(0, n);

export const popularPosts = async (n = 4) => (await sortedPosts()).slice(0, n);

export const relatedPosts = async (post, n = 6) => {
  // 2026-10-02 build-time fix. This sort used to call eventsForPost() from
  // INSIDE the comparator, and eventsForPost(post) — the same argument, the
  // same answer — once per comparison. Sorting 583 candidates is ~5,000
  // comparisons, so every article page did ~10,000 event scans (each over all 83
  // events). Across 584 pages that is hundreds of millions of string matches and
  // it turned a 53-second build into one that ran for hours, so no deploy ever
  // reached production.
  //
  // The answer does not depend on the comparison, so compute it once per
  // candidate. Same ranking, ~5,000 scans instead of ~10,000 per page, and the
  // post's own events are resolved a single time instead of per comparison.
  const postEventIds = new Set(eventsForPost(post).map((event) => event.id));
  const eventBonus = new Map();
  const score = (candidate) => {
    if (!eventBonus.has(candidate.slug)) {
      eventBonus.set(
        candidate.slug,
        eventsForPost(candidate).some((event) => postEventIds.has(event.id)) ? 10 : 0,
      );
    }
    // 2026-10-02: same tracked event outranks same-category links —
    // "আরও পড়ুন" should continue the story, not just the beat.
    return (
      eventBonus.get(candidate.slug) +
      (candidate.category === post.category ? 2 : 0) +
      candidate.tags.filter((tag) => post.tags.includes(tag)).length
    );
  };

  return (await sortedPosts())
    .filter((candidate) => candidate.slug !== post.slug)
    .sort((a, b) => {
      // Recency breaks ties so fresh stories surface instead of arbitrary
      // collection order when scores are equal (interlinking upgrade 2026-09-27).
      return score(b) - score(a) || (b.ts ?? 0) - (a.ts ?? 0);
    })
    .slice(0, n);
};

// Tags that co-occur with this tag across the corpus, for the "related tags"
// box on /tags pages. Pure navigation signal — no factual claim.
export const relatedTags = async (slug, n = 6) => {
  const all = await sortedPosts();
  const withTag = all.filter((post) => (post.tags ?? []).includes(slug));
  const ids = new Set(withTag.map((post) => post.slug));
  const counts = new Map();
  for (const post of withTag) {
    for (const tag of post.tags ?? []) {
      if (tag === slug) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([tag, count]) => ({
      tag: getTag(tag) ?? { slug: tag, name: tag },
      count,
    }));
};

export const adjacentPosts = async (post) => {
  const sorted = await sortedPosts();
  const index = sorted.findIndex((candidate) => candidate.slug === post.slug);
  return { prev: sorted[index + 1], next: sorted[index - 1] };
};

const tryDate = (label, value) => {
  try {
    return new Intl.DateTimeFormat("bn-BD", { year: "numeric", month: "long", day: "numeric" }).format(
      new Date(value),
    );
  } catch {
    return value ?? label;
  }
};

export const formatDate = (iso) => tryDate("", iso);

/**
 * Bangladesh date, no time, always in Asia/Dhaka.
 *
 * 2026-09-27. The lead card on the homepage rendered its date as raw ISO
 * (`2026-09-26`) while every other card used the Bengali format. Switching it to
 * formatDateTimeBDShort() then invented a time: a date-only string like
 * "2026-09-26" is parsed by `new Date()` as UTC MIDNIGHT, so UTC+6 rendered
 * "২৬ সেপ্টেম্বর · ৬:০০ AM" - a precise time the story never had.
 *
 * tryDate() above has no timeZone, so it formats in the server's local zone.
 * That happens to be right on Vercel (UTC) and wrong anywhere west of Greenwich,
 * where a UTC-midnight date renders as the previous day. Pinning Asia/Dhaka
 * makes it correct everywhere, and a date with no time gets no time.
 */
export const formatDateBD = (iso) => {
  try {
    return new Intl.DateTimeFormat("bn-BD", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return String(iso ?? "");
  }
};

/** True when the ISO string carries a real time component, not just a date. */
export const hasTimeComponent = (iso) => /T\d{2}:\d{2}/.test(String(iso ?? ""));

export const formatTime = (iso) => tryDate("সময়", iso);

/** Bangladesh (Asia/Dhaka, UTC+6) date + time label, e.g. "২৩ সেপ্টেম্বর, ২০২৬ · ৫:১০ PM".
 *  Falls back to UTC-based date only if Intl/timeZone is unavailable. */
export const formatDateTimeBD = (ts) => {
  try {
    const d = new Date(ts);
    const opts = { timeZone: "Asia/Dhaka" };
    const datePart = new Intl.DateTimeFormat("bn-BD", {
      ...opts,
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    const timePart = new Intl.DateTimeFormat("bn-BD", {
      ...opts,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    return `${datePart} · ${timePart}`;
  } catch {
    return tryDate("", ts);
  }
};

/** Same as formatDateTimeBD but omits the year (e.g. for "today"-ish rows).
 *  Includes the year only when it differs from Bangladesh's current year. */
export const formatDateTimeBDShort = (ts) => {
  try {
    const d = new Date(ts);
    const now = new Date();
    const inDhaka = (v) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(v);
    const sameYear = inDhaka(d).slice(0, 4) === inDhaka(now).slice(0, 4);
    const opts = { timeZone: "Asia/Dhaka" };
    const datePart = new Intl.DateTimeFormat("bn-BD", {
      ...opts,
      day: "numeric",
      month: "long",
      year: sameYear ? undefined : "numeric",
    }).format(d);
    const timePart = new Intl.DateTimeFormat("bn-BD", {
      ...opts,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    return `${datePart} · ${timePart}`;
  } catch {
    return formatDateTimeBD(ts);
  }
};

export const BADGES = {
  verified: {
    label: "যাচাইকৃত",
    tierNote: "অফিসিয়াল বা প্রাথমিক সূত্রে তথ্যটি নিশ্চিত হয়েছে",
    className: "badge--verified",
  },
  confirmed: {
    label: "নিশ্চিত",
    tierNote: "দুই বা ততোধিক স্বাধীন সংবাদসূত্রে তথ্য মিলে গেছে",
    className: "badge--confirmed",
  },
  partial: {
    label: "একক/আংশিক",
    tierNote: "একক সূত্রের ওপর ভিত্তি করে — আরও সূত্রে নিশ্চিত হলে পরিপূর্ণ হবে",
    className: "badge--partial",
  },
  // 2026-09-30 developing lane. Same verification state as `partial` (one
  // source, awaiting a second) but a different promise to the reader: the desk
  // is actively looking right now, on a 2h quiet + 6h recycle clock. It keeps
  // key "partial", so sorting and every consumer stay unchanged; only the words
  // and colour differ.
  developing: {
    label: "যাচাই চলছে",
    tierNote:
      "একমাত্র সূত্রে প্রকাশিত — ডেস্ক এখন দ্বিতীয় সূত্র খুঁজছে, পাওয়া গেলে সঙ্গে সঙ্গে যুক্ত হবে",
    className: "badge--developing",
  },
  suspect: {
    label: "সন্দেহজনক",
    tierNote: "নির্ভরযোগ্য সূত্রে যাচাই করা যায়নি, তাই প্রকাশযোগ্য নয়",
    className: "badge--suspect",
  },
};

export const getBadge = (post) => {
  const key = post.verification?.badge ?? "partial";
  // A story on the developing lane wears the `partial` verification state, but
  // it is a different editorial situation, so it gets its own words + colour.
  // Guarded on the key so a stale `developing: true` can never label a story
  // "যাচাই চলছে" after it has actually been corroborated.
  const meta = post.developing && key === "partial" ? BADGES.developing : BADGES[key] ?? BADGES.partial;
  return { key, ...meta };
};

export const VERDICTS = {
  true: { label: "সত্য", className: "verdict--true", tierNote: "দাবির মূল তথ্য সঠিক" },
  "mostly-true": { label: "বেশিরভাগ সত্য", className: "verdict--mostly-true", tierNote: "মূল তথ্য সঠিক, কিছু অংশ অতিরঞ্জিত" },
  half: { label: "আংশিক সত্য", className: "verdict--half", tierNote: "আংশিক সঠিক, আংশিক ভুল বা অর্ধসত্য" },
  "mostly-false": { label: "বেশিরভাগ মিথ্যা", className: "verdict--mostly-false", tierNote: "অধিকাংশ দাবি ভুল, অল্প অংশ সত্য" },
  false: { label: "মিথ্যা", className: "verdict--false", tierNote: "দাবিটি যাচাইয়ে ভুল প্রমাণিত" },
  misleading: { label: "বিভ্রান্তিকর", className: "verdict--misleading", tierNote: "প্রসঙ্গ বাদ দিয়ে বিভ্রান্তি তৈরি করে" },
  unverifiable: { label: "যাচাই করা যায়নি", className: "verdict--unverifiable", tierNote: "নির্ভরযোগ্য সূত্রে প্রমাণ করা যায়নি" },
};

export const getVerdict = (factCheck) =>
  factCheck?.verdict ? VERDICTS[factCheck.verdict] ?? null : null;

export const wordCount = (text = "") => text.trim().split(/\s+/).filter(Boolean).length;
export { SITE as siteIdentity };