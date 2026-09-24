# TODO — Editorial Quality Upgrade (যাচাইডেস্ক article quality)

> Created 2026-09-23. Discussion only so far — no implementation.
> Source: editorial critique reviewed in memory/sessions/2026-09-23-editorial-quality-review-discussion.md
> **2026-09-24: User supplied a NEW governing spec — the 40-point "JachaiDesk — News Quality &
> Reader Experience Upgrade Proposal"** (full text stored in memory/sessions/2026-09-24-editorial-proposal-40.md),
> replacing the older critique as the roadmap. Status of each point is mapped below.

## ✅ Decisions (locked)
- [x] **Q1 — Evidence box: NO.** Keep single frontmatter `সূত্র` block, name-only links. (Proposal #18 evidence panel = P1, does NOT reopen Q1; see below.)
- [x] **Q2 — Regeneration: new-first, then all.** User reviews new style; only then bulk backfill (~440).
- [x] **Q3 — Publish volume:** 30-min auto-publish stays; dedup at cluster/rank layer, never a human gate.

## ✅ Done (map of the 40-point proposal → shipped)
| Proposal point | Status | Where |
|----------------|--------|-------|
| #1 primary principle (clearest human-readable rep of verified info) | ✅ intrinsic | prompts "stop when info stops" |
| #3 don't expose AI research process in body | ✅ 69e5a53 | outlet-name + source-meta ban in finalize gate + prompt |
| #4 default structure (মূল খবর / কী জানা গেছে / কী এখনো জানা যায়নি, omit empty) | ✅ 69e5a53 | template headings renamed (retired কী ঘটেছে/যা এখনো জানা যায়নি) |
| #5 এক নজরে keep + improve | ✅ | keyPoints rendering live; no headline repetition already prompted |
| #6 dynamic article length | ✅ 3e73dc6 | tiers 100-180 / 200-350 / 400-550 (proposal range: break 100-180 / normal 180-350 / develop 300-600 / complex 600-1000+) — MARGINAL GAP: develop/complex caps |
| #7 eliminate AI filler | ✅ 69e5a53 | BANNED_FILLER + invented-actor ban (এদিকে/অন্যদিকে deliberately NOT hard-banned) |
| #8 zero unsupported interpretation | ✅ | speculation invented-actor ban; actor-attribution prompt |
| #9 no generic background padding | ✅ | prompt hard rules |
| #10 natural Bengali | ✅ (mechanic) | human-quality pass = LLM audit c4 neutral, c3; deeper Bengali naturalness = P1 (auditor LLM point) |
| #11 natural source attribution | ✅ 69e5a53 | sources once AFTER news in সূত্র block; actors only for real attribution |
| #12 source differences preserved | 🔶 partial | conflicts tracked in claims graph (R3 reverify); in-body divergence wording n/l — needs writer prompt instruction (Round-2) |
| #13 claim-level writing rules (VERIFIED/CORROBORATED/...) | 🔶 partial | claims graph exists (D56); writing rules per status not yet in prompt |
| #14 headline evidence-constrained | ✅ | headline-verify.mjs + audit c6 + badFlag tracking (D59) |
| #15 quote integrity | 🔶 partial | claims/evidence store quotes; no write-floor yet ("never invent quotes" is in prompt) |
| #16 "কী এখনো জানা যায়নি" signature | ✅ | section live + template |
| #17 "কেন নিশ্চিত?" badge explanation | ✅ 04eab2f LIVE | badge-legend under badge (site-side); clickable = P2 |
| #18 evidence panel | ⏳ P1 | design note: Q1 stays, panel = evidence, NOT quotes/box; no chain-of-thought |
| #19 separate normal vs fact-check templates | ⏳ Round-2 2.1 | factcheck category/schema/VERDICTS exist (F1); distinct article template = TODO |
| #20 "What Changed?" on living stories | ⏳ P1 | reverify updates[] history exists (D60); UI last-update box = TODO |
| #21 never silently rewrite important facts | ✅ 4279dc4 (D60) | additive correction surgery (updated/correctionNote/updates[]) only |
| #22 editorial value | ✅ 516c305 | internal editorialValue() score (pick tiebreak), never public |
| #23 prioritize reader value | ✅ 516c305 | rv1 gate blocks publish when body adds no fact beyond headline |
| #24 breaking news mode | ⏳ P1 | tier 'short' exists; dedicated ultra-short mode + same-story update = TODO |
| #25 developing story mode | ⏳ P1 | event_scheduler + watcher exist; living-story format = TODO |
| #26 political/sensitive strict rules | ⏳ Round-2 2.2 | prompt partially; dedicated stricter writing rules = TODO |
| #27 AI should be invisible | ✅ 69e5a53 | fresh-news voice prompt + filler bans; LLM auditor notes naturalness |
| #28 JachaiDesk editorial style guide doc | ⏳ TODO 1.10 | docs/editorial-style-guide.md not yet written |
| #29 editorial AI auditor | ✅ (two-stage, D58, extended rv1) | mechanical + LLM 10-point c1-c10 + rv1; recommend aligning LLM list to this spec |
| #30 reader value test | ✅ 516c305 | rv1 gate |
| #31 homepage editorial hierarchy | ⏳ P1 parked | proposal P1 |
| #32 article quality dynamic (per-format) | 🔶 partial | format= tier (short/normal/complex); fact-check/analysis templates = TODO |
| #33 "কেন গুরুত্বপূর্ণ" why-it-matters | ⏳ Round-2 | only when evidence-supported; not built |
| #34 quality over quantity (can say "don't publish") | ✅ | rv1 + editorial-value + verdict gate all block |
| #35 recommended editorial pipeline | 🔶 ~80% | claims->evidence->independence->verify->editorial value->writer->auditor->risk->living->reverify all live |
| #36 publication quality gate | ✅ (mechanical) | blocks on violation; full LLM checklist = auditor align |
| #37 new success metrics | ⏳ P2 | not built (dashboard) |
| #38 golden dataset (200-500 labeled) | ⏳ P3/backlog | not started |
| #39 implementation priority | → use for sequencing below | P0 near-done; see next-phase list |
| #40 final editorial goal | OKR | stated target; guides all above |

## Phase 1 (editorial layer) — shipped ✓
- [x] 1.1 Narrator prompt: synthesize-first, merge to ONE narrative — fcc9290
- [x] 1.2 Speculation+filler BLOCK gate (not strip) — 4d0bf3a
- [x] 1.3 Dynamic per-tier length, drop fixed word count — 3e73dc6
- [x] 1.4 Badge legend "কেন নিশ্চিত?" one-liner under badge — 04eab2f LIVE
- [x] 1.7 Verify (tests, live story, badge live; Lighthouse RED pre-existing PARKED)
- [x] 1.8 Leave parallel WIP + divergent b9b2f8f untouched (user reviews)
- [x] 1.9 Reader-value rv1 gate + editorialValue pick ranking (#21/#22/#23/#30) — 516c305
- [x] 1.10 Fresh-news voice: source-meta/outlet/invented-actor ban + মূল খবর/কী জানা গেছে/কী এখনো জানা যায়নি headings (#3/#4/#7/#11/#27) — 69e5a53

## Next phase (user-approved deploy list 2026-09-24)
> Recommendation (user approved): deploy only the MECHANICAL / CHEAP items N2–N4 + N6. Everything else
> (N5, N7–N11, metrics, golden dataset) is PARKED until real readership + distribution exist. Reason:
> the 40-point spec assumed human editors; we auto-publish keyless on 30-min cadence — rules are high
> ROI, heavy UX/infra is not. See memory/sessions/2026-09-24-editorial-proposal-40.md + TODO assessment.
- [x] N1 **docs/editorial-style-guide.md** (#28) — the permanent JachaiDesk editorial spec doc — DONE 2026-09-24 (docs/editorial-style-guide.md; 11 sections; banned-table mirrors the exact gate lists)
- [x] N2 **Auditor LLM alignment** (#29/#36): rename/expand LLM audit points to the spec checklist
  (factuality, source support, claim coverage, natural Bengali, repetition, speculation, AI
  filler, headline accuracy, quote integrity, context relevance, attribution, readability) —
  DONE 1c3924c (SPEC_AUDIT_POINTS n1..n12 + delete-sentence rules in auditPrompt)
- [x] N3 **Claim-level writing rules in prompt** (#13): VERIFIED/CORROBORATED/SINGLE_SOURCE/
  UNCONFIRMED/CONFLICTING → how each may be written —
  DONE 1c3924c (claimRules() in synth + mirrored in auto-author.yml)
- [x] N4 **Source disagreement in body** (#12): when leads conflict, writer must SAY the
  difference, never silently choose (ties to claims graph CONFLICTING) —
  DONE 1c3924c (mechanical gate n13, DISAGREEMENT_RE)
- [x] N6 **Quote integrity floor** (#15): audit check that any quoted line exists verbatim in
  member leads, else FAIL (reuse claims/evidence store) —
  DONE 1c3924c (mechanical gate n14, extractQuotes())

## P1 depth items (engine — continue after editorial deploy)
- [x] **Temporal truth: claim verification ledger** — append-only `claim_snapshots`
  (valid_from/valid_until range per claim status; status change closes open period +
  opens new one; never mutated). `recordSnapshot`/`claimStatusAt`/`claimTimeline`/
  `claimTransitions` in claim-verify.mjs; reverify **R5 flip-flop trigger** (a claim that
  went CONFLICTING then recovered surfaces a renewal/correction note). Backfills
  automatically on next pipeline extract. Tests +9 (7 temporal-truth, 2 reverify R5) →
  suite 129/129. Commit f19ea21.

## Parked (low ROI for this project right now — per user-approved 2026-09-24 assessment)
- [ ] N5 **Length tiers to proposal ranges** (#6): allow 300-600 developing / 600-1000+ complex
  explainers (needs a format classifier #32)
- [ ] N7 **Breaking-news ultra-short mode** (#24): 30-80 words same-story update, not new 500w
- [ ] N8 **What Changed / last-update box** (#20): render reverify updates[] on article (P1)
- [ ] N9 **Evidence panel "প্রমাণ দেখুন"** (#18): clickable badge → evidence list from claims
  graph; Q1 preserved (no quotes box); no chain-of-thought
- [ ] N10 **Political/sensitive strict rules** (#26) — Round-2 2.2
- [ ] N11 **Fact-check vs normal template** (#19) — Round-2 2.1

## Parked / user-gated
- 1b bulk regenerate ~440 (Q2: after user reviews new style)
- P1 homepage hierarchy (#31): parked until user asks
- P2 badge legend site-wide vs tooltip: parked
- Lighthouse: PARKED 2026-09-24 (pre-existing; Vercel Insights 404 — user action item)
- #37 metrics dashboard, #38 golden dataset: backlog (PARKED per 2026-09-24 recommendation — premature until readership/distribution exist)

## Notes / constraints
- English-only in terminal; Bengali only inside site content/prompt instructions.
- Keep zero-budget + keyless model; auditor = flag-and-retry, not scoring-only.
- Bodies are model-generated → template/prompt IS the product.
- Never commit raw credentials.