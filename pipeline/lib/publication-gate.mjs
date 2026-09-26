// lib/publication-gate.mjs — final deterministic publication authority.
//
// This gate is intentionally fail-closed. A story is publishable only when the
// immutable evidence snapshot in store.db, the exported brief, and the writer's
// body all agree. No network calls and no LLM calls happen here.
import { mechanicalAudit, listPromiseCheck } from './audit.mjs';
import { evidenceHash } from './claim-verify.mjs';
import { readerValueCheck } from './editorial.mjs';
import { HYPE_TERMS, lexicalSupport, tokenize, verifyHeadline } from './headline-verify.mjs';
import { loadLineage } from './lineage.mjs';
import { loadTrust } from './verify.mjs';

export const PUBLICATION_GATE_VERSION = '1.0.0';

export const PUBLICATION_FAILURE_CODES = Object.freeze({
  BRIEF_INVALID: 'BRIEF_INVALID',
  DATABASE_CONTEXT_MISSING: 'DATABASE_CONTEXT_MISSING',
  DATABASE_CONTEXT_INVALID: 'DATABASE_CONTEXT_INVALID',
  BRIEF_NOT_MATURE: 'BRIEF_NOT_MATURE',
  CLUSTER_CONTEXT_MISMATCH: 'CLUSTER_CONTEXT_MISMATCH',
  VERDICT_MISSING: 'VERDICT_MISSING',
  VERDICT_NOT_PASSED: 'VERDICT_NOT_PASSED',
  VERDICT_MISMATCH: 'VERDICT_MISMATCH',
  TIER_POLICY_FAILED: 'TIER_POLICY_FAILED',
  CLAIM_MANIFEST_MISSING: 'CLAIM_MANIFEST_MISSING',
  CLAIM_EVIDENCE_MISSING: 'CLAIM_EVIDENCE_MISSING',
  CLAIM_STATUS_FAILED: 'CLAIM_STATUS_FAILED',
  CLAIM_VERDICT_STALE: 'CLAIM_VERDICT_STALE',
  UNRESOLVED_CONFLICT: 'UNRESOLVED_CONFLICT',
  GOOGLE_NEWS_WRAPPER_UNRESOLVED: 'GOOGLE_NEWS_WRAPPER_UNRESOLVED',
  SOURCE_LINEAGE_UNKNOWN: 'SOURCE_LINEAGE_UNKNOWN',
  SOURCE_MANIFEST_INVALID: 'SOURCE_MANIFEST_INVALID',
  CLUSTER_MEMBERSHIP_MISMATCH: 'CLUSTER_MEMBERSHIP_MISMATCH',
  UNRELATED_CLUSTER_MEMBER: 'UNRELATED_CLUSTER_MEMBER',
  HEADLINE_UNSUPPORTED: 'HEADLINE_UNSUPPORTED',
  HEADLINE_HYPE: 'HEADLINE_HYPE',
  MECHANICAL_AUDIT_FAILED: 'MECHANICAL_AUDIT_FAILED',
  QUOTE_INTEGRITY_FAILED: 'QUOTE_INTEGRITY_FAILED',
  READER_VALUE_FAILED: 'READER_VALUE_FAILED',
  LIST_PROMISE_FAILED: 'LIST_PROMISE_FAILED',
  ARTIFICIAL_GENERIC_HEADING: 'ARTIFICIAL_GENERIC_HEADING',
  INVALID_FRONTMATTER: 'INVALID_FRONTMATTER',
});

