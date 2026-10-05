# Session — 2026-10-05: SEO Skills Pack install + JachaiDesk AI-search fixes

## What happened
- User pointed opencode at the SEO Skills Pack v3.1 (Rashed Hasan Akash) left in
  `projects/Website Development/SEO-Skills-Pack-v3.1/`. Reviewed: 11 skills + 514
  vendor-neutral playbooks, English+Bangla docs, Traffic Drop Doctor (GSC CSV analyzer).
- Flattened the nested extraction to one copy in Website Development.
- Installed GLOBAL: copied pack to `~/.config/opencode/seo-skills/`, mirror `skills/` to
  `~/.config/opencode/skills/`, added "## 5.7 SEO Skills Pack" pointer in both
  `~/.config/opencode/AGENTS.md` and workspace-root `AGENTS.md`. Ran
  `tools/validate_skills.py --strict` → 11 skills, 0 errors.
- Synced local repo with origin/main (branch was ~2 days behind, active auto-author commits).
  Prior uncommitted memory edits were already committed upstream (identical files); patch
  backup at `_scratch/pre-pull-memory-backup.patch`.

## JachaiDesk SEO work (commit c1ff8bd7, pushed, CI deploy in progress)
- NEW `site/src/pages/llms.txt.js` — `/llms.txt` with sections, categories, RSS/sitemaps
  (AI-search visibility; follows ai-search skill playbook).
- `robots.txt.js` — explicit Allow: / blocks for GPTBot, ChatGPT-User, ClaudeBot,
  PerplexityBot, Google-Extended, CCBot.
- `BaseLayout.astro` — head gains `<link rel="alternate" type="application/rss+xml">` and
  `<link rel="sitemap">`.
- Verified: node --check on both .js endpoints = OK. Pushed; GitHub Actions deploy+tests
  running (run 37323909306 / 37323909305); live verification pending build.

## Why no local astro build
- Termux on Android 14+: native `.node` binaries can't load from /storage (dlopen namespace
  EACCES), and `satteri` (markdown-satteri) ships NO android-arm64 prebuild — only a WASI
  fallback path that needs `@bruits/satteri-wasm32-wasi` + `@napi-rs/wasm-runtime` and still
  fails under uvwrite UVWASI_EACCES. CI (ubuntu) builds fine; verify via CI + live curl.
- node_modules at `site/node_modules` is a partial Termux install (--ignore-scripts); leave
  as-is. Full verification = CI green + live `/llms.txt` + `/robots.txt` check.

## Next
- [ ] Confirm deploy+tests green; curl live `/llms.txt` and `/robots.txt`.
- [ ] Traffic Drop Doctor: user to export GSC ZIPs (Performance, compare periods) + dates CSV
      to run analyze_gsc.py.
- [ ] GSC verification token still pending from user (SEO.googleSiteVerification in theme.config.ts).
