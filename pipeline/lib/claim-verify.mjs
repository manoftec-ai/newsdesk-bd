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
import { createHash } from 'node:crypto';

// Evidence freshness windows (days). Age is measured against the verification
// run time (`asOf`). A claim whose supporting evidence is overwhelmingly old
// (e.g. a 2023 bulletin backing a 2026 figure) gets a gentle confidence
// discount — but NO hard status change, so the history archive (legitimately
// cited-sources) still verifies.
export const EVIDENCE_AGING_DAYS = 14;   // < this = fresh
export const EVIDENCE_STALE_DAYS = 90;   // >= this = stale (discounted)

export function evidenceAgeDays(publishedAt, asOfMs = Date.now()) {
  if (!publishedAt) return null;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (asOfMs - t) / 86_400_000);
}

// Deterministic fingerprint of a supporting evidence set — "what sources, at
// what dates" were behind a snapshot. Sorted+joined so order never changes the
// hash; url present → source+url, else source+date (bulletin-tied evidence is
// deduped by source already).
export function evidenceHash(evidence = []) {
  const parts = evidence
    .filter((e) => e.relation !== 'contradicts')
    .map((e) => [e.source_id, e.url ?? '', e.published_at ?? ''].join('|'))
    .sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

function evidenceAgeProfile(evidence = [], asOfMs) {
  const support = evidence.filter((e) => e.relation !== 'contradicts');
  const ages = support.map((e) => evidenceAgeDays(e.published_at, asOfMs)).filter((a) => a !== null);
  if (!ages.length) return { max_days: null, oldest_evidence_at: null, fresh: 0, stale: 0 };
  const max = Math.max(...ages);
  const fresh = ages.filter((a) => a < EVIDENCE_AGING_DAYS).length;
  const stale = ages.filter((a) => a >= EVIDENCE_STALE_DAYS).length;
  const oldest = support.map((e) => e.published_at).filter(Boolean).sort()[0] ?? null;
  return { max_days: Math.round(max * 10) / 10, oldest_evidence_at: oldest, fresh, stale };
}

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

  const ageProf = evidenceAgeProfile(support, Date.now());
  let confidence = Math.min(1, independentCount / 3) + (hasOfficial ? 0.15 : 0);
  if (hasConflict) confidence *= 0.4;
  // Evidence-age honesty (positive status + stale evidence): if the claim IS
  // supported but every supporting row is older than EVIDENCE_STALE_DAYS
  // (nothing fresh), trim confidence — old sources backing a new figure are
  // weaker anchors. No hard status change: history archive stays verified.
  if (!hasConflict && (status === 'VERIFIED' || status === 'OFFICIAL') && ageProf.stale > 0 && ageProf.fresh === 0) {
    confidence *= 0.75;
  }
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
    evidence_age: ageProf,
    evidence_hash: evidenceHash(evidence),
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
// An OBSERVATION is (status, confidence, evidence set). A re-verify that finds
// the same status AND confidence AND evidence_hash (same sources+urls+dates) is
// idempotent — the open period keeps running. New evidence (or a changed figure)
// opens a new period even if the verdict text is identical.
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
  const hash = verdict.evidence_hash ?? evidenceHash(verdict.evidence ?? []);
  const evCount = (verdict.evidence ?? []).filter((e) => e.relation !== 'contradicts').length;
  const oldestAt = verdict.evidence_age?.oldest_evidence_at ?? null;

  // First record for this claim — open the initial period.
  if (!open) {
    db.prepare(`
      INSERT INTO claim_snapshots(claim_id, status, confidence, support_count, contradiction_count,
        evidence_hash, evidence_count, oldest_evidence_at, valid_from, valid_until, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(claimId, status, conf, support, contrad, hash, evCount, oldestAt, ts, reason === 'initial' ? 'initial' : 'verify', ts);
    return { changed: true, from: null, to: status };
  }

  // No state change AND same evidence — leave the open period running (idempotent).
  if (open.status === status && open.confidence === conf && (open.evidence_hash ?? null) === hash) {
    return { changed: false, from: open.status, to: open.status };
  }

  // State OR evidence changed — close the open period, open a new one.
  db.prepare('UPDATE claim_snapshots SET valid_until = ? WHERE id = ?').run(ts, open.id);
  db.prepare(`
    INSERT INTO claim_snapshots(claim_id, status, confidence, support_count, contradiction_count,
      evidence_hash, evidence_count, oldest_evidence_at, valid_from, valid_until, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(claimId, status, conf, support, contrad, hash, evCount, oldestAt, ts, reason, ts);
  return { changed: true, from: open.status, to: status };
}

// Verification state that was VALID on a given ISO date (or the open one if `at`
// is null/omitted). Returns { status, confidence, support_count, valid_from,
// valid_until, evidence_hash } or null.
export function claimStatusAt(db, claimId, at = null) {
  if (at === null) {
    return db.prepare('SELECT status, confidence, support_count, contradiction_count, evidence_hash, evidence_count, oldest_evidence_at, valid_from, valid_until FROM claim_snapshots WHERE claim_id = ? AND valid_until IS NULL').get(claimId) ?? null;
  }
  return db.prepare(`
    SELECT status, confidence, support_count, contradiction_count, evidence_hash, evidence_count, oldest_evidence_at, valid_from, valid_until
    FROM claim_snapshots
    WHERE claim_id = ? AND valid_from <= ? AND (valid_until IS NULL OR valid_until > ?)
    ORDER BY valid_from DESC LIMIT 1
  `).get(claimId, at, at) ?? null;
}

// Full ordered ledger (oldest → newest) of a claim's verification states.
export function claimTimeline(db, claimId) {
  return db.prepare(`
    SELECT id, status, confidence, support_count, contradiction_count, evidence_hash, evidence_count, oldest_evidence_at, valid_from, valid_until, reason
    FROM claim_snapshots WHERE claim_id = ?
    ORDER BY valid_from ASC, id ASC
  `).all(claimId);
}

// EVIDENCE DRIFT — has the supporting evidence set changed since the snapshot
// that is currently open? True the moment recordSnapshot sees new evidence
// (new period opened). Exposed for reverify to explain WHY a claim moved.
export function evidenceDrifted(db, claimId) {
  return claimTransitions(db, claimId).length > 0;
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