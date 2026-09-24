# Editorial Proposal 2026-09-24 (governing spec — 40 points)

User supplied this FULL text as the new governing editorial spec for JachaiDesk.
Saved verbatim here so future sessions implement against the original, not a paraphrase.

> JachaiDesk — News Quality & Reader Experience Upgrade Proposal

Purpose: the next priority is NOT longer articles or more AI. Make the final news product
feel like an excellent, careful Bangladeshi newsroom. Reader should NOT feel "this is an
AI-generated summary of several newspapers" — SHOULD feel "clear, concise, trustworthy
Bangla news: what happened, what is confirmed, what is unknown, where it came from."

1. Primary principle: optimize for "clearest human-readable representation of verified
   information". 120 words if enough; 400 if necessary. Never pad length.
2. Every article answers 5 questions: What happened? What do we know? What don't we know?
   Why does it matter (only factual)? Where did the info come from?
3. Do NOT expose the AI's research process. Bad: "Source A reported… Source B also said…
   Both reports said…". Better: "X happened Wednesday, according to reports from A and B."
   Source-comparison lives in verification/evidence layer, not the article.
4. Default structure (omit empty sections): category, headline, published time, badge, hero,
   এক নজরে (2-4 facts), মূল খবর (2-5 short paras), কী জানা গেছে (extra verified details),
   কী এখনো জানা যায়নি (unknowns), যাচাই (verification status + short explanation),
   সূত্র ও প্রমাণ (sources+evidence), সর্বশেষ আপডেট (developing only).
5. Keep এক নজরে, improve it: only 2-4 most useful facts; no headline repetition, no generic
   background, no speculation, no source-analysis, no adjectives.
6. Dynamic length, not fixed: breaking 100-180, normal 180-350, developing 300-600,
   complex/explainer 600-1000+. Length = information value.
7. Eliminate AI filler: এদিকে, অন্যদিকে, এ ধরনের পরিস্থিতিতে, বিষয়টি নিয়ে আলোচনা হতে
   পারে, পর্যবেক্ষকরা মনে করছেন, আরও তথ্য প্রকাশের আশা, এ নিয়ে রাজনৈতিক অঙ্গনে আলোচনা
   সৃষ্টি হতে পারে, সংশ্লিষ্টরা বিষয়টি গুরুত্বের সঙ্গে দেখছেন — only when source-supported.
   Never invent anonymous observers/experts/analysts/"people familiar".
8. Zero unsupported interpretation: FACT vs ATTRIBUTED CLAIM vs ANALYSIS. Analysis only when
   a source provides it, or labeled JachaiDesk analysis/explainer.
9. No generic background just to lengthen (e.g. Gates Foundation explainers unless relevant).
10. Natural Bengali, professional journalism style. Editorial quality pass on every article:
    sentence naturalness, grammar, word choice, repetition, unnatural constructions, excessive
    formal language, unnecessary English, transliteration.
11. Natural source attribution: don't repeat source names every paragraph. Mention individual
    sources separately only when they provide different info.
12. Source differences preserved: never silently combine; e.g. magnitude 5.2 vs 5.5 → say both
    and "final official figure not yet available". Never pick one arbitrarily.
13. Claim-level writing rules: VERIFIED / CORROBORATED / SINGLE_SOURCE / UNCONFIRMED /
    CONFLICTING / OFFICIAL / REFUTED / OUTDATED; each constrains how the claim may be written.
14. Headline evidence-constrained (mandatory): never stronger than strongest supported claim.
    Auditor checks headline + subheadline + summary + social title + body vs evidence graph.
15. Quote integrity: never invent quotes. Exact quote must exist in source evidence; paraphrase
    no quote marks; no evidence → no quote. Store quote/speaker/source/URL/excerpt. Never
    "clean up" a quote changing meaning.
16. "কী এখনো জানা যায়নি" as signature feature — explicit transparency, prevents filling gaps
    with assumptions.
17. "কেন নিশ্চিত?" badge explanation (remember pressed): green নিশ্চিত = 2+ independent
    reliable sources matched; blue যাচাইকৃত = official/primary source confirmed; yellow
    একক/আংশিক = one/limited source; red সন্দেহজনক = insufficient reliable proof. Clickable.
18. Evidence panel on "প্রমাণ দেখুন" click: why confirmed (2 independent sources / 1 official /
    no unresolved contradiction), short relevant evidence per source. NO chain-of-thought —
    show evidence and decisions, not hidden reasoning.
19. Separate normal news vs fact-check templates (claim/ruling/source-of-claim/proof/what is
    true/what is misleading/final explanation). Don't make normal news look like fact-check.
20. "What Changed?" for living stories: clear latest update (time + new info + what previous
    version said vs new).
