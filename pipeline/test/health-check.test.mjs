import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkHealth,
  formatReport,
  HEALTH_FAILURE_CODES,
  MIN_ARTICLES,
} from '../tools/health_check.mjs';

const HOUR = 36e5;

function fixture({ articles = 12, pick = { pending: 0, picked: [] }, lastCommit = '2026-10-02T12:00:00Z' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'health-'));
  const newsDir = join(dir, 'news');
  mkdirSync(newsDir);
  for (let i = 0; i < articles; i += 1) writeFileSync(join(newsDir, `a-${i}.md`), '---\n---\n');
  const pickPath = join(dir, 'pick.json');
  writeFileSync(pickPath, JSON.stringify(pick));
  return {
    newsDir,
    pickPath,
    gitLog: () => {
      if (!lastCommit) throw new Error('no history');
      return lastCommit;
    },
  };
}

test('a healthy pipeline passes', () => {
  const f = fixture();
  const report = checkHealth({ ...f, now: Date.parse('2026-10-02T18:00:00Z') });
  assert.equal(report.ok, true, formatReport(report));
  assert.equal(report.articleCount, 12);
  assert.equal(report.hoursSinceLastArticle, 6);
  assert.deepEqual(report.failures, []);
});

test('a stalled pipeline fails, which the old mtime check could never do', () => {
  // actions/checkout gives every file the checkout time, so an mtime-based check
  // always saw "0 hours ago" and never fired, however long publishing had been
  // dead. Recency comes from git history instead.
  const f = fixture();
  const report = checkHealth({ ...f, now: Date.parse('2026-10-02T12:00:00Z') + 72 * HOUR });
  assert.equal(report.ok, false);
  const stalled = report.failures.find((x) => x.code === 'PUBLISHING_STALLED');
  assert.ok(stalled, 'a 72h silence must be reported as stalled');
  assert.match(stalled.detail, /72h ago/);
  assert.equal(report.hoursSinceLastArticle, 72);
});

test('exactly at the limit still passes, one minute past it fails', () => {
  const f = fixture();
  const at = Date.parse('2026-10-02T12:00:00Z');
  assert.equal(checkHealth({ ...f, now: at + 36 * HOUR }).ok, true, '36h exactly is within the limit');
  const over = checkHealth({ ...f, now: at + 36 * HOUR + 60 * 1000 });
  assert.equal(over.ok, false, '36h01m must fail');
  assert.equal(over.failures[0].code, 'PUBLISHING_STALLED');
});

test('the stall threshold is configurable', () => {
  const f = fixture();
  const now = Date.parse('2026-10-02T12:00:00Z') + 48 * HOUR;
  assert.equal(checkHealth({ ...f, now, stallHours: 36 }).ok, false);
  assert.equal(checkHealth({ ...f, now, stallHours: 72 }).ok, true);
});

test('too few articles fails', () => {
  const f = fixture({ articles: MIN_ARTICLES - 1 });
  const report = checkHealth({ ...f });
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((x) => x.code === 'TOO_FEW_ARTICLES'));
});

test('unknown recency fails loudly instead of reporting a false all-clear', () => {
  // The dangerous failure mode for a monitor is silence, not noise: if we cannot
  // tell whether publishing is stalled we must say so rather than pass.
  const f = fixture({ lastCommit: null });
  const report = checkHealth({ ...f });
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((x) => x.code === 'RECENCY_UNKNOWN'));
});

test('an unparseable commit date is not treated as recent', () => {
  const f = fixture({ lastCommit: 'not-a-date' });
  const report = checkHealth({ ...f });
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((x) => x.code === 'RECENCY_UNKNOWN'));
});

test('unreadable pick state is reported rather than crashing the monitor', () => {
  const f = fixture();
  const report = checkHealth({ ...f, pickPath: join(f.newsDir, 'nope.json') });
  assert.equal(report.ok, false);
  assert.ok(report.failures.some((x) => x.code === 'PICK_STATE_UNREADABLE'));
});

test('pending 0 on its own is not a failure — a drained queue is normal', () => {
  // The old issue body claimed "pick pending 0" was a stall signal, but right
  // after a publishing run the queue is legitimately empty.
  const f = fixture({ pick: { pending: 0, picked: [] } });
  const report = checkHealth({ ...f });
  assert.equal(report.ok, true, formatReport(report));
  assert.equal(report.pickPending, 0);
});

