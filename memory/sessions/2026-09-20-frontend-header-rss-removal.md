# 2026-09-20 — Front-end: header site-name on mobile + remove RSS/XML view

## User request
1. On mobile, header site name "নিউজডেস্ক বিডি" isn't fully visible (truncated).
2. Remove the "XML view" option from the header (the RSS feed icon → /rss.xml).
3. Remove it from the full site.

## What was done
- `site/src/components/Header.astro`:
  - Brand: drop `truncate` → `whitespace-nowrap`; `text-base sm:text-lg` (smaller on
    mobile so it always shows in full).
  - Icon row: `gap-6` → `gap-2 sm:gap-4`; header padding/gap `px-5 gap-4` →
    `px-4 gap-3 sm:gap-4 sm:px-5` to free horizontal room on small screens.
  - Deleted the `/rss.xml` RSS icon link (the "captured" XML view).
- `site/src/components/Footer.astro`: removed "RSS ফিড" link from সাইট column.
- `site/src/config/theme.config.ts`: removed the rss entry from `SOCIAL_LINKS`
  (footer social icon gone too).
- `site/src/layouts/BaseLayout.astro`: removed
  `<link rel="alternate" type="application/rss+xml" href="/rss.xml">` so browsers
  no longer surface a feed/XML discovery control.

## Notes / decisions
- Kept `site/src/pages/rss.xml.js` endpoint itself (reachable only by direct URL,
  non-destructive; existing feed readers keep working). Pipeline `fetch.mjs` / source
  RSS ingestion is UNRELATED and untouched.
- 44px tap targets on icons kept (a11y) — only the RSS icon is gone; search + dark +
  menu remain.

## Testing
- Grep verified: zero `rss.xml` / `rel="alternate"` refs left in site UI code.
- No local Astro build (D28 — Termux can't build). Vercel CI verifies on push.

## Git
- Commit `383fb4f` pushed to main → Vercel auto-deploy.