const BADGE_RANK = Object.freeze({ skeptical: 0, single: 1, confirmed: 2, verified: 3 });
// 2026-09-26: see lib/verify.mjs - tier A may publish on a single source, but the
// badge logic is unchanged so it can never be labelled 'confirmed' without
// corroboration.
const DEFAULT_MIN_BADGE = Object.freeze({ A: 'single', B: 'single', C: 'single' });
const PUBLISHABLE_CLAIM_STATUSES = new Set(['VERIFIED', 'CORROBORATED', 'OFFICIAL', 'SINGLE_SOURCE']);
const BLOCKED_CLAIM_STATUSES = new Set(['UNCONFIRMED', 'CONFLICTING', 'REFUTED', 'OUTDATED']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const GENERIC_HEADINGS = new Set([
  'মূল খবর',
  'মূল তথ্য',
  'মূল বিষয়',
  'কী জানা গেছে',
  'কী জানা যায়নি',
  'কী এখনো জানা যায়নি',
  'কেন গুরুত্বপূর্ণ',
  'কেন নিশ্চিত',
  'সংক্ষেপে',
  'বিস্তারিত তথ্য',
  'সর্বশেষ তথ্য',
]);

function isoNow(now) {
  const value = now instanceof Date ? new Date(now.getTime()) : new Date(now ?? Date.now());
  return Number.isNaN(value.getTime()) ? new Date().toISOString() : value.toISOString();
}

function asHttpUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

export function isUnresolvedGoogleNewsUrl(value) {
  const url = asHttpUrl(value);
  if (!url) return false;
  const host = url.hostname.toLowerCase();
  return host === 'news.google.com' || host.endsWith('.news.google.com');
}

function normalizedText(value) {
  return String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim();
}

function memberKey(member) {
  const source = normalizedText(member?.source_id).toLowerCase();
  const url = asHttpUrl(member?.url)?.href ?? normalizedText(member?.url);
  const title = normalizedText(member?.title).toLowerCase();
  return `${source}|${url}|${title}`;
}

function isKnownSource(sourceId, trust, lineage) {
  const id = normalizedText(sourceId);
  if (!id) return false;
  return Boolean(lineage?.[id])
    || Object.hasOwn(trust?.sources ?? {}, id)
    || (Array.isArray(trust?.channels) && trust.channels.some((channel) => channel?.id === id));
}

function safeTrust(value) {
  if (value) return value;
  try { return loadTrust(); } catch { return { sources: {} }; }
}

function safeLineage(value) {
  if (value) return value;
  try { return loadLineage(); } catch { return {}; }
}

function queryAll(database, sql, ...params) {
  return database.prepare(sql).all(...params);
}

function queryOne(database, sql, ...params) {
  return database.prepare(sql).get(...params);
}

function hasUnresolvedResolution(value) {
  const normalized = normalizedText(value).toLowerCase();
  return !normalized || ['unresolved', 'open', 'pending'].includes(normalized);
}

function strongestClaim(brief, databaseClaims) {
  const briefClaims = Array.isArray(brief?.claims) ? brief.claims : [];
  if (briefClaims.length) {
    return [...briefClaims].sort((a, b) => Number(b?.confidence ?? 0) - Number(a?.confidence ?? 0))[0] ?? null;
  }
  return [...databaseClaims].sort((a, b) => Number(b?.confidence ?? 0) - Number(a?.confidence ?? 0))[0] ?? null;
}

function headlineHasHype(text) {
  const value = normalizedText(text);
  return HYPE_TERMS.some((term) => value.includes(term));
}

function containsFrontmatter(body) {
  return /^\uFEFF?---(?:\r?\n|$)/u.test(String(body ?? '').trimStart());
}

function artificialHeadings(body) {
  const found = [];
  for (const line of String(body ?? '').split(/\r?\n/u)) {
    const markdown = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/u)?.[1];
    const bold = line.match(/^\s*\*\*(.+?)\*\*\s*$/u)?.[1];
    const heading = normalizedText(markdown ?? bold ?? '')
      .replace(/[?!।:]+$/u, '')
      .replace(/\s+/gu, ' ');
    if (heading && GENERIC_HEADINGS.has(heading)) found.push(heading);
  }
  return found;
}

function memberIsRelated(member, headline, body) {
  const title = normalizedText(member?.title);
  const memberText = normalizedText(`${title} ${String(member?.body ?? member?.lead ?? '').slice(0, 800)}`);
  const context = normalizedText(`${headline} ${body}`);
  if (!title || !memberText) return false;

  const headlineToMember = lexicalSupport(headline, memberText).ratio;
  const memberToContext = lexicalSupport(title, context).ratio;
  if (headlineToMember >= 0.3 || memberToContext >= 0.3) return true;

  const headlineTokens = tokenize(headline).set;
  const memberTokens = tokenize(memberText).set;
  const shared = [...headlineTokens].filter((token) => memberTokens.has(token));
  if (shared.length >= 2) return true;
  return shared.length === 1 && /[\d০-৯]/u.test(shared[0]);
}

