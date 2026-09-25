// lib/jev-router.mjs — Jachaidesk Jev decision router. SHADOW MODE ONLY.
//
// What this is: a bounded, advisory decision layer the OpenCode agent MAY consult
// before expensive or repetitive work. It returns a typed decision from the Jev
// model (TypeSafe AI System One) and records it to a redacted shadow log.
//
// What this is NOT:
//   - Not a gate. mode 'shadow' never changes the caller's behaviour.
//   - Not a fact-checker. Jev picks a verification PATH; sources decide FACTS.
//   - Not in the production path. Nothing in run.js, the workflows, or the site
//     imports this module. It is opt-in, local, developer-invoked only.
//
// Design notes:
//   - Zero new dependencies. Uses Node's built-in fetch, mirroring lib/llm.mjs,
//     so pipeline/package.json + package-lock.json stay untouched (no change to
//     the GitHub Actions dependency graph).
//   - The official @typesafe-ai/sdk would add a dependency and its own retry
//     policy; the documented HTTP endpoint needs none of that here. See
//     docs/JEV-INTEGRATION.md.
//   - One request per decision: Jev evaluates all questions in parallel against
//     the same state, so extra questions barely change latency or cost.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appendShadowLog } from './shadow-log.mjs';

export const CATALOG_PATH = resolve(import.meta.dirname, '../config/jev-decisions.json');

