// tools/telegram_post.mjs — post the latest published story to a Telegram channel.
// Secret-gated: if TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing this exits 0
// (skips) so the workflow stays green until credentials are added.
// Sends at most ONE story per run (the newest not yet sent), so a backlog drains
// one post per scheduled run and the channel never gets spammed.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const CONTENT_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const STATE_FILE = resolve(import.meta.dirname, '../state/telegram-sent.json');

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

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

const escapeHtml = (value = '') =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
  if (!token || !chatId) {
    console.log('telegram_post: no TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID — skipping');
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
    console.log('telegram_post: nothing new to post');
    return { sent: false, reason: 'nothing-new' };
  }

  const categoryName = CATEGORY_NAMES[target.category] ?? target.category;
  const badgeLabel = BADGE_LABELS[target.badge] ?? BADGE_LABELS.partial;
  const hashtags = (target.tags ?? [])
    .slice(0, 4)
    .map((t) => `#${t.replace(/[^a-z0-9]/gi, '')}`)
    .join(' ');
  const url = `https://newsdesk-bd.vercel.app/article/${encodeURIComponent(target.slug)}`;

  const text = `🆕 ${escapeHtml('নিউজডেস্ক বিডি')}\n\n<b>${escapeHtml(target.title)}</b>\n\n${escapeHtml(categoryName)} · ${badgeLabel}\n\n${url}${hashtags ? `\n\n${hashtags}` : ''}`;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: String(chatId).trim(), parse_mode: 'HTML', disable_web_page_preview: true, text }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) {
    console.error('telegram_post: send failed', json);
    return { sent: false, reason: 'send-failed' };
  }

  sent.add(target.slug);
  writeFileSync(STATE_FILE, JSON.stringify({ sent: [...sent].sort() }, null, 2) + '\n');
  console.log(`telegram_post: posted ${target.slug}`);
  return { sent: true, slug: target.slug };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((r) => {
      if (!r.sent) process.exit(0);
    })
    .catch((error) => {
      console.error('telegram_post: unexpected error', error);
      process.exit(1);
    });
}