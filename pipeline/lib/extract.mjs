// lib/extract.mjs — EXTRACT stage (ARCHITECTURE.md §10 Phase 5)
// Deterministic story brief from a cluster + verdict. No AI here: it gathers the
// facts/sources/evidence the writer (opencode, provider-swap) turns into a story.
// Flow: cluster(mature) -> verdict(passed) -> brief -> synth(writer) -> draft .md.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { openDb } from './db.mjs';
import { loadConfig, tierForCategory } from './config.mjs';
import { loadTrust } from './verify.mjs';

export const BRIEFS_DIR = resolve(import.meta.dirname, '../state/briefs');

// Deterministic site category from a raw source category.
// Map raw category -> site category slug (theme.config categories), fallback 'national'.
const RAW_TO_SITE = {
  'রাজনীতি': 'politics', 'জাতীয়': 'national', 'অর্থনীতি': 'economy',
  'অর্থ-বাণিজ্য': 'economy', 'বাণিজ্য': 'economy', 'আন্তর্জাতিক': 'international',
  'বিশ্ব সংবাদ': 'international', 'ক্রীড়া': 'sports', 'খেলা': 'sports',
  'ক্রিকেট': 'sports', 'ফুটবল': 'sports', 'অন্য খেলা': 'sports', 'অন্যান্য খেলা': 'sports',
  'বিনোদন': 'entertainment', 'ঢালিউড': 'entertainment', 'লাইফস্টাইল': 'entertainment',
  'প্রযুক্তি': 'tech', 'টেক': 'tech', 'বিজ্ঞান': 'tech',
  'মতামত/বিশ্লেষণ': 'opinion', 'কলাম': 'opinion', 'শিল্প সাহিত্য': 'opinion',
  'শিক্ষা': 'national', 'স্বাস্থ্য': 'national', 'ঢাকা': 'national', 'মেট্রো': 'national',
  'আবহাওয়া': 'national',
};
export function siteCategory(raw) {
  return RAW_TO_SITE[String(raw ?? '').trim()] ?? 'national';
}

export const SITE_CATEGORIES = ['national', 'politics', 'economy', 'international', 'sports', 'entertainment', 'tech', 'opinion'];

