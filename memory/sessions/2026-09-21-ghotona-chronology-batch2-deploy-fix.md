# Session — Ghotona chronology batch-2 + deploy failure rescue (2026-09-21)

## Summary
- Shipped 3 more কালানুক্রম chronologies (commit `3c320d1`, pushed): 60 total entries across 4 events (4/82).
- **Deploy FAILED** for `3c320d1` — investigated and root-caused: NOT our chronology change.
  Root cause: the parallel session's history-author batch-3 files `(`publish_history.mjs`, auto-history
  workflow) wrote long Bengali `title:` values wrapping across lines with an unclosed double-quote
  (YAML: "can not read a block mapping entry; a multiline key may not be an implicit key",
  location `src/content/news/history-bm-container-depot-fire-2022.md:3:12`). Every Vercel deploy
  failed content-sync because of it → site was stuck at the `2e8dfba` build.
- Fixed 4 broken files: `history-bm-container-depot-fire-2022`, `history-cyclone-roanu-2016`,
  `history-nepal-2015-earthquake`, `history-xulhaz-mannan-tonmoy-killing-2016` — collapsed each
  wrapped title to a single-line double-quoted YAML scalar. Commit `026ee31`, pushed.
- Verified deploy green for `026ee31` (vercel + post success; lighthouse in_progress).
- Live verification: `/ghotona/` index shows "কালানুক্রম: 4টি ঘটনায় 60টি তারিখযুক্ত রেকর্ড";
  `/ghotona/rana-plaza-collapse` timeline renders; all 4 repaired articles HTTP 200 with full
  Bengali titles (`/article/history-nepal-2015-earthquake`, `/article/history-bm-container-depot-fire-2022`,
  `/article/history-cyclone-roanu-2016`, `/article/history-xulhaz-mannan-tonmoy-killing-2016`).
- Ran a full local content-dir YAML validation (installed js-yaml in tmp): all 147 content files parse OK.

## Notes / decisions
- New project memory decision **D43**: long wrapped `title:` frontmatter = deploy blocker. YAML
  double-quoted scalars cannot span lines. Future history/auto-authored batches must keep titles
  single-line. Diagnostic: check-run "vercel completed failure" → job log → js-yaml error line.
- Working tree now contains the parallel session's in-progress batch-4 authoring
  (15 untracked `history-*.md` + `batch4-*.json` states + some modified batch3/5 history files).
  Left untouched — stage only own files.
- Full diff review before commit; only the 4 repaired `.md` files were committed.

## Files changed this session
- 4 repaired: `site/src/content/news/history-{bm-container-depot-fire-2022,cyclone-roanu-2016,nepal-2015-earthquake,xulhaz-mannan-tonmoy-killing-2016}.md`
- Earlier this session (already in `3c320d1`): `site/src/data/events-news.json` (tazreen 10, rana-plaza 19, holly-artisan 14)

## Next steps
- Continue কালানুক্রম curation (suggest: `june-july-2024-quota`, `oust-hasina-2024`, `dengue-outbreak-season`).
- If next deploy fails, check history batch titles single-line first (D43).