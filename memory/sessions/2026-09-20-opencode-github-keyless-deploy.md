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
- Parallel session still active (living-story D36 + header tweaks 383fb4f): always
  fetch+rebase before pushing; the merge -X theirs step absorbs same-file races.