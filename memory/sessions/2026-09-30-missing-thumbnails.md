# 2026-09-30 — new stories live without images (fixed)

User: "new news dont have images. fix it. do not mix up anything."

## Cause (measured, two parts)
1. Structural: auto-author publishes a story and dispatches a deploy at once
   (D129), so the story is live within minutes — but its thumbnail is branded
   AFTERWARDS by images.yml ("brand thumbnail images" bot commit). Thumbnails
   always lag the story by one job.
2. Trigger: that images commit is pushed with GITHUB_TOKEN, which cannot fire
   deploy.yml's push trigger; and the hourly deploy schedule dropped every tick
   between 06:46 and 13:48 on Sep-30. Concrete case: national-799 published
   15:44, live at 16:12 WITHOUT its thumbnail; thumbnails committed 16:24 sat
   in main undeployed while the site was checked.

## Fix (one file: .github/workflows/images.yml)
The run that just pushed thumbnails now dispatches deploy.yml itself — the same
D129 pattern auto-author uses. Only when it actually pushed
(`steps.thumbs.outputs.pushed == 'true'`); deploy.yml's live-commit guard still
skips when site/ is identical to live, so a quiet run costs zero deploys.
deploy.yml's `vercel-deploy` concurrency (cancel-in-progress) collapses bursts.

## Verification (live, not assumed)
- Manual deploy dispatched; Vercel READY on eb2693f7 minutes later.
- national-799/-784/-786/sports-800/international-145/national-685 article pages
  now contain their hero `<img>` (1200x630, eager) and the og:image; the webp
  itself returns HTTP 200.
- Homepage cards render images (layout keeps some stories as text links — by
  design, not a defect).
Commit: c03b8cfa. Nothing else touched.
