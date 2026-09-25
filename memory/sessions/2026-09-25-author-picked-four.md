# Exact-pick authoring: four picked stories (2026-09-25)

## Request
- Read `pipeline/state/pick.json` and author exactly its picked slugs via `render_prompt` + `finalize`.

## Work completed
- Read the current pick twice and froze exactly `sports-536`, `national-535`, `national-538`, and `national-537` (`pending: 4`).
- Rendered each canonical prompt with `node tools/render_prompt.mjs <slug> --out=/tmp/opencode/<slug>.prompt.txt`.
- Authored only the four matching body files in `pipeline/tmp/stories/`.
- Kept sparse briefs short and did not add names, dates, locations, scores, reasons, reactions, or outcomes absent from the prompts. SINGLE_SOURCE claims remained attributed.
- Ran `node tools/finalize_stories.mjs --site=../site/src/content/news --max=4`.
- Result: `wrote=4 skipped=0 failed=0 blocked=0`.
- Created the four matching articles with `draft: false`.

## Verification
- Final `pick.json` still listed exactly the same four slugs.
- Target validation passed: each article exists, has two source links, parses as front matter, has no raw URL or in-body source list, and has no editorial-gate violations.
- `node --test test/synth.test.mjs`: 12/12 passed.
- `node --check` passed for `render_prompt.mjs`, `finalize_stories.mjs`, and `synth.mjs`.
- No lint or typecheck scripts are defined. Site build was not run because Astro dependencies are not installed in this checkout.
- Pre-existing `pipeline/state/pick.json` and `pipeline/state/store.db` changes were preserved.
- No commit or push performed; no unpicked slug was authored or finalized.
