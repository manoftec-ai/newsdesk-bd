# Session — duplicate-title articles (same story published 3-4x) fixed (2026-09-21, D-Q14)

## Report
User: https://newsdesk-bd.vercel.app/article/politics-277 "appears 3 times. maybe a mistake.
fix the error."

## Diagnosis
- The same EVENT re-clustered into new briefs whose synthesized headline matched an
  already-published article → auto-author published it again under fresh slugs.
- Examples: NCP fuel protest = politics-273 + politics-277 + politics-278 + politics-282 (4);
  Saifuddin Asian Games = sports-255 + sports-257 + sports-258 (3).
- Site-wide scan by normalized title: 19 groups, 22 extra articles.

## Fix (D-Q14)
- New `pipeline/lib/published.mjs`: normTitle (Unicode letters+digits, lowercased),
  loadPublishedTitles(siteDir) -> Map<normTitle,date>, isTitleDuplicate(headline,briefDate,map)
  — ONLY exact normalized-title matches within 72h (recurring daily headlines on different
  days still allowed).
- Wired into: `lib/extract.mjs` exportBriefs (never WRITE a dup brief), `tools/pick_briefs.mjs`
  (never SELECT a dup), `tools/finalize_stories.mjs` (never WRITE a dup article).
- Cleanup: removed 22 news .md + 22 .webp thumbnails + ~20 stale dup brief .json (kept the
  first-published copy per title; politics-273 and sports-255 kept for the two worst groups).
- Rebase conflict dance: origin moved during the work (concurrent heartbeat runs) — 3 files
  conflicted (deleted-by-us/modified-by-them) → resolved by deleting, then a residual set of
  4 articles+4 images (politics-277/282, national-278/280) re-created by a pipeline run before
  the dedup code landed → removed in a follow-up commit; also an orphan politics-278.webp.
- Verified live after deploy: politics-277/278 -> HTTP 404, homepage shows exactly ONE story
  per headline (multiple section-links are the same story), no duplicate titles remain on
  origin/main. `git ls-tree origin/main | uniq -d` empty.

## State at end (18:45 UTC)
- Pipeline dedup live on main (next verify/extract/pick/finalize runs use it).
- Heartbeat cycle ~30 min still running (deploy now lands each cycle; manual deploy used here).
- No duplicate titles on the site; one story per headline.