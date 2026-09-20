# 2026-09-20 — GH Actions font outage (0 posts) + bundled-fonts fix

## Symptom
User: "newsdesk-bd website did not post a single post today… where we are stuck?"
Site was live with 34 articles but nothing new all day despite the */30 pipeline running.

## Diagnosis (by opencode)
- `pipeline.yml` (fetch/verify/extract, cron) SUCCEEDED all day — it kept committing new briefs
  (last commits 03b5010 @05:21, 5cf6a77 @10:06).
- `author.yml` (LLM story authoring) FAILED on every run (01:11, 05:21, 06:22, 10:06, 11:36).
- `images.yml` (thumbnail branding) FAILED too (04:58, 09:51). `auto-author.yml` failures were a
  stale-workflow artifact (old push trigger; current file has none).
- Failing log (both author + images), same spot:
  `sudo apt-get install -y -qq fonts-noto-bengali` → `E: Unable to locate package fonts-noto-bengali`
  → `##[error]Process completed with exit code 100.`
- Root cause: GitHub rolled the ubuntu-24.04 hosted runner image (Image release 20260907.300,
  build 2026-08-28) and the apt index no longer resolves `fonts-noto-bengali`. The apt step was in
  BOTH workflows purely to give sharp→librsvg (SVG text) a Bengali font via fontconfig.

## Fix (D35) — bundled fonts, no apt
1. Committed static TTFs at `pipeline/fonts/` (~600KB total, from notofonts.github.io official
   hinted set): `NotoSansBengali-Regular.ttf`, `NotoSansBengali-Bold.ttf`, `NotoSerifBengali-Bold.ttf`.
2. Added `pipeline/fonts/fontconfig.local.conf` (`<dir prefix="relative">.</dir>` + /tmp cachedir).
3. Replaced the apt step in `author.yml` + `images.yml` with one export:
   `echo "FONTCONFIG_FILE=$GITHUB_WORKSPACE/pipeline/fonts/fontconfig.local.conf" >> "$GITHUB_ENV"`
   → librsvg resolves "Noto Sans Bengali"/"Noto Serif Bengali" straight from the repo. Deterministic
   across future runner-image updates.
4. Verified font URLs live (HTTP 200) before committing; fonts are valid TrueType.

## Queued backlog (waited all day, un-authored at fix time)
international-134, national-122,123,125,126,127,128,130,131,136, sports-129,133 (13 briefs).

## Verification
- After push: re-ran `author` + `images` workflows via `workflow_dispatch` → both must go green.
- Watch for new articles on https://newsdesk-bd.vercel.app (Vercel auto-deploys on push).