// lib/event-graph.mjs — STORY EVENT GRAPH (read-only derivation, deterministic).
//
// One published story ← one cluster ← N claims. Each claim carries a temporal
// ledger (claim_snapshots), evidence rows (claim_evidence) and optional typed
// conflicts. This module derives a CHRONOLOGICAL event timeline for a story —
// "কীভাবে উন্মোচিত হলো" — by merging:
//   - claim appeared            (claims.created_at)
//   - source evidence added     (claim_evidence.published_at / created_at)
//   - verification state change (snapshot valid_from with from→to status)
//   - structured conflict       (conflicts.created_at)
// plus the CROSS-STORY edges: stories whose claims share actors (same people/
// institutions → same unfolding event). Read-only: never writes store.db or
// any committed state (the tool that emits site data diff-writes only).
import { loadLineage } from './lineage.mjs';
import { claimTimeline } from './claim-verify.mjs';

export const EVENT_KINDS = ['claim', 'evidence', 'verify', 'conflict'];

export const KIND_LABELS = {
  claim: 'দাবি উঠেছে',
  evidence: 'সূত্র যুক্ত হয়েছে',
  verify: 'যাচাই-অবস্থা বদলেছে',
  conflict: 'সূত্রে দ্বন্দ্ব ধরা পড়েছে',
};

// Sort/dedupe helper used by both pure + DB variants.
export function sortTimeline(events) {
  const out = [...events].filter((e) => e && e.ts);
  out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  return out;
}

// DERIVATION — pure, fully deterministic. Build the merged chronological
// timeline for ONE cluster from flat row arrays.
//
// verify events: a status CHANGE opens a new snapshot row; the row that closes
// an old period is the one that RECORDS the change. We emit the new state at
// its valid_from, keeping only rows whose status differs from the previous
// period (dedupes idempotent re-verifies that reused an open period).
export function deriveTimeline({ claims = [], evidence = [], snapshots = [], conflicts = [] } = {}) {
  const events = [];
  const byClaim = new Map(claims.map((c) => [Number(c.id), c]));

  for (const c of claims) {
    if (c.created_at) events.push({ ts: c.created_at, kind: 'claim', claim_id: Number(c.id), claim_text: c.claim_text });
  }
  for (const e of evidence) {
    const ts = e.published_at || e.created_at;
    if (!ts) continue;
    events.push({
      ts,
      kind: 'evidence',
      claim_id: Number(e.claim_id),
      claim_text: byClaim.get(Number(e.claim_id))?.claim_text ?? null,
      detail: { source_id: e.source_id, relation: e.relation ?? 'supports', url: e.url ?? null },
    });
  }
  const byClaimSnaps = new Map();
  for (const s of snapshots) {
    const k = Number(s.claim_id);
    if (!byClaimSnaps.has(k)) byClaimSnaps.set(k, []);
    byClaimSnaps.get(k).push(s);
  }
  for (const [cid, rows] of byClaimSnaps) {
    const ordered = [...rows].sort((a, b) => String(a.valid_from).localeCompare(String(b.valid_from)));
    let prev = null;
    for (const r of ordered) {
      if (prev !== null && prev === r.status) continue; // unchanged period re-used
      if (r.valid_from) {
        events.push({
          ts: r.valid_from,
          kind: 'verify',
          claim_id: cid,
          claim_text: byClaim.get(cid)?.claim_text ?? null,
          detail: { status: r.status, from: prev, confidence: r.confidence, reason: r.reason ?? 'verify' },
        });
      }
      prev = r.status;
    }
  }
  for (const cf of conflicts) {
    if (!cf.created_at) continue;
    events.push({
      ts: cf.created_at,
      kind: 'conflict',
      claim_id: cf.claim_id ? Number(cf.claim_id) : null,
      claim_text: cf.claim_id ? (byClaim.get(Number(cf.claim_id))?.claim_text ?? null) : null,
      detail: { conflict_type: cf.conflict_type, field: cf.field, sources: cf.sources_json ?? null, resolution: cf.resolution ?? 'unresolved' },
    });
  }
  return sortTimeline(events);
}

// DB BOUND — full timeline for one cluster (claims + evidence + snapshots + conflicts).
export function storyTimeline(db, clusterId) {
  const claims = db.prepare('SELECT * FROM claims WHERE cluster_id = ? ORDER BY id').all(clusterId);
  if (!claims.length) return { cluster_id: clusterId, claims: [], events: [] };
  const ids = claims.map((c) => c.id);
  const ph = `(${ids.map(() => '?').join(',')})`;
  const evidence = db.prepare(`SELECT * FROM claim_evidence WHERE claim_id IN ${ph}`).all(...ids);
  const snapshots = db.prepare(`SELECT * FROM claim_snapshots WHERE claim_id IN ${ph}`).all(...ids);
  const conflicts = db.prepare('SELECT * FROM conflicts WHERE cluster_id = ?').all(clusterId);
  return { cluster_id: clusterId, claims, events: deriveTimeline({ claims, evidence, snapshots, conflicts }) };
}

