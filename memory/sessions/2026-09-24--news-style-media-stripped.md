# 2026-09-24 — News-style: strip media names + aggregation boilerplate from bodies/excerpts; author prompts forbid outlet names

Commit `7909032` (rebased from `fefbddf`): **443 files changed, 1381 insertions(+), 3300 deletions(-)**. Pushed and live (ancestor of origin/main, deploy subscription unaffected).

## Goal
Bodies and excerpts must read as fresh original news:
- **No media/outlet names in body** (only in the rendered `সূত্র:` block / name-only links).
- **No aggregation boilerplate**: `প্রতিবেদনে বলা হয়েছে`, `বলা হয়েছে,`, `একাধিক সূত্রে যাচাই…`, report-comparison sentences (`…প্রতিবেদনে বলা হয়েছে, অন্যটিতে বলা হয়েছে…`), report-absence sentences (`…প্রতিবেদন প্রকাশ করেনি…`), "সেটিও ওই খবরে" conjunctives.

## Normalizer work (`_scratch/apply_clean3.cjs`)
- Extended `OUTLETS` with alias `জামুনা টেলিভিশন` (text used it instead of `জামুনা টিভি`).
- `verbShort` list stays **longest-first** (do not re-alphabetize).
- Tail-strips: `দুই সংবাদমাধ্যম…` aggregations; various `…প্রতিবদনে বলা হয়েছে` chains.
- Delete rules: `একাধিক সংবাদমাধ্যম…` meta sentences; `ও প্রকাশ করেছে, যেখানে…` fragments; orphan `তদন্ত কর্মকর্তার বক্তব্`; dangling `প্রতিবেদন অনুযায়ী,` prefix; `সেটিও ওই খবরে` tail.
- Wire-sentence delete: `/^\s*বার্তা\s*সংস্থা[^।]{0,40}?সংবাদ\s*মাধ্যমের?/` (garbled international-308 wire text).
- **`cleanExcerpt` rewritten**: split excerpt on `।`/newline, clean each sentence, drop outlet clusters + meta + too-short sentences; if ALL are filtered, rebuild the excerpt from the cleaned body's first sentences (old `(na || ex)` fallback kept the flawed original).

## Results (real tree `site/src/content/news/*.md`)
- Final real APPLY: **body changed 83 | excerpt changed 329 | outlet residuals in cleaned body 0 | total files WRITTEN 341**.
- Residual meta-sentence scan: **6 files, all legit, GARB 0**:
  - factcheck-madaripur: media-context framing (keep — fact-check claim context).
  - history-chernobyl: technical-report framing (keep — history analysis).
  - national-325: White-House media-access as the news SUBJECT (keep).
  - national-414: revenue-share figures (keep — news content).
  - national-418: missing-info framing (keep — honest "not yet known").
  - sports-443: statement content (keep — reported statement).
  - national-267: how-to/guide where report comparison is intrinsic; reads fine w/o outlet names (keep).

## Prompt updates (future articles)
- `pipeline/lib/synth.mjs` `writingPrompt`: removed "naming the outlets AT MOST ONCE" close; added hard rule — **never name a media outlet in the body**; attribute facts to the ACTOR (`পুলিশ জানিয়েছে…`); forbidden chains (~`…প্রতিবেদনে বলা হয়েছে…`, `একই খবর প্রকাশ করেছে…`, `দুই প্রতিবেদনেই…`, `একাধিক সংবাদমাধ্যম…`); closing line now `সংশ্লিষ্ট সূত্রে বিষয়টি নিশ্চিত করা হয়েছে।`; outlet names render automatically in `সূত্র:`.
- `.github/workflows/auto-author.yml` step-3 prompt: identical replacement (also restored prompt YAML sanity).

## Tests / verification
- `cd pipeline && npm test` → **35/35 pass**.
- Dry-runs in sandboxes G→S before the real APPLY; `node --check` after every edit.

## Git
- Commit rebased by the parallel editor's `pull --rebase` to `7909032`; verified `git branch -r --contains 7909032` → on origin/main; HEAD (179c2e6) == origin/main.
- Note: working tree has the parallel editor's in-progress files (`pipeline/lib/audit.mjs`, `extract.mjs`, `synth.mjs` modified + `.bak*`) — do NOT stage them.