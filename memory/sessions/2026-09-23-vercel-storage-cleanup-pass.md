# 2026-09-23 — Vercel deployment storage: verification & second cleanup pass

Follow-up to D48 (rebrand + storage cleanup, `2026-09-23-rebrand-jachaidesk-domain-and-storage-cleanup.md`).
User asked: "can we delete some old deployment without affecting our site performance" — the
parallel session had already pruned; this pass verified + completed to a clean end state.

## What was done
- Inspected via REST API (CLI `vercel ls` hangs on Termux — avoid; use API instead):
  - project `prj_FX5YmvjrSM5JnbCm1PNbQuJU6xJO` (newsdesk-bd), team `team_iW4eHZzR6FOl25MLZ5WOBVG2`;
  - found `deploymentExpiration: {expirationDays:30, deploymentsToKeep:10}` → Vercel auto-expires
    deployments only after 30 days, which is why 258 (4 days of bot deploys ≈ 7 GB) had piled up.
- Deleted 239 old deployments via `DELETE /v13/deployments/:id?hard=true&teamId=...` (path-style;
  the query-style `?id=` form returns nginx 405 — wrong shape).
- Rate limit: `now-rm` 200 deletes / 10 min window → paced 1 delete per 3.5 s, self-healing on 429
  (sleep until `limit.reset`). Result: `ok=238 fail=0` (plus 1 probe delete → 239 total).
- Final state: **6 deployments** — the 5 newest auto-deploys + live production
  `dpl_BFyKaKp6VEY2Z6cahd7ho6hQh3ok` (the only one aliased; serves both `jachaidesk.com` and
  `newsdesk-bd.vercel.app`). Vercel's own `deploymentsToKeep:10` also pruned concurrently.
- Verified liveness after cleanup: `https://jachaidesk.com` HTTP 200, `https://newsdesk-bd.vercel.app` HTTP 200.

## Conclusion
Old deployments never affect performance (only the aliased live deployment serves traffic) —
deleting them is safe. Storage is now well within the Hobby 10 GB cap. If the warning recurs,
re-run the paced prune (counter stays ~6 because the bot redeploys every few minutes and Vercel
keeps only the newest ~10). Temp scripts: `/data/data/com.termux/files/usr/tmp/opencode/prune*.mjs`,
data files `all-deploys.json`, `vercel_clean*.cjs` (from D48).