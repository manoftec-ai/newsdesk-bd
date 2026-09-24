# TODO — Editorial Quality Upgrade (যাচাইডেস্ক article quality)

> Created 2026-09-23. Discussion only so far — no implementation.
> Source: editorial critique reviewed in memory/sessions/2026-09-23-editorial-quality-review-discussion.md

## ✅ Decisions (locked 2026-09-23)
- [x] **Q1 — Evidence box: NO.** Keep exactly today's display — single frontmatter `সূত্র` block, name-only links (D50/D52 as-is). No quotes/evidence box.
- [x] **Q2 — Regeneration: new-first, then all.** Apply new writing style to NEW articles first; user reviews; if satisfactory → backfill all existing (~430).
- [x] **Q3 — Publish volume: as now, no human required.** Keep 30-min auto-publish; duplicates fixed via clustering/rank at Round-2, never a human gate.

## Phase 1 — Editorial layer (prompt/template/gate, no re-architecture)
- [x] 1.1 Rewrite author prompt (auto-author.yml + pipeline/lib/synth.mjs): synthesize-first template — merge sources into ONE narrative (কী ঘটেছে / যা জানা যায়নি / যাচাই), sources named only on divergence or single key-fact attribution; keep "এক নজরে" keyPoints — DONE fcc9290
- [x] 1.2 Speculation + filler ban gate in finalize_stories.mjs: BLOCK publish (not strip) on banned phrases ("পর্যবক্ষকরা মনে করছেন…", "আলোচনার জন্ম দেবে…", "মনে করা হচ্ছে…" etc.) + retry once with a corrected instruction — DONE 4d0bf3a (block+skip; re-authored on later run)
- [x] 1.3 Dynamic target length per tier (breaking=short / normal / complex) passed in the prompt, drop the fixed 250–290w instruction — DONE 3e73dc6
- [x] 1.4 Badge legend: "নিশ্চিত [A]" meaning (2+ independent sources matched) — one-line text under the badge (site-side). Assumption: kept tiny, no evidence/quotes added (source display unchanged per Q1) — DONE 04eab2f, LIVE
- [x] 1.7 Verify: pipeline tests (35/35) + live story national-473 inspected (new template, 0 banned phrases) + badge legend live. Lighthouse = RED (pre-existing, Vercel Insights 404; PARKED 2026-09-24 by user decision)
- [x] 1.8 (safety) Leave parallel-session WIP + local divergent commit b9b2f8f untouched — user reviews first (2026-09-24)

## Phase 1b — after user review of new-style articles (Q2=gated)
- [ ] 1b.1 (if satisfactory) Bulk regenerate ALL existing ~430 articles with the new style + gate; verify deploys green
- [ ] 1b.2 (if not) Adjust template with user feedback, then retry new-only before any bulk run

## Round 2 — article-writing depth (after Phase 1 ships, same focus: how stories are written)
- [ ] 2.1 News vs Fact-check split: distinct templates/formats (factcheck category already exists)
- [ ] 2.2 Political-news strict rules: fact → attribution → evidence only, no assumed public reaction
- [ ] 2.3 "এই খবরের মূল কথা / What you need to know" box on important stories (only when documented)
- [ ] 2.4 Duplicate same-event stories: dedup at clustering/rank layer (keeps quality without stopping the 30-min volume)

## PROPOSALS ONLY — site/UX design (NOT writing, parked until user asks)
- [ ] P1 Homepage editorial hierarchy: clearly distinguish প্রধান খবর / সর্বশেষ / যাচাইকৃত / ব্যাখ্যা / ফ্যাক্ট চেক
- [ ] P2 Badge legend placement as a permanent site-wide legend (vs per-article tooltip only)

## Notes / constraints
- English-only in terminal; Bengali only inside site content/prompt instructions.
- Keep zero-budget + keyless model; auditor = flag-and-retry, not scoring-only.
- Bodies are model-generated → template/prompt IS the product.
- Never commit raw credentials.