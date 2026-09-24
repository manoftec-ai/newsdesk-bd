# Session 2026-09-24 — P0-2a: Claim→Evidence graph schema (non-destructive)

## What changed
- db.mjs: added tables `claims`, `claim_evidence`, `conflicts` (IF NOT EXISTS), with indexes and FK on claim_evidence. Backed up as `.bak_ce`. Existing schema untouched.

## Notes
- Dual-write approach: facts remain primary; claims tables ready for population in extract/synth without breaking current flow.
- Conflicts table mirrors proposal (typed, values/sources JSON, resolution).
