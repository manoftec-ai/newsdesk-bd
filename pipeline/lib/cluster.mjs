// lib/cluster.mjs — Bengali TF-IDF + union-find clustering of news items
import { tokens } from './normalize.mjs';

// Title tokens are repeated 2x so titles weigh ~2x vs body.
function docTokens(item) {
  return tokens(`${item.title} ${item.title} ${item.body}`);
}

export function buildVectors(items) {
  const df = new Map();
  for (const it of items) {
    const seen = new Set();
    for (const t of docTokens(it)) {
      if (!seen.has(t)) { seen.add(t); df.set(t, (df.get(t) || 0) + 1); }
    }
  }
  const N = items.length;
  const vectors = new Map();
  for (const it of items) {
    const tf = new Map();
    for (const t of docTokens(it)) tf.set(t, (tf.get(t) || 0) + 1);
    const v = new Map();
    for (const [t, c] of tf) {
      const idf = Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
      v.set(t, (1 + Math.log(c)) * idf);
    }
    vectors.set(it.id, v);
  }
  return vectors;
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (const [k, w] of a) { na += w * w; const wb = b.get(k); if (wb) dot += w * wb; }
  for (const [, w] of b) nb += w * w;
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Single-linkage chaining can pull unrelated members into a clutch (e.g. two
// disease clusters via shared genre vocabulary). Drop members too far from the
// cluster centroid; a group reduced below 2 members is discarded (-> singletons).
export function pruneOutliers(vectors, groups, minCentroidSim = 0.35) {
  const result = [];
  for (const [, ids] of groups) {
    if (ids.length < 3) { result.push(ids); continue; }
    const cent = new Map();
    for (const id of ids) {
      for (const [t, w] of vectors.get(id)) cent.set(t, (cent.get(t) || 0) + w);
    }
    let norm2 = 0;
    for (const w of cent.values()) norm2 += w * w;
    const n = Math.sqrt(norm2) || 1;
    for (const [t, w] of cent) cent.set(t, w / n);
    const keep = ids.filter((id) => cosine(vectors.get(id), cent) >= minCentroidSim);
    if (keep.length >= 2) result.push(keep);
  }
  return result;
}

// Group item ids whose pairwise similarity >= threshold (union-find single linkage).
export function clusterItems(items, threshold, vectors = buildVectors(items)) {
  const parent = new Map(items.map((it) => [it.id, it.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  const ids = items.map((it) => it.id);
  for (let i = 0; i < ids.length; i++) {
    const vi = vectors.get(ids[i]);
    for (let j = i + 1; j < ids.length; j++) {
      if (cosine(vi, vectors.get(ids[j])) >= threshold) union(ids[i], ids[j]);
    }
  }
  const groups = new Map();
  for (const id of ids) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(id);
  }
  return groups;
}

// Full clustering pass: build vectors -> single-linkage union-find -> prune outliers.
// Returns an array of item-id arrays (singletons included).
export function findClusters(items, threshold, minCentroidSim = 0.35) {
  const vectors = buildVectors(items);
  const groups = clusterItems(items, threshold, vectors);
  const pruned = pruneOutliers(vectors, groups, minCentroidSim);
  const assigned = new Set();
  for (const g of pruned) for (const id of g) assigned.add(id);
  const result = [];
  for (const g of pruned) result.push(g);
  for (const it of items) if (!assigned.has(it.id)) result.push([it.id]); // pruned-out -> singleton
  return result;
}

export function pickClusterHeadline(itemsById, ids) {
  const members = ids.map((id) => itemsById.get(id)).filter(Boolean);
  if (!members.length) return '';
  return members
    .filter((m) => m.title && m.title.length >= 25)
    .reduce((best, m) => (m.title.length > best.title.length ? m : best), members[0])?.title || members[0].title;
}