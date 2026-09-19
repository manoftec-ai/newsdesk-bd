# Session — 2026-09-19 pipeline quality: tokenizer bug fix + clustering precision

## The bug (critical)
`tokens()` in lib/normalize.mjs split on EVERY non-letter/number char: `[^\p{L}\p{N}]+`.
Bengali words contain virama (্ U+09CD), anusvara (ং), ZWJ/ZWNJ inside words, so almost
every conjunct word was shredded into fragments:
- "অপ্রতিম" -> ["অপ","রত"], "বাংলাদেশ" -> [], "সর্বনিম্ন" -> ["সর","বন"]
Consequence: TF-IDF features were syllable fragments -> unrelated stories merged via shared
fragments. Symptom seen: cluster 7 (7 unrelated bdnews24 items incl. রাশমিকা, হোয়াইট হাউজ),
cluster 43 (10 different banking stories merged as one).
FIXED: split on `[^\p{L}\p{N}\p{M}\u200c\u200d]+` (keep combining marks + ZWJ/ZWNJ inside words).

## What changed
1. lib/normalize.mjs — tokenizer regex fixed (Core fix; also improves dedupe titleSimilarity).
2. lib/cluster.mjs — added `pruneOutliers()` (centroid outlier prune, minCentroidSim=0.35):
   removes single-linkage "grab-bag" members (pooled via generic genre vocab); groups shrunk
   below 2 become singletons. Added `findClusters(items, threshold, pruneSim)` pipeline.
3. run.js — cluster command uses findClusters; config `poll.cluster_prune_sim: 0.35`.
4. run.js — fixed iteration bug (findClusters returns Array, not Map).
5. test/similarity.test.mjs — 10 node:test regression tests (tokenizer, titleSimilarity,
   cluster merge / non-merge / prune, cosine); `npm test` (npm scripts: cluster, verify added).
6. package.json — npm scripts for cluster/verify/test.

## Threshold findings (word-level tokens)
- 0.45 = correct precision point. 0.35 re-introduces FALSE merges: হাম+ডেঙ্গু together,
  9-item bdnews24 grab-bag, খুলনা student-beating + child-abduction merged. So 0.45 kept.
- 0.45 + prune: pay-scale story = 2 clean clusters (announcement + allowance details);
  অপ্রতিম event splits into facet-clusters (CCTV suspect, family demands, protest, recovery) —
  acceptable; a later "same-entity story" assembly belongs to Phase 5.

## Results (re-run 2026-09-19, 456-item sample)
- Before: 43 clusters / 33 multi-source / false merges. After: 34 clusters / 25 multi-source /
  347 singletons / zero false merges. verify 34 -> 25 passed, 9 human_check (single-paper or
  below-tier-floor, correctly held back).
- Validated in output: cluster includes অপ্রতিম facets across 3-6 papers; ডেঙ্গু 4/4; pay-scale
  2 clusters; all multi-source clusters same-topic (eyeball).

## Status / next
- Pipeline now has regression tests. Next quality candidates (if chosen again):
  raw-category -> site-category classify step; dedupe threshold calibration;
  boilerplate weight (sentence-length IDF); verify: contradiction_penalty wiring,
  official-signal providers (SearXNG/VPS).
- Next phases still open: Phase 5 Extract+Synth; site scaffold (QuietPages); Vercel + cron.