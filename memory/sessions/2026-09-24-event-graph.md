# Session 2026-09-24 — D72: Story event graph

## Context
Continuing the P1 depth queue: temporal truth (D68), evidence snapshots (D69),
source health (D70) done. Chose "event graph" next — a per-story chronological
"কীভাবে উন্মোচিত হলো" timeline + related stories, reader-facing on the site.

## What changed
- `pipeline/lib/event-graph.mjs` (read-only, deterministic):
  - `deriveTimeline({claims,evidence,snapshots,conflicts})` — merges claim
    appeared / source evidence added / verification state change / structured
    conflict into ONE chronological timeline. Verify events dedupe unchanged
    snapshot periods (idempotent re-verify reuse of open period) so the chain
    shows real events only.
  - `storyTimeline(db, clusterId)` + `storyMeta(db, clusterId)` DB bindings.
  - `relatedStories(db, clusterId)` — cross-story edges by SHARED ACTORS
    (actors_claims) AND shared evidence sources (>=2 outlets covering both
    stories). Deterministic ordering: actor_links desc, then source_links.
- `pipeline/tools/event_graph.mjs`:
  - builds graph for every published story with a claims graph (briefs →
    clusterId via STATE/briefs/*.json), DIFF-WRITES `site/src/data/event-graph.json`
    (byte-compare → skip if unchanged; keeps pipeline commit noise at zero).
  - related items carry the target story SLUG via a cluster_id→slug index
    inverted from the briefs (deep-linkable on the site).
  - CLI: `--json`, `--slug=SLUG`, `--min-events=N`. CI step added after source health.
- Site:
  - `site/src/components/StoryTimeline.astro` — static "কীভাবে উন্মোচিত হলো"
    vertical timeline (colored dots per kind, Bengali status/kind labels,
    source chips, per-claim text, related-stories aside "সম্পর্কিত খবর").
  - `site/src/lib/graph.js` — storyGraph(slug)/slugForCluster/hasStoryGraph/
    latestVerifyStatus/graphSpan + KIND_LABELS (NFC-safe, no payload drift).
  - `site/src/pages/article/[slug].astro` — renders <StoryTimeline> after
    UpdateHistory. IMPORTANT: staged ONLY my import+render hunks (surgical:
    reverted file to HEAD, applied my edits, staged, then restored the worker's
    combined working-tree copy so its evidence-panel WIP stays unstaged).
- `site/src/data/event-graph.json` regenerated: 349 stories, 64 with events,
  related deep-links present.

## Verification
- Pipeline tests: event-graph 6/6 (merge order, verify dedupe, ts-less drop +
  stable sort, reader labels, empty cluster, >=2 shared-source edge). My files:
  152/152. Full suite 158: sufficiency 1 FAIL is WORKER-WIP-caused
  (editorial.mjs now returns "breaking"; committed sufficiency test expects
  "developing") — NOT my change (confirmed: passes on clean HEAD).
- Site full build CANNOT run locally: `@astrojs/markdown-satteri` needs a
  platform-specific native binding absent on android-arm64 (pre-existing, whole
  site, not my code). Component validated via careful single-edit hunks +
  index diff review instead.
- Live graph output sane: national-252 560 events/22 claims/6 related etc.

## Outcomes
- Commits: `7af764a` (engine+data+CI) and `229792f` (site rendering) both
  pushed, SYNCED. Rebase used `--autostash` (worker WIP in tree blocks plain
  rebase); autostash applied cleanly, WIP preserved.
- Memory D72: MEMORY.json sessionsCount 47→48 + D72 decision +
  p0Progress["P1-event-graph"]="done". (Worker had taken D71 = desktop layout
  note.) Session log written.
- Worker WIP still on disk, unstaged, untouched: audit/editorial/synth mjs +
  audit/sufficiency tests + article/[slug].astro (evidence panel) + Icon.astro/
  news-data.js/index.astro/styles.css.

## Confirmations / notes
- `email`-style planning worked: no stray bash output, no write tool corruption.
- `event-graph.json` (4MB) is fine as a committed site data blob (matches
  events.json pattern) but only stories WITH events are included in render;
  the file also contains stories with 0 events (min-events default 0).

## Next step
Commit memory (MEMORY.md + MEMORY.json + this log). Then continue P1 depth
queue: versioning → search → entity pages → Why-This-Badge (distribution/PARKED
items only on explicit user activation).