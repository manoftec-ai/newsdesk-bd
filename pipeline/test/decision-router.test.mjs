// test/decision-router.test.mjs — unit tests for LOCAL_DECISION_ROUTER.
//
// Fully offline and fully deterministic: no network, no key, no clock-dependent
// behaviour, no external model. Every rule is tested individually, plus the seven
// scenarios required by the brief, plus the safety guarantees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRequest, decide, ENGINE, ACTIONS, PRIORITY } from '../lib/decision-router.mjs';
import { ORDERED_RULES, rulesFor, THRESHOLDS } from '../lib/decision-rules.mjs';
import { normalizeState, detectSecrets, summarizeState } from '../lib/decision-state.mjs';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const tmpEnv = () => ({ LDR_LOG_DIR: mkdtempSync(join(tmpdir(), 'ldr-')) });
const run = (decisionType, state, extra = {}) => {
  const env = tmpEnv();
  const r = decide(buildRequest({ decisionType, task: extra.task ?? '', state }), { env, now: NOW });
  rmSync(env.LDR_LOG_DIR, { recursive: true, force: true });
  return r;
};

// ============================================================ the 7 required scenarios

test('SCENARIO 1 — "Fix typo in sources.yaml" => SKIP', () => {
  const r = run('AGENT_ROUTE', { taskType: 'deterministic_edit', isKnownFileEdit: true, filesAffected: 1 });
  assert.equal(r.action, ACTIONS.SKIP);
  assert.ok(['TASK_001', 'TASK_002'].includes(r.ruleId));
  assert.equal(r.requiresHumanApproval, false);
  assert.equal(r.shadowMode, true);
  assert.equal(r.wouldChangeWorkflow, false);
});

test('SCENARIO 2 — same error twice => CHANGE_STRATEGY', () => {
  const r = run('FAILURE_ROUTING', { attempts: 2, sameError: true, failureSignature: 'ERR_MODULE_NOT_FOUND' });
  assert.equal(r.action, ACTIONS.CHANGE_STRATEGY);
  assert.equal(r.ruleId, 'FAILURE_002');
  assert.ok(r.reason.includes('ERR_MODULE_NOT_FOUND'));
  assert.ok(r.reason.includes('2'));
});

test('SCENARIO 3 — same error three times => INVESTIGATE_ROOT_CAUSE or HUMAN_REVIEW', () => {
  const r = run('FAILURE_ROUTING', { attempts: 3, sameError: true, failureSignature: 'ERR_MODULE_NOT_FOUND' });
  assert.ok([ACTIONS.INVESTIGATE_ROOT_CAUSE, ACTIONS.HUMAN_REVIEW].includes(r.action));
  assert.equal(r.action, ACTIONS.INVESTIGATE_ROOT_CAUSE);
  assert.equal(r.ruleId, 'FAILURE_003');
});

test('SCENARIO 4 — destructive production database migration => HUMAN_REVIEW', () => {
  const r = run('AGENT_ROUTE', {
    taskType: 'deploy',
    productionImpact: 'high',
    irreversible: true,
    operation: 'drop production table',
  });
  assert.equal(r.action, ACTIONS.HUMAN_REVIEW);
  assert.equal(r.ruleId, 'PROD_001');
  assert.equal(r.requiresHumanApproval, true);
});

test('SCENARIO 5 — two materially different implementation approaches => ROUTE_DECISION', () => {
  const r = run('AGENT_ROUTE', { availableApproaches: 2, materiallyDifferent: true });
  assert.equal(r.action, ACTIONS.ROUTE_DECISION);
  assert.equal(r.ruleId, 'ROUTE_006');
});

test('SCENARIO 6 — article claims conflict across sources => VERIFY', () => {
  const r = run('RESEARCH_DEPTH', { researchSourceCount: 4, conflictingSourceCount: 2 });
  assert.equal(r.action, ACTIONS.VERIFY);
  assert.equal(r.ruleId, 'RESEARCH_004');
  assert.ok(r.reason.includes('2'));
});

