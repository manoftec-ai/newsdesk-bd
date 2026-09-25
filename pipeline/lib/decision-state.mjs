// lib/decision-state.mjs — compact, redacted decision state for LOCAL_DECISION_ROUTER.
//
// This is the ONLY shape the rule engine reads. It is deliberately small and
// scalar-typed so that a rule predicate is a pure function with no I/O, no
// network and no hidden context. Same state in => same action out, always.
//
// NEVER store credentials here. `normalizeState` actively detects secret-looking
// strings in the caller's input and both redacts them and raises
// `secretsDetected`, which SEC_001 turns into HUMAN_REVIEW.
import { redact } from './decision-log.mjs';

/** The full action vocabulary the router can return. */
export const ACTIONS = Object.freeze({
  SKIP: 'SKIP',
  CONTINUE: 'CONTINUE',
  RESEARCH_MORE: 'RESEARCH_MORE',
  CHANGE_STRATEGY: 'CHANGE_STRATEGY',
  RETRY: 'RETRY',
  VERIFY: 'VERIFY',
  HUMAN_REVIEW: 'HUMAN_REVIEW',
  SPLIT_TASK: 'SPLIT_TASK',
  INVESTIGATE_ROOT_CAUSE: 'INVESTIGATE_ROOT_CAUSE',
  ROUTE_DECISION: 'ROUTE_DECISION',
  STOP_RESEARCH: 'STOP_RESEARCH',
});

export const DECISION_TYPES = Object.freeze({
  AGENT_ROUTE: 'AGENT_ROUTE',
  FAILURE_ROUTING: 'FAILURE_ROUTING',
  RESEARCH_DEPTH: 'RESEARCH_DEPTH',
  ARTICLE_MODE: 'ARTICLE_MODE',
  ARTICLE_READINESS: 'ARTICLE_READINESS',
});

// Detection patterns for "this state contains credential material".
const SECRET_DETECT = [
  /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/i,
  /\b[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[A-Za-z0-9_]*\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{8,}/i,
  /\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
];

function walkStrings(value, out, depth = 0) {
  if (depth > 6 || value == null) return;
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) walkStrings(v, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value)) walkStrings(v, out, depth + 1);
  }
}

/** True when any string anywhere in the input looks like credential material. */
export function detectSecrets(input) {
  const strings = [];
  walkStrings(input, strings);
  return strings.some((s) => SECRET_DETECT.some((re) => re.test(s)));
}

const num = (v, dflt) => (typeof v === 'number' && Number.isFinite(v) ? v : dflt);
const bool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);
/** Strings are redacted on the way IN, so a secret never even reaches the state. */
const str = (v, dflt) => (typeof v === 'string' && v.trim() ? redact(v.trim().slice(0, 300)) : dflt);
const prodImpact = (v) => (['none', 'low', 'high'].includes(v) ? v : 'none');
const nullableBool = (v) => (typeof v === 'boolean' ? v : null);
const nullableNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Build the canonical state object. Unknown keys are dropped — the engine must
 * never depend on a field it does not explicitly understand.
 */
export function normalizeState(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const secretsDetected = bool(input.secretsDetected, false) || detectSecrets(input);

  const state = {
    taskType: str(input.taskType, 'unknown'),
    operation: str(input.operation, ''),
    attempts: Math.max(0, num(input.attempts, 0)),
    sameError: bool(input.sameError, false),
    failureSignature: str(input.failureSignature, null),
    transientError: bool(input.transientError, false),
    filesAffected: Math.max(0, num(input.filesAffected, 1)),
    subtaskCount: Math.max(0, num(input.subtaskCount, 0)),
    productionImpact: prodImpact(input.productionImpact),
    irreversible: bool(input.irreversible, false),
    needsUserApproval: bool(input.needsUserApproval, false),
    secretsDetected,
    availableApproaches: Math.max(1, num(input.availableApproaches, 1)),
    materiallyDifferent: bool(input.materiallyDifferent, false),
    researchSourceCount: nullableNum(input.researchSourceCount),
    conflictingSourceCount: Math.max(0, num(input.conflictingSourceCount, 0)),
    primarySourceAvailable: nullableBool(input.primarySourceAvailable),
    primarySourceNeeded: bool(input.primarySourceNeeded, false),
    searchRounds: Math.max(0, num(input.searchRounds, 0)),
    newInformationLastRound: nullableBool(input.newInformationLastRound),
    isKnownFileEdit: bool(input.isKnownFileEdit, false),
    bodyWordCount: nullableNum(input.bodyWordCount),
    previousActions: Array.isArray(input.previousActions) ? input.previousActions.filter((a) => typeof a === 'string').slice(0, 20) : [],
    elapsedMs: nullableNum(input.elapsedMs),
    claimVerifiable: nullableBool(input.claimVerifiable),
  };

  return state;
}

/**
 * A short, safe summary for logs and for the agent. Never includes raw input.
 * Omit-empty: null/undefined, empty strings, empty arrays, `false`, `0` and
 * 'none' are dropped, because they carry no information and would drown the log.
 * Their values are the documented defaults, so absence is unambiguous.
 */
export function summarizeState(state) {
  const out = {};
  for (const [k, v] of Object.entries(state)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length) out[k] = v.slice(0, 5);
      continue;
    }
    if (typeof v === 'boolean') {
      if (v) out[k] = true;
      continue;
    }
    if (typeof v === 'number') {
      if (v !== 0) out[k] = v;
      continue;
    }
    if (typeof v === 'string') {
      if (v && v !== 'none' && v !== 'unknown') out[k] = v;
      continue;
    }
  }
  return redact(out);
}
