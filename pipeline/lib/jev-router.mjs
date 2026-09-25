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
  if (confidence !== null && confidence < lowAt && answer?.type === 'choice') {
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

  // --- 4. shadow mode is the only non-gating mode we allow
  if (mode !== 'shadow') {
    return finish(
      { ok: false, skipped: 'refused_mode', jevResult: null, affectedWorkflow: false },
      { reason: `unsupported_mode:${mode}` },
    );
  }

  // --- 5. no key -> report honestly, never pretend
  const key = await resolveApiKey(env);
  if (!key) {
    return finish(
      { ok: false, skipped: 'not_configured', jevResult: null, affectedWorkflow: false },
      { reason: 'no_api_key_configured' },
    );
  }

  // --- 6. real call
  const body = buildRequestBody(decision, state, { ...catalog, api });
  let lastErr = null;
  for (let attempt = 0; attempt <= (api.maxRetries ?? 0); attempt++) {
    try {
      const json = await postJson(api.endpoint, body, key, api.timeoutMs ?? 20000, fetchImpl);
      const interp = interpret(decision, json.answers, catalog);
      return finish(
        {
          ok: true,
          jevResult: {
            model: json.model,
            answers: json.answers,
            usage: json.usage,
            attempts: attempt + 1,
          },
          ...interp,
        },
        {
          // Shadow mode: this is an OBSERVATION, never an instruction.
          affectedWorkflow: false,
          wouldHaveChangedWorkflow: null,
          note: 'shadow-mode: decision recorded only; caller workflow unchanged',
        },
      );
    } catch (e) {
      lastErr = e;
      const retryable = RETRYABLE.has(e?.status) || e?.name === 'TimeoutError' || e?.name === 'TypeError';
      if (!retryable || attempt === (api.maxRetries ?? 0)) break;
      await sleep((api.retryBaseDelayMs ?? 400) * 2 ** attempt);
    }
  }

  return finish(
    {
      ok: false,
      skipped: 'request_failed',
      jevResult: null,
      affectedWorkflow: false,
      error: { message: String(lastErr?.message || lastErr).slice(0, 200), status: lastErr?.status ?? null },
    },
    { reason: 'request_failed' },
  );
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
