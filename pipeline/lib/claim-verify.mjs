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
import { loadLineage, groupEvidence, isOfficialSource } from './lineage.mjs';

// Map evidence rows → claim verification. `evidence` = rows from claim_evidence,
// `conflicts` = rows from conflicts (optional). Returns full status object.
// Independence is measured by EVIDENCE GROUP (source-independence lineage), not
// by counting distinct URLs: two outlets sharing one wire = one group.
export function verifyClaim(claimText, { evidence = [], conflicts = [], trust = null, lineage = null } = {}) {
  const tr = trust ?? loadTrust();
  const reps = tr.sources ?? {};
  const lin = lineage ?? loadLineage();
  const support = [];
  const contradict = [];

  for (const e of evidence) {
    if ((e.relation || 'supports') === 'contradicts') contradict.push(e);
    else support.push(e);
  }

  const { independentCount } = groupEvidence(support, lin);
  // official can come from lineage (source_type) OR legacy trust.json reputation
  const officialRows = support.filter((e) => isOfficialSource(e.source_id, lin) || ['official', 'agency'].includes(reps[e.source_id]));
  const contradictions = contradict.length + conflicts.filter((c) => (c.resolution ?? 'unresolved') === 'unresolved').length;
  const hasConflict = contradictions > 0;
  const hasOfficial = officialRows.length > 0;

  let status = 'UNCONFIRMED';
  if (independentCount === 0 && !hasConflict) status = 'UNCONFIRMED';
  else if (independentCount === 0 && hasConflict) status = 'CONFLICTING';
  else if (hasConflict) status = 'CONFLICTING';
  else if (hasOfficial && independentCount >= 1) status = 'OFFICIAL';
  else if (independentCount >= 2) status = 'VERIFIED';
  else status = 'SINGLE_SOURCE';

  let confidence = Math.min(1, independentCount / 3) + (hasOfficial ? 0.15 : 0);
  if (hasConflict) confidence *= 0.4;
  confidence = Math.round(Math.min(1, Math.max(0, confidence)) * 100);

  return {
    claim: claimText,
    status,
    confidence,
    support_count: support.length,
    support_independent_sources: independentCount,
    support_independent_groups: independentCount,
    contradiction_count: contradictions,
    official_count: officialRows.length,
    has_official: hasOfficial,
    unresolved_conflict: hasConflict,
    evidence: support.map((e) => ({
      source_id: e.source_id,
      group: groupKey_(e.source_id, lin),
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

function groupKey_(sourceId, lineage) { return lineage[sourceId] ? (lineage[sourceId].ownership_group ?? lineage[sourceId].wire_origin ?? lineage[sourceId].syndication_group ?? sourceId) : sourceId; }

export function applyClaimVerification(db, { trust = null, lineage = null } = {}) {
  const claims = db.prepare('SELECT id, cluster_id, claim_text, story_slug FROM claims').all();
  const lin = lineage ?? loadLineage();
  const evSt = db.prepare('SELECT * FROM claim_evidence WHERE claim_id = ?').all;
  let n = 0;
  for (const c of claims) {
    const evidence = db.prepare('SELECT * FROM claim_evidence WHERE claim_id = ?').all(c.id);
    const conflicts = db.prepare('SELECT * FROM conflicts WHERE claim_id = ? OR cluster_id = ?').all(c.cluster_id, c.cluster_id);
    const v = verifyClaim(c.claim_text, { evidence, conflicts, trust, lineage: lin });
    db.prepare(`
      UPDATE claims SET status=?, confidence=?, support_count=?, contradiction_count=? WHERE id=?
    `).run(v.status, v.confidence, v.support_count, v.contradiction_count, c.id);
    n++;
  }
  return n;
}