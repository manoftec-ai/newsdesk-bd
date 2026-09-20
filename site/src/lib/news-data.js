import { getCollection } from "astro:content";
export { SITE, authors, categories, tags, CONTACT, NAVIGATION, MORE_NAVIGATION } from "../config/theme.config.ts";
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
  [...(await posts())].sort((a, b) => (a.date < b.date ? 1 : -1));

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

export const BADGES = {
  verified: {
    label: "যাচাইকৃত",
    tierNote: "অফিসিয়াল সূত্রে নিশ্চিত · প্রকাশের জন্য সম্পূর্ণ প্রস্তুত",
    className: "badge--verified",
  },
  confirmed: {
    label: "নিশ্চিত",
    tierNote: "একাধিক বিশ্বস্ত পত্রিকা একমত · নিয়মিত সংবাদের জন্য যথেষ্ট",
    className: "badge--confirmed",
  },
  partial: {
    label: "একক/আংশিক",
    tierNote: "একক সূত্র বা আংশিক তথ্য · নিয়মিত সংবাদের জন্য প্রযোজ্য",
    className: "badge--partial",
  },
  suspect: {
    label: "সন্দেহজনক",
    tierNote: "যাচাই করা যায়নি বা অসঙ্গতি রয়েছে · প্রকাশযোগ্য নয়",
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