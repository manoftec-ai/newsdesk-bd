# Session: Reader-value test + editorial-value ranking (#21/#22)

Date: 2026-09-24
State: pipeline/lib/editorial.mjs (NEW) + audit.mjs + pick_briefs.mjs + tests. Committed 516c305, pushed (needed one rebase — origin moved ahead).

## Context
User's standing instruction: continue with the next steps from the editorial critique,
"follow this instructions, fix any error." The parallel session had already shipped the AI
auditor (c1–c10), headline verification, news-style cleanup (no outlet names, 443 files),
and re-verification engine (D56–D60). Two critique items remained unimplemented:
- #21 Reader-value test ("if the reader already knows the headline, does the article give
  anything useful? if no, don't publish")
- #22 Editorial-value ranking (internal prioritization: public impact, people affected,
  novelty, consequence, urgency, geo relevance, usefulness)

## What changed (commit 516c305)
1. `pipeline/lib/editorial.mjs` (new):
   - `concreteTokens(text)`: digits (Bengali+Latin), quantity words (কোটি/লাখ/টাকা…), weekday/month names.
   - `readerValueCheck(headline, body)`: novel concrete tokens not in the headline →
     PASS if ≥1 novel fact or body ≥4× headline length. Pure restatement = fail.
   - `editorialValue(brief)`: deterministic 0–100 internal score (impact, corroboration,
     consequence, urgency, usefulness, geoRelevance) via keyword counting. Pure function.
2. `pipeline/lib/audit.mjs`: imported readerValueCheck; `mechanicalAudit()` adds fail id `rv1`
   when no reader value. Deliberately NOT added to `AUDIT_POINTS` (that stays c1..c10 for the
   LLM stage + its existing test). Blocking, not stripping.
3. `pipeline/tools/pick_briefs.mjs`: reads editorialValue per brief; sort = date desc
   (newest-first preserved), then evScore desc, then slug. Exposes `editorialValue` in
   pick.json + console, so the author sees the internal priority.
4. Tests: `pipeline/test/editorial.test.mjs` (8) + 2 new rv1 tests in `audit.test.mjs`.
   Suite 80/80 pass.

## Decisions / assumptions
- Reader-value gate is deterministic + zero-cost (no LLM), consistent with zero-budget/keyless.
- Editorial value is INTERNAL ONLY (never shown to readers, per critique #22).
- Newest-first selection is NOT overridden — editorial value only breaks date ties
  (avoids regressing the earlier "top stories looked old" fix).

## Verification
- `node --test` in pipeline/: 80/80 pass.
- git: local = origin (516c305), pushed successfully after a rebase (remote had advanced).
- Not tested: live author run with the new rv1 gate + ev ranking (README notes: full
  testing impossible locally; the gate simply adds a fail id that existing blocked-flow
  already handles).

## Next steps
- User reviews Phase 1/1.9 output → decide on Phase 1b bulk regen.
- Remaining critique gaps: #19 News Voice guide (standalone editorial spec doc),
  #20 auditor already partially covered (D58, c1–c10), Round-2 batch (#16 news/factcheck
  split, #17 political strict rules, #23 "এই খবরের মূল কথা" box, #15 homepage hierarchy P1).
- Lighthouse still PARKED (pre-existing, Vercel Insights 404).

## Files
- pipeline/lib/editorial.mjs (new)
- pipeline/lib/audit.mjs, pipeline/tools/pick_briefs.mjs (edited)
- pipeline/test/editorial.test.mjs (new), pipeline/test/audit.test.mjs (edited)
- TODO.md (1.9 marked DONE), memory/MEMORY.md (D61), memory/MEMORY.json (D61, sessionsCount)