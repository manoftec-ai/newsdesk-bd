# Project Memory — newsdesk-bd (নিউজডেস্ক বিডি)

> Last updated: 2026-09-20
> Sessions count: 10

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
| G3 | Automated 30-min fetch scheduler on a free service (GitHub Actions chosen) | high | live | Phase 7 DONE — repo live, cron active |
| G8 | Publish full verified backlog + SEO foundation | high | done | 2026-09-19: all 33 briefs authored + auto-published (34 articles live); sitemap/schema/SEO pipeline upgrades. 2026-09-20: +5 fresh stories (39 live) |
| G9 | Lighthouse/PageSpeed 100/100 (perf, SEO, a11y, best-practices) + fast-indexing | high | done | 2026-09-20: CI gate green; median 100/100/100/100 |

### Completed
| ID | Goal | Date completed |
|----|------|----------------|
| G10 | news-sitemap.xml + IndexNow + default OG image + theme-color | 2026-09-20 |
| G11 | Lighthouse CI gate (GH Actions) — first green run 2026-09-20 | 2026-09-20 |
| G0 | Deploy newsdesk-bd static Astro site to Vercel | 2026-09-19 |
| G4 | Remove all 7 demo articles + demo SVGs (backup kept) | 2026-09-19 |
| G5 | Phase 5 libs: extract.mjs + synth.mjs + run.js commands | 2026-09-19 |
| G6 | Phase 6: pipeline output wired into Astro, auto-publish live | 2026-09-19 |
| G7 | Vercel token stored globally & permanent | 2026-09-19 |
| G8 | GitHub Actions free cron (Phase 7): repo manoftec-ai/newsdesk-bd, pipeline.yml + deploy.yml active, VERCEL_TOKEN secret; first cron run extracted 33 briefs & auto-committed | 2026-09-19 |
| G9 | GitHub classic PAT stored globally & permanent (repo+workflow scope) | 2026-09-19 |

