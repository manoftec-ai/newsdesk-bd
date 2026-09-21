# Session — deploy chain broken (site frozen at 14:53) + homepage verif (2026-09-21)

## Context
After D-Q10 (deterministic fresh-first brief picking) the user asked: "what was the last post,
when was it published, and what is on the homepage now?" While verifying, we found the LIVE site
was STALE: content on origin/main had advanced (16:45 auto-author batch) but the public homepage
still reflected ~14:53.

## Diagnosis
- deploy.yml last run = 14:53:05 (workflow_run). Nothing after it, though auto-author pushed
  batches at 15:14 (b0cf9f0), 15:44 (c9c7fbe), 16:20 (57bcb40), 16:45 (d607999) + images commits.
- Same bug class as D-Q9: deploy.yml's `workflow_run` trigger does NOT reliably fire for bot runs
  that were THEMSELVES dispatched by the heartbeat (GITHUB_TOKEN workflow_dispatch). deploy's
  `schedule */15` safety net was dropping events too (cron flakiness, documented earlier).
- The homepage had advertised sports-255/258/253/256 — correctly: a999858 (14:52:57) authored
  them just before the 14:53 deploy. Everything after was missing.

## Fix (D-Q12)
- heartbeat.yml: each cycle now ends with `dispatch deploy.yml` (already supports
  workflow_dispatch). Cycle: images → pipeline → sleep300 → auto-author → sleep1500 → deploy.
- Manually dispatched deploy.yml at 17:05 → success 17:06.
- Verified live: homepage newest-first (sports-255/257/258 @14:19:57, national-266 @14:17:45,
  economy-263 @14:16:18, national-262 @13:59:57, national-261 @13:44:33);
  all 16:45-batch stories HTTP 200. The 'latest' list shows only the newest ~18 articles.

## Numbers state (17:07 UTC)
- Live homepage top: sports-255, sports-257, sports-258, national-266, economy-263, national-262.
- Newest story on repo: national-266 (article date 14:17:45) in the last auto-author batch (16:45).
- Heartbeat edit takes effect at the ~17:54 handoff; feaba1f is still running the old cycle list.
- 295+ articles; 20→ fewer unpublished briefs (16:45 published 5, incl. an old-dated national-268).