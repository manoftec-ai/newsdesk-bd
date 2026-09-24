# Session: P0-8 Golden Test Dataset — cluster quality measurable + retuned (2026-09-24)

## What we did
Built the **Golden Test Dataset** (todo P0-8) so clustering quality is measured objectively,
then used it to retune production clustering (fixes the same-event-different-words dup hole).

## Files
- **NEW `pipeline/config/golden.json`** — hand-curated from REAL `raw_items` (21 items / 11 events),
  self-contained (title + truthful trimmed body — bodies only from the source item, never fabricated).
  Contains the hard cases:
  - `mesles-11-deaths` {160642 channeli, 160311 samakal} — SAME event (হামে ১১ শিশুর মৃত্যু),
    DIFFERENT wording → the D-Q16 duplicate-story hole, now captured in a test.
  - `pm-gates-foundation` {159826, 158836, 158687} — PM × Gates CEO (সিইও/প্রধান নির্বাহী).
  - `pm-erdogan-turkey` {158735, 145205, 120880, 123100, 121550, 141435}.
  - `dengue-daily-report` {157906, 149951, 157783}.
  - 6 singleton events as **false-merge traps**: cyber-হামলা vs হাম cluster, teacher-বদলি vs
    teacher-AI, fuel-cut-statement vs fuel-price-analysis, UNGA-81 opener vs Erdogan bilateral,
    fake-doctor arrest.
- **NEW `pipeline/lib/cluster-eval.mjs`** — `pairKey`/`goldPairs`/`foundPairs`/`pairwiseScores`
  (pairwise precision/recall/F1 + tp/fp/fn) + `eventReport` (per-event merged/split/clean/lost/
  polluted) + `evaluateClusters`.
- **NEW `pipeline/tools/cluster_eval.mjs`** — CLI: default run (report), `--sweep` (F1 per
  threshold 0.25–0.75, finds best config), `--similarity=`, `--prune=`, `--min-f1=` (CI gate,
  exit 1 below floor).
- **NEW `pipeline/test/cluster-eval.test.mjs`** — 6 tests.
- **`config/sources.yaml`** — `poll.cluster_similarity 0.45 → 0.30` (retuned on the golden set;
  `cluster_prune_sim 0.35` guard unchanged). Comment documents the tuning.
- **`.github/workflows/pipeline.yml`** — informational "Cluster quality (golden)" step.

## Measured results (the whole point)
- Old production 0.45/0.35: **P=1.000, R=0.455, F1=0.625** — 3 of 5 multi-member events SPLIT
  (the differently-worded measles pair did NOT cluster → duplicate stories were being published).
- Sweep: 0.30/0.35 → **P=1.000, R=0.909, F1=0.952** — measles merges, no false merge on any trap.
- Residual: `dengue-daily-report` still splits on the "মৃত্যু ২০০ ছাড়াল" wording (the "18২8"
  numbers match but framing differs) → the documented target for P0-9 hybrid/semantic clustering.

## Verification
- Suite **86/86 pass**; `node tools/cluster_eval.mjs` reports the live score; `--sweep` reproduces
  the best-window finding.

## Notes / next
- Golden set is intentional and honest; bodies are trimmed real leads (empty for boilerplate
  sources) → clustering runs on titles (2x weight) as production does.
- Next: P0-9 Hybrid clustering — use the residual dengue split + entity resolution to go beyond
  pure TF-IDF cosine.