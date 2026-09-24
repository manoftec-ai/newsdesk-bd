# Session 2026-09-24 — P0-2: Claim→Evidence graph COMPLETE

## What changed
- db.mjs: `claims`, `claim_evidence`, `conflicts` tables (IF NOT EXISTS) + helpers `upsertClaim`, `addClaimEvidence`, `recordConflict` (idempotent ON CONFLICT cluster_id+claim_text).
- extract.mjs: `populateClaimsFromBrief(db, brief)` dual-writes event + per-member headline claims with supporting evidence from members (source_id, url, lead excerpt, published_at). Called after each brief write (non-blocking). Import fixed to bring in helpers.
- Fixed bug: brief field is `clusterId` (not `cluster_id`).
- Populated: 223 claims, 389 evidence entries (from 56 passed clusters) during a test extract run.

## Tests
- Direct upsert + addClaimEvidence verified.
- populateClaimsFromBrief on cluster 78 → ret=3, claims 3, evidence 5.
- Full extract --status=passed ran green (56 written, 266 title-dups skipped).

## Notes
- store.db is git-committed binary; parallel GH auto-workers cause recurring UU conflicts → resolved with `--theirs` (keep remote state; our schema is idempotent; workers re-populate claims on their own extract runs via committed code). Verified schema present after merge (claims table exists, rows repopulated by next worker run).
- Site content untouched.
