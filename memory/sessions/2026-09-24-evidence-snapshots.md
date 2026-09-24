# Session: P1 evidence snapshots — source fingerprints + age-weighted verification (D69)

Date: 2026-09-24

## What was done
- Continued the P1 depth queue (after D68 temporal truth ledger). Next item:
  **evidence snapshots** — "what sources, at what dates" backed each verification
  state.
- **Evidence fingerprint in the ledger:** `claim_snapshots` gains
  `evidence_hash` (deterministic sha256 of the sorted supporting
  source/url/published_at set; contradicts excluded), `evidence_count`, and
  `oldest_evidence_at`. `recordSnapshot()` now treats an observation as
  (status, confidence, evidence set): a re-verify that sees a CHANGED evidence
  set opens a new period EVEN when the verdict text is identical → evidence
  drift is now auditable end-to-end.
- **Migration:** the raced committed store.db may already carry a pre-evidence
  `claim_snapshots`; added `ensureColumn()` (PRAGMA table_info + ALTER) called
  from openDb — idempotent, verified against a simulated old-shape table.
- **Age-weighted honesty:** `verifyClaim` returns `evidence_age`
  {max_days, oldest_evidence_at, fresh, stale} + `evidence_hash`. When a
  VERIFIED/OFFICIAL claim is supported ONLY by stale rows (all > 90 days,
  nothing fresh) confidence is trimmed ×0.75 — a soft signal, NO hard status
  change, so the history archive (legitimately old citations) still verifies.
  New helpers: `evidenceAgeDays`, `evidenceHash`, `evidenceAgeProfile`.

## Tests
- claim-verify.test.mjs +3: hash order-insensitivity + changes on evidence
  change + contradicts excluded; stale-only trims confidence (same status);
  age profile exposes max_days/oldest/hash.
- temporal-truth.test.mjs +1: identical status+confidence but a SECOND source →
  new period opens (drift), hash differs across periods.
- Suite 129 → **133/133 pass**.

## Gotchas
- **TODO.md became TRACKED** (worker/earlier commit landed it) → my local edits
  were now an unstaged tracked change that BLOCKED rebase. Committed the TODO
  updates as their own commit, then rebase was clean. (Earlier rule "never stage
  TODO.md" is now superseded — it is a committed repo file; still keep artifact
  junk out.)
- Rebase needed again (worker pushed 4 commits: auto fetch/verify/extract +
  todos); standard fetch→rebase→push, ended SYNCED.

## Commits / deploy
- Code+test `94eac83` → rebased + pushed `15d3f55`.
- Todo commit `6042773` (rebase-cleanup).
- Memory (D69) commit follows.

## Next steps (P1 depth queue)
- event graph (temporal claims → per-story verified timeline surfaced via
  claimStatusAt feeder),
- source health / Why-This-Badge reader view / versioning / search / entity
  pages — awaiting user direction (distribution still parked per D64 triage).