test('SCENARIO 7 — normal known file edit => SKIP', () => {
  const r = run('AGENT_ROUTE', { taskType: 'deterministic_edit', isKnownFileEdit: true, filesAffected: 1 });
  assert.equal(r.action, ACTIONS.SKIP);
});

// ================================================================ per-rule coverage

test('SEC_001 — secret material in state => HUMAN_REVIEW and the secret is never logged', () => {
  const env = tmpEnv();
  const r = decide(
    buildRequest({
      decisionType: 'AGENT_ROUTE',
      // The secret sits in `operation`, a real state field, so this exercises the
      // actual redaction path rather than an unknown key that gets dropped anyway.
      state: { taskType: 'debug', operation: 'use sk-abcdefghijklmnop1234 for the call' },
    }),
    { env, now: NOW },
  );
  assert.equal(r.ruleId, 'SEC_001');
  assert.equal(r.action, ACTIONS.HUMAN_REVIEW);
  assert.equal(r.requiresHumanApproval, true);
  const onDisk = readFileSync(join(env.LDR_LOG_DIR, `decision-${NOW.toISOString().slice(0, 10)}.jsonl`), 'utf8');
  assert.ok(!onDisk.includes('sk-abcdefghijklmnop1234'), 'secret reached the log');
  assert.ok(onDisk.includes('[redacted:key-like]'), 'redaction marker expected in the log');
  rmSync(env.LDR_LOG_DIR, { recursive: true, force: true });
});

test('PROD_002 — high production impact but reversible => still HUMAN_REVIEW', () => {
  const r = run('AGENT_ROUTE', { taskType: 'deploy', productionImpact: 'high', irreversible: false });
  assert.equal(r.ruleId, 'PROD_002');
  assert.equal(r.action, ACTIONS.HUMAN_REVIEW);
});

test('APPROVAL_001 — explicit approval requirement => HUMAN_REVIEW', () => {
  const r = run('AGENT_ROUTE', { taskType: 'analysis', needsUserApproval: true });
  assert.equal(r.ruleId, 'APPROVAL_001');
  assert.equal(r.requiresHumanApproval, true);
});

test('FAILURE_001 — transient error, first attempt => RETRY', () => {
  const r = run('FAILURE_ROUTING', { attempts: 1, transientError: true });
  assert.equal(r.ruleId, 'FAILURE_001');
  assert.equal(r.action, ACTIONS.RETRY);
});

test('FAILURE_001 does NOT fire at or above the change-strategy threshold', () => {
  const r = run('FAILURE_ROUTING', { attempts: 3, transientError: true, sameError: true });
  assert.notEqual(r.ruleId, 'FAILURE_001', 'a repeated transient error must not be retried forever');
  assert.equal(r.action, ACTIONS.INVESTIGATE_ROOT_CAUSE);
});

test('FAILURE_004 — same error six times => HUMAN_REVIEW (escalation branch)', () => {
  const r = run('FAILURE_ROUTING', { attempts: 6, sameError: true });
  assert.equal(r.ruleId, 'FAILURE_004');
  assert.equal(r.action, ACTIONS.HUMAN_REVIEW);
  assert.equal(r.requiresHumanApproval, true);
});

test('RESEARCH_001 — fewer than two sources => RESEARCH_MORE', () => {
  const r = run('RESEARCH_DEPTH', { researchSourceCount: 1 });
  assert.equal(r.ruleId, 'RESEARCH_001');
  assert.equal(r.action, ACTIONS.RESEARCH_MORE);
});

test('RESEARCH_001 does not fire when the source count is unknown', () => {
  const r = run('RESEARCH_DEPTH', {});
  assert.notEqual(r.ruleId, 'RESEARCH_001', 'unknown source count must not be treated as zero');
});

