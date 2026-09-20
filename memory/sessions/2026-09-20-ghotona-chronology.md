# Session — 2026-09-20: Ghotona-Pongji কালানুক্রম (dated chronology) archive

> Decision D41. Continues D39 (ঘটনাপঞ্জি). Parallel session shared the worktree; only my files staged.

## What the user wanted
"Can we include [previous news] in every event … full chronology … with dates … event by event …
inside ghotona pongji, not in the home section." → Build a per-event dated historical-news archive,
curated event-by-event, rendered ONLY inside each event's `/ghotona/<id>` page (never in the home
feed / RSS / sitemap).

## Design (confirmed & built)
- **Data store** `site/src/data/events-news.json` — `chronology.<eventId>[]` of
  `{date, title, summary, sourceName, sourceUrl}`. Partial dates allowed (`"YYYY"` or `"YYYY-MM"`)
  for events with month/year-only public records. Lives OUTSIDE `src/content/news`, so home/RSS/
  sitemap never pick it up (astutely: content collection ingestion only touches `content/news`).
- **Loaders** in `site/src/lib/events.js` (imports `events-news.json` with `{ type: "json" }`):
  `chronology`, `chronologyFor(slug)`, `hasChronology`, `chronologyCounts`, `groupChronologyByYear`,
  `formatChronoDate` (full ISO → "১১ ফেব্রুয়ারি ২০১২"; `YYYY-MM` → "আগস্ট ২০১২"; `YYYY` → "২০১২").
- **UI** — `/ghotona/[slug].astro`: year-grouped vertical timeline (marker dot + date + title +
  original Bengali summary + "সূত্র:" link) rendered only when the event has entries. `/ghotona`
  index: cards show `কালানুক্রম N` and a stat line "কালানুক্রম Nটি ঘটনায় Mটি তারিখযুক্ত রেকর্ড".

## First event curated: sagor-runi-murder (17 entries)
2012-02-11 murder discovery → 2025-02-11 13th anniversary. Highlights: DB to RAB handover
2012-04-18, exhumation + viscera tests 2012-04-26, US lab DNA 2012-08, 7th IO 2019-07-04,
IFS DNA progress report 2020-10-07, Home-ministry taskforce 2024-08-23, RAB→PBI handover
2024-11-04. Every entry = MY OWN original Bengali summary traced to a verifiable public source
(cited by name + URL): Wikipedia, The Business Standard, Prothom Alo English, The Daily Star,
The Times of Dhaka. Cross-checked the timeline via web search before writing (dates matched).

## Files changed
- `site/src/data/events-news.json` (new, chronology store — sagor-runi done)
- `site/src/lib/events.js` (+chronology loaders & date formatter)
- `site/src/pages/ghotona/[slug].astro` (+কালানুক্রম timeline section)
- `site/src/pages/ghotona/index.astro` (+chronology counts)
- `memory/MEMORY.md` + `memory/MEMORY.json` (this decision)

## Verification
- `node --check` clean; all 17 entries have date/title/summary/sourceName; lib exports tested in
  plain Node (17 entries, group→8 years, formatChronoDate works for all 3 precisions).
- Pipeline `npm test`: **24/24 pass**.
- Commits: `ca42004→2e8dfba` pushed (deploy's push trigger fired since `site/src/**` changed).
- GH check-runs for `2e8dfba`: **vercel deploy success**, lighthouse in_progress.
- Live verified: `/ghotona/sagor-runi-murder` shows কালানুক্রম with sources + "আগস্ট ২০১২"
  partial dates; `/ghotona/` card shows "3টি প্রতিবেদন · কালানুক্রম 17".

## Next steps
- Curate chronologies for remaining 81 events event-by-event (no fabrication, dated + cited).
  Suggested order: `tazreen-fires-2012`, `rana-plaza-collapse` (before 2027-04-24 anniversary),
  `holly-artisan-attack-2016`, then `june-july-2024-quota` / `oust-hasina-2024`.