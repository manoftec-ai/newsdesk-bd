# Session 2026-09-24 — Deploy YAML fix (D67); national-473 fresh-news rewrite goes live

## Context
User: "still see the old news. when it will update" on jachaidesk.com/article/national-473 after I
rewrote it in the fresh-news voice (commit dd8437d) per the 40-point editorial proposal.

## Root cause found
The rewrite WAS committed & in origin/main, but every recent Vercel deploy was ERROR:

- errorCode `BUILD_UTILS_SPAWN_1`, errorMessage `Command "npm run build" exited with 1`.
- Pulled the real build log via Vercel API events: `bad indentation of a mapping entry` at
  `history-atomic-bombings-1945.md:6:75`.
- Local reproduction with `site/node_modules/js-yaml` revealed 17 broken articles total:
  history batch 7 (`0b5349d`) + national strip batch (`7909032`) wrote `excerpt:`/`seoDescription:`
  as SINGLE-quoted YAML scalars while the Bengali text inside itself contained single quotes
  (e.g. `'…'ব্ল্যাক সামার'…'`) → unescaped quote → YAML parse error → astro build exit 1.
- So jachaidesk.com was frozen at an old READY deploy that predated the rewrite.

## Fix
- Repaired all 17 files to double-quoted scalars, full text preserved.
- Verified: all 459 news frontmatters parse with js-yaml AND pass the exact zod schema from
  `site/src/content.config.js` (459/459 OK).
- Commit `7b5a04c` (rebase -> `b64b3fb`) pushed; Vercel deploy went READY.
- Live check: jachaidesk.com/article/national-473 now shows মূল খবর + কী এখনো জানা যায়নি;
  old phrases (সমকাল ও কালের কণ্ঠের প্রতিবেদনে, দুই ভিন্ন শিরোনামে, কালের কণ্ঠের প্রতিবেদনে,
  কী ঘটেছে, যা এখনো জানা যায়নি, kalerkantho) all absent. এক নজরে still present (keyPoints).

## Root cause in pipeline? No (current code OK)
`pipeline/lib/synth.mjs` `finalizeStory()` already writes excerpts double-quoted. The broken files
came from earlier auto-author batches. Cheapest regression guard: assert frontmatter validity
(js-yaml load + zod parse) before committing content to `site/src/content/news/`.

## Vercel API notes
- Deploy list: `GET /v6/deployments?projectId=prj_FX5YmvjrSM5JnbCm1PNbQuJU6xJO`.
- Build events endpoint `/v3/deployments/{uid}/events?limit=200` returns a TOP-LEVEL ARRAY
  (reads `j.events` = undefined → false "0 events" earlier). Filter `.type` stderr/error, read `.text`.
- `vercel logs` CLI hangs streaming; use the REST events endpoint instead.

## State
- Suite (pipeline): 120/120 (D66). All 459 site articles schema-valid.
- Commit pushed: b64b3fb. Build green. Article live.