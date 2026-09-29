# 2026-09-29 — Still no new news: mega-cluster root cause + fix (D126)

User: "check now, after that no new news. can u find the real cause please".

## State found (Sep 29 ~07:00 UTC)
- Homepage top still 28 Sept. Pipeline fetch runs every ~30 min (green), auto-author
  runs green (05:56 success, 06:34/07:13 runs) but publishes NOTHING since Sep 28 22:00.
- `pick.json` pending 0 again. 05:56 run log: 220 thin (<100w), 26 incoherent,
  266 title-dups. Resolve works (141 urls / 81 briefs).
- Fresh intake IS arriving: national-674/675/676/677 dated Sep 28-29, open, tier A.

## Real cause: number-chained mega-cluster (national-672)
Today's fresh stories (France-Belgium 676, Salman arrest 677, GPT-6.1, Hormuz,
Italy win, cricket, Mirpur crime, newspaper roundup) were clustered into ONE
9-member brief headlined GPT-6.1. Coherence gate rightly refuses it → 4+ fresh
stories die together. Verified member bodies match their own URLs (no retext rot).

Mechanism: `strongAgree` rule (1) merged on ANY 2 shared strong tokens, and
numbers have no rarity gate. Measured on the real brief: ALL 36 member pairs
agreed via mundane small numbers alone (N0/N1/N3 from scores/times/counts —
present in nearly every Bengali text) plus year N2026. Same-outlet widget
sharing added one cosine link (m0-m1 0.309). Union-find chained the window.

## Fix (committed fc7535ea, merged 6ac05a23, pushed)
`pipeline/lib/entities.mjs`: rule (1) needs a DISTINGUISHING shared token
(lexical, or 3+ digit non-year number); years 1900-2100 never distinguishing;
`anyCloseLargeDigit` skips years (consecutive years are digit-close by
construction). Tests: new mega-cluster cases in entities.test.mjs (8/8);
golden F1 stays 1.000; full suite 382/382.
Verified on real brief: 9-way group → {m0,m1} football pair + 7 singletons.

## Caveats / known limits
- Mega-clusters are RARE: census of all 629 briefs shows only two open briefs
  with 6+ members (672 n=9, national-145 n=7 Sep-20). The 0-pending is mostly
  220 thin + 266 title-dups; this fix unblocks the fat-but-chained class.
- Singletons never form clusters (min 2 members): m7 GPT, m6 Hormuz etc. stay
  unpublished until a second outlet corroborates — by design (verified brand).
- Wrapper-only briefs from Cloudflare-blocked outlets (kalerkantho/jamuna/
  jugantor 403) stay thin: unrecoverable without proxy/reader. Samakal partial
  (~87w) still under the 100 floor.
- Old mega-cluster ROW persists in CI store.db (nothing splits existing
  clusters; items can multi-join new ones). Its brief keeps being rewritten +
  refused — harmless. New split briefs form alongside.
- Did NOT touch: homepage sort, extractor files, brief/state files.

## Verification pending at time of writing
Pipeline run with fix (07:31, head 6ac05a23) in progress; confirm next: 672
splits in fresh briefs, pick pending >0, auto-author publishes, deploy ships,
jachaidesk shows Sep-29 stories.

## D128 follow-up (same day, ~10:50 UTC)
Pick still 0/0 at 10:10 (234 thin, 28 incoh, 266 dups) despite clean fresh
clusters. Root-caused to the MATURITY counter: every touch reset mature_runs
to 0, including identical re-formations — stable pair 691 never matures.
Fixed (growth-only reset, c99abe1b). 691/679-class briefs should mature
within ~3 runs and publish IF they clear the mechanical audit (679 currently
fails c9-159w<180 + rep1 + c14; 681 fails c14 + c6-hype — flagged, not changed).
Also: runs queueing on GH runners (pending), deploys lagging (last 08:36),
push races from all sides (incl. my own pushes — batched going forward).
