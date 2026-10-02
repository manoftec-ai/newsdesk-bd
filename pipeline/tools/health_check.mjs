// tools/health_check.mjs — is the publishing pipeline actually producing, or has it stalled?
// usage: node tools/health_check.mjs [--news=site/src/content/news] [--pick=state/pick.json] [--stall-hours=36]
//
// 2026-10-02. This replaces an inline `node -e` blob in .github/workflows/health.yml
// that had two faults and therefore never once did its job:
//
//  1. It mixed ESM `import` with `require('fs')` in the same script. Node runs that
//     as a module, so `require` is not defined and the job died on every single run
//     — it reported a broken pipeline while itself being the broken thing.
//
//  2. It measured the newest article's FILE MTIME. actions/checkout gives every file
//     the checkout time, so the newest mtime was always ~0 hours old and the 36-hour
//     stall check could never fire even if publishing had been dead for a week. A
//     monitor that cannot fail is worse than no monitor, because it looks green.
//
//     Recency now comes from `git log -1` on the content directory, which is real
//     history and is correct immediately after a fresh shallow checkout.
//
// The check is exported so it can be tested; running the file executes it.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const HEALTH_FAILURE_CODES = Object.freeze([
  'TOO_FEW_ARTICLES',
  'PUBLISHING_STALLED',
  'PICK_STATE_UNREADABLE',
  'RECENCY_UNKNOWN',
]);

export const MIN_ARTICLES = 10;

/**
 * @param {object} [options]
 * @param {string} [options.newsDir]  directory holding published article Markdown
 * @param {string} [options.pickPath] pipeline pick state
 * @param {number} [options.stallHours] hours without a new article before we call it stalled
 * @param {number} [options.now]      epoch ms, injectable for tests
 * @param {() => string} [options.gitLog] injected git log, for tests
 */
export function checkHealth({
  newsDir = 'site/src/content/news',
  pickPath = 'state/pick.json',
  stallHours = 36,
  now = Date.now(),
  gitLog = defaultGitLog,
} = {}) {
  const failures = [];
  const report = { newsDir, stallHours, articleCount: 0, hoursSinceLastArticle: null, lastArticleCommit: null, pickPending: null, pickPicked: null };

  let files = [];
  if (existsSync(newsDir)) {
    files = readdirSync(newsDir).filter((f) => f.endsWith('.md'));
  }
  report.articleCount = files.length;
  if (files.length < MIN_ARTICLES) {
    failures.push({ code: 'TOO_FEW_ARTICLES', detail: `${files.length} articles in ${newsDir}, expected at least ${MIN_ARTICLES}` });
  }

  // Recency from git history, never from file mtime — checkout rewrites mtimes.
  let lastCommit = null;
  try {
    lastCommit = gitLog(newsDir);
  } catch {
    lastCommit = null;
  }
  if (!lastCommit) {
    failures.push({ code: 'RECENCY_UNKNOWN', detail: `no git history for ${newsDir} — cannot tell whether publishing is stalled` });
  } else {
    report.lastArticleCommit = lastCommit;
    const parsed = Date.parse(lastCommit);
    if (Number.isNaN(parsed)) {
      failures.push({ code: 'RECENCY_UNKNOWN', detail: `unparseable commit date "${lastCommit}"` });
    } else {
      const hours = (now - parsed) / 36e5;
      report.hoursSinceLastArticle = Math.round(hours * 10) / 10;
      if (hours > stallHours) {
        failures.push({ code: 'PUBLISHING_STALLED', detail: `last article committed ${report.hoursSinceLastArticle}h ago, limit ${stallHours}h` });
      }
    }
  }

  // The pick state is diagnostic, not fatal on its own: pending 0 with a healthy
  // article count is normal right after a publishing run drains the queue.
  try {
    const pick = JSON.parse(readFileSync(pickPath, 'utf8'));
    report.pickPending = Array.isArray(pick.pending) ? pick.pending.length : pick.pending ?? 0;
    report.pickPicked = Array.isArray(pick.picked) ? pick.picked.length : pick.picked ?? 0;
  } catch (error) {
    failures.push({ code: 'PICK_STATE_UNREADABLE', detail: `${pickPath}: ${error.message}` });
  }

  report.failures = failures;
  report.ok = failures.length === 0;
  return report;
}

function defaultGitLog(newsDir) {
  return execFileSync('git', ['log', '-1', '--format=%cI', '--', newsDir], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

export function formatReport(report) {
  const lines = [
    `articles ${report.articleCount}`,
    `last article commit ${report.lastArticleCommit ?? 'unknown'}` +
      (report.hoursSinceLastArticle === null ? '' : ` (${report.hoursSinceLastArticle}h ago)`),
    `pick pending ${report.pickPending} picked ${report.pickPicked}`,
  ];
  for (const f of report.failures) lines.push(`FAIL ${f.code}: ${f.detail}`);
  if (report.ok) lines.push('health OK');
  return lines.join('\n');
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  const arg = (name, fallback) => {
    const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  const report = checkHealth({
    newsDir: arg('news', 'site/src/content/news'),
    pickPath: arg('pick', 'state/pick.json'),
    stallHours: Number(arg('stall-hours', '36')),
  });
  console.log(formatReport(report));
  process.exit(report.ok ? 0 : 1);
}