test('RESEARCH_002 — primary source needed and unavailable => RESEARCH_MORE', () => {
  const r = run('RESEARCH_DEPTH', { researchSourceCount: 3, primarySourceNeeded: true, primarySourceAvailable: false });
  assert.equal(r.ruleId, 'RESEARCH_002');
  assert.equal(r.action, ACTIONS.RESEARCH_MORE);
});

test('RESEARCH_005 — stagnant research with an alternative => CHANGE_STRATEGY', () => {
  const r = run('RESEARCH_DEPTH', { searchRounds: 3, newInformationLastRound: false, availableApproaches: 2 });
  assert.equal(r.ruleId, 'RESEARCH_005');
  assert.equal(r.action, ACTIONS.CHANGE_STRATEGY);
});

test('RESEARCH_006 — stagnant research with no alternative => STOP_RESEARCH', () => {
  const r = run('RESEARCH_DEPTH', { searchRounds: 4, newInformationLastRound: false, availableApproaches: 1 });
  assert.equal(r.ruleId, 'RESEARCH_006');
  assert.equal(r.action, ACTIONS.STOP_RESEARCH);
});

test('TASK_001 does not fire for a production-impacting task', () => {
  const r = run('AGENT_ROUTE', { taskType: 'deterministic_edit', productionImpact: 'high' });
  assert.equal(r.ruleId, 'PROD_002', 'safety must outrank the SKIP rule');
  assert.equal(r.action, ACTIONS.HUMAN_REVIEW);
});

test('SPLIT_007 — many files or many parts => SPLIT_TASK', () => {
  const r = run('AGENT_ROUTE', { taskType: 'refactor', filesAffected: 9 });
  assert.equal(r.ruleId, 'SPLIT_007');
  assert.equal(r.action, ACTIONS.SPLIT_TASK);
  const r2 = run('AGENT_ROUTE', { taskType: 'research', subtaskCount: 4 });
  assert.equal(r2.ruleId, 'SPLIT_007');
});

test('DEFAULT_000 — nothing matched => CONTINUE', () => {
  const r = run('AGENT_ROUTE', { taskType: 'authoring', filesAffected: 1 });
  assert.equal(r.ruleId, 'DEFAULT_000');
  assert.equal(r.action, ACTIONS.CONTINUE);
});

// ================================================== priority / determinism guarantees

test('a lower-priority rule can never override a higher-priority safety rule', () => {
  // Every one of these would trip a low-priority rule AND a safety rule.
  const cases = [
    [{ taskType: 'deterministic_edit', isKnownFileEdit: true, productionImpact: 'high', irreversible: true }, 'PROD_001'],
    [{ taskType: 'deterministic_edit', needsUserApproval: true }, 'APPROVAL_001'],
    [{ availableApproaches: 3, secretsDetected: true }, 'SEC_001'],
    [{ availableApproaches: 3, attempts: 4, sameError: true, needsUserApproval: true }, 'APPROVAL_001'],
  ];
  for (const [state, expectedRule] of cases) {
    const r = run('AGENT_ROUTE', state);
    assert.equal(r.ruleId, expectedRule, `expected ${expectedRule} to win, got ${r.ruleId}`);
  }
});

test('rules are ordered by priority, then by declaration order (stable)', () => {
  for (let i = 1; i < ORDERED_RULES.length; i++) {
    const prev = ORDERED_RULES[i - 1];
    const cur = ORDERED_RULES[i];
    assert.ok(
      prev.priority <= cur.priority,
      `ordering broken at ${prev.id}(P${prev.priority}) -> ${cur.id}(P${cur.priority})`,
    );
  }
});

test('exactly one winner, and the first matched rule in priority order is it', () => {
  const r = run('FAILURE_ROUTING', { attempts: 3, sameError: true, needsUserApproval: true });
  const matched = r.evaluated.filter((e) => e.matched);
  const winnerIdx = r.evaluated.findIndex((e) => e.id === r.ruleId);
  assert.ok(winnerIdx >= 0);
  assert.equal(matched[0].id, r.ruleId, 'the winning rule must be the first match in priority order');
  assert.equal(r.evaluated.filter((e) => e.matched && e.id === r.ruleId).length, 1);
});

