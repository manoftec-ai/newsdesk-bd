# Session — SEO week-1: publish full backlog + SEO foundation

> Date: 2026-09-19

## What happened
- Investigated pipeline publish flow: synth is agent-driven (`writingPrompt`), `finalizeStory()` writes
  `site/src/content/news/<slug>.md` with `draft:false` (auto-publish).
- **Backlog published**: all 33 pending briefs authored as original Bengali stories (~140–295 words each,
  facts pinned to brief member leads, neutral style) via 6 parallel writer agents → body files in
  `pipeline/tmp/stories/*.b.md` → finalized via new `pipeline/tools/finalize_stories.mjs`.

## Pipeline changes (pipeline/lib/synth.mjs)
- `inferTags(brief)`: deterministic keyword→tag classifier (only emits tags defined in theme.config.ts).
- `frontMatter` now emits `seoTitle`/`seoDescription`/inferred `tags`.
- `finalizeStory`: fills seoTitle (≤72 chars, word-boundary truncation) + seoDescription (≤155 chars);
  re-added accidental-drop fix for `stripEditorialFooters` (`const body = stripEditorialFooters(bodyMd)`).

## Site changes (site/)
- `sitemap.xml.js`: all categories + all tags + real per-item lastmod (max of posts); removed hardcoding.
- `index.astro`: JSON-LD `@graph` = NewsMediaOrganization + WebSite + WebPage (no SearchAction — Pagefind
  has no URL query param, would be a broken action).
- `article/[slug].astro`: NewsArticle + `isAccessibleForFree:true` + `keywords` (tags).

## Verification
- 34/34 frontmatters pass a zod-style field validator (required fields, date, draft bool, badges,
  sources, evidence, seo fields present).
- Local Astro build is IMPOSSIBLE on Termux: Astro 7 needs `@bruits/satteri-android-arm64` which does
  not exist on npm (404). Builds/deploys run on Vercel Linux runner (was always the workflow).
- `node --check`: sitemap.js + both astro frontmatter blocks pass.
- Commit `ad4224f` pushed to `manoftec-ai/newsdesk-bd@main` → deploy.yml triggers Vercel production deploy.

## Decisions (D26–D29) — see MEMORY.md

## Next steps
- [ ] Confirm Vercel production deploy success; verify live sitemap/article count (34).
- [ ] Guide user: Google Search Console + Bing Webmaster Tools (sitemap submit, index request).
- [ ] Later: enable 3 headless sources (Kaler Kantho/Jugantor/Jamuna), Daily Star section feeds,
      evergreen explainers, "how we verify" page, custom domain.

## Known quirks
- `finalize_stories.mjs --site` arg must point at the CONTENT dir, not the site root.
- Intermediate body files live in `pipeline/tmp/stories/` (gitignored) — safe to delete after finalize.