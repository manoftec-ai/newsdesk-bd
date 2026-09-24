// lib/claim-verify.mjs — CLAIM-LEVEL verification (automation-only, deterministic).
//
// Takes a Claim → Evidence graph and assigns each claim a status + confidence,
// counting independent (distinct-source) evidence and official corroboration.
// This is the counterpart to cluster-level verify.mjs: cluster says the STORY
// is publishable, this says each CLAIM inside it is individually supported.
//
// Statuses:
//   OFFICIAL      — supporting evidence includes an official/agency channel
//   VERIFIED      — >=2 independent supporting sources AND no contradiction
//   CORROBORATED  — >=2 independent supporting sources, weaker signals
//   SINGLE_SOURCE — exactly one independent supporting source, no contradiction
//   CONFLICTING   — has contradicting evidence or a typed conflict row
//   UNCONFIRMED   — no supporting evidence
//   REFUTED       — a contradicion resolved against the claim (future: typed)
//   OUTDATED      — superseded temporally (future: valid_from/valid_until)
import { loadTrust } from './verify.mjs';

// Map evidence rows → claim verification. `evidence` = rows from claim_evidence,
// `conflicts` = rows from conflicts (optional). Returns full status object.
export function verifyClaim(claimText, { evidence = [], conflicts = [], trust = null } = {}) {
  const tr = trust ?? loadTrust();
  const reps = tr.sources ?? {};
  const support = [];
  const contradict = [];
  const official = [];
  const seen = new Set(); // independent = distinct source_id (start; source-independence groups later)

  for (const e of evidence) {
    const rel = e.relation || 'supports';
    const rep = reps[e.source_id] ?? 'top';
    const isOfficial = rep === 'official' || rep === 'agency';
    if (rel === 'contradicts') {
      contradict.push(e);
    } else {
      support.push(e);
      if (isOfficial) official.push(e);
    }
    // de-dup by source for independence counting
  }

  const distinctSources = new Set();
  for (const e of support) if (!seen.has(e.source_id)) { seen.add(e.source_id); distinctSources.add(e.source_id); }

  const supportCount = distinctSources.size;
  const contradictionCount = contradict.length + conflicts.filter((c) => (c.resolution ?? 'unresolved') === 'unresolved').length;
  const hasConflict = contradictionCount > 0;
  const hasOfficial = official.length > 0;

  let status = 'UNCONFIRMED';
  if (supportCount === 0 && !hasConflict) status = 'UNCONFIRMED';
  else if (supportCount === 0 && hasConflict) status = 'CONFLICTING';
  else if (hasConflict) status = 'CONFLICTING';
  else if (hasOfficial && supportCount >= 1) status = 'OFFICIAL';
  else if (supportCount >= 2) status = 'VERIFIED';
  else status = 'SINGLE_SOURCE';

  // confidence: base on independent source count + official, capped, with
  // ceiling penalty when contradiction present — this is NOT a truth
  // probability, just a supporting-signal strength.
  let confidence = Math.min(1, supportCount / 3) + (hasOfficial ? 0.15 : 0);
  if (hasConflict) confidence *= 0.4;
  confidence = Math.round(Math.min(1, Math.max(0, confidence)) * 100);

  return {
    claim: claimText,
    status,
    confidence,
    support_count: support.length,
    support_independent_sources: supportCount,
    contradiction_count: contradictionCount,
    official_count: official.length,
    has_official: hasOfficial,
    unresolved_conflict: hasConflict,
    evidence: support.map((e) => ({
      source_id: e.source_id,
      url: e.url,
      excerpt: e.excerpt,
      relation: e.relation,
      evidence_type: e.evidence_type,
      published_at: e.published_at,
    })),
    contradicted_by: contradict.map((e) => ({
      source_id: e.source_id,
      url: e.url,
      excerpt: e.excerpt,
    })),
  };
}

export function applyClaimVerification(db, { trust = null } = {}) {
  const claims = db.prepare('SELECT id, cluster_id, claim_text, story_slug FROM claims').all();
  const evSt = db.prepare('SELECT * FROM claim_evidence WHERE claim_id = ?').all;
  let n = 0;
  for (const c of claims) {
    const evidence = db.prepare('SELECT * FROM claim_evidence WHERE claim_id = ?').all(c.id);
    const conflicts = db.prepare('SELECT * FROM conflicts WHERE claim_id = ? OR cluster_id = ?').all(c.cluster_id, c.cluster_id);
    const v = verifyClaim(c.claim_text, { evidence, conflicts, trust });
    db.prepare(`
      UPDATE claims SET status=?, confidence=?, support_count=?, contradiction_count=? WHERE id=?
    `).run(v.status, v.confidence, v.support_count, v.contradiction_count, c.id);
    n++;
  }
  return n;
}