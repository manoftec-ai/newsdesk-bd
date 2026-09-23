import { getCollection } from "astro:content";
export { SITE, SEO, authors, categories, tags, CONTACT, NAVIGATION, MORE_NAVIGATION } from "../config/theme.config.ts";
import { SITE, authors, categories, tags } from "../config/theme.config.ts";

const isoDate = (date) => date?.toISOString().slice(0, 10);
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

export const posts = async () =>
  (await getCollection("news", ({ data }) => !data.draft)).map(normalizePost);

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

export const featuredPost = async () => {
  const sorted = await sortedPosts();
  return sorted.find((post) => post.featured) ?? sorted[0];
};

export const breakingItems = async (n = 5) =>
  (await sortedPosts()).filter((post) => post.breaking).slice(0, n);

export const popularPosts = async (n = 4) => (await sortedPosts()).slice(0, n);

export const relatedPosts = async (post, n = 3) =>
  (await sortedPosts())
    .filter((candidate) => candidate.slug !== post.slug)
    .sort((a, b) => {
      const score = (candidate) =>
        (candidate.category === post.category ? 2 : 0) +
        candidate.tags.filter((tag) => post.tags.includes(tag)).length;
      return score(b) - score(a);
    })
    .slice(0, n);

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
  suspect: {
    label: "সন্দেহজনক",
    tierNote: "নির্ভরযোগ্য সূত্রে যাচাই করা যায়নি, তাই প্রকাশযোগ্য নয়",
    className: "badge--suspect",
  },
};

export const getBadge = (post) => {
  const key = post.verification?.badge ?? "partial";
  return { key, ...BADGES[key] ?? BADGES.partial };
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