function claimTextKey(value) {
  return normalizedText(value).toLowerCase();
}

function evaluateDatabase(brief, database, failures) {
  const clusterId = Number(brief?.clusterId);
  if (!Number.isInteger(clusterId) || clusterId < 1) {
    failures.add(PUBLICATION_FAILURE_CODES.BRIEF_INVALID);
    return null;
  }

  try {
    const cluster = queryOne(
      database,
      'SELECT id, status, headline, member_count, mature_runs FROM clusters WHERE id = ?',
      clusterId,
    );
    const verdict = queryOne(
      database,
      'SELECT cluster_id, tier, score, badge, status, evaluated_at FROM verdicts WHERE cluster_id = ?',
      clusterId,
    );
    const members = queryAll(
      database,
      `SELECT cm.source_id, r.url, r.title, r.body, r.published_at
       FROM cluster_members cm JOIN raw_items r ON r.id = cm.item_id
       WHERE cm.cluster_id = ? ORDER BY r.published_at ASC, r.id ASC`,
      clusterId,
    );
    const claims = queryAll(
      database,
      `SELECT id, claim_text, status, confidence, updated_at
       FROM claims WHERE cluster_id = ? ORDER BY id ASC`,
      clusterId,
    );
    const evidence = claims.length
      ? queryAll(
          database,
          `SELECT ce.claim_id, ce.source_id, ce.url, ce.excerpt, ce.relation,
                  ce.evidence_type, ce.published_at
           FROM claim_evidence ce
           JOIN claims c ON c.id = ce.claim_id
           WHERE c.cluster_id = ?
           ORDER BY ce.claim_id ASC, ce.id ASC`,
          clusterId,
        )
      : [];
    const conflicts = queryAll(
      database,
      'SELECT id, claim_id, conflict_type, resolution FROM conflicts WHERE cluster_id = ? ORDER BY id ASC',
      clusterId,
    );
    return { clusterId, cluster, verdict, members, claims, evidence, conflicts };
  } catch {
    failures.add(PUBLICATION_FAILURE_CODES.DATABASE_CONTEXT_INVALID);
    return null;
  }
}

function checkBriefShape(brief, failures) {
  const valid = brief && typeof brief === 'object'
    && Number.isInteger(Number(brief.clusterId))
    && Number(brief.clusterId) > 0
    && SLUG_RE.test(String(brief.slug ?? ''))
    && String(brief.slug) === String(brief.slug).toLowerCase()
    && normalizedText(brief.headline).length > 0
    && Array.isArray(brief.members)
    && brief.members.length > 0
    && Array.isArray(brief.sources)
    && Array.isArray(brief.claims);
  if (!valid) failures.add(PUBLICATION_FAILURE_CODES.BRIEF_INVALID);
  return valid;
}

function checkCluster(brief, context, failures) {
  if (!context?.cluster || !['mature'].includes(String(context.cluster.status))) {
    failures.add(PUBLICATION_FAILURE_CODES.BRIEF_NOT_MATURE);
  }
  if (normalizedText(brief?.status) !== 'mature') {
    failures.add(PUBLICATION_FAILURE_CODES.BRIEF_NOT_MATURE);
  }
  if (
    !context?.cluster
    || Number(context.cluster.id) !== Number(brief?.clusterId)
    || normalizedText(context.cluster.headline) !== normalizedText(brief?.headline)
  ) {
    failures.add(PUBLICATION_FAILURE_CODES.CLUSTER_CONTEXT_MISMATCH);
  }
}

