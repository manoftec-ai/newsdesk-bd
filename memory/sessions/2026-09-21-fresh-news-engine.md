# Session — Fresh-news engine: gnews proxy + Google Trends (2026-09-21)

## Problem
Site updated too slowly. Root cause diagnosed over two prior sessions:
- Every cycle `fetch` returned ~1 genuinely new item (`new=1 dup=145`).
- 8 sources returned HTTP 403 **on the GitHub runner** (Cloudflare blocks the
  datacenter IP) while working fine locally: ittefaq, samakal, dhakatribune,
  deshrupantor, daily-observer, bd24live, and the 3 former `headless` ones
  (kalerkantho, jugantor, jamuna).

## Fixes shipped
1. **`gnews` fetch method** (`pipeline/lib/fetch.mjs`): proxies an outlet through
   `https://news.google.com/rss/search?q=site:<domain>&hl=bn&gl=BD&ceid=BD:bn`.
   - strips trailing `" - outlet"` from the headline (`stripSourceFromTitle`),
   - tries `decodeGoogleNewsUrl`; Google's *new* tokens are not server-decodable, so
     the redirect token is kept — but titles/dates/snippets are real and source
     attribution is correct (clustering is title-based, so this is acceptable),
   - drops homepage/epaper junk (`||`, ` | `, `epaper`).
   - Converted 9 sources to `gnews`: kalerkantho, jugantor, jamuna (were headless),
     daily-observer, bd24live, ittefaq, samakal, dhakatribune, deshrupantor.
2. **`gtrends` lead engine** (`fetchGTrends`): reads
   `https://trends.google.com/trending/rss?geo=BD` (10 daily BD topics, incl. Bengali),
   runs a Google News search per topic, attributes each hit to its real outlet via the
   title-suffix host map `KNOWN_OUTLETS`, and emits normal items so they flow through
   cluster → verify → extract → auto-author. Config: `limit: 10`, `queries: 6`.
3. **guardian-world crash fix**: Guardian's RSS `categories` are XML objects
   (`{_:"US immigration", $:{domain:...}}`), not strings → SQLite
   `cannot be bound to SQLite parameter 8`. `fetchRss` now flattens to the text.

## Verified on runner
Dispatch run `f9bcb414` then `4a6fbec7`:
- `[fetch] kalerkantho 56 | jugantor 55 | jamuna 52 | ittefaq 59 | samakal 60 |
  dhakatribune 60 | deshrupantor 55 | daily-observer 27 | bd24live 55 |
  guardian-world 43 | gtrends 1`
- **`fetch done. new=265 dup=550 sources_failed=2`** (was `new=1 dup=145 sources_failed=8`).
- Remaining 2 failures are transient, not systematic: `dainikbangla` (aborted/timeout)
  and `independent` (Cloudflare HTTP 522).

## Config
`pipeline/config/sources.yaml` active set now:
9 gnews + 9 rss + 4 scraper + 1 gtrends = **23 sources** (was 12).
`headless` method is deprecated (no browser needed anymore).

## Commits
- `7a09cbb` gnews + gtrends + guardian fix
- `c309409` rebase/push
- `f4b75f8` convert ittefaq/samakal/dhakatribune/deshrupantor → gnews (pushed `4a6fbec`)

## Tests
`npm test` 24/24 green. `node --check lib/fetch.mjs` OK. Config YAML re-validated.

## Open / next
- Consider a `gnews`-style fallback for the 2 transient scraper sources.
- Cadence is still 30 min; can drop to 15 min now that supply is up (watch politeness).
- Optionally add dailystar/prothomalo section feeds (Phase 7 note) for more volume.
- Google may change token format again; gnews proxy relies on the `site:` query shape.
