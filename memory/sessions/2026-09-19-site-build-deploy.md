# Session — Website: build + deploy (newsdesk-bd)

> Date: 2026-09-19 · Parallel track: site design (pipeline session runs separately)

## What happened
- User confirmed: **no local build on Android — deploy/build on Vercel directly.**
- Full Bengali re-skin of QuietPages (Astro 7 + Tailwind 4 + MDX) written:
  - `src/config/theme.config.ts` — SITE identity, NAVIGATION (8) + MORE, CONTACT/FORMS/SOCIAL,
    single author `desk`, 9 categories with slugs+hex colors, tag list.
  - `src/content.config.js` — `news` collection via glob loader (`**/*.md`, flat per slug),
    zod schema: title/excerpt/dates/readingTime/category/tags/author/**lang (bn|en)**/thumbnail/
    featured/breaking/demo/draft/**sources[] {name,url}**/**verification {badge,tier,score,evidence[]}**.
  - `src/lib/news-data.js` — posts/sortedPosts/getStaticPaths helpers, related (category+tags
    score), bn-BD date, reading-time estimate, BADGES map (যাচাইকৃত/নিশ্চিত/একক-আংশিক/সন্দেহজনক).
  - `src/styles.css` — fonts swap (Noto Serif Bengali + Hind Siliguri via @fontsource),
    red `--primary`, radius smaller, + news design system (masthead, ticker marquee, category
    pill, badge chips, evidence box, source list, lead-article, mini-row).
  - Components: `Header` (sticky, nav, search/rss/theme-toggle, mobile menu),
    `Footer`, `PostCard` (default/list/compact + badge+pills+ডেমো chip),
    `VerificationBadge`, `EvidenceList`, `SourceList(inline in article)`, `BreakingBar`
    (pure-CSS marquee), `Breadcrumbs` (bn), `Icon` (inline SVGs as HTML strings via set:html).
  - Pages: `/` (masthead+ticker+lead+2x2 mini rows+category cards), `/news`,
    `/article/[slug]` (badge header, JSON-LD NewsArticle, evidence+sources box, related,
    share X/FB/WhatsApp), `/category/[slug]`, `/tags/[slug]`, `/authors/[slug]`, `/search`
    (Pagefind focus-load + static tag/category fallback), `/about`, `/contact`, `/404`,
    hand-rolled `/rss.xml`, `/sitemap.xml`, `/robots.txt`.
  - `public/`: favicon kept, `avatars/desk.svg`, `images/news-dhaka.svg|news-demo-b.svg|news-en.svg`.
  - Sample content: 6 demo articles (5 bn + 1 en), `demo:true` with varied badges/evidence.
- ENVIRONMENT WALL discovered (Termux): `/storage/emulated/0` is **noexec + no-symlink** → this
  site cannot be built locally at all: `foreman`→npm `.bin` symlinks EACCES; even internal-storage
  copy hits Astro 7's `satteri` native binding (no android package → module not found) —
  so **local dev is impossible; Vercel cloud build is THE build path.**
- Vercel: created project `man-of-technology/newsdesk-bd`, `vercel.json` framework astro +
  buildCommand `npm run build` + outputDirectory dist + `.vercelignore`.
- Build iterated via cloud logs (4 failures → fixes):
  1. import depth (article/category/tags/authors `../../../`→`../../`, search `../../`→`../`)
  2. `Icon.astro` JSX fragment in frontmatter → invalid; rewrote icons as HTML strings + set:html
  3. `CONTACT` not re-exported from news-data → added to re-export
  4. `@astrojs/rss` undeclared → replaced with hand-rolled RSS; `postsByCategory` missing import in
     index.astro (ReferenceError caught rendering `/`) → added.
- **LIVE: `https://newsdesk-bd.vercel.app`** — all routes 200, fonts self-hosted woff2, JSON-LD +
  evidence box verified in HTML, Pagefind indexed 30 pages / 2 languages (bn, en; no stemmer → note).

## Files changed (site/)
- New/rewritten everything under `src/` + `public/images` + `public/avatars` + `vercel.json` +
  `.vercelignore` + `src/content/news/*.md` (6 demos). Customization docs from template left.

## Decisions
- D16: deploy via Vercel cloud build only; pagefind binary runs on Linux x64 at Vercel (worked).

## Next steps
- [ ] Do not attempt local npm/build on Termux for this site (documented above).
- [ ] Contact email + real form target on `/contact`.
- [ ] Google Search Console on newsdesk-bd.vercel.app.
- [ ] Real thumbnails from pipeline covers; remove demo articles before launch.
- [ ] Lighthouse 100 pass (structure already cheap/static).
- [ ] Wire pipeline output (Phase 5 synth) into `src/content/news/` frontmatter.
## Second round (same day) — homepage/category fixes after site review
- Homepage category sections were NOT rendering (async `.map` inside Astro template +
  `postsByCategory` matched posts against Bengali **name** while articles store **slug**).
  Fixed: compute `homeSections` via `Promise.all` in frontmatter; matcher accepts slug OR name.
- Also removed duplicate BaseLayout import, unused Icon/grid.
- Redeployed (`vercel deploy --prod`): homepage now renders 4 category sections / 5 cards /
  10 category pills; category/tags/news/list pages fill correctly; verified all routes (/,/article,
  /category/national,/news,/tags/dhaka,/search,/about,/contact,/404=404,/rss.xml,/sitemap.xml=13).

## Third round — mobile performance (PSI: Perf 85, A11y 96, BP 100, SEO 100; "No Data" = CrUX no-traffic, expected)
- Diagnosed: fonts were the main lever (fontsource hashed URLs, swap-induced CLS, late LCP on headline text).
- Moved fonts to stable `/fonts/*.woff2` (10 files: Noto Serif Bengali 600/700 + Hind Siliguri 400/500/600, latin+bengali subsets; bengali subsets ~70KB each, latin ~13KB).
- Replaced `@fontsource` CSS imports with manual `@font-face` in styles.css; removed fontsource deps from package.json.
- Preload top 3 fonts (serif 700 + 600 + sans 400 bengali) in BaseLayout; `fetchpriority="high"` + `decoding=async` on lead image.
- Redeployed; verified: 3 preloads, 0 hashed font refs, 10/10 /fonts/*.woff2 = 200, homepage intact.
