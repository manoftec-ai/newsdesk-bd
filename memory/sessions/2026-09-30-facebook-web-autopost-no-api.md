# 2026-09-30 — Facebook auto-post without the Meta API (D131)

## What the user asked

1. "for jachaidesk, i create a whatsapp update, can i auto publish my news there? i cant have an meta API"
2. Then: "i am skipping whatsapp for now. i will use facebook page, how can we do the automation without API"
3. Chose, after options: **Only Playwright, post every story** (free, self-hosted, accepts ban risk).
4. Asked mid-way "is it possible with github?" — answered no (datacenter IP + ephemeral disk), and the user accepted the phone-hosted route.

## Research findings (verified 2026-09-30, not from memory)

- **Facebook Pages auto-posting is still fully supported in 2026.** Meta killed *Groups*
  auto-posting (April 2024); Pages were unaffected. The blocker is only App Review +
  Business Verification for the `pages_manage_posts` token.
- **The native "RSS tab on your Page" option is dead.** RSS button removed 2015, auto-generation
  disabled for new Pages. This kills the "RSS→FB native" option parked in D46.
- **Zapier free = 100 tasks/month, 15-min polling.** JachaiDesk published 286 stories in
  September (40–71/day at peak), so "post every story" on free Zapier is ~30–70x over budget.
  Zapier's own `Facebook Pages → Create Page Post` action does exist and needs no Meta review.
- **GitHub search for a free FB Page poster found nothing credible**: top repos are 1–4 stars,
  last pushed 2020–2023, mostly Group likers or Graph API wrappers. Postiz/Mixpost still need
  Meta App ID + Business Verification. The only genuinely useful reference was
  `arillera/meta-scheduler` (MIT) — Playwright against the Business Suite composer, "no
  business verification, no app approval, no tokens". Its macOS file-picker bypass is not
  needed for text+link posts.
- **Datacenter-IP rejection is real, not theoretical.** Baileys issue #2705: an identical
  session links from a residential IP and gets `Connection Failure → loggedOut` in ~5s from
  a cloud IP. Same class of risk applies to Facebook on GitHub Actions.

## What was built

Second Facebook transport that needs neither app review nor a token: drive the Business Suite
composer in a local Chromium.

- `pipeline/lib/browser-poster.mjs` — launches Termux Chromium, drives it over CDP via Node's
  built-in `WebSocket`. **No Playwright** (no Android host support) and **no npm dependency**.
  Overrides the `HeadlessChrome` UA with an ordinary Android Chrome identity +
  `--disable-blink-features=AutomationControlled`.
- `pipeline/lib/facebook-composer.mjs` — finds the composer/publish control by
  aria-label/role/placeholder, never CSS classes. Detects login wall + captcha/checkpoint.
- `pipeline/lib/social-post-text.mjs` — single source of truth for the Bengali post format,
  now shared with `facebook_post.mjs` (the Graph API tool was refactored onto it; its
  `readFrontmatter` / `latestUnsent` exports and tests preserved).
- `pipeline/tools/facebook_web_post.mjs` — `--setup` / `--setup-display` / `--probe` /
  `--dry-run` / `--limit` / `--all` / `--loop` / `--loop-once` / `--since` / `--reset-profile`.
- `pipeline/tools/facebook_web_daemon.sh` — tmux + wake lock, `start|stop|status|logs|commit`.
- `pipeline/test/facebook-web.test.mjs` — 16 tests. **Suite 416/416.**
- `docs/FACEBOOK-AUTOPOST.md`.

Shares `pipeline/state/facebook-sent.json` with the Graph API tool, so a slug already on the
Page can never be posted twice. The daemon refuses to start if `FACEBOOK_PAGE_TOKEN` is set.

## Environment work required on this device

- `pkg install x11-repo chromium tmux`
- **Chromium would not start**: `cannot locate symbol "__ndk127__hash_memory"`. Cause: installed
  `libc++ 27c` (ABI tag `__ndk118`) but the current chromium build needs `__ndk127`. Fixed with
  `apt install libc++` (→ 30) rather than a 76-package `pkg upgrade`, which also unblocked the
  half-configured ffmpeg → pipewire → chromium chain.
- No `termux-x11` on the stable repo (`termux-x11-nightly` only), and no `xvfb`, so headed
  Chromium is not straightforward — hence two login paths (headless auto-login, or manual
  with `--setup-display`).

## Bugs found and fixed during this work

1. **`--delay-min=`/`--delay-max=`/`--max-per-session=`/`--interval=` never matched** — written
   as `arg === '--delay-min='` instead of `arg.startsWith(...)`, plus an off-by-one slice on
   `--interval=`. Caught by the parseArgs test. Replaced with a `numFlag(arg, flag)` helper that
   derives the offset from the flag name.
2. **Login-wall detection was wrong in a way that mattered.** Real on-device run: anonymous
   visitors get a Meta marketing page with a "Log in" button and *no password field*, so the
   password-field check reported "logged in" and failed downstream as `composer-missing`. Now
   also checks email field, login form, and visible `Log in` / `লগ ইন` CTAs. Verified by
   re-running: now correctly reports `not logged in (login-required)`.
3. **`--loop` inherited `limit=1`** → one story per 20 min forever, unable to drain a 40–70/day
   backlog. A looping run now defaults to `Infinity`, bounded by `--max-per-session`. Regression test added.
4. **First run would have flooded the Page**: nothing had ever been posted, so all 428 stories
   counted as pending. Added `--since=DATE` / `FACEBOOK_SINCE`.
5. Daemon logged a stack trace every cycle when logged out; now a clean message + exit 0.
6. Filtered Chromium's Termux noise (dbus / inotify / OOM / mojom / GCM) out of the poster log.

## Unrelated pre-existing failure encountered

`test/tier-a-single-source.test.mjs` "the flag reaches the article frontmatter" failed because
`lib/synth.mjs` had been changed in the working tree from `fm.uncorroborated` (always
`undefined` — `fm` has no such property) to `brief.uncorroborated`, leaving the test's brittle
source-text assertion stale. I updated the assertion; a **concurrent session then committed the
same fix independently** (`ad28d474`), so my edit became a no-op. Suite green 416/416.

## Current state / next step

Built, tested and pushed (`e40ba193`). **NOT yet activated** — nothing has ever been posted to
the Page and the login has not been done. User must:

1. `FACEBOOK_LOGIN_EMAIL=... FACEBOOK_LOGIN_PASSWORD=... node tools/facebook_web_post.mjs --setup`
   (or `--setup-display` for a captcha)
2. `--probe` → confirm `state: composer`
3. `FACEBOOK_SINCE=<today> ./tools/facebook_web_daemon.sh start`

Untestable without the user's real login: the publish-button selectors and the confirmation
signal. `--probe` exists precisely so that failure is visible rather than silent.

## Honest risk position

Unofficial automation of a real account. Worst case: checkpoint → forced logout → temporary
lock → permanent ban, and a ban can take the Page with the admin account. Recommended the user
run this on a spare Facebook account that is not the only Page admin. He accepted this trade
explicitly, choosing "only Playwright, post every story" over the safer free Zapier digest.