# Session: opencode-on-GitHub KEYLESS + auto-author green + deploy chain fix (D37/D38)

> 2026-09-20, afternoon. Supercedes the stale "OPENCODE_API_KEY blocker" notes
> in the font-outage session log and D37's WIP wording.

## Key discovery — NO API KEY NEEDED
- Verified locally (isolated XDG_DATA_HOME/XDG_CONFIG_HOME, vendored musl binary from
  @nemoobc/opencode-termux, v1.18.31): headless `opencode run --pure --format json
  --model opencode/big-pickle "reply with exactly: SMOKE-OK"` → `SMOKE-OK`, exit 0.
- The opencode gateway serves `opencode/big-pickle` free keyless to `opencode run`.
- Removed the OPENCODE_API_KEY gate from auto-author.yml entirely (commit 209399c),
  pinned opencode v1.18.31 (`curl -fsSL https://opencode.ai/install | bash -s -- --version`),
  added `--pure`.

## YAML bug that stalled the workflow
- The multi-line `run: |` prompt in auto-author.yml had continuation lines at column 1
  (only the first line indented) → invalid YAML → GitHub kept the STALE registered
  definition (from 8f29b70, 01:04Z) and every new push ran it (failing at the old
  key-check). Dispatch API returned 422 "Workflow does not have 'workflow_dispatch' trigger".
- Fix (14e9681): indented the whole prompt block; validated with node+yaml before push;
  registration refreshed (updated_at 2026-09-20T21:03:23+06), dispatch → 204.

## Results that prove the chain works
- Dispatch run 35518388858: author step authored+finalized 10 stories keyless on a real
  runner (255–290w Bengali bodies, Bengali numerals, verification closer, no footer,
  finalize wrote=10/skipped=0/failed=0) but the push step failed: `git pull --rebase`
  hit ADD/ADD conflicts — the parallel in-Termux session concurrently authored 4 of the
  same slugs (national-125/127/128, sports-129).
- Fixed push step (c3d28fe): ff-only merge first, else merge `-X theirs` (remote wins on
  same-file races, our non-conflicting files merge in), then `push HEAD:main`.
- Runs 35519208918 and 35520256624: **completed success**, pushed ~20 stories.
  Main: 39 → 59 news files. Verification of author output from the run logs: all 10
  bodies within spec, `draft:false`, summary printed, "No commit/push performed" by opencode.
- Remaining queue after these runs: 28 unpublished of 86 briefs (keeps draining ~10/run:
  pipeline every 30min → auto-author via workflow_run + hourly cron + manual dispatch).

## Deploy chain fix (D38)
- Bot workflows push with the default GITHUB_TOKEN; such pushes do NOT re-trigger
  push-based workflows → no deploy.yml/images.yml runs ever fired for auto-author
  commits → live site stuck at 39 stories while main had 49 (vercel deploy only ran on
  user/PAT pushes, e.g. batch-5 at 15:10Z).
- deploy.yml now adds `workflow_run: [auto-author, images, pipeline] completed` +
  checkouts the triggering head_sha (fetch-depth 2) and skips unless the pushed commit
  changed `site/src`, `site/public`, `site/package.json`, `site/astro.config.mjs`
  (git diff HEAD~1 HEAD). Push/dispatch deploy unchanged.
- Verified: deploy workflow_run runs for the images (15:45) and auto-author (15:48)
  commits BOTH completed success → live sitemap went 39 → 59; new story URLs reachable.
- images.yml catches bot-pushed articles via its :17/:47 schedule (GITHUB_TOKEN push
  doesn't fire its push trigger either) — thumbnails branded (db6535a).

## Files touched
- `.github/workflows/auto-author.yml` — keyless, pin v1.18.31, --pure, merge-tolerant push (c3d28fe)
- `.github/workflows/deploy.yml` — workflow_run triggers + content-change guard (57eeefe)
- memory/MEMORY.md (D37 keyless + D38 rows, WIP, live count 59), memory/MEMORY.json

## Open / next
- Queue drains automatically (scheduled); no manual action needed.
- national-122/123/126/130/131/136, sports-133, international-… remain — the newest-10
  cap picks them in future runs.
- Parallel session still active (living-story D36 + header/footer tweaks 383fb4f): always
  fetch+rebase before pushing; the merge -X theirs step absorbs same-file races.

## Addendum (same day, error sweep + resilience) — commits 0b68fcc, 1082966
- **deploy stale-commit bug FIXED (0b68fcc)**: `github.event.workflow_run.head_sha` for a
  dispatch/schedule-triggered bot run points at the ref SHA when the run STARTED, not the
  commit it later pushed. The 16:12 deploy therefore checked out 43f882b (pre-author) and
  its guard saw "no site change" → skipped → live stuck at 59 while main had 69. Fix:
  checkout current main tip for bot-triggered deploys; guard diffs HEAD~1..HEAD of main.
  Verified: live sitemap 59 → 69 == main.
- **merge-abort push bug FIXED**: images 16:27 push failed "! [rejected] (fetch first)" — the
  `|| true` on `merge -X theirs` left the merge IN PROGRESS, so `git push` bailed. All three
  bot workflows now abort cleanly (`git merge --abort` + exit 0; the pushed commit is entirely
  regenerable next run) instead of pushing a mid-merge tree.
- **schedule delivery is unreliable this afternoon**: pipeline cron '*/30' last fired 14:07;
  auto-author '17 * * * *' never delivered a slot; images '17,47' delivered only some
  (14:15?, 15:47). workflow_dispatch + workflow_run + push triggers all work fine.
  Resilience added (1082966): (1) auto-author now runs the pipeline fetch/normalize/cluster/
  verify/extract chain itself before authoring (idempotent, deduped) so a missed pipeline
  slot doesn't starve the queue; (2) deploy.yml gained '*/15 * * * *' safety-net schedule
  with the content guard extended to schedule events (skips unless the last commit changed
  site/); (3) images/pipeline use the same abort-and-skip merge.
- State at end of sweep: 86 briefs, 69 live on main (68 stories + dengue), 18 still queued;
  live site == main (69). All remaining work is automatic (best-effort schedules + chains).

## Addendum 2 (same day, MISSING-THUMBNAIL root cause + chain fix) — commit 49f1bc9
- **Reported**: newly published stories missing their right image.
- **Root cause (two layers)**:
  1. Direct: the 16:27 images run generated ALL needed thumbnails
     (`add_images done. made=20 photo=11 card=9 skipped=49 failed=0`) but its push died on
     the mid-merge bug ("fetch first") → the commit was lost on the ephemeral runner.
  2. Systemic: images.yml had NO deterministic trigger after a bot batch — only `schedule`
     (flaky today) and `push` (bot pushes with GITHUB_TOKEN never re-trigger push workflows).
     So nothing re-ran images after the new auto-author batches until a random schedule slot.
- **Fix**: images.yml now chains via `workflow_run` on [auto-author, watcher, pipeline]
  (validated no loop: auto-author listens only to pipeline; pipeline listens to nothing).
  Backfilled by manual dispatch → green in 40s, pushed f6e280f (20 webp + frontmatter) →
  deploy workflow_run fired immediately (16:56 success) → live images verified HTTP 200.
- **Verified final matrix on main**: 69/69 stories have a thumbnail (mix photo/card per
  add_images --strategy=mix); 70 files incl. og-default.svg. 0 missing.
- Future batches: auto-author → images (workflow_run) → deploy (workflow_run) → live. No
  schedule slot needed for thumbnails anymore.