# Session — Same-batch duplicate national-290/292 fix (2026-09-22)

User report: "i just saw duplicate news. one maybe without image."

## Diagnosis
- Homepage showed TWO identical stories: `/article/national-290` + `/article/national-292`.
- Both: same title (কেরানীগঞ্জে জুয়েলারি ব্যবসায়ীসহ দুজনকে গুলি করে ২০–২৫ ভরি সোনা ছিনতাই),
  same date (2026-09-21T16:25:15Z), same cluster members (kalerkantho + prothomalo), separate clusters
  (clusterId 290 and 292), authored in the same auto-author run (commit `c3a3cee`, 20:20 UTC,
  pick.json listed BOTH slugs).
- national-292's live body contained leaked editorial meta-text:
  `[this sentence asserts a negative — "no official statement". Not in sources. Better to just say what's known.]`
  → quality violation (D25 / no-junk).
- Image check: both `images/national-290.webp` + `national-292.webp` valid webp, identical size
  (21422 bytes), HTTP 200 — the "no image" impression was on the stale pre-fix build only; no real
  missing-thumbnail bug found.

## Root cause
Same-batch hole in D-Q14's title-dup guard: `isTitleDuplicate` checks a SNAPSHOT of published
titles loaded ONCE before the finalize loop. Finalizing 290 then 292 in the same run, 292's title
was not yet in the snapshot → both passed. Same hole in `pick_briefs.mjs`: it filtered pending
briefs only against already-published titles, not against other pending briefs.

## Fix (commit `b6871c0`, rebased onto remote commit `2795286`)
1. Removed `site/src/content/news/national-292.md` + `site/public/images/national-292.webp` (kept 290).
2. `pipeline/tools/finalize_stories.mjs`: after each successful finalize, register the headline via
   `normTitle()` into the in-memory `publishedTitles` Map → a later same-run duplicate is skipped.
3. `pipeline/tools/pick_briefs.mjs`: dedupe the PENDING pool by normalized headline, keeping the
   newest slug (title-unique pick); log text now says "title-unique".

## Verification
- Node syntax checks OK on both edited tools.
- Unit sim: snapshot empty → check 290 false → register → check same title = TRUE (blocked). - Real-repo pick sim (6-pick): national-290 picked, national-292 dropped, others unaffected.
- Pipeline test suite 24/24 (`node pipeline/test/*.test.mjs` → 6+10+3+2+3).
- Initial push rejected (remote ahead by brand-thumbnail commit 2795286) → rebase → push ok.
- Deploy runs for `b6871c0` (2×, workflow_run + push) both completed success.
- Live checks after deploy: homepage `last-modified: 01:12:11 GMT`, `national-292` no longer linked,
  `/article/national-292` → **404**, `/article/national-290` → 200.

## Notes / next
- Cleaned temp home captures + sim files.
- No outstanding pipeline changes. D-Q16 records the fix and the general lesson
  (dedup snapshots must be updated in-loop; selection tools must dedupe their own pool).