# Session: P0-10 structured contradiction detection (D65)

Date: 2026-09-24

## What was done
- Completed and shipped **D65 / P0-10 — structured contradiction detection**, the
  last open P0 automation gap.
- **`pipeline/lib/conflict-detect.mjs`** (new): deterministic NFC-safe detectors
  - `extractAmounts(text)` → `{value, scale, unit}` (Bangla+Latin digits, scale
    units লাখ/কোটি/হাজার/শত/টাকা/জন/ভর্তি/ডোজ/শতাংশ/দিন/মাস/মৃত্যু)
  - `quantityGap(a,b)` — SAME-UNIT-only relative gap; different denominators
    (লাখ vs কোটি) → null
  - `polarityConflict(a,b)` — same act grounded on both sides (shared anchor:
    সমর্থন|স্বাগত জানিয়ে|স্বীকার|মেনে নিয়েছে) with one negated → `{field, values}`
  - `DEFAULT_MIN_REL = 0.25`
- **`pipeline/tools/detect_conflicts.mjs`** (new): scans claims per cluster,
  quantity via CLAIM-TEXT-ONLY amounts (value≥10) + polarity on
  claim+evidence; upserts `conflicts` rows idempotently.
- **Wiring (no new work needed — the engine already consumed conflicts):**
  `claim-verify.mjs:39/92` counts unresolved conflicts → CONTRADICTIONS →
  CONFLICTING verdict; `reverify.mjs:54` trigger R3 flags stories on
  unresolved CONFLICTING claims. Loop now fully closed end-to-end.
- CI: pipeline.yml informational step "Contradiction detector" after actor
  registry.
- Tests: `test/conflict-detect.test.mjs` (5) → **suite 111/111 pass**.

## Key decision during the work
- Quantity scan restricted to claim text (not evidence excerpts) + value floor
  10: per-pair evidence comparison cross-multiplied DISTINCT metrics (e.g. 2
  deaths vs 232 admissions in the same cluster) → 76 false conflicts. After the
  fix: 0/0 on the synthetic corpus — honest (same-cluster claims carry
  identical figures; real divergences like 12-vs-200 are proven by unit tests).

## Commits / deploy
- `379b266` P0-10 structured contradiction detection (pushed after rebase → gh `6e36756`)
- Parallel workers landed `d6abf26`, `da18b7f`, `0da8670` (D64 ROI triage + auto pipeline run) — resolved via stash/rebase/pop.

## Notes / state
- store.db untouched by this change (0 conflicts rows written on the synthetic corpus).
- Worker's `site/src/content/news/history-atomic-bombings-1945.md` edit left unstaged (their WIP).
- `.tmp/`, `._*.json`, `.bak*` remain untracked.