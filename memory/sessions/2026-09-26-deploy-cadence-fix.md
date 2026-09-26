# 2026-09-26 — deploy cadence fix (D106)

## The user's question
> "so if i have free quota limit in vercell why you cant deploy latest version
> of github in vervell" … then, quoting my own correction: "so its fix now"

## Root cause, measured
`api-deployments-free-per-day` is a **daily deploy-attempt cap**, not storage.
GitHub Actions recorded **100 deploy.yml runs in one day**:

| Trigger | Runs |
|---|---|
| `workflow_run` (6 bot workflows completing) | 38 |
| `workflow_dispatch` | 30 |
| `push` to main (site/** changed) | 29 |
| `schedule` (*/15) | 3 |
| **Total** | **100** |

70 succeeded, 30 were rejected. After the cap trips, every deploy fails for the
rest of the 24h window.

**Deleting deployments does not help.** The counter tracks attempts in the
trailing 24h, not retained deployments. The D105 storage prune freed real space
but is unrelated to this failure.

## Fix
`.github/workflows/deploy.yml` — the only production change:
- automatic deploys: hourly cron `17 * * * *`, nothing else
- `push` and `workflow_run` triggers removed
- `workflow_dispatch` kept for manual deploys
- ~24 deploys/day with headroom
- Trade-off accepted: bot pushes go live on the next tick, not instantly

Minute 17 rather than 0, to avoid the top-of-hour GitHub Actions cron rush.

## Two more bugs found while reading the old condition
1. `if: (github.event.workflow_run == null && github.event.schedule == null)`
   — `workflow_dispatch` satisfies this, so every manual dispatch deployed
   **unconditionally**, with no content check. 30 wasted deploys/day; a dispatch
   on a memory-only commit still shipped a build.
2. The guard compared `HEAD~1..HEAD`, so a push containing an *earlier*
   site-changing commit was skipped, and it could not know whether a change
   was already deployed.

Both fixed: the guard asks the Vercel API which commit is live and diffs
`site/` against it, for every trigger, defaulting to deploy when unsure.

## Self-inflicted bug, caught by actually running it
Naming the variable `VERCEL_PROJECT_ID` made the Vercel CLI claim it:
```
You specified `VERCEL_PROJECT_ID` but you forgot to specify `VERCEL_ORG_ID`.
```
Renamed to `DEPLOY_PROJECT_ID`, which the CLI ignores. Worth remembering:
**never name a job-level env var `VERCEL_*` unless the CLI is meant to own it.**

## Verification
- YAML parsed with the repo's own `yaml` module
- Guard shell executed verbatim against the live Vercel API and real repo
- Dispatch 1 (00:14): failure — the env var collision
- Dispatch 2 (00:16): **success**, all 4 steps green, deploy step ran
- New production deployment `0cbae4a2` READY/PROMOTED
- Site after: homepage 200, `/article/national-551` 200, `/article/national-125`
  404, sitemap 377 entries
