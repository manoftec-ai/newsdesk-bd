# Session 2026-09-24 — P0-6: HEADLINE VERIFICATION COMPLETE + claims FK bug fixed

## What changed
- NEW `pipeline/lib/headline-verify.mjs` (deterministic, automation-only):
  - `tokenize()`: strips stopwords, light Bengali suffix-stemming (matches
    'ঢাকায়'→'ঢাকা', 'রেস্টুরেন্টে'→'রেস্টুরেন্ট'), keeps vowel-sign marks
    (`\p{M}`) so Bengali tokens split correctly.
  - `lexicalSupport(headline, pool)`: overlap ratio of headline content-tokens
    vs the member-leads fact pool.
  - `verifyHeadline(headline, { leads, claim })`: status =
    supported (≥50% traced) / weak / poor / overclaim; flags hype terms and
    overclaims when the strongest claim is CONFLICTING/UNCONFIRMED; scores
    title variants (seoTitle, excerpt...) too.
- `extract.mjs`: after claim population+verification, attaches the cluster's
  verified claims (status/confidence, confidence DESC) to the brief JSON so the
  auditor and front matter read the STRONGEST claim without re-joining.
  `populateClaimsFromBrief` is wrapped and never blocks the write.
- `synth.mjs` `frontMatter()`: surfaces `verification.headline {status,support}`
  in story front matter (additive, site-visible).
- `audit.mjs` mechanical stage now checks c6 deterministically: headline must
  trace to facts pool, no hype, no overclaim.
- **DB BUG FIX (important):** `upsertClaim` used `info.lastInsertRowid` after
  `INSERT ... ON CONFLICT DO UPDATE`. When duplicate member titles conflicted
  (extremely common — 247 title-dups in a run), the unchanged UPDATE leaves
  `last_insert_rowid()` STALE (pointing at the previous `claim_evidence`
  insert!) → duplicate-title claims returned bogus claim_id → the evidence
  child insert died with "FOREIGN KEY constraint failed", silently swallowed by
  try/catch, so most briefs populated ZERO claims. Fix: `RETURNING id` — the
  deterministic row id on both insert and conflict paths. Now extraction
  populated 932 claims live (585 SINGLE_SOURCE / 347 VERIFIED).
- NEW `pipeline/test/headline-verify.test.mjs` (8 tests)
- NEW `pipeline/test/claims-graph.test.mjs` (3 regression tests incl. the
  duplicate-title FK bug).

## Tests
- headline-verify 8/8, claims-graph 3/3, audit 10/10; full suite **66/66**.

## Notes / lessons
- National-473.json brief shows `claims: []` locally though the DB has claims:
  GitHub auto-workers run OLD code and overwrite shared brief files — the brief
  attach is best-effort; store.db claims remain the source of truth. Will settle
  after workers pick up this commit.
- Bengali tokenization breaks if you use `[^\p{L}\p{N}]` — vowel signs are
  \p{M} and get split out. Always include \p{M}.
- sqlite `last_insert_rowid()` is not reliable right after ON CONFLICT DO
  UPDATE when nothing changed. Prefer RETURNING.
MD