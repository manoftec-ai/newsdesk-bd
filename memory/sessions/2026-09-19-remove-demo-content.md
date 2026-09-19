# Session — remove all demo content (newsdesk-bd)

> Date: 2026-09-19

## What happened
- User request: "go to newsdesk-bd and remove all demo content/article".
- Identified all 7 articles in `site/src/content/news/` as `demo: true`: economy-export-5mo,
  economy-startups-rebound-en, gadget-approval-2026, international-twin-storms, national-budget-2026,
  politics-election-calendar, sports-semi-final.
- Verified build safety BEFORE deleting: homepage and all collection pages (news/category/tags/
  authors/rss) already guard empty lists (lead `&&`, `length > 0`, `.filter(posts.length > 0)`);
  getStaticPaths are theme-config-driven, not post-driven → zero-post build will not break.
- No git repo → made restore backup first: `_backup-demo-content/demo-articles-2026-09-19.tar.gz`
  (7 `.md` files + 3 demo thumbnails `news-demo-b.svg` / `news-dhaka.svg` / `news-en.svg`).
- Deleted the 7 demo `.md` files from `site/src/content/news/` (now empty) and the 3 demo SVGs from
  `site/public/images/` (all were only referenced by deleted articles — confirmed via grep).

## What was NOT done
- Vercel redeploy: the CLI is not installed here and the deploy token is not stored in memory
  (only `<vcp…>` placeholder documented). Live site `newsdesk-bd.vercel.app` still shows the demos
  until a redeploy. Command for later: `vercel deploy --prod --yes --token <token>` from `site/`.
- No real content exists yet — site shows empty homepage until pipeline stories land.

## Status & next step
- Source is clean. Redeploy (user-triggered once token available), then wire Phase 5 pipeline drafts
  into `site/src/content/news/`.