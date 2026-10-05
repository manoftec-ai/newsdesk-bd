// run.js — pipeline CLI dispatcher. Usage:
//   node run.js fetch [--limit=N]      fetch all active sources into store.db
//   node run.js normalize              clean + dedupe raw_items
//   node run.js cluster                group same-topic items into clusters (open→mature)
// Later stages (verify/extract/synth) append here per ARCHITECTURE.md.
import { loadConfig, activeSources } from './lib/config.mjs';
import {
  openDb, insertRawItem, logFetch, recentItems, existingClusters, clusterMemberSets,
  insertCluster, addClusterMembers, touchCluster,
} from './lib/db.mjs';
import { fetchSource } from './lib/fetch.mjs';
import { normalizeTitle, titleSimilarity, tokens } from './lib/normalize.mjs';
import { findClusters, pickClusterHeadline } from './lib/cluster.mjs';
import { loadTrust, evaluateCluster, loadVerifyConfig } from './lib/verify.mjs';
import { exportBriefs, buildBrief } from './lib/extract.mjs';
import { listBriefs, loadBrief, writingPrompt, storyExists } from './lib/synth.mjs';

const [, , cmd, ...rest] = process.argv;
const LIMIT = Number(rest.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0);

async function cmdFetch() {
  const cfg = loadConfig();
  const db = openDb();
  const sources = activeSources(cfg);
  let inserted = 0, skipped = 0, errored = 0;
  for (const source of sources) {
    try {
      const { items, feedMeta } = await fetchSource(source);
      const pool = LIMIT > 0 ? items.slice(0, LIMIT) : items;
      for (const it of pool) {
        const r = insertRawItem(db, it);
        if (r.inserted) inserted++; else skipped++;
      }
      logFetch(db, { source_id: source.id, http_status: 200, etag: feedMeta.etag, modified: feedMeta.modified, item_count: pool.length });
      console.log(`[fetch] ${source.id.padEnd(14)} ${String(pool.length).padStart(3)} items  (${inserted} new / ${skipped} dup-ignored)`);
    } catch (e) {
      errored++;
      console.error(`[fetch] ${source.id}: ERROR ${e.message}`);
    }
  }
  console.log(`\nfetch done. new=${inserted} dup=${skipped} sources_failed=${errored}`);
}

async function cmdNormalize() {
  const cfg = loadConfig();
  const db = openDb();
  // 1. clean titles/bodies, 2. exact-url dedupe already handled by UNIQUE(url), 3. near-dup title matching
  const rows = db.prepare('SELECT id, source_id, title, body, published_at, category FROM raw_items WHERE dup_of_id IS NULL ORDER BY id').all();
  let duped = 0;
  // 2026-10-05: near-dup scan was O(n^2) over ~19k rows (~177M pairwise
  // comparisons, ~17 min on CI). Block by bigram inversion: two titles can
  // only clear the >0 Dice threshold if they share at least one adjacent
  // token bigram, so we only ever score those pairs. Result identical,
  // runtime ~seconds.
  const bigramIndex = new Map(); // bigram -> [seen row ids]
  const seenRows = [];
  const bigramsOf = (title) => {
    const tk = tokens(title);
    const gs = new Set();
    for (let i = 0; i < tk.length - 1; i++) gs.add(tk[i] + ' ' + tk[i + 1]);
    return gs;
  };
  for (const row of rows) {
    const t = normalizeTitle(row.title);
    const gs = bigramsOf(t);
    const candidates = new Set();
    for (const g of gs) {
      for (const idx of (bigramIndex.get(g) || [])) candidates.add(idx);
    }
    let dupTarget = null;
    for (const idx of candidates) {
      const s = seenRows[idx];
      if (titleSimilarity(s.title, t) >= cfg.poll.dedupe_title_similarity) { dupTarget = s.id; break; }
    }
    if (dupTarget) {
      db.prepare('UPDATE raw_items SET dup_of_id = ? WHERE id = ?').run(dupTarget, row.id);
      duped++;
    } else {
      const idx = seenRows.length;
      seenRows.push({ title: t, id: row.id });
      for (const g of gs) {
        if (!bigramIndex.has(g)) bigramIndex.set(g, []);
        bigramIndex.get(g).push(idx);
      }
    }
  }
  const total = db.prepare('SELECT COUNT(*) c FROM raw_items').get().c;
  console.log(`normalize done. total=${total} near-dup marked=${duped}`);
}

