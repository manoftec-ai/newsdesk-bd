# Why the site stopped publishing — enrichment was spending fetches in the wrong place

Date: 2026-09-27 18:30 +06:00
Fix commit: `66fb05b` (carried on `origin/main`; the commit message is a concurrent
session's — see "Concurrency hazard" below, my files were swept into another session's commit)

## The symptom

The site looked frozen. Newest live article `national-592`, dated 2026-09-25T20:06Z —
~46 hours stale. Nothing wrong with GitHub, the deploy path, or the site: the live site
was HTTP 200 and deploying 38x/day.

Running the picker locally against the real corpus:

```
evidence gate:  217 briefs under 100 words of source material, skipped
coherence gate:  19 briefs whose members are not all about the same event, skipped
                 263 title-duplicates filtered
pick: 1/1 pending briefs -> national-92   (dated 2026-09-19, eight days old)
```

579 briefs: 278 already had articles, 301 orphaned, **1 publishable**.

## Root cause: two independent defects, both about the same thing

The publication floor is `DEFAULT_MIN_PUBLISH_WORDS = 150` (`lib/editorial.mjs`). Nothing
below it can ever be published. The evidence gate was correctly refusing to write stories
from nothing. The problem was that nothing was arriving.

### 1. `needsBodyEnrichment` asked the wrong question

The trigger was a character heuristic:

```js
body.length <= 40 || body.length < title.length + 20
```

That only catches a body that *is* the headline. A genuine RSS summary of 200-250 chars
(18-37 words) passes it and is left alone — and then dies at the 150-word gate.

Measured on `bbc-bengali`, 2026-09-27: all 14 items sat at 18-37 words, `needsBodyEnrichment`
returned false for every one, none were enriched, and all 14 were then unpublishable.

Now:

```js
if (body.length <= 40) return true;
return bodyWordCount(body) < DEFAULT_MIN_PUBLISH_WORDS;
```

The question is not "is this the headline?" but "can this body ever be published?"

### 2. The per-source enrichment budget was flat

`RSS_ENRICH_MAX = 6` for every source. So the budget starved the sources that work while
still paying full price for sources that cannot return text. A fresh
`measure_source_yield.mjs` run found:

- **3 sources 403-blocked by Cloudflare:** jamuna, jugantor, kalerkantho
- **6 sources HTTP 200 with no extractable text:** ittefaq, samakal, deshrupantor,
  daily-observer, voa-bangla, dainikazadi
- **12 sources genuinely usable,** returning 134-973 words

9 of 25 sources were spending 6 page fetches each per run to produce nothing, while the
12 usable sources were held to the same 6. Also: all three `enrichThinBodies` call sites
are now budget-aware — the gnews path previously always used the flat `ENRICH_MAX = 10`,
so blocked gnews sources were paying full price there too.

The budget now reads measured yield from `config/source-yield.json`:

| measured | budget |
|---|---|
| usable (>=100 words) | 24 |
| marginal (40-99) | 6 |
| hollow / blocked | **0** |
| unmeasured | 6 (old behaviour) |

Re-measure with `node tools/measure_source_yield.mjs --write` before touching that file.

## Verified

| source | before | after |
|---|---|---|
| bbc-bengali | 0/14 publishable, 18-37 words | **14/14 publishable, 328-983 words**, 12s |
| voa-bangla | 6 wasted fetches/run | 0 fetches |
| dainikazadi | 6 wasted fetches/run | 0 fetches |

Baseline for comparison, from the committed `store.db` (which predates the fix): only
**13%** of the last 400 inserted items cleared 150 words.

345/345 tests pass. `test/fetch-enrich.test.mjs` was updated to the new contract — the old
assertion encoded the bug, calling a 38-word body "a real body". It now asserts that a
30-word RSS summary *must* trigger enrichment.

## Why option 1 (add full-text sources) was the wrong fix

The brief was to add sources that carry article text. Measured yield showed the existing
12 usable sources already return 134-973 words. Adding feeds would not have helped,
because the fetcher was refusing to scrape the bodies it was already being handed. The
scraper existed and worked; it was being called on 6 items per source and skipped on the
rest. Adding sources would have added more thin items into an already-starved enrichment
budget.

## Concurrency hazard — unresolved, and it destroyed work once

**Three opencode sessions are running against this one working tree** (PIDs 6547, 16119,
23491). They are not coordinated. During this session another one:

- committed my staged `fetch.mjs` + `source-yield.json` into its own commit
  (`66fb05b`, message "homepage audit: the lead card printed its date as raw ISO"), so my
  commit message was lost
- wiped my uncommitted work once via a stash; it was recovered from `stash@{0}`
- swept in `site/` and `test/article-layout.test.mjs` edits of its own

`stash@{0}`, `stash@{1}` and `stash@{2}` currently hold other sessions' work, not mine.

**Do not run two agents in this repo without worktrees or a lock.** One `git checkout` /
`git stash` from any of them destroys whatever the others have in flight.

## Follow-ups not done

- `bbc-bengali` and `bbc-bengali-com` share the identical feed URL
  (`feeds.bbci.co.uk/bengali/rss.xml`), so that feed is fetched twice per run.
- `banglatribune` measures 134 words — under the 150 floor, so it can never publish.
  Re-measure; it may have improved or may need dropping.
- 301 briefs remain orphaned from before the fix. They have thin stored bodies and will
  not retroactively enrich — only newly fetched items benefit. Expect the backlog to
  drain slowly as fresh items replace them.
- The `heartbeat.yml` deploy treadmill (38 deploys/day, dispatching deploy.yml even when
  auto-author published nothing) is untouched and still burns the 100/day quota.
