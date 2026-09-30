// lib/social-post-text.mjs — shared post-text formatting + queue selection for social distribution.
// Source of truth for the Bengali post format so the Graph API path (facebook_post.mjs) and the
// browser path (facebook_web_post.mjs) can never drift apart.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'yaml';

export const BRAND = 'যাচাইডেস্ক';

export const SITE_URL = 'https://jachaidesk.com';

export const CATEGORY_NAMES = {
  national: 'জাতীয়',
  politics: 'রাজনীতি',
  economy: 'অর্থনীতি',
  international: 'আন্তর্জাতিক',
  sports: 'ক্রীড়া',
  entertainment: 'বিনোদন',
  tech: 'প্রযুক্তি',
  opinion: 'মতামত/বিশ্লেষণ',
  factcheck: 'ফ্যাক্ট চেক',
};

export const BADGE_LABELS = {
  verified: '✅ যাচাইকৃত',
  confirmed: '🔵 নিশ্চিত',
  partial: '🟠 একক/আংশিক',
  suspect: '🔴 সন্দেহজনক',
};

export function articleUrl(slug) {
  return `${SITE_URL}/article/${encodeURIComponent(slug)}`;
}

export function categoryLabel(category) {
  return CATEGORY_NAMES[category] ?? category ?? '';
}

export function badgeLabel(badge) {
  return BADGE_LABELS[badge] ?? BADGE_LABELS.partial;
}

// The post ends with the article URL on purpose: both the Graph API and the Business Suite
// composer auto-generate a link preview from a bare URL in the body, so no separate link
// field is needed and the two transports stay identical.
export function formatHashtags(tags = []) {
  return tags
    .slice(0, 4)
    .map((t) => `#${String(t).replace(/[^a-z0-9]/gi, '')}`)
    .filter((t) => t.length > 1)
    .join(' ');
}

export function formatPostText(post) {
  const url = post.url ?? articleUrl(post.slug);
  const hashtags = formatHashtags(post.tags ?? []);
  const body = `🆕 ${BRAND}\n\n${post.title}\n\n${categoryLabel(post.category)} · ${badgeLabel(post.badge)}\n\n${url}`;
  return hashtags ? `${body}\n\n${hashtags}` : body;
}

export function readFrontmatter(file) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch { return null; }
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try { return { raw, fm: yaml.parse(m[1]) }; } catch { return null; }
}

export function sortNewestFirst(posts) {
  return [...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function collectPostCandidates(files, contentDir) {
  const posts = [];
  for (const file of files) {
    const parsed = readFrontmatter(join(contentDir, file));
    if (!parsed || parsed.fm.draft) continue;
    posts.push({
      slug: file.replace(/\.md$/, ''),
      date: parsed.fm.date ?? '',
      title: String(parsed.fm.title ?? ''),
      category: parsed.fm.category ?? '',
      badge: parsed.fm.verification?.badge ?? 'partial',
      tags: parsed.fm.tags ?? [],
    });
  }
  return posts;
}

// One story per run is the Graph API behaviour; the browser path drains a backlog in one
// session, so callers pass the limit they actually want.
export function pendingPosts(posts, sent, limit = 1) {
  const newest = sortNewestFirst(posts.filter((p) => p.date && !sent.has(p.slug)));
  return limit === Infinity ? newest : newest.slice(0, limit);
}

// Randomised inter-post gap so a 40-story batch does not read as a machine.
export function humanDelayMs(minMs = 1500, maxMs = 4500, rng = Math.random) {
  const lo = Math.max(0, Math.min(minMs, maxMs));
  const hi = Math.max(lo, Math.max(minMs, maxMs));
  return Math.round(lo + rng() * (hi - lo));
}