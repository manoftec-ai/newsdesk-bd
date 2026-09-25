// test/jev-router.test.mjs — offline tests for the Jev shadow router.
// No network access: every call uses an injected fetchImpl, and the
// "no key configured" path must never reach fetch at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jevDecide, loadCatalog, listDecisions, interpret, compactState, isConfigured } from '../lib/jev-router.mjs';
import { redact, readShadowLog } from '../lib/shadow-log.mjs';

const CATALOG = loadCatalog();
const tmpEnv = () => ({ JEV_SHADOW_LOG_DIR: mkdtempSync(join(tmpdir(), 'jev-shadow-')) });
const NOW = new Date('2026-09-25T12:00:00.000Z');

function okResponse(overrides = {}) {
  return {
    model: 'jev-1.13.0',
    usage: { input_tokens: 300, output_tokens: 20 },
    answers: {
      route: {
        type: 'choice',
        choice: 'change_approach',
        confidence: 0.83,
        probabilities: { proceed_directly: 0.05, change_approach: 0.83, gather_more_evidence: 0.12 },
      },
      would_help: { type: 'noul', noul: 0.9 },
      repetition_risk: { type: 'score', score: 2.0, confidence: 0.7 },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------- catalog shape

test('catalog declares shadow mode and never a gating mode', () => {
  assert.equal(CATALOG.mode, 'shadow');
  assert.ok(!['active', 'gate', 'enforce'].includes(CATALOG.mode));
});

test('every decision has a purpose, a selected choice question, and valid criteria', () => {
  for (const d of listDecisions(CATALOG)) {
    assert.ok(d.purpose && d.purpose.length > 10, `${d.name} needs a purpose`);
    assert.ok(d.options.length >= 2, `${d.name} needs >=2 options`);
    const q = CATALOG.decisions[d.name].questions[d.selected];
    assert.equal(q.type, 'choice');
    for (const [k, v] of Object.entries(q.criteria)) {
      assert.equal(k, k.toLowerCase(), `${d.name} option key must be lowercase: ${k}`);
      assert.ok(typeof v === 'string' && v.length > 5, `${d.name}/${k} needs a real description`);
    }
  }
});

test('phase-8 newsroom candidates are marked not-wired', () => {
  assert.equal(CATALOG.futureOnly.wired, false);
  assert.ok(CATALOG.futureOnly.candidates.length >= 5);
});

test('Jev is never framed as a fact authority in the catalog', () => {
  const blob = JSON.stringify(CATALOG).toLowerCase();
  assert.ok(blob.includes('advisory') || blob.includes('cannot decide truth') || blob.includes('never decides truth'));
});

// ------------------------------------------------------------------ redaction

test('redact strips key-like secrets from strings', () => {
  const out = redact('key=ts-abcdefghijklmnop1234 and ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
  assert.ok(!out.includes('ts-abcdefghijklmnop1234'), 'key-like token leaked');
  assert.ok(!out.includes('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345'), 'github token leaked');
  assert.ok(out.includes('[redacted'));
});

test('redact strips secret-shaped values but keeps the field name', () => {
  const out = redact({ apiKey: 'supersecretvalue123', token: 'abcdefghijkl', model: 'jev-latest' });
  assert.equal(out.model, 'jev-latest');
  assert.ok(!JSON.stringify(out).includes('supersecretvalue123'));
  assert.ok(!JSON.stringify(out).includes('abcdefghijkl'));
});

test('redact handles bearer headers and env assignment style', () => {
  assert.ok(!redact('Authorization: Bearer abcdef0123456789xyz').includes('abcdef0123456789xyz'));
  assert.ok(!redact('TYPESAFE_API_KEY=abcdef0123456789xyz').includes('abcdef0123456789xyz'));
});

test('redact truncates very long strings', () => {
  const out = redact('x'.repeat(9000));
  assert.ok(out.length < 9000);
  assert.ok(out.includes('truncated'));
});

test('compactState keeps a small non-sensitive summary', () => {
  const c = compactState({ task: 'fix publish bug', stage: 'finalize', other: 'ignored' });
  assert.equal(c.kind, 'object');
  assert.equal(c.task, 'fix publish bug');
  assert.equal(c.stage, 'finalize');
  assert.ok(!('other' in c), 'unlisted fields must not be copied into the log');
});

test('compactState summarises text without dumping it all', () => {
  const c = compactState('y'.repeat(5000));
  assert.equal(c.kind, 'text');
  assert.equal(c.chars, 5000);
  assert.ok(c.excerpt.length <= 280);
});

// ------------------------------------------------- no-key / no-network safety

test('no key configured -> no HTTP call is attempted', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: '' };
  let called = false;
  const r = await jevDecide('AGENT_ROUTE', {
    taskId: 'no-key',
    state: { task: 'x' },
    env,
    now: NOW,
    fetchImpl: async () => {
      called = true;
      throw new Error('must not be called');
    },
  });
  assert.equal(called, false, 'router must not hit the network without a key');
  assert.equal(r.ok, false);
  assert.equal(r.skipped, 'not_configured');
  assert.equal(r.affectedWorkflow, false);
});

test('isConfigured reflects env', () => {
  assert.equal(isConfigured({}), false);
  assert.equal(isConfigured({ TYPESAFE_API_KEY: 'x' }), true);
  assert.equal(isConfigured({ TYPESAFE_API_KEY_FILE: '/x' }), true);
});

test('bypass skips the call even with a key present', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: 'ts-test-key-value' };
  let called = false;
  const r = await jevDecide('AGENT_ROUTE', {
    taskId: 'bypass',
    state: 'x',
    env,
    now: NOW,
    bypass: true,
    fetchImpl: async () => {
      called = true;
      return okResponse();
    },
  });
  assert.equal(called, false);
  assert.equal(r.skipped, 'bypassed');
  assert.equal(r.affectedWorkflow, false);
});

