# D75 — #19/#32 per-format templates (fact-check + analysis) — 2026-09-24

## What happened
User asked to implement the remaining editorial-proposal 40-point gaps. Assistant listed 36/40 done; gaps = #19 (separate fact-check vs normal article template) + #32 (per-format article quality templates). Recommended implement #19 + #32, keep #37/#38 parked. User approved ("ok").

## Decision (user, 2026-09-24)
- Implement #19 + #32. #37 (metrics dashboard) + #38 (golden dataset) stay PARKED (offered as a later round).

## Changes delivered (commit 0650358, pushed)
- `pipeline/lib/editorial.mjs`:
  - `storyFormat(brief)` → `factcheck` | `analysis` | `news` (deterministic: category factcheck / rumor-scanner + সত্যতা যাচাই / ফ্যাক্ট (space)?চেক / ফ্যাক্টচেক / গুজব যাচাই markers → factcheck; category opinion → analysis; else news). A news story about an arrest for rumor-spreading is NOT a factcheck (only outlet/verify markers flip format).
  - `factCheckClaim(brief)` → graph claim_text else headline, never fabricated.
  - `factCheckVerdict(brief)` → 7-value VERDICTS enum, honest-only: overclaim→misleading; no claims→unverifiable; contradiction-majority→false; unconfirmed+single ≥ half→unverifiable; strong ratio ≥0.8/0.5/0.25→true/mostly-true/half; else mostly-false.
  - `factCheckNote(verdict)` → deterministic Bengali note per verdict.
- `pipeline/lib/extract.mjs`: RAW_TO_SITE += 'ফ্যাক্ট চেক'/'সত্যতা যাচাই'/'ফ্যাক্টচেক'/'গুজব যাচাই' → 'factcheck'; SITE_CATEGORIES += 'factcheck'.
- `pipeline/lib/synth.mjs`:
  - `factCheckBlock(brief)` → emits `factCheck:` front-matter (claim/verdict/verifiedDate/note) ONLY when storyFormat is factcheck; empty otherwise → normal news front matter unchanged.
  - `writingPrompt()` → `format = storyFormat(brief)`; `formatBlock` injects a distinct **FACT-CHECK FORMAT (proposal #19)** template (দাবি→প্রেক্ষাপট→যাচাই→রায়→কী জানা যায়নি; verdict must match front-matter; never invent a check) and **ANALYSIS FORMAT (proposal #32)** template (প্রেক্ষাপট→বিশ্লেষণ→উপসংহার; no invented experts/বিশ্লেষক/পর্যবেক্ষক).
  - STANDARD news body structure is now gated: "If mode is STANDARD AND format is news"; factcheck/analysis get their template instead.
  - Fact-check verdict context block (Claim/Verdict/Note) added to the facts section when format is factcheck.
  - Fixed stray "(raq…)" artifact in the রায় step text.
- Tests: +17 (editorial: storyFormat ×5, verdict ratios/honesty ×5, claim, note; synth: news→no FC/analysis template, factcheck→FC template + verdict context, analysis→analysis template, factCheckBlock emitted for factcheck only).

## Testing
- `node --test pipeline/test/*.test.mjs` → **183/183 pass** (was 166).
- Site schema `content.config.js` factCheck enum matches our 7 verdict values exactly; manual example `site/src/content/news/factcheck-madaripur-hindu-child-rape-claim.md` already uses the factCheck block shape → emitted front-matter validated by zod.

## State
- Remote had auto-run commits (fetch/verify/extract etc.) pushed between our edits and push → rebased cleanly, re-ran suite (183/183), pushed as 0650358. Verified `git status` clean.

## Next steps
- Parked: #37 diff-analyze panel on editor UI, #38 golden dataset.
- Untouched (available later): #19 finalize/UI niceties, #36 image within-byline support, remaining proposal items per TODO.md (0 open of the 36 approved? verify TODO).