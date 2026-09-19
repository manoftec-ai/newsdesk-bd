# Session log — 2026-09-19 — Phase 5/6 done, auto-publish live, Phase 7 GH Actions queue

## Context
newsdesk-bd (নিউজডেস্ক বিডি). Previous session: demos removed + redeploy failed on Astro JSX
bug, then fixed + deployed live. This session continued from there.

## What was done
1. **Phase 6 deploy + draft-leak fix**: deployed site to Vercel; found the real draft article
   accessible publicly (article/[slug].astro getStaticPaths didn't filter drafts). Fixed by adding
   `({ data }) => !data.draft` filter. RSS/sitemap already filtered. Redeployed -> verified:
   homepage had no ডেঙ্গু link, sitemap no dengue, article page unreachable.
2. **Auto-publish decision (user)**: "for now no need to draft, publish it automatically".
   Confirmed ALL verified stories auto-publish (`draft:false`). Updated dengue story to
   `draft:false`, changed synth.mjs frontMatter default to `draft:false`, updated AGENTS.md rule.
3. **Redeployed + verified live**: article 200, homepage shows ডেঙ্গুতে ২ মৃত্যু + national-dengue,
   RSS 2 hits, sitemap 1 hit. Story is publicly live.
4. **Phase 7 (GH Actions free scheduler)**:
   - Moved pipeline state from `pipeline/tmp/` to `pipeline/state/` (store.db + briefs) so it
     survives on ephemeral GH runners; updated db.mjs + extract.mjs; migrated + re-exported
     25 briefs.
   - Created `.github/workflows/pipeline.yml` (cron `*/30 * * * *`: fetch›normalize›cluster›verify›extract›commit state) and `deploy.yml` (push on site/›vercel deploy --prod with VERCEL_TOKEN secret).
   - `.gitignore`: added site/dist, .astro, pagefind, .DS_Store; pipeline/tmp stays ignored.
   - **BLOCKER**: no GitHub repo, no gh CLI, no GH_TOKEN -> cannot create repo/push/enable actions.
5. **Memory updated**: project MEMORY.md, MEMORY.json (decisions D20 auto-publish, D21 opencode
   provider, D22 GH Actions, state move, draft-filter), session log.

## Decisions this session
| Decision | Detail |
|---|---|
| Downgrade draft-first -> auto-publish | user: "publish it automatically"; all verified stories go live draft:false |
| Phase 7 scheduler | GitHub Actions free cron \*/30 (no Servarica) |
| Pipeline state location | pipeline/state/ (committable), tmp/ stays gitignored |

## Testing
- Deploy 1 (JSX-fix commit, earlier session) live. Deploys this session both succeeded.
- Live checks: article 200 + title correct; homepage contains link; rss/sitemap contain slug.
- Draft-leak: before fix article was 200 (leak); after fix 0 output in sitemap, homepage clean.

## Current state / next
- Site live: https://newsdesk-bd.vercel.app — one real story (dengue), 0 demo.
- 25 verified briefs in pipeline/state/briefs (24 stories still unwritten).
- Phase 5+6 DONE. Phase 7 needs GitHub token/repo from user; then push code + set VERCEL_TOKEN
  secret + test first GH Actions run end-to-end.

## Known problems / warnings
- Demo files were restored once earlier at 19:33 (unknown origin) -> re-removed; watch for
  external sync re-adding them.
- GH Actions free minutes on private repo limited (2000/mo) — 30-min cron = 1440 runs/mo; public
  repo preferred (unlimited) or shared runner.