# 2026-09-30 — developing lane (instant publish + 2h/6h watch)

User request: fresh events were reaching the site hours late. Publish a first sighting
immediately, then go looking for other sources — **do not touch the story for 2 hours**;
if nothing new in 2h, keep watching 6 more hours; after 8h total, leave it as it is.
Batch deploys so the Vercel free limit is never at risk. Do not break the pipeline.
Backup first.

## What shipped
| Commit | What |
|---|---|
| `74fa653c` (merged `6ad66567`) | phase 1 — `promote_developing.mjs` solo-cluster promoter, developing maturity exemption, `publishedAt` |
| `ad28d474` | phase 2a — `developing` frontmatter, "যাচাই চলছে" badge + notice, `uncorroborated` bug fix |
| `3379bf21` (merged `8944b1e2`) | phase 2b — `refresh_developing.mjs` watch/enrich/upgrade tool + pipeline step |
| `fc62b9ce` | English-copy gate on the instant lane |
| backup | tag `pre-developing-lane` → 0dc58b5e |

Suite: 391 → 413 → 430 → 431, all green. Golden clustering F1 unchanged at 1.000.

## Root cause of the lateness (worth remembering)
`cmdCluster` skips singletons on purpose, and maturity then demands 2-3 quiet runs.
So a story only one outlet had reported could not publish at all until a second outlet
clustered with it — and then still had to age out. The lane removes the wait for a
qualifying first sighting and hands the waiting over to `refresh_developing.mjs`.

## Rules encoded (all test-enforced)
- 0-2h: nothing is written, whatever arrives (`phaseOf` → `quiet`).
- 2-8h: a new outlet gets an attributed note + body line; badge only if the cluster
  verdict is confirmed/verified + passed; an unresolved conflict is held for a human.
- >8h: frozen, left exactly as it is.
- `publishedAt` is never rewritten (only `updated`); an already-credited outlet is not
  new, so a touched story is untouched next cycle.

## Deploy batching (no new machinery)
Refresh writes inside the pipeline run that the single `Commit state` step commits →
one commit per cycle. That push is a bot token, so deploy.yml's push trigger does not
fire; updates ship on the next hourly deploy (`17 * * * *`) with everything else. A
quiet cycle writes nothing at all, so Vercel attempts stay flat.

## Defects found while building
1. `frontMatter` interpolated `fm.uncorroborated` — a property the `fm` object never had
   — so every article got `false` and the tier-A single-source notice never rendered.
2. `VerificationBadge.astro` re-resolved `BADGES[badge.key]`, discarding the label it
   was handed.
3. **The instant lane was about to publish English wire copy** (guardian-world ×2,
   prothomalo-en) as Bangla news. Caught in a live dry run 15 minutes after phase 1
   shipped. Now requires ≥60% Bangla letters across title+body, measured on the text.

## Not done
- `publishedAt` is data-only: no display, no sort use, no "just published" treatment.
- No live developing article yet at time of writing — the end-to-end path is proven by
  tests (26 new) and a dry run, not by an article on the site.
- Site build is not runnable on Termux (`satteri` has no android-arm64 binary), so the
  site-side checks assert `news-data.js` behaviour directly.

## Note for future sessions
A parallel session (D131, Facebook auto-post) is editing this same checkout. Always
`git add` only your own files, and expect push races — merge in a throwaway worktree.

## Overnight verification (user asleep, ~17:00-18:00 UTC)
- Full pipeline run 36744699240 (head fc62b9ce): **all 22 steps green**, including
  step 9 "Promote developing first-sightings" and step 18 "Refresh developing
  stories". Nothing in the existing pipeline broke.
- Live DB: the promoter created 5 fresh solo clusters (#840-844, all Bangla
  headlines); Verify scored all five tier=A / score=2 / badge=single /
  status=passed — exactly the developing-lane shape. The next auto-author cycle
  should publish the first live `developing: true` articles from them.
- Suite re-run on the merged tip: 431/431. Promoter dry run: 5/111 candidates.
  Refresh dry run: 0 developing articles yet (none published — consistent).
- Vercel usage: 7 deploys in the last 24h of a 100/day limit. The lane + the
  images dispatch add only real-change deploys; the guard still skips quiet runs.