test('mode=disabled skips the call', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: 'ts-test-key-value', JEV_MODE: 'disabled' };
  let called = false;
  const r = await jevDecide('AGENT_ROUTE', {
    taskId: 'off',
    state: 'x',
    env,
    now: NOW,
    fetchImpl: async () => {
      called = true;
      return okResponse();
    },
  });
  assert.equal(called, false);
  assert.equal(r.skipped, 'disabled');
});

test('an unsupported gating mode is refused, never silently honoured', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: 'ts-test-key-value', JEV_MODE: 'active' };
  const r = await jevDecide('AGENT_ROUTE', { taskId: 'gate', state: 'x', env, now: NOW, fetchImpl: async () => okResponse() });
  assert.equal(r.ok, false);
  assert.equal(r.skipped, 'refused_mode');
});

test('unknown decision type is reported, not guessed', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: 'ts-test-key-value' };
  const r = await jevDecide('NOPE', { taskId: 'x', state: 'x', env, now: NOW, fetchImpl: async () => okResponse() });
  assert.equal(r.ok, false);
  assert.equal(r.skipped, 'unknown_decision_type');
  assert.ok(r.available.includes('AGENT_ROUTE'));
});

// ------------------------------------------------------------ happy path (mock)

test('a successful decision reports route, confidence and never claims it changed the workflow', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: 'ts-test-key-value' };
  let seen;
  const r = await jevDecide('AGENT_ROUTE', {
    taskId: 't-complex',
    state: { task: 'choose between two publish paths' },
    env,
    now: NOW,
    fetchImpl: async (url, init) => {
      seen = { url, init };
      return { ok: true, json: async () => okResponse() };
    },
  });
  assert.equal(r.ok, true);
  assert.equal(r.route, 'change_approach');
  assert.equal(r.confidence, 0.83);
  assert.equal(r.affectedWorkflow, false, 'shadow mode must report workflow unchanged');
  assert.equal(r.wouldHaveChangedWorkflow, null);
  assert.equal(r.jevResult.model, 'jev-1.13.0');
  // official endpoint + endpoint shape
  assert.equal(seen.url, 'https://api.typesafe.ai/v1/systemone');
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, 'jev-latest');
  assert.deepEqual(Object.keys(body.questions), ['route', 'would_help', 'repetition_risk']);
  // all questions ride in ONE request
  assert.equal(seen.init.method, 'POST');
});

test('low confidence escalates in the report only', async () => {
  const d = CATALOG.decisions.ARTICLE_MODE;
  const answers = {
    mode: { type: 'choice', choice: 'human_review', confidence: 0.21, probabilities: { human_review: 0.21 } },
    editorial_risk: { type: 'score', score: 2.5, confidence: 0.5 },
  };
  const out = interpret(d, answers, CATALOG);
  assert.equal(out.route, 'human_review');
  assert.equal(out.escalate, true, 'confidence < 0.5 must flag escalation');
  assert.equal(out.lowConfidenceAt, 0.5);
});

