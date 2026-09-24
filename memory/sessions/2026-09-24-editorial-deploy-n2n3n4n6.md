# Session: Editorial deploy batch N2+N3+N4+N6 (D66)

Date: 2026-09-24

## What was done
- Shipped the first four user-approved deploy items from the 2026-09-24 ROI
  triage (D64), all pure prompt + mechanical-gate changes — zero schema/UX.
- **N2 (#29/#36) — spec-aligned LLM auditor.** New `SPEC_AUDIT_POINTS`
  (n1..n12): factuality, source support, claim coverage, natural Bengali,
  repetition, speculation, AI filler, headline accuracy, quote integrity,
  context relevance, attribution, readability. `auditPrompt()` now judges the
  draft against all 12 + an explicit `Delete-sentence rules` block (adds no
  info / exists only for length / repeats / unsupported interpretation /
  generic background / invented reaction). Mechanical c1..c10+rv1 untouched.
- **N3 (#13) — claim-level writing rules.** New `synth.claimRules(brief)`
  renders each live claim with its status → "how it may be written":
  VERIFIED→direct fact, CORROBORATED→softer, OFFICIAL→agency-attached,
  SINGLE_SOURCE→attributed only, UNCONFIRMED→never as fact (unknowns section),
  CONFLICTING→must state both sides. Injected into `writingPrompt()` and
  mirrored verbatim into the `.github/workflows/auto-author.yml` runner prompt.
- **N4 (#12) — disclosure gate.** New mechanical audit note `n13`: if the brief
  has a CONFLICTING claim and the body shows no disagreement marker
  (`DISAGREEMENT_RE`: অন্যদিকে / কিছু সূত্র / কোনটি / প্রকৃত সংখ্যা / নিশ্চিত
  নয় / …), the publish gate BLOCKS — silently choosing one side is forbidden.
- **N6 (#15) — quote-integrity floor.** `extractQuotes()` + mechanical note
  `n14`: every quoted line in the body must exist verbatim (prefix ≥25 chars,
  NFC) in the member-lead/claim/quote pool, else BLOCK.

## Tests
- audit.test.mjs: n13 blocks / passes; n14 invented-quote blocks / verbatim
  quote passes; SPEC_AUDIT_POINTS = 12 ids n1..n12 with all spec keywords;
  auditPrompt includes spec checklist + delete-sentence rules.
- synth.test.mjs: claimRules per-status guidance + empty-brief; writingPrompt
  includes claim-level rules + CONFLICTING line.
- Suite: 113 → **120/120 pass**.

## Gotcha (lesson)
- My first n13 "blocks" test used `goodBody()` — which itself contains
  "নিশ্চিত নয়" in the কী এখনো জানা যায়নি section → matched DISAGREEMENT_RE →
  n13 never fired. Fixed with a clean fixture. When adding a new regex gate,
  check the existing fixtures against it.

## Commits / deploy
- `1c3924c` N2+N3+N4+N6 (pushed after rebase → `bff141a`; rebased over worker
  `baa030e`). The worker's `history-atomic-bombings-1945.md` content edit
  stashed/pop'd around the rebase and left unstaged (not mine to commit).

## Next steps (remaining deploy list still open)
- N5 (length tiers 300-600/600-1000+ — parked, needs format classifier), N7
  (breaking ultra-short), N8 (What-Changed UI), N9 (evidence panel), N10, N11:
  all PARKED per D64. Nothing left in the immediate DEPLOY queue unless user
  activates a parked item.