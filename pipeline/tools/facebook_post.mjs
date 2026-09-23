// tools/facebook_post.mjs — post the latest published story to a Facebook Page.
// Secret-gated: if FACEBOOK_PAGE_ID or FACEBOOK_PAGE_TOKEN is missing this exits 0
// (skips) so the workflow stays green until credentials are added.
// Sends at most ONE story per run (the newest not yet sent), so a backlog drains
// one post per scheduled run and the page never gets spammed.
// Uses the Page Graph API (POST /{page-id}/feed). The FB link scraper pulls the
// og:title / og:description / og:image from the article page automatically.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const CONTENT_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const STATE_FILE = resolve(import.meta.dirname, '../state/facebook-sent.json');
const GRAPH_VERSION = 'v21.0';

const pageId = process.env.FACEBOOK_PAGE_ID;
const pageToken = process.env.FACEBOOK_PAGE_TOKEN;

const CATEGORY_NAMES = {
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

const BADGE_LABELS = {
  verified: '✅ যাচাইকৃত',
  confirmed: '🔵 নিশ্চিত',
  partial: '🟠 একক/আংশিক',
  suspect: '🔴 সন্দেহজনক',
};

export function readFrontmatter(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try {
    const fm = yaml.parse(m[1]);
    return { raw, fm };
  } catch {
    return null;
  }
}

export function latestUnsent(unsent) {
  if (!unsent.length) return null;
  return unsent.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

export async function main() {
  if (!pageId || !pageToken) {
    console.log('facebook_post: no FACEBOOK_PAGE_ID/FACEBOOK_PAGE_TOKEN — skipping');
    return { sent: false, reason: 'no-secrets' };
  }

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const posts = [];
  for (const file of files) {
    const parsed = readFrontmatter(join(CONTENT_DIR, file));
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

  const sentState = existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : { sent: [] };
  const sent = new Set(sentState.sent ?? []);

  const target = latestUnsent(posts.filter((p) => p.date && !sent.has(p.slug)));
  if (!target) {
    console.log('facebook_post: nothing new to post');
    return { sent: false, reason: 'nothing-new' };
  }

  const categoryName = CATEGORY_NAMES[target.category] ?? target.category;
  const badgeLabel = BADGE_LABELS[target.badge] ?? BADGE_LABELS.partial;
  const hashtags = (target.tags ?? [])
    .slice(0, 4)
    .map((t) => `#${t.replace(/[^a-z0-9]/gi, '')}`)
    .join(' ');
  const url = `https://jachaidesk.com/article/${encodeURIComponent(target.slug)}`;

  const message = `🆕 জাচাইডেস্ক

${target.title}

${categoryName} · ${badgeLabel}

${url}${hashtags ? `\n\n${hashtags}` : ''}`;

  const body = new URLSearchParams({
    message,
    link: url,
    access_token: pageToken,
  });

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${String(pageId).trim()}/feed`,
    { method: 'POST', body },
  );
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    console.error('facebook_post: send failed', json.error ?? json);
    return { sent: false, reason: 'send-failed' };
  }

  sent.add(target.slug);
  writeFileSync(STATE_FILE, JSON.stringify({ sent: [...sent].sort() }, null, 2) + '\n');
  console.log(`facebook_post: posted ${target.slug}`);
  return { sent: true, slug: target.slug };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((r) => {
      if (!r.sent) process.exit(0);
    })
    .catch((error) => {
      console.error('facebook_post: unexpected error', error);
      process.exit(1);
    });
}