test('pick counts are read from both array and scalar shapes', () => {
  const f = fixture({ pick: { pending: 4, picked: ['a', 'b'] } });
  const report = checkHealth({ ...f });
  assert.equal(report.pickPending, 4);
  assert.equal(report.pickPicked, 2);
});

test('the report says what failed, not just that something did', () => {
  const f = fixture({ articles: 0, lastCommit: null });
  const text = formatReport(checkHealth({ ...f }));
  assert.match(text, /FAIL TOO_FEW_ARTICLES/);
  assert.match(text, /FAIL RECENCY_UNKNOWN/);
  assert.doesNotMatch(text, /health OK/);
});

test('every emitted code is declared', () => {
  const f = fixture({ articles: 0, lastCommit: null });
  const report = checkHealth({ ...f, pickPath: join(f.newsDir, 'nope.json') });
  assert.ok(report.failures.length > 0);
  for (const f2 of report.failures) {
    assert.ok(HEALTH_FAILURE_CODES.includes(f2.code), `undeclared code ${f2.code}`);
  }
});
test('the stall issue is reused, not duplicated on every failed run', async () => {
  const { upsertStallIssue } = await import('../tools/health_issue.mjs');
  const f = fixture();
  const report = checkHealth({ ...f, now: Date.parse('2026-10-02T12:00:00Z') + 72 * HOUR });
  assert.equal(report.ok, false);

  const calls = [];
  const fake = async (action) => action;
  const openIssue = { number: 42, title: 'Health: publishing pipeline stalled' };
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url}`);
    if (String(url).includes('?state=open')) {
      return {
        status: 200,
        ok: true,
        text: () => Promise.resolve(JSON.stringify([openIssue])),
      };
    }
    return { status: 201, ok: true, text: () => Promise.resolve('{"number":43}') };
  };
  try {
    const action = await upsertStallIssue({ token: 't', repo: 'o/r', report });
    assert.equal(action, 'commented on issue #42');
    assert.equal(calls.filter((c) => c.startsWith('POST') && c.includes('/issues\n') === false && /POST .*\/issues$/.test(c)).length, 0,
      'a second issue must not be created while one is open');
    assert.ok(calls.some((c) => c.includes('/issues/42/comments')), 'the existing issue must get a comment');
  } finally {
    globalThis.fetch = original;
  }
  void fake;
});

test('a missing health label is created before the issue, or the POST 422s', async () => {
  const { upsertStallIssue } = await import('../tools/health_issue.mjs');
  const f = fixture();
  const report = checkHealth({ ...f, now: Date.parse('2026-10-02T12:00:00Z') + 72 * HOUR });

  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url}`);
    if (String(url).includes('?state=open')) {
      return { status: 200, ok: true, text: () => Promise.resolve('[]') };
    }
    if (String(url).endsWith('/labels/health')) return { status: 404, ok: false, text: () => Promise.resolve('') };
    if (String(url).endsWith('/issues')) {
      return { status: 201, ok: true, text: () => Promise.resolve('{"number":7}') };
    }
    return { status: 200, ok: true, text: () => Promise.resolve('{}') };
  };
  try {
    const action = await upsertStallIssue({ token: 't', repo: 'o/r', report });
    assert.equal(action, 'created issue #7');
    const labelIdx = calls.findIndex((c) => c === 'POST https://api.github.com/repos/o/r/labels');
    const issueIdx = calls.findIndex((c) => c === 'POST https://api.github.com/repos/o/r/issues');
    assert.ok(labelIdx >= 0, 'the label must be created');
    assert.ok(issueIdx > labelIdx, 'the label must exist before the issue references it');
  } finally {
    globalThis.fetch = original;
  }
});

test('dry run touches no network', async () => {
  const { upsertStallIssue } = await import('../tools/health_issue.mjs');
  const f = fixture();
  const report = checkHealth({ ...f, now: Date.parse('2026-10-02T12:00:00Z') + 72 * HOUR });
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = async () => { called = true; throw new Error('network must not be used'); };
  try {
    const action = await upsertStallIssue({ token: 't', repo: 'o/r', report, dryRun: true });
    assert.match(action, /dry-run/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});
