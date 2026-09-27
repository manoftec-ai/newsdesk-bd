# Vercel storage audit + GitHub Actions cost audit

Date: 2026-09-27 23:59 +06:00
Nature: read-only investigation. No site content, no pipeline config, no deploy logic changed.

## 1. Deployment Storage (the 10 GB question)

Hobby includes **10 GB of Deployment Storage** (Vercel changelog 2026-08-21). Exceeding it **blocks new deploys** until storage is freed.

**There is no public API for the current byte count.** `GET /v2/usage` only accepts these types:

```
requests, monitoring, builds, edge, edge_group_by_project, artifacts,
edge_config, log_drains, storage_postgres, storage_redis, storage_blob,
cron_jobs, data_cache
```

`deployment_storage` is **not** among them. All storage types read `data: []` for this team, including `artifacts` (which is not deployment storage). The byte figure is dashboard-only.

Date format for `v2/usage` is strict: **`from`/`to` must be RFC3339 with milliseconds** — `2026-09-01T00:00:00.000Z`. Bare `YYYY-MM-DD` and raw epoch-ms both fail with `invalid_from_date`.

Retained deployments at audit time: **16** on `newsdesk-bd`, 0 on `rap-calculator`, 0 on `tutor-finder`. Even at the 100 MB Hobby per-deploy ceiling that is a worst case of ~1.6 GB, so effectively all 10 GB remains free.

**Confirms the D105 note:** pruning deployments does **not** raise the 100/day deploy allowance. That counter tracks *attempts*, not retained deployments.

## 2. The real constraint is GitHub Actions, not Vercel storage

Sampled 1,500 workflow runs (the 30-day window contains at least this many):

| Workflow | Runs / 30d | Billed minutes |
|---|---|---|
| deploy | 338 | |
| images | 227 | |
| Lighthouse | 201 | |
| pipeline | 156 | |
| telegram | 154 | |
| auto-author | 142 | |
| facebook | 145 | |
| whatsapp | 55 | |
| heartbeat | 37 | |
| **total** | **≥1,500** | **≥8,450** |

Free tier is 2,000 minutes/month. We are **≥4.2× over**.

## 3. The avoidable waste: 354 runs/month that clone 343 MB to make one POST

`telegram.yml`, `facebook.yml`, `whatsapp.yml` each run on a schedule **and** on `workflow_run` of six sibling workflows. Every run does:

```yaml
- uses: actions/checkout@v4
  with: { fetch-depth: 0 }   # full clone of 343 MB .git
- run: npm ci               # installs sharp, cheerio, rss-parser
- run: node tools/telegram_post.mjs
```

Actual imports of all three posting scripts:

```js
node:fs, node:path, node:url, yaml
```

**`sharp` is never imported by any of them.** So a native image library is compiled and downloaded, and 343 MB of history is cloned, ~354 times a month, to read one JSON state file and call an API. This is the single largest and most obviously fixable cost in the project.

## 4. Vercel Sandbox — evaluated, and where it actually fits

Hobby allowance: 5 h active CPU, 420 GB-hr memory, 5,000 creations, 20 GB egress, 15 GB snapshot, 10 concurrent, **45 min max session**, 4 vCPU / 8 GB / 64 GB disk per sandbox. Downloads *into* a sandbox are free. **Hobby never overage-bills — exceeding a quota pauses the feature for 30 days.**

**Rejected: build validation in a sandbox.** Builds measure **41 s median, 55 s max**. At 24 deploys/day that is ~8 active CPU-hours/month, which alone exceeds the entire 5-hour budget. Bad trade.

**Fits: the 354 posting jobs.** Copy in one script + one state file (`telegram-sent.json` ~148 B), run, copy back. ~5 s each → roughly 30 CPU-minutes/month, about 10% of budget.

**Fits: heavy off-phone work.** `event-graph.json` is 54 MB and `store.db` is 98 MB; 4 vCPU / 8 GB beats an Android handset, and snapshots keep the DB warm. Must stay infrequent or it eats the budget.

**A Vercel Function would be marginally cheaper for the posting jobs** (Hobby includes 1M invocations + cron), so Sandbox is an optimisation here, not a requirement.

## 5. The biggest cost in this project is neither of the above

- `site/src/data/event-graph.json` = **54 MB**, JSON-parsed on **every** Vercel build. Inflates build time *and* counts directly against the 10 GB Deployment Storage.
- `.git` = **343 MB**, because that 54 MB file is committed on every pipeline run.

D105 already cut 57 MB → 45 MB by dropping the unread `versions` key. It has since grown back to 54 MB. Shrinking or splitting this payload is worth more than any sandbox work, and it needs a real fix, not a compute offload.

**Caveat carried forward:** Hobby is non-commercial / personal use only, and this is a live news site. Keep the pipeline on GitHub Actions; treat any Vercel compute as an optimisation, never a dependency.
