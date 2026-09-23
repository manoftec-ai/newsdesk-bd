# 2026-09-23 — automation outage: auto-author.yml invalid YAML (D50) — ROOT CAUSE/incident

## Symptom (user report)
"Site was on full automation but I see no new news on the home page — automation stopped."

## Root cause
Commit `f0aed31` (D50, name-only source links) rewrote the author prompt in
`.github/workflows/auto-author.yml` and **dropped the indentation** on the `brief; end with...`
line — it sat at column 1, making the whole workflow **invalid YAML**. GitHub cannot register an
invalid workflow, so the durable triggers died from 14:39 UTC onward:
- `schedule` ('17 * * * *') — stopped creating runs
- `workflow_run: [pipeline]` — stopped creating runs
- every subsequent `push` produced GitHub's stale-registry error run (conclusion failure, 0 jobs,
  logs 404) — visible as a long tail of failing runs, but harmless.

So: pipeline.yml kept fetching/extracting fine (c2633e1 at 14:40), but nothing was ever **authored
or published** → homepage froze on ~14:11's batch (national-425/426/340/369 + sports).

## Diagnosis trail
- `actions/workflows/auto-author.yml/runs` → all recent = event `push`, failure, 0 jobs.
- `actions/runs/{id}/jobs` = 0 jobs + logs 404 → GitHub never parsed the file.
- `git show f0aed31 -- auto-author.yml` → diff shows `-brief;` line (indented) replaced by
  `+brief;` at column 1. Catalogd the corruption.
- `pipeline.yml` 15:03 "failure" was a different, transient issue: step "Commit state" (git push)
  raced concurrent pushes during the parallel-session flurry; all 5 fetch→extract steps succeeded.

## Fix
Restored indentation (14 spaces) on the column-1 line → YAML parses again
(validated with pipeline's `yaml` package: triggers workflow_dispatch/schedule/workflow_run,
job author present). Commit `d6d6359` pushed. This ALSO carried the parallel editor's refined
author prompt: "brief; you MAY end with a short verification closing naming the outlets ... do NOT
append a 'সূত্র:' list in the body (links rendered automatically from front matter)" — consistent
with D50/D52 (name-only links, single source display).

## Verification
- Dispatched auto-author (run 35880916775) → completed **success** (real job with 9 steps; author
  step ~7 min via opencode keyless gateway).
- Published batch pushed: `d70a6eb auto-author: publish drafted stories (20260923T1537)` =
  6 stories (economy-446, national-442/445/447/448, sports-443), all `draft:false`.
- Live homepage immediately showed the new lead "আমরা কাউকে ভয় পেতে আসিনি: হামজা" (sports-443)
  after the 15:38 deploy.
- pipeline.yml cron run at 15:33 in_progress — supply chain re-proving itself.
- schedule (:17) + workflow_run triggers will fire automatically again.

## Lessons
- **Never hand-edit a GH Actions prompt block with continuation lines** — a column-0 line kills the
  whole workflow registration (2nd occurrence; see earlier `14e9681` which fixed the same class).
- Always re-validate workflow YAML (node + yaml pkg) before pushing.
- Symptom pattern for "GitHub not registering a workflow": runs exist with event `push`, conclusion
  failure, **0 jobs**, logs 404.