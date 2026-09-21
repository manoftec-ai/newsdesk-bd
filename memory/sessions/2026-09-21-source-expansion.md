# Session — Source expansion + "no new news" root cause (2026-09-21)

## Context
User reported "no new news" the site despite cron runs; asked to add as many verified
sources as possible ("we need more verifying news … as much as possible news source").

## Findings
- Runs green: pipeline.yml every 30 min, auto-author.yml hourly — but `new=1 dup=154
  sources_failed=5` per cycle, and auto-author check found `briefs:93 news:147
  UNPUBLISHED: []` → nothing new to publish. **Content-supply gap, not GitHub failure.**
- 3 sources use `method: headless` (kalerkantho, jugantor, jamuna; HTTP 403 bot-protection).
  `lib/fetch.mjs fetchSource` throws `unsupported method headless` for them → they can
  never fetch on the GH Actions runner (pipeline.yml has no browser install step).
  These are the permanent part of `sources_failed=5`.
- Google News RSS `site:` proxy technically returns items for all 3, but links are
  news.google.com redirects and items include epaper/homepage prints (some dated
  2014–2018) → rejected for quality.

## Change
- `pipeline/config/sources.yaml` (commit `4be9d49`, pushed `781bc9b` after rebase):
  7 probe-verified RSS sources added, each tested with the pipeline's own `fetchRss`:
  - tbs (The Business Standard) — 10 items
  - bbc-bengali (BBC Bengali) — 14 items
  - voa-bangla (VOA Bangla) — 60 items
  - daily-observer (The Daily Observer) — 14 items
  - bd24live — 10 items
  - dainikazadi (Dainik Azadi) — 10 items
  - guardian-world (The Guardian World) — 44 items
- ACTIVE source set: 15 RSS + 4 scraper = **19 sources** (was 12). 3 headless stay
  configured but deferred (decision 2026-09-19, unchanged).
- Config YAML re-validated (22 total entries parse), pipeline `npm test` 24/24.

## Verified / not tested
- All 7 new sources fetched+parsed locally with real items (output captured above).
- Full local `node run.js fetch` over all 22 sources did NOT complete in Termux
  (sequential 25s-per-source timeouts + Termux pipe buffering) — but GitHub runner
  executes it routinely; prior fetch_history shows normal completion there.
- Lighthouse gate regression noted separately (open item, not addressed here).

## Decisions
- D-Q3: source expansion — added 7 verified sources (this session).
- D-Q4: headless (kalerkantho/jugantor/jamuna) stay deferred; Google News proxy rejected.

## Next steps
- Watch next pipeline runs: expect sources_failed to drop from ~5 to ~0–2, new items/cycle up.
- If feed yields still low: add dailystar section feeds + more from probe_feeds.mjs pools.
- Optionally add Playwright strategy later (deferred, needs user).