# Session — SEO audit + fixes (2026-09-27)

User: "find out anything in seo that can be improve"

## Method
Read BaseLayout, all 3 sitemaps, RSS, robots, search/404/news/authors/districts/factcheck pages, PostCard, Giscus, theme config, seoDescription generators; measured the 398-article corpus (titles, descriptions, thumbs, alts, sources, dates, tags); fetched live robots.txt + news-sitemap.

## Found healthy (no action)
Canonical/OG/Twitter base, robots + 3 sitemaps, JSON-LD graph (NewsArticle+Breadcrumb+FAQ+ClaimReview), 0 dup/long titles, 0 missing thumbs/alts, 0 future dates, lazy Giscus, IndexNow wired, all-bn (no hreflang need), tag pollution not real (all 50 cricket tags verified genuine).

## Fixed (commit faaa326, pushed, in-sync)
1. news-sitemap 48h cutoff (was all 398 — spec violation).
2. sitemap.xml: all content tags, homepage/news lastmod=today, +authors/desk, −/search.
3. noindex,follow on /search + /404 (new BaseLayout robots prop).
4. /news paginated 30/page with rel prev/next (new [...page].astro, old index removed).
5. og-default.png generator + images.yml step (SVG fallback broke all hub shares); PNG fallback + dims/type/locale + article meta; logo JSON-LD → PNG.
6. RSS capped at 50.
7. 72 long seoDescriptions trimmed (incl. 15 multi-line folded scalars rewritten single-line); 398/398 YAML-valid.

## Verify live after Vercel deploys
- /images/og-default.png exists (after images.yml runs once).
- news-sitemap.xml shows only ~last-48h URLs.
- /news/2 renders; /search has noindex.

## User actions (code-ready, needs their accounts)
- GSC HTML-tag token → SEO.googleSiteVerification (D46 slots).
- FB Page + Telegram secrets (D46).
- News sitemap submission in GSC/Publisher Center.