test('a high noul companion flag also escalates', () => {
  const d = CATALOG.decisions.AGENT_ROUTE;
  const answers = {
    route: { type: 'choice', choice: 'proceed_directly', confidence: 0.95, probabilities: { proceed_directly: 0.95 } },
    would_help: { type: 'noul', noul: 0.93 },
    repetition_risk: { type: 'score', score: 0, confidence: 0.9 },
  };
  assert.equal(interpret(d, answers, CATALOG).escalate, true);
});

test('a 429 is retried with backoff, then succeeds', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: 'ts-test-key-value' };
  let n = 0;
  const r = await jevDecide('AGENT_ROUTE', {
    taskId: 'retry',
    state: 'x',
    env,
    now: NOW,
    catalog: { ...CATALOG, api: { ...CATALOG.api, maxRetries: 2, retryBaseDelayMs: 1 } },
    fetchImpl: async () => {
      n++;
      if (n === 1) {
        const e = new Error('Jev 429');
        e.status = 429;
        throw e;
      }
      return { ok: true, json: async () => okResponse() };
    },
  });
  assert.equal(n, 2);
  assert.equal(r.ok, true);
  assert.equal(r.jevResult.attempts, 2);
});

test('a 401 is NOT retried (bad key) and is reported honestly', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: 'ts-bad-key' };
  let n = 0;
  const r = await jevDecide('AGENT_ROUTE', {
    taskId: '401',
    state: 'x',
    env,
    now: NOW,
    fetchImpl: async () => {
      n++;
      const e = new Error('Jev 401: unauthorized');
      e.status = 401;
      throw e;
    },
  });
  assert.equal(n, 1, '401 must not be retried');
  assert.equal(r.ok, false);
  assert.equal(r.skipped, 'request_failed');
  assert.equal(r.error.status, 401);
  assert.equal(r.affectedWorkflow, false);
});

test('a timeout never blocks the caller and never changes the workflow', async () => {
  const env = { ...tmpEnv(), TYPESAFE_API_KEY: 'ts-test-key-value' };
  const r = await jevDecide('AGENT_ROUTE', {
    taskId: 'timeout',
    state: 'x',
    env,
    now: NOW,
    catalog: { ...CATALOG, api: { ...CATALOG.api, maxRetries: 0 } },
    fetchImpl: async () => {
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.affectedWorkflow, false);
});

// ------------------------------------------------------------------ shadow log

test('shadow log is valid JSONL, redacted, and readable back', async () => {
  const dir = tmpEnv();
  const env = { ...dir, TYPESAFE_API_KEY: 'ts-test-key-value' };
  await jevDecide('AGENT_ROUTE', {
    taskId: 'log-1',
    state: { task: 'decide route', secret: 'TYPESAFE_API_KEY=abcdef0123456789xyz' },
    env,
    now: NOW,
    fetchImpl: async () => ({ ok: true, json: async () => okResponse() }),
  });

  const file = join(dir.JEV_SHADOW_LOG_DIR, `jev-shadow-${NOW.toISOString().slice(0, 10)}.jsonl`);
  assert.ok(existsSync(file), 'shadow log file must exist');
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);

  const rec = JSON.parse(lines[0]);
  assert.equal(rec.taskId, 'log-1');
  assert.equal(rec.decisionType, 'AGENT_ROUTE');
  assert.equal(rec.mode, 'shadow');
  assert.equal(rec.route, 'change_approach');
  assert.equal(rec.confidence, 0.83);
  assert.equal(rec.affectedWorkflow, false);
  assert.equal(rec.ok, true);
  assert.ok(rec.ts);
  assert.ok(!readFileSync(file, 'utf8').includes('abcdef0123456789xyz'), 'secret reached disk');
  // the key itself must never be recorded, only its shape
  assert.ok(!readFileSync(file, 'utf8').includes('ts-test-key-value'));

  const back = readShadowLog(NOW, { env });
  assert.equal(back.length, 1);
  rmSync(dir.JEV_SHADOW_LOG_DIR, { recursive: true, force: true });
});

test('shadow log records a no-key run as NOT AVAILABLE, not as a decision', async () => {
  const dir = tmpEnv();
  const env = { ...dir };
  const r = await jevDecide('AGENT_ROUTE', { taskId: 'nokey-log', state: 'x', env, now: NOW, fetchImpl: async () => okResponse() });
  assert.equal(r.ok, false);
  const rec = readShadowLog(NOW, { env })[0];
  assert.equal(rec.skipped, 'not_configured');
  assert.equal(rec.jevResult, null);
  assert.equal(rec.route, undefined);
  rmSync(dir.JEV_SHADOW_LOG_DIR, { recursive: true, force: true });
});
