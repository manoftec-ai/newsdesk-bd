# Session — "no news for 6h" diag (2026-09-22 01:00 UTC) — user chose LEAVE AS-IS

## Report
User: "no news in my site in last 6 hour ... you did fix many bugs, maybe you should try different approach."

## Diagnosis (no code changed)
- Pipeline is HEALTHY: fetch→normalize→cluster→verify→extract→pick→auto-author all green
  every ~30 min (runs 35644678…35673197). Deploys green. Site fresh (last-mod 00:41 UTC).
- Last authored before the dip: economy-296 (22:18 UTC). During BD 01:00–07:00 (overnight)
  the pool is single-source-heavy: cluster `created=0 reused=7 singled=219 matured=0`,
  verify `evaluated=219 passed=171 human_check=48`, extract `briefs written=30`, pick
  `1/1 pending ... 163 title-duplicates filtered`.
- Root cause of the *gap*, NOT a bug: news is auto-published ONLY when ≥2 verified outlets
  corroborate the SAME event. Overnight nearly every new item is single-source → classified
  `human_check` (single badge < confirmed min for tier A) → nothing passes → site looks stale.
  192/193 briefs already published → only 1 genuinely new brief (politics-282) existed.
- auto-author DID publish politics-282 at 00:53 UTC (fuel-price protest, live URL 200).
  So it was a timing/coverage lull, not a stuck pipeline.

## Decision (user-selected)
- LEAVE AS-IS. User declined all three supply fixes: cluster tuning (0.45→0.38),
  single-source top-outlet auto-publish, or both. (Genuine multi-source verification
  brand is a hard constraint.)

## Relevant mechanics (future sessions)
- `run.js` cmdCluster skips `ids.length === 1` → singletons never cluster → never verify-pass
  unless a second outlet covers them within the 8h window (sim≥0.45).
- `verify.mjs`: single paper = score 2 = badge `single`; tier A min badge = `confirmed`
  (score≥3) → single-source A-tier always `human_check`. Confirmed in config/sources.yaml.
- `pick_briefs.mjs` only REWRITES pick.json when there ARE picks; if pending=0 the old
  pick.json stays (stale-slug foot-gun for the LLM: it re-checked economy-296 already
  published — harmless, wasted run).
- D-Q14 title-dup filter (72h window) now filters 163/193 briefs → keeps feed clean of
  re-clustered repeats BY DESIGN.