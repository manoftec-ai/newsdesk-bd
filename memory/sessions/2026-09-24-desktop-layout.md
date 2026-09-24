# Session 2026-09-24 — D71: Desktop layout question → KEEP as-is

## Context
User asked about jachaidesk.com on desktop: it fills the screen on mobile but
looks "a little small" on a desktop monitor. Wanted to know whether we should
make it fit full-width or leave it.

## What I checked
- Whole site content is wrapped in a centered `max-w-6xl` column = **1152px**:
  `site/src/pages/index.astro:92`, `site/src/components/Header.astro:20 (+64)`,
  `site/src/components/Footer.astro:10 (+53)`. Header band, masthead and ticker
  all align to the same column.

## What I told him
- This is intentional + standard for news sites (BBC, Guardian, Prothom Alo,
  Daily Star all run a centered ~1100–1300px reading column on desktop).
- Full-bleed would make article line lengths too long and hurt readability on
  big monitors; mobile looks "full" simply because the column is wider than the
  phone.
- Optional tweak if he ever feels it too narrow: `max-w-6xl` → `max-w-7xl`
  (1280px) in the 5 file/line spots above. Zero risk, ~2 min.

## Decision
User: **"ok..keep it then"** — no change made. Verified no code diff.

## Outcomes
- No commit needed (nothing modified).
- Memory: D71 row added to `memory/MEMORY.md` (Decisions recent). No code touched.