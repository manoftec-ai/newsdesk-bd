# Session: P0-7 Correction engine + automatic re-verification (2026-09-24)

## What we did
Built the **corrections + automatic re-verification engine** (todo item P0-7), completing
the evidence-first trio: source independence (P0-4) → AI auditor (P0-5) → headline verification
(P0-6) → **auto-corrections (P0-7)**.

## Files
- **NEW `pipeline/lib/reverify.mjs`** — reuses `setKey`/`appendUpdates`/`parseYaml`:
  - `BADGE_RANK` (suspect<partial<verified<confirmed) + `badgeDropped()` (only DOWN-grades trigger).
  - `detectCorrections({front, verdict, claims, headlineStatus})` — 4 deterministic triggers:
    R1 verdict.status != 'passed' (বাংলা: "যাচাই-অবস্থা আর পাস নয়"), R2 badge rank drop, R3 any
    CONFLICTING claim (with contradiction_count>0), R4 headline now `overclaim`.
  - `applyCorrection({mdPath, notes})` — STRICTLY additive frontmatter surgery: sets
    `corrected: true`, `updated` (now), `correctionNote` (first fresh note, bn), appends
    `updates[] {date,note,label:'সংশোধন'}`. Body + headline NEVER touched. Validates the edited
    YAML with a real parse before writing. **Idempotent** — a note already in `updates[]` is
    never re-appended (returns `changed:false`, zero file churn).
- **NEW `pipeline/tools/reverify_stories.mjs`** — maps each published story → its cluster via the
  brief's `clusterId`, reads LIVE verdict + claims + headline re-check, and applies corrections.
  Flags: `--dry-run`, `--max=N`, `--slug=S`. Freshness guard: `REVERIFY_STALE_HOURS` (default 26)
  — a verdict older than that is skipped as "stale"; the tool NEVER judges on stale evidence.
- **NEW `pipeline/test/reverify.test.mjs`** — 6 tests (badge rank, R1–R4, write+validate, idempotency).
- **`.github/workflows/pipeline.yml`** — added a "Corrections + auto re-verification" step right
  after extract; corrections auto-commit in the same run (no workflow for a human ever).

## Key findings / decisions
- **store.db is SHARED + RACED by GH workers** → the local copy can be half-rebuilt: verdicts
  present but `claims` table EMPTY (0 claims vs 932 noted earlier). Any re-verification must gate
  on verdict `evaluated_at` freshness; that's why the freshness guard exists. Lesson recorded in D60.
- Dry-run scale on live site data (fresh 6h DB): 459 published md checked → 14 would-correct
  (all R1 — cluster verdict no longer `passed`) → 125 skipped (historical/demo stories have no
  brief/clusterId → no claims graph → deliberately skipped as un-judgable).
- Reused `tracked_watcher.mjs` helpers (`setKey`, `appendUpdates`) — no duplicated surgery code.

## Verification
- Full suite: **72/72 tests pass** (`node --test test/*.test.mjs`).
- Tool dry-runs work against the live DB (correctly flags only fresh-evidence reversals; stale skip).

## Next
- Commit + push (leave TODO.md + parallel-worker artifact files untouched).
- P0-8 onward (Golden Test Dataset, Hybrid clustering, Entity resolution, …).