# Session — History Archive Batch 7: ≥100 Milestone Reached (112 live)

> Date: 2026-09-21
> Project: newsdesk-bd

## What happened
- Authored and published **batch 7 = 15 history articles**, bringing the history archive to **112 live files** — passing the user's "publish 100+ historical news articles" milestone (D42).
- Two content arcs: (1) 1970–72 Bangladesh milestones, (2) world-history anchor events.

## Batch 7 articles (15)
BD 1970–72: `election-1970-awami-league-sweep` (1970-12-07, 160/162 general seats), `agartala-conspiracy-case-1968`, `declaration-of-independence-1971` (1971-03-26), `operation-searchlight-1971` (1971-03-25), `instrument-of-surrender-1971` (1971-12-16), `bangabandhu-return-1972` (1972-01-10), `constitution-1972-adopted` (1972-11-04), `swadhin-bangla-betar-kendra-1971` (1971-03-27).
World: `wall-street-crash-1929`, `spanish-flu-1918` (1918-03-11), `atomic-bombings-1945`, `rwanda-genocide-1994`, `march-on-washington-1963`, `sputnik-1957`, `montgomery-bus-boycott-1955`.
- Fact packs: `pipeline/state/history/batch7-{a..e}.json` (3 articles each) = source of truth for re-runs.
- Bodies 204–240 words, all ≥3 sources, no Latin text in body/keyPoints/seoTitle/seoDescription, real event dates (kept off homepage automatically).

## Fixes along the way
- Replaced dead/blocked source URLs (curl-verified all): Britannica (403), `archives.gov/milestone-documents/statement-by-the-president` (404), `archives.gov/exhibits/featured-documents/mlk-letter/...` (404), `archives.gov/legislative/features/montgomery-bus-boycott` (404), LOC exhibit (403), nmaahc (403), ushmm/rwanda (404) → live equivalents: with `history.com` topic pages, `archives.gov/mlk`, `constituteproject.org`, `federalreservehistory.org`, `archive.cdc.gov`, `wwwnc.cdc.gov/eid`.
- Latin in Bengali text (must write 0%): removed `(Black-Bangla Betar Kendra)`, `(A. Philip Randolph) ও বেঞ্চাভ (Bayard Rustin)` → `ফিলিপ র্যান্ডলফ ও বায়ার্ড রাস্টিন`, `(radio signal)` → `বেতার তরঙ্গ`, stray Cyrillic `через` in constitution body.
- Validation secret: ping Latin check on RAW values, not `JSON.stringify` (the `\n` escape contains the letter `n` → false positives).

## Commit / deploy
- Commit `7f51c68` (20 files, +1351) → rebased cleanly on top of remote thumbnail auto-commit `274e6d4` (batch-6 thumbnails 15/15 confirmed applied) → pushed as `0b5349d`. Working tree clean.
- Batch-7 thumbnails will be branded by `.github/workflows/images.yml` on the next workflow run (push on `site/src/content/news/**`).

## State
- 112 `history-*.md` live; site content dir total ~189 files (fresh + history + anchors).
- Batch-5 thumbnails confirmed applied earlier (15/15 via `af175e0`); `site/public/images/history-*.webp` = 82.

## Next
- D42 milestone done. Continue opportunistically (1998 flood, 2004 tsunami, Sundarbans spill 2014, Bangladesh Bank heist 2016, Covid-2020, more 1971 war events) — same generator + fact-pack pattern.
- Verify batch-7 thumbnails after next images.yml run; consider optional `/history` index page.