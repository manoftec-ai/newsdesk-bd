# Session — 2026-09-24 — Editorial gates 1–40 mechanical fulfillment (D73) + evidence panel

Closes out the remaining mechanical/cheap points of the 40-point JachaiDesk News
Quality & Reader Experience Upgrade Proposal (stored verbatim in
memory/sessions/2026-09-24-editorial-proposal-40.md; point-by-point status tracked
in TODO.md).

## What was done

### Pipeline (code-first)
- `pipeline/lib/editorial.mjs`
  - 4-tier publication mode: `news-brief` / `breaking` / `developing` / `standard`.
    `publicationMode(brief)` picks `breaking` first when fresh
    (`BREAKING_WINDOW_MS` = 4 h) and `BREAKING_MARKERS` hit
    (ভূমিকম্প, উদ্ধার, অগ্নিকাণ্ড, বিস্ফোরণ, সংঘর্ষ, গুলি…); `developing` for
    unfolding stories (~12 h); sensitive/political stories → `isSensitiveStory`.
  - `isSensitiveStory(brief)` via `SENSITIVE_MARKERS`
    (প্রধানমন্ত্রী, মন্ত্রী, আদালত, রায়, নির্বাচন, ধর্ম, হত্যা, ধর্ষণ, হামলা…).
  - `lengthForMode(mode, srcCount, brief)` — sufficiency/source-count aware
    bands. Complex 600–1000 ONLY when rich (sufficiency && srcCount > 3),
    else 180–500 (never pads thin developing/complex clusters). Breaking 100–180;
    developing 300–600 only when not thin, else 150–300; news-brief 50–150.
  - `whyItMattersSupported(brief)` — true only when the fact pool states a real
    consequence (CONSEQUENCE_WORDS: ক্ষতি, ভোগান্তি, গৃহহীন, মৃত্যু, আহত, বন্ধ,
    ব্যয়, দাম, ভাড়া, সতর্কতা…). `whyItMattersViolation(brief, body)` — flags a
    "কেন গুরুত্বপূর্ণ" section in the body when the pool carries no stated
    consequence.
- `pipeline/lib/synth.mjs` — `writingPrompt(brief, ctx)`:
  - proactive five-question discipline (#2): what happened / কী জানা গেছে /
    কী এখনো জানা যায়নি / কেন গুরুত্বপূর্ণ / কোথায় / কখন (only those answerable).
  - mode-aware presentation: breaking → "কী জানা যায়নি" + fast updates;
    developing → মূল খবর/সর্বশেষ আপডেট/ঘটনাপঞ্জি/কী জানা যায়নি; news-brief → thin.
  - why-it-matters only emitted when `whyItMattersSupported` (no invented
    importance).
  - sensitive/political rules: facts not motives, attribution of claims
    (অভিযোগ করেছে not করেছে), allegations ≠ facts, no invented public reaction,
    no invented political consequences.
  - natural Bangla voice (#10): varied sentence length, avoid formulaic openers/
    transliterated-English-only words, no ChatGPT-flavored endings (উল্লেখ্য…).
  - source-divergence (#12): when outlets disagree, show both sides, don't merge
    into one "truth". Extend-only on updates, never rewrite the original lead.
- `pipeline/lib/audit.mjs` — mechanical audit now wired with:
  - `n15` why-it-matters violation gate (whyItMattersViolation → blocks a কেন
    গুরুত্বপূর্ণ box that lacks a stated consequence) → audit result + evidence.
  - `n13`/`n18` evidence wiring: evidence panel data flows to the audit result
    for the site render.
- `pipeline/test/` — updated/added:
  - `sufficiency.test.mjs`: breaking/developing tiers, isSensitiveStory,
    whyItMattersSupported, lengthForMode bands (sufficiency-aware),
    news-brief/breaking lengths.
  - `audit.test.mjs`: n15 why-it-matters gate + evidence panel.
  - `synth.test.mjs`: modeDesc varies by mode, sensitive story rules.

### Site (draft:false auto-publish still sufficiency + mechanical-audit gated)
- `site/src/pages/article/[slug].astro`
  - Evidence panel `<details class="evidence-panel">` with summary
    "প্রমাণ দেখুন" — "কেন নিশ্চিত বলছি / কেন একক-আংশিক" body showing evidence
    (proof) with url links; no chain-of-thought — just the facts + links.
  - "কী বদলেছে" What-Changed box (top note): latest update time + note +
    link to full ইতিহাস (#update-history anchor preserved).
  - Heading structure per proposal #4 (evidence instead of long chain-of-thought
    paragraphs).
- `site/src/pages/index.astro` (#31) — homepage editorial hierarchy:
  `editorialOrder()` keeps lead + top rows by editorial rank
  (featured → breaking → confirmed/verified → rest), then recency
  (replacing raw newest-first).
- `site/src/lib/news-data.js` — `editorialOrder`/`editorialRank`,
  `featuredPost` uses editorial hierarchy.
- `site/src/components/Icon.astro` — added `info` + `refresh` icons.
- `site/src/styles.css` — `.evidence-panel/.evidence-body/.evidence-list` +
  `.what-changed` rules.

## Verification
- Pipeline suite: 164/164 green
  (`node --test pipeline/test/*.test.mjs`).
- Site verified by static review (grep/read) — full `astro build` not runnable
  in Termux (no native binaries for android-arm64); no duplication of
  evidence-panel / what-changed boxes (confirmed the box count is exactly one
  each, the "কী বদলেছে" string appears as aria-label + visible label in the
  same single box).
- Homepage index.astro + news-data.js both use editorialOrder (#31).

## Notes / blockers
- Local `astro build`/`astro check` impossible in Termux — structure verified by
  grep + reading only.
- Parallel worker shares the same repo + memory; only my 7 code files +
  tests staged (never the parallel `._*.json`/`.dpl.json`/`.rev.json`/`.bak*`
  WIP). Memory D73 written in lockstep to both MEMORY.md + MEMORY.json.
