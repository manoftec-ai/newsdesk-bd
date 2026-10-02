# 2026-10-02 — Facebook scope clarified, health monitor rebuilt

## Facebook: closed as "not set up", not as a bug
User: **"i did not setup facebook yet."** No page, no current intent.

Consequence, recorded as D148 so it is not "fixed" later by mistake:
- absent `FACEBOOK_PAGE_ID` / `FACEBOOK_PAGE_TOKEN` is correct, not a defect;
- `facebook_post.mjs` exiting `0` on missing secrets is correct — it keeps a
  20-minutely job green instead of permanently red and misleading while there is
  nothing to post to;
- the 20-minute `facebook.yml` schedule is not a fault;
- the "make Facebook fail loudly" item is **retracted**, not deferred.
- Reopening condition: user sets up a page and asks for auto-posting. Then: add
  the two secrets, fail loudly on missing secrets, confirm a real post lands.

## Health monitor: it had never worked
Two independent faults in one inline `node -e` blob in `.github/workflows/health.yml`:

1. **Mixed module systems.** ESM `import` together with `require('fs')`. Node runs
   that as a module, so every run died with `require is not defined`. The monitor
   was the broken thing while reporting the pipeline broken.

2. **Staleness by file mtime.** `actions/checkout` gives every file the checkout
   time, so the newest article always looked ~0h old and the 36-hour test could
   not fire however long publishing had been dead. A monitor that cannot fail is
   worse than no monitor, because it looks green.

Fixes:
- recency from `git log -1 -- site/src/content/news`, correct immediately after
  checkout, so the workflow needs `fetch-depth: 0` (documented in the file);
- unknown history → explicit `RECENCY_UNKNOWN` failure, never a false all-clear;
- logic in `pipeline/tools/health_check.mjs`, testable outside CI;
- issue handling in `pipeline/tools/health_issue.mjs`: reuses the open issue and
  comments the latest reading (previously a brand-new identical issue on every
  failed run — seven for a week-long outage), and creates the `health` label
  first, since referencing a missing label makes the issue POST 422;
- `pick pending 0` demoted from stall signal to diagnostic — right after a
  publishing run the queue is legitimately empty.

## Verified locally
- `node pipeline/tools/health_check.mjs` → `articles 600 / last article commit
  0.6h ago / pick pending 0 / health OK`, exit 0.
- Simulated 72h silence → `FAIL PUBLISHING_STALLED: last article committed 72h
  ago, limit 36h`, exit 1. This is the case the old monitor could never produce.
- Simulated empty content dir → `FAIL TOO_FEW_ARTICLES`.
- `health.yml` parsed as YAML (4 steps) and both scripts run from the repo root.

## Tests
15 new in `pipeline/test/health-check.test.mjs`: healthy pass · 72h stall fails ·
exactly-at-limit passes and 36h01m fails · configurable threshold · too-few
articles · unknown recency · unparseable date · unreadable pick state · pending-0
is not a failure · issue reuse not duplication · label created before the issue
references it · dry run does no network. **Suite 487/487.**

## Still open (pre-existing)
`Lighthouse` fails every run because `lighthouserc.json` asserts `minScore: 1`
(a perfect score) across categories. Realistic thresholds are the fix; do not
chase a perfect score.
