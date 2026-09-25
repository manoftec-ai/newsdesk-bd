// lib/decision-rules.mjs — the deterministic rule set for LOCAL_DECISION_ROUTER.
//
// DETERMINISM CONTRACT
//   Every `when` is a pure function of the normalized state. No I/O, no clock, no
//   randomness, no network, no external model. The same state always yields the
//   same action. That is what makes the whole thing unit-testable and auditable.
//
// PRIORITY ORDER (documented, enforced by the engine's sort — a low-priority rule
// can never pre-empt a higher-priority safety rule):
//
//   1  Safety — secret material, or destructive/irreversible production change
//   2  Human approval — an explicit requirement for a person to decide
//   3  Repeated failure — the same failure two or more times
//   4  Research / verification — source conflict, stagnation, thin sourcing
//   5  Route ambiguity — materially different valid approaches exist
//   6  Task shape — simple deterministic work, or work that should be split
//   8  Default — CONTINUE
//
//   Each rule carries: id, priority, action, the decision types it applies to,
//   a plain-English description, a pure `when(state)` predicate, and a `reason`
//   builder. Rules are individually identifiable and individually testable.
import { ACTIONS, DECISION_TYPES } from './decision-state.mjs';

export const PRIORITY = Object.freeze({
  SAFETY: 1,
  HUMAN_APPROVAL: 2,
  FAILURE: 3,
  RESEARCH: 4,
  ROUTING: 5,
  TASK_SHAPE: 6,
  DEFAULT: 8,
});

/** Which decision types a rule is allowed to fire for. `null` = all types. */
const ALL = null;

// Threshold constants, collected here so they are easy to review and change.
// They encode the repo's own operational reality (see docs/DECISION-ROUTER.md).
export const THRESHOLDS = Object.freeze({
  FAILURE_CHANGE_STRATEGY_AT: 2, // same error twice -> stop repeating
  FAILURE_INVESTIGATE_AT: 3, // three times -> diagnose before touching anything
  FAILURE_ESCALATE_AT: 6, // six times -> a person must look at it
  RESEARCH_STAGNATION_ROUNDS: 3, // searches with no new information
  RESEARCH_MIN_SOURCES: 2, // below this the claim is not corroborated
  SPLIT_FILE_THRESHOLD: 5, // more files than this -> split the work
  SPLIT_SUBTASK_THRESHOLD: 3, // more parts than this -> split the work
  ROUTE_MIN_APPROACHES: 2, // how many routes before it counts as ambiguous
});

