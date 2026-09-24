# Session 2026-09-24 — FRESH-NEWS VOICE + 40-point editorial proposal (governing spec)

## What happened
User complaint (mid-session, overriding): "every news is just comparing between two source what
they said. but i just want a simple fresh news. source name will be just after the news."

Then user supplied the new governing spec: **the 40-point "JachaiDesk — News Quality & Reader
Experience Upgrade Proposal"** — saved VERBATIM in `memory/sessions/2026-09-24-editorial-proposal-40.md`
and mapped point-by-point to shipped/work state in `TODO.md`.

## Shipped / committed this session
1. **Commit `69e5a53` — fresh-news voice** (5 files; pushed to origin/main):
   - `pipeline/lib/synth.mjs`: `findEditorialViolations` (the gate the LIVE auto-author path
     uses) now also BLOCKS:
     - outlet names (`BANNED_OUTLET_NAMES`),
     - reporting-on-reporting source-meta (`BANNED_SOURCE_META`): দুই প্রতিবেদনে /
       প্রতিবেদনে বলা হয়েছে / প্রতিবেদনে প্রকাশ পেয়েছে / দুই ভিন্ন শিরোনামে /
       একাধিক সংবাদমাধ্যম / জুড়ে দেওয়া প্রতিবেদন …
     - invented anonymous actors (`BANNED_INVENTED_ACTORS`): পর্যবক্ষকরা মনে করছেন /
       বিশেষজ্ঞরা / সংশ্লিষ্টরা / কয়েকটি সূত্র / এ ধরনের পরিস্থিতিতে / অনেকে মনে করছেন …
     - `BANNED_SPECULATION` trimmed (patterns absorbed into the new lists; removed
       observer-overlap patterns).
   - `writingPrompt` rewritten to "fresh-news voice": ONE fact pool, write the NEWS, never
     "what outlets said" / never walk the outlets / never compare "one report said X another
     said Y". Sources appear ONLY in the automatic frontmatter `সূত্র:` block after the news.
     Removed the "সংশ্লিষ্ট সূত্রে নিশ্চিত…" closing-line nudge. NOTE: `এদিকে/অন্যদিকে`
     deliberately NOT banned (natural transitions; would false-block).
   - Template headings per proposal #4: `## মূল খবর` / `## কী জানা গেছে` (optional) /
     `## কী এখনো জানা যায়নি` (retired `কী ঘটেছে` / `যা এখনো জানা যায়নি`); empty sections
     omitted.
   - `.github/workflows/auto-author.yml`: writer prompt rewritten identically
     (FRESH-NEWS VOICE, source rule HARD). YAML validated OK.
   - `pipeline/lib/audit.mjs`: review-point c8 text updated to new headings.
   - Tests (`editorial-gate.test.mjs`, `audit.test.mjs`): good-body fixtures updated to new
     headings + fresh voice; 5 new tests (outlet-name, source-meta ×2, invented-actor,
     "এ ধরনের পরিস্থিতিতে"). **Suite 91/91 pass.**
   - Verified: old national-473 phrasing ("সমকাল ও কালের কণ্ঠ… দুই ভিন্ন শিরোনামে…")
     now BLOCKS at the gate (checked directly against findEditorialViolations).
2. **Memory / roadmap** (this commit, still to push):
   - `TODO.md` rewritten: 40-point proposal status table; done/partial/pending per point;
     next-phase list N1–N11 (style guide doc first).
   - `memory/MEMORY.md` D62 + header; `memory/MEMORY.json` D62 (sessionsCount 41);
   - session log `memory/sessions/2026-09-24-editorial-proposal-40.md` (proposal verbatim) +
     this log.

## Context / notes
- Parallel-session WIP found in working tree: `cluster.mjs` / `cluster-eval.mjs` /
  `cluster_eval.mjs` hybrid-clustering (P0-9 — strong-token agreement). **NOT committed** —
  left untouched for the parallel session / user review. Committed ONLY my 5 files +
  TODO + memory.
- Push of `69e5a53` succeeded cleanly (rebase tmp-blocked by the unstaged cluster WIP but
  push was already linear: 907dedf..69e5a53).
- Old 40-pt governance note: the 25-pt critique (2026-09-23 session log) is superseded by
  the 40-pt proposal.

## Next steps
- [ ] Commit + push TODO.md + memory updates (D62, proposal-40 log, this log).
- [ ] N1: write `docs/editorial-style-guide.md` (proposal #28).
- [ ] N2: align LLM auditor checklist to proposal #29/#36.
- [ ] Map remaining P0: #13 claim-level writing rules, #12 source disagreement in body,
      #6 length-tier widening, #15 quote integrity floor, #24 breaking mode, #17 clickable badge.
- [ ] Q2 standing: user to review new-style articles before bulk backfill (~440).