function checkVerdict(brief, context, verifyPolicy, failures) {
  const briefVerdict = brief?.verdict;
  const dbVerdict = context?.verdict;
  if (!briefVerdict || !dbVerdict || !dbVerdict.evaluated_at || Number.isNaN(Date.parse(dbVerdict.evaluated_at))) {
    failures.add(PUBLICATION_FAILURE_CODES.VERDICT_MISSING);
    return;
  }
  if (briefVerdict.status !== 'passed' || dbVerdict.status !== 'passed') {
    failures.add(PUBLICATION_FAILURE_CODES.VERDICT_NOT_PASSED);
  }

  const briefTier = String(briefVerdict.tier ?? brief?.tier ?? '').toUpperCase();
  const dbTier = String(dbVerdict.tier ?? '').toUpperCase();
  const briefBadge = String(briefVerdict.badge ?? '').toLowerCase();
  const dbBadge = String(dbVerdict.badge ?? '').toLowerCase();
  if (
    briefTier !== dbTier
    || briefBadge !== dbBadge
    || !Object.hasOwn(BADGE_RANK, briefBadge)
    || !Number.isFinite(Number(dbVerdict.score))
  ) {
    failures.add(PUBLICATION_FAILURE_CODES.VERDICT_MISMATCH);
  }

  const minimum = String(verifyPolicy.minBadge?.[dbTier] ?? DEFAULT_MIN_BADGE[dbTier] ?? 'verified').toLowerCase();
  if (!['A', 'B', 'C'].includes(dbTier) || BADGE_RANK[dbBadge] < (BADGE_RANK[minimum] ?? 3)) {
    failures.add(PUBLICATION_FAILURE_CODES.TIER_POLICY_FAILED);
  }
}

function checkClaims(brief, context, trust, lineage, failures) {
  const claims = context?.claims ?? [];
  const briefClaims = Array.isArray(brief?.claims) ? brief.claims : [];
  if (!claims.length || !briefClaims.length) {
    failures.add(PUBLICATION_FAILURE_CODES.CLAIM_MANIFEST_MISSING);
    return [];
  }

  const databaseByText = new Map(claims.map((claim) => [claimTextKey(claim.claim_text), claim]));
  const briefTexts = new Set(briefClaims.map((claim) => claimTextKey(claim?.claim_text)));
  if (
    briefTexts.size !== claims.length
    || [...briefTexts].some((text) => !databaseByText.has(text))
    || claims.some((claim) => !briefTexts.has(claimTextKey(claim.claim_text)))
  ) {
    failures.add(PUBLICATION_FAILURE_CODES.CLAIM_VERDICT_STALE);
  }

  for (const briefClaim of briefClaims) {
    const dbClaim = databaseByText.get(claimTextKey(briefClaim?.claim_text));
    if (dbClaim && String(briefClaim?.status ?? '').toUpperCase() !== String(dbClaim.status ?? '').toUpperCase()) {
      failures.add(PUBLICATION_FAILURE_CODES.CLAIM_VERDICT_STALE);
    }
  }

  const evidence = context?.evidence ?? [];
  const evidenceByClaim = new Map();
  for (const row of evidence) {
    if (!evidenceByClaim.has(Number(row.claim_id))) evidenceByClaim.set(Number(row.claim_id), []);
    evidenceByClaim.get(Number(row.claim_id)).push(row);
  }

  for (const claim of claims) {
    const status = String(claim.status ?? '').toUpperCase();
    if (!PUBLISHABLE_CLAIM_STATUSES.has(status)) {
      if (BLOCKED_CLAIM_STATUSES.has(status)) failures.add(PUBLICATION_FAILURE_CODES.CLAIM_STATUS_FAILED);
      else failures.add(PUBLICATION_FAILURE_CODES.CLAIM_VERDICT_STALE);
    }

    const rows = evidenceByClaim.get(Number(claim.id)) ?? [];
    const supporting = rows.filter((row) => String(row.relation ?? 'supports') !== 'contradicts');
    const usable = supporting.filter((row) => {
      const url = asHttpUrl(row.url);
      return url && !isUnresolvedGoogleNewsUrl(row.url)
        && isKnownSource(row.source_id, trust, lineage);
    });
    if (!usable.length) failures.add(PUBLICATION_FAILURE_CODES.CLAIM_EVIDENCE_MISSING);
  }
  return evidence;
}

function checkConflicts(context, failures) {
  for (const conflict of context?.conflicts ?? []) {
    if (hasUnresolvedResolution(conflict.resolution)) {
      failures.add(PUBLICATION_FAILURE_CODES.UNRESOLVED_CONFLICT);
    }
  }
}

