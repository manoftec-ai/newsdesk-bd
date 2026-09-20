# 2026-09-20 — Site enrichment: 7-feature batch (fact-check/trust/utility/distribution/SEO-analytics)

Session goal (user): "how our site differs from other news sites + what to enrich" → approved 7
features; built step-by-step, each committing + pushing.

## Features shipped (all live on main)

| F | Feature | Key changes | Commit |
|---|---------|-------------|--------|
| F2 | **প্রতিকার/সংশোধন** policy + সংশোধিত stamp | schema `corrected`+`correctionNote`; `/corrections` page (live correction log); "সংশোধিত" chip + correction box on article; footer/nav/sitemap; icons (check/flag/alert/send) | 3799281 |
| F1 | **গুজব যাচাই (Fact-check) hub** | schema `factCheck`{claim,verdict,verifiedDate,note}; `VERDICTS` map + `getVerdict()` in news-data.js; verdict chips + claim box on article; `/factcheck` hub page; `factcheck` category + `gujob`/`factcheck` tags; `inferTags` keywords | bacd1c1 |
| F4 | **District pages** | `districts` registry (17) in theme.config.ts (dhaka out of baseTags); `/districts` hub; nav/footer/sitemap; district keyword inference in pipeline; fixed a `/facck` sitemap typo | fff261e |
| F6 | **এক নজরে + FAQ schema** | schema `keyPoints[]`/`faq[]`; "এক নজরে" box + FAQ section + FAQPage JSON-LD on article; `frontMatter()` emits `keyPoints:[]`/`faq:[]`; writer prompt demands **এক নজরে** bullets; `extractKeyPoints()` parses `**এক নজরে**` and `এক নজরে:` forms; 3 new synth tests | 68005c7 |
| F7 | **Vercel Web Analytics** | `<script defer src="/_vercel/insights/script.js">` in BaseLayout | b50a16b |
| F3 | **Working contact/newsletter forms** | `site/api/contact.js` serverless relay (Telegram → else Resend → else graceful `not_configured` JSON); `contact.astro` rewritten (fetch → status states, no-JS fallback); deploy guard includes `site/api/**` | bc1e4fb |
| F5 | **Telegram auto-post** | `pipeline/tools/telegram_post.mjs` (secret-gated skip, posts 1 newest un-posted story, `pipeline/state/telegram-sent.json` state, HTML-escaped, hashtags) + `.github/workflows/telegram.yml` (cron */20 + workflow_run [auto-author,images,pipeline,watcher,history-author] + dispatch; export `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`; tolerant merge commit of state) + `test/telegram.test.mjs` | 3bd7e42 |
| — | **Fact-check seed article** | real, sourced case authored (see below) — `factcheck-madaripur-hindu-child-rape-claim.md` | c6e1e36 |

## Fact-check seed (no fabrication)
Closest to our "authentic-first" brand: wrote OUR OWN Bengali synthesis of a current, verified
misinformation case sourced to **Rumor Scanner Bangladesh** (Poynter/IFCN fact-check ally):
- Claim: "মাদারীপুরে ইসলামপন্থীরা ৪ বছরের হিন্দু শিশুটিকে অপহরণ-ধর্ষণ করেছে" (video circulating, from IN accounts)
- Rumor Scanner's investigation (2026-09-20): accuser video is a JUNE event where the accused
  **Chandon Sarkar (চন্দন সরকার) is a Sanatan (Hindu)**; mainstream media (incl. NTV 22 Jun) name the
  accused; **no Muslim involvement** anywhere → verdict **misleading**.
- Fields: keyPoints(4), faq(2) → FAQPage, factCheck.verdict=misleading/verifiedDate 2026-09-20,
  verification badge=confirmed tier A score 0.9 w/ factcheck-evidence URL, sources=[Rumor Scanner].
  Frontmatter validated (yaml parse, seoTitle 69, seoDesc 142, body 273 words).

## Verification
- No local Astro build possible; validated: `node --check` tools, `cd pipeline && npm test` → **24/24** (19 old + 3 synth-inferTags + 2 telegram_new).
- telegram tool behavior: no secrets → skip exit 0; fake creds → Telegram 404 "send failed" exit 0 (workflow stays green until real creds added).
- Fixed along the way: `isMain` check was comparing a path against `resolve(file://URL)` (never main) → `fileURLToPath(import.meta.url)`; CONTENT_DIR depth 3→2; `readFrontmatter` now returns null on missing file.

## Editorial tone of the fact-check (method note)
Byline = "desk" (not a fake reporter name). All claims pinned to cited source. Structure: দাবি →
যাচাইয়ে যা পাওয়া গেল → রায় → সূত্র. End includes a harm-prevention line (ভুল তথ্য
সম্প্রদায়গত উত্তেজনা বাড়াতে পারে → যাচাই না করে শেয়ার করবেন না).

## Known gaps / user follow-ups
- **Telegram**: user must create a BotFather bot + channel and add `TELEGRAM_BOT_TOKEN`+`TELEGRAM_CHAT_ID`
  to GitHub secrets (F5 posts + F3 contact relay both then go live). Until then both silently no-op.
- **Vercel Analytics**: script deployed but no CLI enable exists — user must toggle Settings →
  Analytics in the Vercel dashboard; verify `/_vercel/insights/script.js` returns 200 after next deploy.
- Corrections inbox: site exposes the policy + log but no reader form yet (listener POV: fine to add later).
- Districts registry: 17 districts; full 64-list could come later via pipeline inference too.

## Files touched (this session)
site/src/content.config.js, site/src/config/theme.config.ts, site/src/lib/news-data.js,
site/src/styles.css, site/src/components/{Icon,Footer}.astro, site/src/layouts/BaseLayout.astro,
site/src/pages/{article/[slug],corrections,factcheck,districts,contact,sitemap.xml}.astro,
site/api/contact.js, pipeline/lib/synth.mjs, pipeline/tools/telegram_post.mjs,
pipeline/test/{synth,telegram}.test.mjs, .github/workflows/{deploy,telegram}.yml,
site/src/content/news/factcheck-madaripur-hindu-child-rape-claim.md (new).