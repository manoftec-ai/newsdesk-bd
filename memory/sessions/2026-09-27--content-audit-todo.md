# Content audit implementation list (2026-09-27, saved)

User rules: NO pipeline/ changes. Implement in order, verify each item fully
before the next. No questions — proceed on recommendations.

- [x] **T1: Track 5–8 big running stories.** Add registry entries in
  `site/src/data/tracked-stories.json` + `tracked:true/lastChecked` frontmatter
  on the articles (site-only; watcher picks them up). Verify: JSON parses,
  /tracked lists them, frontmatter YAML-valid.
- [x] **T2: Empty event hubs.** Split `/ghotona` index (covered = links,
  0-coverage = plain non-link cards); `noindex` on empty hub pages; exclude
  empties from sitemap.xml; dynamic per-hub summary header (counts/date range).
  Verify: link-integrity script (every internal href resolves), counts match.
- [x] **T3: Beat structure.** Unique descriptions per category in
  `site/src/config/theme.config.ts` + render on category pages; proper
  empty-state with related-category links for tech/opinion. Verify: pages
  render unique meta descriptions, empty states link correctly.
- [x] **T4: Excerpt rewrite pass.** 30 newest substantive stories where
  excerpt == body lead → genuine 1–2 line summaries (≤155 chars, meta-safe).
  Verify: YAML-valid, lengths, no excerpt==lead remainder in set.
- [x] **T5: Depth.** 3 explainers synthesized ONLY from in-repo chronology
  entries (rana-plaza, sagor-runi, holly-artisan; sources[] reused from
  chronology sourceUrls, zero new facts) + FAQ blocks on 10 longest
  articles lacking faq (Q&A strictly from body text). Verify: every claim
  traces to a cited URL, schema-valid, tests green.

Done: none yet. Commit+push after each verified item (standing rule).

Done: all 5 items implemented + verified + pushed (T1 0e26c1b, T2 1560df5, T3 aa991fd, T4 350c644, T5 29c7314). Pipeline/ untouched throughout.
