// lib/source-health.mjs — SOURCE HEALTH (data-driven reliability profile, read-only).
//
// Static trust.json reputation says what a source IS. This derives how a source
// has BEHAVED from the live claim/evidence/snapshot ledger:
//   - how many claims it supports and how many of those ended up CONFLICTING or
//     flip-flopped (reversal-prone) → conflict_share
//   - how old its supporting evidence runs → stale_share
//   - whether it is its own independent group (vs a wire syndicator) → independence
// Combine into a 0..100 health score + a label (healthy | mixed | flagged).
// Read-only: does NOT modify trust.json or any table — advisory for the verify
// layer and eventual auto-tuning of reputation.
import { loadLineage, groupKey } from './lineage.mjs';

export const HEALTH_LABELS = { healthy: 'healthy', mixed: 'mixed', flagged: 'flagged' };

// Pure derivation from already-loaded rows. `evidence` = claim_evidence rows for
// ALL claims (source_id, claim_id, relation, published_at); `transitions` =
// Map<claim_id, from→to pairs (claimTransitions)>; `current` =
// Map<claim_id, current status>; `lineage` optional overrides.
export function deriveSourceHealth({ evidence = [], transitions = new Map(), current = new Map(), lineage = null, trust = null, asOfMs = Date.now() } = {}) {
  const lin = lineage ?? loadLineage();
  const reps = trust?.sources ?? {};
  const bySource = new Map();

  for (const e of evidence) {
    if (!e.source_id) continue;
    if (!bySource.has(e.source_id)) {
      bySource.set(e.source_id, { source_id: e.source_id, rows: [], claims: new Set(), conflictClaims: new Set(), staleRows: 0, datedRows: 0 });
    }
    const s = bySource.get(e.source_id);
    s.rows.push(e);
    if ((e.relation || 'supports') !== 'contradicts' && e.claim_id) {
      s.claims.add(e.claim_id);
      const cur = current.get(e.claim_id) ?? null;
      const flow = transitions.get(e.claim_id) ?? [];
      const atSomePointConflicting = cur === 'CONFLICTING' || flow.some((t) => t.to === 'CONFLICTING' || t.from === 'CONFLICTING');
      if (atSomePointConflicting) s.conflictClaims.add(e.claim_id);
    }
    if (e.published_at) {
      s.datedRows++;
      const age = (asOfMs - new Date(e.published_at).getTime()) / 86_400_000;
      if (Number.isFinite(age) && age >= 90) s.staleRows++;
    }
  }

  const out = {};
  for (const s of bySource.values()) {
    const nClaims = s.claims.size;
    const conflictShare = nClaims ? s.conflictClaims.size / nClaims : 0;
    const staleShare = s.datedRows ? s.staleRows / s.datedRows : 0;
    const independent = groupKey(s.source_id, lin) === s.source_id;
    let score = 100
      - conflictShare * 45
      - staleShare * 25
      - (independent ? 0 : 10); // syndicated groups add noise (shared-wire re-packaging)
    score = Math.round(Math.min(100, Math.max(0, score)));
    // Hard flag: a source where half or more of its supported claims were
    // conflict-prone at some point is NOT reliable enough for the verify layer,
    // regardless of how fresh/independent its other metrics look.
    const label = conflictShare >= 0.5 ? HEALTH_LABELS.flagged
      : score >= 80 ? HEALTH_LABELS.healthy
      : score >= 50 ? HEALTH_LABELS.mixed
      : HEALTH_LABELS.flagged;
    out[s.source_id] = {
      source_id: s.source_id,
      evidence_rows: s.rows.length,
      claims_supported: nClaims,
      conflict_affected: s.conflictClaims.size,
      conflict_share: Math.round(conflictShare * 1000) / 1000,
      stale_share: Math.round(staleShare * 1000) / 1000,
      independent,
      reputation: reps[s.source_id] ?? null,
      health_score: score,
      health_label: label,
    };
  }
  return out;
}

// DB wrapper — computes everything from store.db. Safe against the raced DB:
// pure reads, no writes.
export function loadSourceHealth(db, { trust = null, lineage = null, asOfMs = Date.now() } = {}) {
  const evidence = db.prepare('SELECT claim_id, source_id, relation, published_at FROM claim_evidence').all();
  const transitions = new Map();
  const snapRows = db.prepare('SELECT claim_id, status, valid_until FROM claim_snapshots').all();
  // transitions per claim: consecutive snapshot status changes
  const byClaim = new Map();
  for (const r of snapRows) {
    if (!byClaim.has(r.claim_id)) byClaim.set(r.claim_id, []);
    byClaim.get(r.claim_id).push(r);
  }
  for (const [cid, rows] of byClaim) {
    const order = rows.sort((a, b) => (a.valid_until ?? '\uffff') < (b.valid_until ?? '\uffff') ? -1 : 1);
    const pairs = [];
    for (let i = 0; i < order.length - 1; i++) {
      const a = order[i].status, b = order[i + 1].status;
      // a snapshot with valid_until set is a closed period; the NEXT is its successor
      if (order[i].valid_until !== null && a !== b) pairs.push({ from: a, to: b, changed_at: order[i + 1].valid_until ?? order[i].valid_until });
    }
    transitions.set(cid, pairs);
  }
  const current = new Map(snapRows.filter((r) => r.valid_until === null).map((r) => [r.claim_id, r.status]));
  return deriveSourceHealth({ evidence, transitions, current, trust, lineage, asOfMs });
}