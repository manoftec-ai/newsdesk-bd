# Session — heartbeat poll-based handoff (D-Q13) so new stories hit the homepage within one 30-min cycle (2026-09-21)

## User requirement
"strict [single-source gate] is ok. just make sure that every 30 minutes home page can show
new news if its available."

## Root-cause found during verification logs
Heartbeat dispatched auto-author 300s after pipeline started, but pipeline takes ~8 min to
fetch+verify+extract+push (observed 16:55 run: fetch 16:56 → verify done 17:03 → push 17:03).
So auto-author's checkout+`pick_briefs` always read a FULL CYCLE-OLD briefs store, and the
deterministic picker (D-Q10) was picking from a stale pool. Fixed-sleep sequencing = freshness
starved by one cadence.

## Fix (D-Q13) — heartbeat.yml rewritten
Per cycle:
1. dispatch images.yml + pipeline.yml
2. POLL pipeline run until `completed` (inline node poller, 15s × 50 → ~12 min cap)
3. dispatch auto-author.yml
4. POLL auto-author until `completed` (15s × 100 → ~25 min cap)
5. dispatch deploy.yml  (deploy runs asynchronously; site updates within minutes of authoring)
6. sleep to pad the cycle to exactly 1800s so each source is fetched at most once/30 min
   (be-nice-to-sources)
Loop 5 cycles, then dispatch a fresh heartbeat (self-renew before the 190-min job limit).
Poller exits: 0 success, 3 failed, 2 timeout — caller logs and CONTINUES on any outcome,
so a slow run degrades gracefully instead of stalling the chain.

## Verification (live)
- Old 14:54 heartbeat auto-cancelled via concurrency group when new one dispatched 17:35.
- New heartbeat run 35633041595 in_progress; pump step active.
- pipeline 35633168788 dispatched 17:37:12 → completed success ~17:45.
- auto-author 35633945676 dispatched 17:44:41 (immediately after pipeline finished — handoff
  latency ≈ 0, no more stale-brief problem).
- deploy dispatch follows auto-author completion each cycle.

## Expected cadence from now
Every ~30 min: pipeline → auto-author → deploy. When a story EXISTS that passes the strict
2-source gate (D-Q11), it is authored and live within that same cycle (minutes after
auto-author finishes). With no qualifying story, homepage simply doesn't change — correct
behaviour per the strict gate.