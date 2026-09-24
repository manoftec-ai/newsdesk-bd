# Session — remove "কীভাবে উন্মোচিত হলো" timeline (newsdesk-bd)

> Date: 2026-09-24

## What happened
- User request: "in our website, we dont need the section কীভাবে উন্মোচিত হলো".
- `site/src/components/StoryTimeline.astro`: removed the D72 event-timeline block entirely —
  the `graph.events` `<ol>` (kind dots, বাংলা kind/status labels, source chips, conflict fields),
  the `কীভাবে উন্মোচিত হলো` heading + `{claim_count}টি দাবি · {events.length}টি ঘটনা` counter,
  and the now-dead helpers `kindLabel` / `kindDotClass` + the `KIND_LABELS` import.
- Kept: **সংস্করণ ইতিহাস** (D74 append-only ledger) and **সম্পর্কিত খবর** (related stories).
  Render gate changed `showTimeline || showVersions` → `showVersions || showRelated` (`showAny`).
- No CSS orphans (timeline used no bespoke classes), no prop/wiring changes
  (`article/[slug].astro:442` still passes `slug`/`formatTime`/`formatDate`).

## Verification
- Braces balanced; `rg` confirms no remaining refs to removed names across site/src/pipeline/docs.
- `astro build` cannot run locally in Termux (satteri android-arm64 binding, pre-recorded);
  Vercel build/deploy is the authority — deploy auto-triggered by push.
- Pipeline suite unaffected (site-only change).

## Commits
- `a531fcc` feat(site) remove "কীভাবে উন্মোচিত হলো" event timeline — pushed, `HEAD == origin/main` (SYNCED).
- Memory: MEMORY.md (D77 row + header), MEMORY.json (D77 entry + workInProgress), this session log.

## Notes
- D72's engine (`lib/event-graph.mjs`, `tools/event_graph.mjs`) is left INTACT — re-enable-able if ever wanted.
- Next queue (P1 depth): entity pages, then Why-This-Badge (parked till user activation). Next free decision id: D78.
---
# Session 2 — hide "সংস্করণ ইতিহাস" (background only)

> 2026-09-24 (same working block, after D77)

## What happened
- User: "also dont need the below section. it should be only for background not require to visible to reader. সংস্করণ ইতিহাস".
- `site/src/components/StoryTimeline.astro` slimmed 121→36 lines: removed the whole D74 ledger render
  (`<section class="claim-versions">` + per-claim `<details>` periods) and its helpers
  (`STATUS_LABELS`/`statusBn`/`statusChipClass`/`reasonLabel`); component now renders ONLY
  **সম্পর্কিত খবর** and imports just `storyGraph`; props reduced to `slug` only.
- `site/src/pages/article/[slug].astro:442`: `<StoryTimeline slug={post.slug} />` (dropped formatTime/formatDate).
- **Kept as background**: the versions data still flows through `lib/event-graph.mjs` +
  `tools/event_graph.mjs` into `site/src/data/event-graph.json` + `lib/graph.js` `reasonLabel` —
  audit trail preserved, just not shown to readers. D74 engine fully intact (re-renderable if ever wanted).

## Verification
- Braces balanced; grep confirms no reader-visible refs to সংস্করণ ইতিহাস / claim-versions remain in components.
- No CSS orphans (claim-versions used existing classes).
- `astro build` not runnable in Termux (satteri binding) — Vercel build is the authority.

## Commits
- `0f66b0c` feat(site) hide "সংস্করণ ইতিহাস" from readers — pushed, SYNCED.
- Memory: MEMORY.md (D78 row + header), MEMORY.json (D78 + workInProgress), appended to this log.
