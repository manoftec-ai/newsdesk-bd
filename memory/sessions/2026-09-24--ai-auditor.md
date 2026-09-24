# Session 2026-09-24 — P0-5: AI AUDITOR COMPLETE (two-stage Writer→Auditor)

## What changed
- NEW `pipeline/lib/audit.mjs`:
  - Stage 1 **mechanicalAudit(brief, body)** — deterministic, zero-cost, runs
    always. Encodes the project's LOCKED editorial rules: c3 speculation/filler
    (reuses `findEditorialViolations`), c5 outlet names in body (21 names from
    sources.yaml + agencies), c10 raw URLs + `সূত্র:` list in body, c7 editorial/
    draft footer (reuses `isEditorialFooter`, now exported), c9 length discipline
    vs tier (100–180 / 200–350 / 400–550 words by source count), c8 lead-paragraph
    presence + `এক নজরে` required when ≥3 sources.
  - Stage 2 **auditArticle(brief, body)** — if LLM key present, sends the 10-point
    audit prompt (AUDIT_POINTS c1..c10) and parses the JSON reply; PASS = both
    stages pass. No LLM key → mechanical gate alone decides (backward compatible).
  - **writeThenAudit(brief)** — writes, audits, and on FAIL re-runs the writer
    with the auditor's notes appended to the writing prompt, bounded to
    `MAX_AUDIT_RETRIES` (default 2, env AUDIT_MAX_RETRIES). Finalize only on PASS.
- `pipeline/lib/synth.mjs`: exported `isEditorialFooter` (was module-private).
- `pipeline/tools/author_stories.mjs`: `chatComplete` + `finalizeStory` replaced
  by `writeThenAudit` → PASS only. New `blocked` counter in run summary.
- NEW `pipeline/tools/audit_stories.mjs` — audit a single `--slug=` body file, or
  all `tmp/stories/*.b.md`; reports mechanical pass/fail and LLM per-point scores.
- NEW `pipeline/test/audit.test.mjs` — 10 tests: good body passes, c3/c5/c7/c8/
  c9/c10 each block, 2-source brief does NOT demand এক নজরে, parseAudit tolerates
  code fences, AUDIT_POINTS is exactly c1..c10.

## Tests
- audit 10/10; full suite 55/55 (was 45).
- Live dry run: `author_stories --dry-run` picks 24 pending briefs; no `.b.md`
  bodies present locally right now (GH worker consumes them), auditor empty-state
  behaves gracefully.

## Notes / decisions
- 10 audit points were DERIVED from the already-locked writer prompt + editorial
  rules (proposal said "check 10 points"; no original list in repo memory), and
  they mirror exactly what the writer prompt already demands → deterministic,
  reviewer-of-the-writer, not a new policy.
- Auditor is flag-and-retry, never a scoring-only pass (zero-budget constraint
  from TODO.md "Notes": "auditor = flag-and-retry, not scoring-only").
- finalize_stories.mjs gate unchanged (still the last hard block on publish).
- No user API key on this Termux box right now → stage-2 LLM audit verified
  structurally (parse) + live in GH Actions once auto-author runs with key.
MD