# Session 2026-09-24 — D70: Source health (data-driven per-source reliability profile)

## Context
Continuing the P1 depth queue. Temporal truth (D68) and evidence snapshots (D69)
done. Chose "source health" as the next item: trust.json reputation says what a
source IS statically; we need to derive how a source HAS BEHAVED from the live
claim/evidence/snapshot ledger.

## What changed
- `pipeline/lib/source-health.mjs`: `deriveSourceHealth({evidence, transitions,
  current, lineage, trust, asOfMs})` (pure) + `loadSourceHealth(db)` (DB wrapper,
  read-only).
  - metrics per source: claims_supported, conflict_affected (+share), stale_share
    (evidence rows >= 90 days), independent (own lineage group vs wire), reputation
    (passthrough from trust.json).
  - score = 100 − conflictShare×45 − staleShare×25 − (syndicated)×10, clamped 0..100.
  - label healthy(≥80) / mixed(≥50) / flagged, with HARD flag at conflictShare ≥ 0.5
    (half or more of a source's supported claims conflict-prone → flagged regardless).
- `pipeline/tools/source_health.mjs`: prints the table + flagged set; `--json`,
  `--min-evidence=N`; exports `renderHealth`/`flaggedSources` for reuse.
- `.github/workflows/pipeline.yml`: informational CI step "Source health" after the
  conflict detector.
- `pipeline/test/source-health.test.mjs`: +6 tests (healthy; conflict-ridden →
  flagged, conflicts counted once per claim despite 2 transitions; fully-conflicted
  score < 80 + flagged; stale+wire penalties; contradicts-excluded; DB integration).

## Verification
- Full suite: 152/152 (incl. parallel-worker-added editorial-gate/sufficiency/
  scheduler/watcher test files — NOT mine).
- Live read-only run: 16 sources profiled, 0 flagged (honest — no conflicts in the
  synthetic corpus yet).
- store.db mutated by openDb migrations on run → restored via `git checkout --` after.

## Outcomes
- Commit `48ab149` (lib + tool + test + pipeline.yml + CI step), rebased + pushed,
  SYNCED.
- Memory D70: MEMORY.md row appended, MEMORY.json sessionsCount 46→47 + D70 decision
  + `p0Progress["P1-source-health"]="done"`.
- This session log written.

## Known problems / notes
- Store.db remains a raced committed binary owned by the GH worker — always restore
  HEAD after ANY tool run here.
- Source-health is advisory only: trust.json untouched; auto-tuning trusts remains a
  future step and should stay opt-in.

## Next step
Commit memory (MEMORY.md + MEMORY.json + this log). Then continue the P1 depth queue:
event graph → versioning → search → entity pages → Why-This-Badge reader view
(distribution/PARKED items only on explicit user activation).