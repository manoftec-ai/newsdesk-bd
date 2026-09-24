# Session 2026-09-24 — P0-2c: Populate Claim→Evidence (dual-write)

## What changed
- extract.mjs: import helpers `upsertClaim/addClaimEvidence`, added `populateClaimsFromBrief(db, brief)` to upsert event/headline claims + evidence (supports) from members. Calls it after writing each brief (non-blocking try/catch). Backups `.bak_ce_imp/.bak_ce_pop/.bak_ce_write`.

## Notes
- Dual-write with facts (facts remain source-of-truth). Claims are derived from cluster headline + member titles/leads. Non-destructive, backward compatible.
- No changes to publish flow (status gate still applies).
