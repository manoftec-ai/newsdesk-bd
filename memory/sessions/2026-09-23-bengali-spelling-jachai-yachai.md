# Session — Bengali spelling fix: যাচাইডেস্ক (D49) (2026-09-23)

## What happened
User reported the site (jachaidesk.com) has a Bengali spelling mistake: the brand
was rebranded (D48) as **জাচাইডেস্ক** (জ + চাই), but the correct orthography is
**যাচাইডেস্ক** (য + চাই). User: "it should be যাচাই". Note: both letters sound
/dʒ/ in modern Bengali, so this is easy to miss — the D48 rebrand used the wrong
letter.

## Fix
Replaced all 30 occurrences of `জাচাই` → `যাচাই` across **22 source files** (site +
pipeline source-of-truth, .git and memory/ excluded at first pass):

- `pipeline/config/sources.yaml` (titleBn)
- `pipeline/lib/images.mjs` (BRAND)
- `pipeline/tools/telegram_post.mjs` + `facebook_post.mjs` (brand text)
- `site/package.json` (description)
- `site/public/avatars/desk.svg` (aria-label)
- `site/src/config/theme.config.ts` (name/tagline/description/author/bio — the
  description already used correct যাচাই in the explanatory sentence)
- `site/src/pages/` index.astro, news/index.astro, search.astro, tracked.astro,
  ghotona/[slug].astro
- `site/src/data/tracked-stories.json`
- `site/src/content/news/` 9 article thumbnailAlt fields
  (factcheck-madaripur..., history-rupganj/...syria/...bhasan/...cyclone,
  national-340/369/425/426)

Latin domain `jachaidesk.com`, URLs, slugs, and sitemap keys were NOT touched —
the romanisation "jachaidesk" correctly maps to যাচাইডেস্ক.

## Verification
- `grep -rn 'জাচাই' .` (excluding .git + memory) → 0 remaining.
- No local Astro build possible on Termux (D28) — deploy happens on Vercel via
  push; this commit will auto-deploy.

## Memory updates
- newsdesk-bd `memory/MEMORY.md` + `MEMORY.json`: added D49 decision row, updated
  header + mandate + brand + workInProgress lines. Historic D48 rows keep the old
  জাচাই spelling (append-only rule).
- This session log.

## Next
- Push → Vercel auto-deploy → verify live masthead shows যাচাইডেস্ক.