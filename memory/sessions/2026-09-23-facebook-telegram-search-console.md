# Session 2026-09-23 — Facebook page + Telegram group + Search Console indexing

## What was built (all code-ready, activation = user account steps)
- **facebook_post.mjs** (`pipeline/tools/`) — mirrors telegram_post.mjs: posts the newest not-yet-sent
  published story to a Facebook Page via Graph API v21 `POST /{page-id}/feed` (message + link; FB scraper
  pulls og: title/desc/image). Secret-gated: without `FACEBOOK_PAGE_ID`/`FACEBOOK_PAGE_TOKEN` it exits 0
  (skip). State file `pipeline/state/facebook-sent.json` (one post per run, backlog drains slowly).
- **facebook.yml** (`.github/workflows/`) — mirrors telegram.yml: cron `*/20`, `workflow_run` on
  [auto-author, images, pipeline, watcher, history-author, history-batch], manual dispatch; merge-tolerant
  sent-state commit. Both workflows YAML-parsed OK.
- **test/facebook.test.mjs** — 2 tests (readFrontmatter + latestUnsent). Pipeline `npm test`: 26/26 pass.
- **GSC/Bing verification slots** (`site/src/config/theme.config.ts` + `site/src/layouts/BaseLayout.astro`
  + `site/src/lib/news-data.js`) — `SEO.googleSiteVerification` + `SEO.bingSiteVerification` render
  `<meta name="google-site-verification">` / `msvalidate.01` in head ONLY when filled (inert, no-op today).
- **Footer social slots** — SASOCIAL_LINKS gained FB (`facebook` icon, already existed) + Telegram
  (`send` icon) entries with empty href; Footer filters empty hrefs so nothing renders until real URLs set.

## Deploy
Committed + pushed `b711029` (rebase over bot commits). Live site unchanged in behavior.

## Activation checklist for user (see reminders in MEMORY.md)
1. Telegram: @BotFather → /newbot → token; create channel → add bot admin; get chat id; add
   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID as GitHub repo secrets.
2. Facebook: create Page; developers.facebook.com → App → Page Access Token (`pages_manage_posts`,
   exchange to long-lived); add FACEBOOK_PAGE_ID + FACEBOOK_PAGE_TOKEN as GitHub repo secrets.
3. Search Console: search.google.com/search-console → URL prefix `https://newsdesk-bd.vercel.app/` →
   HTML-tag verification → paste token into `SEO.googleSiteVerification` → deploy → Verify → submit
   sitemap.xml + news-sitemap.xml. (Google ignores IndexNow, so this is separate from the live IndexNow key.)

## Tests / verification
- pipeline `npm test` 26/26 (2 new facebook tests)
- facebook_post runs dry (skips) without secrets → exit 0
- facebook.yml + telegram.yml parsed with js-yaml OK
- Live site: robots 200, sitemap 200, news-sitemap 200, home 200 (unchanged)

## Memory
- Project MEMORY.md + MEMORY.json updated (D46, reminders: Telegram pending / FB pending / GSC in-progress,
  Vercel Analytics dashboard-only).