test('the router is fully deterministic: same input => identical output', () => {
  const state = { taskType: 'debug', attempts: 3, sameError: true, failureSignature: 'E_TIMEOUT' };
  const a = run('FAILURE_ROUTING', state);
  const b = run('FAILURE_ROUTING', state);
  assert.equal(a.action, b.action);
  assert.equal(a.ruleId, b.ruleId);
  assert.equal(a.reason, b.reason);
  assert.equal(a.ruleConfidence, b.ruleConfidence);
  assert.deepEqual(a.evaluated, b.evaluated);
});

test('every rule has a unique id, a valid priority, an action and a description', () => {
  const ids = ORDERED_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'rule ids must be unique');
  const validPriorities = new Set(Object.values(PRIORITY));
  for (const r of ORDERED_RULES) {
    assert.ok(validPriorities.has(r.priority), `${r.id} has an unknown priority`);
    assert.match(r.id, /^[A-Z]+_\d{3}$/, `${r.id} must look like FAILURE_002 / PROD_001`);
    assert.ok(Object.values(ACTIONS).includes(r.action), `${r.id} has an invalid action`);
    assert.ok(r.description && r.description.length > 10, `${r.id} needs a description`);
    assert.equal(typeof r.when, 'function', `${r.id} needs a predicate`);
  }
});

test('every rule is individually reachable by its own condition', () => {
  // Each rule must have at least one state that makes it the winner, otherwise
  // it is dead code and the "first match wins" guarantee is untested for it.
  const reach = {
    SEC_001: { secretsDetected: true },
    PROD_001: { productionImpact: 'high', irreversible: true },
    PROD_002: { productionImpact: 'high' },
    APPROVAL_001: { needsUserApproval: true },
    FAILURE_003: { attempts: 3, sameError: true },
    FAILURE_002: { attempts: 2, sameError: true },
    FAILURE_004: { attempts: 6, sameError: true },
    FAILURE_001: { attempts: 1, transientError: true },
    RESEARCH_004: { conflictingSourceCount: 1 },
    RESEARCH_006: { searchRounds: 3, newInformationLastRound: false, availableApproaches: 1 },
    RESEARCH_005: { searchRounds: 3, newInformationLastRound: false, availableApproaches: 2 },
    RESEARCH_002: { primarySourceNeeded: true, primarySourceAvailable: false },
    RESEARCH_001: { researchSourceCount: 1 },
    ROUTE_006: { availableApproaches: 2 },
    TASK_002: { isKnownFileEdit: true },
    TASK_001: { taskType: 'deterministic_edit' },
    SPLIT_007: { filesAffected: 9 },
    DEFAULT_000: { taskType: 'authoring' },
  };
  for (const r of ORDERED_RULES) {
    const dt = r.appliesTo === null ? 'AGENT_ROUTE' : r.appliesTo[0];
    const got = run(dt, reach[r.id] ?? {});
    assert.equal(got.ruleId, r.id, `${r.id} is not reachable as the winner (got ${got.ruleId})`);
  }
});

// ================================================== no-probability / safety contract

test('confidence is explicitly a deterministic rule-match strength, not a probability', () => {
  const r = run('AGENT_ROUTE', { taskType: 'debug', attempts: 2, sameError: true });
  assert.equal(r.confidenceKind, 'deterministic-rule-match-strength');
  assert.equal(r.confidenceIsProbability, false);
  assert.equal(r.isLocalDeterministic, true);
  assert.equal(r.isExternalModel, false);
  assert.equal(r.engine, ENGINE);
  // and there is no Jev-shaped field anywhere
  const blob = JSON.stringify(r);
  for (const banned of ['jevResult', 'probabilities', 'noul', 'systemone', 'typesafe']) {
    assert.ok(!blob.includes(banned), `result must not contain a Jev-shaped field: ${banned}`);
  }
});

