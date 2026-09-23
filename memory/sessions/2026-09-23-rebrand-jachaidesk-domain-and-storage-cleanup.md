# Session 2026-09-23 — Rebrand to জাচাইডেস্ক, main domain jachaidesk.com, storage cleanup

## Context (from prior session state)
- User bought and decided on **jachaidesk.com** (Spaceship) as the brand domain; DNS first
  kept on Spaceship NS w/ A record + CNAME, later user switched NS to Vercel DNS.
- Domain was already attached to Vercel project `newsdesk-bd` (man-of-technology team) and
  aliases (jachaidesk.com + newsdesk-bd.vercel.app) pointed at live prod.
- Rebrand edits to site/ had been made (uncommitted). Vercel emailed 75% Deployment Storage
  used → user asked to delete obsolete deployments without affecting the live site.

## What was done
1. **Storage cleanup (Vercel API, no CLI)** — project had 258 deployments. Kept ONLY:
   - live prod `dpl_BFyKaKp6VEY2Z6cahd7ho6hQh3ok` (both aliases target it)
   - git-main preview `dpl_5bUVfyC16Vh9C4Tkf6Zfz5fd7t27`
   Deleted ~252 via `DELETE /v13/deployments/:id` in batches; hit Vercel rate limit (HTTP 429)
   repeatedly → retried with sleeps. Final: only the 2 + brand-new auto-deploys remain.
   Live site verified **HTTP 200** throughout. Scripts: `/data/data/com.termux/files/usr/tmp/opencode/vercel_clean*.cjs`.
2. **Domain became main + live** — `curl https://jachaidesk.com/` returns 200 (was already
   aliased to live prod). NS still Spaceship at check time; Vercel DNS propagation pending.
3. **Rebrand committed & deployed** — pushed the site+workflow brand edits (`ac21069`), hit a
   remote-force-push conflict with the auto-bot pipeline (auto commit `11b0237`) → `pull --rebase` →
   pushed `3f74fac`. Vercel deploy green; homepage now masthead **জাচাইডেস্ক — বাংলাদেশের
   সবচেয়ে যাচাই-করা সংবাদ**.
4. **Pipeline source-of-truth rebrand (critical fix)** — 2 auto-authored story files
   (national-425, national-426) still carried `thumbnailAlt: … — নিউজডেস্ক বিডি` because the
   pipeline generates that suffix from hardcoded brand strings. Found + fixed ALL pipeline files:
   - `pipeline/config/sources.yaml` codename→jachaidesk, titleBn→জাচাইডেস্ক, url→https://jachaidesk.com
   - `pipeline/lib/images.mjs` BRAND→জাচাইডেস্ক, UA→jachaidesk/1.0
   - `pipeline/tools/tracked_watcher.mjs` UA→jachaidesk-watcher
   - `pipeline/tools/telegram_post.mjs` + `facebook_post.mjs` brand title + article URLs
   Fixed the 2 already-authored files' thumbnailAlt too. Commit `f10c3ea` → rebase → pushed `3f74fac`.
   Verified: node --check all 4 edited JS files + yaml.parse sources.yaml OK.
   Note: `deploy.yml --name newsdesk-bd` is the Vercel PROJECT id — intentionally kept.

## Final verified state
- `git log` origin/main == local main at `3f74fac` (rebrand) on top of auto-bot commits.
- Live: `jachaidesk.com` HTTP 200 (জাচাইডেস্ক), `newsdesk-bd.vercel.app` HTTP 200 (old brand
  name redirects fine — that's the project url, acceptable).
- Deployments remaining ≈ 2 kept + new auto-deploys; storage warning addressed.

## Environment notes
- Vercel API scripts (no vercel CLI): `DELETE /v13/deployments/:uid?projectId=&teamId=`.
  Token `~/.config/opencode/.secrets/vercel.env` (VERCEL_TOKEN). Project id
  `prj_FX5YmvjrSM5JnbCm1PNbQuJU6xJO`, team `man-of-technology`.
- Vercel rate limit on deletes is aggressive (429 after ~dozens); wait ≥2.5s between retries.

## Next steps / open
- [ ] GSC: add jachaidesk.com, verif token → theme.config.ts SEO.googleSiteVerification, deploy, submit sitemaps (from REMINDERS)
- [ ] Telegram bot/channel secrets when user creates them
- [ ] FB distribution decision (RSS vs Graph API) still parked (D46)
- [ ] Vercel Web Analytics dashboard enable (no CLI)
- [ ] Watch: any auto-authored story pixels still say "নিউজডেস্ক" → grep `site/src/content` for the old name; pipeline now emits জাচাইডেস্ক so should be clean