# Session — what is GitHub doing now + auto-author publishing stale backfill (2026-09-21)

## User question
User: "when I push, news publishes, but automation is not working properly. Before changing
anything, look at GitHub — what is he doing for me now?"

## What GitHub was doing right then (16:19 UTC)
- Heartbeat (feaba1f, started 14:54) in_progress — animating the whole chain.
- Cadence confirmed healthy, every ~30 min:
  images → pipeline → auto-author → deploy (+telegram/Lighthouse).
  E.g. 15:02 pipeline, 15:14 auto-author(6), 15:25 images, 15:32 pipeline, 15:44 auto-author(6),
  15:56 images, 16:03 pipeline, 16:20 auto-author(6).
- auto-author 16:00 → 16:20 published 6 stories (commit 57bcb40).
- State: 295 articles live, 20 unpublished briefs waiting.

## Real problem found
The 16:20 batch's 6 stories were OLD-dated: national-202 (Sep 17), national-203 (Sep 18),
national-219 (Sep 18), national-222 (Sep 15), national-267 (Aug 24), national-most-popular-online
(**2023**) — stale backfill. Meanwhile fresh briefs sat unpublished: sports-257 (14:19),
national-266 (14:17), economy-263 (14:16), national-262 (13:59), national-261, national-259…

Root cause: `finalize_stories.mjs` sorts by brief date correctly, but the LLM author step was
TOLD to pick the newest N briefs and build the body files — and it picked arbitrary/stale slugs
instead. Model-followed-instructions unreliability.

## Fix (D-Q10)
- New `pipeline/tools/pick_briefs.mjs`: deterministic — lists briefs without a story in
  site/src/content/news, sorts by `date` desc (tie → slug), writes top N to
  `pipeline/state/pick.json` (`{picked:[{slug,date}], pending:n}`).
- `auto-author.yml`: new step runs pick_briefs BEFORE the author step; the prompt now reads
  `state/pick.json` and authors EXACTLY the `picked` slugs (empty → 'no unpublished briefs',
  exit 0). `finalize_stories.mjs --max` stays as the final cap.
- Path note: pick step uses CWD-independent default site path (must NOT pass --site under
  working-directory: pipeline, which would resolve under pipeline/).
- Commit `a9d044b`; local test: picks sports-257 first (14:19).

## Why freshness is still limited (by design)
Briefs only form when a cluster passes verify (≥2 distinct sources → configured/single-confirmed).
Fresh single-source raw items sit as `human_check` until a 2nd source corroborates → newest brief
can lag newest raw item by hours. Downstream decision still open: relax the single-source
tier-A gate vs keep strict corroboration.