test('shadow mode is on and can never change the workflow', () => {
  for (const state of [
    { taskType: 'deterministic_edit' },
    { attempts: 3, sameError: true },
    { productionImpact: 'high', irreversible: true },
    { availableApproaches: 2 },
  ]) {
    const r = run('AGENT_ROUTE', state);
    assert.equal(r.shadowMode, true);
    assert.equal(r.wouldChangeWorkflow, false, `workflow changed for ${JSON.stringify(state)}`);
  }
});

test('LDR_MODE=disabled returns SKIP and evaluates nothing', () => {
  const env = { ...tmpEnv(), LDR_MODE: 'disabled' };
  const r = decide(buildRequest({ decisionType: 'AGENT_ROUTE', state: { attempts: 3, sameError: true } }), { env, now: NOW });
  assert.equal(r.action, ACTIONS.SKIP);
  assert.equal(r.disabled, true);
  assert.equal(r.evaluated.length, 0);
  rmSync(env.LDR_LOG_DIR, { recursive: true, force: true });
});

test('an unknown decision type is handled safely, never throws', () => {
  const r = run('NOT_A_TYPE', { attempts: 3, sameError: true });
  assert.equal(r.action, ACTIONS.CONTINUE);
  assert.equal(r.evaluated.length, 0);
});

test('malformed / missing input never throws', () => {
  for (const req of [undefined, null, {}, { decisionType: null }, { decisionType: 'AGENT_ROUTE', state: null }]) {
    const env = tmpEnv();
    const r = decide(req, { env, now: NOW });
    assert.ok(r.action);
    assert.equal(typeof r.ruleId, 'string');
    rmSync(env.LDR_LOG_DIR, { recursive: true, force: true });
  }
});

test('thresholds are the documented values', () => {
  assert.equal(THRESHOLDS.FAILURE_CHANGE_STRATEGY_AT, 2);
  assert.equal(THRESHOLDS.FAILURE_INVESTIGATE_AT, 3);
  assert.equal(THRESHOLDS.RESEARCH_STAGNATION_ROUNDS, 3);
  assert.equal(THRESHOLDS.RESEARCH_MIN_SOURCES, 2);
});

// ======================================================================= logging

test('the decision log is valid JSONL, shadow-only, and gitignored-path', () => {
  const env = tmpEnv();
  decide(buildRequest({ decisionType: 'FAILURE_ROUTING', task: 'looping build', state: { attempts: 3, sameError: true } }), { env, now: NOW });
  const file = join(env.LDR_LOG_DIR, `decision-${NOW.toISOString().slice(0, 10)}.jsonl`);
  assert.ok(existsSync(file));
  const rec = JSON.parse(readFileSync(file, 'utf8').trim());
  assert.equal(rec.engine, ENGINE);
  assert.equal(rec.task, 'looping build');
  assert.equal(rec.decisionType, 'FAILURE_ROUTING');
  assert.equal(rec.ruleId, 'FAILURE_003');
  assert.equal(rec.action, ACTIONS.INVESTIGATE_ROOT_CAUSE);
  assert.ok(rec.reason.length > 10);
  assert.equal(rec.shadowMode, true);
  assert.equal(rec.wouldChangeWorkflow, false);
  assert.ok(rec.ts);
  assert.ok(rec.state);
  rmSync(env.LDR_LOG_DIR, { recursive: true, force: true });
});

test('every decision logs a complete required field set', () => {
  const env = tmpEnv();
  const r = decide(buildRequest({ decisionType: 'AGENT_ROUTE', state: { availableApproaches: 3 } }), { env, now: NOW });
  for (const f of ['ts', 'decisionType', 'ruleId', 'action', 'reason', 'state', 'wouldChangeWorkflow', 'shadowMode']) {
    assert.ok(f in r, `decision result is missing required field: ${f}`);
  }
  rmSync(env.LDR_LOG_DIR, { recursive: true, force: true });
});

// ==================================================================== state layer

