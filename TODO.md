# TODO — Editorial Quality Upgrade (যাচাইডেস্ক article quality)

> Created 2026-09-23. Discussion only so far — no implementation.
> Source: editorial critique reviewed in memory/sessions/2026-09-23-editorial-quality-review-discussion.md

## ⏳ Decisions needed first (user answers → unblock Phase 1)
- [ ] **Q1 — Evidence box "কেন নিশ্চিত / প্রমাণ":** re-introduce a frontmatter-driven evidence box at article bottom? (reverses D52 single-source display; recommended YES, single place, never in body)
- [ ] **Q2 — Regeneration:** apply new style to NEW stories only, or also regenerate the existing ~430? (recommended: new only + sample-audit; backfill only flagged)
- [ ] **Q3 — Publish volume:** keep 30-min auto-publish, fix duplicate same-event stories via rank/clustering (recommended) instead of a hard editorial-value gate?

## Phase 1 — Editorial layer (prompt/template/gate, no re-architecture)
- [ ] 1.1 Rewrite author prompt (auto-author.yml + pipeline/lib/synth.mjs): synthesize-first template — merge sources into one narrative (কী ঘটেছে / যা জানা যায়নি / যাচাই), name sources only on divergence or single key-fact attribution
- [ ] 1.2 Speculation + filler ban gate in finalize_stories.mjs: block publish (not just strip) on banned phrases ("পর্যবক্ষকরা মনে করছেন…", "আলোচনার জন্ম দেবে…", "মনে করা হচ্ছে…" etc.) + retry once with a correct instruction
- [ ] 1.3 Dynamic target length per tier (breaking=short / normal / complex) passed in the prompt, drop the fixed 250–290w instruction
- [ ] 1.4 Badge legend: "নিশ্চিত [A]" meaning (2+ independent sources matched) — one-line tooltip/legend under the badge (site-side)
- [ ] 1.5 (if Q1=yes) "কেন নিশ্চিত / প্রমাণ" box: frontmatter evidence arrays + small Astro component at article bottom
- [ ] 1.6 Sample-audit existing ~430 articles for the biggest offenders (repetition/speculation); backfill ONLY flagged ones (if Q2=yes)
- [ ] 1.7 Verify: pipeline tests + 1 live story inspected before/after; lighthouse still 100s

## Round 2 — editorial depth (after Phase 1 ships)
- [ ] 2.1 Homepage editorial hierarchy: clearly distinguish প্রধান খবর / সর্বশেষ / যাচাইকৃত / ব্যাখ্যা / ফ্যাক্ট চেক
- [ ] 2.2 News vs Fact-check split: distinct templates/formats (factcheck category already exists)
- [ ] 2.3 Political-news strict rules: факт → attribution → evidence only, no assumed public reaction
- [ ] 2.4 "এই খবরের মূল কথা / What you need to know" box on important stories (only when documented)
- [ ] 2.5 Duplicate same-event stories: dedup at clustering/rank layer (not a publish gate)

## Notes / constraints
- English-only in terminal; Bengali only inside site content/prompt instructions.
- Keep zero-budget + keyless model; auditor = flag-and-retry, not scoring-only.
- Bodies are model-generated → template/prompt IS the product.
- Never commit raw credentials.