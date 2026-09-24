# Session: P1 temporal truth — claim verification ledger (D68)

Date: 2026-09-24

## What was done
- User directive: continue the P0/P1 roadmap depth items (the N2–N6 editorial
  deploy batch was already green). All P0 engine items (D56–D65) were done.
- **Temporal truth — the claim-level "as-of" ledger.** New `claim_snapshots`
  table. Every claim verification state is now a TIME RANGE:
  `valid_from`/`valid_until` (NULL `valid_until` = the current open period).
  Append-only: a status/confidence change NEVER mutates history — it closes the
  open row (`valid_until = now`) and opens a fresh one.
- `recordSnapshot(db, claimId, verdict, {reason, now})`:
  - first record → opens the initial period (reason 'initial' or 'verify')
  - re-verify with SAME status+confidence → idempotent, open period keeps
    running, no new row
  - change → close old + open new (with the caller's reason, e.g. 'conflict')
- `applyClaimVerification()` now stamps `claims.updated_at` with the RUN time
  and writes a snapshot for every re-check (fixed: it previously passed the
  claim row's stale `updated_at` as the snapshot timestamp — the SELECT didn't
  even contain `updated_at`, so it silently fell back to wall-clock, which was
  correct but accidental; now explicit).
- Query helpers in claim-verify.mjs: `claimStatusAt(db, claimId, at)` (as-of
  resolution — inclusive valid_from, exclusive valid_until), `claimTimeline()`
  (full ordered ledger), `claimTransitions()` (consecutive from→to changes).
- **reverify R5 (flip-flop / durability trigger):** `detectCorrections()`
  accepts a `timelines` map; a claim that went bad→good (status turned
  CONFLICTING then recovered) is a trust signal and produces a dated correction
  note (দোদুল্যমান) even when the current green state shows no reversal.
  `reverify_stories.mjs` builds the map per claim via `claimTransitions`.
- Schema uses `CREATE TABLE IF NOT EXISTS` → idempotent against the raced
  committed store.db; the ledger self-backfills on the next pipeline extract.

## Tests
- temporal-truth.test.mjs (7): first-record opens initial period; same-status
  re-verify = no new row; status change closes open + opens fresh (ranges
  asserted); claimStatusAt resolves status valid on a given date incl. open
  period; transitions lists consecutive from→to; null for no-snapshots; and
  applyClaimVerification advances updated_at + dates snapshots with the RUN time
  (SINGLE_SOURCE→OFFICIAL over two runs).
- reverify.test.mjs (2 new): R5 fires when a claim flip-flopped (CONFLICTING
  then recovered); no R5 note on a stable monotonic timeline.
- Full suite 120 → **129/129 pass**.

## Gotchas
- **D67 collision:** the parallel worker already owned decision "D67" (deploy
  YAML fix) — this item renumbered D67→D68 in MEMORY.md + MEMORY.json after the
  worker's commit landed.
- **Raced store.db:** local live backfill wrote 222 claim snapshots to the local
  DB, but the shared binary is worker-owned — restored `git checkout
  -- pipeline/state/store.db` and left it out of the commit. Also had to clear
  3 leftover/duplicate stashes (superseded copies of already-committed extract
  claim-wiring) from an earlier rebase cycle; branch ended exactly == origin.

## Commits / deploy
- Code+test commit `f19ea21` pushed; memory commit follows (MEMORY.md D68 row,
  MEMORY.json D68 + sessionsCount, session log, TODO.md local note).

## Next steps (roadmap depth queue)
- Evidence snapshots (dated evidence per claim — what each source said WHEN),
- event graph (temporal claims → per-story verified timeline surfaced to reader
  as "as-of" stamps via claimStatusAt feeder),
- source health, Why-This-Badge reader view, versioning, search, entity pages — 
  all still parked/pending per D64 triage; user picks continue depth or shift to
  distribution.