# Session — jachaidesk publishing stall (2026-10-06)

User report: "jachaidesk is not publishing no new news."

## Verified facts
- Live site (jachaidesk.com, fetched 2026-10-06 ~21:45 Dhaka): newest items dated **4 Oct 2026**. No Oct 5/6 articles. Stall ≈ 2 days.
- CI is green but publishes nothing: `pipeline` runs every ~30 min (fetch OK, 43 new items/run), `auto-author` runs succeed with **pick 0/0 pending** (log of run 37486829043, 2026-10-06 15:24 UTC).
- Last auto-author commit that changed anything (7e6a85bc, Oct 6 00:15 UTC) touched only `events-news.json`, no new article.

## Root cause A (proven): GitHub runner IPs are blocked by publisher sites
- `resolve_sources` in auto-author run: 81 wrapper URLs resolved, only **8 article texts recovered, 80× http-403**.
- `enrich_bodies` in pipeline run: **attempted 150, improved 0, failed 128**.
- Same tool from Dhaka residential IP (this box): round1 **120/150 improved**, round2 ~90, round3 **62/150**, failures almost all `gain_below_threshold` (only 1× 403 total).
- Consequence: 16944/20849 raw_items still thin; evidence gate blocks ~420-520 briefs; composer marks the rest `short`; pending stays 0.

## Suspected cause B (needs confirmation): briefs ↔ release-DB skew
- Locally extracted brief `national-1874` (clusterId 1874, verdict passed) fails `runPublicationGate` with CLUSTER_CONTEXT_MISMATCH + VERDICT_MISSING + CLAIM_MANIFEST_MISSING + CLUSTER_MEMBERSHIP_MISMATCH against the release DB (max cluster id 1868).
- Possible CDN caching on the fixed release-download URL, or upload/download race. NOT yet proven; needs a sha/timestamp comparison of release asset vs briefs commit.

## Done locally (NOT pushed anywhere)
- Downloaded release DB (93.8 MiB, seen 2026-10-06T14:42Z), ran 3 enrich rounds (~270 bodies recovered).
- Backup: `/data/data/com.termux/files/usr/tmp/opencode/store-enriched-20261006.db`. Original pre-enrich backup: `store-backup-20261006.db` (same dir).
- Working tree restored clean (`git checkout -- pipeline/state/briefs/`); store.db is gitignored. **Enriched DB deliberately NOT uploaded** — upload would overwrite the release asset and may regress clusters 1869+ if the release moved on.

## Addendum — DB-skew check CLOSED (same evening, per user choice)
- Fresh release asset (updated 16:14:52Z, 94.3 MiB, clusters to 1889) vs HEAD briefs (max clusterId 1878): verdicts+members present for 1874/1878/1889. **No persistent skew.**
- The earlier mismatch (brief 1874 vs DB max 1868) was a stale mid-rotation download, not a live CI defect. Download path uses the API asset URL (no CDN cache issue); upload is delete-then-create with loud failure.
- Re-ran pick on HEAD briefs + fresh DB with CI env (PUBLISH_MIN_WORDS=100): **0/0 pending** (529 thin / 116 incoherent / 569 title-dups). Gate never receives a candidate.
## Permanent fix — reader fallback (same evening, user chose "permanent")
- New `pipeline/lib/reader-proxy.mjs`: Jina AI Reader fallback (anonymous tier verified live: full Prothom Alo article, no key). Used ONLY after direct fetch fails/thin. Guards: prose paragraph floor (rejects nav-furniture soft-404s — measured kalerkantho front page), 60-word + 400-Bengali-char floors, Title-overlap check vs expected headline.
- Wired into `extractArticle` (resolve_sources both paths gain it free) + `enrich_bodies` fetchText/bodyFrom (incl. keeping `--skip-unusable` hosts for reader recovery, `viaReader` report counter).
- Workflows pass optional `JINA_API_KEY` (empty until user adds free key; anonymous works meanwhile). No user step required.
- Tests: `test/reader-proxy.test.mjs` 10/10 offline. Full suite 502/505 — the only 3 failures are pre-existing on pristine HEAD (content-gate corpus, real-briefs, health-check stall alert).
- Live proof from Dhaka: real kalerkantho article (403 direct) recovered via reader, 336 words, title-matched; bogus URL rejected.
1. One-time unblock: verify release freshness, then upload enriched DB → next cron extracts/publishes.
2. Permanent runner-side fix options: Jina-reader fallback for 403 pages (needs free key as repo secret), RSS-fulltext source re-weighting, or scheduled enrich-from-home.
3. Investigate/fix B: cache-bust release download + gate observability (log gate-fail counts in pick).
