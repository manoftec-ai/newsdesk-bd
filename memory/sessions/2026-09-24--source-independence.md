# Session 2026-09-24 — P0-4: Source independence COMPLETE

## What changed
- NEW `pipeline/lib/lineage.mjs` (additive-only, no cluster-badge change):
  - `groupKey(sourceId, lineage)`: independence group = `ownership_group` →
    `wire_origin` → `syndication_group` → source_id. Two outlets on one wire
    collapse to ONE independent group.
  - `groupEvidence(evidence, lineage)` → `{ groups, independentCount, officialCount }`.
  - `loadLineage()` reads `lineage` block from `config/trust.json`; unknown
    sources default to their own group (safe — no over-optimism).
- `claim-verify.mjs`: now counts `support_independent_groups` (evidence groups)
  instead of raw distinct-source URL count; official detection accepts lineage
  `source_type` (official/agency) OR legacy trust.json reputation.
- `config/trust.json`: added `lineage` block labelling all 20 sources
  (bbc/voa wire origins; major/minor news; official reserved).
- NEW `pipeline/test/lineage.test.mjs` — 4 tests (wire-collapse, same-ownership,
  safe-default, mixed).

## Tests
- lineage 4/4 + claim-verify 6/6 pass; full suite 45/45 (was 41).
- Live: extract repopulated claims, `verify_claims.mjs` → 206 claims:
  52 VERIFIED / 154 SINGLE_SOURCE (none of our sources share wire/ownership yet,
  so groups == distinct sources — the honest correct default).

## Notes / lessons
- Verification changes must stay ADDITIVE; upleveling badge semantics (e.g.
  "confirm only when ≥2 groups AND official") belongs to the later
  "Structured fact types + Verification Strength" task so we never break the
  running site mid-flight.
- Duplicate-export bug (applyClaimVerification declared twice) caught by
  node --test immediately; removed old export.
- store.db was rolled back to HEAD last session (claims empty) → reran extract
  to repopulate; parallel auto-workers regenerate it constantly.
MD