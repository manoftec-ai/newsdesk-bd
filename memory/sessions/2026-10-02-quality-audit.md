# 2026-10-02 — Live-site quality audit + P0/P1/P2 remediation (D145)

## Live-site findings (fetched jachaidesk.com 2026-10-02)
- Homepage is fresh now (Oct 2) — stale-feed issue from ChatGPT review is FIXED.
- Category pollution still live: "Gemini", "ChatGPT", "Jim Carrey married", scholarship-exam headline mis-tagged as জাতীয়.
- Fused headline live: national-1182 title glued two unrelated items ("প্রাথমিক বৃত্তি পরীক্ষা ২০২৬ (বাংলা)। সুখু ও দুখুর…").
- Homepage lead ticker duplicated the same 3 hero stories.
- Public "নির্ভরযোগ্যতার স্তর: A · স্কোর 2" visible on article pages; VerificationBadge showed "[A]".
- Tags: only one generic fallback (e.g. #bangladesh) — keyword inference exists but is narrow.
- Tracked-watcher still attached updates with >=1 shared keyword → contamination.
- Content gate: national-1027 + national-989 live with BODY_OFF_HEADLINE.

## Fixes shipped (commit 8257b241, pushed to origin/main)
- extract.mjs: isKnownRawCategory + isFusedHeadline; buildBrief sets needsReview/reviewReason; pick_briefs now skips needsReview briefs.
- tracked_watcher.mjs: isStrictEventMatch — require >=2 distinct fingerprint hits OR entity>=1 AND keyword>=1 to attach an update.
- site/article/[slug].astro: removed public tier/score paragraph; added "প্রকাশিত:" label + conditional "হালনাগাদ:" (only when updated set).
- VerificationBadge: no longer renders the tier letter.
- index.astro: BreakingBar ticker now skips hero-slider items (no more duplicate 3).
- national-1182 title/seo fields un-fused; national-1027/989 quarantined + deleted (precedent: D107 national-422).
- pipeline.yml + auto-author.yml: `node run.js … || true` replaced with `|| echo "::error::…"` so stage failures surface in GH UI (merge-abort fallbacks keep || true).
- article-layout.test updated: evidence panel must NOT reference post.verification.score.
- Tests: full pipeline suite 457/457 green; content_gate green (0 NEW defects).

## Deviations from the ChatGPT-derived todo list
- Dek/standfirst under headline NOT added — user explicitly removed it twice (2026-09-27); recorded decision wins.
- Tracker "full event engine" NOT built — strict keyword+entity gate instead (free/low-budget constraint).
- Article-type CMS, district hierarchy, search rebuild, full homepage redesign DEFERRED — not aligned with zero-budget incremental phase plan.
- Nav is already in the proposed shape (8 main + MORE); no change needed.

## Status / next
- Deploy will run on push; watch Vercel build + a couple of live articles.
- Next candidates: image-credit caption policy, factcheck verdict tab styling, event-based tracker registry v2.
