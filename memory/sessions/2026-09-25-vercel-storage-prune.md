# 2026-09-25 — Vercel storage cleanup (D105)

## What the user reported
> "go to vercell, you will find there deployemnt storage is full, limit is 10 GB
> so delete old deployment memory and make some free space"

## What I measured first
| Check | Result |
|---|---|
| Build root | `meta.gitRootDirectory = "site"` |
| Does `pipeline/state/store.db` (79 MB) reach Vercel? | **No** — build never leaves `site/` |
| Error that actually blocked us | `api-deployments-free-per-day` (a daily deploy COUNT) |
| Retained deployments | **44** (42 production/PROMOTED, 2 ERROR) |
| Project API storage/limit fields | none exposed |

So the deploy failure was a count limit, not storage — but 44 retained
deployments were genuinely accumulating storage, and the user had seen
something real in the dashboard. The prune was worth doing.

## Part 1 — dead payload in the deployed JSON
`site/src/data/event-graph.json` (57 MB) is uploaded and JSON-parsed on every
build. `versions` was 7.5 MB across 423 claims and read by nothing:
`src/lib/graph.js` uses only `meta`, `stories`, `events`, `cluster_id`.
Removed from the **writer** in `pipeline/tools/event_graph.mjs:59` only.
`storyVersions()` stays exported and stays tested.
**57 MB → 45 MB.** 415 stories, 59,571 events, all 7 site-read fields intact.
286/286 tests.

## Part 2 — deployment prune
- Kept `dpl_9U9aVk5whsBxKuPMjD2wS3EngGCH` — verified via `/v13/deployments`
  that it holds all three aliases: `jachaidesk.com`, `newsdesk-bd.vercel.app`,
  `newsdesk-bd-man-of-technology.vercel.app`.
- Kept the 4 most recent besides it for rollback.
- Deleted the 38 oldest (2026-09-19 → 2026-09-25T17:24). All returned 200.
- **5 deployments remain.**
- The script aborts if the live uid is ever missing from the list, so it can
  never delete-by-recency into the live deployment.

## Site verified AFTER the prune
- homepage → 200
- `/article/national-551` → 200, real title, 36,521 bytes
- `/article/national-125` → 404 (prune is live)
- `news-sitemap.xml` → 377 entries

## Also confirmed: the site caught up
While checking, the live site was found to be serving commit `6ae1e34c` —
the prune, the coherence guard and the event-graph fix are **all live**.
Sitemap went 514 → 377 and `national-125` now 404s.

## Not done, and why
`claim_evidence` holds 58,015 rows but only 914 distinct `(claim_id, url,
excerpt)` — 63× duplication worth ~47 MB. Deleting the duplicates is unsafe:
`lib/claim-verify.mjs:190` compares a stored `evidence_hash` to a recomputed
one, so dedup changes the hash and every affected claim closes and reopens a
snapshot period — a fake "re-verified" event on already-published article
timelines. Needs a hash-rewriting migration, not a `DELETE`.
