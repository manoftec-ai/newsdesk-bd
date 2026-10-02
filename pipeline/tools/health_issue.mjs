// tools/health_issue.mjs — raise exactly one GitHub issue when publishing stalls.
// usage: node tools/health_issue.mjs [--news=...] [--pick=...] [--dry-run]
// needs: GH_TOKEN (or GITHUB_TOKEN), GITHUB_REPOSITORY
//
// 2026-10-02. The workflow used to `curl` a fresh issue into existence on every
// failed run, so a pipeline that stayed broken for a week produced seven
// identical issues, and the POST 422'd outright when the `health` label did not
// exist yet. This reuses the open issue and comments the latest reading on it.
//
// Everything is written as a script rather than shell inside the workflow so the
// quoting stays sane and the behaviour can be tested without a network.
import { checkHealth, formatReport } from './health_check.mjs';

const ISSUE_TITLE = 'Health: publishing pipeline stalled';
const LABEL = 'health';

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

export async function github(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'newsdesk-health',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body is reported via status */
  }
  return { status: res.status, ok: res.ok, json, text };
}

/**
 * Create the health issue, or comment on the existing one.
 * Returns a short action string for logs and tests.
 */
export async function upsertStallIssue({ token, repo, report, dryRun = false }) {
  const when = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const body = `Detected ${when}.\n\n\`\`\`\n${formatReport(report)}\n\`\`\`\n\nCheck the pipeline cron and auto-author logs.`;

  if (dryRun) return `dry-run: would upsert "${ISSUE_TITLE}"`;

  const list = await github(`/repos/${repo}/issues?state=open&labels=${LABEL}&per_page=100`, { token });
  const existing = Array.isArray(list.json)
    ? list.json.find((i) => i.title === ISSUE_TITLE && !i.pull_request)
    : null;

  if (existing) {
    await github(`/repos/${repo}/issues/${existing.number}/comments`, {
      method: 'POST',
      token,
      body: { body: `Still failing ${when}.\n\n\`\`\`\n${formatReport(report)}\n\`\`\`` },
    });
    return `commented on issue #${existing.number}`;
  }

  // The label must exist first or the issue POST fails with 422.
  const label = await github(`/repos/${repo}/labels/health`, { token });
  if (!label.ok) {
    await github(`/repos/${repo}/labels`, {
      method: 'POST',
      token,
      body: { name: LABEL, color: 'd93f0b' },
    });
  }
  const created = await github(`/repos/${repo}/issues`, {
    method: 'POST',
    token,
    body: { title: ISSUE_TITLE, labels: [LABEL], body },
  });
  return created.ok ? `created issue #${created.json?.number}` : `failed to create issue (HTTP ${created.status})`;
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  const report = checkHealth({
    newsDir: arg('news', 'site/src/content/news'),
    pickPath: arg('pick', 'state/pick.json'),
    stallHours: Number(arg('stall-hours', '36')),
  });
  console.log(formatReport(report));
  if (!report.ok) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    if (!token || !repo) {
      console.error('health: no GH_TOKEN/GITHUB_REPOSITORY — cannot raise an issue');
    } else {
      const action = await upsertStallIssue({
        token,
        repo,
        report,
        dryRun: arg('dry-run', '') === 'true',
      });
      console.log(`health: ${action}`);
    }
  }
}