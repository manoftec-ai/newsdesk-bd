# Session — 2026-09-19 Phase 3 (clustering) + Phase 4 (verify, corroboration)

## Phase 3 — Cluster (COMPLETE)
- `lib/cluster.mjs`: Bengali TF-IDF (title tokens weighted 2x) + union-find cosine clustering.
  Config: `cluster_window_hours=8`, `cluster_similarity=0.45`, `cluster_mature_runs=3`.
- `run.js cluster`: stable cluster reuse (reuse existing id when >=60% member overlap), cluster
  lifetime aging — open clusters with no new member for N runs become `mature`.
- New tables: `clusters(id,status,first_seen,last_update,member_count,mature_runs,headline)`,
  `cluster_members(cluster_id,item_id,source_id,score,added_at)`.
- Result on 456 items: 43 clusters, 296 singletons, 33 multi-source. Spot-validated:
  - cluster 2 = 24 articles / 6 papers — অপ্রতিম হত্যাকাণ্ড (Cumilla schoolboy murder, all part-by-part)
  - cluster 13 = 12 / 3 papers — নতুন পে-স্কেল (pay scale proclamation)
  Both perfectly same-topic → Phase 3 exit criteria met.

## Phase 4 — Verify (corroboration engine DONE; official/SearXNG providers PENDING)
- `lib/verify.mjs`: score from trust.json reputations (+2/distinct top paper, +3 official),
  category→tier keyword map (fail-closed unknown=>A), cluster tier = most severe member tier,
  badge thresholds (verified>=5 AND official, confirmed>=3, single=2, skeptical<=1), publish
  floor per tier A/B/C; `skeptical`/below-floor -> `human_check` (never auto-publish).
- `run.js verify [--mature-only]`; new `verdicts` table; config block `verify:` in sources.yaml.
- Result on 43 clusters: 33 passed (all `confirmed`, none `verified` — official signals not yet
  available), 10 human_check. Safeguards validated:
  - cluster 43 (10 items, ONE paper only) -> single badge -> human_check
  - cluster 7 (7 items, one paper, mixed topics) -> single -> human_check
  - cluster 32 (5 distinct papers, Munshiganj crash) -> confirmed
- `verified` badge unreachable until official signals (SearXNG meta-search + official FB pages)
  are wired in — requires hosting decision.

## Decisions / notes
- Verify built corroboration-first (Option A from memory) => zero external infra needed now.
  SearXNG on Servarica VPS (Option B) deferred; provider interface already structured for it.
- Category values are raw source strings (Bangladesh, ক্রিকেট, কলাম, ...) — a normalize-stage
  classify step to site's 9 categories is still TODO (currently keyword-mapped for tiers).

## Status / next
- Next: Phase 5 Extract+Synth (llama.cpp local vs gemini swap), OR Phase 6 Astro site shell
  (homepage + draft story rendering with badge/evidence). Then Phase 7 Vercel + 30-min automation.
- Open item: SearXNG/VPS decision; title-dedupe + cluster thresholds calibration.