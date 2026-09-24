// lib/verify.mjs — VERIFY engine (ARCHITECTURE.md §4A)
// Currently corroboration-based (multi-source reputation). Official/search/FB signal
// gathering plugs in as a provider later (SearXNG self-hosted) — same score model.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadTrust() {
  const raw = readFileSync(join(__dirname, '..', 'config', 'trust.json'), 'utf8');
  return JSON.parse(raw);
}

// Raw source-category string -> site tier (fail-closed: unknown => A).
const CATEGORY_TIER = {
 রাজনীতি: 'A', জাতীয়: 'A', অর্থনীতি: 'A', আন্তর্জাতিক: 'A',
  'অর্থ-বাণিজ্য': 'A', বাণিজ্য: 'A', 'বিশ্ব সংবাদ': 'A', Business: 'A', World: 'A',
  ক্রীড়া: 'B', খেলা: 'B', ক্রিকেট: 'B', ফুটবল: 'B', 'অন্য খেলা': 'B',
  'অন্যান্য খেলা': 'B', 'অন্যান্য': 'B', Sports: 'B', Showtime: 'B',
  বিনোদন: 'B', ঢালিউড: 'B', 'লাইফস্টাইল': 'B',
  প্রযুক্তি: 'B', টেক: 'B', বিজ্ঞান: 'B',
  'মতামত/বিশ্লেষণ': 'C', Opinion: 'C', কলাম: 'C', 'শিল্প সাহিত্য': 'C', ইসলাম: 'C', ধর্ম: 'C',
};
export function categoryTier(cat) {
  if (!cat) return 'A';
  return CATEGORY_TIER[String(cat).trim()] ?? 'A';
}
const TIER_SEVERITY = { A: 3, B: 2, C: 1 };

// A cluster's tier = most severe tier among its member categories.
export function clusterTier(items) {
  let worst = 1;
  for (const it of items) {
    const sev = TIER_SEVERITY[categoryTier(it.category)];
    if (sev > worst) worst = sev;
  }
  return worst === 3 ? 'A' : worst === 2 ? 'B' : 'C';
}

export function defaultVerifyConfig() {
  return {
    paper_points: 2,
    official_points: 3,
    eyewitness_points: 0.5,
    contradiction_penalty: -1,
    verified_min: 5,
    confirmed_min: 3,
    single_val: 2,
    min_badge: { A: 'confirmed', B: 'single', C: 'single' },
  };
}

const BADGE_RANK = { skeptical: 0, single: 1, confirmed: 2, verified: 3 };

// Evaluate one cluster. `members` = rows of its raw_items (id, source_id, category).
// Returns { tier, score, badge, status, signals }.
export function evaluateCluster(members, cfg, trust, vcfg = defaultVerifyConfig()) {
  const signals = [];
  let score = 0;
  const distinct = new Set();
  for (const m of members) {
    const rep = trust.sources[m.source_id] ?? 'top';
    if (rep === 'official' || rep === 'agency') {
      const pts = vcfg.official_points;
      score += pts;
      signals.push({ type: 'official', source: m.source_id, points: pts, note: 'official/agency channel' });
    } else {
      if (!distinct.has(m.source_id)) {
        distinct.add(m.source_id);
        const pts = vcfg.paper_points;
        score += pts;
        signals.push({ type: 'paper', source: m.source_id, points: pts, note: 'reputable paper corroboration' });
      }
    }
  }
  const hasOfficial = signals.some((s) => s.type === 'official');
  const badge = hasOfficial && score >= vcfg.verified_min ? 'verified'
    : score >= vcfg.confirmed_min ? 'confirmed'
    : score >= vcfg.single_val ? 'single'
    : 'skeptical';
  const tier = clusterTier(members);
  const minB = vcfg.min_badge[tier];
  let status = score <= vcfg.single_val - 1 ? 'human_check'           // skeptical: never publish automatically
    : BADGE_RANK[badge] < BADGE_RANK[minB] ? 'human_check'              // below tier floor
    : 'passed';
  // Automation-only enforcement: publish only when status==='passed'
  // Tier A: require badge >= tier floor (confirmed minimum) and passed status.
  if (status !== 'passed') status = 'human_check';
  return { tier, score, badge, status, signals };
}

export function loadVerifyConfig(cfg) {
  const v = cfg.verify ?? {};
  const def = defaultVerifyConfig();
  return {
    ...def,
    ...v,
    min_badge: { ...def.min_badge, ...(v.min_badge ?? {}) },
  };
}