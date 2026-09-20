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