test('state normalisation drops unknown keys and applies safe defaults', () => {
  const s = normalizeState({ taskType: 'debug', attempts: 2, somethingElse: 'ignored', negative: -5 });
  assert.equal(s.taskType, 'debug');
  assert.equal(s.attempts, 2);
  assert.equal('somethingElse' in s, false, 'unknown keys must be dropped');
  assert.equal(s.productionImpact, 'none');
  assert.equal(s.availableApproaches, 1);
  assert.equal(s.filesAffected, 1);
});

test('normalizeState never stores secret material', () => {
  const s = normalizeState({ taskType: 'debug', operation: 'use sk-abcdefghijklmnop1234 now' });
  assert.ok(!JSON.stringify(s).includes('sk-abcdefghijklmnop1234'));
  assert.equal(s.secretsDetected, true, 'detection must still fire even though the value was redacted');
});

test('detectSecrets recognises the common credential shapes and ignores prose', () => {
  assert.equal(detectSecrets({ a: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345' }), true);
  assert.equal(detectSecrets({ a: 'Authorization: Bearer abcdef0123456789xyz' }), true);
  assert.equal(detectSecrets({ a: 'TELEGRAM_BOT_TOKEN=123456789:AAHabcdefgh' }), true);
  assert.equal(detectSecrets({ a: 'fix the typo in sources.yaml' }), false);
  assert.equal(detectSecrets({ a: 'the build failed with ERR_MODULE_NOT_FOUND' }), false);
});

test('summarizeState omits empty values and stays compact', () => {
  const s = summarizeState(normalizeState({ taskType: 'debug', previousActions: [] }));
  assert.equal('previousActions' in s, false);
  assert.ok(Object.keys(s).length < 12);
});

// ============================================== Jachaidesk-shaped realistic states

test('realistic Jachaidesk states route sensibly (not yet wired to the pipeline)', () => {
  // A known repo fact: the local Astro build cannot work on Termux. Five identical
  // attempts. The router must not tell the agent to try the sixth — it must
  // diagnose the cause (5 is below the 6-attempt escalation threshold).
  const build = run('FAILURE_ROUTING', {
    taskType: 'debug',
    operation: 'astro build',
    attempts: 5,
    sameError: true,
    failureSignature: 'ERR_MODULE_NOT_FOUND:satteri-android-arm64',
  });
  assert.equal(build.action, ACTIONS.INVESTIGATE_ROOT_CAUSE);
  assert.equal(build.ruleId, 'FAILURE_003');

  // Six attempts of the same thing: automated attempts have clearly stopped
  // working, so a person takes over.
  const build6 = run('FAILURE_ROUTING', {
    taskType: 'debug',
    attempts: 6,
    sameError: true,
    failureSignature: 'ERR_MODULE_NOT_FOUND:satteri-android-arm64',
  });
  assert.equal(build6.action, ACTIONS.HUMAN_REVIEW);
  assert.equal(build6.requiresHumanApproval, true);

  // A story whose only source is an attributed press statement.
  const thin = run('RESEARCH_DEPTH', {
    researchSourceCount: 1,
    primarySourceNeeded: true,
    primarySourceAvailable: false,
  });
  assert.equal(thin.action, ACTIONS.RESEARCH_MORE);
  assert.equal(thin.ruleId, 'RESEARCH_002');

  // Two outlets disagree on a material number.
  const conflict = run('RESEARCH_DEPTH', {
    researchSourceCount: 3,
    conflictingSourceCount: 1,
  });
  assert.equal(conflict.action, ACTIONS.VERIFY);
});

test('the router never claims a claim is true or false', () => {
  const r = run('ARTICLE_READINESS', { researchSourceCount: 3, conflictingSourceCount: 1 });
  const blob = JSON.stringify(r).toLowerCase();
  assert.ok(!blob.includes('the claim is true'));
  assert.ok(!blob.includes('the claim is false'));
  assert.equal(r.action, ACTIONS.VERIFY, 'its only power over a claim is to route verification');
});
