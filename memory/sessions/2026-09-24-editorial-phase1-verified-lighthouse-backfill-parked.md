# Session 2026-09-24 — Editorial Phase 1 verification; lighthouse + Phase-1b decisions; parallel-session conflict found

## What happened
- Re-verified Phase 1 on the LIVE site (read-only; no commits from this session):
  - Badge legend (1.4, commit `04eab2f`) is **live**: article page shows
    `নিশ্চিত [A] — দুই বা ততোধিক স্বাধীন সংবাদসূত্রে তথ্য মিলে গেছে` under the badge chip.
  - New article template deployed on top story `national-473`: lead → `এক নজরে`
    → `কী ঘটেছে` → `যা এখনো জানা যায়নি`; outlets named at most once; **0 banned phrases**.
  - Pipeline tests still **35/35** pass locally.
- Lighthouse CI (treosh, `lighthouserc.json`, minScore 1 all categories) is **RED on every
  recent deploy** — pre-existing, NOT caused by 1.4:
  - best-practices 96 → `errors-in-console`: `https://jachaidesk.com/_vercel/insights/script.js` returns **404**
    (Vercel Web Analytics not enabled in dashboard — user action item #3 in MEMORY.md).
  - performance 93–99 → LCP ~2.0s, `uses-responsive-images` (≈141 KiB savings), image-delivery (≈383 KiB).
  - a11y + seo still 100. Artifacts: `/data/data/com.termux/files/usr/tmp/opencode/lhx/*`.
- **User decision (2026-09-24): lighthouse fixes = PARKED.** Not touching site files while a
  parallel session is active in this repo.
- **User decision (2026-09-24): Phase 1b bulk regeneration (~430 old articles) = "do it later"**
  (Q2 gate: review new-style articles first; nothing satisfactory yet).
- **User decision (2026-09-24): parallel-session work = KEEP, user reviews first.**

## Parallel-session situation (IMPORTANT)
- An active parallel session continues work on this repo (governance status-gate in
  `verify.mjs`/`extract.mjs`/`finalize_stories.mjs`; claims/evidence schema + helpers in
  `db.mjs`; their session logs under `memory/sessions/2026-09-24--*.md`).
- Working tree WIP (NOT touched by me): `pipeline/lib/extract.mjs`, `pipeline/lib/verify.mjs`,
  `pipeline/lib/db.mjs`, `pipeline/state/store.db` (unmerged UU), `pipeline/tools/finalize_stories.mjs`,
  plus `.bak*` backups and earlier stashes.
- Local commit **`b9b2f8f`** (="news style: strip media names + aggregation boilerplate from 441
  articles and excerpts; author prompts forbid outlet names in body", also `fefbddf`) is a
  **local-only divergent commit on `main`, never pushed** (`git branch -r --contains` empty;
  origin/main = `a517f5e`). It bulk-rewrites 441 articles + hard-forbids outlet names in bodies —
  beyond the approved Q1/Q2 direction. Left untouched per user decision.
- **Do NOT commit/push in this repo until the parallel work is reconciled by the user.** Local
  `main` is ahead 1 / behind 2 of `origin/main`; any push now would publish unreviewed content.

## Notes / next steps
- [ ] User reviews new-style articles → then Phase 1b (bulk regen ~430) or template adjustment.
- [ ] Lighthouse: enable Vercel Web Analytics (dashboard) to clear the 404; then image-resize task.
- [ ] After user review: reconcile/remove local-only `b9b2f8f` news-style commit.