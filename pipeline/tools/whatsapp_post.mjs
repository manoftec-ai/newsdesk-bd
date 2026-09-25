// tools/whatsapp_post.mjs — post the latest published story to WhatsApp (Cloud API).
// Secret-gated: if WHATSAPP_TOKEN / WHATSAPP_PHONE_ID / WHATSAPP_TO missing exits 0 (skips) so workflow stays green until credentials are added.
// Sends at most ONE story per run (newest not yet sent), drains backlog one per run.
// Uses WhatsApp Cloud API POST https://graph.facebook.com/v21.0/{phoneId}/messages (text). For Channels, replace with Channels API when available — same secret gate.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

const CONTENT_DIR = resolve(import.meta.dirname, '../../site/src/content/news');
const STATE_FILE = resolve(import.meta.dirname, '../state/whatsapp-sent.json');

const token = process.env.WHATSAPP_TOKEN;
const phoneId = process.env.WHATSAPP_PHONE_ID;
const to = process.env.WHATSAPP_TO;

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
  try { raw = readFileSync(file, 'utf8'); } catch { return null; }
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  try { return { raw, fm: yaml.parse(m[1]) }; } catch { return null; }
}

export function latestUnsent(unsent) {
  if (!unsent.length) return null;
  return unsent.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

export async function main() {
  if (!token || !phoneId || !to) {
    console.log('whatsapp_post: no WHATSAPP_TOKEN/PHONE_ID/TO — skipping');
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
    });
  }

  const sentState = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : { sent: [] };
  const sent = new Set(sentState.sent ?? []);
  const target = latestUnsent(posts.filter((p) => p.date && !sent.has(p.slug)));
  if (!target) {
    console.log('whatsapp_post: nothing new to post');
    return { sent: false, reason: 'nothing-new' };
  }

  const categoryName = CATEGORY_NAMES[target.category] ?? target.category;
  const badgeLabel = BADGE_LABELS[target.badge] ?? BADGE_LABELS.partial;
  const url = `https://jachaidesk.com/article/${encodeURIComponent(target.slug)}`;
  const text = `🆕 যাচাইডেস্ক\n\n${target.title}\n\n${categoryName} · ${badgeLabel}\n\n${url}`;

  const response = await fetch(`https://graph.facebook.com/v21.0/${String(phoneId).trim()}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: String(to).trim(), type: 'text', text: { preview_url: true, body: text } }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    console.error('whatsapp_post: send failed', json.error ?? json);
    return { sent: false, reason: 'send-failed' };
  }

  sent.add(target.slug);
  writeFileSync(STATE_FILE, JSON.stringify({ sent: [...sent].sort() }, null, 2) + '\n');
  console.log(`whatsapp_post: posted ${target.slug}`);
  return { sent: true, slug: target.slug };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().then((r) => { if (!r.sent) process.exit(0); }).catch((e) => { console.error('whatsapp_post: unexpected error', e); process.exit(1); });
}
