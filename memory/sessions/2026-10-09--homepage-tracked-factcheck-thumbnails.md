# Session — homepage thumbnails for tracked + factcheck (2026-10-09)

User tasks: (1) tracked/factcheck homepage sections get thumbnails like other sections;
(2) find why they don't update; (3) don't break pipeline; (4) check live site before reporting.

## Task 1 — done, verified live
- `site/src/pages/index.astro`: both sections now use the `.mini-row` pattern
  (thumbnail + badge + headline + date/author), identical to সাম্প্রতিক খবর.
  Commit f7a10056, pushed. Live HTML confirms `<img src="/images/national-496.webp"...>`
  in tracked and `/images/sports-2678.webp` in factcheck.

## Task 2 — real causes
- Tracked DOES update: watcher.yml runs daily green; registry 8 stories, all
  lastChecked 2026-10-08, update counts 7–15 and growing; /tracked shows
  "শেষ চেক: ৯ অক্টোবর". Perceived staleness = (a) no thumbnails (looked static),
  (b) only 8 curated stories — watcher updates existing but never auto-adds new
  ones (curation by design), (c) homepage reads frontmatter `tracked:true`
  (7 files) while /tracked reads the registry (8; national-571 has no
  `tracked:true` yet) — minor source gap, left as is.
- Factcheck: no authoring lane exists (fact-checks need human investigation);
  only curated items appear. Pipeline occasionally flags `factCheck:` items
  (e.g. sports-2678 published Oct 9) — so it DOES refresh, just rarely.
- No code changes for either — nothing broken.

## Task 3 — pipeline untouched
- `git status` showed only `site/src/pages/index.astro` modified. No
  pipeline/, workflow, or config changes.

## Task 4 — live verification
- Deploy queue cancelled 4× (bot cadence vs build time); a manual dispatch
  landed it. Verified live HTML 2026-10-09 ~14:04 UTC: fresh Oct 9 hero +
  thumbnails in both sections. Lighthouse run at 13:05 failed on the PRE-CHANGE
  site — pre-existing, not from this edit.
