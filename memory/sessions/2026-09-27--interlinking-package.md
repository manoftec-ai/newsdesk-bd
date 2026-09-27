# Session — interlinking package (2026-09-27)

User: "my site jachaidesk is going in modification. but i did not do any interlinking. your task is to see whats the opportunity we have here? and implement that"

## Audit (398 articles, jachaidesk.com / newsdesk-bd repo)
- In-body internal links: ~0 (7/398 files, 14 links total). Biggest SEO gap.
- 92/398 articles tagless → out of every tag cluster, weak relatedPosts.
- `adjacentPosts()` existed in lib, never rendered → article dead-ends.
- Related block only 3 items, crude score, no recency.
- 90 real content tags had NO /tags page → tag chips linked to 404.
- Hubs (/tags, /category, /ghotona) linked down only, never sideways.

## Implemented (commit 6c4ef7b, pushed, main in-sync with origin e0fcf30..6c4ef7b)
1. `site/src/lib/news-data.js`: relatedPosts 3→6 + recency tiebreak; new `relatedTags()` co-occurrence helper.
2. `site/src/pages/article/[slug].astro`: "একই প্রসঙ্গে" context box (2 headline links after body) + prev/next nav; related grid renders 6.
3. `site/src/pages/tags/[slug].astro`: getStaticPaths covers every distinct content tag + count + related-tags box.
4. `site/src/pages/ghotona/[slug].astro`: sibling-events cross-links.
5. `pipeline/tools/backfill_tags.mjs` (new): rule-based backfill, dry-run default; applied once → 0 tagless.
6. `pipeline/tools/history_author.mjs`: anchors carry history + event-category tags (was `tags: []`).
7. `pipeline/lib/synth.mjs` inferTags: standalone-word matching (বাসা/হামলা false friends fixed; inflections ঢাকার/নারায়ণগঞ্জে/ঢাকাসহ match) + category fallback (≥1 tag always).
8. Deliberately NO LLM-written in-body links: model cannot know real /article slugs → would hallucinate 404s. Template box covers all pages instead.

## Verification
- Full pipeline suite 348/348 (incl. 2 new inferTags tests: category fallback + বাসা/হামলা false friends; one Rey test caught ঢাকাসহ recall gap → সহ added to suffix list).
- All 398 frontmatters YAML-parse with tags arrays. `node --check` clean.
- Deploy: Vercel auto-deploys from push (not locally verifiable from Termux; watch deploy log).

## Concurrency note
- Parallel bot session committed a174813 mid-work and swept in-flight news-data.js edits into it; origin moved twice during session (e0fcf30). Pattern held: stage own files only → commit → pull --rebase (clean) → push → verified in-sync.
- Bot's a174813 NOTE flagged my mid-fix synth state as breaking a test; fixed before commit (সহ suffix) — final state green.

## Open / next
- Watch Vercel deploy for the push; spot-check an article page (context box, prev/next), a thin tag page, a ghotona page (siblings).
- Consider: same-event "developing story" cross-links for tracked/updates articles; district hub intro text; noindex audit for 1-article tag pages (63 single-use tags remain, now at least resolvable + sideways-linked).
