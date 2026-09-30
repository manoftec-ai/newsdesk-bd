#!/usr/bin/env node
// tools/promote_developing.mjs — instant lane: first-sighting stories go live
// WITHOUT waiting for corroboration or maturity, badged developing.
//
// WHY (2026-09-30): the pipeline only ever published multi-member clusters
// after 2-3 quiet runs, so fresh events surfaced hours late stamped with old
// hours. Singletons never even became clusters (cmdCluster skips them), which
// meant a big story reported by one outlet first could not publish at all
// until a second outlet happened to cluster with it - and then still waited
// out maturity. The developing lane publishes a qualifying first sighting
// immediately, and the watch windows (2h active + 6h recycle) upgrade it when
// corroboration arrives.
//
// WHAT IT DOES: scans recent raw_items for Tier-A, fat-bodied, direct-URL
// items that belong to NO cluster yet, and creates a solo cluster row for up
// to --max of them (newest first). The normal verify step then scores them
// (a solo Tier-A paper passes with badge single), extract writes their briefs
// (flagged developing), and pick/finalize publish them through the developing
// maturity exemption - every other gate still applies.
//
// SAFETY: dry-run by default. Nothing is written without --write.
//   node tools/promote_developing.mjs --max=5                 # dry run
//   node tools/promote_developing.mjs --max=5 --write         # persist
//   node tools/promote_developing.mjs --max=5 --write --window-hours=6
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDb, DB_PATH, insertCluster, addClusterMembers, touchCluster } from '../lib/db.mjs';
import { loadConfig } from '../lib/config.mjs';
import { loadTrust, loadVerifyConfig, categoryTier, evaluateCluster } from '../lib/verify.mjs';
import { googleNewsArticleId } from '../lib/fetch.mjs';
import { loadPublishedTitles, isTitleDuplicate } from '../lib/published.mjs';
import { evidenceSufficiency, DEFAULT_MIN_EVIDENCE_WORDS } from '../lib/editorial.mjs';

const HERE = import.meta.dirname;
const SITE_DIR = resolve(HERE, '../../site/src/content/news');

const arg = (n, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const WRITE = process.argv.includes('--write');
const MAX = Number(arg('max', '5')) || 5;
const WINDOW_HOURS = Number(arg('window-hours', '3')) || 3;
const MIN_EVIDENCE = Number(process.env.MIN_EVIDENCE_WORDS) || DEFAULT_MIN_EVIDENCE_WORDS;

// Sources measured unable to enrich (Cloudflare 403 / hollow pages). A body
// we cannot fetch is a headline, and a headline can never clear the evidence
// floor - promoting it would publish stubs. Mirrors enrich_bodies --skip-unusable.
function unusableSources() {
  const out = new Set();
  try {
    const y = JSON.parse(readFileSync(new URL('../config/source-yield.json', import.meta.url), 'utf8'));
    for (const bucket of ['hollow', 'blocked']) {
      for (const id of Object.keys(y[bucket] ?? {})) if (id !== '_comment') out.add(id);
    }
  } catch { /* no yield file: skip nothing */ }
  return out;
}

const trust = loadTrust();
const cfg = loadConfig();
const verifyCfg = loadVerifyConfig(cfg);
const unusable = unusableSources();
const publishedTitles = existsSync(SITE_DIR) ? loadPublishedTitles(SITE_DIR) : new Map();

// Pure candidate selection (exported for tests): newest first, first hit wins.
export function selectDeveloping(rows, { max = MAX, minEvidence = MIN_EVIDENCE, trust: t = trust, unusable: u = unusable, published = publishedTitles } = {}) {
  const picked = [];
  const skipped = {};
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  for (const row of rows) {
    if (picked.length >= max) break;
    if (((t.sources ?? {})[row.source_id] ?? 'top') !== 'top') { skip('source-not-top'); continue; }
    if (u.has(row.source_id)) { skip('source-unenrichable'); continue; }
    if (googleNewsArticleId(row.url)) { skip('gnews-wrapper'); continue; }
    if (categoryTier(row.category) !== 'A') { skip('category-not-A'); continue; }
    const ev = evidenceSufficiency({ members: [{ lead: row.body }] }, { min: minEvidence });
    if (!ev.pass) { skip('thin-body'); continue; }
    if (isTitleDuplicate(row.title, row.published_at, published)) { skip('title-dup'); continue; }
    picked.push(row);
  }
  return { picked, skipped };
}

export function main() {
  const db = openDb(DB_PATH);
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const rows = db.prepare(`
    SELECT r.id, r.source_id, r.title, r.url, r.body, r.published_at, r.category, r.seen_at
    FROM raw_items r LEFT JOIN cluster_members cm ON cm.item_id = r.id
    WHERE r.seen_at >= ? AND r.dup_of_id IS NULL AND cm.item_id IS NULL
    ORDER BY r.published_at DESC
  `).all(since);
  console.log(`developing scan: ${rows.length} unclustered recent items (window ${WINDOW_HOURS}h)`);

  const { picked, skipped } = selectDeveloping(rows);
  console.log(`developing candidates: ${picked.length}/${rows.length} (cap ${MAX})`);
  for (const [k, v] of Object.entries(skipped).sort((a, b) => b[1] - a[1])) {
    console.log(`  skipped ${v}: ${k}`);
  }

  if (!WRITE) {
    for (const p of picked) console.log(`  would promote: ${p.source_id} ${(p.title || '').slice(0, 70)}`);
    console.log('DRY RUN - add --write to persist.');
    db.close();
    return;
  }

  const created = [];
  for (const row of picked) {
    const clusterId = insertCluster(db, { status: 'open', headline: row.title });
    addClusterMembers(db, clusterId, [{ item_id: row.id, source_id: row.source_id }]);
    touchCluster(db, clusterId, { status: 'open', headline: row.title, memberCount: 1, matureRuns: 0 });
    const ev2 = evaluateCluster([{ source_id: row.source_id, category: row.category }], cfg, trust, verifyCfg);
    db.prepare(
      'INSERT INTO verdicts (cluster_id,tier,score,badge,status,signals_json,evaluated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(cluster_id) DO UPDATE SET tier=excluded.tier, score=excluded.score, badge=excluded.badge, status=excluded.status, signals_json=excluded.signals_json, evaluated_at=excluded.evaluated_at',
    ).run(clusterId, ev2.tier, ev2.score, ev2.badge, ev2.status, JSON.stringify(ev2.signals ?? []), new Date().toISOString());
    created.push(clusterId);
    console.log(`  +cluster ${clusterId} [${ev2.badge}/${ev2.status}] ${(row.title || '').slice(0, 70)}`);
  }
  console.log(`promoted ${created.length} solo cluster(s) - verify/extract will brief them next.`);
  db.close();
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
