# Session — 2026-09-19 Phase 2 (fetch + normalize + SQLite store)

## What happened
- Headless sources (কালের কণ্ঠ, যুগান্তর, জামুনা) — user decided to SKIP for now, implement later.
- User authorized searching for official Facebook pages → verified 10 channels (fire/police/DMP/
  BMD/BBS/PID/PMO/BTRC/DGHS/NBR) via web search and wrote them into `pipeline/config/trust.json`
  (fbVerified 2026-09-19). bmd.note: FB confirmation via directory data — re-confirm in Phase 4.
- Built Phase 2 pipeline:
  - `lib/db.mjs` — node:sqlite store (raw_items, fetch_history; schema per ARCHITECTURE §7)
  - `lib/config.mjs` — YAML config load + tier mapper
  - `lib/normalize.mjs` — Bengali tokenizer, Unicode/emoji cleaning, bigram-dice title similarity
  - `lib/fetch.mjs` — RSS via rss-parser; generic cheerio homepage scraper (article meta + body)
  - `run.js` — CLI: `node run.js fetch|normalize [--limit=N]`
  - npm deps: rss-parser, cheerio, yaml (installed with --no-bin-links — sdcard can't symlink)

## Results (run 2026-09-19)
- Fetch: 12/12 sources OK, 456 items → 374 bn / 82 en (Daily Star, Dhaka Tribune are en).
  411 have published_at; avg body 941 chars; only 25 short bodies.
- Tuning during run: scrapers skip video/gallery/photostory paths (dainikbangla was leaking /video/);
  article-page timeout lowered to 12s + max 15 article fetches/source (independent was hanging).
- Normalize: 456 total, 8 near-dups marked — all same-paper feed repeats (ittefaq x several,
  prothomalo, samakal, banglatribune). Some borderline (different measles death counts) → the
  dedupe_title_similarity=0.92 remains a calibration candidate; clustering (Phase 3) is the real merger.

## Test data
- `pipeline/tmp/store.db` = sample run snapshot (refreshable; deletes/refetch OK).

## Status / next
- Phase 2 exit criteria met (new/dup counts correct; no boilerplate).
- Next: Phase 3 Cluster (Bengali TF-IDF, open→mature→closed).