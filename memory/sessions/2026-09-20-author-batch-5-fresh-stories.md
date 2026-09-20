# 2026-09-20 — Author batch: 5 fresh stories + local pipeline fetch

## Context
User: "now push our workflow and fetch some articles try to make 5 articles as we
dont publish any article today" — nothing published 2026-09-20 (font outage day).

## What was done
1. **Local pipeline run** (Termux, node v24 + `npm ci`, sharp-only blocked on
   android-arm64 — D28): `fetch` 384 new items (independent timed out) → normalize
   (7 near-dup) → cluster → verify (A-tier confirmed) → extract. Briefs 45 → 84.
   state/store.db updated.
2. **Authored 5 original stories (opencode = free model path)** via house style
   (frontmatter = pipeline `frontMatter()` output, original synthesis, fact-pool
   constrained to brief member leads, সূত্র list at end, draft:false, no editorial
   footers). Files:
   - `site/src/content/news/national-125.md` — PM Tarek Rahman → UNGA 81 (NY, 21 Sep,
     Bangla speech 24 Sep, FS Asad Alam Siam briefing, 35 companions). tags []
   - `site/src/content/news/national-128.md` — Arrest warrants vs 8 (Ex-VC MakSud Kamal,
     Prof Zafar Iqbal, ex-Justice Shamsuddin Chowdhury Manik) ICT-1, July-45 movement
     Dhaka Univ case. tags [dhaka] — NOTE: pipeline inferTags emitted [health,education,
     dhaka] from 'হাম' substring bug; manually corrected to [dhaka].
   - `site/src/content/news/national-127.md` — Notre Dame College closes all theory
     classes Sun 20 Sep (rain + Motijheel waterlogging; principal's notice). tags
     [education,weather,dhaka]
   - `site/src/content/news/international-134.md` — Michelle Bachelet (74, ex-Chile
     president) withdraws UN SG bid via Instagram video Sat 19 Sep (Al Jazeera
     reported). tags []
   - `site/src/content/news/sports-129.md` — Asian Games women's cricket semi: BD lost
     to India by 114 runs (IND 195/4, BD 81 all out 15.4 ov); bronze match vs Pakistan;
     final IND v SL. tags [cricket]
3. Thumbnails: sharp not loadable on android-arm64 → images.yml GH workflow brands
   missing thumbnails automatically on cron/push (existing mechanism).

## Wait states / notes
- 5 new stories = published on push → Vercel deploy + IndexNow
  (site now 34 → 39 articles).
- author.yml GH workflow still no-op (no LLM_API_KEY secret) — opencode authors.
- More open unpublished briefs exist (e.g. national-122/123/126/130/131/136,
  sports-133, new national-* from fresh clusters) — next batches.
- "অপ্রতিম" storyline (Comilla prof's son murder) has multiple briefs
  (122=police briefing, 126=burial, 131=highway blockade) — natural living-story
  candidates; consider registering one in Story Registry next.

## Testing
- Frontmatter YAML validated for all 5 (pipeline `yaml` parse) — OK.
- Body words 92-164 (site median 243; min was 92) — concise but fact-pool-constrained.
- No local Astro build (D28) — Vercel CI build verifies.
## Post-push addendum (same session)
- Committed ALL batch-5 work + pipeline state + memory as single commit, BUT `git pull --rebase` hit conflicts: a concurrent GH pipeline run (and a parallel opencode session) had pushed to main first (added briefs national-138/142/143, store.db, memory edits, plus D37 `auto-author.yml` commits 209399c/7621161/14e9681).
- Resolved: kept remote/GH-run store.db + 3 new briefs (`checkout --ours`), manually merged both memory sides (D37 + batch-5) into MEMORY.md WIP and MEMORY.json workInProgress; rebase continued → **0bce209** pushed to main.
- KEY LEARNED: parallel session introduced **D37 "opencode-on-GitHub"** — `auto-author.yml` (cron hourly + on pipeline + manual) runs opencode `run --auto` headless on the GH runner, NO key needed (openrc free model opencode/big-pickle via gateway, verified keyless). Fix commits fixed YAML indentation + pinned opencode version + push-retry.
- Deploy: Vercel built 0bce209 READY (`newsdesk-h8w33hqbo-man-of-technology.vercel.app`), production alias serving all 5 new articles → **200** (earlier 404s were Vercel bot-protection without cookie). `images.yml` ran on push (0bce209) → thumbnails branded. Sitemap live (61 locs).
- Git safety order confirmed again: add → commit → pull --rebase → push; will hit conflicts routinely ≥2 agents push concurrently — always `git status --porcelain` first and expect add/add on pipeline state.

## Images: auto-branded & force-deployed (same session)
- images.yml push-run (b65bb44, 15:10) branded ALL 5 batch-5 stories with REAL Openverse free-license photos (Openverse search by story keywords, no API key) → 1200x675 WebP brand overlay, `thumbnail`+`thumbnailAlt` (with photographer+license credit) in frontmatter.
- **Quirk discovered**: Vercel does NOT create deployments for GH-Actions-originated pushes (b65bb44, and all images branding commits, never got a deploy; only Termux/user pushes deploy). So thumbs existed in repo but NOT live.
- `vercel --prod` via CLI failed when run from repo root: root has no package.json (site lives in `site/`) → `npm run build` ENOENT /vercel/path0/package.json. Fix: run CLI from `site/` (`--cwd .../site`). Deployed f5925c9 → READY → production alias now serves images+articles (200/200 for all 5).
- Net: EVERY article auto-gets an image on the next images.yml run (push/cron 17,47/manual). But deployment only actually ships when a webhook-deployable push happens — keep in mind for future.
