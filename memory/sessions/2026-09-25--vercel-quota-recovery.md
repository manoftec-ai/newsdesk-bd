# 2026-09-25 — Vercel quota recovery and production deployment

## Outcome
- A direct production deployment completed successfully after the earlier free-plan quota error.
- Vercel built 635 static pages and aliased the deployment to `https://jachaidesk.com`.
- Live verification of `https://jachaidesk.com/article/national-496` confirmed the rewritten bus-fare figures are present.

## Operational lesson
- Vercel's `api-deployments-free-per-day` is a deployment-creation quota. Removing old deployments does not restore daily capacity.
- The previous retry-loop watcher (PID 31236) was already stopped. Do not use a shell retry loop that treats every command exit as success.
