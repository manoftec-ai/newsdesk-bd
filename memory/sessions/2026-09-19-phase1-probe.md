# Session — 2026-09-19 Phase 1 (probe + trust seed)

## What happened
- User APPROVED architecture v2 ("approve for now, add/modify more in future") → Phase 1 started.
- Built read-only `pipeline/tools/probe_feeds.mjs` (Node fetch, feed-link discovery + common-path guessing).
- Probed 15 news sources + 10 official/agency channels. Full data in `pipeline/tmp/probe_report.json`.

## Phase 1 results (probe 2026-09-19)
| Method | Sources |
|---|---|
| RSS ✓ | প্রথম আলো, ইত্তেফাক, সমকাল, ঢাকা ট্রিবিউন, ডেইলি স্টার, বাংলা ট্রিবিউন, দেশ রূপান্তর, চ্যানেল আই |
| SCRAPER | দৈনিক বাংলা, বিডিনিউজ২৪, দ্য ইন্ডিপেন্ডেন্ট, এটিএন বাংলা (domain atnbangla.tv) |
| HEADLESS (403) | কালের কণ্ঠ, যুগান্তর, জামুনা টিভি |

- Officials: only bmd / dghs / nbr reachable (200, no feeds); others TLS/reset/ENOTFOUND/timeout —
  confirms VERIFY should use SearXNG meta-search + owner-verified FB pages, not direct .gov.bd polling.
- Discovered: atnbanglatv.com does NOT resolve; correct domain is atnbangla.tv.
- dailystar main RSS only ~8 items → section feeds noted for Phase 7.

## Deliverables written
- `pipeline/config/sources.yaml` (site/categories/tiers/ai/poll + 15 sources method-verified)
- `pipeline/config/trust.json` (15 sources `top` reputation; 10 official channels w/ probe status;
  FB page URLs NULL pending owner verification; empty blocklist to grow manually)
- `pipeline/tmp/probe_report.json`

## Known gaps / next
- Probe title-extraction regex bug (cosmetic; itemCount correct).
- Headless strategy for 403 sites (Playwright vs cookie-session curl) — decide in Phase 1b.
- Owner must confirm official Facebook page URLs for the 10 channels before Phase 4 (no fabricated URLs).
- Next phase: Phase 2 normalize + SQLite store + dedupe.

## Status
- Phase 1 core complete. Next: Phase 1b headless decision, then Phase 2.