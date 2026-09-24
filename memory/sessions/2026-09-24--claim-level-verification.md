# Session 2026-09-24 — P0-3: Claim-level verification COMPLETE

## What changed
- NEW `pipeline/lib/claim-verify.mjs` (deterministic, automation-only):
  - `verifyClaim(claimText, {evidence, conflicts, trust})` — assigns one of
    OFFICIAL / VERIFIED / CORROBORATED / SINGLE_SOURCE / CONFLICTING / UNCONFIRMED
    (REFUTED / OUTDATED reserved for temporal/typed work later).
  - Rules: independent sources (distinct source_id), official/agency evidence,
    unresolved conflicts dominate; confidence = support-signal strength (NOT a
    truth probability), penalized 0.4x on conflict.
  - `applyClaimVerification(db)` backfills status/confidence/support_count/
    contradiction_count on every claim row.
- `extract.mjs`: after populating claims, runs `applyClaimVerification(db)` (non-blocking).
- NEW `pipeline/tools/verify_claims.mjs` — standalone tool (status roll-up per claim).
- NEW `pipeline/test/claim-verify.test.mjs` — 6 unit tests (VERIFIED, SINGLE_SOURCE,
  OFFICIAL, CONFLICTING, UNCONFIRMED, contradicting-evidence).

## Tests
- 6/6 claim-verify tests pass.
- Full pipeline suite: 41/41 pass (was 35 + 6 new).
- Live backfill on real DB: 209 claims → 156 SINGLE_SOURCE, 53 VERIFIED.

## Notes
- Honest split: most individual claims are single-source even inside a "verified"
  cluster — exactly the transparency the proposal wants. Claim badge stays cleanly
  separate from the cluster badge.
- Site content untouched.