// VERSIONING — the append-only verification ledger, whole and per claim.
// Each item is one PERIOD a claim's verification state was valid
// (valid_from..valid_until; valid_until null = still open). Readers see every
// state the claim ever held, when, and why (initial | re-verify | conflict) —
// never mutated in place, so the audit trail is complete end-to-end.
export function storyVersions(db, clusterId) {
  const claims = db.prepare('SELECT id, claim_text FROM claims WHERE cluster_id = ? ORDER BY id').all(clusterId);
  const out = [];
  for (const c of claims) {
    const periods = claimTimeline(db, c.id).map((r) => ({
      status: r.status,
      confidence: r.confidence,
      support_count: r.support_count,
      contradiction_count: r.contradiction_count,
      evidence_count: r.evidence_count,
      evidence_hash: r.evidence_hash ?? null,
      valid_from: r.valid_from,
      valid_until: r.valid_until ?? null,
      reason: r.reason ?? 'verify',
    }));
    out.push({ claim_id: c.id, claim_text: c.claim_text, periods });
  }
  return out;
}

// DB BOUND — headline/lifetime for a cluster (from the clusters row).
export function storyMeta(db, clusterId) {
  const row = db.prepare('SELECT id, headline, first_seen, last_update, member_count FROM clusters WHERE id = ?').get(clusterId);
  return row ?? null;
}

// CROSS-STORY EDGES — stories whose claims share at least one actor with this
// cluster's claims (same people/orgs → same unfolding event) OR share >=2
// evidence sources (the same outlets are covering both stories). Returns other
// cluster ids ranked by shared-actor count then shared-source count.
export function relatedStories(db, clusterId, { max = 6 } = {}, _lineage = null) {
  const mine = db.prepare(`
    SELECT DISTINCT ac.actor_id
    FROM actors_claims ac JOIN claims c ON c.id = ac.claim_id
    WHERE c.cluster_id = ?
  `).all(clusterId).map((r) => r.actor_id);
  const mySources = db.prepare(`
    SELECT DISTINCT ce.source_id
    FROM claim_evidence ce JOIN claims c ON c.id = ce.claim_id
    WHERE c.cluster_id = ? AND (ce.relation IS NULL OR ce.relation != 'contradicts')
  `).all(clusterId).map((r) => r.source_id);

  const nodes = new Map(); // cluster_id -> { actor_links, source_links, claim_count, last_touched }
  const link = (cid, k, n) => {
    if (!nodes.has(cid)) nodes.set(cid, { actor: 0, source: 0, claim_count: 0, last_touched: '' });
    nodes.get(cid)[k] += n;
  };

  if (mine.length) {
    const ph = `(${mine.map(() => '?').join(',')})`;
    for (const r of db.prepare(`
      SELECT c.cluster_id, COUNT(DISTINCT ac.actor_id) AS n,
             COUNT(DISTINCT c.id) AS claims, MAX(c.updated_at) AS last_touched
      FROM actors_claims ac JOIN claims c ON c.id = ac.claim_id
      WHERE ac.actor_id IN ${ph} AND c.cluster_id != ?
      GROUP BY c.cluster_id
    `).all(...mine, clusterId)) {
      link(r.cluster_id, 'actor', r.n);
      nodes.get(r.cluster_id).claim_count += r.claims;
      mergeLast_(nodes.get(r.cluster_id), r.last_touched);
    }
  }
  if (mySources.length >= 2) {
    const ph = `(${mySources.map(() => '?').join(',')})`;
    for (const r of db.prepare(`
      SELECT c.cluster_id, COUNT(DISTINCT ce.source_id) AS n,
             COUNT(DISTINCT c.id) AS claims, MAX(c.updated_at) AS last_touched
      FROM claim_evidence ce JOIN claims c ON c.id = ce.claim_id
      WHERE ce.source_id IN ${ph} AND c.cluster_id != ?
        AND (ce.relation IS NULL OR ce.relation != 'contradicts')
      GROUP BY c.cluster_id
    `).all(...mySources, clusterId)) {
      if (r.n < 2) continue; // <2 shared outlets is noise, not a shared unfolding
      link(r.cluster_id, 'source', r.n);
      nodes.get(r.cluster_id).claim_count += r.claims;
      mergeLast_(nodes.get(r.cluster_id), r.last_touched);
    }
  }

  return [...nodes.entries()]
    .map(([cluster_id, d]) => ({ cluster_id, actor_links: d.actor, source_links: d.source, claim_count: d.claim_count, last_touched: d.last_touched }))
    .sort((a, b) => (b.actor_links - a.actor_links) || (b.source_links - a.source_links) || String(b.last_touched).localeCompare(String(a.last_touched)))
    .slice(0, max);
}

function mergeLast_(node, ts) {
  if (ts && String(ts).localeCompare(String(node.last_touched)) > 0) node.last_touched = ts;
}

export function loadLineage_() { return loadLineage(); }