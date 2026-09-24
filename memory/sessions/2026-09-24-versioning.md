# Session 2026-09-24 — D74: Versioning (per-claim ledger on site)

## Context
Continued P1 depth queue after D72 event graph (SYNCED). Versioning = the
D68/D69 append-only claim snapshot ledger, surfaced on the site per claim so
readers see EVERY state a claim ever held, when, and why — nothing silently
erased. Worker had meanwhile committed D73 (editorial gates `7963e7b`) plus
auto-pipeline runs `b35d571`/`8c2a14d` that also regenerated event-graph.json.

## What changed
- `pipeline/lib/event-graph.mjs` — new read-only `storyVersions(db, clusterId)`:
  full snapshot ledger per claim via `claimTimeline`, mapped to
  {status, confidence, support_count, contradiction_count, evidence_count,
  evidence_hash, valid_from, valid_until (null = current open), reason}.
- `pipeline/tools/event_graph.mjs` — emits `versions[]` per story (diff-write,
  no noise).
- `site/src/components/StoryTimeline.astro` — new collapsible per-claim
  "সংস্করণ ইতিহাস": latest-state badge; each period = status badge(--verified/
  --confirmed/--partial/--suspect reusing existing classes, NO new CSS) + date
  range + reasonLabel chip + counts line. Render gate widened to
  showTimeline || showVersions.
- `site/src/lib/graph.js` — new `reasonLabel(reason)`:
  verify→যাচাই, re-verify→পুনর্যালোচনা, conflict→দ্বন্দ্ব রেকর্ড,
  initial→প্রাথমিক যাচাই.
- Wired via the EXISTING StoryTimeline mount in article/[slug].astro (worker
  D73 WIP untouched this time — no surgical staging needed).
- tests: +2 event-graph ledger tests (period ordering, open/closed valid_until,
  reason passthrough, empty cluster) test/event-graph.test.mjs:8.

## Conflict handling (IMPORTANT lesson)
Worker's b35d571 pipeline run regenerated `site/src/data/event-graph.json`
WITHOUT versions while my local copy had versions → autostash rebase left the
file `UU` conflicted. Resolved NOT by hand-merging the 4.6MB blob but by
`git checkout HEAD -- site/src/data/event-graph.json` then REGENERATE the
merged file with my updated tool (merged DB is authoritative; the generator
owns the file). Final: 349 stories, 65 with events AND versions.

## Verification
- event-graph tests 8/8; FULL merged suite 166/166 (worker D73 files included;
  earlier sufficiency mismatch resolved by worker's own commit).
- Data sanity: all 65 eventful stories carry versions; national-252 claim0 = 6
  periods.
- Site build still not runnable in Termux (satteri android-arm64 binding) —
  component validated by careful single-edit hunks + index-diff review.
- node tool+deps `node --check` clean; regenerated JSON parsed.

## Outcomes
- Commit `84b5196` (6 files) → rebased over worker's `8c2a14d..7963e7b` →
  final `ad9386e` pushed; `HEAD == origin/main` SYNCED. Working tree clean.
- Cleaned untracked agent debris (`._*.json`, `.dpl.json`, `.rev.json`, `.tmp/`,
  `pipeline/lib/*.bak*`, `extract.mjs.bak*`) left by earlier debugging.
- Memory: MEMORY.json updated (sessionsCount 48→49, D74 decision,
  p0Progress["P1-versioning"]="done"); MEMORY.md D74 row; this session log.

## Next
Commit memory (MEMORY.md + MEMORY.json + this log), rebase autostash, push,
verify SYNCED. Then continue P1 depth queue: **search** → entity pages →
Why-This-Badge UI (distribution items stay parked until user activation).
Next free decision id: D75 after D74 (check MEMORY.json first — worker D73
already used).