# TODO — JachaiDesk Expert Site Upgrade (Broad Audit 2026-09-24)

> Source: website-expert audit 2026-09-24 (13 points across Trust, UX, SEO, Performance, Distribution, Monetization)
> Owner: Zulfikar Rahman — zero budget, Vercel Hobby, Astro static. FB/Telegram = USER will do later (marked ⏸).
> Pipeline: 473 articles live, Lighthouse 100/100, news-sitemap + IndexNow live, auto-publish 30m.

## How to use
- P0 = ship first (trust + homepage = ranking bottleneck). P1 = ranking + retention. P2 = scale + revenue.
- Each item: What / Why / Files / Effort / Done-when.
- Check `[ ]` → `[x]` when shipped, keep commit hash.

---

## P0 — Trust & E-E-A-T (differentiator: "most verified")

- [ ] **P0-1 Trust badge prominence + ClaimReview**
  - What: `PostCard` badge + `evidence` count in card subtitle; article top expands full `evidence[]` + `headline.support%`; add `ClaimReview` JSON-LD for `category=factcheck` only.
  - Why: Google fact-check carousel + E-E-A-T signal; verification is your moat.
  - Files: `site/src/components/PostCard.astro:19` + `VerificationBadge.astro` + `site/src/pages/article/[slug].astro` + `site/src/lib/news-data.js`
  - Effort: S (0.5 day) — no infra.

- [ ] **P0-2 Author authority page + NewsArticle schema**
  - What: `/authors/desk` with photo, methodology, corrections count, `sameAs` FB/Telegram; every `NewsArticle` emits `author: Person` + `isAccessibleForFree` + `NewsMediaOrganization` publisher (logo 600×60).
  - Why: AdSense + Discover require identifiable publisher; otherwise E-E-A-T = low.
  - Files: `site/src/pages/authors/[slug].astro`, `site/src/config/theme.config.ts: authors`, `site/src/layouts/BaseLayout.astro` JSON-LD
  - Effort: S

- [ ] **P0-3 Corrections as product**
  - What: Fill `/corrections` with living log (even `0 corrections` + date); article shows `updated` vs `date` + `correctionNote` microcopy; breaking stories get `expires`.
  - Why: Trust + Google `corrections` policy = ranking.
  - Files: `site/src/pages/corrections.astro`, `pipeline/lib/reverify.mjs`, `site/src/pages/article/[slug].astro`
  - Effort: S

## P0 — Homepage Hierarchy (attention is leaking)

- [ ] **P0-4 Above-the-fold hierarchy**
  - What: Lead = hero (16:9 eager image, badge prominent, 2-line excerpt); secondLine 4 = text-only mini-rows with `mini-row-meta` time+author; category sections 2×2 not 4×3; keep ticker to 3 static headlines, no auto-play.
  - Why: Current `lead + secondLine 4 + homeSections 4×3 = 17` same weight → scroll fatigue, LCP dilution.
  - Files: `site/src/pages/index.astro:14` (`lead`, `secondLine`, `homeSections`), `site/src/styles.css: lead-article`
  - Effort: M (1 day, no data change)

- [ ] **P0-5 Hero image priority**
  - What: Lead image `loading=eager` + `fetchpriority=high`, preload `serif-700` only on article, not homepage.
  - Why: LCP is font-bound (optional) — image LCP will beat it.
  - Files: `site/src/pages/index.astro`, `site/src/layouts/BaseLayout.astro`
  - Effort: S

## P1 — SEO & Discoverability (indexing on, ranking not)

- [ ] **P1-6 Evergreen SEO hubs**
  - What: Create 5 static hubs (not pipeline): `/ghotona` exists — add `/kivabe-jachai-kori`, `/utso-niti`, `/jachaier-poddhoti` FAQ with `FAQPage` schema + internal links from every article's `কী এখনো জানা যায়নি`.
  - Why: You rank for 0 head terms; Prothom Alo steals long-tail.
  - Files: `site/src/pages/*.astro`, `site/src/content/news` internal link injection
  - Effort: M

- [ ] **P1-7 Internal linking — restore Related**
  - What: Re-enable `relatedStories()` from `lib/event-graph.mjs` as 3 links max under article, title-only, `data-pagefind-body` excluded.
  - Why: Deleted D79 → crawl depth 2, Pagefind relevance collapses, dwell time low.
  - Files: `site/src/components/RelatedStories.astro` (recreate), `site/src/pages/article/[slug].astro`
  - Effort: S