function checkSourcesAndMembers(brief, context, trust, lineage, failures) {
  const briefMembers = Array.isArray(brief?.members) ? brief.members : [];
  const dbMembers = context?.members ?? [];
  const briefKeys = new Set(briefMembers.map(memberKey));
  const dbKeys = new Set(dbMembers.map(memberKey));
  if (
    briefKeys.size !== briefMembers.length
    || dbKeys.size !== dbMembers.length
    || briefKeys.size !== dbKeys.size
    || [...briefKeys].some((key) => !dbKeys.has(key))
  ) {
    failures.add(PUBLICATION_FAILURE_CODES.CLUSTER_MEMBERSHIP_MISMATCH);
  }

  const allMembers = [...briefMembers, ...dbMembers];
  for (const member of allMembers) {
    if (isUnresolvedGoogleNewsUrl(member?.url)) {
      failures.add(PUBLICATION_FAILURE_CODES.GOOGLE_NEWS_WRAPPER_UNRESOLVED);
    }
    if (!asHttpUrl(member?.url)) {
      failures.add(PUBLICATION_FAILURE_CODES.SOURCE_MANIFEST_INVALID);
    }
    if (!isKnownSource(member?.source_id, trust, lineage)) {
      failures.add(PUBLICATION_FAILURE_CODES.SOURCE_LINEAGE_UNKNOWN);
    }
  }

  const sourceEntries = Array.isArray(brief?.sources) ? brief.sources : [];
  const sourceUrls = new Set();
  for (const source of sourceEntries) {
    const url = asHttpUrl(source?.url);
    if (!normalizedText(source?.name) || !url) {
      failures.add(PUBLICATION_FAILURE_CODES.SOURCE_MANIFEST_INVALID);
      continue;
    }
    if (isUnresolvedGoogleNewsUrl(source.url)) {
      failures.add(PUBLICATION_FAILURE_CODES.GOOGLE_NEWS_WRAPPER_UNRESOLVED);
    }
    sourceUrls.add(url.href);
  }
  for (const member of briefMembers) {
    const url = asHttpUrl(member?.url);
    if (!url || !sourceUrls.has(url.href)) {
      failures.add(PUBLICATION_FAILURE_CODES.SOURCE_MANIFEST_INVALID);
    }
  }

  for (const member of allMembers) {
    if (!memberIsRelated(member, brief?.headline, String(brief?.body ?? ''))) {
      failures.add(PUBLICATION_FAILURE_CODES.UNRELATED_CLUSTER_MEMBER);
    }
  }
}

function checkHeadline(brief, context, failures) {
  const claim = strongestClaim(brief, context?.claims ?? []);
  const headline = String(brief?.headline ?? '');
  const variants = [brief?.seoTitle, brief?.excerpt, brief?.summary, brief?.socialTitle]
    .filter((value) => typeof value === 'string' && value.trim());
  const result = verifyHeadline(headline, {
    variants,
    leads: (brief?.members ?? []).map((member) => `${member?.title ?? ''} ${member?.lead ?? ''}`),
    claim,
  });

  const surfacesWeak = Object.values(result.surfaces ?? {}).some((surface) => ['weak', 'poor', 'overclaim'].includes(surface?.status));
  const claimStatus = String(claim?.status ?? '').toUpperCase();
  const tier = String(brief?.verdict?.tier ?? brief?.tier ?? '').toUpperCase();
  if (!headline || !claim || result.status !== 'supported' || surfacesWeak || (tier === 'A' && claimStatus === 'SINGLE_SOURCE')) {
    failures.add(PUBLICATION_FAILURE_CODES.HEADLINE_UNSUPPORTED);
  }
  if (result.flags.includes('hype') || variants.some(headlineHasHype) || headlineHasHype(headline)) {
    failures.add(PUBLICATION_FAILURE_CODES.HEADLINE_HYPE);
  }
}

