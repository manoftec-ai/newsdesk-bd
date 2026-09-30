# Facebook auto-posting without the Meta API

Two ways this repo can post to a Facebook Page. Pick **one** — never both live at once, or
every story appears on the Page twice.

| Path | Tool | Needs | Where it runs |
|---|---|---|---|
| Graph API (official) | `tools/facebook_post.mjs` | `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_TOKEN` (requires Meta App Review + Business Verification) | GitHub Actions, `whatsapp`-style cron |
| **Browser composer (this doc)** | `tools/facebook_web_post.mjs` | A Facebook login in a local Chromium profile | This device, in `tmux` |

Both read the same queue (`site/src/content/news/*.md`) and share
`pipeline/state/facebook-sent.json`, so a slug already on the Page is never posted twice.

## Why not just use the Graph API?

Business Verification and App Review are not available to us right now. Posting through the
Business Suite composer needs neither: it is the same composer a human uses, driven by a
browser we control.

## Why it must NOT run in GitHub Actions

Three independent blockers, any one of which is fatal:

1. **GitHub runners are datacenter IPs.** Facebook challenges unfamiliar IP + browser pairs
   aggressively. (The same class of problem blocks WhatsApp automation on Actions — see
   Baileys issue #2705, where an identical session links from a residential IP and is logged
   out within ~5 seconds from a cloud IP.)
2. **The runner disk is wiped every job.** The Facebook login lives in the Chromium profile,
   so every run would need a fresh interactive login — which means a fresh challenge.
3. **Actions is not a bot host.** It is built for CI jobs that end.

The code lives in GitHub. It runs on the phone.

## Why not Playwright?

Playwright does not support Android hosts, and Termux's Chromium is an Android-native build.
`lib/browser-poster.mjs` therefore talks the DevTools Protocol directly to a Chromium it
launches itself, using Node's built-in `WebSocket`. No npm dependency, no browser download.

## Setup

Prerequisites (already done on the dev device):

```bash
pkg install x11-repo chromium tmux
```

Chromium from Termux needs a recent libc++. If it fails to start with
`cannot locate symbol "__ndk127__hash_memory"`, run `apt install libc++` — a plain
`pkg upgrade` also fixes it but touches far more.

### Log in — pick one path

**A. Headless auto-login** (no display needed; fails if Meta shows a captcha):

```bash
cd pipeline
FACEBOOK_LOGIN_EMAIL='you@example.com' FACEBOOK_LOGIN_PASSWORD='...' \
  node tools/facebook_web_post.mjs --setup
```

**B. Manual login in a real window** (needed for captcha / 2FA). Requires a display:

```bash
pkg install termux-x11-nightly
termux-x11 &          # then connect with the Termux:X11 app, or a VNC client
DISPLAY=:0 node tools/facebook_web_post.mjs --setup-display
```

Log in by hand, then close the window. **Do not log out** — logging out destroys the
profile's session and forces the whole challenge again.

The profile lives at `~/.config/newsdesk/facebook-chrome` (override with
`FACEBOOK_PROFILE_DIR`). It *is* the login; treat it as a secret and never commit it.

### Verify before posting anything

```bash
node tools/facebook_web_post.mjs --probe
```

Writes `pipeline/logs/fb-composer-probe.json` and `fb-composer-probe.png` describing what is
actually on the composer page: detected state, every textbox, every button. Read the
`state` field — `composer` means posting should work.

If Meta's markup changes, this report is how you find out. Element lookup is by
`aria-label` / `role` / `placeholder`, never CSS classes, precisely so redesigns break
loudly here instead of silently mis-posting.

### Check the text without touching Facebook

```bash
node tools/facebook_web_post.mjs --dry-run --limit 3
```

Prints exactly what would be posted, newest first.

## Running it

```bash
./tools/facebook_web_daemon.sh start     # background: drain backlog, then poll every 20 min
./tools/facebook_web_daemon.sh status    # running? last run? what failed?
./tools/facebook_web_daemon.sh logs      # follow
./tools/facebook_web_daemon.sh stop      # stop + release the wake lock
```

One batch by hand:

```bash
node tools/facebook_web_post.mjs --limit 5      # post up to 5
node tools/facebook_web_post.mjs --all          # drain everything (still session-capped)
```

Tuning: `--interval=`, `--delay-min=`, `--delay-max=`, `--max-per-session=`, or set
`FACEBOOK_WEB_ARGS`.

The daemon takes a Termux wake lock so Android does not suspend it when the screen is off,
but it still needs the phone **charging**, and Android may kill it under memory pressure.
`daemon.sh status` reports that.

## Safety behaviour

The poster refuses to guess, because a wrong click on a Facebook account costs far more than
a story that waits.

- **Never posts** when a login wall or a checkpoint/captcha is detected — it halts.
- **Never marks a story as sent** unless publishing was positively confirmed (a success
  toast, or the composer emptying).
- **An "uncertain" outcome** — clicked but unconfirmed — halts the batch and saves a
  screenshot, because blindly retrying is how you get a duplicate post.
- **Halts after 3 consecutive failures** rather than hammering a UI that has changed.
- **`daemon.sh start` refuses to run** if `FACEBOOK_PAGE_TOKEN` is set, so the Graph API
  poster and this one can never double-post.

Slugs are written to `pipeline/state/facebook-sent.json` immediately after each confirmed
post, so a crash mid-batch never re-posts what already landed.
Run metadata is in `pipeline/state/facebook-web-status.json`; failure screenshots are in
`pipeline/logs/fb-web-*.png`.

## Risks, stated plainly

This drives a real account through an unofficial interface and violates Meta's terms. The
plausible outcomes, worst first: account checkpoint that stops automation until solved,
forced logout, temporary lock, permanent ban — and a ban can take the Page with the admin
account.

Mitigations in place: randomised 1.5–4.5s gaps between posts, a per-session cap, a
residential IP (it runs on the phone), an ordinary Android Chrome user-agent instead of
`HeadlessChrome`, and `--disable-blink-features=AutomationControlled`.

**Use a Facebook account that is not the personal account you care about, and not the only
admin of the Page.** If this goes wrong, it should cost a spare account, not the Page.

## Turning it off

```bash
./tools/facebook_web_daemon.sh stop
rm -rf ~/.config/newsdesk/facebook-chrome     # forget the login
```

Nothing in GitHub Actions references this path, so stopping the daemon stops all posting.
## First run: do not flood the Page

Nothing has ever been posted to this Page, so **the entire archive counts as pending** (428
stories at the time of writing). Start with a cutoff, or the first session posts 25
historical stories onto a Page that has never linked to the site:

```bash
FACEBOOK_SINCE=2026-09-30 ./tools/facebook_web_daemon.sh start
```

`--since=DATE` (or `FACEBOOK_SINCE`) publishes only stories dated on or after that date.
Older stories stay in `pipeline/state/facebook-sent.json` as unsent forever, which is
harmless — just note the File never drains without the cutoff.
