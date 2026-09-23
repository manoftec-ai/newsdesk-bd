# Session 2026-09-23 — D55: Thumbnail + BD datetime system site-wide

## Context
User: "home page is ok now, i need the same systems in others page also".
D54 had given the homepage `secondLine` rows a tiny thumbnail + BD date-time beside the
headline. This session extends that same visual system to every page that lists headlines.

## Changes (deploys `628e6e4` + `972ff8c`, final run rerun=success)
1. **article page** (`[slug].astro`)
   - byline `<time>` now `formatDateTimeBD(post.ts)` instead of date-only `post.date`.
   - "আরও পড়ুন" related rows upgraded: `.mini-row-thumb` + `.mini-row-body` (title + BD
     `formatDateTimeBDShort` datetime) — identical structure to the homepage.
   - **Bug caught live:** first deploy (`628e6e4`) rendered an EMPTY byline `<time>`. Cause:
     the local `post = { slug, ...entry.data, ... }` object had no `ts` → `formatDateTimeBD(undefined)`
     → empty. Fix (`b752f17`): add `ts: entry.data.date.getTime()` to the local post object.
2. **PostCard.astro** — all 3 variants now render
   `<time datetime={new Date(post.ts).toISOString()}>{formatDateTimeBDShort(post.ts)}</time>`.
   Covers `/news`, category/*, tags/*, authors/*, homepage category cards.
3. **tracked.astro** — added `.mini-row-thumb shrink-0` + body with BD datetime.
4. **ghotona/[slug].astro** — published-news rows: thumbnail + BD datetime. Added
   `thumbnail`/`thumbnailAlt`/`ts` to the local `allEntries` mapping (they didn't exist).
5. **factcheck.astro** — card date → `formatDateTimeBD`.
6. **corrections.astro** — log timestamp → BD datetime (`post.updated || post.ts`).
7. **styles.css** — removed dead `.mini-row-time`, `.mini-row > div > a` (+hover). Updated the
   block comment: rows are now "homepage 'আরও খবর' + article 'আরও পড়ুন'".

## Deployment & verification
- `628e6e4` and `972ff8c` pushed; runs: initial `35888259363` success, then `35889249269`
  marked FAILURE solely on Lighthouse `categories.best-practices` below threshold — only audit
  was `errors-in-console` = `_vercel/insights/script.js` returned 404 (Vercel Insights infra
  flake, unrelated to code). Rerun of the same run completed **success**.
- Live checks (all BD datetimes render):
  - `/news` → short BD labels (`২৩ সেপ্টেম্বর · …`)
  - article `national-453` byline → `২৩ সেপ্টেম্বর, ২০২৬ · ৯:৩৫ PM`; related digits + 3 thumbs
  - `/tracked` → rows with thumb + BD datetime
  - `/ghotona/iran-israel-war-2026` → 5 chrono rows with thumbs + BD datetime
  - `/factcheck` → `২০ সেপ্টেম্বর, ২০২৬ · ৬:০০ AM`
  - `/corrections` → no corrected posts today → empty-state (code in place)
- `/corrections.astro` keeps `formatDate` import? No — cleaned: imported `formatDateTimeBD`
  only; `factcheck.astro` still uses `formatDate` for the "যাচাই:" verified-date label (kept).

## Notes
- All posts are normalized with `ts` (ms) via `normalizePost`; only article page's local `post`
  and ghotona's local `allEntries` needed `ts` added manually.
- Distinction: `formatDateTimeBD` (full date + time, e.g. article byline/factcheck/corrections)
  vs `formatDateTimeBDShort` (year omitted when current year, e.g. compact rows/cards).