# 2026-09-20 — Living Story Tracker (গল্প ভুলে নয়) — increment 1: Story Registry

## Context
User identified a real industry gap: BD news covers only trending stories and forgets old ones.
Vision: "our site will never forget past stories — we cover/search in full length and always try
to update on that topic." Honest assessment given (living-story model = real opportunity for a
trust/verified brand; BD outlets don't do it). User corrected constraints: NO VPS — all on
GitHub Actions + Vercel; authoring via opencode default free model (swap later).

## Design decision (D35)
Living Story system, site-only increments now. Watcher later (Google News RSS search, no SearXNG).

## Increment 1 delivered (data layer)
- `site/src/data/tracked-stories.json` — Story Registry, schemaVersion 1. Each story:
  `slug, title, category, trackedAt, status (tracked|closed), lastChecked, nextCheck,
  fingerprint{lang, entities[], keywords[]}, reason`. meta block with updatedAt.
- `site/src/lib/tracked-stories.js` — helpers: trackedStories, trackedStoriesBySlug, isTracked,
  getTrackedStory, trackedRegistryMeta.
- `site/src/content.config.js` — news schema extended: `tracked` (bool, default false),
  `lastChecked` (coerce date, optional).
- Seed: marked dengue bulletin + national-119 (NCT/DP World lease) as tracked with lastChecked
  2026-09-20. NOTE: `updated` field NOT set yet — no real update content; kept honest (do not
  claim dateModified until an actual update appends).

## What was tested
- registry JSON parses (node JSON.parse OK).
- No local Astro build possible on Termux (D28) — Vercel CI build verifies.
- Frontmatter edits are minimal boolean/date additions; schema is additive.

## Next increments
- Inc 2: article page UI — tracked badge ("ট্র্যাক করা সংবাদ"), "শেষ চেক: <date>" stamp,
  link to /tracked (আপডেট ইতিহাস component already exists).
- Inc 3: `/tracked` hub page (join registry × posts) + nav/footer links.
- Later: daily Development Watcher (Google News RSS search + feed keyword match) via GH Actions.

## Increment 2 delivered (article UI) — 2026-09-20
- `site/src/pages/article/[slug].astro`:
  - `.tracked-chip` link (→ `/tracked`) shown next to category pill + verification badge when
    the post has `tracked: true` (aria-label "ট্র্যাক করা গল্পের তালিকা").
  - "শেষ চেক: <date>" stamp in the meta row (eye icon) rendered from `lastChecked` frontmatter.
  - `.tracker-box` "এই গল্পটি ট্র্যাক করা হচ্ছে" info block (role=note) with link to
    `/tracked` — promises updates land on the same page, nothing deleted.
- `site/src/styles.css`: `.tracked-chip` (#4f46e5 bg, hover #4338ca, ~6.2:1 on white) +
  `.tracker-box` (primary-tinted border-left card, matches evidence-box design language).
- NOTE: `/tracked` target doesn't exist yet (increment 3, same session) — brief 404 window
  acceptable; built and pushed together once inc-3 lands.

## Increment 3 delivered (hub page + nav) — 2026-09-20
- NEW `site/src/pages/tracked.astro` — `/tracked` hub:
  - Reads the Story Registry (`lib/tracked-stories.js`) joined with published posts
    (`sortedPosts()`, filtered to existing posts only — no phantom links).
  - Sort: status rank (tracked→checking→closed), then lastChecked desc.
  - Per-story card: category pill, verification badge, status chip (ট্র্যাক হচ্ছে / অনুসরণ বন্ধ,
    reusing `.badge--confirmed` / `.badge--partial`), original date, title (hover primary),
    excerpt, meta row: শেষ চেক / হালনাগাদ (update count) / সর্বশেষ আপডেট.
  - Hero: h1 "ট্র্যাক করা গল্প", promise copy (updates land on same page, nothing deleted),
    totals (মোট / সক্রিয় / রেজিস্ট্রি হালনাগাদ from registry meta.updatedAt). Empty state included.
- Discovery: `theme.config.ts` MORE_NAVIGATION += `/tracked` "ট্র্যাক করা গল্প";
  `Footer.astro` সাইট column += `/tracked`; `sitemap.xml.js` staticPages += `/tracked`
  (news-sitemap untouched — article-only).
- Article-page tracked UI (inc-2) now has a valid `/tracked` target.
- All four increments of the site phase are done. NEXT (future, separate session): the daily
  Development Watcher via GH Actions (Google News RSS search `hl=bn&gl=BD&ceid=BD:bn` +
  feed keyword match → append আপডেট + set `updated` + touch lastChecked), then human review of
  sensitive updates.