# 2026-09-20 — Living Story: increment 4 Daily Watcher built (D36 complete)

## User request
"ok..build" — build the pending Daily Watcher increment of the Living Story Tracker:
find new developments on tracked stories (Google News RSS) and update the stories.

## What was built
1. **`pipeline/tools/tracked_watcher.mjs`** (new, zero-LLM honest watcher):
   - Per tracked story (registry `status: tracked`): builds Google News RSS search
     (`news.google.com/rss/search`, hl=bn, gl=BD, ceid=BD:bn) from fingerprint keywords+entities
     (combined query + individual fallbacks, ≤3).
   - Filters: new only (items after `lastItem`/`lastChecked`), relevant only (fingerprint term
     match via `relevanceScore`), dedupe by link/decoded URL.
   - On match: appends `updates[]` entries to the article frontmatter (rendered as "আপডেট
     ইতিহাস"; label "ওয়াচার আপডেট"), sets `updated` (latest item date) + `lastChecked`,
     and bumps registry `lastChecked`/`nextCheck`/`lastItem`, `lastUpdate` (if any).
   - Honest attribution rule kept (no fabrication): each update = `«Headline» — Source`
     straight from the outlet's own Google News item, plus item snippet (≤180 chars); source
     real URL recovered via `decodeGoogleNewsUrl` (Google redirect token base64 decode).
   - Simple surgical frontmatter editing → diffs stay tiny (verified: 1-line change + updates
     block only); validated by re-parsing before write. `--dry-run` mode; `--limit=N`.
   - Import-safe: main loop runs only when executed directly (unit tests import helpers,
     no side effects).
2. **`pipeline/test/watcher.test.mjs`** — 3 unit tests (title-source stripping, Google URL
   decode fallback, relevance scoring). `npm test`: 13/13 pass.
3. **`.github/workflows/watcher.yml`** (new) — daily cron `0 2 * * *` (08:00 BD) + manual;
   npm ci → run watcher → collect modified slugs → commit/push (rebase pattern) →
   IndexNow poke for updated story URLs. Zero VPS, zero cost.
4. **`.github/workflows/deploy.yml`** — added `watcher` to `workflow_run` list so watcher
   content commits auto-deploy to Vercel.

## Verification
- Local real run 2026-09-20: seeds lastChecked=20:00Z → no new items yet; both tracked
  articles' `lastChecked` bumped to run time, registry advanced (`lastItem` 20:00Z,
  nextCheck +1 day). Scratch-copy test of `writeStoryUpdate` confirmed the **append-updates
  path** writes valid frontmatter with a minimal diff (updated + updates block only).
- Manual GH Actions dispatch triggered (`204`); runner will execute on GitHub → Vercel deploy
  via workflow_run.

## Notes
- `rss-parser` + `yaml` already in pipeline deps (no new package).
- Malicious-parse guard: edited frontmatter re-parsed before write; throws if mismatch.
- images.yml may race watcher commits on push (both use pull --rebase) — fine.
- Register more living stories later (e.g. "অপ্রতিম" Comilla storyline) — batch proposal
  still open.

## Git
- Commits: `382f024` (code+workflow) → pushed to main. Vercel + GH reads at HEAD.