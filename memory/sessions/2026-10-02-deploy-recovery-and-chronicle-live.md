# 2026-10-02 — Deploy recovery, then the chronicle verified live

## Why this session happened
Asked to recheck the live site after finishing the ghotona chronicle work. The live
site had **not** been updated since 15:54 — `main` carried the chronicle plus fixes
that had never reached production. Every build after 15:54 had failed.

## What was actually wrong (four separate faults)

1. **Pagefind import (mine to find).** `search.astro` did
   `await import("/pagefind/pagefind.js")`, but `site/scripts/search-index.mjs`
   writes the index into `dist/` **after** `astro build` exits → hard
   `UNRESOLVED_IMPORT` → build dies. Fixed with `/* @vite-ignore */`.

2. **A Bengali date in a `datetime` attribute (mine to find).** `/article/economy-140`
   threw `RangeError: Invalid time value`. `post.updated` is built with
   `formatDate(...)`, i.e. the Bengali string `"২৪ সেপ্টেম্বর, ২০২৬"`, and it was fed to
   an `isoDate()` helper that calls `Date#toISOString`. `new Date()` cannot parse it.
   The guard was also comparing that Bengali string to an ISO date, so it was always
   true. Fixed at source: the block uses the real `Date`, and `isoDate` became a
   shared exported `toIsoDateTime` that returns `undefined` instead of throwing.

3. **The build had gone quadratic — the reason nothing landed.** Last good build:
   **53 seconds**. Later builds: ~10s per page × ~584 pages.
   - `relatedPosts()` called `eventsForPost()` inside its sort comparator, including
     `eventsForPost(post)` once per comparison → ~10,000 event scans per article page
     over all 83 events. Now computed once per candidate and memoised; ranking
     provably identical.
   - `getCollection()` re-parsed all 584 markdown files (~2.4s) on every call from
     per-page code. Added `newsEntries()`, memoised **for production builds only**;
     dev deliberately uncached so a new article needs no restart.

4. **The deploy queue (operational).** 10 builds queued behind one stuck `BUILDING`
   for over an hour on the slow code. `deploy.yml` uses
   `concurrency: cancel-in-progress: true`, so a later push cancelled the run before
   it created any Vercel deployment — the fixed commit had **no deployment at all**.
   Cancelled the stale queued build and the stuck one (commits all still in git, live
   untouched) and dispatched `deploy.yml` explicitly.

## Commits (all pushed to main)
- `9f669446` Pagefind `@vite-ignore`
- `32bb4693` date fix + hardened `toIsoDateTime`
- `dddf4916` perf: memoised `relatedPosts` scoring and `newsEntries()`

## Verified live on `ff4de5e`
- All three `active` events render sourced, dated chronology:
  `iran-israel-war-2026` 2, `dengue-outbreak-season` 8, `nct-lease-story` 4.
  Entry count == "আমাদের প্রতিবেদনটি পড়ুন" link count == `সূত্র:` source-anchor
  count for all three.
- `economy-140`: প্রকাশিত + হালনাগাদ both render, 4 valid ISO `datetime`
  attributes, **0** Bengali strings inside a `datetime`.
- Pagefind assets live: `pagefind.js` 200, `pagefind-entry.json` 200.
- Chronology does not leak into `/news` or `rss.xml` (50 RSS items).
- 21-route sweep: all 200 (`/`, `/news`, `/ghotona`, `/search`, `/districts`,
  `/factcheck`, `/corrections`, `/editorial-policy`, `/about`, `/privacy`,
  `/contact`, `/kivabe-jachai-kori`, `/jachaier-poddhoti`, `/rss.xml`,
  `/sitemap.xml`, `/news-sitemap.xml`, `/sitemap-images.xml`, `/robots.txt`,
  `/tags/dhaka`, `/authors/desk`, `/article/national-1224`, `/article/economy-140`).

## Regression gates added
- `pipeline/test/build-cost.test.mjs` (3 tests): no `eventsForPost` in the
  comparator; caches exist and stay off in dev; no per-page template reads the
  collection directly.
- `pipeline/test/article-layout.test.mjs`: the throwing local `isoDate` cannot
  return, and হালনাগাদ must take its datetime from a real Date.
- Suite **472/472**.

## Lessons
- **A green push is not a green deploy.** After pushing a fix, confirm a Vercel
  deployment actually exists for that SHA; `cancel-in-progress` can mean none does.
- **A formatting helper must never be able to take a build down.**
- Compare build duration against the last known-good build before assuming a
  performance regression is environmental — the 53s baseline is what exposed this.

## Still open (pre-existing)
- `Lighthouse` fails every run — `lighthouserc.json` demands `minScore: 1`.
- `health.yml` mixes ESM `import` with `require('fs')` → `require is not defined`
  on every run; its 36-hour mtime check cannot work after a fresh checkout.
- `facebook.yml` runs every 20 min but has no `FACEBOOK_PAGE_ID`/
  `FACEBOOK_PAGE_TOKEN`, and `facebook_post.mjs` exits `0` on missing secrets and
  on send failure — reports success, posts nothing.
