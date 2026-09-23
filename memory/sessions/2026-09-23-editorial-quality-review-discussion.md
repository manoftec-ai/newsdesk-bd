# Session log — 2026-09-23: Editorial quality review (discussion only, NO implementation)

User shared a full editorial critique of jachaidesk articles (from an external source) and
explicitly asked: "you will not implement anything. just lets discuss first."

## The critique's core claims (accepted)
1. Articles read like AI verification reports, not news ("Source A says … Source B says …"
   repetition dominates — #1 problem).
2. Unnecessary generic background added to pad length (Gates Foundation background example).
3. Speculation without sources ("পর্যবক্ষকরা মনে করছেন…", "আলোচনার জন্ম দেবে…") must be banned.
4. "নিশ্চিত [A]" badge is not self-explanatory.
5. Source presentation could be a real differentiator ("কেন নিশ্চিত?" + quoted evidence layer).
6. Article template should be: এক নজরে / মূল খবর (synthesized) / কী এখনো জানা যায়নি / সূত্র ও প্রমাণ / যাচাইয়ের অবস্থা.
7. Dynamic length per story type; breaking news much shorter.
8. Separate NEWS vs FACT CHECK formats; political news = fact → attribution → evidence only.
9. Editorial hierarchy on homepage (lead/secondary/rest + categories).
10. "What you need to know" box for important stories.
11. Not everything verified deserves publishing (editorial value vs verification score).

## My assessment (what I told the user)
- AGREE + cheap fix: #1, repetition, fixed by REWRITING the author prompt (auto-author.yml +
  pipeline/lib/synth.mjs) to synthesize-first; the template is the product. The AI mirrors
  brief per-source fields — needs merge-so + source-divergence-only instructions.
- AGREE + cheap: speculation/filler ban = deterministic gate at finalize (blocks + retries,
  like D25 stripEditorialFooters but gated). Badge legend tooltip = 30-min site change.
- AGREE + cheap: dynamic length per tier in prompt.
- PUSH BACK: editorial-value publish gate (11) — risks the D53 "no new news" starvation;
  keep volume, instead fix duplicate same-event stories at clustering/rank + handle
  hierarchy at homepage.
- PUSH BACK/caution: source-evidence box re-introduction reverses D52 (single source display);
  recommend yes but frontmatter-driven box at bottom, NEVER in body. User decision required.
- Realism: free keyless model is the writer; rules+auditor raise quality, won't reach
  newspaper-grade prose; auditor = flag-and-retry.
- Round-2: news-vs-factcheck split (factcheck category already exists), "what you need to know".

## Proposed Phase-1 scope (agreed as candidate, NOT implemented)
1. Synthesize-first article template in author prompt (কী ঘটেছে / যা জানা যায়নি / যাচাই).
2. Speculation+filler ban gate at finalize — block, don't publish, retry.
3. Dynamic target length per tier.
4. Badge legend tooltip (site-side).
5. Regeneration: new stories only first; sample-audit existing ~430, backfill flagged only.

## Open questions (awaiting user)
1. Re-introduce "কেন নিশ্চিত / প্রমাণ" evidence box? (reverses D52 — user call)
2. Regenerate old articles or only new ones?
3. Keep 30-min publish volume (recommended) + duplicates via rank/clustering, no hard gate?

Status: discussion recorded, NOTHING implemented. Next step after user answers the 3 questions:
spec Phase 1 details.