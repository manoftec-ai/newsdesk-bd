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

export function applyClaimVerification(db, { trust = null, lineage = null, now = null } = {}) {
  const claims = db.prepare('SELECT id, cluster_id, claim_text, story_slug FROM claims').all();
  const lin = lineage ?? loadLineage();
  const evSt = db.prepare('SELECT * FROM claim_evidence WHERE claim_id = ?').all;
  let n = 0;
  const ts = now ?? new Date().toISOString();
  for (const c of claims) {
    const evidence = db.prepare('SELECT * FROM claim_evidence WHERE claim_id = ?').all(c.id);
    const conflicts = db.prepare('SELECT * FROM conflicts WHERE claim_id = ? OR cluster_id = ?').all(c.cluster_id, c.cluster_id);
    const v = verifyClaim(c.claim_text, { evidence, conflicts, trust, lineage: lin });
    db.prepare(`
      UPDATE claims SET status=?, confidence=?, support_count=?, contradiction_count=?, updated_at=? WHERE id=?
    `).run(v.status, v.confidence, v.support_count, v.contradiction_count, ts, c.id);
    recordSnapshot(db, c.id, v, { reason: 're-verify', now: ts });
    n++;
  }
  return n;
}

// TEMPORAL TRUTH — append-only verification history.
//
// Each claim's verification state is a time RANGE (valid_from..valid_until). A
// status/confidence change does NOT mutate history — the currently-open row gets
// its valid_until set to `now` and a fresh row opens. This gives a full ledger of
// "when was this claim VERIFIED? when did it turn CONFLICTING?" for reverify
// flip-flop detection and future "as of <date>" reader display.
//
// reason: initial (first recorded state) | re-verify (periodic recheck) |
//         conflict (typed contradiction surfaced — status -> CONFLICTING)
export function recordSnapshot(db, claimId, verdict, { reason = 'verify', now = null } = {}) {
  const ts = now ?? new Date().toISOString();
  const open = db.prepare('SELECT * FROM claim_snapshots WHERE claim_id = ? AND valid_until IS NULL').get(claimId);
  const status = verdict.status ?? 'UNCONFIRMED';
  const conf = Math.round((verdict.confidence ?? 0) * 100) / 100;
  const support = verdict.support_count ?? 0;
  const contrad = verdict.contradiction_count ?? 0;

  // First record for this claim — open the initial period.
  if (!open) {
    db.prepare(`
      INSERT INTO claim_snapshots(claim_id, status, confidence, support_count, contradiction_count,
        valid_from, valid_until, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(claimId, status, conf, support, contrad, ts, reason === 'initial' ? 'initial' : 'verify', ts);
    return { changed: true, from: null, to: status };
  }

  // No state change — leave the open period running (idempotent re-verify).
  if (open.status === status && open.confidence === conf) {
    return { changed: false, from: open.status, to: open.status };
  }

  // State changed — close the open period, open a new one.
  db.prepare('UPDATE claim_snapshots SET valid_until = ? WHERE id = ?').run(ts, open.id);
  db.prepare(`
    INSERT INTO claim_snapshots(claim_id, status, confidence, support_count, contradiction_count,
      valid_from, valid_until, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(claimId, status, conf, support, contrad, ts, reason, ts);
  return { changed: true, from: open.status, to: status };
}

// Verification state that was VALID on a given ISO date (or the open one if `at`
// is null/omitted). Returns { status, confidence, valid_from, valid_until } or null.
export function claimStatusAt(db, claimId, at = null) {
  if (at === null) {
    return db.prepare('SELECT status, confidence, support_count, contradiction_count, valid_from, valid_until FROM claim_snapshots WHERE claim_id = ? AND valid_until IS NULL').get(claimId) ?? null;
  }
  return db.prepare(`
    SELECT status, confidence, support_count, contradiction_count, valid_from, valid_until
    FROM claim_snapshots
    WHERE claim_id = ? AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)
    ORDER BY valid_from DESC LIMIT 1
  `).get(claimId, at, at) ?? null;
}

// Full ordered ledger (oldest → newest) of a claim's verification states.
export function claimTimeline(db, claimId) {
  return db.prepare(`
    SELECT id, status, confidence, support_count, contradiction_count, valid_from, valid_until, reason
    FROM claim_snapshots WHERE claim_id = ?
    ORDER BY valid_from ASC, id ASC
  `).all(claimId);
}

// FLIP-FLOP detection for reverify — a claim whose status went bad then good (or
// oscillated) across ≥2 transitions is a trust signal. Returns the transition
// pairs of consecutive (from→to) state changes, oldest → newest.
export function claimTransitions(db, claimId) {
  const rows = claimTimeline(db, claimId);
  const out = [];
  for (let i = 0; i < rows.length - 1; i++) {
    if (rows[i].status !== rows[i + 1].status) {
      out.push({ from: rows[i].status, to: rows[i + 1].status, changed_at: rows[i + 1].valid_from });
    }
  }
  return out;
}