export function loadCatalog(path = CATALOG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Key resolution. Prefers TYPESAFE_API_KEY, then TYPESAFE_API_KEY_FILE so the raw
 * token never has to land in shell history (same pattern as lib/llm.mjs).
 * Returns null when unconfigured — which is the normal state today.
 */
export async function resolveApiKey(env = process.env) {
  if (env.TYPESAFE_API_KEY) return env.TYPESAFE_API_KEY;
  if (env.TYPESAFE_API_KEY_FILE) {
    try {
      const v = readFileSync(env.TYPESAFE_API_KEY_FILE, 'utf8').trim();
      return v || null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Never echo the key. Only its shape, so config problems are diagnosable. */
export function keyFingerprint(env = process.env) {
  const raw = env.TYPESAFE_API_KEY || '';
  if (raw) return `env:TYPESAFE_API_KEY(len=${raw.length})`;
  if (env.TYPESAFE_API_KEY_FILE) return `file:${resolve(env.TYPESAFE_API_KEY_FILE)}`;
  return 'absent';
}

export function isConfigured(env = process.env) {
  return Boolean(env.TYPESAFE_API_KEY || env.TYPESAFE_API_KEY_FILE);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reduce a whole state object to a compact, non-sensitive summary for the log. */
export function compactState(state) {
  if (state == null) return { kind: 'none' };
  if (typeof state === 'string') {
    return { kind: 'text', chars: state.length, excerpt: state.slice(0, 280) };
  }
  if (Array.isArray(state)) return { kind: 'array', length: state.length };
  const keys = Object.keys(state);
  const out = { kind: 'object', keys: keys.slice(0, 20) };
  for (const k of ['task', 'goal', 'error', 'attempt', 'attempts', 'tried', 'stage', 'decisionType']) {
    if (state[k] != null) out[k] = typeof state[k] === 'string' ? state[k].slice(0, 200) : state[k];
  }
  return out;
}

function buildRequestBody(decision, state, catalog) {
  return {
    state,
    model: catalog.api?.model || 'jev-latest',
    questions: decision.questions,
  };
}

/** Map raw Jev answers onto a single selected route + confidence. */
export function interpret(decision, answers, catalog) {
  const selected = decision.selected;
  const answer = answers?.[selected] || null;
  const lowAt = catalog.routing?.lowConfidenceAt ?? 0.5;
  const route = answer?.choice ?? answer?.score ?? answer?.noul ?? null;
  const confidence = typeof answer?.confidence === 'number' ? answer.confidence : null;
  const distribution = answer?.probabilities ?? null;

  let reportRoute = route;
  let escalate = false;
  // Per the TypeSafe API reference, BOTH choice and score answers carry a
  // `confidence`; noul does not (confidence stays null for noul). So escalate on
  // any low-confidence answer that actually has one — not only on choice.
  if (confidence !== null && confidence < lowAt) {
    escalate = true;
  }

  const flags = {};
  for (const [id, a] of Object.entries(answers || {})) {
    if (id === selected) continue;
    flags[id] = a?.type === 'noul' ? a.noul : a?.type === 'score' ? a.score : a?.choice;
    if (a?.type === 'noul' && typeof a.noul === 'number' && a.noul >= 0.7) escalate = true;
  }

  return { route: reportRoute, confidence, distribution, lowConfidenceAt: lowAt, escalate, flags };
}

// ---------------------------------------------------------------------------
// Deterministic guidance: a static lookup, never generated prose. This is what
// lets the OpenCode agent act on a typed decision without an LLM writing a
// paragraph about it.
// ---------------------------------------------------------------------------
export function guidanceFor(decisionType, route, catalog = loadCatalog()) {
  return catalog.guidance?.[decisionType]?.[route] ?? null;
}

/**
 * The machine-readable contract the agent consumes. Deliberately small and flat:
 * a route enum, a confidence, an escalate boolean and a fixed instruction string.
 * No prose generation, no LLM call.
 */
export function agentContract(result, catalog) {
  return {
    decision: result.route ?? null,
    confidence: result.confidence ?? null,
    escalate: result.escalate === true,
    nextStep: result.nextStep ?? null,
    // Authority flags. In shadow mode a decision has authority 'advisory-only'.
    authority: result.simulated ? 'NONE-SIMULATION' : 'advisory-only',
    advisoryOnly: result.affectedWorkflow !== true,
    source: result.simulated ? 'SIMULATION-NOT-JEV' : result.ok ? 'jev-api' : 'unavailable',
  };
}

// ---------------------------------------------------------------------------
// OFFLINE SIMULATION — NOT JEV.
//
// Purpose: prove the request -> parse -> interpret -> log -> agent plumbing is
// structurally sound with no API key. It is a deterministic local keyword
// heuristic, selected by rules in config/jev-decisions.json under "simulation".
//
// It deliberately produces NO confidence, NO probabilities, NO token usage and NO
// latency claim, because none of those can exist without the real model. It never
// contacts the network. It can only be reached via JEV_MODE=simulate.
// ---------------------------------------------------------------------------
export const SIMULATION_AUTHORITY = 'NONE-SIMULATION';

function stateToText(state) {
  if (state == null) return '';
  if (typeof state === 'string') return state;
  if (Array.isArray(state)) return state.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
  return Object.entries(state)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
}

/**
 * Deterministic option pick: the option whose keyword list scores highest on
 * substring matches. Ties break on the catalog's own option order. No randomness,
 * no model, no network.
 */
export function simulateChoice(decisionType, state, catalog) {
  const options = Object.keys(catalog.decisions[decisionType].questions[catalog.decisions[decisionType].selected].criteria);
  const rules = catalog.simulation?.rules?.[decisionType] || {};
  const text = stateToText(state).toLowerCase();

  const scores = options.map((opt) => {
    const kws = rules[opt] || [];
    let hits = 0;
    for (const kw of kws) if (text.includes(kw.toLowerCase())) hits++;
    return { opt, hits };
  });

  const best = scores.reduce((a, b) => (b.hits > a.hits ? b : a), scores[0]);
  return {
    option: best.opt,
    matched: best.hits > 0,
    // Exactly which rule keywords fired — auditable, no hidden magic.
    matchedKeywords: (rules[best.opt] || []).filter((kw) => text.includes(kw.toLowerCase())),
    // When nothing matched we say so and fall back to the FIRST declared option
    // rather than inventing a plausible-looking answer.
    fallback: best.hits === 0,
    allScores: scores,
  };
}

/** Build a response-shaped object for the simulation. Simulated fields are null. */
export function simulateAnswers(decisionType, state, catalog) {
  const decision = catalog.decisions[decisionType];
  const pick = simulateChoice(decisionType, state, catalog);
  const answers = {};
  for (const [id, q] of Object.entries(decision.questions)) {
    if (id !== decision.selected) {
      // Not simulated. Explicitly null rather than a made-up number.
      answers[id] = null;
      continue;
    }
    answers[id] = {
      type: 'choice',
      choice: pick.option,
      // NULL, not a number: a simulated confidence would be a fabricated number.
      confidence: null,
      probabilities: null,
    };
  }
  return { answers, pick };
}

async function postJson(url, body, key, timeoutMs, fetchImpl = fetch) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`,
      'user-agent': 'jachaidesk-jev-router/1.0 (shadow)',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Jev ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const RETRYABLE = new Set([429, 529]);

/**
 * The only entry point the agent uses.
 *
 * opts: { taskId, state, catalog, env, now, fetchImpl, bypass }
 * Always resolves. Never throws. In shadow mode the returned decision is purely
 * informational — the caller keeps its own plan either way.
 */
export async function jevDecide(decisionType, opts = {}) {
  const {
    taskId = 'unknown',
    state = '',
    env = process.env,
    now = new Date(),
    fetchImpl = fetch,
    bypass = false,
    catalog: catalogOpt,
  } = opts;

  const catalog = catalogOpt || loadCatalog();
  const mode = (env.JEV_MODE || catalog.mode || 'shadow').toLowerCase();
  const api = { ...catalog.api, ...(env.JEV_ENDPOINT ? { endpoint: env.JEV_ENDPOINT } : {}) };

  const base = {
    ts: now.toISOString(),
    taskId,
    decisionType,
    mode,
    key: keyFingerprint(env),
    state: compactState(state),
  };

  const finish = (result, logExtra = {}) => {
    const record = { ...base, ...result, ...logExtra };
    const logFile = appendShadowLog(record, { env, now });
    return { ...record, logFile };
  };

  // --- 1. decision type must exist in the catalog
  const decision = catalog.decisions?.[decisionType];
  if (!decision) {
    return finish(
      { ok: false, skipped: 'unknown_decision_type', available: Object.keys(catalog.decisions || {}) },
      { jevResult: null, affectedWorkflow: false, reason: 'unknown_decision_type' },
    );
  }

  // --- 2. explicit bypass
  if (bypass) {
    return finish(
      { ok: false, skipped: 'bypassed', jevResult: null, affectedWorkflow: false },
      { reason: 'bypassed_by_caller' },
    );
  }

  // --- 3. mode disabled -> no HTTP attempt at all
  if (mode === 'disabled' || mode === 'off') {
    return finish(
      { ok: false, skipped: 'disabled', jevResult: null, affectedWorkflow: false },
      { reason: 'mode_disabled' },
    );
  }

  // --- 4. allowed modes. 'simulate' is the ONLY non-gating mode besides shadow,
  //        and it never touches the network.
  if (mode === 'simulate') {
    const { answers, pick } = simulateAnswers(decisionType, state, catalog);
    const interp = interpret(decision, answers, catalog);
    const nextStep = guidanceFor(decisionType, interp.route, catalog);
    const result = finish(
      {
        ok: true,
        simulated: true,
        isRealJev: false,
        authority: SIMULATION_AUTHORITY,
        jevResult: {
          // Deliberately NOT a jev-* string. A simulated model name would be a lie.
          model: null,
          modelSimulatedAs: 'not-a-model',
          answers,
          // No fabricated accounting.
          usage: null,
          attempts: 0,
          network: 'never-contacted',
        },
        simulation: {
          method: 'deterministic-local-keyword-heuristic',
          matchedKeywords: pick.matchedKeywords,
          fallbackToFirstOption: pick.fallback,
          allScores: pick.allScores,
          note: 'SIMULATED - NOT THE JEV/TYPESAFE MODEL. Proves plumbing only.',
        },
        confidence: null,
        confidenceSource: 'not-available-offline',
        ...interp,
        nextStep,
      },
      {
        affectedWorkflow: false,
        wouldHaveChangedWorkflow: null,
        note: 'SIMULATION - NOT JEV. Deterministic local heuristic; no real model was consulted.',
      },
    );
    return { ...result, agent: agentContract(result, catalog) };
  }

  // --- 5. shadow mode is the only remaining allowed mode
  if (mode !== 'shadow') {
    return finish(
      { ok: false, skipped: 'refused_mode', jevResult: null, affectedWorkflow: false },
      { reason: `unsupported_mode:${mode}` },
    );
  }

  // --- 6. no key -> report honestly, never pretend
  const key = await resolveApiKey(env);
  if (!key) {
    return finish(
      { ok: false, skipped: 'not_configured', jevResult: null, affectedWorkflow: false },
      { reason: 'no_api_key_configured' },
    );
  }

  // --- 7. real call
  const body = buildRequestBody(decision, state, { ...catalog, api });
  let lastErr = null;
  for (let attempt = 0; attempt <= (api.maxRetries ?? 0); attempt++) {
    try {
      const json = await postJson(api.endpoint, body, key, api.timeoutMs ?? 20000, fetchImpl);
      const interp = interpret(decision, json.answers, catalog);
      const nextStep = guidanceFor(decisionType, interp.route, catalog);
      const result = finish(
        {
          ok: true,
          simulated: false,
          isRealJev: true,
          authority: 'advisory-only',
          jevResult: {
            model: json.model,
            answers: json.answers,
            usage: json.usage,
            attempts: attempt + 1,
            network: 'contacted',
          },
          confidenceSource: 'jev-confidence',
          ...interp,
          nextStep,
        },
        {
          // Shadow mode: this is an OBSERVATION, never an instruction.
          affectedWorkflow: false,
          wouldHaveChangedWorkflow: null,
          note: 'shadow-mode: decision recorded only; caller workflow unchanged',
        },
      );
      return { ...result, agent: agentContract(result, catalog) };
    } catch (e) {
      lastErr = e;
      const retryable = RETRYABLE.has(e?.status) || e?.name === 'TimeoutError' || e?.name === 'TypeError';
      if (!retryable || attempt === (api.maxRetries ?? 0)) break;
      await sleep((api.retryBaseDelayMs ?? 400) * 2 ** attempt);
    }
  }

  const failed = finish(
    {
      ok: false,
      skipped: 'request_failed',
      jevResult: null,
      affectedWorkflow: false,
      error: { message: String(lastErr?.message || lastErr).slice(0, 200), status: lastErr?.status ?? null },
    },
    { reason: 'request_failed' },
  );
  return { ...failed, agent: agentContract(failed, catalog) };
}

export function listDecisions(catalog = loadCatalog()) {
  return Object.entries(catalog.decisions).map(([name, d]) => ({
    name,
    purpose: d.purpose,
    selected: d.selected,
    options: Object.keys(d.questions[d.selected]?.criteria || {}),
    questionIds: Object.keys(d.questions),
  }));
}
