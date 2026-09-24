# Session: P0-9 Hybrid clustering — golden F1 1.000 (2026-09-24)

## What / files
- **NEW `pipeline/lib/entities.mjs`** — the independent strong signal layer:
  - `numberTokensOf`: Latin+Bengali digit runs, Bengali number-words, CONCATENATED forms
    ("ছয়জনের" → N6 via `leadingNumber` longest-prefix split), হাজার/লাখ/কোটি multipliers.
  - `digitClose`: identical or edit≤1 on ≥3-digit bare numbers → ۱۸৬৮ ≈ ১৮৬৬ (same hospital
    bulletin despite typographic variance).
  - `strongTokenSet`: normalized numbers + high-IDF Bengali lexical tokens; EXCLUDES pure-ASCII
    (outlet mastheads "The Daily"/"samakal"/"com"), raw Bengali digit-runs, and stopwords.
  - `strongAgree(a,b,floor=0.3)`: merge if ≥2 strong tokens shared OR one close 3+ digit figure
    covering ≥ floor of the smaller set. A lone mundane number (১১ in two different stories) is
    deliberately NOT enough.
- **`lib/cluster.mjs`** — added `hybridClusterItems` (union-find on cosine OR strongAgree;
  same centroid `pruneOutliers` afterwards) + `findClusters(items, sim, prune, {hybrid, strong})`.
- **`run.js` cmdCluster** — uses new `poll.cluster_strong_sim` (config/sources.yaml added 0.30);
  cosines unchanged otherwise.
- **`tools/cluster_eval.mjs`** — default now mirrors production (sim 0.30, strong 0.30);
  `--strong=0` reverts to pure cosine; `--strong=<v>` overrides floor.
- **NEW `test/entities.test.mjs`** (7 tests) + hybrid-perfect-F1 assertion in cluster-eval tests.

## Results
- Evaluated default (pure cosine, sim 0.30): P 1.000 / R 0.909 / F1 0.952 (dengue "২০০ ছাড়াল"
  residual split — measured in P0-8).
- Hybrid (sim 0.30, strong 0.30): **P 1.000 / R 1.000 / F1 1.000** — every curated event merged
  (incl. differently-worded measles AND the 1868/1866 dengue bulletins), every false-merge trap
  stays clean.
- Live smoke: `node run.js cluster` → 156 items → 148 groups (7 reused / 141 singled / 30 matured),
  no errors.
- Full suite **99/99 pass**.

## Why it works (and the guardrails)
- Numbers + rare vocab are a signal INDEPENDENT of cosine wording, catching the dup hole that
  D-Q16 noted (national-290/292 class). Guards: smallest-set coverage floor, close-digit rule is
  the only single-token path that fires, pure-ASCII junk excluded. Cosine keeps the rest.

## Next
- Commit (D62) then continue down the P0 list: Entity resolution, Structured contradiction
  detection, Temporal truth, …