async function cmdCluster() {
  const cfg = loadConfig();
  const db = openDb();
  const windowH = cfg.poll.cluster_window_hours ?? 8;
  const sim = cfg.poll.cluster_similarity ?? 0.3;
  // HYBRID strong-token agreement (P0-9): merges same-event items worded
  // differently (numbers/rare-vocab signal) on top of cosine. Golden F1 1.000.
  const strong = cfg.poll.cluster_strong_sim ?? 0.3;
  const minCentroidSim = cfg.poll.cluster_prune_sim ?? 0.35;
  const matureRunsNeeded = cfg.poll.cluster_mature_runs ?? 3;

  const items = recentItems(db, windowH);
  if (!items.length) { console.log('no items in window — nothing to cluster'); return; }
  const itemsById = new Map(items.map((it) => [it.id, it]));

  // 1) compute clusters on the current window (hybrid union-find + centroid outlier prune)
  const groups = findClusters(items, sim, minCentroidSim, { hybrid: true, strong });
  console.log(`clustering ${items.length} items (sim=${sim}, strong=${strong}, prune=${minCentroidSim}) -> ${groups.length} groups`);
  const memberSets = clusterMemberSets(db);
  const existing = existingClusters(db);

  // 2) persist clusters (reuse existing id when >=60% overlap)
  //
  // 2026-09-29: reuse ALSO requires the fresh group to cover >=50% of the
  // existing cluster's members. Without that, any fragment of a mega-cluster
  // re-attaches to it (overlap/ids is 100% for every subset) and the old row
  // can never split: national-672 kept all 9 members (football + crime +
  // Iran + AI) run after run while the fresh grouping had already dissolved
  // it, so every trapped follow-up died in the coherence gate with it.
  // Fragments now become their own clusters (items may belong to several —
  // cluster_members has no per-item uniqueness); the old row persists
  // harmlessly until its brief is refused into irrelevance.
  let created = 0, reused = 0, unclustered = 0, fragmented = 0;
  const grown = new Set();
  const multiSource = [];
  for (const ids of groups) {
    if (ids.length === 1) { unclustered++; continue; } // singletons stay unclustered
    let target = null, wouldReuse = false, targetMem = null;
    for (const ex of existing) {
      const mem = memberSets.get(ex.id);
      if (!mem) continue;
      let overlap = 0;
      for (const i of ids) if (mem.has(i)) overlap++;
      if (overlap / ids.length >= 0.6) {
        wouldReuse = true;
        if (ids.length / mem.size >= 0.5) { target = ex; targetMem = mem; break; }
      }
    }
    const headline = pickClusterHeadline(itemsById, ids);
    const members = ids.map((id) => ({ item_id: id, source_id: itemsById.get(id).source_id }));
    const clusterId = target ? target.id : insertCluster(db, { status: 'open', headline });
    addClusterMembers(db, clusterId, members);
    // 2026-09-29: only genuine GROWTH resets the maturity counter. Before,
    // every touch reset mature_runs to 0 — including an identical re-formation
    // of the same members — so a stable, corroborated pair (national-691: 2
    // fat members, 3h old, re-formed every run) could NEVER mature and its
    // brief sat at BRIEF_NOT_MATURE forever. A group that brings no new
    // members keeps its counter and ages in step 3 below.
    const hasNew = target ? ids.some((id) => !targetMem.has(id)) : true;
    touchCluster(db, clusterId, {
      status: 'open', headline, memberCount: ids.length,
      matureRuns: hasNew ? 0 : (target ? target.mature_runs ?? 0 : 0),
    });
    if (hasNew) grown.add(clusterId);
    if (target) reused++; else { created++; if (wouldReuse) fragmented++; }

    const srcs = new Set(ids.map((id) => itemsById.get(id).source_id));
    if (srcs.size >= 2) multiSource.push({ clusterId, n: ids.length, srcs: srcs.size, headline });
  }

  // 3) age open clusters: runs with no new member → mature_runs++; mature when threshold reached.
  // (grown = clusters that gained a genuinely new member this run; identical
  // re-formation does NOT reset — see the hasNew logic above.)
  const mature = [];
  const openRows = db.prepare('SELECT id, mature_runs FROM clusters WHERE status = ?').all('open');
  for (const c of openRows) {
    const newRuns = grown.has(c.id) ? 0 : c.mature_runs + 1;
    if (newRuns >= matureRunsNeeded) {
      db.prepare('UPDATE clusters SET status=?, mature_runs=? WHERE id=?').run('mature', newRuns, c.id);
      mature.push(c.id);
    } else {
      db.prepare('UPDATE clusters SET mature_runs=? WHERE id=?').run(newRuns, c.id);
    }
  }

  console.log(`cluster done. window=${windowH}h sim=${sim} prune=${minCentroidSim} created=${created} reused=${reused} fragmented=${fragmented} singled=${unclustered} matured=${mature.length}`);
  console.log(`multi-source clusters (>=2 papers): ${multiSource.length}`);
  console.table(multiSource.slice(0, 15).map((c) => ({ cluster: c.clusterId, members: c.n, sources: c.srcs, headline: c.headline.slice(0, 55) })));
}

