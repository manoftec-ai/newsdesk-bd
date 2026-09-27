# Session — content audit T1–T5 implemented (2026-09-27)

User rules: pipeline/ untouched, list saved first, one-by-one with verification, no questions.

## Shipped (one commit + push per item, all in-sync)
- **T1** `0e26c1b`: 5 more tracked stories (Asian Games QF, bus fare, UP polls, MP mandate, UNGA sidelines) → 8 total. Verified 8/8 renderable on /tracked.
- **T2** `1560df5`: /ghotona split (70 covered links + 13 planned non-link cards), noindex on empty hubs, sitemap parity, dynamic hub headers. Link-integrity verified.
- **T3** `aa991fd`: unique blurb on all 11 categories (meta + header) + empty-state with beat links.
- **T4** `350c644`: 30 newest excerpts rewritten as real summaries. Verified 0 lead-echo, all ≤160.
- **T5** `29c7314`: 3 explainers (chronology-only facts, repo sources reused, hub backlinks) + 22 FAQs on 10 longest + 7 older excerpt trims. Corpus 401, all YAML-valid, tests 349/349.

## Incidental findings (not fixed — pipeline side or judgment calls)
- national-485/sports-481 = same hockey match, different angles. Left as-is.
- national-met-office-forecasts body = mixed English wire copy + publisher boilerplate leak. Needs pipeline-side body cleaning.
- Excerpt quote styles vary per file (bare vs double-quoted). Handled per-file.

## Process notes
- One transient `pull --rebase` failure ("multiple branches") — used explicit fetch + rebase + push after. One push race with bot auto-commit — rebased clean.
- Bot's CONCURRENT-SESSIONS.md worktree protocol exists; this session stayed collision-free via stage-own-files-only + per-item commits.