// Latinize a headline for slug keywords. Bengali -> rough ascii via a small map of
// common words; unknown tokens drop out. Result: lowercase A-Z, 0-9, hyphen.
const BN_TO_EN = {
  'ডেঙ্গু': 'dengue', 'মৃত্যু': 'deaths', 'বাস': 'bus', 'রেলপথ': 'rail', 'হোটেলে': 'hotel',
  'হোটেল': 'hotel', 'মহাসড়কে': 'highway', 'মহাসড়ক': 'highway', 'আগুন': 'fire', 'ভর্তি': 'admission',
  'হাসপাতালে': 'hospital', 'হাসপাতাল': 'hospital', 'বাজেট': 'budget', 'অর্থমন্ত্রী': 'finance-minister',
  'মানসন্ত্রী': 'minister', 'রপ্তানি': 'exports', 'আয়': 'income', 'ঝড়': 'storm', 'ঝড়': 'storm',
  'বৈঠকে': 'meeting', 'নির্বাচন': 'election', 'সেমিফাইনালে': 'semi-final', 'খেলোয়াড়': 'players',
  'চুক্তি': 'deal', 'সড়ক': 'road', 'নিরাপত্তা': 'security', 'ভারত': 'india', 'মিয়ানমার': 'myanmar',
  'বাংলাদেশ': 'bangladesh', 'বঙ্গবন্ধু': 'bangabandhu', 'সরকার': 'government', 'মন্ত্রী': 'minister',
  'সম্পদ': 'property', 'পরীক্ষা': 'exam', 'শিক্ষার্থী': 'students', 'কৃষ্ণ': 'krishna',
};
function latinize(word) {
  if (/^[a-zA-Z0-9]+$/.test(word)) return word.toLowerCase();
  for (const [bn, en] of Object.entries(BN_TO_EN)) {
    if (word === bn || word.includes(bn)) return en;
  }
  return '';
}
export function slugFromHeadline(headline, { categorySlug = 'news', clusterId } = {}) {
  const words = String(headline ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .map(latinize).filter(Boolean);
  const kw = (words.slice(0, 3).join('-') || String(clusterId ?? 'story')).slice(0, 48).replace(/-$/, '');
  return `${categorySlug}-${kw}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

// Body excerpt limited to a plain-text lead (used as evidence, never full reprint).
function excerptOf(body, n = 220) {
  const plain = String(body ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.slice(0, n) + (plain.length > n ? '…' : '');
}

// Build one story brief from a cluster id. Returns null if not writable.
export function buildBrief(clusterId, { db } = {}) {
  const store = db ?? openDb();
  const cluster = store.prepare('SELECT * FROM clusters WHERE id = ?').get(clusterId);
  if (!cluster) return null;
  const verdict = store.prepare('SELECT * FROM verdicts WHERE cluster_id = ?').get(clusterId);
  const members = store.prepare(
    `SELECT cm.item_id, r.source_id, r.title, r.url, r.body, r.published_at, r.category, r.lang
     FROM cluster_members cm JOIN raw_items r ON cm.item_id = r.id
     WHERE cm.cluster_id = ? ORDER BY r.published_at ASC`
  ).all(clusterId);

  const sources = [];
  const sourceNames = {
    prothomalo: 'প্রথম আলো', ittefaq: 'দৈনিক ইত্তেফাক', samakal: 'সমকাল',
    dainikbangla: 'দৈনিক বাংলা', dhakatribune: 'Dhaka Tribune', dailystar: 'The Daily Star',
    banglatribune: 'বাংলা ট্রিবিউন', bdnews24: 'বিডিনিউজ২৪', independent: 'The Independent',
    deshrupantor: 'দেশ রূপান্তর', atom: 'এটিএন বাংলা', channeli: 'চ্যানেল আই',
  };
  const seenSource = new Set();
  for (const m of members) {
    if (!seenSource.has(m.source_id)) { seenSource.add(m.source_id); }
    sources.push({
      name: sourceNames[m.source_id] ?? m.source_id,
      url: m.url,
    });
  }

  const rawCats = [...new Set(members.map((m) => m.category).filter(Boolean))];
  const category = siteCategory(rawCats[0] ?? 'জাতীয়');
  const tier = verdict?.tier ?? 'B';
  const slug = slugFromHeadline(cluster.headline, { categorySlug: category, clusterId: cluster.id });

  const evidence = [];
  if (verdict) {
    const signals = JSON.parse(verdict.signals_json || '[]');
    for (const s of signals) {
      evidence.push({
        type: s.type,
        label: s.note ? `${s.note} (${s.source ?? ''})` : (s.source ?? s.type),
      });
    }
  }

  const firstDate = members.map((m) => m.published_at).filter(Boolean).sort()[0]
    ?? cluster.first_seen;

  return {
    clusterId: cluster.id,
    slug,
    status: cluster.status,
    headline: cluster.headline,
    category,
    tier,
    date: firstDate,
    verdict: verdict ? { badge: verdict.badge, tier: verdict.tier, score: verdict.score, status: verdict.status } : null,
    rawCategories: rawCats,
    members: members.map((m) => ({
      source_id: m.source_id,
      title: m.title,
      url: m.url,
      published_at: m.published_at,
      category: m.category,
      lang: m.lang,
      lead: excerptOf(m.body),
    })),
    sources,
    evidence,
  };
}

// Write brief JSON per writable cluster. Mode:
//   all      -> every cluster with a verdict
//   passed   -> only verdict.status == 'passed' (default, publishable)
export function exportBriefs({ status = 'passed' } = {}) {
  const db = openDb();
  const query = status === 'passed'
    ? db.prepare(`SELECT v.cluster_id FROM verdicts v JOIN clusters c ON c.id=v.cluster_id WHERE v.status=?`).all('passed')
    : db.prepare(`SELECT v.cluster_id FROM verdicts v`).all();
  mkdirSync(BRIEFS_DIR, { recursive: true });
  let written = 0, skipped = 0;
  for (const { cluster_id } of query) {
    const brief = buildBrief(cluster_id, { db });
    if (!brief || !brief.verdict) { skipped++; continue; }
    const f = join(BRIEFS_DIR, `${brief.slug}.json`);
    writeFileSync(f, JSON.stringify(brief, null, 2) + '\n');
    written++;
  }
  console.log(`extract done. briefs written=${written} skipped=${skipped} dir=${BRIEFS_DIR}`);
  return written;
}

// Merge a sources-array into a unique list (dedupe by url).
export function uniqueSources(sources) {
  const seen = new Map();
  for (const s of sources) if (!seen.has(s.url)) seen.set(s.url, s);
  return [...seen.values()];
}

export function briefExists(slug) {
  return existsSync(join(BRIEFS_DIR, `${slug}.json`));
}