# Session — "still no new news": homepage same-day sort bug (2026-09-21)

## Symptom
After the heartbeat fix, user still reported no new news on the site.

## Investigation
- Site **was** updating: origin/main news files 250 → 268; latest prod deploy READY 14:28;
  live homepage contained new slugs (national-254, 251, 250, 249…).
- Pipeline **was** fetching fresh items: store.db newest `published_at` = 14:03, `seen_at` 14:03.
- Pipeline **was** creating briefs: extract `briefs written=136` (14:10 run).
- BUT the homepage "সর্বশেষ" (latest) list showed **sports-224 (06:57), sports-190 (05:08),
  politics-233 (04:49)** above national-254 (09:54) — not newest-first.

## Root cause
`site/src/lib/news-data.js`:
- `normalizePost` set `date: isoDate(entry.data.date)` → `toISOString().slice(0,10)` = **YYYY-MM-DD**.
- `sortedPosts` compared `a.date < b.date` — with day-only strings, **all same-day articles are equal**,
  so their order is arbitrary. New stories therefore appeared in random positions and the hero
  (`featuredPost` → `sorted[0]`, no `featured:true` posts exist) kept showing older stories.
- rss/sitemap were fine (they sort raw `data.date` Date objects).

## Fix (D-Q8)
- Added `ts: entry.data.date.getTime()` in `normalizePost`.
- `sortedPosts` now sorts `(b.ts ?? 0) - (a.ts ?? 0)`.
- Kept `date` as YYYY-MM-DD for display compatibility. Commit `02e333e` (push → deploy.yml path `site/src/**`).

## Notes
- Verified only by `node --check` locally + Vercel CI (no local Astro build, D28).
- Also documented: verification design holds single-source tier-A clusters as `human_check`
  (needs 2 distinct sources → `confirmed`), so per-story freshness depends on corroboration speed.

## Open
- Confirm after deploy that the homepage top items are the newest by timestamp.
- Backlog (21 unpublished briefs) draining at ≤6/run via the heartbeat chain.
