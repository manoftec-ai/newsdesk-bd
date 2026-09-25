# 2026-09-25 — cluster-coherence guard (D104)

## What was asked
User, after seeing that the next GitHub publication runs through
`pick.json` → `jachai-lekhok` → `finalize_stories.mjs`:
> "cohetence guard is fine. do it. i dont want any more gurbage"

## What was found first
Rendering the real prompt for a pending brief (`national-556`) showed a
43,515-character / 3,509-word prompt claiming "1,286 words of fact". The
7 members were 7 unrelated stories:

| source | story |
|---|---|
| dainikbangla | Asian Games: Nepal beats Afghanistan |
| dainikbangla | Bangladesh loses to Malaysia |
| dainikbangla | Ham flood: 3 more children dead, toll 1,084 |
| bdnews24 | Chairman Razzak murder sentencing |
| bdnews24 | Iran won't back down at the UN |
| channeli | Mirpur health centre bulldozed |
| prothomalo | Saudi allies, Houthis continue attacks |

The D103 150-word body floor cannot catch this. A mashed cluster still
produces plenty of words — they are just the wrong words.

## Metrics measured and rejected
Three candidates were measured against the real corpus, not guessed.

1. **Token overlap, min-pairwise** — flagged 10% as incoherent, but manual
   inspection showed most of those were the *same* story worded differently
   (`economy-162` = 9 outlets on one fuel-price bulletin, `national-101` =
   7 outlets on one bus crash). **10% was reported as not a real number.**
2. **`lib/entities.mjs` `strongAgree()` connected components** — flagged
   **92.3%** of 415 clusters as incoherent, including all 6 known-good
   cases. It is built for the clustering step and requires 2 shared
   IDF-strong tokens or a near-identical 3+ digit figure, which short
   `title+lead` input rarely has. **Measured, then rejected.**
3. **Min-max similarity (chosen)** — for each member, the best
   content-word similarity to any *other* member; then the minimum across
   members. A cluster passes only if every member has at least one partner.
   **8/8 known cases correct** (1 incoherent, 7 coherent).

Why "a partner" instead of "everyone agrees with everyone": `economy-162`'s
9 members share only globally-common words, so IDF and min-pairwise both
score it 0.000. A real intruder, by definition, has no partner.

## Calibration (415 multi-member briefs)
```
<0.08      5   incoherent
0.08-0.12  1
0.12-0.25  6
0.25-0.5 100   coherent
>=0.5    303   coherent
```
Incoherent example 0.083; coherent examples 0.33–0.67; empty band between.
**Threshold 0.20.** Blocks 2.2% (9/415).

## Real bugs caught
- `coherenceMin({COHERENCE_MIN: ''})` returned **0**, not 0.2, because
  `Number('') === 0`. A bare `COHERENCE_MIN=` in a workflow file would have
  silently disabled the guard. Fixed; a test pins it.
- The first corpus test asserted on `national-556` by slug, and the bot
  re-clustered that brief between writing the test and running it, turning
  the 7-story mash-up into a clean 2-member story. The test now asserts the
  operating envelope; the specific case is covered by a fixed fixture.

## The guard caught already-published garbage
- **national-526 — live at 256 words.** 9 members: five *different* cricket
  results (South Africa v Australia, England, Brazil/Neymar, Portugal/Ronaldo,
  Nepal v Afghanistan) plus Ham flood deaths, the PM at the UN, and a
  ChatGPT item.
- **national-518 — live at 263 words.** The PM at the UN plus a ChatGPT item.
- **national-555** — 8 unrelated stories, from the bot's own latest run.

## Files
- `pipeline/lib/cluster-coherence.mjs` (new, 106 lines) — metric, stoplist,
  `clusterCoherence`, `coherenceMin`, `COHERENCE_FAILURE_CODE`
- `pipeline/tools/finalize_stories.mjs` — check inserted after the brief is
  parsed and **before** `readFileSync(bodyPath)`, so a bad brief costs nothing
- `pipeline/test/cluster-coherence.test.mjs` (new, 216 lines) — 19 tests

## Verification
- `node --test test/cluster-coherence.test.mjs` → 19/19
- `npm test` → **286/286** (was 267/267, no regressions)
- Real finalizer, end-to-end with a temp pick/site/bodies fixture:
  `national-556` → `CLUSTER_INCOHERENT`, `minMaxSimilarity 0.083`,
  `minRequired 0.2`, `members 7`, all 7 intruders named, **nothing written**.

## Git
- `26f5723` guard: block briefs that mash together unrelated stories
- merge of bot commit `e9175c8` (pipeline: fetch/verify/extract, auto)
- `e773cb3` test: stop asserting on a brief the bot re-clusters
- Pushed to `origin/main`; tree clean and synced.

## Production impact
None. No site content changed, no workflow edited, no Vercel change, no new
dependency, no secret. The guard only runs inside the existing finalizer.

**Still not live:** the Vercel deploy quota is exhausted
(`api-deployments-free-per-day`, reported as more than 100), so D103's
enrichment fix, the 6 rewrites and the 137 deletions are all committed but
not on the site. Live sitemap still serves 514 URLs; git has 377 articles.