export const RULES = [
  // ---------------------------------------------------------------- priority 1: SAFETY
  {
    id: 'SEC_001',
    priority: PRIORITY.SAFETY,
    action: ACTIONS.HUMAN_REVIEW,
    appliesTo: ALL,
    description: 'Secret or credential material was detected in the decision state.',
    when: (s) => s.secretsDetected === true,
    reason: () => 'Credential-like material present in state; a person must handle it and it must not be logged or acted on automatically',
  },
  {
    id: 'PROD_001',
    priority: PRIORITY.SAFETY,
    action: ACTIONS.HUMAN_REVIEW,
    appliesTo: ALL,
    description: 'High-impact production change that is irreversible.',
    when: (s) => s.productionImpact === 'high' && s.irreversible === true,
    reason: (s) => `Irreversible high-impact production change (${s.productionImpact}/${s.irreversible ? 'irreversible' : 'reversible'}) requires human confirmation before any action`,
  },
  {
    id: 'PROD_002',
    priority: PRIORITY.SAFETY,
    action: ACTIONS.HUMAN_REVIEW,
    appliesTo: ALL,
    description: 'High-impact production change, even if reversible.',
    when: (s) => s.productionImpact === 'high',
    reason: (s) => `High production impact${s.irreversible ? ' and irreversible' : ''}; production-impacting actions stay behind human confirmation`,
  },

  // ---------------------------------------------------------- priority 2: HUMAN APPROVAL
  {
    id: 'APPROVAL_001',
    priority: PRIORITY.HUMAN_APPROVAL,
    action: ACTIONS.HUMAN_REVIEW,
    appliesTo: ALL,
    description: 'An explicit project requirement says a person must decide.',
    when: (s) => s.needsUserApproval === true,
    reason: () => 'State declares that human approval is required; the router must not pre-empt an explicit requirement',
  },

  // ------------------------------------------------------------- priority 3: FAILURE
  // Within one priority, the MORE SPECIFIC rule is declared first, because the
  // engine takes the first match. So the escalation threshold is checked before
  // the wider investigate threshold, which is checked before change-strategy.
  {
    id: 'FAILURE_004',
    priority: PRIORITY.FAILURE,
    action: ACTIONS.HUMAN_REVIEW,
    appliesTo: [DECISION_TYPES.FAILURE_ROUTING, DECISION_TYPES.AGENT_ROUTE],
    description: 'The same failure six or more times: a person must take over.',
    when: (s) => s.attempts >= THRESHOLDS.FAILURE_ESCALATE_AT && s.sameError === true,
    reason: (s) => `Same failure repeated ${s.attempts} times (>= ${THRESHOLDS.FAILURE_ESCALATE_AT}); automated attempts have clearly stopped working, escalate to a person`,
  },
  {
    id: 'FAILURE_003',
    priority: PRIORITY.FAILURE,
    action: ACTIONS.INVESTIGATE_ROOT_CAUSE,
    appliesTo: [DECISION_TYPES.FAILURE_ROUTING, DECISION_TYPES.AGENT_ROUTE],
    description: 'The same failure three or more times: diagnose before touching anything again.',
    when: (s) => s.attempts >= THRESHOLDS.FAILURE_INVESTIGATE_AT && s.sameError === true,
    reason: (s) => `Same failure signature ${s.failureSignature ? `"${s.failureSignature}" ` : ''}repeated ${s.attempts} times (>= ${THRESHOLDS.FAILURE_INVESTIGATE_AT}); find the cause before any further retry`,
  },
  {
    id: 'FAILURE_002',
    priority: PRIORITY.FAILURE,
    action: ACTIONS.CHANGE_STRATEGY,
    appliesTo: [DECISION_TYPES.FAILURE_ROUTING, DECISION_TYPES.AGENT_ROUTE],
    description: 'The same failure twice: stop repeating the same approach.',
    when: (s) => s.attempts >= THRESHOLDS.FAILURE_CHANGE_STRATEGY_AT && s.sameError === true,
    reason: (s) => `Same failure signature ${s.failureSignature ? `"${s.failureSignature}" ` : ''}repeated ${s.attempts} times (>= ${THRESHOLDS.FAILURE_CHANGE_STRATEGY_AT}); do not repeat the identical action, switch method`,
  },
  {
    id: 'FAILURE_001',
    priority: PRIORITY.FAILURE,
    action: ACTIONS.RETRY,
    appliesTo: [DECISION_TYPES.FAILURE_ROUTING, DECISION_TYPES.AGENT_ROUTE],
    description: 'Transient failure, few attempts so far: one more identical try is reasonable.',
    when: (s) => s.transientError === true && s.attempts < THRESHOLDS.FAILURE_INVESTIGATE_AT,
    reason: (s) => `Failure looks transient (${s.attempts} attempt${s.attempts === 1 ? '' : 's'} so far, below the change-strategy threshold of ${THRESHOLDS.FAILURE_CHANGE_STRATEGY_AT}); one more identical attempt is reasonable`,
  },

  // ------------------------------------------------------------ priority 4: RESEARCH
  {
    id: 'RESEARCH_004',
    priority: PRIORITY.RESEARCH,
    action: ACTIONS.VERIFY,
    appliesTo: [DECISION_TYPES.RESEARCH_DEPTH, DECISION_TYPES.ARTICLE_READINESS, DECISION_TYPES.AGENT_ROUTE],
    description: 'Sources conflict on something material: verify before writing.',
    when: (s) => s.conflictingSourceCount > 0,
    reason: (s) => `${s.conflictingSourceCount} conflicting source signal${s.conflictingSourceCount === 1 ? '' : 's'}; cross-check the specific claim before relying on it`,
  },
  {
    id: 'RESEARCH_006',
    priority: PRIORITY.RESEARCH,
    action: ACTIONS.STOP_RESEARCH,
    appliesTo: [DECISION_TYPES.RESEARCH_DEPTH],
    description: 'Research is stagnant and there is no alternative route: stop.',
    when: (s) => s.searchRounds >= THRESHOLDS.RESEARCH_STAGNATION_ROUNDS && s.newInformationLastRound === false && s.availableApproaches <= 1,
    reason: (s) => `No new information across ${s.searchRounds} search rounds and no alternative approach to try; stop rather than keep searching the same way`,
  },
  {
    id: 'RESEARCH_005',
    priority: PRIORITY.RESEARCH,
    action: ACTIONS.CHANGE_STRATEGY,
    appliesTo: [DECISION_TYPES.RESEARCH_DEPTH],
    description: 'Research is stagnant but another approach exists: change the approach.',
    when: (s) => s.searchRounds >= THRESHOLDS.RESEARCH_STAGNATION_ROUNDS && s.newInformationLastRound === false,
    reason: (s) => `No new information across ${s.searchRounds} search rounds (>= ${THRESHOLDS.RESEARCH_STAGNATION_ROUNDS}); the search method, not the goal, is the problem`,
  },
  {
    id: 'RESEARCH_002',
    priority: PRIORITY.RESEARCH,
    action: ACTIONS.RESEARCH_MORE,
    appliesTo: [DECISION_TYPES.RESEARCH_DEPTH, DECISION_TYPES.ARTICLE_READINESS],
    description: 'A primary/official source is needed and is not yet available.',
    when: (s) => s.primarySourceNeeded === true && s.primarySourceAvailable === false,
    reason: () => 'The key claim needs a primary or official record and none is available yet; obtain it before writing',
  },
  {
    id: 'RESEARCH_001',
    priority: PRIORITY.RESEARCH,
    action: ACTIONS.RESEARCH_MORE,
    appliesTo: [DECISION_TYPES.RESEARCH_DEPTH, DECISION_TYPES.ARTICLE_READINESS],
    description: 'Fewer than two sources: the claim is not yet corroborated.',
    when: (s) => typeof s.researchSourceCount === 'number' && s.researchSourceCount < THRESHOLDS.RESEARCH_MIN_SOURCES,
    reason: (s) => `Only ${s.researchSourceCount} source${s.researchSourceCount === 1 ? '' : 's'} (below ${THRESHOLDS.RESEARCH_MIN_SOURCES}); the claim is single-sourced`,
  },

  // ------------------------------------------------------------- priority 5: ROUTING
  {
    id: 'ROUTE_006',
    priority: PRIORITY.ROUTING,
    action: ACTIONS.ROUTE_DECISION,
    appliesTo: [DECISION_TYPES.AGENT_ROUTE, DECISION_TYPES.ARTICLE_MODE],
    description: 'Two or more materially different valid approaches exist: pick a route deliberately.',
    when: (s) => s.materiallyDifferent === true || s.availableApproaches >= THRESHOLDS.ROUTE_MIN_APPROACHES,
    reason: (s) => `${s.availableApproaches} materially different valid approach${s.availableApproaches === 1 ? '' : 'es'} available; choose one deliberately instead of drifting`,
  },

  // -------------------------------------------------------- priority 6: TASK SHAPE
  {
    id: 'TASK_002',
    priority: PRIORITY.TASK_SHAPE,
    action: ACTIONS.SKIP,
    appliesTo: ALL,
    description: 'A straightforward known file edit.',
    when: (s) => s.isKnownFileEdit === true,
    reason: () => 'Known, straightforward file edit; a routing decision adds no information',
  },
  {
    id: 'TASK_001',
    priority: PRIORITY.TASK_SHAPE,
    action: ACTIONS.SKIP,
    appliesTo: ALL,
    description: 'Deterministic, low-risk task.',
    when: (s) => s.taskType === 'deterministic_edit' && s.productionImpact === 'none' && s.irreversible === false,
    reason: () => 'Deterministic, low-risk task with no production impact; routing it would only add overhead',
  },
  {
    id: 'SPLIT_007',
    priority: PRIORITY.TASK_SHAPE,
    action: ACTIONS.SPLIT_TASK,
    appliesTo: ALL,
    description: 'The work is large and multi-part: split it before starting.',
    when: (s) => s.filesAffected >= THRESHOLDS.SPLIT_FILE_THRESHOLD || s.subtaskCount >= THRESHOLDS.SPLIT_SUBTASK_THRESHOLD,
    reason: (s) => `Large multi-part task (${s.filesAffected} file${s.filesAffected === 1 ? '' : 's'}, ${s.subtaskCount} part${s.subtaskCount === 1 ? '' : 's'}); split it so each part can be verified independently`,
  },

  // ------------------------------------------------------------------ priority 8: DEFAULT
  {
    id: 'DEFAULT_000',
    priority: PRIORITY.DEFAULT,
    action: ACTIONS.CONTINUE,
    appliesTo: ALL,
    description: 'Nothing higher-priority matched.',
    when: () => true,
    reason: () => 'No safety, approval, failure, research or routing condition matched; continue with the current plan',
  },
];

// Stable ordering: priority asc, then catalog order (declaration order) as the
// tiebreak. Guarantees that a lower-priority rule can never win over a
// higher-priority one, and that ordering is identical on every run.
export const ORDERED_RULES = RULES.map((r, index) => ({ ...r, _order: index })).sort(
  (a, b) => a.priority - b.priority || a._order - b._order,
);

export function rulesFor(decisionType) {
  return ORDERED_RULES.filter((r) => r.appliesTo === null || r.appliesTo.includes(decisionType));
}

export function listRules() {
  return ORDERED_RULES.map((r) => ({
    id: r.id,
    priority: r.priority,
    action: r.action,
    appliesTo: r.appliesTo === null ? 'ALL' : r.appliesTo.join('|'),
    description: r.description,
  }));
}
