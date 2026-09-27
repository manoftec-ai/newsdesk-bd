# 2026-09-27 — Deterministic writer: unblocking the site

## What the user asked
"there is no new news in my site from several hours. skip everything and fix this first."
Then, when offered the choice: **deterministic writer**.

## How the root cause was actually found
I had been guessing at gates for hours. Measuring instead of assuming found it in one pass:
1. Publish rate by commit date: 73 → 27 → 31 → **2** → **1** articles/day.
2. `raw_items` supply: 21 sources, 1,274 items/day, 1,023 with usable text → supply fine.
3. `claim_evidence`: 970/970 claims covered → database fine.
4. 58 eligible briefs waiting → the backlog, not the supply, was the bottleneck.
5. Author run artifact: `wrote=0 rejected=6`, `MECHANICAL_AUDIT_FAILED` 6/6 + `PROMPT_LEAKED` 6/6.

The model had been echoing `lib/synth.mjs` back as the article body. The "quote not found"
rejections were literally fragments of our own prompt file.

## Delivered
- `pipeline/lib/compose.mjs` — deterministic Bengali composer from real member leads
- `pipeline/tools/compose_stories.mjs` — the new authoring step
- `.github/workflows/auto-author.yml` — model removed from the critical path
- `pipeline/tools/pick_briefs.mjs` — now runs the real publication gate before picking
- `pipeline/lib/editorial.mjs` — `fitBandToEvidence`, `evidenceWordsAvailable`
- `pipeline/test/compose.test.mjs` — 8 new tests
- 8 articles published; sitemap 380 → 388; all HTTP 200 live. 330/330 tests.

## The lesson worth keeping
**A silent filter that reports zero is the most dangerous kind of no-op, because it reads
as a result.** This bit me twice in one session: an import that never landed (swallowed by
a try/catch, "0 briefs skipped"), and a band stored on an object the consumer never saw.
The discipline that caught both: *grep for a symbol's import, not just its use; and never
trust a gate that reports a suspiciously clean zero.*

Second lesson: `\b` is ASCII-only. Written into Bengali regexes it produces filters that
look real and match nothing.

## Next step (not done)
Sustained volume is now bounded by **extraction text quality**, not writing. Four sources
(kalerkantho, jugantor, jamuna, deshrupantor) contribute 683 items/day with 58–78 chars
each and zero usable articles, so every brief built from them is unpublishable by
construction. Fixing that means getting real article text for those outlets, or finding
sources that carry it.