function checkBody(brief, body, failures) {
  if (containsFrontmatter(body)) failures.add(PUBLICATION_FAILURE_CODES.INVALID_FRONTMATTER);
  if (artificialHeadings(body).length) failures.add(PUBLICATION_FAILURE_CODES.ARTIFICIAL_GENERIC_HEADING);

  const audit = mechanicalAudit(brief, body);
  if (!audit.pass) failures.add(PUBLICATION_FAILURE_CODES.MECHANICAL_AUDIT_FAILED);
  if (audit.fails.some((failure) => failure.id === 'n14' && /^quote not found/u.test(String(failure.note)))) {
    failures.add(PUBLICATION_FAILURE_CODES.QUOTE_INTEGRITY_FAILED);
  }

  const reader = readerValueCheck(brief?.headline ?? '', body);
  if (!reader.ok) failures.add(PUBLICATION_FAILURE_CODES.READER_VALUE_FAILED);
  const list = listPromiseCheck(brief?.headline ?? '', body);
  if (!list.ok) failures.add(PUBLICATION_FAILURE_CODES.LIST_PROMISE_FAILED);
}

function normalizeGateInput(input, body, database, now) {
  if (input && typeof input === 'object' && (
    Object.hasOwn(input, 'brief') || Object.hasOwn(input, 'body') || Object.hasOwn(input, 'database')
  )) {
    return {
      brief: input.brief,
      body: input.body,
      database: input.database,
      now: input.now,
      trust: input.trust,
      lineage: input.lineage,
      verifyPolicy: input.verifyPolicy,
    };
  }
  return { brief: input, body, database, now, trust: null, lineage: null, verifyPolicy: null };
}

export function runPublicationGate(input, body, database, now) {
  const options = normalizeGateInput(input, body, database, now);
  const checkedAt = isoNow(options.now);
  const failures = new Set();
  const trust = safeTrust(options.trust);
  const lineage = safeLineage(options.lineage);
  const verifyPolicy = {
    minBadge: { ...DEFAULT_MIN_BADGE, ...(options.verifyPolicy?.minBadge ?? options.verifyPolicy?.min_badge ?? {}) },
  };
  const draftBody = String(options.body ?? '');

  if (!checkBriefShape(options.brief, failures)) {
    return {
      pass: false,
      failureCodes: [...failures],
      claimIds: [],
      clusterId: null,
      evidenceHash: evidenceHash([]),
      checkedAt,
      gateVersion: PUBLICATION_GATE_VERSION,
    };
  }
  if (!options.database || typeof options.database.prepare !== 'function') {
    failures.add(PUBLICATION_FAILURE_CODES.DATABASE_CONTEXT_MISSING);
    return {
      pass: false,
      failureCodes: [...failures],
      claimIds: [],
      clusterId: null,
      evidenceHash: evidenceHash([]),
      checkedAt,
      gateVersion: PUBLICATION_GATE_VERSION,
    };
  }

  const context = evaluateDatabase(options.brief, options.database, failures);
  if (context) {
    checkCluster(options.brief, context, failures);
    checkVerdict(options.brief, context, verifyPolicy, failures);
    const evidence = checkClaims(options.brief, context, trust, lineage, failures);
    checkConflicts(context, failures);
    checkSourcesAndMembers(options.brief, context, trust, lineage, failures);
    checkHeadline(options.brief, context, failures);
    checkBody(options.brief, draftBody, failures);

    const claimIds = context.claims.map((claim) => Number(claim.id)).filter(Number.isInteger).sort((a, b) => a - b);
    return {
      pass: failures.size === 0,
      failureCodes: [...failures],
      claimIds,
      clusterId: context.clusterId,
      evidenceHash: evidenceHash(evidence),
      checkedAt,
      gateVersion: PUBLICATION_GATE_VERSION,
    };
  }

  return {
    pass: false,
    failureCodes: [...failures],
    claimIds: [],
    evidenceHash: evidenceHash([]),
    checkedAt,
    gateVersion: PUBLICATION_GATE_VERSION,
  };
}

// Friendly aliases keep the gate easy to consume from tools without coupling
// callers to one spelling of the operation.
export const evaluatePublication = runPublicationGate;
export const publicationGate = runPublicationGate;
export const evaluatePublicationGate = runPublicationGate;

export default runPublicationGate;
