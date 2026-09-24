# Session 2026-09-24 — P0-2b: Claim→Evidence helpers (non-destructive)

## What changed
- db.mjs: added helpers `upsertClaim`, `addClaimEvidence`, `recordConflict` with `ON CONFLICT(cluster_id,claim_text)` for idempotent upserts. Backed up `.bak_ceh`.

## Notes
- Dual-write ready; population will be added in extract.mjs from facts/members without affecting existing publish flow.
