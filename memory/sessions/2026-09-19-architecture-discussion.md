# Session — 2026-09-19 newsdesk-bd architecture discussion

## What happened
- User proposed an automated Bengali news site: combine duplicate/part-by-part news from
  ~12 BD papers into one detailed Bengali article per topic.
- Discussed stack & approach; user chose (via questions):
  original synthesis + attribution · Astro static on Vercel (testing) · HF local model
  (provider-swap w/ Gemini free) · Node.js pipeline (Termux) · draft-first · 30-min cadence ·
  ~12 sources · 9 categories · no domain yet.
- SECOND discussion (key): user made **authenticity** the main priority — checking social
  media posts/comments to verify news. Clarified the trust ladder: official/agency channels >
  ≥2 reputable papers agreeing > eyewitness/journalist > public comments (red flags, never proof).
  Honest limits: X/FB APIs paid → v1 = official channels + self-hosted SearXNG meta-search.
- User chose: only verified stories publish · tiered A/B/C verification · official+search
  social v1 · evidence + confidence badge (যাচাইকৃত/নিশ্চিত/একক-সূত্র/সন্দেহজনক).

## Decisions recorded (architecture v2)
D1-D8 (v1, unchanged) + D9 only-verified-publish · D10 tiers · D11 official+SearXNG ·
D12 public badge+evidence. VERIFY stage inserted as pipeline stage 4 (trust register →
gather → score → badge → tier policy). Correction loop added.

## Files created/changed
- AGENTS.md (site rules)
- memory/MEMORY.md + MEMORY.json (decisions D1-D12, phases, open questions)
- ARCHITECTURE.md v2 (VERIFY engine §4A, renumbered pipeline, updated phases 1-7,
  updated open questions + next step)

## Status
- Architecture v2 PROPOSED — awaiting user approval.
- BUILD ON HOLD (user: "do not build anything yet").

## Next step
Get approval → Phase 1 (read-only RSS probe per source + seed trust.json seed).