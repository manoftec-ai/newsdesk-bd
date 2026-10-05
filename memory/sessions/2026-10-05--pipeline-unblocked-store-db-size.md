# 2026-10-05 — No news on jachaidesk.com: root-caused and fixed

User report: "why no news in my jachai desk site today". Journalist chain:
fetch → normalize → cluster → verify → extract → auto-author → deploy.

## Root causes found (verified from CI logs, not assumed)
1. **store.db exceeded GitHub's 100MB push limit.** Last committed store.db
   (Oct 4 17:02) was ~100MB; the next full pipeline run (Oct 5 12:22) inserted
   460 new rows, grew past 100MB, and `git push` was rejected with GH001
   pre-receive-hook error (log line: "File pipeline/state/store.db is 101.91 MB;
   this exceeds GitHub's file size limit of 100.00 MB"). No state commit →
   auto-author never got new briefs → 0 articles since Oct 4 17:02.
2. **Extract briefs hang (the thing that looked like the bug).**
   `exportBriefs` called `applyClaimVerification(db)` *inside* the per-brief
   loop: a full claims-table re-verify (~3,340 reads + snapshot INSERT) ran
   once per brief (~1,479 loops). CI log: `node run.js extract` printed its
   header and hung for ~57 min before I cancelled the run. It also wrote a
   new claim_snapshots row set every call — the table had ~42k rows.
   Local repro: buildBrief loop alone 4.4s for 1,479 clusters; full extract
   never terminated in 150s+.
3. **Normalize was O(n^2):** pairwise `titleSimilarity` over ~18,800 rows →
   17.5 minutes on CI. After rewriting it as a bigram-inverted-index blocked
   pass (exact same semantics — two titles only clear the >0 Dice threshold
   if they share a bigram): ~7 seconds locally.

## Changes
- `pipeline/lib/extract.mjs`: removed the inner-loop `applyClaimVerification`
  call + its import. (The claim-verify tooling still re-verifies once per run
  via `pipeline/tools/verify_claims.mjs`; the per-brief loop was redundant.)
- `pipeline/run.js` cmdNormalize: blocked O(n·k) via bigram index.
- `pipeline/state/store.db` pruned: deleted 38,580 closed
  (`valid_until IS NOT NULL`) claim_snapshots rows; 56 `conflicts` rows whose
  `values_json` held accidental full-article-body text dumps (~260KB each,
  ~10MB total) set to `[]`; VACUUM → 104.8MB → 85.7MB.
- Backups: `/data/data/com.termux/files/usr/tmp/store-pre-fix.db`,
  `store-pre-prune.db`, `store-backup.db`.

## Verified
- First fixed CI run (37328918419 on 78a6e745): all stages green including
  Extract (952 briefs written / 556 title-dups), but push was still rejected
  because store.db was still >100MB.
- Second run (37333426724 on 97cdc2df): pipeline green AND its state commit
  `cce992ce pipeline: fetch/verify/extract (auto, 20261005T1549)` landed.
  Auto-author then ran: pick 0/0 this round (570 title-dups, 476 briefs under
  the 100-word evidence gate, 109 incoherent, 24 quarantined) — expected while
  the brief evidence pool re-enriches over the next few 30-min cycles
  (pipeline.yml enriches 150 bodies + ~40 re-extracts per run).
- Suite: 493/495, the 2 failures pre-date the fix (content-gate
  BODY_OFF_HEADLINE findings surfaced Oct 3; health-check fixture time-frozen).
- Commits: `78a6e745` (extract+normalize fix), `97cdc2df` (store.db shrink).