21. Never silently rewrite important facts: create update/correction; preserve correction history.
22. Editorial value (internal, not a public ranking): public impact, people affected, urgency,
    novelty, consequence, reader usefulness, geographic relevance.
23. Reader value test: if reader already knows the headline and the article adds nothing useful
    → don't publish standalone; update existing/timeline/merge/discard.
24. Breaking news mode: extremely concise (e.g. earthquake felt, initial info, damage not yet
    confirmed, source: BMD, last-check time), then update same story. No 500-word article for a
    30-word event.
25. Developing story mode: মূল খবর / সর্বশেষ আপডেট / ঘটনাপঞ্জি / কী জানা গেছে / কী জানা
    যায়নি / সূত্র ও প্রমাণ; story evolves, no duplicate articles.
26. Political/sensitive strict rules: never infer motives, invent public reaction, speculate
    future political consequences, use anonymous observers without source, convert allegations
    into facts, present claims as established facts, drop important attribution. Use "X said…",
    "according to the court document…", "police said…", "the ministry stated…".
27. AI should be invisible: no "this sounds like ChatGPT" patterns. Natural Bengali + precise
    facts + minimal words + visible evidence.
28. Create /docs/editorial-style-guide.md: tone (neutral/factual/concise/natural/professional),
    sentence style (short/direct/active/unique), forbidden (speculation/filler/invented
    experts/quotes/unsupported context/adjectives/AI padding), required (attribution/evidence/
    uncertainty/corrections/source transparency).
29. Editorial AI Auditor checklist: factuality, source support, claim coverage, natural Bengali,
    repetition, speculation, AI filler, headline accuracy, quote integrity, context relevance,
    attribution, readability. Delete-sentence rules: adds no information, exists only for length,
    repeats earlier, unsupported interpretation, generic background, invented reaction, cannot be
    connected to evidence.
30. Reader value test before publication: something useful? beyond headline? confirmed explained?
    unknowns identified? no unnecessary text? Mostly-no → don't publish standalone.
31. Homepage editorial hierarchy: প্রধান খবর / সর্বশেষ / যাচাইকৃত / চলমান ঘটনা / ফ্যাক্ট চেক /
    ব্যাখ্যা — helps "what should I read first?", not just chronological.
32. Article quality dynamic: simple news (short), breaking (very short), developing (living),
    complex (long-form), fact-check (dedicated template), analysis (clearly labeled). Classify
    format first, then generate.
33. "কেন গুরুত্বপূর্ণ" why-it-matters only when evidence-supported. Never "বিশেষজ্ঞরা মনে
    করছেন এটি ব্যাপক প্রভাব ফেলবে" unless an actual identified expert/source says it.
34. Quality over quantity: system must be allowed to say "do not publish". Best newsroom = most
    useful verified info with least noise, not most articles.
35. Editorial pipeline: source collection → normalization → dedup → event clustering → entity
    resolution → claim extraction → evidence mapping → source independence → claim verification →
    editorial value → article type selection → AI writer → AI factuality auditor → AI editorial-
    quality auditor → risk-based publishing → living story → re-verification → update/correction.
36. Publication gate checklist: headline supported, claims have evidence, no invented info/quotes,
    no unsupported speculation, no unnecessary background, no repetitive paragraphs, natural
    Bengali, unknowns identified, attribution correct, badge justified, length appropriate, reader
    gets useful info. Sensitive news adds: attribution preserved, allegations labeled, conflicts
    disclosed, official source checked, human review if required.
37. Success metrics: factual (unsupported claim rate, false verification rate, claim coverage,
    contradiction miss rate, quote error rate), editorial (repetition rate, AI filler rate, human
    rewrite/rejection/correction rate), reader (completion, return visits, abandonment, evidence
    panel usage, timeline usage). Most important early metric: how often JachaiDesk published as
    verified something later downgraded/corrected.
38. Golden dataset: 200-500 labeled Bengali examples (same/different story, cluster, verification,
    claims, attribution, contradiction, headline, length, naturalness, filler). Run test set on
    every pipeline change.
39. Implementation priority: P0 (style guide, new template, remove filler, remove interpretation,
    dynamic length, claim-level rules, headline verification, quote integrity, কী এখনো জানা
    যায়নি, badge explanation) → P1 (factuality auditor, editorial auditor, evidence panel,
    attribution improvements, breaking format, developing format, corrections presentation,
    political rules) → P2 (কেন নিশ্চিত? UI, What Changed, timeline, reader-value filtering,
    event homepage, evidence-first view) → P3 (entity pages, event search, topic pages, knowledge
    graph, personalization, analytics).
40. Final goal: "the website that makes verified information easiest to understand." Short when
    short, long when needed, clear not clever, factual not speculative, natural not AI-sounding,
    transparent, evidence-backed. Reader finishes and knows: what happened, what is confirmed,
    what is unknown, why it matters, where the evidence came from.