async function cmdVerify() {
  const cfg = loadConfig();
  const trust = loadTrust();
  const vcfg = loadVerifyConfig(cfg);
  const db = openDb();
  const matureOnly = rest.includes('--mature-only');
  const clusters = db.prepare(matureOnly
    ? 'SELECT id, status FROM clusters WHERE status = ?'
    : 'SELECT id, status FROM clusters WHERE status != ?').all(matureOnly ? 'mature' : 'closed');
  const rows = db.prepare('SELECT cm.cluster_id, r.id, r.source_id, r.category, r.title FROM cluster_members cm JOIN raw_items r ON cm.item_id = r.id ORDER BY cm.cluster_id').all();
  const byCluster = new Map();
  for (const r of rows) {
    if (!byCluster.has(r.cluster_id)) byCluster.set(r.cluster_id, []);
    byCluster.get(r.cluster_id).push(r);
  }
  const results = [];
  let passed = 0, humanCheck = 0;
  for (const c of clusters) {
    const members = byCluster.get(c.id) ?? [];
    const ev = evaluateCluster(members, cfg, trust, vcfg);
    db.prepare('INSERT INTO verdicts (cluster_id,tier,score,badge,status,signals_json,evaluated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(cluster_id) DO UPDATE SET tier=excluded.tier, score=excluded.score, badge=excluded.badge, status=excluded.status, signals_json=excluded.signals_json, evaluated_at=excluded.evaluated_at')
      .run(c.id, ev.tier, ev.score, ev.badge, ev.status, JSON.stringify(ev.signals), new Date().toISOString());
    if (ev.status === 'passed') passed++; else humanCheck++;
    results.push({ cluster: c.id, tier: ev.tier, score: ev.score, badge: ev.badge, status: ev.status, members: members.length });
  }
  console.log(`verify done. evaluated=${clusters.length} passed=${passed} human_check=${humanCheck}`);
  console.table(results.sort((a, b) => a.cluster - b.cluster));
}

async function cmdExtract() {
  const only = rest.find((a) => a.startsWith('--status='))?.split('=')[1] ?? 'passed';
  await exportBriefs({ status: only });
}

async function cmdSynth() {
  const siteDir = rest.find((a) => a.startsWith('--site='))?.split('=')[1];
  const briefs = listBriefs();
  const pending = briefs.filter((slug) => !storyExists(slug, siteDir ? { siteDir } : {}));
  console.log(`synth (provider: opencode). briefs=${briefs.length} awaiting=${pending.length}`);
  if (!pending.length) { console.log('no brief waiting for a story — run `node run.js extract` first or all done.'); return; }
  console.log('\nAwaiting stories:\n');
  for (const slug of pending) {
    const b = loadBrief(slug);
    const done = storyExists(slug, siteDir ? { siteDir } : {});
    console.log(`- ${slug}  [${b.verdict?.badge ?? '?'} ${b.category}]  ${b.headline.slice(0, 60)}`);
  }
  // Print the writing prompt for the first pending brief — opencode writes, not the LLM.
  const first = pending.find((slug) => !storyExists(slug, siteDir ? { siteDir } : {}));
  if (first) {
    const dry = rest.includes('--prompt');
    const brief = loadBrief(first);
    console.log(`\n===== WRITING TASK: ${first} =====\n`);
    console.log(writingPrompt(brief));
  }
}

console.log(`pipeline v0.1 — command: ${cmd ?? '(missing)'}\n`);
if (cmd === 'fetch') await cmdFetch();
else if (cmd === 'normalize') await cmdNormalize();
else if (cmd === 'cluster') await cmdCluster();
else if (cmd === 'verify') await cmdVerify();
else if (cmd === 'extract') await cmdExtract();
else if (cmd === 'synth') await cmdSynth();
else {
  console.log('Usage: node run.js <fetch|normalize|cluster|verify|extract|synth> [--limit=N] [--mature-only] [--status=passed|all] [--site=/path]');
  process.exit(1);
}