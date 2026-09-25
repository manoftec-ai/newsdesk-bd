// lib/decision-router.mjs — LOCAL_DECISION_ROUTER engine.
//
// This is a local, deterministic, offline decision-routing framework inspired by
// the architecture of Jev-style typed decision models. IT IS NOT the TypeSafe
// Jev model. It makes no network call, needs no API key, uses no external AI,
// and produces no probabilistic score of any kind.
//
//   - `confidence` here is NOT an AI probability. It is a deterministic
//     "rule match strength" (see MATCH_STRENGTH) and is labelled as such in
//     every result as `ruleConfidence` / `confidenceKind`.
//   - The router is ADVISORY. In shadow mode it never changes the caller's
//     behaviour; it records what it WOULD have recommended.
//   - It never judges whether a factual claim is true. It only routes the next
//     verification/research action.
import { appendShadowLog } from './decision-log.mjs';
import { ACTIONS, DECISION_TYPES, normalizeState, summarizeState } from './decision-state.mjs';
import { rulesFor, PRIORITY } from './decision-rules.mjs';

export const ENGINE = 'LOCAL_DECISION_ROUTER';
export const ENGINE_VERSION = '1.0.0';

// Explicitly NOT a probability. How specifically a rule matched, and nothing else.
export const MATCH_STRENGTH = Object.freeze({ STRONG: 1, MODERATE: 0.75, WEAK: 0.5 });

export { ACTIONS, DECISION_TYPES, PRIORITY };

/**
 * DecisionRequest
 *   { decisionType, task, state, history, constraints }
 * `history` and `constraints` are accepted and preserved for the record; the
 * rule engine reads only the normalized `state`, which keeps predicates pure.
 */
export function buildRequest({ decisionType, task = '', state = {}, history = [], constraints = {} } = {}) {
  return {
    decisionType,
    task: typeof task === 'string' ? task.slice(0, 300) : '',
    state: normalizeState(state),
    history: Array.isArray(history) ? history.slice(0, 20) : [],
    constraints: constraints && typeof constraints === 'object' ? constraints : {},
  };
}

/** How strongly a rule matched, derived only from the conditions it tested. */
function matchStrength(rule, state) {
  if (rule.priority === PRIORITY.SAFETY) return MATCH_STRENGTH.STRONG;
  if (rule.priority === PRIORITY.FAILURE) {
    // More repeats than the threshold => more specific match.
    return state.attempts >= 5 ? MATCH_STRENGTH.STRONG : MATCH_STRENGTH.MODERATE;
  }
  if (rule.priority === PRIORITY.ROUTING) {
    return state.availableApproaches >= 3 ? MATCH_STRENGTH.STRONG : MATCH_STRENGTH.MODERATE;
  }
  return MATCH_STRENGTH.MODERATE;
}

/**
 * The single entry point.
 *
 * Always resolves. Never throws. Never mutates anything. Always returns a
 * DecisionResult, including for malformed input.
 *
 * opts: { shadowMode, env, now, logDirOverride }
 */
export function decide(request, opts = {}) {
  const { env = process.env, now = new Date(), shadowMode = true } = opts;
  const started = process.hrtime.bigint();

  const disabled = ['disabled', 'off', 'false', '0'].includes(String(env.LDR_MODE ?? '').toLowerCase());

  const decisionType = request?.decisionType;
  const known = Object.values(DECISION_TYPES).includes(decisionType);
  const state = request?.state && typeof request.state === 'object' ? request.state : normalizeState({});

  // A trace of every rule considered, so the decision is auditable rather than opaque.
  const candidates = known && !disabled ? rulesFor(decisionType) : [];
  const trace = [];
  let winner = null;

  for (const rule of candidates) {
    const matched = rule.when(state) === true;
    trace.push({ id: rule.id, priority: rule.priority, action: rule.action, matched });
    if (matched && !winner) winner = rule; // first match in priority order wins
  }

  const rule = winner || {
    id: 'DEFAULT_000',
    priority: PRIORITY.DEFAULT,
    action: disabled ? ACTIONS.SKIP : ACTIONS.CONTINUE,
    reason: () => (disabled ? 'Router disabled via LDR_MODE; no decision was made' : 'Decision type not recognised; no rule evaluated'),
  };

  const durationUs = Number((process.hrtime.bigint() - started) / 1000n);

  const result = {
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    ts: now.toISOString(),
    // NOT a Jev model and not a probability. Named for what it is.
    isLocalDeterministic: true,
    isExternalModel: false,
    decisionType: decisionType ?? null,
    task: request?.task ?? '',
    action: rule.action,
    ruleId: rule.id,
    rulePriority: rule.priority,
    reason: typeof rule.reason === 'function' ? rule.reason(state) : String(rule.reason),
    // Deterministic rule-match strength. NOT an AI confidence or probability.
    ruleConfidence: matchStrength(rule, state),
    confidenceKind: 'deterministic-rule-match-strength',
    confidenceIsProbability: false,
    requiresHumanApproval: rule.action === ACTIONS.HUMAN_REVIEW,
    shadowMode: shadowMode === true,
    wouldChangeWorkflow: false, // shadow mode can never change the workflow
    disabled,
    state: summarizeState(state),
    history: request?.history ?? [],
    evaluated: trace,
    durationUs,
  };

  const logFile = appendShadowLog(
    {
      engine: ENGINE,
      engineVersion: ENGINE_VERSION,
      ts: now.toISOString(),
      task: result.task,
      decisionType: result.decisionType,
      ruleId: result.ruleId,
      rulePriority: result.rulePriority,
      action: result.action,
      reason: result.reason,
      ruleConfidence: result.ruleConfidence,
      confidenceKind: result.confidenceKind,
      requiresHumanApproval: result.requiresHumanApproval,
      shadowMode: result.shadowMode,
      wouldChangeWorkflow: result.wouldChangeWorkflow,
      disabled: result.disabled,
      state: result.state,
      durationUs: result.durationUs,
    },
    { env, now },
  );

  return { ...result, logFile };
}
