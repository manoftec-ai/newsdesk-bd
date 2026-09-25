# 2026-09-25 — List-promise audit and Google News body enrichment

## Outcome
- Added a deterministic `rv1` gate: list-promising headlines require at least three concrete items in the detail body.
- Generic `**এক নজরে**` summary bullets are excluded from that count.
- Added current Google News wrapper decoding through the `Fbv4je` batch endpoint.
- Thin Google News and Google Trends items now retain the resolved publisher URL/hash and receive fuller article-body extraction from JSON-LD, semantic article containers, and paragraph fallback.
- `buildBrief()` remains synchronous; enrichment stays in the fetch stage before normalization and clustering.

## Verification
- Focused audit/fetch/watcher tests: 30/30 passed.
- Full pipeline suite: 175/177 passed; the two failures are the known unrelated `targetWords` import mismatch and stale length-tier expectation.
- Both `national-520` Google News wrappers resolved to their publisher URLs live.
- Kaler Kantho and Jugantor returned Cloudflare 403 from this runner, so their thin bodies were safely preserved.
- An accessible Samakal page produced a 288-character extracted body, confirming the full-body path works on reachable publisher HTML.

## Files
- `pipeline/lib/audit.mjs`
- `pipeline/lib/fetch.mjs`
- `pipeline/test/audit.test.mjs`
- `pipeline/test/fetch-enrich.test.mjs`