## Decisions
| Date | Decision | Rationale / context |
|------|----------|---------------------|
| 2026-09-19 | D25: **No editorial/draft footer** — articles must never end with "সংবাদটি … সূত্র থেকে সংশ্লেষিত; … খসড়া" disclaimer. Banned in synth writingPrompt + deterministically stripped in `stripEditorialFooters()` at finalize | user: "that line should not also come in future" (2026-09-19) |
| 2026-09-19 | D20: **Auto-publish** — সব পাইপলাইন-নিশ্চিত গল্প সরাসরি `draft:false` হয়; human flip বাতিল (user: "publish it automatically") | user override of old draft-first; synth writes `draft:false` |
| 2026-09-19 | D21: Provider = **opencode** (LLM lokal), lib/synth.mjs swaps prompt → any writer mode | user: "we're going to do it with u, opencode" |
| 2026-09-19 | D22: Scheduler = **GitHub Actions free cron** (no Servarica; vercel fine but no server) | free; GH Actions workflow added |
| 2026-09-19 | D24: GitHub classic PAT (ghp_…Amca4) stored globally permanent — creates repos, full repo+workflow scopes | replaces fine-grained PATs (can't create repos) |
| 2026-09-19 | D23: drafts filtered at build for site pages (getCollection filter `!data.draft`); rss/sitemap already filtered | draft-leak found on article/[slug].astro 2026-09-19 |
| 2026-09-19 | D26: **SEO foundation** — every published story carries `seoTitle` (≤72 chars, word-boundary) + `seoDescription` (≤155 chars) + deterministic `tags` (inferTags keyword map, only defined tags) | backlog publish + SERP quality; regenerated 33 stories |
| 2026-09-19 | D27: sitemap.xml served **all categories + all tags + per-item real lastmod**; homepage emits NewsMediaOrganization + WebSite + WebPage JSON-LD; article NewsArticle + isAccessibleForFree + keywords | index completeness + E-E-A-T + rich results |
| 2026-09-19 | D28: Local Astro build **impossible on Termux** (Astro 7 needs `@bruits/satteri-*-android-arm64` — no npm artifact). All builds/deploys stay on Vercel Linux runner; validate frontmatter via zod-style node script instead | verified 34/34 frontmatters pass |
| 2026-09-19 | D29: `finalize_stories.mjs` tool added; NOTE its `--site` arg = content dir (`site/src/content/news`), default fixed after path bug | batch finalize + dry-run |
| 2026-09-20 | D30: **Lighthouse/PageSpeed gate** = GitHub Actions `lighthouserc.json` asserting minScore 1 on performance/SEO/a11y/best-practices (mobile, 3 runs). Google PSI API quota 429 on our network — LHCI (treosh/lighthouse-ci-action@v12, Docker Chrome) is the repeatable local substitute | user: "page insight speed test make it 100/100"; PSI quota per-day 0 unauthenticated |
| 2026-09-20 | D31: **Ship only 2 webfont faces** (Noto Serif Bengali 700 + Hind Siliguri 400, `font-display: optional`); other weights synthesized by browser. Preloading 5 faces delayed simulated LCP (font-parse render delay ~2.1s); trimmed set + optional display → LCP 1.7s, perf 100 | observed LCP 290ms; simulated LCP was model-bound on font handling, not real network (TTFB 24ms real) |
| 2026-09-20 | D32: Chip/badge colors darkened to WCAG AA (≥4.5:1), tap targets ≥44px (h-11 w-11, gap-6), `role=region/group` for ticker+share, `target-size` green → **a11y 100** (color-contrast was the only weighted failure, weight 7/140 ⇒ 95) | Lighthouse artifact LHRs |
| 2026-09-20 | D33: Verification — GSC, Bing Webmaster, IndexNow live. news-sitemap.xml (Google News schema), robots lists both sitemaps, key file `site/public/<indexnow-key>.txt` (59b9d831dc064ecffbbcf0618ce0a97c), pipeline.yml pokes IndexNow after each commit | user: "add xml file for faster index" |
| 2026-09-20 | D34: **Authoring = HYBRID** (would-rather-query answer on 2026-09-20): GH Actions `author.yml` menulis cerita via **free LLM API** (default Gemini 2.5 Flash, provider-agnostic `lib/llm.mjs` + `tools/author_stories.mjs`); opencode tetap utk editing/featured. `images.yml` meng-brand semua thumbnail (mix: foto Openverse bebas-lisensi overlay WebP 1200×675 atau kartu brand; sharp + fonts-noto-bengali di runner; `sharp` ^0.33.5 di pipeline). Ikuti: fetch→verify→extract→finalize→images→deploy semua jalan di cron tanpa Termux | user: "rely on github cause i cant open my termux always… is it possible through github? including authoring and whole publishing" + Q "Hybrid" |
| 2026-09-20 | D35: **Bundled Bengali fonts, NO apt** — removed `apt-get install fonts-noto-bengali` from `author.yml` + `images.yml`. New GH runner image (ubuntu-24.04 20260907.300) stops locating that package (`E: Unable to locate package → exit 100`), which killed authoring AND images all day 2026-09-20 → **0 posts**. Static TTFs (Noto Sans Bengali Regular/Bold + Noto Serif Bengali Bold, ~600KB, from notofonts.github.io) committed at `pipeline/fonts/` + `fontconfig.local.conf`; workflows export `FONTCONFIG_FILE=$GITHUB_WORKSPACE/pipeline/fonts/fontconfig.local.conf` — sharp/librsvg resolves Bengali from the repo, no system font/apt dependency | runner image drift broke apt package; bundled fonts = deterministic across future image updates; 13 briefs were queued un-authored (international-134, national-122/123/125/126/127/128/130/131/136, sports-129/133) |
| 2026-09-20 | D36: **LIVING STORY / গল্প ভুলে নয় — Story Tracker system** (only-site increments, all GitHub, NO VPS): (1) Story Registry `site/src/data/tracked-stories.json` (slug, title, category, trackedAt, status tracked/closed, lastChecked, nextCheck, fingerprint{lang,entities,keywords}, reason) + news schema `tracked:bool` + `lastChecked:date`; seed: dengue + NCT lease. (2) article UI: tracked badge + "শেষ চেক" + আপডেট ইতিহাস (D14 already there). (3) `/tracked` hub page. Future watcher (later increment) = Google News RSS search (`news.google.com/rss/search?q=…&hl=bn&gl=BD&ceid=BD:bn`) 1×/day + feed keyword match; NO SearXNG (no VPS — user corrected: Vercel + GitHub only) | user: "our site will never forget past stories we will cover/search in full length and will always try to update on that topic" + "i am not using any VPS now… automation through Github… opencode will write article with default free model" |
| 2026-09-20 | D37: **Authoring = OPENCODE ON GITHUB (auto-author.yml), not from Termux** (renumbered to D37; original D36 collided with the parallel living-story session) — user: "opencode you will execute the article but not from here you will do it from github so that our action can be done automatically" + earlier "i am not going to give api. opencode default free model for now… we will use opencode for sure". `auto-author.yml` runs `opencode run --auto --model opencode/big-pickle` headless on GH runner (needs `OPENCODE_API_KEY` from https://opencode.ai/auth — the ONE user-supplied secret), writes body-only `.b.md` per unpublished brief (cap 10/run) → `finalize_stories.mjs` → git commit/push → Vercel deploy + images.yml brands thumbnails. Trigger: hourly cron + on pipeline completion + manual. **author.yml (LLM AP) parked → manual-only** (needs a provider key user won't give) | keep authoring inside the GitHub automation loop; no provider API key, opencode default free model; OPENCODE_API_KEY is opencode's own key, NOT a provider key |
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
- Content: src/content/news/ — **34 real stories live** (33 authored from briefs + dengue), all `draft:false`, tags+seo fields generated
- Site: https://newsdesk-bd.vercel.app (production)
- SEO/perf gate (2026-09-20): `.github/workflows/lighthouse.yml` (runs after deploy via `workflow_run` + manual) with `lighthouserc.json`; artifacts `lighthouse-results.zip`; median **100/100/100/100** green on bd23c4e. Fonts now only `noto-serif-bengali-bengali-700` + `hind-siliguri-bengali-400` preloaded in BaseLayout (all `font-display: optional`); latin faces removed
- Indexing (2026-09-20): `/news-sitemap.xml` (Google News schema, pubDate+keywords), robots.txt lists `/sitemap.xml` + `/news-sitemap.xml`, IndexNow key `59b9d831dc064ecffbbcf0618ce0a97c` at `/59b9….txt`, pipeline.yml "Poke IndexNow" step posts all news URLs after Commit; default `og:image` = `/images/og-default.svg`, `theme-color #b3352b`
- Pipeline state: store.db + briefs at `pipeline/state/` (db.mjs/extract.mjs point there; NOT tmp/), 33 briefs authored
- Git: repo `manoftec-ai/newsdesk-bd` (main branch), GitHub Actions pipeline.yml cron `*/30` + deploy.yml push→Vercel; GITHUB_TOKEN classic PAT stored global
- Author workflow: brief JSON → agent writes body-only md to `pipeline/tmp/stories/<slug>.b.md` → `node pipeline/tools/finalize_stories.mjs --site=site/src/content/news` (or with `--site` default = content dir)

## Work in Progress
- [x] **Author batch 5 (2026-09-20, 5 fresh stories published → 39 live)**: local pipeline fetch (384 new items, briefs 45→84) + opencode-authored `national-125` (PM→UNGA81), `national-128` (ICT-1 arrest warrants vs 8, tags corrected [dhaka]), `national-127` (Notre Dame rain/log closure), `international-134` (Bachelet quits UN SG race), `sports-129` (Asian Games semi loss, bronze vs Pak). House-style frontmatter via `frontMatter()`; NO thumbnails yet — images.yml brands next run. See memory/sessions/2026-09-20-author-batch-5-fresh-stories.md
- [x] **GH Actions font outage + fix (2026-09-20) + OPENCODE-ON-GITHUB (D37)**: new runner image lost `fonts-noto-bengali` in apt → `author.yml` + `images.yml` died at the font step all day → **0 posts published**. Fix: bundled static TTFs in `pipeline/fonts/` + `fontconfig.local.conf`, workflows export `FONTCONFIG_FILE` (no apt). Commit-step fix: `git status --porcelain` → add → commit → pull --rebase → push. **Authoring path = OPENCODE-ON-GITHUB (D37)**: auto-author.yml (cron hourly + on pipeline + manual), opencode `run --auto` headless writes bodies → finalize → push; author.yml parked/manual-only. 13 briefs queued (+39 newer from batch-5's fetch). **Remaining blocker**: `OPENCODE_API_KEY` secret (free, from https://opencode.ai/auth) — the only thing keeping opencode-on-GitHub from publishing. See memory/sessions/2026-09-20-gh-actions-font-outage.md
- [DONE — 2026-09-20] **Living Story Tracker (D36), site phase complete**: inc-1 Story Registry `site/src/data/tracked-stories.json` (meta.schemaVersion 1 + stories[] with slug/title/category/trackedAt/status/lastChecked/nextCheck/fingerprint/reason) + helper lib `site/src/lib/tracked-stories.js`; news schema +`tracked`(bool)+`lastChecked`(date). inc-2 article UI: `.tracked-chip` (→/tracked) + "শেষ চেক" stamp + `.tracker-box` block on `article/[slug].astro`; styles in styles.css. inc-3 `/tracked` hub page `site/src/pages/tracked.astro` (registry × published posts, status chips, শেষ চেক/হালনাগাদ meta) + MORE_NAVIGATION/footer link + sitemap entry. Seeded dengue + national-119 (updated NOT set — honest, no real update). NEXT separate session: daily Development Watcher (GH Actions + Google News RSS search) to append updates + set updated + lastChecked.
- [x] SEO/perf/auth (2026-09-20): news-sitemap + robots + IndexNow key & pipeline poke; default OG + theme-color; article JSON-LD `@graph` (NewsArticle + BreadcrumbList); tap-target/aria fixes; font-display optional + only serif-700/sans-400 faces; AA chip colors → **Lighthouse 100/100/100/100** (run 35478722149, commit bd23c4e). See memory/sessions/2026-09-20-lighthouse-100.md
- [x] Author batch 4 (2026-09-19): 6 national bodies → `pipeline/tmp/stories/{national-78,79,82,84,85,87}.b.md` (body only, 256–293 words; facts pinned to brief leads; Bengali numerals; verification closing present). See memory/sessions/2026-09-19-author-batch-national-78-87.md
- [x] Remove editorial/draft footer (2026-09-19): deleted the "সংশ্লেষিত … খসড়া" closing line from the live dengue article; banned it in `synth.mjs` writingPrompt and added `stripEditorialFooters()` guard in `finalizeStory` so no future story carries it. 6-case unit test passed; pipeline `npm test` 10/10. See memory/sessions/2026-09-19-remove-synthesis-footer.md
- [x] Author batch 3 (2026-09-19): 6 national bodies → `pipeline/tmp/stories/{national-98,99,100,101,105,106}.b.md` (body only, 137–243 words; facts pinned to brief leads + full member bodies in store.db; no invented detail). See memory/sessions/2026-09-19-newsdesk-batch-3.md
- [x] Author batch 1 (2026-09-19): 6 national bodies written → `pipeline/tmp/stories/{national-91,92,93,94,95,97}.b.md` (body only, 251–268 words each, facts pinned to brief leads). See memory/sessions/2026-09-19-author-6-stories.md
- [x] Author batch 2 (2026-09-19): 6 mixed-category bodies written → `pipeline/tmp/stories/{economy-103,economy-90,entertainment-81,international-96,sports-104,sports-86}.b.md` (body only, 197–252 words). See memory/sessions/2026-09-19-author-batch-2-mixed-categories.md
- [x] First batch of 3 story bodies authored (national-119, politics-102, politics-120) → `pipeline/tmp/stories/*.b.md`, ready to finalize/publish (2026-09-19)
- [x] Deploy live (all routes 200; dengue article live, in RSS+sitemap)
- [x] Phase 5 libs + 1st real story authored & live
- [x] Phase 6 (draft filter fix + auto-publish)
- [x] Phase 7: GitHub repo manoftec-ai/newsdesk-bd created (public), code pushed, workflows active, VERCEL_TOKEN secret set, first cron run success (33 briefs auto-committed)
- [ ] Convert briefs into stories (opencode-authored) on a regular cadence; consider a "daily edition" workflow (24 of 33 national+other briefs now authored across batches 1–4; next: national/politics remainder)
- [ ] Monitor cron health (BD sites may block GH runner IPs; some sources slow)

- [x] **Front-end header (2026-09-20)**: site name now fully visible on mobile
  (`whitespace-nowrap`, `text-base sm:text-lg`, tighter `px-4 gap-3` + icon `gap-2 sm:gap-4`).
  **RSS/"XML view" removed site-wide**: header RSS icon deleted, footer "RSS ফিড" link removed,
  `SOCIAL_LINKS` rss entry dropped, head `<link rel="alternate" rss+xml>` removed. Kept
  `/rss.xml` endpoint direct-URL only (non-destructive; pipeline source RSS ingestion untouched).
  See memory/sessions/2026-09-20-frontend-header-rss-removal.md

## Next Steps / Open Questions
- [ ] Living Story Tracker (D35): increment 2 article UI (tracked badge + শেষ চেক stamp), increment 3 `/tracked` hub page + nav; then watcher (Google News RSS daily) — see Work in Progress
- [ ] Watch 30-min cron runs over the next hours; verify fetch freshness maintained in pipeline/state/store.db
- [ ] Decide story authoring cadence (opencode, in-session; or a scheduled synth/deploy hook later)
- [ ] Add `synth` batch mode to auto-publish from briefs (open to provider swap)

## Archived / Superseded
| Date | Item | Replaced by |
|------|------|-------------|
| 2026-09-19 | draft-first publish (D15 old) | auto-publish D20 |
| 2026-09-19 | lifecycle demo/articles demo:true | real pipeline content |