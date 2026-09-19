# Session — 2026-09-19 site design: repo research + QuietPages pick

## What happened
- User asked: find a suitable GitHub repo for the news site design + feature requirements; said they'd
  give "headings" (blueprint) then discuss. They then pasted a detailed Bengali news site blueprint
  (routes, content collections, newspaper-grid design, fonts, nav, features, 100-speed checklist, SEO,
  build order) as a "hint", not fixed.
- Investigated GitHub/astro.build themes. All good news-specific premium themes (Astromag $, Publica,
  Semnal, Acta Cosmica) are PAID → rejected (zero-budget). Free shortlist:
  - **QuietPages** (xocothemes/quietpages) MIT, Astro 7 + Tailwind 4 + MDX — editorial magazine,
    full-bleed lead, category/tag/author, archive search, related, breadcrumbs, self-hosted fonts,
    JSON-LD, OG, RSS/sitemap/dynamic robots, dark mode. → RECOMMENDED.
  - Revista (Astro 5 + React; more blog, no search), Fyrre (DaisyUI + Sanity dep), Kilde (too thin),
    fromthedumpsterfire (literary) — alternatives.
- Mapped blueprint features → QuietPages: ready (hero+grid, sticky nav, hamburger, related, RSS/sitemap,
  JSON-LD, dark, self-hosted fonts) / modify (Bengali fonts, Pagefind replace archive search, category
  colors, share buttons) / build ours (VerificationBadge+EvidenceList+SourceList, breaking ticker,
  per-article lang).
- User: "i am going with your recommendation" → QuietPages base confirmed.

## Decisions (recorded in MEMORY.md/json as D13+)
QuietPages base · Pagefind search (focus-loaded) · dark mode kept · static breaking ticker bar ·
Bengali fonts Noto Serif Bengali + Hind Siliguri self-hosted · English slugs + per-article lang ·
badge on cards + article header.

## Assumptions made (stated, reversible)
Search deferred-load via Pagefind; ticker included v1; dark mode kept; badge on homepage+article.

## Status / next
- Scaffold `site/` from QuietPages, re-skin, components, sample articles, build + Lighthouse.
- NOTE: pipeline session is running IN PARALLEL (Phase 3 done: 43 clusters on 456-item sample).
  Memory files shared — edits kept surgical to avoid clobbering pipeline session writes.