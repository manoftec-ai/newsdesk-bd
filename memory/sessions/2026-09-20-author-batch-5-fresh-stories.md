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