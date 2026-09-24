// lib/cluster-eval.mjs — Golden Test Dataset evaluator for clustering quality.
// Measures the Bengali TF-IDF clustering (cluster.mjs) against a hand-curated
// labeled set of REAL news items (config/golden.json) using standard pairwise
// precision / recall / F1 + a per-event cluster-quality report.
import { findClusters } from './cluster.mjs';

// Sorted canonical key "a|b" for an unordered item pair.
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Gold same-event pairs from the curated events list.
export function goldPairs(golden) {
  const pairs = new Set();
  for (const ev of golden.events ?? []) {
    const m = [...(ev.members ?? [])].sort();
    for (let i = 0; i < m.length; i++)
      for (let j = i + 1; j < m.length; j++) pairs.add(pairKey(m[i], m[j]));
  }
  return pairs;
}

// Co-clustered pairs produced by the algorithm.
export function foundPairs(clusters) {
  const pairs = new Set();
  for (const g of clusters ?? []) {
    const ids = [...g].sort();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) pairs.add(pairKey(ids[i], ids[j]));
  }
  return pairs;
}

// Pairwise precision/recall/F1 of found clusters vs the gold partition.
export function pairwiseScores(clusters, gold) {
  const gp = goldPairs(gold);
  const fp = foundPairs(clusters);
  let tp = 0, fpCnt = 0, fnCnt = 0;
  for (const k of gp) if (fp.has(k)) tp++; else fnCnt++;
  for (const k of fp) if (!gp.has(k)) fpCnt++;
  const precision = tp + fpCnt ? tp / (tp + fpCnt) : 1;
  const recall = tp + fnCnt ? tp / (tp + fnCnt) : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp: fpCnt, fn: fnCnt, precision, recall, f1 };
}

// Per-event status: how well each curated event survived clustering.
export function eventReport(golden, clusters) {
  const cluOf = new Map(); // itemId -> [clusterId]
  clusters.forEach((ids, ci) => { for (const id of ids) cluOf.set(id, ci); });
  const out = [];
  for (const ev of golden.events ?? []) {
    const members = ev.members ?? [];
    if (members.length < 2) {
      // singleton — must stay OUT of any multi-member cluster
      const ci = cluOf.get(members[0]);
      const cluster = ci === undefined ? [] : clusters[ci];
      const others = (cluster ?? []).length - 1;
      out.push({ event: ev.id, size: 1, status: others === 0 ? "clean" : `polluted(+${others})` });
      continue;
    }
    const groupIds = new Set(members.map((m) => cluOf.get(m)).filter((x) => x !== undefined));
    const distinct = groupIds.size;
    // cluster containing at least one member: count non-member pollutants
    let polluted = 0;
    for (const c of groupIds) {
      for (const id of clusters[c]) if (!members.includes(id)) polluted++;
    }
    const allInOneCluster = distinct === 1;
    const status = polluted > 0 && allInOneCluster
      ? `merged+${polluted} foreign`
      : allInOneCluster ? 'merged' : distinct >= 2 ? 'split' : 'lost';
    out.push({ event: ev.id, size: members.length, status });
  }
  return out;
}

// Run the full evaluation on an items array (shape {id,title,body}).
export function evaluateClusters(items, { similarity = 0.45, prune = 0.35, golden, strong = null } = {}) {
  const clusters = findClusters(items, similarity, prune, strong == null ? {} : { hybrid: true, strong }).filter((c) => c.length > 0);
  return { scores: pairwiseScores(clusters, golden), events: eventReport(golden, clusters), clusters };
}