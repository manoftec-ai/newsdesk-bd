# Project Memory — newsdesk-bd (নিউজডেস্ক বিডি)

> Last updated: 2026-09-19T<now>+06:00
> Sessions count: 3+

## User
- Name / handle: manoftec-ai (Vercel team: man-of-technology; account email verified)
- Communication preference: বাংলা সংবাদ-ওরিয়েন্টেড; concise; detail on request
- Working style: parallel-safe, asks for exact commands; decides quickly (auto-publish OK)
- Tools/environment: Termux (Android) + Astro + node pipeline + vercel CLI; zero/low budget (free-first)

## Goals
### Active
| ID | Goal | Priority | Status | Notes |
|----|------|----------|--------|-------|
| G1 | Pipeline: fetch→normalize→cluster→verify→extract→synth→publish (তাড়াতাড়ি, draft ছাড়া) | high | live | Phases 5–6 done; Phase 7 scheduler pending |
| G2 | Site live on Vercel with real (non-demo) content, demo removed | high | live | dengue story live as 1st real article |
| G3 | Automated 30-min fetch scheduler on a free service (GitHub Actions chosen) | high | pending | Needs GitHub repo/token |

### Completed
| ID | Goal | Date completed |
|----|------|----------------|
| G0 | Deploy newsdesk-bd static Astro site to Vercel | 2026-09-19 |
| G4 | Remove all 7 demo articles + demo SVGs (backup kept) | 2026-09-19 |
| G5 | Phase 5 libs: extract.mjs + synth.mjs + run.js commands | 2026-09-19 |
| G6 | Phase 6: pipeline output wired into Astro, auto-publish live | 2026-09-19 |
| G7 | Vercel token stored globally & permanent | 2026-09-19 |

## Decisions
| Date | Decision | Rationale / context |
|------|----------|---------------------|
| 2026-09-19 | D20: **Auto-publish** — সব পাইপলাইন-নিশ্চিত গল্প সরাসরি `draft:false` হয়; human flip বাতিল (user: "publish it automatically") | user override of old draft-first; synth writes `draft:false` |
| 2026-09-19 | D21: Provider = **opencode** (LLM lokal), lib/synth.mjs swaps prompt → any writer mode | user: "we're going to do it with u, opencode" |
| 2026-09-19 | D22: Scheduler = **GitHub Actions free cron** (no Servarica; vercel fine but no server) | free; GH Actions workflow added |
| 2026-09-19 | D23: drafts filtered at build for site pages (getCollection filter `!data.draft`); rss/sitemap already filtered | draft-leak found on article/[slug].astro 2026-09-19 |
| 2026-09-19 | D13–D17 (earlier lifecycle decisions) | superseded by pipeline+auto publish |
| 2026-09-19 | D18: Vercel deploy token stored at ~/.config/opencode/.secrets/vercel.env, read via env; kevli never echo | per global protocol |

## Preferences & Constraints
- npm/node install Android-local = বাধাগ্রস্ত → সব build/deploy **Vercel Linux runner**-এ; never local Astro build
- `vercel deploy . --prod --yes --token "$VERCEL_TOKEN"` from `site/`; CLI 59.x ignores auth.json
- Drafts: site pages filter `{data})` pattern — Publish always if not draft; keep `draft:false`
- Zero/low budget — GitHub public repo (free mins) preferred; if github needs token ask user, don't create accounts
- Token file: ~/.config/opencode/.secrets/vercel.env (VERCEL_TOKEN); never echo raw

## Project Context
- Tech stack: Astro (content collections `news`) static on Vercel; pipeline = plain Node (extract/synth in pipeline/lib)
- Structure: pipeline/ (run.js fetch/normalize/cluster/verify/extract) + site/ (Astro) + .github/workflows (pipeline.yml, deploy.yml)
- Content: src/content/news/ — real stories (only dengue story now), demo removed
- Site: https://newsdesk-bd.vercel.app (production)
- Pipeline state: store.db + briefs at `pipeline/state/` (db.mjs/extract.mjs point there; NOT tmp/), 25 briefs generated
- No git repo yet; no GitHub account linked

## Work in Progress
- [x] Deploy live (all routes 200; dengue article live, in RSS+sitemap)
- [x] Phase 5 libs + 1st real story authored & live
- [x] Phase 6 (draft filter fix + auto-publish)
- [ ] Phase 7: GitHub repo create + push + GitHub Actions enable (needs GH token/repo from user) + set VERCEL_TOKEN secret
- [ ] Convert remaining 24 verified briefs into stories (opencode-authored), or wire a free LLM provider hook
- [ ] Update history `label` UI/schema sync (old open item)

## Next Steps / Open Questions
- [ ] GH token needed from user → create repo (public), push pipeline+site+workflows, add VERCEL_TOKEN secret, run pipeline.yml
- [ ] Once automation runs: watch for site sources blocking GH Actions IPs; add retry/robots politeness if needed
- [ ] Add `synth` batch mode to auto-publish from briefs (open to provider swap)

## Archived / Superseded
| Date | Item | Replaced by |
|------|------|-------------|
| 2026-09-19 | draft-first publish (D15 old) | auto-publish D20 |
| 2026-09-19 | lifecycle demo/articles demo:true | real pipeline content |