- [ ] **P1-8 Sitemap truth**
  - What: `sitemap.xml` lastmod = per-article `date`/`updated` (not static `2026-09-19`); add `sitemap-images.xml` for thumbnails.
  - Why: Discover pulls only from image sitemap; stale lastmod = recrawl deprioritized.
  - Files: `site/src/pages/sitemap.xml.js`, `site/src/pages/sitemap-images.xml.js` (new)
  - Effort: S

- [ ] **P1-13 Publisher pages for AdSense (monetization prep)**
  - What: Fill `site/src/pages/{privacy,terms,about,contact}.astro` with real Dhaka address + `publisher` JSON-LD `NewsMediaOrganization` (logo, foundingDate).
  - Why: AdSense rejects without these; keep ad-free until then — CLS from ads kills 100.
  - Files: `site/src/pages/privacy.astro` etc., `site/src/layouts/BaseLayout.astro`
  - Effort: S

## P1 — Performance & UX (lab 100 ≠ field 100)

- [ ] **P1-9 Font discipline guardrail**
  - What: Keep 2 faces only (`Noto Serif 700 + Hind Siliguri 400`), never add 500/600; `preload` serif-700 only on article; `pagefind-ui.css` via `media=print`.
  - Why: Only real perf risk; one extra weight = LCP +1.2s.
  - Files: `site/src/layouts/BaseLayout.astro`, `site/public/fonts/`
  - Effort: S — lint check

- [ ] **P1-10 Search index rebuild**
  - What: Verify `search-index.mjs` runs on Vercel `build` (`site/package.json:11`) and `9 index + 605 fragments` are on current deployment alias, not stale; keep `data-pagefind-body` on `<main>`.
  - Why: Stale alias = 404 fragments = empty search.
  - Files: `site/scripts/search-index.mjs`, `site/src/pages/search.astro`
  - Effort: S

## P2 — Growth & Ops (scale after trust)

- [ ] **P2-11 Push + Analytics (own the audience)**
  - What: Enable `Vercel Web Analytics` (dashboard toggle, script already in BaseLayout), add Plausible via Cloudflare free + OneSignal free 10k web-push + 1-field newsletter (Resend free 3k/mo) in footer.
  - Why: Pipeline without retention = churn; news lives/dies on push.
  - Files: `site/src/layouts/BaseLayout.astro`, `site/src/components/Newsletter.astro` (new)
  - Effort: M (mostly dashboard)

- [ ] **P2-12 PWA offline + monitoring**
  - What: Add `manifest.json` + `service-worker` cache for article HTML (Astro PWA), add `pipeline/tools/health_check.mjs` daily GH cron alerting if `pending==0` for 6h or `store.db` not growing.
  - Why: Offline reading + ops visibility; pipeline silent fails today.
  - Files: `site/public/manifest.json`, `site/src/pages/manifest.json.js` (new), `.github/workflows/health_check.yml` (new)
  - Effort: M

## ⏸ User-deferred (you will do later — not in dev queue)

- [ ] **FB Page + Telegram channel activation** — create FB Page `যাচাইডেস্ক` + long-lived `pages_manage_posts` token → `FACEBOOK_PAGE_ID/TOKEN` secrets; Telegram bot+channel → `TELEGRAM_BOT_TOKEN/CHAT_ID`; GSC HTML-tag → `SEO.googleSiteVerification` in `theme.config.ts:23`. Code already live (`facebook.yml` + `telegram.yml` cron `*/20` secret-gated, silent-skip until then). Google ignores IndexNow — GSC is required for 48h indexing.

---

## Suggested ship order (zero-budget)

**Week 1:** P0-1 → P0-2 → P0-3 → P0-5 (trust + publisher = unlocks AdSense + Discover)
**Week 2:** P1-8 → P1-7 → P1-13 → P0-4 (crawl + dwell)
**Week 3:** P1-6 → P1-9 → P1-10 → P2-11 → P2-12

Checklist rule: each `[x]` needs commit hash + Vercel deploy green + live fetch `200` on `/sitemap.xml` + `/news-sitemap.xml` + one article.
